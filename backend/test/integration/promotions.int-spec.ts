import { type Actor, createHarness, type Harness, type TestRestaurant } from './auth-harness';
import { orderFixtures } from './order-fixtures';

/** Slice 15 — Promotions (IMPLEMENTATION_PLAN §20, PROMOTION_RULES). */
describe('Slice 11 — promotions', () => {
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
  const day = 24 * 3600 * 1000;

  async function promotion(
    restaurant: TestRestaurant,
    overrides: Record<string, unknown> = {},
    activate = true,
  ) {
    const created = await h
      .http()
      .post('/api/v1/restaurant/promotions')
      .set('Authorization', restaurant.owner.auth)
      .send({
        name: '10% Off',
        code: 'save10',
        type: 'PERCENTAGE',
        value: '10.00',
        startsAt: new Date(Date.now() - day).toISOString(),
        endsAt: new Date(Date.now() + day).toISOString(),
        ...overrides,
      })
      .expect(201);
    const id = data<{ id: string }>(created.body).id;
    if (activate) {
      await h
        .http()
        .patch(`/api/v1/restaurant/promotions/${id}`)
        .set('Authorization', restaurant.owner.auth)
        .send({ status: 'ACTIVE' })
        .expect(200);
    }
    return id;
  }

  /** Customer with an address and a cart of `quantity` × 1000 at `restaurant`. */
  async function shopper(restaurant: TestRestaurant, quantity = 1, customer?: Actor) {
    await f.configurePricing();
    const actor = customer ?? (await h.actor('CUSTOMER'));
    const itemId = await f.menuItem(restaurant);
    const addressId = await f.address(actor);
    await h
      .http()
      .post('/api/v1/cart/items')
      .set('Authorization', actor.auth)
      .send({ restaurantId: restaurant.restaurantId, menuItemId: itemId, quantity })
      .expect(201);
    return { customer: actor, addressId };
  }

  const order = (
    customer: Actor,
    addressId: string,
    promotionCode: string,
    key = `promo-${Math.random()}`,
  ) =>
    h
      .http()
      .post('/api/v1/orders')
      .set('Authorization', customer.auth)
      .set('Idempotency-Key', key.replace('.', ''))
      .send({ addressId, paymentMethod: 'CASH_ON_DELIVERY', promotionCode });

  const preview = (customer: Actor, addressId: string, promotionCode: string) =>
    h
      .http()
      .post('/api/v1/checkout/preview')
      .set('Authorization', customer.auth)
      .send({ addressId, paymentMethod: 'CASH_ON_DELIVERY', promotionCode });

  it('lets the owner manage promotions within their restaurant only', async () => {
    const restaurant = await h.restaurant();
    const id = await promotion(restaurant, {}, false);
    const draft = await h
      .http()
      .get(`/api/v1/restaurant/promotions/${id}`)
      .set('Authorization', restaurant.owner.auth)
      .expect(200);
    expect(data(draft.body)).toMatchObject({
      code: 'SAVE10',
      status: 'DRAFT',
      value: '10.00',
      usageCount: 0,
    });

    const operator = await h.actor('RESTAURANT_OPERATOR');
    await h.prisma.restaurantStaff.create({
      data: { restaurantId: restaurant.restaurantId, userId: operator.userId, role: 'OPERATOR' },
    });
    await h
      .http()
      .get('/api/v1/restaurant/promotions')
      .set('Authorization', operator.auth)
      .expect(403);
    const other = await h.restaurant();
    await h
      .http()
      .get(`/api/v1/restaurant/promotions/${id}`)
      .set('Authorization', other.owner.auth)
      .expect(404);

    const dup = await h
      .http()
      .post('/api/v1/restaurant/promotions')
      .set('Authorization', restaurant.owner.auth)
      .send({
        name: 'x',
        code: 'SAVE10',
        type: 'FIXED_AMOUNT',
        value: '50',
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + day).toISOString(),
      })
      .expect(409);
    expect(error(dup.body)).toBe('INVALID_REQUEST');
    await h
      .http()
      .post('/api/v1/restaurant/promotions')
      .set('Authorization', restaurant.owner.auth)
      .send({
        name: 'x',
        code: 'BIG',
        type: 'PERCENTAGE',
        value: '150',
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + day).toISOString(),
      })
      .expect(400);

    await h
      .http()
      .patch(`/api/v1/restaurant/promotions/${id}`)
      .set('Authorization', restaurant.owner.auth)
      .send({ status: 'ACTIVE' })
      .expect(200);
    await h
      .http()
      .patch(`/api/v1/restaurant/promotions/${id}`)
      .set('Authorization', restaurant.owner.auth)
      .send({ code: 'OTHER' })
      .expect(409);
    await h
      .http()
      .post(`/api/v1/restaurant/promotions/${id}/disable`)
      .set('Authorization', restaurant.owner.auth)
      .expect(200);
    await h
      .http()
      .patch(`/api/v1/restaurant/promotions/${id}`)
      .set('Authorization', restaurant.owner.auth)
      .send({ name: 'y' })
      .expect(409);
    const actions = (await h.prisma.auditLog.findMany({ where: { entityId: id } })).map(
      (row) => row.action,
    );
    expect(actions).toEqual(
      expect.arrayContaining(['PROMOTION_CREATED', 'PROMOTION_UPDATED', 'PROMOTION_DISABLED']),
    );
  });

  it('applies the discount at checkout and consumes one usage with the order', async () => {
    const restaurant = await h.restaurant();
    const id = await promotion(restaurant, { maximumDiscount: '150.00' });
    const { customer, addressId } = await shopper(restaurant, 2); // subtotal 2000 → 10% = 200, capped 150

    const visible = await h
      .http()
      .get(`/api/v1/restaurants/${restaurant.restaurantId}/promotions`)
      .expect(200);
    expect(data<{ code: string }[]>(visible.body).map((row) => row.code)).toEqual(['SAVE10']);
    const validation = await h
      .http()
      .post('/api/v1/promotions/validate')
      .set('Authorization', customer.auth)
      .send({ code: ' save10 ' })
      .expect(200);
    expect(data(validation.body)).toMatchObject({
      valid: true,
      promotionId: id,
      discount: '150.00',
    });

    const quoted = await preview(customer, addressId, 'save10').expect(200);
    // tax 16% of (2000 − 150) = 296 → total 2000 − 150 + 150 + 296 + 25
    expect(data(quoted.body)).toMatchObject({
      subtotal: '2000.00',
      discount: '150.00',
      tax: '296.00',
      total: '2321.00',
    });

    const placed = await order(customer, addressId, 'SAVE10', 'promo-order-key').expect(201);
    const orderId = data<{ id: string }>(placed.body).id;
    expect(data(placed.body)).toMatchObject({ discountAmount: '150.00', totalAmount: '2321.00' });
    await order(customer, addressId, 'SAVE10', 'promo-order-key').expect(201); // idempotent replay
    expect(await h.prisma.promotionUsage.findMany()).toMatchObject([
      { promotionId: id, orderId, customerId: customer.userId },
    ]);
    expect((await h.prisma.promotion.findUniqueOrThrow({ where: { id } })).usageCount).toBe(1);
    expect((await h.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).promotionId).toBe(
      id,
    );
  });

  it('rejects inactive, unstarted, expired, foreign and below-minimum promotions', async () => {
    const restaurant = await h.restaurant();
    await promotion(restaurant, { code: 'DRAFTED' }, false);
    await promotion(restaurant, {
      code: 'SOON',
      startsAt: new Date(Date.now() + day).toISOString(),
      endsAt: new Date(Date.now() + 2 * day).toISOString(),
    });
    const ended = await promotion(restaurant, { code: 'ENDED' });
    await h.prisma.promotion.update({
      where: { id: ended },
      data: { endsAt: new Date(Date.now() - 1000), startsAt: new Date(Date.now() - day) },
    });
    await promotion(restaurant, { code: 'MIN5000', minimumOrderAmount: '5000.00' });
    await promotion(await h.restaurant(), { code: 'ELSEWHERE' });
    const { customer, addressId } = await shopper(restaurant);

    const cases: [string, string][] = [
      ['DRAFTED', 'PROMOTION_INACTIVE'],
      ['SOON', 'PROMOTION_NOT_STARTED'],
      ['ENDED', 'PROMOTION_EXPIRED'],
      ['MIN5000', 'PROMOTION_NOT_ELIGIBLE'],
      ['ELSEWHERE', 'PROMOTION_NOT_FOUND'],
    ];
    for (const [code, expected] of cases) {
      expect(error((await preview(customer, addressId, code).expect(422)).body)).toBe(expected);
    }
    const invalid = await h
      .http()
      .post('/api/v1/promotions/validate')
      .set('Authorization', customer.auth)
      .send({ code: 'MIN5000' })
      .expect(200);
    expect(data(invalid.body)).toMatchObject({
      valid: false,
      reason: 'PROMOTION_NOT_ELIGIBLE',
      discount: '0.00',
    });
  });

  it('enforces the total usage limit under concurrency and the per-customer limit', async () => {
    const restaurant = await h.restaurant();
    const id = await promotion(restaurant, {
      code: 'ONCE',
      type: 'FIXED_AMOUNT',
      value: '100.00',
      usageLimit: 1,
    });
    const a = await shopper(restaurant);
    const b = await shopper(restaurant);
    const results = await Promise.all([
      order(a.customer, a.addressId, 'ONCE'),
      order(b.customer, b.addressId, 'ONCE'),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 422]);
    const loser = results.find((result) => result.status === 422);
    expect(error(loser?.body)).toBe('PROMOTION_USAGE_LIMIT_REACHED');
    expect((await h.prisma.promotion.findUniqueOrThrow({ where: { id } })).usageCount).toBe(1);

    await promotion(restaurant, { code: 'PERCUST', perCustomerUsageLimit: 1 });
    const c = await shopper(restaurant);
    await order(c.customer, c.addressId, 'PERCUST').expect(201);
    await shopper(restaurant, 1, c.customer);
    const again = await order(c.customer, c.addressId, 'PERCUST').expect(422);
    expect(error(again.body)).toBe('PROMOTION_USAGE_LIMIT_REACHED');
  });

  it('lets admins pause and disable promotions with a reason', async () => {
    const restaurant = await h.restaurant();
    const id = await promotion(restaurant);
    const admin = await h.actor('ADMIN');
    await h
      .http()
      .patch(`/api/v1/admin/promotions/${id}`)
      .set('Authorization', admin.auth)
      .send({ status: 'PAUSED' })
      .expect(400);
    await h
      .http()
      .patch(`/api/v1/admin/promotions/${id}`)
      .set('Authorization', admin.auth)
      .send({ status: 'PAUSED', reason: 'Abuse review' })
      .expect(200);
    const { customer, addressId } = await shopper(restaurant);
    expect(error((await preview(customer, addressId, 'SAVE10').expect(422)).body)).toBe(
      'PROMOTION_INACTIVE',
    );
    await h
      .http()
      .post(`/api/v1/admin/promotions/${id}/disable`)
      .set('Authorization', admin.auth)
      .send({ reason: 'Ended by ops' })
      .expect(200);
    const list = await h
      .http()
      .get('/api/v1/admin/promotions?status=DISABLED')
      .set('Authorization', admin.auth)
      .expect(200);
    expect(data<{ id: string }[]>(list.body).map((row) => row.id)).toEqual([id]);
    await h.http().get('/api/v1/admin/promotions').set('Authorization', customer.auth).expect(403);
  });
});
