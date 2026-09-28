import { applyDecorators, SetMetadata, UseInterceptors } from '@nestjs/common';
import { IdempotencyInterceptor } from './idempotency.interceptor';

export const IDEMPOTENT_KEY = 'quickbite:idempotent';

/**
 * Requires an `Idempotency-Key` header and replays the stored response for retries of the same
 * request (API_SPEC §15, DATABASE.md §61). Use on retry-sensitive, authenticated routes.
 */
export const Idempotent = () =>
  applyDecorators(SetMetadata(IDEMPOTENT_KEY, true), UseInterceptors(IdempotencyInterceptor));
