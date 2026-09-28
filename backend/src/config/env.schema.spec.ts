import { validateEnv } from './env.schema';

const valid = {
  DATABASE_URL: 'postgresql://user:secret-password@localhost:5432/quickbite',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  AUTH_SECRET_HASH_KEY: 'y'.repeat(32),
  MFA_ENCRYPTION_KEY: 'z'.repeat(32),
};

describe('validateEnv', () => {
  it('applies safe defaults', () => {
    const env = validateEnv(valid);
    expect(env.API_PORT).toBe(3000);
    expect(env.APP_ENV).toBe('development');
    expect(env.API_CORS_ORIGINS).toEqual([]);
    expect(env.SENTRY_DSN).toBe('');
  });

  it('parses comma-separated CORS origins', () => {
    const env = validateEnv({ ...valid, API_CORS_ORIGINS: 'http://a.test, http://b.test' });
    expect(env.API_CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
  });

  it('rejects missing required configuration without echoing values', () => {
    expect(() => validateEnv({ ...valid, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });

  it('rejects a non-PostgreSQL database URL and never includes secrets in the error', () => {
    let message = '';
    try {
      validateEnv({ ...valid, DATABASE_URL: 'mysql://user:secret-password@localhost/db' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain('secret-password');
  });

  it('parses rate-limit rules', () => {
    expect(validateEnv({ ...valid, RATE_LIMIT_LOGIN: '5/60' }).RATE_LIMIT_LOGIN).toEqual({
      max: 5,
      windowSeconds: 60,
    });
    expect(() => validateEnv({ ...valid, RATE_LIMIT_LOGIN: 'lots' })).toThrow(/RATE_LIMIT_LOGIN/);
  });

  it('requires strong auth secrets', () => {
    expect(() => validateEnv({ ...valid, JWT_ACCESS_SECRET: 'short' })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });

  it('refuses the development verification adapter in staging and production', () => {
    for (const APP_ENV of ['staging', 'production']) {
      expect(() => validateEnv({ ...valid, APP_ENV })).toThrow(/VERIFICATION_DELIVERY/);
    }
    expect(validateEnv({ ...valid, APP_ENV: 'development' }).VERIFICATION_DELIVERY).toBe('log');
  });

  it('refuses the sandbox payment provider in staging and production', () => {
    const deployed = {
      ...valid,
      STORAGE_DRIVER: 's3',
      STORAGE_BUCKET_PRIVATE: 'docs',
    };
    for (const APP_ENV of ['staging', 'production']) {
      expect(() => validateEnv({ ...deployed, APP_ENV })).toThrow(/PAYMENT_PROVIDER/);
      expect(() => validateEnv({ ...deployed, APP_ENV })).toThrow(/PAYOUT_PROVIDER/);
    }
    expect(validateEnv({ ...valid, APP_ENV: 'test' }).PAYMENT_PROVIDER).toBe('sandbox');
  });
});
