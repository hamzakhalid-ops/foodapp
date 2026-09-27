/**
 * Integration tests against real PostgreSQL and Redis (TESTING_SPEC §6–8).
 * Requires DATABASE_URL and REDIS_URL — locally via infrastructure/local/docker-compose.yml,
 * in CI via service containers.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '..',
  displayName: 'integration',
  testMatch: ['<rootDir>/test/integration/**/*.int-spec.ts'],
  setupFiles: ['<rootDir>/test/setup-integration-env.ts'],
};
