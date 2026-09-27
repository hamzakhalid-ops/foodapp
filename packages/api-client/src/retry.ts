import { ApiError } from './errors';

/**
 * Shared retry policy for read queries (TanStack Query `retry` option).
 *
 * - Client errors (4xx) are deterministic: never retried.
 * - Server errors (5xx) and transport failures are retried up to `maxRetries` times.
 *
 * Mutations are not retried automatically; retry-sensitive mutations must reuse their
 * Idempotency-Key when a user retries (API_SPEC §15).
 */
export function shouldRetryQuery(failureCount: number, error: unknown, maxRetries = 2): boolean {
  if (error instanceof ApiError && error.status < 500) return false;
  return failureCount < maxRetries;
}
