import { createHarness, type Harness } from './auth-harness';
import { orderFixtures } from './order-fixtures';

/** Restaurant analytics (API_SPEC §61). */
describe('Restaurant analytics', () => {
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

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- typed view of a response envelope in tests
  const data = <T>(body: unknown) => (body as { data: T }).data;

  it('aggregates the restaurant’s released orders, sales, items, ratings and cancellations', async () => {
    const restaurant = await h.restaurant();
    const owner = restaurant.owner;
    const deliveredAt = new Date();
    const delivered = [];
    for (let i = 0; i < 2; i += 1) {
      const placed = await f.placeOrder({ restaurant });
      await h.prisma.order.update({
        where: { id: placed.orderId },
        data: { status: 'DELIVERED', deliveredAt },
      });
      delivered.push(placed);
    }
    const cancelled = await f.placeOrder({ restaurant });
    await h
      .http()
      .post(`/api/v1/orders/${cancelled.orderId}/cancel`)
      .set('Authorization', cancelled.customer.auth)
      .send({ reasonCode: 'CUSTOMER_CHANGED_MIND' })
      .expect(200);
    // An unpaid online order is never released to the restaurant, so it is not counted.
    await f.placeOrder({ restaurant, paymentMethod: 'ONLINE_PAYMENT' });
    await h
      .http()
      .post(`/api/v1/orders/${delivered[0]?.orderId ?? ''}/review`)
      .set('Authorization', delivered[0]?.customer.auth ?? '')
      .send({ rating: 4 })
      .expect(201);

    const get = (path: string, auth = owner.auth) =>
      h.http().get(`/api/v1/restaurant/analytics/${path}`).set('Authorization', auth);

    expect(data((await get('overview').expect(200)).body)).toMatchObject({
      currency: 'PKR',
      orderCount: 3,
      deliveredCount: 2,
      cancelledCount: 1,
      salesAmount: '2000.00',
      averageOrderValue: '1000.00',
      averageRating: 4,
      reviewCount: 1,
    });
    const sales = data<{ days: { deliveredCount: number; salesAmount: string }[] }>(
      (await get('sales').expect(200)).body,
    );
    expect(sales.days).toEqual([
      expect.objectContaining({ deliveredCount: 2, salesAmount: '2000.00' }),
    ]);
    expect(data((await get('orders').expect(200)).body)).toMatchObject({
      total: 3,
      byStatus: { DELIVERED: 2, CANCELLED_BY_CUSTOMER: 1 },
    });
    const popular = data<{ items: { itemName: string; quantity: number }[] }>(
      (await get('popular-items?limit=5').expect(200)).body,
    );
    expect(popular.items.reduce((sum, item) => sum + item.quantity, 0)).toBe(2);
    expect(data((await get('ratings').expect(200)).body)).toMatchObject({
      averageRating: 4,
      reviewCount: 1,
    });
    expect(data((await get('cancellations').expect(200)).body)).toMatchObject({
      total: 1,
      byStatus: { CANCELLED_BY_CUSTOMER: 1 },
      byReason: [{ reasonCode: 'CUSTOMER_CHANGED_MIND', count: 1 }],
    });

    // Ranges filter; an empty future range returns zeros.
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(
      data((await get(`overview?from=${encodeURIComponent(future)}`).expect(200)).body),
    ).toMatchObject({ orderCount: 0, salesAmount: '0.00', averageOrderValue: null });
    await get(
      `overview?from=${encodeURIComponent(future)}&to=${encodeURIComponent(deliveredAt.toISOString())}`,
    ).expect(400);

    // Tenant isolation and owner-only access.
    const other = await h.restaurant();
    expect(data((await get('overview', other.owner.auth).expect(200)).body)).toMatchObject({
      orderCount: 0,
    });
    const operator = await h.actor('RESTAURANT_OPERATOR');
    await h.prisma.restaurantStaff.create({
      data: { restaurantId: restaurant.restaurantId, userId: operator.userId, role: 'OPERATOR' },
    });
    await get('overview', operator.auth).expect(403);
    await get('overview', delivered[0]?.customer.auth).expect(403);
  });
});
