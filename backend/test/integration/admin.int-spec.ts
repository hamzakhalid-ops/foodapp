import { currentStep, totpAt } from '../../src/common/security/totp';
import { type Actor, createHarness, type Harness } from './auth-harness';
import { orderFixtures } from './order-fixtures';

/** Slice 18 — admin operations and admin MFA (API_SPEC §93–95, §100, §107–108, ADR-0014 §8). */
describe('Slice 16 — admin operations and MFA', () => {
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
  const reason = (body: unknown) =>
    (body as { error: { details?: { reason?: string } } }).error.details?.reason;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- typed view of a response envelope in tests
  const data = <T>(body: unknown) => (body as { data: T }).data;
  const get = (actor: Actor, url: string) =>
    h.http().get(`/api/v1${url}`).set('Authorization', actor.auth);
  const post = (actor: Actor, url: string, body: object = {}) =>
    h.http().post(`/api/v1${url}`).set('Authorization', actor.auth).send(body);
  const patch = (actor: Actor, url: string, body: object) =>
    h.http().patch(`/api/v1${url}`).set('Authorization', actor.auth).send(body);

  async function unverified(role: 'ADMIN' | 'SUPER_ADMIN') {
    const actor = await h.actor(role);
    await h.prisma.userSession.updateMany({
      where: { userId: actor.userId },
      data: { mfaVerifiedAt: null },
    });
    return actor;
  }

  describe('MFA', () => {
    it('blocks admin routes until TOTP is enrolled and verified on the session', async () => {
      const admin = await unverified('SUPER_ADMIN');
      const blocked = await get(admin, '/admin/dashboard').expect(403);
      expect(error(blocked.body)).toBe('AUTH_MFA_REQUIRED');
      // Shared routes do not grant admin reach either: someone else's order is invisible.
      const { orderId } = await f.placeOrder();
      await get(admin, `/orders/${orderId}`).expect(404);

      const status = await get(admin, '/auth/mfa').expect(200);
      expect(data(status.body)).toEqual({ enrolled: false, verifiedAt: null });
      const notEnrolled = await post(admin, '/auth/mfa/verify', { code: '123456' }).expect(403);
      expect(reason(notEnrolled.body)).toBe('MFA_NOT_ENROLLED');

      const setup = data<{ secret: string; otpauthUrl: string }>(
        (await post(admin, '/auth/mfa/totp/setup').expect(201)).body,
      );
      expect(setup.otpauthUrl).toMatch(/^otpauth:\/\/totp\/QuickBite%3A.+\?secret=/);
      const stored = await h.prisma.userMfaFactor.findUniqueOrThrow({
        where: { userId: admin.userId },
      });
      expect(stored.secretEncrypted).not.toContain(setup.secret);

      const wrong = totpAt(setup.secret, currentStep() + 5);
      const invalid = await post(admin, '/auth/mfa/totp/confirm', { code: wrong }).expect(401);
      expect(error(invalid.body)).toBe('AUTH_MFA_INVALID');
      const code = totpAt(setup.secret, currentStep());
      const confirmed = await post(admin, '/auth/mfa/totp/confirm', { code }).expect(200);
      const confirmedStatus = data<{ enrolled: boolean; verifiedAt: string | null }>(
        confirmed.body,
      );
      expect(confirmedStatus.enrolled).toBe(true);
      expect(confirmedStatus.verifiedAt).not.toBeNull();
      await get(admin, '/admin/dashboard').expect(200);

      // A code is single-use, and enrolment cannot be silently replaced.
      await post(admin, '/auth/mfa/verify', { code }).expect(401);
      await post(admin, '/auth/mfa/totp/setup').expect(409);
      expect(
        (await h.prisma.auditLog.findMany({ where: { actorUserId: admin.userId } })).map(
          (row) => row.action,
        ),
      ).toEqual(expect.arrayContaining(['MFA_FAILED', 'MFA_ENABLED']));

      // Step-up: an older verification still opens admin pages but not sensitive changes.
      await h.prisma.userSession.updateMany({
        where: { userId: admin.userId },
        data: { mfaVerifiedAt: new Date(Date.now() - 10 * 60_000) },
      });
      await get(admin, '/admin/dashboard').expect(200);
      const change = { value: '99', reason: 'Fuel prices' };
      const stale = await patch(admin, '/admin/configuration/pricing.delivery_fee', change).expect(
        403,
      );
      expect(reason(stale.body)).toBe('STEP_UP_REQUIRED');
      await post(admin, '/auth/mfa/verify', {
        code: totpAt(setup.secret, currentStep() + 1),
      }).expect(200);
      await patch(admin, '/admin/configuration/pricing.delivery_fee', change).expect(200);

      // Lost authenticator: another super admin resets it; the session loses MFA.
      const other = await h.actor('SUPER_ADMIN');
      await post(other, `/admin/users/${admin.userId}/mfa/reset`).expect(204);
      await get(admin, '/admin/dashboard').expect(403);
      expect(await h.prisma.auditLog.count({ where: { action: 'MFA_DISABLED' } })).toBe(1);
    });

    it('keeps MFA endpoints admin-only', async () => {
      const customer = await h.actor('CUSTOMER');
      await post(customer, '/auth/mfa/totp/setup').expect(403);
      const admin = await h.actor('ADMIN');
      await post(admin, `/admin/users/${customer.userId}/mfa/reset`).expect(403);
    });
  });

  describe('configuration', () => {
    it('lists settings and lets only a super admin change them, validated and audited', async () => {
      const admin = await h.actor('ADMIN');
      const superAdmin = await h.actor('SUPER_ADMIN');
      const list = data<{ key: string; value: unknown }[]>(
        (await get(admin, '/admin/configuration').expect(200)).body,
      );
      expect(list.map((entry) => entry.key)).toEqual(
        expect.arrayContaining(['pricing.delivery_fee', 'finance.commission_percent']),
      );
      expect(list.find((entry) => entry.key === 'pricing.delivery_fee')?.value).toBeNull();

      const url = '/admin/configuration/finance.commission_percent';
      await patch(admin, url, { value: '15', reason: 'Launch rate' }).expect(403);
      await patch(superAdmin, url, { value: '150', reason: 'Typo' }).expect(400);
      await patch(superAdmin, url, { value: '15' }).expect(400);
      await patch(superAdmin, '/admin/configuration/unknown.key', {
        value: '1',
        reason: 'x',
      }).expect(404);
      const saved = await patch(superAdmin, url, { value: '15', reason: 'Launch rate' }).expect(
        200,
      );
      expect(data(saved.body)).toMatchObject({ value: '15', updatedBy: superAdmin.userId });
      const entry = await get(admin, url).expect(200);
      expect(data(entry.body)).toMatchObject({ key: 'finance.commission_percent', value: '15' });

      const audit = await h.prisma.auditLog.findFirstOrThrow({
        where: { action: 'CONFIGURATION_CHANGED' },
      });
      expect(audit).toMatchObject({
        actorUserId: superAdmin.userId,
        oldValues: { key: 'finance.commission_percent', value: null },
        newValues: { key: 'finance.commission_percent', value: '15' },
      });
    });

    it('manages the dispatch settings row', async () => {
      const superAdmin = await h.actor('SUPER_ADMIN');
      await get(superAdmin, '/admin/dispatch-settings').expect(404);
      const values = {
        initialRadius: 2,
        radiusIncrement: 1.5,
        maximumRadius: 8,
        offerTimeoutSeconds: 45,
        maxOfferAttempts: 4,
        locationMaxAgeSeconds: 120,
      };
      const put = (body: object) =>
        h
          .http()
          .put('/api/v1/admin/dispatch-settings')
          .set('Authorization', superAdmin.auth)
          .send(body);
      await put({ ...values, initialRadius: 9, reason: 'x' }).expect(400);
      await put({ ...values, reason: 'Initial rollout' }).expect(200);
      await put({ ...values, maxOfferAttempts: 6, reason: 'More attempts' }).expect(200);
      expect(data((await get(superAdmin, '/admin/dispatch-settings').expect(200)).body)).toEqual({
        ...values,
        maxOfferAttempts: 6,
      });
      expect(await h.prisma.dispatchSettings.count()).toBe(1);
      expect(
        await h.prisma.auditLog.count({ where: { action: 'DISPATCH_SETTINGS_CHANGED' } }),
      ).toBe(2);
    });
  });

  describe('operations', () => {
    it('lists and filters orders, customers and audit logs, and builds the dashboard', async () => {
      const admin = await h.actor('ADMIN');
      const first = await f.placeOrder();
      const second = await f.placeOrder();

      const byRestaurant = await get(
        admin,
        `/admin/orders?restaurantId=${first.restaurant.restaurantId}`,
      ).expect(200);
      expect(data<{ id: string }[]>(byRestaurant.body).map((row) => row.id)).toEqual([
        first.orderId,
      ]);
      const search = await get(admin, `/admin/orders?search=${second.orderNumber}`).expect(200);
      expect(data<{ id: string }[]>(search.body).map((row) => row.id)).toEqual([second.orderId]);
      const paged = await get(admin, '/admin/orders?limit=1').expect(200);
      expect(data<unknown[]>(paged.body)).toHaveLength(1);
      expect(
        (paged.body as { meta: { pagination: { hasMore: boolean } } }).meta.pagination.hasMore,
      ).toBe(true);
      const detail = await get(admin, `/admin/orders/${first.orderId}`).expect(200);
      expect(data(detail.body)).toMatchObject({ id: first.orderId, status: 'PENDING' });

      const customers = await get(admin, '/admin/customers').expect(200);
      expect(data<unknown[]>(customers.body)).toHaveLength(2);
      const customer = await get(admin, `/admin/customers/${first.customer.userId}`).expect(200);
      expect(data(customer.body)).toMatchObject({
        id: first.customer.userId,
        orderCount: 1,
        deliveredOrderCount: 0,
        activeRiskRestrictions: [],
      });
      await get(admin, `/admin/customers/${admin.userId}`).expect(404);

      const dashboard = data<{ orders: { today: number; active: number }; currency: string }>(
        (await get(admin, '/admin/dashboard').expect(200)).body,
      );
      expect(dashboard).toMatchObject({ currency: 'PKR', orders: { today: 2, active: 2 } });

      const logs = await get(admin, '/admin/audit-logs?action=USER_REGISTERED').expect(200);
      expect(Array.isArray(data(logs.body))).toBe(true);
      const any = await h.prisma.auditLog.create({
        data: { action: 'LOGIN_SUCCESS', actorUserId: admin.userId },
      });
      const one = await get(admin, `/admin/audit-logs/${any.id}`).expect(200);
      expect(data(one.body)).toMatchObject({ id: any.id, action: 'LOGIN_SUCCESS' });
      const filtered = await get(admin, `/admin/audit-logs?actorUserId=${admin.userId}`).expect(
        200,
      );
      expect(data<{ id: string }[]>(filtered.body).map((row) => row.id)).toContain(any.id);

      const customerActor = first.customer;
      await get(customerActor, '/admin/orders').expect(403);
      await get(customerActor, '/admin/audit-logs').expect(403);
    });
  });
});
