/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/src'],
  setupFiles: ['<rootDir>/jest.setup.ts'],
  setupFilesAfterEnv: ['<rootDir>/jest.after-env.ts'],
  // Screen suites import the whole app; a cold (uncached) run can exceed the 5 s default on the
  // first test, which then leaks fake timers into the tests after it.
  testTimeout: 60000,
};
