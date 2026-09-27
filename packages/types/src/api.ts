/**
 * Common API contract types.
 *
 * Source: docs/api/API_SPEC.md §8–15.
 */

/** Header carrying the per-request identifier (API_SPEC §14). */
export const REQUEST_ID_HEADER = 'X-Request-ID';

/** Header carrying the idempotency key for retry-sensitive operations (API_SPEC §15). */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

/**
 * Header carrying the workflow correlation identifier (OBSERVABILITY_SPEC §6).
 * The header name is not fixed by the specifications; see REPOSITORY_CONSISTENCY_REPORT.
 */
export const CORRELATION_ID_HEADER = 'X-Correlation-ID';

/** Public API base path (API_SPEC §3). */
export const API_BASE_PATH = '/api/v1';

export interface OffsetPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface CursorPagination {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ApiMeta {
  pagination?: OffsetPagination | CursorPagination;
}

/** API_SPEC §8 — single resource. */
export interface ApiSuccessResponse<TData> {
  success: true;
  data: TData;
  meta?: ApiMeta;
}

/** API_SPEC §9–10 — lists. */
export interface ApiListResponse<TItem> {
  success: true;
  data: TItem[];
  meta: {
    pagination: OffsetPagination | CursorPagination;
  };
}

/** API_SPEC §11 — error body. */
export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
  requestId?: string;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorBody;
}

export type ApiResponse<TData> = ApiSuccessResponse<TData> | ApiErrorResponse;

/**
 * Standard error codes.
 *
 * Source: docs/api/API_SPEC.md §13, plus the SYSTEM group taken from
 * docs/architecture/ARCHITECTURE.md §48 and docs/security/AUTH_AUTHORIZATION.md §19
 * (not yet listed in API_SPEC §13 — tracked in REPOSITORY_CONSISTENCY_REPORT).
 *
 * New codes must be added to API_SPEC.md first.
 */
export const API_ERROR_CODES = {
  AUTHENTICATION: [
    'AUTH_INVALID_CREDENTIALS',
    'AUTH_ACCOUNT_DISABLED',
    'AUTH_ACCOUNT_SUSPENDED',
    'AUTH_TOKEN_INVALID',
    'AUTH_TOKEN_EXPIRED',
    'AUTH_REFRESH_TOKEN_INVALID',
    'AUTH_EMAIL_NOT_VERIFIED',
    'AUTH_PHONE_NOT_VERIFIED',
    'AUTH_VERIFICATION_CODE_INVALID',
    'AUTH_VERIFICATION_CODE_EXPIRED',
    'AUTH_TOO_MANY_ATTEMPTS',
    'AUTH_PASSWORD_RESET_INVALID',
  ],
  AUTHORIZATION: ['AUTHZ_FORBIDDEN', 'AUTHZ_INSUFFICIENT_PERMISSION', 'AUTHZ_RESOURCE_ACCESS_DENIED'],
  VALIDATION: [
    'VALIDATION_ERROR',
    'INVALID_REQUEST',
    'INVALID_PARAMETER',
    'INVALID_ID',
    'INVALID_DATE_RANGE',
    'INVALID_FILE',
  ],
  RESOURCE: [
    'RESOURCE_NOT_FOUND',
    'USER_NOT_FOUND',
    'RESTAURANT_NOT_FOUND',
    'MENU_ITEM_NOT_FOUND',
    'ORDER_NOT_FOUND',
    'RIDER_NOT_FOUND',
    'DELIVERY_NOT_FOUND',
    'PAYMENT_NOT_FOUND',
    'PROMOTION_NOT_FOUND',
    'REVIEW_NOT_FOUND',
    'SUPPORT_TICKET_NOT_FOUND',
  ],
  RESTAURANT: [
    'RESTAURANT_NOT_AVAILABLE',
    'RESTAURANT_NOT_APPROVED',
    'RESTAURANT_ALREADY_ONLINE',
    'RESTAURANT_ALREADY_OFFLINE',
    'RESTAURANT_CLOSED',
    'RESTAURANT_PAUSED',
    'RESTAURANT_SUSPENDED',
  ],
  ORDER: [
    'ORDER_INVALID_STATUS',
    'ORDER_CANCELLATION_NOT_ALLOWED',
    'ORDER_ALREADY_CANCELLED',
    'ORDER_ALREADY_COMPLETED',
    'ORDER_NOT_MODIFIABLE',
    'ORDER_ITEM_UNAVAILABLE',
    'ORDER_MINIMUM_NOT_MET',
    'ORDER_RECALCULATION_REQUIRED',
    'ORDER_DUPLICATE',
  ],
  PAYMENT: [
    'PAYMENT_REQUIRED',
    'PAYMENT_FAILED',
    'PAYMENT_DECLINED',
    'PAYMENT_ALREADY_PROCESSED',
    'PAYMENT_INVALID_AMOUNT',
    'PAYMENT_PROVIDER_ERROR',
    'REFUND_NOT_ALLOWED',
    'REFUND_FAILED',
  ],
  DISPATCH: [
    'DISPATCH_NOT_AVAILABLE',
    'RIDER_NOT_ELIGIBLE',
    'RIDER_NOT_AVAILABLE',
    'DISPATCH_OFFER_EXPIRED',
    'DISPATCH_OFFER_ALREADY_RESPONDED',
    'DELIVERY_ALREADY_ASSIGNED',
    'DELIVERY_NOT_ASSIGNABLE',
  ],
  RISK: [
    'RISK_RESTRICTION_ACTIVE',
    'RISK_VERIFICATION_REQUIRED',
    'ORDER_RESTRICTED',
    'COD_RESTRICTED',
    'ACCOUNT_RESTRICTED',
  ],
  IDEMPOTENCY: ['IDEMPOTENCY_KEY_REQUIRED', 'IDEMPOTENCY_KEY_REUSED', 'IDEMPOTENCY_REQUEST_MISMATCH'],
  SYSTEM: ['RATE_LIMITED', 'INTERNAL_ERROR'],
} as const;

type ErrorCodeGroups = typeof API_ERROR_CODES;
export type ApiErrorCode = ErrorCodeGroups[keyof ErrorCodeGroups][number];

export const ALL_API_ERROR_CODES: readonly ApiErrorCode[] = Object.values(API_ERROR_CODES).flat();
