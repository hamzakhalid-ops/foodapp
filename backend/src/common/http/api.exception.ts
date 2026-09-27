import { HttpException, type HttpStatus } from '@nestjs/common';
import { type ApiErrorCode } from '@quickbite/types';

/**
 * The only exception type business code should throw for expected failures.
 * `code` must be a documented API error code (docs/api/API_SPEC.md §13).
 */
export class ApiException extends HttpException {
  readonly code: ApiErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    status: HttpStatus,
    code: ApiErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super({ code, message }, status);
    this.code = code;
    this.details = details;
  }
}
