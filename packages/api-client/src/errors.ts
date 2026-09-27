import { type ApiErrorBody } from '@quickbite/types';

/**
 * Structured API failure. Preserves the backend error body so that screens can map
 * `code` to a user-facing message while keeping `requestId` for support/diagnostics.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;
  readonly requestId: string | undefined;

  constructor(
    status: number,
    body: Pick<ApiErrorBody, 'message'> & {
      code: string;
      details?: Record<string, unknown> | undefined;
      requestId?: string | undefined;
    },
  ) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.details = body.details;
    this.requestId = body.requestId;
  }
}

/** Transport-level failure (no response, invalid JSON, contract mismatch). */
export class ApiTransportError extends Error {
  override readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'ApiTransportError';
    this.cause = cause;
  }
}
