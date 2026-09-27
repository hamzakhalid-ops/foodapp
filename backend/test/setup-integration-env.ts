// Jest setup file for integration suites. DATABASE_URL and REDIS_URL must point at real,
// disposable test services (never production — TESTING_SPEC §71).
if (!process.env.DATABASE_URL || !process.env.REDIS_URL) {
  throw new Error('Integration tests require DATABASE_URL and REDIS_URL');
}
Object.assign(process.env, {
  NODE_ENV: 'test',
  APP_ENV: 'test',
  LOG_LEVEL: 'fatal',
  SENTRY_DSN: '',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? 'integration-only-jwt-secret-000000000000',
  AUTH_SECRET_HASH_KEY:
    process.env.AUTH_SECRET_HASH_KEY ?? 'integration-only-hash-key-0000000000000',
  // Small limits so rate limiting is observable; Redis is flushed between tests.
  RATE_LIMIT_LOGIN: '5/60',
  RATE_LIMIT_PASSWORD_RESET: '3/60',
  RATE_LIMIT_OTP_SEND: '3/60',
});
