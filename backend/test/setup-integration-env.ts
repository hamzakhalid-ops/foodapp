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
});
