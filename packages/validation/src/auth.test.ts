import {
  currentUserSchema,
  loginRequestSchema,
  registerRequestSchema,
  verifyPhoneRequestSchema,
} from './auth';

describe('auth request schemas', () => {
  it('trims and accepts a well-formed registration', () => {
    const parsed = registerRequestSchema.parse({
      email: '  Customer@Example.com ',
      phone: '+923001234567',
      password: 'correct horse battery',
      firstName: ' Ali ',
      lastName: 'Khan',
    });
    expect(parsed.email).toBe('Customer@Example.com');
    expect(parsed.firstName).toBe('Ali');
  });

  it('rejects malformed email and blank names', () => {
    const result = registerRequestSchema.safeParse({
      email: 'not-an-email',
      phone: '+923001234567',
      password: 'x',
      firstName: '   ',
      lastName: 'Khan',
    });
    expect(result.success).toBe(false);
  });

  it('does not trim passwords', () => {
    expect(loginRequestSchema.parse({ identifier: 'a@b.co', password: ' pw ' }).password).toBe(
      ' pw ',
    );
  });

  it('requires a 6-digit phone code', () => {
    expect(verifyPhoneRequestSchema.safeParse({ code: '12345' }).success).toBe(false);
    expect(verifyPhoneRequestSchema.safeParse({ code: '123456' }).success).toBe(true);
  });

  it('only accepts frozen roles and statuses in the current user payload', () => {
    const base = {
      id: '4f0c1c1e-8f7e-4b8a-9f3e-2b1c0d9e8a7b',
      email: null,
      phone: null,
      status: 'ACTIVE',
    };
    expect(currentUserSchema.safeParse({ ...base, roles: ['CUSTOMER'] }).success).toBe(true);
    expect(currentUserSchema.safeParse({ ...base, roles: ['KITCHEN_STAFF'] }).success).toBe(false);
  });
});
