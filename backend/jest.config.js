/** @type {import('jest').Config} */
const base = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
};

/**
 * Default suites need no external services:
 *   unit — pure logic (src/**\/*.spec.ts)
 *   api  — HTTP behaviour via Supertest against the real Nest app (test/api/**\/*.api-spec.ts)
 * Integration suites (PostgreSQL/Redis) use test/jest-integration.config.js.
 *
 * Scripts run Jest with --experimental-vm-modules because the Prisma 7 runtime loads its query
 * compiler through dynamic import().
 */
module.exports = {
  projects: [
    { ...base, displayName: 'unit', testMatch: ['<rootDir>/src/**/*.spec.ts'] },
    {
      ...base,
      displayName: 'api',
      testMatch: ['<rootDir>/test/api/**/*.api-spec.ts'],
      setupFiles: ['<rootDir>/test/setup-offline-env.ts'],
    },
  ],
};
