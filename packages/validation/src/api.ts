import { ALL_API_ERROR_CODES, type ApiErrorCode } from '@quickbite/types';
import { z } from 'zod';

const knownErrorCodes = new Set<string>(ALL_API_ERROR_CODES);

/**
 * Error code as returned by the backend. Unknown codes are preserved (a newer backend may add
 * codes) but can be distinguished with `isKnownApiErrorCode`.
 */
export const apiErrorCodeSchema = z.string().min(1);

export function isKnownApiErrorCode(code: string): code is ApiErrorCode {
  return knownErrorCodes.has(code);
}

/** API_SPEC §11 */
export const apiErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
    requestId: z.string().optional(),
  }),
});

export const offsetPaginationSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export const cursorPaginationSchema = z.object({
  limit: z.number().int(),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});

export const apiMetaSchema = z.object({
  pagination: z.union([offsetPaginationSchema, cursorPaginationSchema]).optional(),
  unreadCount: z.number().int().optional(),
});

/** API_SPEC §8 — success envelope around a caller-supplied data schema. */
export function apiSuccessResponseSchema<TData extends z.ZodType>(data: TData) {
  return z.object({
    success: z.literal(true),
    data,
    meta: apiMetaSchema.optional(),
  });
}

/**
 * Money is transported as a decimal string (NUMERIC(12,2) on the backend) so that clients never
 * perform floating-point arithmetic on authoritative amounts. See docs/api/API_SPEC.md §122.
 */
export const moneyAmountSchema = z
  .string()
  .regex(/^-?\d{1,10}(\.\d{1,2})?$/, 'Invalid money amount');
