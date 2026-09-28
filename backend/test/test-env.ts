/**
 * Minimal, non-secret configuration for tests that do not need live infrastructure.
 * Points at unreachable ports so accidental real connections fail fast instead of hanging.
 */
export const OFFLINE_TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  APP_ENV: 'test',
  DATABASE_URL: 'postgresql://quickbite:quickbite@127.0.0.1:1/quickbite_test',
  REDIS_URL: 'redis://127.0.0.1:1',
  LOG_LEVEL: 'fatal',
  SENTRY_DSN: '',
  JWT_ACCESS_SECRET: 'test-only-jwt-secret-000000000000000000000000',
  AUTH_SECRET_HASH_KEY: 'test-only-hash-key-0000000000000000000000000',
  MFA_ENCRYPTION_KEY: 'test-only-mfa-key-00000000000000000000000000',
};
