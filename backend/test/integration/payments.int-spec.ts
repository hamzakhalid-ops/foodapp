import { randomUUID } from 'node:crypto';
import { PAYMENT_PROVIDER } from '../../src/modules/payments/provider/payment-provider';
import { type SandboxPaymentProvider } from '../../src/modules/payments/provider/sandbox-payment-provider';
import { type Actor, createHarness, type Harness } from './auth-harness';
import { orderFixtures } from './order-fixtures';

/** Slice 8 — Payments (IMPLEMENTATION_PLAN §13): sandbox provider, webhooks, refunds. */
describe('Slice 7 — payments and refunds', () => {
  let h: Harness;
  let f: ReturnType<typeof orderFixtures>;
  let sandbox: SandboxPaymentProvider;
  beforeAll(async () => {
    h = await createHarness();
    f = orderFixtures(h);
    sandbox = h.app.get<SandboxPaymentProvider>(PAYMENT_PROVIDER);
  });
  beforeEach(async () => {
    await h.reset();
  });
  afterAll(async () => {
    await h.app.close();
  });

  const error = (body: unknown) => (body as { error: { code: string } }).error.code;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- typed view of a response envelope in tests
  const data = <T>(body: unknown) => (body as { data: T }).data;

  interface PaymentView {
    id: string;
    status: string;
    amount: string;
    nextAction: { url: string } | null;
    paidAt: string | null;
    refundedAmount: string;
  }

  let keySeq = 0;
  const key = () => `payment-key-${(keySeq += 1)}-${randomUUID().slice(0, 8)}`;

  const initiate = (customer: Actor, orderId: string, idempotencyKey = key()) =>
    h
      .http()
      .post('/api/v1/payments')
      .set('Authorization', customer.auth)
      .set('Idempotency-Key', idempotencyKey)
      .send({ orderId, paymentMethod: 'ONLINE_PAYMENT' });

  async function startedOnlineOrder() {
    const placed = await f.placeOrder({ paymentMethod: 'ONLINE_PAYMENT' });
    const payment = data<PaymentView>(
      (await initiate(placed.customer, placed.orderId).expect(201)).body,
    );
    const row = await h.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    return { ...placed, payment, providerPaymentId: row.providerPaymentId ?? '' };
  }

  const outcome = (providerPaymentId: string, value: 'SUCCEEDED' | 'FAILED' | 'AUTHORIZED') =>
    h.http().post(`/api/v1/sandbox/payments/${providerPaymentId}/outcome`).send({ outcome: value });

  async function paidOrder() {
    const context = await startedOnlineOrder();
    await outcome(context.providerPaymentId, 'SUCCEEDED').expect(200);
    return context;
  }

  describe('online payment', () => {
    it('starts a provider payment for the order amount and is idempotent', async () => {
      const placed = await f.placeOrder({ paymentMethod: 'ONLINE_PAYMENT' });
      const response = await initiate(placed.customer, placed.orderId, 'same-key-123').expect(201);
      const payment = data<PaymentView>(response.body);
      expect(payment).toMatchObject({ status: 'PENDING', amount: '1335.00' });
      expect(payment.nextAction?.url).toContain('sbx_pay_');
      const retry = await initiate(placed.customer, placed.orderId, 'same-key-123').expect(201);
      expect(data<PaymentView>(retry.body).id).toBe(payment.id);
      const second = await initiate(placed.customer, placed.orderId).expect(201);
      expect(data<PaymentView>(second.body).id).toBe(payment.id);
      expect(await h.prisma.payment.count({ where: { orderId: placed.orderId } })).toBe(1);
    });

    it('rejects cash orders, other customers and client-supplied amounts', async () => {
      const cash = await f.placeOrder();
      const wrongMethod = await initiate(cash.customer, cash.orderId).expect(422);
      expect(error(wrongMethod.body)).toBe('INVALID_REQUEST');
      const online = await f.placeOrder({ paymentMethod: 'ONLINE_PAYMENT' });
      await initiate(await h.actor('CUSTOMER'), online.orderId).expect(404);
      await h
        .http()
        .post('/api/v1/payments')
        .set('Authorization', online.customer.auth)
        .set('Idempotency-Key', key())
        .send({ orderId: online.orderId, paymentMethod: 'ONLINE_PAYMENT', amount: '1.00' })
        .expect(400);
    });

    it('records success only from a verified provider event and releases the order to the restaurant', async () => {
      const { restaurant, orderId, payment, providerPaymentId, customer } =
        await startedOnlineOrder();
      await h
        .http()
        .get(`/api/v1/restaurant/orders/${orderId}`)
        .set('Authorization', restaurant.owner.auth)
        .expect(404);

      await outcome(providerPaymentId, 'SUCCEEDED').expect(200);
      const view = data<PaymentView>(
        (
          await h
            .http()
            .get(`/api/v1/payments/${payment.id}`)
            .set('Authorization', customer.auth)
            .expect(200)
        ).body,
      );
      expect(view).toMatchObject({ status: 'SUCCEEDED', nextAction: null });
      expect(view.paidAt).not.toBeNull();
      expect(
        (await h.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).paymentStatus,
      ).toBe('SUCCEEDED');
      await h
        .http()
        .get(`/api/v1/restaurant/orders/${orderId}`)
        .set('Authorization', restaurant.owner.auth)
        .expect(200);
      const event = await h.prisma.outboxEvent.findFirstOrThrow({
        where: { eventType: 'payment.status_changed' },
      });
      expect(event.payload).toMatchObject({ fromStatus: 'PENDING', toStatus: 'SUCCEEDED' });
      expect(await h.prisma.auditLog.count({ where: { action: 'PAYMENT_STATUS_CHANGED' } })).toBe(
        1,
      );
    });

    it('confirms by asking the provider, never by trusting the client', async () => {
      const { payment, providerPaymentId, customer } = await startedOnlineOrder();
      const pending = await h
        .http()
        .post(`/api/v1/payments/${payment.id}/confirm`)
        .set('Authorization', customer.auth)
        .send({ status: 'SUCCEEDED' })
        .expect(200);
      expect(data<PaymentView>(pending.body).status).toBe('PENDING');
      await sandbox.simulateOutcome(providerPaymentId, 'SUCCEEDED'); // provider-side only, no webhook
      const confirmed = await h
        .http()
        .post(`/api/v1/payments/${payment.id}/confirm`)
        .set('Authorization', customer.auth)
        .expect(200);
      expect(data<PaymentView>(confirmed.body).status).toBe('SUCCEEDED');
    });

    it('allows a new attempt after a failed payment', async () => {
      const { orderId, payment, providerPaymentId, customer } = await startedOnlineOrder();
      await outcome(providerPaymentId, 'FAILED').expect(200);
      const failed = await h.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      expect(failed).toMatchObject({
        status: 'FAILED',
        failureReason: 'The payment was declined.',
      });
      const retry = data<PaymentView>((await initiate(customer, orderId).expect(201)).body);
      expect(retry.id).not.toBe(payment.id);
      expect(retry.status).toBe('PENDING');
      expect(
        (await h.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).paymentStatus,
      ).toBe('PENDING');
    });

    it('refuses to pay twice', async () => {
      const { orderId, customer } = await paidOrder();
      expect(error((await initiate(customer, orderId).expect(409)).body)).toBe(
        'PAYMENT_ALREADY_PROCESSED',
      );
    });
  });

  describe('webhooks', () => {
    const deliver = (body: Buffer, headers: Record<string, string>) =>
      h
        .http()
        .post('/api/v1/webhooks/payments/sandbox')
        .set('Content-Type', 'application/json')
        .set(headers)
        .send(body.toString());

    it('rejects unsigned, tampered, stale and unknown-provider webhooks', async () => {
      const { providerPaymentId } = await startedOnlineOrder();
      const payment = await sandbox.simulateOutcome(providerPaymentId, 'SUCCEEDED');
      const signed = sandbox.signedWebhook({ eventId: randomUUID(), type: 'payment', payment });
      await deliver(signed.body, {}).expect(400);
      const tampered = Buffer.from(signed.body.toString().replace('SUCCEEDED', 'FAILED'));
      await deliver(tampered, signed.headers).expect(400);
      const stale = sandbox.signedWebhook(
        { eventId: randomUUID(), type: 'payment', payment },
        Date.now() - 3_600_000,
      );
      await deliver(stale.body, stale.headers).expect(400);
      await h.http().post('/api/v1/webhooks/payments/stripe').send({}).expect(404);
      expect(
        (await h.prisma.payment.findFirstOrThrow({ where: { providerPaymentId } })).status,
      ).toBe('PENDING');
    });

    it('processes a replayed event exactly once', async () => {
      const { providerPaymentId } = await startedOnlineOrder();
      const payment = await sandbox.simulateOutcome(providerPaymentId, 'SUCCEEDED');
      const signed = sandbox.signedWebhook({ eventId: 'evt-fixed-1', type: 'payment', payment });
      const first = await deliver(signed.body, signed.headers).expect(200);
      const second = await deliver(signed.body, signed.headers).expect(200);
      expect(data(first.body)).toEqual({ received: true, duplicate: false });
      expect(data(second.body)).toEqual({ received: true, duplicate: true });
      expect(
        await h.prisma.outboxEvent.count({ where: { eventType: 'payment.status_changed' } }),
      ).toBe(1);
    });

    it('fails a payment whose provider amount does not match the order', async () => {
      const { providerPaymentId, payment } = await startedOnlineOrder();
      const provider = await sandbox.simulateOutcome(providerPaymentId, 'SUCCEEDED');
      const signed = sandbox.signedWebhook({
        eventId: randomUUID(),
        type: 'payment',
        payment: { ...provider, amount: '1.00' },
      });
      await deliver(signed.body, signed.headers).expect(200);
      expect(await h.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).toMatchObject(
        {
          status: 'FAILED',
          failureReason: 'The payment could not be verified.',
        },
      );
      expect(
        await h.prisma.auditLog.count({ where: { action: 'PAYMENT_VERIFICATION_FAILED' } }),
      ).toBe(1);
    });
  });

  describe('refunds', () => {
    const refund = (admin: Actor, paymentId: string, amount: string, idempotencyKey = key()) =>
      h
        .http()
        .post(`/api/v1/payments/${paymentId}/refund`)
        .set('Authorization', admin.auth)
        .set('Idempotency-Key', idempotencyKey)
        .send({ amount, reasonCode: 'CUSTOMER_COMPLAINT' });

    it('supports multiple partial refunds up to the captured amount', async () => {
      const { payment, orderId } = await paidOrder();
      const admin = await h.actor('ADMIN');
      const first = await refund(admin, payment.id, '335.00').expect(201);
      expect(data(first.body)).toMatchObject({ status: 'SUCCEEDED', amount: '335.00' });
      expect((await h.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe(
        'PARTIALLY_REFUNDED',
      );
      const tooMuch = await refund(admin, payment.id, '1000.01').expect(422);
      expect(error(tooMuch.body)).toBe('PAYMENT_INVALID_AMOUNT');
      await refund(admin, payment.id, '1000.00').expect(201);
      const final = await h.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      expect(final.status).toBe('REFUNDED');
      expect(final.amount.toFixed(2)).toBe('1335.00'); // the payment record is never rewritten
      expect(
        (await h.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).paymentStatus,
      ).toBe('REFUNDED');
      await refund(admin, payment.id, '0.01').expect(409);
    });

    it('never refunds twice for a retried request', async () => {
      const { payment } = await paidOrder();
      const admin = await h.actor('ADMIN');
      await refund(admin, payment.id, '100.00', 'refund-retry-key').expect(201);
      await refund(admin, payment.id, '100.00', 'refund-retry-key').expect(201);
      expect(await h.prisma.refund.count()).toBe(1);
    });

    it('is admin-only and refuses uncaptured or cash payments', async () => {
      const { payment, customer } = await startedOnlineOrder();
      await refund(customer, payment.id, '1.00').expect(403);
      const admin = await h.actor('ADMIN');
      expect(error((await refund(admin, payment.id, '1.00').expect(409)).body)).toBe(
        'REFUND_NOT_ALLOWED',
      );
      const cash = await f.placeOrder();
      const cashPayment = await h.prisma.payment.findFirstOrThrow({
        where: { orderId: cash.orderId },
      });
      await refund(admin, cashPayment.id, '1.00').expect(409);
    });
  });

  describe('refund decision after cancellation (ADR-0014 §9)', () => {
    async function cancelledPaidOrder() {
      const context = await paidOrder();
      const admin = await h.actor('ADMIN');
      await h
        .http()
        .post(`/api/v1/admin/orders/${context.orderId}/cancel`)
        .set('Authorization', admin.auth)
        .send({ reasonCode: 'PLATFORM_ERROR', reason: 'Outage' })
        .expect(200);
      const decide = (body: object) =>
        h
          .http()
          .post(`/api/v1/admin/orders/${context.orderId}/refund-decision`)
          .set('Authorization', admin.auth)
          .set('Idempotency-Key', key())
          .send(body);
      return { ...context, admin, decide };
    }

    it('full refund refunds the remaining amount and records it on the cancellation', async () => {
      const { orderId, decide } = await cancelledPaidOrder();
      const response = await decide({ decision: 'FULL_REFUND', reason: 'Our fault' }).expect(200);
      expect(data(response.body)).toMatchObject({
        decision: 'FULL_REFUND',
        refund: { amount: '1335.00', status: 'SUCCEEDED' },
      });
      const cancellation = await h.prisma.orderCancellation.findUniqueOrThrow({
        where: { orderId },
      });
      expect(cancellation.refundAmount?.toFixed(2)).toBe('1335.00');
      expect(
        await h.prisma.auditLog.count({
          where: { action: 'REFUND_DECISION_RECORDED', entityId: orderId },
        }),
      ).toBe(1);
      await decide({ decision: 'NO_REFUND', reason: 'again' }).expect(409);
    });

    it('records NO_REFUND and PARTIAL_REFUND decisions', async () => {
      const none = await cancelledPaidOrder();
      await none.decide({ decision: 'NO_REFUND', reason: 'Customer no-show' }).expect(200);
      expect(
        (
          await h.prisma.orderCancellation.findUniqueOrThrow({ where: { orderId: none.orderId } })
        ).refundAmount?.toFixed(2),
      ).toBe('0.00');
      expect(await h.prisma.refund.count({ where: { orderId: none.orderId } })).toBe(0);

      const partial = await cancelledPaidOrder();
      await partial
        .decide({ decision: 'PARTIAL_REFUND', amount: '500.00', reason: 'Goodwill' })
        .expect(200);
      expect(
        (await h.prisma.payment.findFirstOrThrow({ where: { orderId: partial.orderId } })).status,
      ).toBe('PARTIALLY_REFUNDED');
    });

    it('refuses decisions for orders that are not cancelled', async () => {
      const { orderId } = await paidOrder();
      const admin = await h.actor('ADMIN');
      await h
        .http()
        .post(`/api/v1/admin/orders/${orderId}/refund-decision`)
        .set('Authorization', admin.auth)
        .set('Idempotency-Key', key())
        .send({ decision: 'FULL_REFUND', reason: 'x' })
        .expect(409);
    });
  });

  it('lists payments and refunds for admins only', async () => {
    const { payment } = await paidOrder();
    const admin = await h.actor('ADMIN');
    const list = await h
      .http()
      .get('/api/v1/admin/payments?status=SUCCEEDED')
      .set('Authorization', admin.auth)
      .expect(200);
    expect(data<{ id: string }[]>(list.body).map((row) => row.id)).toEqual([payment.id]);
    await h.http().get('/api/v1/admin/refunds').set('Authorization', admin.auth).expect(200);
    const customer = await h.actor('CUSTOMER');
    await h.http().get('/api/v1/admin/payments').set('Authorization', customer.auth).expect(403);
    await h
      .http()
      .get(`/api/v1/payments/${payment.id}`)
      .set('Authorization', customer.auth)
      .expect(404);
  });
});
