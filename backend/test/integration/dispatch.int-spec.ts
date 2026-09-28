import { OutboxProcessor } from '../../src/common/outbox/outbox.processor';
import { DispatchService } from '../../src/modules/dispatch/dispatch.service';
import { type Actor, createHarness, type Harness, PASSWORD, newCustomer } from './auth-harness';
import { orderFixtures } from './order-fixtures';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');

/** Slices 10–12 — Riders, Dispatch, Rider Delivery and Completion (IMPLEMENTATION_PLAN §15–17). */
describe('Slices 8–9 — riders, dispatch and deliveries', () => {
  let h: Harness;
  let f: ReturnType<typeof orderFixtures>;
  let outbox: OutboxProcessor;
  let dispatch: DispatchService;
  beforeAll(async () => {
    h = await createHarness();
    f = orderFixtures(h);
    outbox = h.app.get(OutboxProcessor);
    dispatch = h.app.get(DispatchService);
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
  const offersOf = async (rider: Actor) =>
    data<{ id: string; orderId: string }[]>(
      (
        await h
          .http()
          .get('/api/v1/rider/delivery-offers')
          .set('Authorization', rider.auth)
          .expect(200)
      ).body,
    );
  const post = (actor: Actor, url: string, body: object = {}) =>
    h.http().post(`/api/v1${url}`).set('Authorization', actor.auth).send(body);

  describe('rider onboarding and admin review', () => {
    async function registerRider() {
      const identity = newCustomer();
      await h
        .http()
        .post('/api/v1/rider/auth/register')
        .send({
          email: identity.email,
          phone: identity.phone,
          password: PASSWORD,
          firstName: 'Ali',
          lastName: 'Raza',
        })
        .expect(201);
      const login = await h
        .http()
        .post('/api/v1/auth/login')
        .send({ identifier: identity.email, password: PASSWORD })
        .expect(200);
      const auth = `Bearer ${data<{ accessToken: string }>(login.body).accessToken}`;
      await h
        .http()
        .post('/api/v1/auth/verify-phone')
        .set('Authorization', auth)
        .send({ code: h.sender.lastPhoneCode() })
        .expect(200);
      return auth;
    }

    it('registers, completes onboarding, is approved and goes online', async () => {
      const auth = await registerRider();
      const onboarding = await h
        .http()
        .get('/api/v1/rider/onboarding')
        .set('Authorization', auth)
        .expect(200);
      expect(data(onboarding.body)).toMatchObject({
        profile: { approvalStatus: 'PENDING' },
        missing: ['vehicle', 'documents'],
      });
      const incomplete = await h
        .http()
        .post('/api/v1/rider/onboarding/submit')
        .set('Authorization', auth)
        .expect(422);
      expect(error(incomplete.body)).toBe('VALIDATION_ERROR');

      await h
        .http()
        .patch('/api/v1/rider/onboarding')
        .set('Authorization', auth)
        .send({ vehicleType: 'MOTORCYCLE', vehicleNumber: 'LEB-77' })
        .expect(200);
      await h
        .http()
        .post('/api/v1/rider/documents')
        .set('Authorization', auth)
        .field('documentType', 'DRIVING_LICENSE')
        .attach('file', PDF, 'license.pdf')
        .expect(201);
      const submitted = await h
        .http()
        .post('/api/v1/rider/onboarding/submit')
        .set('Authorization', auth)
        .expect(200);
      expect(data(submitted.body)).toMatchObject({
        profile: { approvalStatus: 'UNDER_REVIEW' },
        missing: [],
      });
      await h
        .http()
        .patch('/api/v1/rider/onboarding')
        .set('Authorization', auth)
        .send({ vehicleNumber: 'X' })
        .expect(409);
      expect(
        error(
          (
            await h
              .http()
              .post('/api/v1/rider/availability/online')
              .set('Authorization', auth)
              .expect(409)
          ).body,
        ),
      ).toBe('RIDER_NOT_ELIGIBLE');

      const riderId = data<{ profile: { id: string } }>(submitted.body).profile.id;
      const admin = await h.actor('ADMIN');
      await post(admin, `/admin/riders/${riderId}/approve`).expect(200);
      expect(await h.prisma.riderDocument.count({ where: { riderId, status: 'APPROVED' } })).toBe(
        1,
      );
      expect(
        await h.prisma.auditLog.count({ where: { action: 'RIDER_APPROVED', entityId: riderId } }),
      ).toBe(1);
      const online = await h
        .http()
        .post('/api/v1/rider/availability/online')
        .set('Authorization', auth)
        .expect(200);
      expect(data(online.body)).toEqual({ isOnline: true, isAvailable: true, state: 'AVAILABLE' });
    });

    it('rejects with a reason, allows resubmission, suspends and restores', async () => {
      const auth = await registerRider();
      await h
        .http()
        .patch('/api/v1/rider/onboarding')
        .set('Authorization', auth)
        .send({ vehicleType: 'CAR', vehicleNumber: 'LEC-1' })
        .expect(200);
      await h
        .http()
        .post('/api/v1/rider/documents')
        .set('Authorization', auth)
        .field('documentType', 'CNIC')
        .attach('file', PDF, 'id.pdf')
        .expect(201);
      const submitted = await h
        .http()
        .post('/api/v1/rider/onboarding/submit')
        .set('Authorization', auth)
        .expect(200);
      const riderId = data<{ profile: { id: string } }>(submitted.body).profile.id;
      const admin = await h.actor('ADMIN');
      await post(admin, `/admin/riders/${riderId}/reject`, {}).expect(400);
      await post(admin, `/admin/riders/${riderId}/reject`, { reason: 'Blurry licence' }).expect(
        200,
      );
      const rejected = await h
        .http()
        .get('/api/v1/rider/onboarding')
        .set('Authorization', auth)
        .expect(200);
      expect(data(rejected.body)).toMatchObject({
        profile: { approvalStatus: 'REJECTED' },
        rejectionReason: 'Blurry licence',
      });
      await h.http().post('/api/v1/rider/onboarding/submit').set('Authorization', auth).expect(200);
      await post(admin, `/admin/riders/${riderId}/approve`).expect(200);
      await post(admin, `/admin/riders/${riderId}/approve`).expect(409);

      await h
        .http()
        .post('/api/v1/rider/availability/online')
        .set('Authorization', auth)
        .expect(200);
      await post(admin, `/admin/riders/${riderId}/suspend`, { reason: 'Complaints' }).expect(200);
      expect(
        await h.prisma.riderProfile.findUniqueOrThrow({ where: { id: riderId } }),
      ).toMatchObject({
        approvalStatus: 'SUSPENDED',
        status: 'SUSPENDED',
        isOnline: false,
      });
      await h
        .http()
        .post('/api/v1/rider/availability/online')
        .set('Authorization', auth)
        .expect(409);
      await post(admin, `/admin/riders/${riderId}/restore`, { reason: 'Resolved' }).expect(200);
      await h
        .http()
        .post('/api/v1/rider/availability/online')
        .set('Authorization', auth)
        .expect(200);

      const customer = await h.actor('CUSTOMER');
      await h.http().get('/api/v1/admin/riders').set('Authorization', customer.auth).expect(403);
      const list = await h
        .http()
        .get('/api/v1/admin/riders?approvalStatus=APPROVED')
        .set('Authorization', admin.auth)
        .expect(200);
      expect(data<{ id: string }[]>(list.body).map((row) => row.id)).toEqual([riderId]);
    });

    it('requires being online to share a location and to toggle availability', async () => {
      const rider = await f.rider({ online: false });
      await post(rider, '/rider/location', { latitude: 31.5, longitude: 74.3 }).expect(409);
      await post(rider, '/rider/availability', { available: true }).expect(409);
      await post(rider, '/rider/availability/online').expect(200);
      await post(rider, '/rider/location', { latitude: 95, longitude: 74.3 }).expect(400);
      const busy = await post(rider, '/rider/availability', { available: false }).expect(200);
      expect(data(busy.body)).toMatchObject({ state: 'BUSY' });
    });
  });

  describe('dispatch engine', () => {
    it('offers a ready order to the nearest eligible rider only', async () => {
      await f.dispatchSettings();
      const near = await f.rider({ latitude: 31.53, longitude: 74.3587 }); // ~1 km
      const far = await f.rider({ latitude: 31.56, longitude: 74.3587 }); // ~4.4 km
      const offline = await f.rider({ online: false });
      const busy = await f.rider();
      await post(busy, '/rider/availability', { available: false }).expect(200);
      const stale = await f.rider();
      await h.redis.set(
        `riders:location:${stale.riderId}`,
        JSON.stringify({
          accuracyMeters: null,
          recordedAt: new Date(Date.now() - 3_600_000).toISOString(),
        }),
      );

      const { orderId } = await f.readyOrder();
      await outbox.drain();

      expect((await offersOf(near)).map((offer) => offer.orderId)).toEqual([orderId]);
      for (const other of [far, offline, busy, stale]) expect(await offersOf(other)).toEqual([]);
      expect(await h.prisma.delivery.findUniqueOrThrow({ where: { orderId } })).toMatchObject({
        status: 'PENDING',
      });
    });

    it('stays paused without dispatch settings', async () => {
      await f.rider();
      const { orderId } = await f.readyOrder();
      await outbox.drain();
      expect(await h.prisma.dispatchOffer.count({ where: { orderId } })).toBe(0);
      await f.dispatchSettings();
      await dispatch.tick();
      expect(await h.prisma.dispatchOffer.count({ where: { orderId } })).toBe(1);
    });

    it('moves to the next rider after a rejection or an expiry, and fails after max attempts', async () => {
      await f.dispatchSettings({ maxOfferAttempts: 2 });
      const first = await f.rider({ latitude: 31.521 });
      const second = await f.rider({ latitude: 31.53 });
      const { orderId } = await f.readyOrder();
      await outbox.drain();

      const [offer] = await offersOf(first);
      await post(first, `/rider/delivery-offers/${offer?.id ?? ''}/reject`, {
        reasonCode: 'TOO_FAR',
      }).expect(200);
      expect((await offersOf(second)).map((o) => o.orderId)).toEqual([orderId]);

      await h.prisma.dispatchOffer.updateMany({
        where: { orderId, status: 'OFFERED' },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await dispatch.tick(); // expires the second offer; no third attempt allowed
      await dispatch.tick();
      const offers = await h.prisma.dispatchOffer.findMany({
        where: { orderId },
        orderBy: { offeredAt: 'asc' },
      });
      expect(offers.map((o) => o.status)).toEqual(['REJECTED', 'EXPIRED']);
      expect(
        (await h.prisma.delivery.findUniqueOrThrow({ where: { orderId } })).dispatchFailedAt,
      ).not.toBeNull();
      expect(await h.prisma.outboxEvent.count({ where: { eventType: 'dispatch.failed' } })).toBe(1);
      const late = await post(
        second,
        `/rider/delivery-offers/${offers[1]?.id ?? ''}/accept`,
      ).expect(409);
      expect(error(late.body)).toBe('DISPATCH_OFFER_ALREADY_RESPONDED');
    });

    it('assigns atomically on accept, idempotently, and only to the offered rider', async () => {
      await f.dispatchSettings();
      const rider = await f.rider();
      const intruder = await f.rider({ online: false });
      const { orderId, customer } = await f.readyOrder();
      await outbox.drain();
      const [offer] = await offersOf(rider);
      const url = `/rider/delivery-offers/${offer?.id ?? ''}/accept`;
      await post(intruder, url).expect(404);

      const [a, b] = await Promise.all([post(rider, url), post(rider, url)]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect(await h.prisma.deliveryAssignment.count()).toBe(1);
      expect((await h.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe(
        'RIDER_ASSIGNED',
      );
      expect(
        await h.prisma.riderProfile.findUniqueOrThrow({ where: { id: rider.riderId } }),
      ).toMatchObject({ isAvailable: false });
      const current = await h
        .http()
        .get('/api/v1/rider/delivery/current')
        .set('Authorization', rider.auth)
        .expect(200);
      expect(data(current.body)).toMatchObject({
        orderId,
        status: 'ASSIGNED',
        destination: { recipientName: 'Sara Ahmed' },
      });

      await h.http().get(`/api/v1/orders/${orderId}`).set('Authorization', rider.auth).expect(200);
      await h
        .http()
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', intruder.auth)
        .expect(404);
      const deliveryId = data<{ id: string }>(current.body).id;
      await h
        .http()
        .get(`/api/v1/deliveries/${deliveryId}`)
        .set('Authorization', customer.auth)
        .expect(200);
      const stranger = await h.actor('CUSTOMER');
      await h
        .http()
        .get(`/api/v1/deliveries/${deliveryId}`)
        .set('Authorization', stranger.auth)
        .expect(404);
    });

    it('rejects an expired offer', async () => {
      await f.dispatchSettings();
      const rider = await f.rider();
      const { orderId } = await f.readyOrder();
      await outbox.drain();
      await h.prisma.dispatchOffer.updateMany({
        where: { orderId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const offer = await h.prisma.dispatchOffer.findFirstOrThrow({ where: { orderId } });
      const response = await post(rider, `/rider/delivery-offers/${offer.id}/accept`).expect(409);
      expect(error(response.body)).toBe('DISPATCH_OFFER_EXPIRED');
      expect(
        (await h.prisma.dispatchOffer.findUniqueOrThrow({ where: { id: offer.id } })).status,
      ).toBe('EXPIRED');
    });
  });

  describe('delivery flow', () => {
    async function assigned() {
      await f.dispatchSettings();
      const rider = await f.rider();
      const context = await f.readyOrder();
      await outbox.drain();
      const offer = await h.prisma.dispatchOffer.findFirstOrThrow({
        where: { orderId: context.orderId },
      });
      const accepted = await post(rider, `/rider/delivery-offers/${offer.id}/accept`).expect(200);
      return { ...context, rider, deliveryId: data<{ id: string }>(accepted.body).id };
    }

    it('walks pickup → out for delivery → delivered and collects cash on delivery', async () => {
      const { rider, deliveryId, orderId } = await assigned();
      const other = await f.rider({ online: false });
      const base = `/rider/deliveries/${deliveryId}`;
      await post(rider, `${base}/out-for-delivery`).expect(409);
      await post(other, `${base}/pickup`).expect(404);
      await post(rider, `${base}/arriving`).expect(200);
      await post(rider, `${base}/pickup`).expect(200);
      await post(rider, `${base}/out-for-delivery`).expect(200);
      await post(rider, '/rider/availability/offline').expect(409);

      const missingCash = await post(rider, `${base}/complete`, {}).expect(422);
      expect(error(missingCash.body)).toBe('INVALID_REQUEST');
      const done = await post(rider, `${base}/complete`, {
        cashCollected: true,
        notes: 'Handed over',
      }).expect(200);
      expect(data(done.body)).toMatchObject({ status: 'DELIVERED', orderStatus: 'DELIVERED' });

      const order = await h.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order).toMatchObject({ status: 'DELIVERED', paymentStatus: 'SUCCEEDED' });
      expect(order.deliveredAt).not.toBeNull();
      const payment = await h.prisma.payment.findFirstOrThrow({ where: { orderId } });
      expect(payment.status).toBe('SUCCEEDED');
      expect(payment.paidAt).not.toBeNull();
      expect(
        await h.prisma.riderProfile.findUniqueOrThrow({ where: { id: rider.riderId } }),
      ).toMatchObject({ isAvailable: true });
      const history = await h.prisma.orderStatusHistory.findMany({
        where: { orderId },
        orderBy: { createdAt: 'asc' },
      });
      expect(history.map((entry) => entry.toStatus)).toEqual([
        'PENDING',
        'RESTAURANT_ACCEPTED',
        'PREPARING',
        'READY_FOR_PICKUP',
        'RIDER_ASSIGNED',
        'PICKED_UP',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
      ]);
      await post(rider, `${base}/complete`, { cashCollected: true }).expect(409);
      const past = await h
        .http()
        .get('/api/v1/rider/deliveries?status=DELIVERED')
        .set('Authorization', rider.auth)
        .expect(200);
      expect(data<unknown[]>(past.body)).toHaveLength(1);
    });

    it('releases the rider when an admin cancels an assigned order', async () => {
      const { rider, deliveryId, orderId } = await assigned();
      const admin = await h.actor('ADMIN');
      await post(admin, `/admin/orders/${orderId}/cancel`, {
        reasonCode: 'SAFETY_REASON',
        reason: 'Road closed',
      }).expect(200);
      expect(
        (await h.prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } })).status,
      ).toBe('CANCELLED');
      expect(
        (await h.prisma.deliveryAssignment.findFirstOrThrow({ where: { deliveryId } }))
          .unassignedAt,
      ).not.toBeNull();
      expect(
        await h.prisma.riderProfile.findUniqueOrThrow({ where: { id: rider.riderId } }),
      ).toMatchObject({ isAvailable: true });
      await post(rider, `/rider/deliveries/${deliveryId}/pickup`).expect(409);
    });

    it('withdraws open offers when the order is cancelled before assignment', async () => {
      await f.dispatchSettings();
      const rider = await f.rider();
      const { orderId } = await f.readyOrder();
      await outbox.drain();
      const admin = await h.actor('ADMIN');
      await post(admin, `/admin/orders/${orderId}/cancel`, {
        reasonCode: 'PLATFORM_ERROR',
        reason: 'x',
      }).expect(200);
      expect(await offersOf(rider)).toEqual([]);
      expect((await h.prisma.dispatchOffer.findFirstOrThrow({ where: { orderId } })).status).toBe(
        'CANCELLED',
      );
    });
  });
});
