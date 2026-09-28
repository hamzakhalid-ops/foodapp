import { OutboxProcessor } from '../../src/common/outbox/outbox.processor';
import { SettlementsService } from '../../src/modules/settlements/settlements.service';
import { type Actor, createHarness, type Harness, newCustomer } from './auth-harness';
import { orderFixtures } from './order-fixtures';

/**
 * Golden E2E flow (docs/flows/GOLDEN_E2E_FLOW.md, TESTING_SPEC §51) through the real HTTP API:
 * registration → discovery → cart → checkout → order → restaurant → dispatch → rider → delivered
 * → review → earnings → settlement → payout → invoice → reconciliation → audit.
 * Background work runs by draining the outbox and calling the settlement job, as the worker would.
 */
describe('Golden E2E flow', () => {
  let h: Harness;
  let f: ReturnType<typeof orderFixtures>;
  let outbox: OutboxProcessor;
  beforeAll(async () => {
    h = await createHarness();
    f = orderFixtures(h);
    outbox = h.app.get(OutboxProcessor);
    await h.reset();
  });
  afterAll(async () => {
    await h.app.close();
  });

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- typed view of a response envelope in tests
  const data = <T>(body: unknown) => (body as { data: T }).data;
  const call = (method: 'get' | 'post' | 'patch' | 'put', url: string, actor?: Actor) => {
    const request = h.http()[method](`/api/v1${url}`);
    return actor ? request.set('Authorization', actor.auth) : request;
  };

  it('runs from customer registration to payout, invoice, reconciliation and audit', async () => {
    // --- Platform configuration through the admin API (SUPER_ADMIN, MFA-verified session).
    const superAdmin = await h.actor('SUPER_ADMIN');
    const settings: Record<string, string> = {
      'pricing.delivery_fee': '150.00',
      'pricing.service_fee': '25.00',
      'pricing.tax_percent': '16',
      'finance.commission_percent': '20',
      'finance.rider_delivery_earning': '120.00',
      'finance.settlement_frequency': 'DAILY',
    };
    for (const [key, value] of Object.entries(settings)) {
      await call('patch', `/admin/configuration/${key}`, superAdmin)
        .send({ value, reason: 'Launch configuration' })
        .expect(200);
    }
    await call('put', '/admin/dispatch-settings', superAdmin)
      .send({
        initialRadius: 2,
        radiusIncrement: 2,
        maximumRadius: 6,
        offerTimeoutSeconds: 60,
        maxOfferAttempts: 5,
        locationMaxAgeSeconds: 300,
        reason: 'Launch configuration',
      })
      .expect(200);

    // --- Approved restaurant with a menu created through the owner API; approved online rider.
    const restaurant = await h.restaurant({ name: 'Golden Karahi' });
    const owner = restaurant.owner;
    const category = data<{ id: string }>(
      (await call('post', '/restaurant/menu/categories', owner).send({ name: 'Mains' }).expect(201))
        .body,
    );
    const item = data<{ id: string }>(
      (
        await call('post', '/restaurant/menu/items', owner)
          .send({ categoryId: category.id, name: 'Chicken Karahi', basePrice: '1200.00' })
          .expect(201)
      ).body,
    );
    const rider = await f.rider();

    // 1. Customer registration and phone verification.
    const identity = newCustomer();
    await call('post', '/auth/register').send(identity).expect(201);
    const login = data<{ accessToken: string; user: { id: string } }>(
      (
        await call('post', '/auth/login')
          .send({ identifier: identity.email, password: identity.password })
          .expect(200)
      ).body,
    );
    const customer: Actor = {
      userId: login.user.id,
      token: login.accessToken,
      auth: `Bearer ${login.accessToken}`,
    };
    await call('post', '/auth/verify-phone', customer)
      .send({ code: h.sender.lastPhoneCode() })
      .expect(200);

    // 2–3. Address, discovery and menu.
    const address = data<{ id: string }>(
      (
        await call('post', '/customer/addresses', customer)
          .send({
            recipientName: 'Ali Khan',
            phone: identity.phone,
            addressLine1: 'House 7, Street 2',
            city: 'Lahore',
            latitude: 31.5204,
            longitude: 74.3587,
          })
          .expect(201)
      ).body,
    );
    const discovered = data<{ id: string }[]>(
      (
        await call(
          'get',
          `/restaurants?latitude=31.5204&longitude=74.3587&addressId=${address.id}`,
          customer,
        ).expect(200)
      ).body,
    );
    expect(discovered.map((row) => row.id)).toContain(restaurant.restaurantId);
    const menu = JSON.stringify(
      (await call('get', `/restaurants/${restaurant.restaurantId}/menu`).expect(200)).body,
    );
    expect(menu).toContain(item.id);

    // 4–8. Cart, checkout preview (backend recalculation) and idempotent COD order creation.
    await call('post', '/cart/items', customer)
      .send({ restaurantId: restaurant.restaurantId, menuItemId: item.id, quantity: 2 })
      .expect(201);
    const preview = data<Record<string, string>>(
      (
        await call('post', '/checkout/preview', customer)
          .send({ addressId: address.id, paymentMethod: 'CASH_ON_DELIVERY' })
          .expect(200)
      ).body,
    );
    // subtotal 2400; tax 16% = 384; total = 2400 + 150 + 384 + 25 = 2959.
    expect(preview).toMatchObject({
      subtotal: '2400.00',
      tax: '384.00',
      total: '2959.00',
    });
    const placeOrder = () =>
      call('post', '/orders', customer)
        .set('Idempotency-Key', 'golden-flow-order-1')
        .send({ addressId: address.id, paymentMethod: 'CASH_ON_DELIVERY' });
    const created = await placeOrder().expect(201);
    const order = data<{ id: string; status: string; totalAmount: string }>(created.body);
    expect(order).toMatchObject({ status: 'PENDING', totalAmount: '2959.00' });
    const replay = await placeOrder().expect(201);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(await h.prisma.order.count()).toBe(1);

    // 10–13. Restaurant receives, accepts, prepares, marks ready.
    await outbox.drain();
    expect(
      await h.prisma.notification.count({
        where: { userId: owner.userId, type: 'RESTAURANT_NEW_ORDER' },
      }),
    ).toBe(1);
    for (const action of ['accept', 'preparing', 'ready']) {
      await call('post', `/restaurant/orders/${order.id}/${action}`, owner).send({}).expect(200);
    }

    // 14–18. Dispatch offer to the eligible rider, atomic assignment, pickup, delivery.
    await outbox.drain();
    const offers = data<{ id: string; orderId: string }[]>(
      (await call('get', '/rider/delivery-offers', rider).expect(200)).body,
    );
    const offer = offers.find((row) => row.orderId === order.id);
    expect(offer).toBeDefined();
    const delivery = data<{ id: string }>(
      (
        await call('post', `/rider/delivery-offers/${offer?.id ?? ''}/accept`, rider)
          .send({})
          .expect(200)
      ).body,
    );
    for (const step of ['arriving', 'pickup', 'out-for-delivery']) {
      await call('post', `/rider/deliveries/${delivery.id}/${step}`, rider).send({}).expect(200);
    }
    await call('post', `/rider/deliveries/${delivery.id}/complete`, rider)
      .send({ cashCollected: true })
      .expect(200);
    const delivered = data<{ status: string; paymentStatus: string }>(
      (await call('get', `/orders/${order.id}`, customer).expect(200)).body,
    );
    expect(delivered).toMatchObject({ status: 'DELIVERED', paymentStatus: 'SUCCEEDED' });

    // 19. Review.
    await call('post', `/orders/${order.id}/review`, customer)
      .send({ rating: 5, comment: 'Excellent karahi' })
      .expect(201);

    // 20–21. Earnings.
    await outbox.drain();
    const earnings = data<{ grossAmount: string; commissionAmount: string; netAmount: string }>(
      (await call('get', '/restaurant/earnings', owner).expect(200)).body,
    );
    expect(earnings).toMatchObject({
      grossAmount: '2400.00',
      commissionAmount: '480.00',
      netAmount: '1920.00',
    });
    expect(
      data<{ totalAmount: string }>((await call('get', '/rider/earnings', rider).expect(200)).body)
        .totalAmount,
    ).toBe('120.00');

    // 22–24. Settlement (worker job), approval, payout, invoice.
    await h.app.get(SettlementsService).generate(new Date(Date.now() + 2 * 86_400_000));
    const settlements = data<{ id: string; netAmount: string }[]>(
      (await call('get', '/restaurant/settlements', owner).expect(200)).body,
    );
    expect(settlements).toHaveLength(1);
    const settlementId = settlements[0]?.id ?? '';
    expect(settlements[0]?.netAmount).toBe('1920.00');
    await call('post', `/admin/settlements/${settlementId}/approve`, superAdmin).expect(200);
    const processing = data<{ payouts: { providerReference: string }[] }>(
      (
        await call('post', `/admin/settlements/${settlementId}/process`, superAdmin)
          .set('Idempotency-Key', 'golden-flow-payout-1')
          .expect(200)
      ).body,
    );
    await call('post', `/sandbox/payouts/${processing.payouts[0]?.providerReference ?? ''}/outcome`)
      .send({ outcome: 'COMPLETED' })
      .expect(200);
    await outbox.drain();
    const invoices = data<{ invoiceNumber: string; amount: string }[]>(
      (await call('get', '/restaurant/invoices', owner).expect(200)).body,
    );
    expect(invoices).toEqual([
      expect.objectContaining({
        amount: '1920.00',
        invoiceNumber: expect.stringMatching(/^QB-INV-/) as string,
      }),
    ]);

    // 25. Reconciliation: every layer agrees.
    const report = data<{ issues: unknown[] }>(
      (await call('get', '/admin/finance/reconciliation', superAdmin).expect(200)).body,
    );
    expect(report.issues).toEqual([]);

    // 26. Audit trail and the frozen order lifecycle.
    const history = await h.prisma.orderStatusHistory.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(history.map((row) => row.toStatus)).toEqual([
      'PENDING',
      'RESTAURANT_ACCEPTED',
      'PREPARING',
      'READY_FOR_PICKUP',
      'RIDER_ASSIGNED',
      'PICKED_UP',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
    ]);
    const actions = new Set((await h.prisma.auditLog.findMany()).map((row) => row.action));
    for (const action of [
      'USER_REGISTERED',
      'LOGIN_SUCCESS',
      'PHONE_VERIFIED',
      'CONFIGURATION_CHANGED',
      'DISPATCH_SETTINGS_CHANGED',
      'SETTLEMENT_CREATED',
      'SETTLEMENT_APPROVED',
      'SETTLEMENT_PROCESSING',
      'SETTLEMENT_COMPLETED',
    ]) {
      expect(actions).toContain(action);
    }
  });
});
