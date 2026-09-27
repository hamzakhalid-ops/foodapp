import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { SentryExceptionCaptured } from '@sentry/nestjs';
import { type ApiErrorCode, type ApiErrorResponse } from '@quickbite/types';
import { type Response } from 'express';
import { ApiException } from './api.exception';
import { getRequestId, type RequestWithContext } from './request-context';

/**
 * Generic HTTP errors raised by the framework (routing, body parsing, guards) are mapped to the
 * closest documented code. Business code must throw ApiException with a specific code instead.
 */
const STATUS_TO_CODE: Partial<Record<number, ApiErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'INVALID_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'AUTH_TOKEN_INVALID',
  [HttpStatus.FORBIDDEN]: 'AUTHZ_FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'RESOURCE_NOT_FOUND',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'INVALID_REQUEST',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'INVALID_REQUEST',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'VALIDATION_ERROR',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
};

const SAFE_MESSAGES: Partial<Record<ApiErrorCode, string>> = {
  INVALID_REQUEST: 'The request is invalid.',
  AUTH_TOKEN_INVALID: 'Authentication is required.',
  AUTHZ_FORBIDDEN: 'You do not have permission to perform this action.',
  RESOURCE_NOT_FOUND: 'The requested resource was not found.',
  VALIDATION_ERROR: 'The request failed validation.',
  RATE_LIMITED: 'Too many requests. Please try again later.',
  INTERNAL_ERROR: 'An unexpected error occurred.',
};

/**
 * Produces the standard error envelope (API_SPEC §11) for every failure and never leaks stack
 * traces, database internals or provider details (CLAUDE.md §31).
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  @SentryExceptionCaptured()
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<RequestWithContext>();
    const requestId = getRequestId(request);

    const { status, code, message, details } = this.describe(exception);

    if (status >= 500) {
      this.logger.error({ err: exception, request_id: requestId, code }, 'Unhandled error');
    }

    const body: ApiErrorResponse = {
      success: false,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
        ...(requestId ? { requestId } : {}),
      },
    };
    response.status(status).json(body);
  }

  private describe(exception: unknown): {
    status: number;
    code: ApiErrorCode;
    message: string;
    details?: Record<string, unknown> | undefined;
  } {
    if (exception instanceof ApiException) {
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = STATUS_TO_CODE[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST');
      return {
        status,
        code,
        message: SAFE_MESSAGES[code] ?? 'The request could not be completed.',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: SAFE_MESSAGES.INTERNAL_ERROR ?? 'An unexpected error occurred.',
    };
  }
}
