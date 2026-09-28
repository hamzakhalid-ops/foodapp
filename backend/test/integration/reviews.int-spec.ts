import { OutboxProcessor } from '../../src/common/outbox/outbox.processor';
import { createHarness, type Harness } from './auth-harness';
import { orderFixtures } from './order-fixtures';

/** Slice 16 — Reviews (IMPLEMENTATION_PLAN §21, REVIEW_RULES). */
describe('Slice 13 — reviews', () => {
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

  async function delivered(options: Parameters<typeof f.placeOrder>[0] = {}) {
    const placed = await f.placeOrder(options);
    await h.prisma.order.update({
      where: { id: placed.orderId },
      data: { status: 'DELIVERED', deliveredAt: new Date() },
    });
    return placed;
  }

  const review = (auth: string, orderId: string, body: object) =>
    h.http().post(`/api/v1/orders/${orderId}/review`).set('Authorization', auth).send(body);

  it('allows one review per delivered order by its customer only', async () => {
    const pending = await f.placeOrder();
    const notYet = await review(pending.customer.auth, pending.orderId, { rating: 5 }).expect(409);
    expect(error(notYet.body)).toBe('REVIEW_NOT_ELIGIBLE');
    const eligibility = await h
      .http()
      .get(`/api/v1/orders/${pending.orderId}/review-eligibility`)
      .set('Authorization', pending.customer.auth)
      .expect(200);
    expect(data(eligibility.body)).toEqual({
      eligible: false,
      reason: 'REVIEW_NOT_ELIGIBLE',
      reviewId: null,
    });

    const { customer, orderId, restaurant } = await delivered();
    const stranger = await h.actor('CUSTOMER');
    await review(stranger.auth, orderId, { rating: 5 }).expect(404);
    for (const rating of [0, 6, 4.5, '5']) {
      await review(customer.auth, orderId, { rating }).expect(400);
    }
    await review(customer.auth, orderId, {
      rating: 5,
      restaurantId: restaurant.restaurantId,
    }).expect(400);

    const created = await review(customer.auth, orderId, {
      rating: 4,
      comment: '  Tasty karahi  ',
    }).expect(201);
    expect(data(created.body)).toMatchObject({
      rating: 4,
      comment: 'Tasty karahi',
      status: 'PUBLISHED',
      restaurantId: restaurant.restaurantId,
      response: null,
    });
    const again = await review(customer.auth, orderId, { rating: 5 }).expect(409);
    expect(error(again.body)).toBe('REVIEW_ALREADY_EXISTS');
  });

  it('keeps concurrent submissions to a single review', async () => {
    const { customer, orderId } = await delivered();
    const results = await Promise.all([
      review(customer.auth, orderId, { rating: 5 }),
      review(customer.auth, orderId, { rating: 4 }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(await h.prisma.review.count()).toBe(1);
  });

  it('aggregates only published reviews into the public rating', async () => {
    const restaurant = await h.restaurant();
    const ratings = [5, 4, 4];
    const ids: string[] = [];
    for (const rating of ratings) {
      const { customer, orderId } = await delivered({ restaurant });
      ids.push(
        data<{ id: string }>((await review(customer.auth, orderId, { rating }).expect(201)).body)
          .id,
      );
    }
    const admin = await h.actor('ADMIN');
    await h
      .http()
      .post(`/api/v1/admin/reviews/${ids[0] ?? ''}/hide`)
      .set('Authorization', admin.auth)
      .send({ reason: 'Contains a phone number' })
      .expect(200);
    const summary = await h
      .http()
      .get(`/api/v1/restaurants/${restaurant.restaurantId}/rating-summary`)
      .expect(200);
    expect(data(summary.body)).toEqual({
      averageRating: 4,
      reviewCount: 2,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 2, 5: 0 },
    });
    const listed = await h
      .http()
      .get(`/api/v1/restaurants/${restaurant.restaurantId}/reviews`)
      .expect(200);
    expect(data<{ customerFirstName: string }[]>(listed.body)).toHaveLength(2);
    expect(data<Record<string, unknown>[]>(listed.body)[0]).not.toHaveProperty('orderId');
    const discovered = await h.http().get('/api/v1/restaurants').expect(200);
    expect(data<{ rating: unknown }[]>(discovered.body)[0]?.rating).toEqual({
      average: 4,
      count: 2,
    });
    expect(await h.prisma.auditLog.count({ where: { action: 'REVIEW_HIDDEN' } })).toBe(1);
  });

  it('lets customers edit and remove their review without undoing moderation', async () => {
    const { customer, orderId } = await delivered();
    const id = data<{ id: string }>(
      (await review(customer.auth, orderId, { rating: 2 }).expect(201)).body,
    ).id;
    const edited = await h
      .http()
      .patch(`/api/v1/reviews/${id}`)
      .set('Authorization', customer.auth)
      .send({ rating: 3 })
      .expect(200);
    expect(data(edited.body)).toMatchObject({ rating: 3 });
    const stranger = await h.actor('CUSTOMER');
    await h
      .http()
      .patch(`/api/v1/reviews/${id}`)
      .set('Authorization', stranger.auth)
      .send({ rating: 1 })
      .expect(404);

    const admin = await h.actor('ADMIN');
    await h
      .http()
      .post(`/api/v1/admin/reviews/${id}/hide`)
      .set('Authorization', admin.auth)
      .send({ reason: 'x' })
      .expect(200);
    const blocked = await h
      .http()
      .patch(`/api/v1/reviews/${id}`)
      .set('Authorization', customer.auth)
      .send({ rating: 5 })
      .expect(409);
    expect(error(blocked.body)).toBe('REVIEW_ALREADY_REMOVED');
    await h.http().delete(`/api/v1/reviews/${id}`).set('Authorization', customer.auth).expect(204);
    expect((await h.prisma.review.findUniqueOrThrow({ where: { id } })).status).toBe('REMOVED');
  });

  it('lets restaurant staff reply to and report their own reviews only', async () => {
    const { customer, orderId, restaurant } = await delivered();
    const id = data<{ id: string }>(
      (await review(customer.auth, orderId, { rating: 1, comment: 'Cold food' }).expect(201)).body,
    ).id;
    const operator = await h.actor('RESTAURANT_OPERATOR');
    await h.prisma.restaurantStaff.create({
      data: { restaurantId: restaurant.restaurantId, userId: operator.userId, role: 'OPERATOR' },
    });
    const other = await h.restaurant();

    await h
      .http()
      .post(`/api/v1/restaurant/reviews/${id}/reply`)
      .set('Authorization', other.owner.auth)
      .send({ response: 'x' })
      .expect(404);
    const replied = await h
      .http()
      .post(`/api/v1/restaurant/reviews/${id}/reply`)
      .set('Authorization', operator.auth)
      .send({ response: 'Sorry! Please try us again.' })
      .expect(200);
    expect(data(replied.body)).toMatchObject({
      rating: 1,
      response: { response: 'Sorry! Please try us again.' },
    });
    await h
      .http()
      .post(`/api/v1/restaurant/reviews/${id}/reply`)
      .set('Authorization', restaurant.owner.auth)
      .send({ response: 'Updated reply' })
      .expect(200);
    expect(await h.prisma.reviewResponse.count()).toBe(1);

    await h
      .http()
      .post(`/api/v1/restaurant/reviews/${id}/report`)
      .set('Authorization', restaurant.owner.auth)
      .send({ reason: 'OTHER' })
      .expect(400);
    await h
      .http()
      .post(`/api/v1/restaurant/reviews/${id}/report`)
      .set('Authorization', restaurant.owner.auth)
      .send({ reason: 'FRAUDULENT_CONTENT', details: 'Order was delivered hot' })
      .expect(201);
    const duplicate = await h
      .http()
      .post(`/api/v1/restaurant/reviews/${id}/report`)
      .set('Authorization', restaurant.owner.auth)
      .send({ reason: 'SPAM' })
      .expect(409);
    expect(error(duplicate.body)).toBe('REVIEW_REPORT_INVALID');
    const list = await h
      .http()
      .get('/api/v1/restaurant/reviews')
      .set('Authorization', operator.auth)
      .expect(200);
    expect(data<unknown[]>(list.body)).toHaveLength(1);
  });

  it('runs the moderation queue: reports, resolve, restore and notifications', async () => {
    const { customer, orderId, restaurant } = await delivered();
    const id = data<{ id: string }>(
      (await review(customer.auth, orderId, { rating: 5 }).expect(201)).body,
    ).id;
    const reporter = await h.actor('CUSTOMER');
    const report = data<{ id: string }>(
      (
        await h
          .http()
          .post(`/api/v1/reviews/${id}/report`)
          .set('Authorization', reporter.auth)
          .send({ reason: 'SPAM' })
          .expect(201)
      ).body,
    );
    const admin = await h.actor('ADMIN');
    const queue = await h
      .http()
      .get('/api/v1/admin/review-reports?status=OPEN')
      .set('Authorization', admin.auth)
      .expect(200);
    expect(data<{ id: string }[]>(queue.body).map((row) => row.id)).toEqual([report.id]);
    await h
      .http()
      .post(`/api/v1/admin/review-reports/${report.id}/resolve`)
      .set('Authorization', admin.auth)
      .send({ outcome: 'DISMISSED', reason: 'Not spam' })
      .expect(200);
    await h
      .http()
      .post(`/api/v1/admin/reviews/${id}/restore`)
      .set('Authorization', admin.auth)
      .send({ reason: 'x' })
      .expect(409);
    await h
      .http()
      .post(`/api/v1/admin/reviews/${id}/remove`)
      .set('Authorization', admin.auth)
      .send({ reason: 'Policy' })
      .expect(200);
    await h.http().get('/api/v1/admin/reviews').set('Authorization', customer.auth).expect(403);

    await h.app.get(OutboxProcessor).drain();
    expect(
      await h.prisma.notification.count({
        where: { userId: restaurant.owner.userId, type: 'REVIEW_RECEIVED' },
      }),
    ).toBe(1);
  });
});
