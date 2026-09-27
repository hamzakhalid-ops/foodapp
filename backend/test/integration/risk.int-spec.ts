import { OutboxProcessor } from '../../src/common/outbox/outbox.processor';
import { RiskService } from '../../src/modules/risk/risk.service';
import { type Actor, createHarness, type Harness } from './auth-harness';
import { orderFixtures } from './order-fixtures';

/** Trust & Risk Engine (RISK_RULES, API_SPEC §83–87). */
describe('Slice 10 — risk engine', () => {
  let h: Harness;
  let f: ReturnType<typeof orderFixtures>;
  let outbox: OutboxProcessor;
  let admin: Actor;
  beforeAll(async () => {
    h = await createHarness();
    f = orderFixtures(h);
    outbox = h.app.get(OutboxProcessor);
  });
  beforeEach(async () => {
    await h.reset();
    admin = await h.actor('ADMIN');
  });
  afterAll(async () => {
    await h.app.close();
  });

  const error = (body: unknown) => (body as { error: { code: string } }).error.code;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- typed view of a response envelope in tests
  const data = <T>(body: unknown) => (body as { data: T }).data;
  const adminPost = (url: string, body: object = {}) =>
    h.http().post(`/api/v1/admin/risk${url}`).set('Authorization', admin.auth).send(body);

  const rule = (overrides: object = {}) =>
    adminPost('/rules', {
      name: 'Repeated cancellations',
      subjectType: 'CUSTOMER',
      eventType: 'REPEATED_ORDER_CANCELLATION',
      threshold: 2,
      windowSeconds: 3600,
      action: 'COD_RESTRICTED',
      severity: 'MEDIUM',
      ...overrides,
    }).expect(201);

  async function cancelOrders(customer: Actor, count: number) {
    for (let i = 0; i < count; i += 1) {
      const { orderId } = await f.placeOrder({ customer });
      await h
        .http()
        .post(`/api/v1/orders/${orderId}/cancel`)
        .set('Authorization', customer.auth)
        .send({ reasonCode: 'CUSTOMER_CHANGED_MIND' })
        .expect(200);
    }
    await outbox.drain();
  }

  async function checkout(
    customer: Actor,
    paymentMethod: 'CASH_ON_DELIVERY' | 'ONLINE_PAYMENT',
    status: number,
  ) {
    await f.configurePricing();
    const restaurant = await h.restaurant();
    const itemId = await f.menuItem(restaurant);
    const addressId = await f.address(customer);
    await h.http().delete('/api/v1/cart').set('Authorization', customer.auth).expect(204);
    await h
      .http()
      .post('/api/v1/cart/items')
      .set('Authorization', customer.auth)
      .send({ restaurantId: restaurant.restaurantId, menuItemId: itemId, quantity: 1 })
      .expect(201);
    return h
      .http()
      .post('/api/v1/checkout/preview')
      .set('Authorization', customer.auth)
      .send({ addressId, paymentMethod })
      .expect(status);
  }

  it('restricts COD once the configured threshold is reached, and a dismissal lifts it', async () => {
    await rule();
    const customer = await h.actor('CUSTOMER');
    await cancelOrders(customer, 1);
    expect(await h.prisma.riskRestriction.count()).toBe(0);
    await cancelOrders(customer, 1);

    const restriction = await h.prisma.riskRestriction.findFirstOrThrow();
    expect(restriction).toMatchObject({
      subjectId: customer.userId,
      restrictionType: 'COD_RESTRICTED',
      status: 'ACTIVE',
    });
    expect(restriction.riskFlagId).not.toBeNull();
    const methods = await h
      .http()
      .get('/api/v1/payment-methods')
      .set('Authorization', customer.auth)
      .expect(200);
    expect(data(methods.body)).toEqual([
      { method: 'ONLINE_PAYMENT', available: true },
      { method: 'CASH_ON_DELIVERY', available: false },
    ]);
    expect(error((await checkout(customer, 'CASH_ON_DELIVERY', 403)).body)).toBe('COD_RESTRICTED');
    await checkout(customer, 'ONLINE_PAYMENT', 200);

    await adminPost(`/flags/${restriction.riskFlagId ?? ''}/dismiss`, {
      reason: 'Legitimate cancellations',
    }).expect(200);
    expect(
      (await h.prisma.riskRestriction.findUniqueOrThrow({ where: { id: restriction.id } })).status,
    ).toBe('REMOVED');
    await checkout(customer, 'CASH_ON_DELIVERY', 200);
    expect(await h.prisma.auditLog.count({ where: { action: 'RISK_FLAG_DISMISSED' } })).toBe(1);
  });

  it('ignores events outside the window, disabled rules and NORMAL actions; MONITORED only flags', async () => {
    const customer = await h.actor('CUSTOMER');
    await h.prisma.riskEvent.create({
      data: {
        subjectType: 'CUSTOMER',
        subjectId: customer.userId,
        eventType: 'REPEATED_ORDER_CANCELLATION',
        severity: 'LOW',
        occurredAt: new Date(Date.now() - 7200_000),
      },
    });
    const created = data<{ id: string }>((await rule()).body);
    await cancelOrders(customer, 1); // 1 event inside the 1h window + 1 outside → below threshold 2
    expect(await h.prisma.riskFlag.count()).toBe(0);

    await h
      .http()
      .patch(`/api/v1/admin/risk/rules/${created.id}`)
      .set('Authorization', admin.auth)
      .send({ enabled: false })
      .expect(200);
    await rule({ name: 'Watch', action: 'MONITORED' });
    await rule({ name: 'No-op', action: 'NORMAL' });
    await cancelOrders(customer, 1);
    const flags = await h.prisma.riskFlag.findMany({ include: { rule: true } });
    expect(flags.map((flag) => flag.rule?.name)).toEqual(['Watch']);
    expect(await h.prisma.riskRestriction.count()).toBe(0);
  });

  it('evaluates idempotently', async () => {
    await rule({ threshold: 1 });
    const customer = await h.actor('CUSTOMER');
    await cancelOrders(customer, 1);
    const event = await h.prisma.riskEvent.findFirstOrThrow();
    const risk = h.app.get(RiskService);
    await Promise.all([risk.evaluate(event.id), risk.evaluate(event.id), risk.evaluate(event.id)]);
    expect(await h.prisma.riskFlag.count()).toBe(1);
    expect(await h.prisma.riskRestriction.count()).toBe(1);
  });

  it('enforces admin restrictions until removal or expiry', async () => {
    const customer = await h.actor('CUSTOMER');
    const created = data<{ id: string }>(
      (
        await adminPost('/restrictions', {
          subjectType: 'CUSTOMER',
          subjectId: customer.userId,
          restrictionType: 'ORDER_RESTRICTED',
          reason: 'Chargeback investigation',
        }).expect(201)
      ).body,
    );
    await adminPost('/restrictions', {
      subjectType: 'CUSTOMER',
      subjectId: customer.userId,
      restrictionType: 'ORDER_RESTRICTED',
      reason: 'dup',
    }).expect(409);
    expect(error((await checkout(customer, 'ONLINE_PAYMENT', 403)).body)).toBe('ORDER_RESTRICTED');

    await h
      .http()
      .patch(`/api/v1/admin/risk/restrictions/${created.id}`)
      .set('Authorization', admin.auth)
      .send({ expiresAt: new Date(Date.now() + 60_000).toISOString(), reason: 'Shorten' })
      .expect(200);
    await h.prisma.riskRestriction.update({
      where: { id: created.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await checkout(customer, 'ONLINE_PAYMENT', 200);

    await h.prisma.riskRestriction.update({ where: { id: created.id }, data: { expiresAt: null } });
    await adminPost(`/restrictions/${created.id}/remove`, { reason: 'Cleared' }).expect(200);
    await checkout(customer, 'ONLINE_PAYMENT', 200);
    const actions = (await h.prisma.auditLog.findMany({ where: { entityId: created.id } }))
      .map((row) => row.action)
      .sort();
    expect(actions).toEqual([
      'RISK_RESTRICTION_CREATED',
      'RISK_RESTRICTION_OVERRIDDEN',
      'RISK_RESTRICTION_RESOLVED',
    ]);
  });

  it('keeps restricted riders out of dispatch and restricted restaurants from trading', async () => {
    await f.dispatchSettings();
    const rider = await f.rider();
    await adminPost('/restrictions', {
      subjectType: 'RIDER',
      subjectId: rider.riderId,
      restrictionType: 'ACCOUNT_RESTRICTED',
      reason: 'Fraud review',
    }).expect(201);
    const { orderId } = await f.readyOrder();
    await outbox.drain();
    expect(await h.prisma.dispatchOffer.count({ where: { orderId } })).toBe(0);
    await h
      .http()
      .post('/api/v1/rider/availability/offline')
      .set('Authorization', rider.auth)
      .expect(200);
    await h
      .http()
      .post('/api/v1/rider/availability/online')
      .set('Authorization', rider.auth)
      .expect(409);

    const placed = await f.placeOrder();
    await adminPost('/restrictions', {
      subjectType: 'RESTAURANT',
      subjectId: placed.restaurant.restaurantId,
      restrictionType: 'ORDER_RESTRICTED',
      reason: 'Hygiene complaint',
    }).expect(201);
    const accept = await h
      .http()
      .post(`/api/v1/restaurant/orders/${placed.orderId}/accept`)
      .set('Authorization', placed.restaurant.owner.auth)
      .send({})
      .expect(403);
    expect(error(accept.body)).toBe('ACCOUNT_RESTRICTED');
  });

  it('records admin events, lists risk data and is admin-only', async () => {
    const customer = await h.actor('CUSTOMER');
    await adminPost('/events', {
      subjectType: 'CUSTOMER',
      subjectId: customer.userId,
      eventType: 'COD_NON_RECEIPT',
      severity: 'HIGH',
      metadata: { orderId: 'n/a' },
    }).expect(202);
    const events = await h
      .http()
      .get(`/api/v1/admin/risk/events?subjectId=${customer.userId}`)
      .set('Authorization', admin.auth)
      .expect(200);
    expect(data(events.body)).toMatchObject([{ eventType: 'COD_NON_RECEIPT', severity: 'HIGH' }]);
    await h
      .http()
      .get('/api/v1/admin/risk/flags?status=BOGUS')
      .set('Authorization', admin.auth)
      .expect(400);
    await h
      .http()
      .post('/api/v1/admin/risk/events')
      .set('Authorization', customer.auth)
      .send({})
      .expect(403);
    await h.http().get('/api/v1/admin/risk/rules').set('Authorization', customer.auth).expect(403);
  });
});
