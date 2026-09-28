import { OutboxProcessor } from '../../src/common/outbox/outbox.processor';
import { RestaurantsService } from '../../src/modules/restaurants/restaurants.service';
import { createHarness, type Harness, newCustomer, PASSWORD } from './auth-harness';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');

/** Slice 3 — Restaurant Onboarding (IMPLEMENTATION_PLAN §8). */
describe('Slice 3 — restaurants', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness();
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

  async function registerOwner() {
    const identity = newCustomer();
    const registered = await h
      .http()
      .post('/api/v1/restaurant/auth/register')
      .send({
        email: identity.email,
        phone: identity.phone,
        password: PASSWORD,
        ownerFirstName: 'Ali',
        ownerLastName: 'Khan',
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
    return {
      auth,
      userId: data<{ user: { id: string; roles: string[] } }>(registered.body).user.id,
      registered,
    };
  }

  async function completeOnboarding(auth: string) {
    await h
      .http()
      .post('/api/v1/restaurant/onboarding')
      .set('Authorization', auth)
      .send({ name: 'Karahi House', phone: '+92 42 1234567', email: 'karahi@example.com' })
      .expect(201);
    await h
      .http()
      .patch('/api/v1/restaurant/onboarding/address')
      .set('Authorization', auth)
      .send({ addressLine1: 'MM Alam Road 10', city: 'Lahore' })
      .expect(200);
    await h
      .http()
      .patch('/api/v1/restaurant/onboarding/location')
      .set('Authorization', auth)
      .send({ latitude: 31.51, longitude: 74.35 })
      .expect(200);
    await h
      .http()
      .patch('/api/v1/restaurant/onboarding/operating-hours')
      .set('Authorization', auth)
      .send({
        hours: [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
          dayOfWeek,
          opensAt: '00:00',
          closesAt: '23:59',
          isClosed: false,
        })),
      })
      .expect(200);
    await h
      .http()
      .patch('/api/v1/restaurant/onboarding/delivery')
      .set('Authorization', auth)
      .send({
        deliveryEnabled: true,
        minimumOrderAmount: '500.00',
        estimatedPreparationMinutes: 25,
        deliveryRadius: 7.5,
      })
      .expect(200);
    await h
      .http()
      .patch('/api/v1/restaurant/onboarding/business')
      .set('Authorization', auth)
      .send({ legalName: 'Karahi House (Pvt) Ltd' })
      .expect(200);
    await h
      .http()
      .post('/api/v1/restaurant/onboarding/documents')
      .set('Authorization', auth)
      .field('documentType', 'BUSINESS_LICENSE')
      .attach('file', PDF, 'license.pdf')
      .expect(201);
    const payment = await h
      .http()
      .patch('/api/v1/restaurant/onboarding/payment')
      .set('Authorization', auth)
      .send({
        provider: 'BANK_TRANSFER',
        accountReference: 'PK36SCBL0000001123456702',
        accountHolderName: 'Karahi House',
      })
      .expect(200);
    return payment;
  }

  it('registers a restaurant owner account that must verify before onboarding', async () => {
    const identity = newCustomer();
    const registered = await h
      .http()
      .post('/api/v1/restaurant/auth/register')
      .send({
        email: identity.email,
        phone: identity.phone,
        password: PASSWORD,
        ownerFirstName: 'Ali',
        ownerLastName: 'Khan',
      })
      .expect(201);
    expect(registered.body).toMatchObject({
      data: { user: { roles: ['RESTAURANT_OWNER'], status: 'PENDING_VERIFICATION' } },
    });
    const userId = data<{ user: { id: string } }>(registered.body).user.id;
    await expect(
      h.prisma.restaurantOwnerProfile.findUnique({ where: { userId } }),
    ).resolves.toMatchObject({ firstName: 'Ali' });

    const login = await h
      .http()
      .post('/api/v1/auth/login')
      .send({ identifier: identity.email, password: PASSWORD })
      .expect(200);
    const auth = `Bearer ${data<{ accessToken: string }>(login.body).accessToken}`;
    const blocked = await h
      .http()
      .post('/api/v1/restaurant/onboarding')
      .set('Authorization', auth)
      .send({ name: 'X' })
      .expect(403);
    expect(error(blocked.body)).toBe('AUTH_PHONE_NOT_VERIFIED');
  });

  it('walks the owner through onboarding and submission', async () => {
    const { auth } = await registerOwner();
    const created = await h
      .http()
      .post('/api/v1/restaurant/onboarding')
      .set('Authorization', auth)
      .send({ name: 'Karahi House' })
      .expect(201);
    expect(
      data<{ missing: string[]; application: { status: string } }>(created.body),
    ).toMatchObject({
      application: { status: 'DRAFT' },
      missing: expect.arrayContaining(['address', 'location', 'documents', 'payment']) as string[],
    });
    await h
      .http()
      .post('/api/v1/restaurant/onboarding')
      .set('Authorization', auth)
      .send({ name: 'Second' })
      .expect(409);

    const incomplete = await h
      .http()
      .post('/api/v1/restaurant/onboarding/submit')
      .set('Authorization', auth)
      .expect(422);
    expect(incomplete.body).toMatchObject({
      error: { code: 'VALIDATION_ERROR', details: { missing: expect.any(Array) as unknown[] } },
    });
    await h.reset();
  });

  it('completes onboarding, masks payment references and submits once', async () => {
    const { auth } = await registerOwner();
    const payment = await completeOnboarding(auth);
    const onboarding = data<{
      missing: string[];
      paymentAccount: { accountReferenceMasked: string };
      documents: unknown[];
    }>(payment.body);
    expect(onboarding.missing).toEqual([]);
    expect(onboarding.paymentAccount.accountReferenceMasked).toBe('****6702');
    expect(JSON.stringify(payment.body)).not.toContain('PK36SCBL0000001123456702');
    expect(onboarding.documents).toHaveLength(1);

    const submitted = await h
      .http()
      .post('/api/v1/restaurant/onboarding/submit')
      .set('Authorization', auth)
      .expect(200);
    expect(data<{ application: { status: string } }>(submitted.body).application.status).toBe(
      'SUBMITTED',
    );
    await h
      .http()
      .post('/api/v1/restaurant/onboarding/submit')
      .set('Authorization', auth)
      .expect(409);
    await h
      .http()
      .patch('/api/v1/restaurant/onboarding/address')
      .set('Authorization', auth)
      .send({ addressLine1: 'Changed', city: 'Lahore' })
      .expect(409);
    await expect(
      h.prisma.outboxEvent.count({ where: { eventType: 'restaurant.application_submitted' } }),
    ).resolves.toBe(1);
  });

  it('rejects files by content, not by claimed type', async () => {
    const { auth } = await registerOwner();
    await h
      .http()
      .post('/api/v1/restaurant/onboarding')
      .set('Authorization', auth)
      .send({ name: 'Karahi House' })
      .expect(201);
    const fake = await h
      .http()
      .post('/api/v1/restaurant/onboarding/documents')
      .set('Authorization', auth)
      .field('documentType', 'BUSINESS_LICENSE')
      .attach('file', Buffer.from('#!/bin/sh\nrm -rf /'), {
        filename: 'license.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);
    expect(error(fake.body)).toBe('INVALID_FILE');
  });

  it('lets only admins review, approve and reject applications (audited)', async () => {
    const { auth } = await registerOwner();
    await completeOnboarding(auth);
    await h
      .http()
      .post('/api/v1/restaurant/onboarding/submit')
      .set('Authorization', auth)
      .expect(200);
    const restaurant = await h.prisma.restaurant.findFirstOrThrow();

    const customer = await h.actor('CUSTOMER');
    await h
      .http()
      .post(`/api/v1/admin/restaurants/${restaurant.id}/approve`)
      .set('Authorization', customer.auth)
      .expect(403);
    await h
      .http()
      .post(`/api/v1/admin/restaurants/${restaurant.id}/approve`)
      .set('Authorization', auth)
      .expect(403);

    const admin = await h.actor('ADMIN');
    const list = await h
      .http()
      .get('/api/v1/admin/restaurants?approvalStatus=SUBMITTED')
      .set('Authorization', admin.auth)
      .expect(200);
    expect(list.body).toMatchObject({
      data: [{ id: restaurant.id }],
      meta: { pagination: { total: 1, page: 1 } },
    });

    const detail = await h
      .http()
      .get(`/api/v1/admin/restaurants/${restaurant.id}`)
      .set('Authorization', admin.auth)
      .expect(200);
    expect(
      data<{ owner: { firstName: string }; documentUrls: Record<string, string> }>(detail.body),
    ).toMatchObject({ owner: { firstName: 'Ali' } });

    await h
      .http()
      .post(`/api/v1/admin/restaurants/${restaurant.id}/reject`)
      .set('Authorization', admin.auth)
      .send({})
      .expect(400);
    const approved = await h
      .http()
      .post(`/api/v1/admin/restaurants/${restaurant.id}/approve`)
      .set('Authorization', admin.auth)
      .expect(200);
    expect(
      data<{ application: { status: string }; documents: { status: string }[] }>(approved.body),
    ).toMatchObject({
      application: { status: 'APPROVED' },
      documents: [{ status: 'APPROVED' }],
    });
    await h
      .http()
      .post(`/api/v1/admin/restaurants/${restaurant.id}/approve`)
      .set('Authorization', admin.auth)
      .expect(409);
    await expect(
      h.prisma.auditLog.count({
        where: { action: 'RESTAURANT_APPROVED', actorUserId: admin.userId },
      }),
    ).resolves.toBe(1);
  });

  it('supports request-resubmission then resubmission', async () => {
    const { auth } = await registerOwner();
    await completeOnboarding(auth);
    await h
      .http()
      .post('/api/v1/restaurant/onboarding/submit')
      .set('Authorization', auth)
      .expect(200);
    const restaurant = await h.prisma.restaurant.findFirstOrThrow();
    const admin = await h.actor('ADMIN');
    await h
      .http()
      .post(`/api/v1/admin/restaurants/${restaurant.id}/request-resubmission`)
      .set('Authorization', admin.auth)
      .send({ reason: 'License is blurry' })
      .expect(200);

    const application = await h
      .http()
      .get('/api/v1/restaurant/application')
      .set('Authorization', auth)
      .expect(200);
    expect(application.body).toMatchObject({
      data: { status: 'RESUBMISSION_REQUIRED', resubmissionNotes: 'License is blurry' },
    });
    await h
      .http()
      .post('/api/v1/restaurant/onboarding/documents')
      .set('Authorization', auth)
      .field('documentType', 'BUSINESS_LICENSE')
      .attach('file', PDF, 'license2.pdf')
      .expect(201);
    await h
      .http()
      .post('/api/v1/restaurant/onboarding/submit')
      .set('Authorization', auth)
      .expect(200);
  });

  describe('availability', () => {
    it('only approved restaurants go online; pause expires; admin suspension blocks staff', async () => {
      const { auth } = await registerOwner();
      await completeOnboarding(auth);
      const early = await h
        .http()
        .post('/api/v1/restaurant/availability/online')
        .set('Authorization', auth)
        .expect(409);
      expect(error(early.body)).toBe('RESTAURANT_NOT_APPROVED');

      await h
        .http()
        .post('/api/v1/restaurant/onboarding/submit')
        .set('Authorization', auth)
        .expect(200);
      const restaurant = await h.prisma.restaurant.findFirstOrThrow();
      const admin = await h.actor('ADMIN');
      await h
        .http()
        .post(`/api/v1/admin/restaurants/${restaurant.id}/approve`)
        .set('Authorization', admin.auth)
        .expect(200);

      const online = await h
        .http()
        .post('/api/v1/restaurant/availability/online')
        .set('Authorization', auth)
        .expect(200);
      expect(online.body).toMatchObject({ data: { status: 'ONLINE', isOrderableNow: true } });
      expect(
        error(
          (
            await h
              .http()
              .post('/api/v1/restaurant/availability/online')
              .set('Authorization', auth)
              .expect(409)
          ).body,
        ),
      ).toBe('RESTAURANT_ALREADY_ONLINE');

      const paused = await h
        .http()
        .post('/api/v1/restaurant/availability/pause')
        .set('Authorization', auth)
        .send({ durationMinutes: 30, reason: 'Kitchen busy' })
        .expect(200);
      expect(paused.body).toMatchObject({
        data: { status: 'TEMPORARILY_PAUSED', isOrderableNow: false },
      });
      await h.prisma.restaurant.update({
        where: { id: restaurant.id },
        data: { pausedUntil: new Date(Date.now() - 1000) },
      });
      await expect(h.app.get(RestaurantsService).resumeExpiredPauses()).resolves.toBe(1);
      await h
        .http()
        .get('/api/v1/restaurant/availability')
        .set('Authorization', auth)
        .expect(200)
        .expect((r) => {
          expect(r.body).toMatchObject({ data: { status: 'ONLINE' } });
        });

      await h
        .http()
        .patch(`/api/v1/admin/restaurants/${restaurant.id}`)
        .set('Authorization', admin.auth)
        .send({ status: 'SUSPENDED', reason: 'Policy violation' })
        .expect(200);
      const suspended = await h
        .http()
        .post('/api/v1/restaurant/availability/online')
        .set('Authorization', auth)
        .expect(409);
      expect(error(suspended.body)).toBe('RESTAURANT_SUSPENDED');
      await h
        .http()
        .post('/api/v1/restaurant/availability/offline')
        .set('Authorization', auth)
        .expect(409);
      await expect(
        h.prisma.auditLog.count({ where: { action: 'RESTAURANT_SUSPENDED' } }),
      ).resolves.toBe(1);
      await h.app.get(OutboxProcessor).drain();
    });

    it('is not orderable outside operating hours in the business timezone', async () => {
      const { restaurantId } = await h.restaurant();
      const service = h.app.get(RestaurantsService);
      await h.prisma.restaurantOperatingHours.updateMany({
        where: { restaurantId },
        data: { opensAt: '10:00', closesAt: '22:00' },
      });
      const restaurant = await service.loadForOrdering(restaurantId);
      // 05:30 UTC = 10:30 Asia/Karachi (open); 17:30 UTC = 22:30 (closed).
      expect(service.isOrderable(restaurant, new Date('2026-09-28T05:30:00Z'))).toBe(true);
      expect(service.isOrderable(restaurant, new Date('2026-09-28T17:30:00Z'))).toBe(false);
    });
  });

  describe('staff and tenant isolation', () => {
    it('owner adds an operator who gains operational access only', async () => {
      const { restaurantId, owner } = await h.restaurant();
      const person = await h.actor('CUSTOMER');
      const email = (await h.prisma.user.findUniqueOrThrow({ where: { id: person.userId } })).email;

      await h
        .http()
        .post('/api/v1/restaurant/staff')
        .set('Authorization', owner.auth)
        .send({ email: 'nobody@example.com', role: 'OPERATOR' })
        .expect(404);
      await h
        .http()
        .post('/api/v1/restaurant/staff')
        .set('Authorization', owner.auth)
        .send({ email, role: 'OWNER' })
        .expect(400);
      const added = await h
        .http()
        .post('/api/v1/restaurant/staff')
        .set('Authorization', owner.auth)
        .send({ email, role: 'OPERATOR' })
        .expect(201);
      const staffId = data<{ id: string }>(added.body).id;
      await expect(
        h.prisma.userRole.count({ where: { userId: person.userId, role: 'RESTAURANT_OPERATOR' } }),
      ).resolves.toBe(1);

      // Same token: roles and membership are read from the database on every request.
      const profile = await h
        .http()
        .get('/api/v1/restaurant/profile')
        .set('Authorization', person.auth)
        .expect(200);
      expect(data<{ id: string }>(profile.body).id).toBe(restaurantId);
      await h
        .http()
        .post('/api/v1/restaurant/availability/offline')
        .set('Authorization', person.auth)
        .expect(200);
      const ownerOnly = [
        () =>
          h
            .http()
            .patch('/api/v1/restaurant/profile')
            .set('Authorization', person.auth)
            .send({ description: 'x' }),
        () => h.http().get('/api/v1/restaurant/staff').set('Authorization', person.auth),
        () =>
          h
            .http()
            .patch('/api/v1/restaurant/onboarding/payment')
            .set('Authorization', person.auth)
            .send({ provider: 'X', accountReference: 'Y1234', accountHolderName: 'Z' }),
      ];
      for (const call of ownerOnly) {
        expect((await call()).status).toBe(403);
      }

      const ownerStaff = await h.prisma.restaurantStaff.findFirstOrThrow({
        where: { role: 'OWNER' },
      });
      await h
        .http()
        .delete(`/api/v1/restaurant/staff/${ownerStaff.id}`)
        .set('Authorization', owner.auth)
        .expect(403);

      await h
        .http()
        .delete(`/api/v1/restaurant/staff/${staffId}`)
        .set('Authorization', owner.auth)
        .expect(204);
      await h
        .http()
        .get('/api/v1/restaurant/profile')
        .set('Authorization', person.auth)
        .expect(403);
      await expect(
        h.prisma.auditLog.count({ where: { action: 'RESTAURANT_STAFF_REMOVED' } }),
      ).resolves.toBe(1);
    });

    it('never exposes another restaurant to its staff or to customers', async () => {
      const a = await h.restaurant();
      const b = await h.restaurant();
      const profileA = await h
        .http()
        .get('/api/v1/restaurant/profile')
        .set('Authorization', a.owner.auth)
        .expect(200);
      expect(data<{ id: string }>(profileA.body).id).toBe(a.restaurantId);
      const bEmail = (await h.prisma.user.findUniqueOrThrow({ where: { id: b.owner.userId } }))
        .email;
      const steal = await h
        .http()
        .post('/api/v1/restaurant/staff')
        .set('Authorization', a.owner.auth)
        .send({ email: bEmail, role: 'OPERATOR' })
        .expect(409);
      expect(error(steal.body)).toBe('INVALID_REQUEST');

      const customer = await h.actor('CUSTOMER');
      await h
        .http()
        .get('/api/v1/restaurant/profile')
        .set('Authorization', customer.auth)
        .expect(403);
    });
  });
});
