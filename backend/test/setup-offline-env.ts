import { OFFLINE_TEST_ENV } from './test-env';

// Jest setup file for suites that must not depend on live infrastructure.
Object.assign(process.env, OFFLINE_TEST_ENV);
