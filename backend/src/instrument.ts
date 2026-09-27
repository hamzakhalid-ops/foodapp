import * as Sentry from '@sentry/nestjs';
import { loadLocalEnvFile } from './config/load-local-env';

/**
 * Process preload: loads local .env (development only) and initializes error tracking
 * (OBSERVABILITY_SPEC §32). Must be imported before any other module.
 * Disabled when SENTRY_DSN is empty (local development, tests).
 *
 * Data collection is restricted explicitly below.
 */
loadLocalEnvFile();

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.APP_ENV ?? 'development',
    release: process.env.APP_VERSION,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0'),
    // Never send credentials, tokens or personal data (CLAUDE.md §32). Request context is
    // correlated through request_id in structured logs instead.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      genAI: { inputs: false, outputs: false },
    },
  });
}
