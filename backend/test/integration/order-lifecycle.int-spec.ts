import { createHarness, type Harness, type TestRestaurant } from './auth-harness';
import { orderFixtures } from './order-fixtures';

/** Slice 9 — Restaurant Orders, order lifecycle and cancellation (IMPLEMENTATION_PLAN §14). */
describe('Slice 6 — order lifecycle and cancellation', () => {
  let h: Harness;
  let f: ReturnType<typeof orderFixtures>;
  beforeAll(async () => {
    h = await createHarness();
    f = orderFixtures(h);
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
  const status = async (orderId: string) =>
    (await h.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status;

  const act = (restaurant: TestRestaurant, orderId: string, action: string, body: object = {}) =>
    h
      .http()
      .post(`/api/v1/restaurant/orders/${orderId}/${action}`)
      .set('Authorization', restaurant.owner.auth)
      .send(body);

  const customerCancel = (
    auth: string,
    orderId: string,
    body: object = { reasonCode: 'CUSTOMER_CHANGED_MIND' },
  ) => h.http().post(`/api/v1/orders/${orderId}/cancel`).set('Authorization', auth).send(body);

  describe('restaurant order handling', () => {
    it('queues released orders and walks PENDING → ACCEPTED → PREPARING → READY', async () => {
      const { restaurant, orderId } = await f.placeOrder();
      const unpaidOnline = await f.placeOrder({ restaurant, paymentMethod: 'ONLINE_PAYMENT' });

      const queue = await h
        .http()
        .get('/api/v1/restaurant/orders/new')
        .set('Authorization', restaurant.owner.auth)
        .expect(200);
      expect(data<{ id: string }[]>(queue.body).map((order) => order.id)).toEqual([orderId]);
      await act(restaurant, unpaidOnline.orderId, 'accept').expect(404);

      const accepted = await act(restaurant, orderId, 'accept', {
        estimatedPreparationMinutes: 35,
      }).expect(200);
      expect(data(accepted.body)).toMatchObject({
        status: 'RESTAURANT_ACCEPTED',
        estimatedPreparationMinutes: 35,
      });
      expect(data<{ acceptedAt: string | null }>(accepted.body).acceptedAt).not.toBeNull();

      await act(restaurant, orderId, 'ready').expect(409);
      await act(restaurant, orderId, 'preparing').expect(200);
      const ready = await act(restaurant, orderId, 'ready').expect(200);
      expect(data(ready.body)).toMatchObject({ status: 'READY_FOR_PICKUP' });

      const history = await h.prisma.orderStatusHistory.findMany({
        where: { orderId },
        orderBy: { createdAt: 'asc' },
      });
      expect(history.map((entry) => entry.toStatus)).toEqual([
        'PENDING',
        'RESTAURANT_ACCEPTED',
        'PREPARING',
        'READY_FOR_PICKUP',
      ]);
      const events = await h.prisma.outboxEvent.findMany({
        where: { eventType: 'order.status_changed', aggregateId: orderId },
        orderBy: { sequence: 'asc' },
      });
      expect(events.map((event) => (event.payload as { toStatus: string }).toStatus)).toEqual([
        'RESTAURANT_ACCEPTED',
        'PREPARING',
        'READY_FOR_PICKUP',
      ]);
    });

    it('lets operators act and keeps other restaurants out', async () => {
      const { restaurant, orderId } = await f.placeOrder();
      const operator = await h.actor('RESTAURANT_OPERATOR');
      await h.prisma.restaurantStaff.create({
        data: { restaurantId: restaurant.restaurantId, userId: operator.userId, role: 'OPERATOR' },
      });
      const other = await h.restaurant();
      await act(other, orderId, 'accept').expect(404);
      await h
        .http()
        .get(`/api/v1/restaurant/orders/${orderId}`)
        .set('Authorization', other.owner.auth)
        .expect(404);
      await h
        .http()
        .post(`/api/v1/restaurant/orders/${orderId}/accept`)
        .set('Authorization', operator.auth)
        .send({})
        .expect(200);
    });

    it('rejects duplicate and concurrent accepts with a conflict', async () => {
      const { restaurant, orderId } = await f.placeOrder();
      const results = await Promise.all([
        act(restaurant, orderId, 'accept'),
        act(restaurant, orderId, 'accept'),
      ]);
      expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
      const again = await act(restaurant, orderId, 'accept').expect(409);
      expect(error(again.body)).toBe('ORDER_INVALID_STATUS');
      expect(
        await h.prisma.orderStatusHistory.count({
          where: { orderId, toStatus: 'RESTAURANT_ACCEPTED' },
        }),
      ).toBe(1);
    });

    it('refuses to accept while the restaurant is suspended', async () => {
      const { restaurant, orderId } = await f.placeOrder();
      await h.prisma.restaurant.update({
        where: { id: restaurant.restaurantId },
        data: { status: 'SUSPENDED' },
      });
      expect(error((await act(restaurant, orderId, 'accept').expect(409)).body)).toBe(
        'RESTAURANT_SUSPENDED',
      );
    });

    it('lists and searches restaurant orders with a cursor', async () => {
      const first = await f.placeOrder();
      const second = await f.placeOrder({ restaurant: first.restaurant });
      const page = await h
        .http()
        .get('/api/v1/restaurant/orders?limit=1')
        .set('Authorization', first.restaurant.owner.auth)
        .expect(200);
      expect(data<{ id: string }[]>(page.body)[0]?.id).toBe(second.orderId);
      const search = await h
        .http()
        .get(`/api/v1/restaurant/orders?search=${first.orderNumber}`)
        .set('Authorization', first.restaurant.owner.auth)
        .expect(200);
      expect(data<{ id: string }[]>(search.body).map((order) => order.id)).toEqual([first.orderId]);
    });
  });

  describe('restaurant rejection', () => {
    it('cancels a new order with a reason, cancellation record, audit and cancelled payment', async () => {
      const { restaurant, orderId } = await f.placeOrder();
      const missing = await act(restaurant, orderId, 'reject', {}).expect(400);
      expect(error(missing.body)).toBe('VALIDATION_ERROR');
      await act(restaurant, orderId, 'reject', { reasonCode: 'OTHER' }).expect(400);
      await act(restaurant, orderId, 'reject', { reasonCode: 'CUSTOMER_CHANGED_MIND' }).expect(400);

      const rejected = await act(restaurant, orderId, 'reject', {
        reasonCode: 'RESTAURANT_ITEM_UNAVAILABLE',
        reason: 'Out of chicken',
      }).expect(200);
      expect(data(rejected.body)).toMatchObject({
        status: 'CANCELLED_BY_RESTAURANT',
        paymentStatus: 'CANCELLED',
      });
      expect(
        await h.prisma.orderCancellation.findUniqueOrThrow({ where: { orderId } }),
      ).toMatchObject({
        cancelledByUserId: restaurant.owner.userId,
        cancelledByRole: 'RESTAURANT_OWNER',
        reasonCode: 'RESTAURANT_ITEM_UNAVAILABLE',
        reasonText: 'Out of chicken',
        refundAmount: null,
      });
      expect((await h.prisma.payment.findFirstOrThrow({ where: { orderId } })).status).toBe(
        'CANCELLED',
      );
      expect(
        await h.prisma.auditLog.count({ where: { action: 'ORDER_CANCELLED', entityId: orderId } }),
      ).toBe(1);
      expect(
        await h.prisma.outboxEvent.count({
          where: { eventType: 'order.cancelled', aggregateId: orderId },
        }),
      ).toBe(1);
    });

    it('does not allow restaurants to cancel after acceptance', async () => {
      const { restaurant, orderId } = await f.placeOrder();
      await act(restaurant, orderId, 'accept').expect(200);
      const response = await act(restaurant, orderId, 'cancel', {
        reasonCode: 'RESTAURANT_CLOSED',
      }).expect(409);
      expect(error(response.body)).toBe('ORDER_CANCELLATION_NOT_ALLOWED');
      expect(await status(orderId)).toBe('RESTAURANT_ACCEPTED');
    });
  });

  describe('customer cancellation', () => {
    it('allows cancelling a pending order once', async () => {
      const { customer, orderId } = await f.placeOrder();
      const response = await customerCancel(customer.auth, orderId).expect(200);
      expect(data(response.body)).toMatchObject({ status: 'CANCELLED_BY_CUSTOMER' });
      const again = await customerCancel(customer.auth, orderId).expect(409);
      expect(error(again.body)).toBe('ORDER_ALREADY_CANCELLED');
      expect(await h.prisma.orderCancellation.count({ where: { orderId } })).toBe(1);
    });

    it('hides other customers’ orders', async () => {
      const { orderId } = await f.placeOrder();
      const stranger = await h.actor('CUSTOMER');
      expect(error((await customerCancel(stranger.auth, orderId).expect(404)).body)).toBe(
        'ORDER_NOT_FOUND',
      );
    });

    it('applies the post-acceptance window setting (unset = not allowed)', async () => {
      const { customer, restaurant, orderId } = await f.placeOrder();
      await act(restaurant, orderId, 'accept').expect(200);
      expect(error((await customerCancel(customer.auth, orderId).expect(409)).body)).toBe(
        'ORDER_CANCELLATION_NOT_ALLOWED',
      );

      await h.prisma.systemSetting.create({
        data: {
          key: 'orders.accepted_cancellation_window_seconds',
          value: 120,
          valueType: 'number',
        },
      });
      await h.prisma.order.update({
        where: { id: orderId },
        data: { acceptedAt: new Date(Date.now() - 121_000) },
      });
      await customerCancel(customer.auth, orderId).expect(409);
      await h.prisma.order.update({
        where: { id: orderId },
        data: { acceptedAt: new Date(Date.now() - 60_000) },
      });
      await customerCancel(customer.auth, orderId).expect(200);
    });

    it('never allows customer cancellation once preparation started', async () => {
      const { customer, restaurant, orderId } = await f.placeOrder();
      await h.prisma.systemSetting.create({
        data: {
          key: 'orders.accepted_cancellation_window_seconds',
          value: 3600,
          valueType: 'number',
        },
      });
      await act(restaurant, orderId, 'accept').expect(200);
      await act(restaurant, orderId, 'preparing').expect(200);
      await customerCancel(customer.auth, orderId).expect(409);
      expect(await status(orderId)).toBe('PREPARING');
    });

    it('resolves a cancel/accept race to exactly one consistent outcome', async () => {
      for (let round = 0; round < 3; round += 1) {
        const { customer, restaurant, orderId } = await f.placeOrder();
        const [cancel, accept] = await Promise.all([
          customerCancel(customer.auth, orderId),
          act(restaurant, orderId, 'accept'),
        ]);
        const final = await status(orderId);
        expect([cancel.status, accept.status].filter((code) => code === 200)).toHaveLength(1);
        expect(final).toBe(cancel.status === 200 ? 'CANCELLED_BY_CUSTOMER' : 'RESTAURANT_ACCEPTED');
        expect(await h.prisma.orderStatusHistory.count({ where: { orderId } })).toBe(2);
      }
    });
  });

  describe('admin cancellation', () => {
    it('cancels any active order with an audited reason', async () => {
      const { restaurant, orderId } = await f.placeOrder();
      await act(restaurant, orderId, 'accept').expect(200);
      await act(restaurant, orderId, 'preparing').expect(200);
      const admin = await h.actor('ADMIN');
      const url = `/api/v1/admin/orders/${orderId}/cancel`;
      await h
        .http()
        .post(url)
        .set('Authorization', admin.auth)
        .send({ reasonCode: 'PLATFORM_ERROR' })
        .expect(400);
      const customer = await h.actor('CUSTOMER');
      await h
        .http()
        .post(url)
        .set('Authorization', customer.auth)
        .send({ reasonCode: 'PLATFORM_ERROR', reason: 'x' })
        .expect(403);

      const response = await h
        .http()
        .post(url)
        .set('Authorization', admin.auth)
        .send({ reasonCode: 'RESTAURANT_UNABLE_TO_FULFILL', reason: 'Kitchen fire' })
        .expect(200);
      expect(data(response.body)).toMatchObject({ status: 'CANCELLED_BY_ADMIN' });
      const audit = await h.prisma.auditLog.findFirstOrThrow({
        where: { action: 'ORDER_CANCELLED', entityId: orderId },
      });
      expect(audit).toMatchObject({ actorUserId: admin.userId });
      expect(audit.oldValues).toMatchObject({ status: 'PREPARING' });
    });

    it('keeps a captured online payment untouched and flags the refund decision', async () => {
      const { orderId } = await f.placeOrder({ paymentMethod: 'ONLINE_PAYMENT' });
      await h.prisma.order.update({ where: { id: orderId }, data: { paymentStatus: 'SUCCEEDED' } });
      await h.prisma.payment.updateMany({ where: { orderId }, data: { status: 'SUCCEEDED' } });
      const admin = await h.actor('ADMIN');
      await h
        .http()
        .post(`/api/v1/admin/orders/${orderId}/cancel`)
        .set('Authorization', admin.auth)
        .send({ reasonCode: 'DUPLICATE_ORDER', reason: 'Placed twice' })
        .expect(200);
      expect((await h.prisma.payment.findFirstOrThrow({ where: { orderId } })).status).toBe(
        'SUCCEEDED',
      );
      const event = await h.prisma.outboxEvent.findFirstOrThrow({
        where: { eventType: 'order.cancelled' },
      });
      expect(event.payload).toMatchObject({ refundDecisionRequired: true });
    });

    it('cannot cancel delivered orders', async () => {
      const { orderId } = await f.placeOrder();
      await h.prisma.order.update({ where: { id: orderId }, data: { status: 'DELIVERED' } });
      const admin = await h.actor('ADMIN');
      const response = await h
        .http()
        .post(`/api/v1/admin/orders/${orderId}/cancel`)
        .set('Authorization', admin.auth)
        .send({ reasonCode: 'ADMIN_RESOLUTION', reason: 'Too late' })
        .expect(409);
      expect(error(response.body)).toBe('ORDER_ALREADY_COMPLETED');
    });
  });

  it('keeps order_status_history append-only', async () => {
    const { orderId } = await f.placeOrder();
    await expect(
      h.prisma.orderStatusHistory.updateMany({ where: { orderId }, data: { reason: 'tampered' } }),
    ).rejects.toThrow(/append-only/);
  });
});
