import { validateEnv } from './env.schema';

const valid = {
  DATABASE_URL: 'postgresql://user:secret-password@localhost:5432/quickbite',
  REDIS_URL: 'redis://localhost:6379',
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
    expect(() => validateEnv({ REDIS_URL: 'redis://localhost:6379' })).toThrow(/DATABASE_URL/);
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
});
