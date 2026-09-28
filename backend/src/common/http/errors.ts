import { HttpStatus } from '@nestjs/common';
import { type ApiErrorCode } from '@quickbite/types';
import { ApiException } from './api.exception';

/**
 * Resources the caller may not access are reported as not found (API enumeration protection,
 * AUTH_AUTHORIZATION §83).
 */
export function notFound(
  code: ApiErrorCode = 'RESOURCE_NOT_FOUND',
  message = 'The requested resource was not found.',
) {
  return new ApiException(HttpStatus.NOT_FOUND, code, message);
}

export function conflict(code: ApiErrorCode, message: string, details?: Record<string, unknown>) {
  return new ApiException(HttpStatus.CONFLICT, code, message, details);
}

export function unprocessable(
  code: ApiErrorCode,
  message: string,
  details?: Record<string, unknown>,
) {
  return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, code, message, details);
}

export function forbidden(
  code: ApiErrorCode = 'AUTHZ_FORBIDDEN',
  message = 'You do not have permission to perform this action.',
) {
  return new ApiException(HttpStatus.FORBIDDEN, code, message);
}

export function validationError(fields: Record<string, string>) {
  return new ApiException(
    HttpStatus.BAD_REQUEST,
    'VALIDATION_ERROR',
    'The request failed validation.',
    { fields },
  );
}
