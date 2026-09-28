import { createHarness, type Harness, newCustomer, PASSWORD } from './auth-harness';

/**
 * Slice 1 — Authentication (docs/IMPLEMENTATION_PLAN.md §6) against real PostgreSQL + Redis.
 * Covers: registration, login, invalid credentials, duplicate account, logout, authentication
 * middleware, role resolution, rate limiting, refresh rotation/reuse, verification and reset.
 */
describe('Slice 1 — Authentication', () => {
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

  interface ErrorBody {
    success: false;
    error: { code: string; message: string; details?: Record<string, unknown>; requestId?: string };
  }
  interface LoginBody {
    success: true;
    data: {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      user: { id: string; status: string; roles: string[] };
    };
  }

  const errorCode = (body: unknown) => (body as ErrorBody).error.code;

  async function register(overrides: Partial<Record<string, string>> = {}) {
    const customer = newCustomer(overrides);
    const response = await h.http().post('/api/v1/auth/register').send(customer).expect(201);
    return { customer, userId: (response.body as { data: { user: { id: string } } }).data.user.id };
  }

  async function login(identifier: string, password = PASSWORD) {
    const response = await h
      .http()
      .post('/api/v1/auth/login')
      .send({ identifier, password })
      .expect(200);
    return (response.body as LoginBody).data;
  }

  async function registerAndLogin() {
    const { customer, userId } = await register();
    const tokens = await login(customer.email);
    return { customer, userId, tokens };
  }

  async function verifyPhone(accessToken: string) {
    await h
      .http()
      .post('/api/v1/auth/verify-phone')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: h.sender.lastPhoneCode() })
      .expect(200);
  }

  // ---------------------------------------------------------------------------------------
  describe('registration', () => {
    it('creates a pending customer with profile, hashed challenges and an audit record', async () => {
      const customer = newCustomer({ email: '  Mixed.Case@Example.COM ' });
      const response = await h.http().post('/api/v1/auth/register').send(customer).expect(201);

      const body = response.body as {
        data: { user: Record<string, unknown>; verification: unknown };
      };
      expect(body.data.user).toEqual({
        id: expect.any(String) as string,
        email: 'mixed.case@example.com',
        phone: customer.phone,
        roles: ['CUSTOMER'],
        status: 'PENDING_VERIFICATION',
      });
      expect(body.data.verification).toEqual({ phoneRequired: true, emailRequired: true });
      expect(JSON.stringify(body)).not.toMatch(/password|hash/i);

      const userId = body.data.user.id as string;
      const user = await h.prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user.passwordHash.startsWith('$argon2id$')).toBe(true);
      await expect(
        h.prisma.customerProfile.findUnique({ where: { userId } }),
      ).resolves.toMatchObject({
        firstName: 'Ali',
        lastName: 'Khan',
      });

      const challenges = await h.prisma.verificationChallenge.findMany({ where: { userId } });
      expect(challenges.map((c) => c.type).sort()).toEqual([
        'EMAIL_VERIFICATION',
        'PHONE_VERIFICATION',
      ]);
      const code = h.sender.lastPhoneCode();
      const emailToken = h.sender.emailTokens[0]?.token ?? '';
      for (const challenge of challenges) {
        expect(challenge.secretHash).not.toContain(code);
        expect(challenge.secretHash).not.toContain(emailToken);
      }

      const audit = await h.prisma.auditLog.findMany({ where: { entityId: userId } });
      expect(audit.map((a) => a.action)).toContain('USER_REGISTERED');
    });

    it.each([
      [
        'email in a different case',
        (c: { email: string; phone: string }) => ({ email: c.email.toUpperCase() }),
      ],
      [
        'phone in a different format',
        (c: { email: string; phone: string }) => ({
          phone: c.phone.replace('+92', '0092 ').replace(/(\d{3})$/, '-$1'),
        }),
      ],
    ])(
      'rejects a duplicate account (%s) without saying which field matched',
      async (_label, variant) => {
        const { customer } = await register();
        const duplicate = { ...newCustomer(), ...variant(customer) };
        const response = await h.http().post('/api/v1/auth/register').send(duplicate).expect(409);
        expect(response.body).toMatchObject({
          success: false,
          error: {
            code: 'AUTH_ACCOUNT_ALREADY_EXISTS',
            message: 'An account with these details already exists.',
          },
        });
      },
    );

    it('allows exactly one of two concurrent registrations with the same email', async () => {
      const customer = newCustomer();
      const [a, b] = await Promise.all([
        h.http().post('/api/v1/auth/register').send(customer),
        h
          .http()
          .post('/api/v1/auth/register')
          .send({ ...customer, phone: newCustomer().phone }),
      ]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
      await expect(h.prisma.user.count()).resolves.toBe(1);
    });

    it('enforces the password policy', async () => {
      const response = await h
        .http()
        .post('/api/v1/auth/register')
        .send(newCustomer({ password: 'short' }))
        .expect(400);
      expect(errorCode(response.body)).toBe('AUTH_PASSWORD_POLICY_VIOLATION');
      await expect(h.prisma.user.count()).resolves.toBe(0);
    });

    it('rejects invalid input with field-level validation errors and no echoed values', async () => {
      const response = await h
        .http()
        .post('/api/v1/auth/register')
        .send(newCustomer({ phone: '03001234567' }))
        .expect(400);
      expect(response.body).toMatchObject({
        error: {
          code: 'VALIDATION_ERROR',
          details: { fields: { phone: expect.any(String) as string } },
        },
      });
      expect(JSON.stringify(response.body)).not.toContain('03001234567');
    });
  });

  // ---------------------------------------------------------------------------------------
  describe('login', () => {
    it('logs in with email or a differently formatted phone number', async () => {
      const { customer, userId } = await register();
      const byEmail = await login(customer.email.toUpperCase());
      const byPhone = await login(customer.phone.replace('+92', '+92 ').replace(/(\d{4})$/, ' $1'));

      for (const result of [byEmail, byPhone]) {
        expect(result.expiresIn).toBe(900);
        expect(result.user).toMatchObject({
          id: userId,
          roles: ['CUSTOMER'],
          status: 'PENDING_VERIFICATION',
        });
        expect(result.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      }
      await expect(h.prisma.userSession.count({ where: { userId } })).resolves.toBe(2);
    });

    it('returns an identical error for a wrong password and an unknown account', async () => {
      const { customer } = await register();
      const wrong = await h
        .http()
        .post('/api/v1/auth/login')
        .send({ identifier: customer.email, password: 'wrong password!' })
        .expect(401);
      const unknown = await h
        .http()
        .post('/api/v1/auth/login')
        .send({ identifier: 'nobody@example.com', password: 'wrong password!' })
        .expect(401);

      const strip = (body: unknown) => ({ ...(body as ErrorBody).error, requestId: undefined });
      expect(strip(wrong.body)).toEqual(strip(unknown.body));
      expect(errorCode(wrong.body)).toBe('AUTH_INVALID_CREDENTIALS');

      const failures = await h.prisma.auditLog.findMany({ where: { action: 'LOGIN_FAILURE' } });
      expect(failures).toHaveLength(2);
      expect(JSON.stringify(failures)).not.toContain('wrong password!');
    });

    it.each([
      ['SUSPENDED', 'AUTH_ACCOUNT_SUSPENDED'],
      ['DEACTIVATED', 'AUTH_ACCOUNT_DISABLED'],
    ] as const)('refuses %s accounts after verifying the password', async (status, code) => {
      const { customer, userId } = await register();
      await h.prisma.user.update({ where: { id: userId }, data: { status } });
      const response = await h
        .http()
        .post('/api/v1/auth/login')
        .send({ identifier: customer.email, password: PASSWORD })
        .expect(403);
      expect(errorCode(response.body)).toBe(code);
      await expect(h.prisma.userSession.count()).resolves.toBe(0);
    });

    it('rate limits login attempts per identifier and returns Retry-After', async () => {
      const { customer } = await register();
      for (let i = 0; i < 5; i += 1) {
        await h
          .http()
          .post('/api/v1/auth/login')
          .send({ identifier: customer.email, password: 'wrong password!' })
          .expect(401);
      }
      const limited = await h
        .http()
        .post('/api/v1/auth/login')
        .send({ identifier: customer.email, password: PASSWORD })
        .expect(429);
      expect(errorCode(limited.body)).toBe('RATE_LIMITED');
      expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------------------
  describe('authentication middleware and roles', () => {
    it('returns the current user for a valid session (pending accounts included)', async () => {
      const { tokens, userId } = await registerAndLogin();
      const response = await h
        .http()
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(200);
      expect(response.body).toMatchObject({
        success: true,
        data: { id: userId, status: 'PENDING_VERIFICATION' },
      });
    });

    it.each([
      ['no header', undefined],
      ['a malformed token', 'Bearer not-a-jwt'],
      ['a non-bearer scheme', 'Basic dXNlcjpwYXNz'],
    ])('rejects %s with 401', async (_label, header) => {
      const call = h.http().get('/api/v1/me');
      const response = await (header ? call.set('Authorization', header) : call).expect(401);
      expect(errorCode(response.body)).toBe('AUTH_TOKEN_INVALID');
    });

    it('blocks unverified accounts from routes that require verification', async () => {
      const { tokens } = await registerAndLogin();
      const blocked = await h
        .http()
        .get('/api/v1/__test__/verified')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(403);
      expect(errorCode(blocked.body)).toBe('AUTH_PHONE_NOT_VERIFIED');

      await verifyPhone(tokens.accessToken);
      await h
        .http()
        .get('/api/v1/__test__/verified')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(200);
    });

    it('resolves roles from the database on every request', async () => {
      const { tokens, userId } = await registerAndLogin();
      await verifyPhone(tokens.accessToken);
      const auth = `Bearer ${tokens.accessToken}`;

      const denied = await h
        .http()
        .get('/api/v1/__test__/admin')
        .set('Authorization', auth)
        .expect(403);
      expect(errorCode(denied.body)).toBe('AUTHZ_INSUFFICIENT_PERMISSION');

      await h.prisma.userRole.create({ data: { userId, role: 'ADMIN' } });
      // The new role is seen immediately; admin routes then also require MFA (ADR-0014 §8).
      const mfa = await h
        .http()
        .get('/api/v1/__test__/admin')
        .set('Authorization', auth)
        .expect(403);
      expect(errorCode(mfa.body)).toBe('AUTH_MFA_REQUIRED');
      await h.prisma.userSession.updateMany({
        where: { userId },
        data: { mfaVerifiedAt: new Date() },
      });
      await h.http().get('/api/v1/__test__/admin').set('Authorization', auth).expect(200);
    });

    it('applies suspension immediately to existing sessions', async () => {
      const { tokens, userId } = await registerAndLogin();
      await h.prisma.user.update({ where: { id: userId }, data: { status: 'SUSPENDED' } });
      const response = await h
        .http()
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(403);
      expect(errorCode(response.body)).toBe('AUTH_ACCOUNT_SUSPENDED');
    });
  });

  // ---------------------------------------------------------------------------------------
  describe('logout and refresh', () => {
    it('logout revokes the session: access and refresh tokens stop working', async () => {
      const { tokens } = await registerAndLogin();
      const auth = `Bearer ${tokens.accessToken}`;
      await h.http().post('/api/v1/auth/logout').set('Authorization', auth).expect(204);

      await h.http().get('/api/v1/me').set('Authorization', auth).expect(401);
      const refresh = await h
        .http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(401);
      expect(errorCode(refresh.body)).toBe('AUTH_REFRESH_TOKEN_INVALID');
      await expect(h.prisma.auditLog.count({ where: { action: 'LOGOUT' } })).resolves.toBe(1);
    });

    it('rotates refresh tokens and detects reuse by revoking the whole session', async () => {
      const { tokens } = await registerAndLogin();
      const first = await h
        .http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(200);
      const rotated = (first.body as { data: { accessToken: string; refreshToken: string } }).data;
      expect(rotated.refreshToken).not.toBe(tokens.refreshToken);
      await h
        .http()
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${rotated.accessToken}`)
        .expect(200);

      // Reusing the old token = potential compromise (AUTH_AUTHORIZATION §25).
      await h
        .http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(401);
      await h
        .http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: rotated.refreshToken })
        .expect(401);
      await h
        .http()
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${rotated.accessToken}`)
        .expect(401);

      const session = await h.prisma.userSession.findFirstOrThrow();
      expect(session.revokedReason).toBe('REFRESH_TOKEN_REUSE');
      await expect(
        h.prisma.auditLog.count({ where: { action: 'REFRESH_TOKEN_REUSE_DETECTED' } }),
      ).resolves.toBe(1);
    });

    it('never lets the same refresh token succeed twice under concurrency', async () => {
      const { tokens } = await registerAndLogin();
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          h.http().post('/api/v1/auth/refresh').send({ refreshToken: tokens.refreshToken }),
        ),
      );
      expect(results.filter((r) => r.status === 200).length).toBeLessThanOrEqual(1);
      await expect(
        h.prisma.refreshToken.count({ where: { usedAt: null, session: { revokedAt: null } } }),
      ).resolves.toBeLessThanOrEqual(1);
    });

    it('rejects refresh after the session reached its maximum lifetime', async () => {
      const { tokens } = await registerAndLogin();
      await h.prisma.userSession.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
      await h
        .http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(401);
      await h
        .http()
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------------------
  describe('phone and email verification', () => {
    it('activates the account on phone verification (DATABASE.md §5.3)', async () => {
      const { tokens, userId } = await registerAndLogin();
      const response = await h
        .http()
        .post('/api/v1/auth/verify-phone')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .send({ code: h.sender.lastPhoneCode() })
        .expect(200);
      expect(response.body).toMatchObject({ data: { status: 'ACTIVE' } });

      const user = await h.prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user.phoneVerifiedAt).not.toBeNull();
      await expect(
        h.prisma.auditLog.count({ where: { action: 'PHONE_VERIFIED', entityId: userId } }),
      ).resolves.toBe(1);
    });

    it('limits attempts per code and requires a new code afterwards', async () => {
      const { tokens } = await registerAndLogin();
      const auth = `Bearer ${tokens.accessToken}`;
      const correct = h.sender.lastPhoneCode();
      const wrong = correct === '000000' ? '111111' : '000000';

      for (let i = 0; i < 4; i += 1) {
        const r = await h
          .http()
          .post('/api/v1/auth/verify-phone')
          .set('Authorization', auth)
          .send({ code: wrong })
          .expect(400);
        expect(errorCode(r.body)).toBe('AUTH_VERIFICATION_CODE_INVALID');
      }
      const fifth = await h
        .http()
        .post('/api/v1/auth/verify-phone')
        .set('Authorization', auth)
        .send({ code: wrong })
        .expect(429);
      expect(errorCode(fifth.body)).toBe('AUTH_TOO_MANY_ATTEMPTS');
      await h
        .http()
        .post('/api/v1/auth/verify-phone')
        .set('Authorization', auth)
        .send({ code: correct })
        .expect(429);

      await h
        .http()
        .post('/api/v1/auth/verify-phone/resend')
        .set('Authorization', auth)
        .expect(202);
      const fresh = h.sender.lastPhoneCode();
      await h
        .http()
        .post('/api/v1/auth/verify-phone')
        .set('Authorization', auth)
        .send({ code: fresh })
        .expect(200);
    });

    it('invalidates the previous code when a new one is sent', async () => {
      const { tokens } = await registerAndLogin();
      const auth = `Bearer ${tokens.accessToken}`;
      const first = h.sender.lastPhoneCode();
      await h
        .http()
        .post('/api/v1/auth/verify-phone/resend')
        .set('Authorization', auth)
        .expect(202);
      const second = h.sender.lastPhoneCode();
      if (first !== second) {
        await h
          .http()
          .post('/api/v1/auth/verify-phone')
          .set('Authorization', auth)
          .send({ code: first })
          .expect(400);
      }
      await h
        .http()
        .post('/api/v1/auth/verify-phone')
        .set('Authorization', auth)
        .send({ code: second })
        .expect(200);
    });

    it('rejects an expired code', async () => {
      const { tokens } = await registerAndLogin();
      await h.prisma.verificationChallenge.updateMany({
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const response = await h
        .http()
        .post('/api/v1/auth/verify-phone')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .send({ code: h.sender.lastPhoneCode() })
        .expect(400);
      expect(errorCode(response.body)).toBe('AUTH_VERIFICATION_CODE_EXPIRED');
    });

    it('rate limits code resends', async () => {
      const { tokens } = await registerAndLogin();
      const auth = `Bearer ${tokens.accessToken}`;
      for (let i = 0; i < 3; i += 1) {
        await h
          .http()
          .post('/api/v1/auth/verify-phone/resend')
          .set('Authorization', auth)
          .expect(202);
      }
      await h
        .http()
        .post('/api/v1/auth/verify-phone/resend')
        .set('Authorization', auth)
        .expect(429);
    });

    it('verifies email with a single-use token without changing account status', async () => {
      const { userId } = await register();
      const token = h.sender.emailTokens[0]?.token ?? '';
      await h.http().post('/api/v1/auth/verify-email').send({ token }).expect(204);

      const user = await h.prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user.emailVerifiedAt).not.toBeNull();
      expect(user.status).toBe('PENDING_VERIFICATION');

      const reuse = await h.http().post('/api/v1/auth/verify-email').send({ token }).expect(400);
      expect(errorCode(reuse.body)).toBe('AUTH_VERIFICATION_CODE_INVALID');
    });
  });

  // ---------------------------------------------------------------------------------------
  describe('password reset', () => {
    it('responds identically for unknown and known accounts', async () => {
      const { customer } = await register();
      h.sender.clear();
      const unknown = await h
        .http()
        .post('/api/v1/auth/forgot-password')
        .send({ identifier: 'nobody@example.com' })
        .expect(202);
      const known = await h
        .http()
        .post('/api/v1/auth/forgot-password')
        .send({ identifier: customer.email })
        .expect(202);
      expect(unknown.body).toEqual(known.body);
      expect(h.sender.resetTokens).toEqual([
        { channel: 'email', target: customer.email, token: expect.any(String) as string },
      ]);
    });

    it('delivers phone-identified resets to the phone', async () => {
      const { customer } = await register();
      await h
        .http()
        .post('/api/v1/auth/forgot-password')
        .send({ identifier: customer.phone })
        .expect(202);
      expect(h.sender.resetTokens.at(-1)).toMatchObject({
        channel: 'phone',
        target: customer.phone,
      });
    });

    it('resets the password, revokes every session and is single-use', async () => {
      const { customer, tokens } = await registerAndLogin();
      await h
        .http()
        .post('/api/v1/auth/forgot-password')
        .send({ identifier: customer.email })
        .expect(202);
      const token = h.sender.resetTokens.at(-1)?.token ?? '';

      const weak = await h
        .http()
        .post('/api/v1/auth/reset-password')
        .send({ token, newPassword: 'short' })
        .expect(400);
      expect(errorCode(weak.body)).toBe('AUTH_PASSWORD_POLICY_VIOLATION');

      await h
        .http()
        .post('/api/v1/auth/reset-password')
        .send({ token, newPassword: 'a brand new passphrase' })
        .expect(204);
      await h
        .http()
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(401);
      await h
        .http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(401);

      await h
        .http()
        .post('/api/v1/auth/login')
        .send({ identifier: customer.email, password: PASSWORD })
        .expect(401);
      await login(customer.email, 'a brand new passphrase');

      const reuse = await h
        .http()
        .post('/api/v1/auth/reset-password')
        .send({ token, newPassword: 'yet another passphrase' })
        .expect(400);
      expect(errorCode(reuse.body)).toBe('AUTH_PASSWORD_RESET_INVALID');
    });

    it('rejects expired reset tokens', async () => {
      const { customer } = await register();
      await h
        .http()
        .post('/api/v1/auth/forgot-password')
        .send({ identifier: customer.email })
        .expect(202);
      await h.prisma.verificationChallenge.updateMany({
        where: { type: 'PASSWORD_RESET' },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const response = await h
        .http()
        .post('/api/v1/auth/reset-password')
        .send({ token: h.sender.resetTokens.at(-1)?.token, newPassword: 'a brand new passphrase' })
        .expect(400);
      expect(errorCode(response.body)).toBe('AUTH_PASSWORD_RESET_INVALID');
    });

    it('rate limits reset requests per identifier', async () => {
      const { customer } = await register();
      for (let i = 0; i < 3; i += 1) {
        await h
          .http()
          .post('/api/v1/auth/forgot-password')
          .send({ identifier: customer.email })
          .expect(202);
      }
      await h
        .http()
        .post('/api/v1/auth/forgot-password')
        .send({ identifier: customer.email })
        .expect(429);
    });
  });

  // ---------------------------------------------------------------------------------------
  it('never stores secrets in the audit trail', async () => {
    const { customer, tokens } = await registerAndLogin();
    await verifyPhone(tokens.accessToken);
    await h
      .http()
      .post('/api/v1/auth/forgot-password')
      .send({ identifier: customer.email })
      .expect(202);

    const audit = JSON.stringify(await h.prisma.auditLog.findMany());
    const secrets = [
      PASSWORD,
      tokens.accessToken,
      tokens.refreshToken,
      ...h.sender.phoneCodes.map((c) => c.code),
      ...h.sender.emailTokens.map((t) => t.token),
      ...h.sender.resetTokens.map((t) => t.token),
    ];
    for (const secret of secrets) expect(audit).not.toContain(secret);
  });
});
