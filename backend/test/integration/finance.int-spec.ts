import { OutboxProcessor } from '../../src/common/outbox/outbox.processor';
import { PayoutsService } from '../../src/modules/payouts/payouts.service';
import { ReconciliationService } from '../../src/modules/settlements/reconciliation.service';
import { SettlementsService } from '../../src/modules/settlements/settlements.service';
import { type Actor, createHarness, type Harness } from './auth-harness';
import { orderFixtures } from './order-fixtures';

/** Slices 13–14 — earnings, settlements, payouts, invoices (FINANCIAL_SPEC, ADR-0014 §2). */
describe('Slice 15 — earnings, settlements and payouts', () => {
  let h: Harness;
  let f: ReturnType<typeof orderFixtures>;
  let outbox: OutboxProcessor;
  let settlements: SettlementsService;
  let superAdmin: Actor;
  const drain = () => outbox.drain();
  /** Two days ahead: the period that contains "now" is closed. */
  const later = () => new Date(Date.now() + 2 * 86_400_000);

  beforeAll(async () => {
    h = await createHarness();
    f = orderFixtures(h);
    outbox = h.app.get(OutboxProcessor);
    settlements = h.app.get(SettlementsService);
  });
  beforeEach(async () => {
    await h.reset();
    superAdmin = await h.actor('SUPER_ADMIN');
  });
  afterAll(async () => {
    await h.app.close();
  });

  const error = (body: unknown) => (body as { error: { code: string } }).error.code;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- typed view of a response envelope in tests
  const data = <T>(body: unknown) => (body as { data: T }).data;
  interface SettlementDetail {
    id: string;
    status: string;
    netAmount: string;
    grossAmount: string;
    fees: string;
    adjustments: string;
    items: { amount: string; sourceType: string }[];
    payouts: { status: string; providerReference: string | null }[];
    invoice: { invoiceNumber: string; amount: string } | null;
  }

  async function configureFinance(frequency: 'DAILY' | 'WEEKLY' | null = 'DAILY') {
    const values: Record<string, string> = {
      'finance.commission_percent': '17.5',
      'finance.rider_delivery_earning': '120.00',
      ...(frequency ? { 'finance.settlement_frequency': frequency } : {}),
    };
    for (const [key, value] of Object.entries(values)) {
      await h.prisma.systemSetting.upsert({
        where: { key },
        create: { key, value, valueType: 'string' },
        update: { value },
      });
    }
  }

  const admin = (actor: Actor, method: 'get' | 'post', url: string) =>
    h.http()[method](`/api/v1/admin${url}`).set('Authorization', actor.auth);

  async function settlementOf(recipientId: string): Promise<SettlementDetail> {
    const row = await h.prisma.settlement.findFirstOrThrow({ where: { recipientId } });
    return data<SettlementDetail>(
      (await admin(superAdmin, 'get', `/settlements/${row.id}`).expect(200)).body,
    );
  }

  it('creates one restaurant and one rider earning per delivered order, after configuration', async () => {
    const delivered = await f.deliveredOrder(drain);
    await drain();
    // Finance settings are missing: the handler fails closed and the outbox keeps the event.
    expect(await h.prisma.restaurantEarning.count()).toBe(0);
    const event = await h.prisma.outboxEvent.findFirstOrThrow({
      where: { eventType: 'delivery.delivered' },
    });
    expect(event.status).not.toBe('PROCESSED');

    await configureFinance();
    await h.prisma.outboxEvent.updateMany({ data: { status: 'PENDING', availableAt: new Date() } });
    await drain();
    await h.prisma.outboxEvent.updateMany({ data: { status: 'PENDING', availableAt: new Date() } });
    await drain();

    const earnings = await h.prisma.restaurantEarning.findMany();
    expect(earnings).toHaveLength(1);
    const order = await h.prisma.order.findUniqueOrThrow({ where: { id: delivered.orderId } });
    expect(earnings[0]).toMatchObject({ orderId: order.id, status: 'AVAILABLE' });
    // gross = subtotal − discount = 1000.00; 17.5% commission = 175.00; net = 825.00.
    expect(earnings[0]?.grossAmount.toFixed(2)).toBe(order.subtotal.toFixed(2));
    expect(earnings[0]?.commissionAmount.toFixed(2)).toBe('175.00');
    expect(earnings[0]?.netAmount.toFixed(2)).toBe('825.00');
    const riderEarnings = await h.prisma.riderEarning.findMany();
    expect(riderEarnings).toHaveLength(1);
    expect(riderEarnings[0]?.totalAmount.toFixed(2)).toBe('120.00');
    // The customer delivery fee is not the rider earning (FINANCIAL_SPEC §15).
    expect(order.deliveryFee.toFixed(2)).toBe('150.00');
  });

  it('shows earnings to the restaurant owner and the rider only', async () => {
    await configureFinance();
    const delivered = await f.deliveredOrder(drain);
    await drain();
    const owner = delivered.restaurant.owner;

    const summary = await h
      .http()
      .get('/api/v1/restaurant/earnings')
      .set('Authorization', owner.auth)
      .expect(200);
    expect(data(summary.body)).toMatchObject({
      currency: 'PKR',
      orderCount: 1,
      grossAmount: '1000.00',
      commissionAmount: '175.00',
      netAmount: '825.00',
      netByStatus: { AVAILABLE: '825.00', IN_SETTLEMENT: '0.00', SETTLED: '0.00' },
    });
    const fees = await h
      .http()
      .get('/api/v1/restaurant/earnings/fees')
      .set('Authorization', owner.auth)
      .expect(200);
    expect(data(fees.body)).toMatchObject({
      currentCommissionPercent: '17.5',
      commissionAmount: '175.00',
    });
    const list = await h
      .http()
      .get('/api/v1/restaurant/earnings/transactions')
      .set('Authorization', owner.auth)
      .expect(200);
    const [earning] = data<{ id: string; orderNumber: string }[]>(list.body);
    expect(earning?.orderNumber).toBe(delivered.orderNumber);

    const operator = await h.actor('RESTAURANT_OPERATOR');
    await h.prisma.restaurantStaff.create({
      data: {
        restaurantId: delivered.restaurant.restaurantId,
        userId: operator.userId,
        role: 'OPERATOR',
      },
    });
    await h
      .http()
      .get('/api/v1/restaurant/earnings')
      .set('Authorization', operator.auth)
      .expect(403);
    const other = await h.restaurant();
    await h
      .http()
      .get(`/api/v1/restaurant/earnings/${earning?.id ?? ''}`)
      .set('Authorization', other.owner.auth)
      .expect(404);

    const rider = await h
      .http()
      .get('/api/v1/rider/earnings')
      .set('Authorization', delivered.rider.auth)
      .expect(200);
    expect(data(rider.body)).toMatchObject({ deliveryCount: 1, totalAmount: '120.00' });
    const otherRider = await f.rider({ online: false });
    const riderEarning = await h.prisma.riderEarning.findFirstOrThrow();
    await h
      .http()
      .get(`/api/v1/rider/earnings/${riderEarning.id}`)
      .set('Authorization', otherRider.auth)
      .expect(404);
    await h.http().get('/api/v1/rider/earnings').set('Authorization', owner.auth).expect(403);
  });

  it('generates settlements with explicit components, exactly once', async () => {
    await configureFinance(null);
    const delivered = await f.deliveredOrder(drain);
    await drain();
    expect(await settlements.generate(later())).toBe(0); // frequency not configured
    await configureFinance();

    const restaurantId = delivered.restaurant.restaurantId;
    const plainAdmin = await h.actor('ADMIN');
    const adjustment = { recipientType: 'RESTAURANT', recipientId: restaurantId, amount: '-25.50' };
    await admin(plainAdmin, 'post', '/financial-adjustments')
      .set('Idempotency-Key', 'finance-adj-1')
      .send({ ...adjustment, reason: 'Missing item compensation' })
      .expect(403);
    await admin(superAdmin, 'post', '/financial-adjustments')
      .set('Idempotency-Key', 'finance-adj-1')
      .send({ ...adjustment, amount: '0', reason: 'x' })
      .expect(400);
    await admin(superAdmin, 'post', '/financial-adjustments')
      .set('Idempotency-Key', 'finance-adj-2')
      .send({ ...adjustment, reason: 'Missing item compensation', reference: 'SUP-1' })
      .expect(201);

    const [first, second] = await Promise.all([
      settlements.generate(later()),
      settlements.generate(later()),
    ]);
    expect(first + second).toBe(2); // one restaurant + one rider settlement
    expect(await settlements.generate(later())).toBe(0);

    const restaurant = await settlementOf(restaurantId);
    expect(restaurant).toMatchObject({
      status: 'PENDING',
      grossAmount: '1000.00',
      fees: '175.00',
      adjustments: '-25.50',
      netAmount: '799.50',
    });
    expect(restaurant.items.map((item) => item.amount).sort()).toEqual(['-25.50', '825.00']);
    const rider = await settlementOf(delivered.rider.riderId);
    expect(rider).toMatchObject({ netAmount: '120.00', fees: '0.00' });
    expect(await h.prisma.restaurantEarning.findFirstOrThrow()).toMatchObject({
      status: 'IN_SETTLEMENT',
      settlementId: restaurant.id,
    });
    expect(
      await h.prisma.auditLog.count({ where: { action: 'FINANCIAL_ADJUSTMENT_CREATED' } }),
    ).toBe(1);

    // Settlement items are immutable (FINANCIAL_SPEC §30).
    await expect(
      h.prisma
        .$executeRaw`UPDATE settlement_items SET amount = 1 WHERE settlement_id = ${restaurant.id}::uuid`,
    ).rejects.toThrow(/immutable/);

    // Totals that no longer match their items block approval (FINANCIAL_SPEC §33).
    await h.prisma.settlement.update({
      where: { id: restaurant.id },
      data: { grossAmount: '1001.00', netAmount: '800.50' },
    });
    const blocked = await admin(superAdmin, 'post', `/settlements/${restaurant.id}/approve`).expect(
      409,
    );
    expect(error(blocked.body)).toBe('SETTLEMENT_RECONCILIATION_FAILED');
  });

  it('does not settle a non-positive net and carries the records forward', async () => {
    await configureFinance();
    const rider = await f.rider({ online: false });
    await admin(superAdmin, 'post', '/financial-adjustments')
      .set('Idempotency-Key', 'finance-adj-neg')
      .send({
        recipientType: 'RIDER',
        recipientId: rider.riderId,
        amount: '-10.00',
        reason: 'Cash shortfall',
      })
      .expect(201);
    expect(await settlements.generate(later())).toBe(0);
    expect((await h.prisma.financialAdjustment.findFirstOrThrow()).status).toBe('AVAILABLE');
  });

  it('approves, processes, pays out, settles and invoices; a failed payout can be retried', async () => {
    await configureFinance();
    const delivered = await f.deliveredOrder(drain);
    await drain();
    await settlements.generate(later());
    const restaurantId = delivered.restaurant.restaurantId;
    const { id } = await settlementOf(restaurantId);

    const early = await admin(superAdmin, 'post', `/settlements/${id}/process`)
      .set('Idempotency-Key', 'process-early')
      .expect(409);
    expect(error(early.body)).toBe('SETTLEMENT_INVALID_STATUS');
    const plainAdmin = await h.actor('ADMIN');
    await admin(plainAdmin, 'post', `/settlements/${id}/approve`).expect(403);
    await admin(plainAdmin, 'get', `/settlements/${id}`).expect(200);
    await admin(superAdmin, 'post', `/settlements/${id}/approve`).expect(200);
    await admin(superAdmin, 'post', `/settlements/${id}/approve`).expect(409);

    const processed = await admin(superAdmin, 'post', `/settlements/${id}/process`)
      .set('Idempotency-Key', 'process-1')
      .expect(200);
    const first = data<SettlementDetail>(processed.body);
    expect(first.status).toBe('PROCESSING');
    expect(first.payouts).toHaveLength(1);
    expect(first.payouts[0]?.status).toBe('PROCESSING');
    expect(first.payouts[0]?.providerReference).toMatch(/^sbx_po_/);
    const replay = await admin(superAdmin, 'post', `/settlements/${id}/process`)
      .set('Idempotency-Key', 'process-1')
      .expect(200);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    await admin(superAdmin, 'post', `/settlements/${id}/process`)
      .set('Idempotency-Key', 'process-2')
      .expect(409);
    expect(await h.prisma.payout.count()).toBe(1);

    // Provider rejects the transfer: the settlement fails, history is kept.
    const reference = first.payouts[0]?.providerReference ?? '';
    await h
      .http()
      .post(`/api/v1/sandbox/payouts/${reference}/outcome`)
      .send({ outcome: 'FAILED' })
      .expect(200);
    await drain();
    expect((await settlementOf(restaurantId)).status).toBe('FAILED');
    expect((await h.prisma.restaurantEarning.findFirstOrThrow()).status).toBe('IN_SETTLEMENT');

    const retried = data<SettlementDetail>(
      (
        await admin(superAdmin, 'post', `/settlements/${id}/process`)
          .set('Idempotency-Key', 'process-3')
          .expect(200)
      ).body,
    );
    expect(retried.payouts.map((payout) => payout.status)).toEqual(['FAILED', 'PROCESSING']);
    await h
      .http()
      .post(`/api/v1/sandbox/payouts/${retried.payouts[1]?.providerReference ?? ''}/outcome`)
      .send({ outcome: 'COMPLETED' })
      .expect(200);
    await drain();

    const done = await settlementOf(restaurantId);
    expect(done.status).toBe('COMPLETED');
    expect(done.invoice).toMatchObject({ amount: '825.00' });
    expect(done.invoice?.invoiceNumber).toMatch(/^QB-INV-\d{6}$/);
    expect((await h.prisma.restaurantEarning.findFirstOrThrow()).status).toBe('SETTLED');

    const owner = delivered.restaurant.owner;
    const invoices = await h
      .http()
      .get('/api/v1/restaurant/invoices')
      .set('Authorization', owner.auth)
      .expect(200);
    expect(data<unknown[]>(invoices.body)).toHaveLength(1);
    const payouts = await h
      .http()
      .get('/api/v1/restaurant/payouts?status=COMPLETED')
      .set('Authorization', owner.auth)
      .expect(200);
    expect(data<unknown[]>(payouts.body)).toHaveLength(1);
    await h
      .http()
      .get(`/api/v1/rider/settlements/${id}`)
      .set('Authorization', delivered.rider.auth)
      .expect(404);

    expect(
      (await h.prisma.auditLog.findMany({ where: { entityId: id } })).map((row) => row.action),
    ).toEqual(
      expect.arrayContaining([
        'SETTLEMENT_CREATED',
        'SETTLEMENT_APPROVED',
        'SETTLEMENT_PROCESSING',
        'SETTLEMENT_FAILED',
        'SETTLEMENT_COMPLETED',
      ]),
    );
    const types = (await h.prisma.notification.findMany({ where: { userId: owner.userId } })).map(
      (row) => row.type,
    );
    expect(types).toEqual(
      expect.arrayContaining(['SETTLEMENT_CREATED', 'PAYOUT_FAILED', 'PAYOUT_COMPLETED']),
    );
  });

  it('ignores a provider answer that does not match the payout record', async () => {
    await configureFinance();
    const delivered = await f.deliveredOrder(drain);
    await drain();
    await settlements.generate(later());
    const { id } = await settlementOf(delivered.rider.riderId);
    await admin(superAdmin, 'post', `/settlements/${id}/approve`).expect(200);
    await admin(superAdmin, 'post', `/settlements/${id}/process`)
      .set('Idempotency-Key', 'process-mismatch')
      .expect(200);
    const payout = await h.prisma.payout.findFirstOrThrow();
    await h.prisma.payout.update({ where: { id: payout.id }, data: { amount: '999.00' } });
    await h
      .http()
      .post(`/api/v1/sandbox/payouts/${payout.providerReference ?? ''}/outcome`)
      .send({ outcome: 'COMPLETED' })
      .expect(200);
    await h.app.get(PayoutsService).sync();
    expect((await h.prisma.payout.findUniqueOrThrow({ where: { id: payout.id } })).status).toBe(
      'PROCESSING',
    );
    const report = await admin(superAdmin, 'get', '/finance/reconciliation').expect(200);
    expect(data<{ issues: { check: string }[] }>(report.body).issues).toEqual([
      expect.objectContaining({ check: 'PAYOUT_AMOUNT_MISMATCH' }),
    ]);
  });

  it('reports orders delivered without earnings', async () => {
    const reconciliation = h.app.get(ReconciliationService);
    expect((await reconciliation.run()).issues).toEqual([]);
    const { orderId } = await f.placeOrder();
    await h.prisma.order.update({
      where: { id: orderId },
      data: { status: 'DELIVERED', deliveredAt: new Date(Date.now() - 3_600_000) },
    });
    const { issues } = await reconciliation.run();
    expect(issues).toEqual([
      expect.objectContaining({
        check: 'DELIVERED_ORDER_WITHOUT_RESTAURANT_EARNING',
        entityId: orderId,
      }),
    ]);
    const customer = await h.actor('CUSTOMER');
    await h
      .http()
      .get('/api/v1/admin/finance/reconciliation')
      .set('Authorization', customer.auth)
      .expect(403);
  });
});
