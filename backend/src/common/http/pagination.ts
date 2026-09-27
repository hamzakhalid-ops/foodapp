import { ApiPage } from './api-response.interceptor';

export function offsetPage<T>(
  rows: T[],
  total: number,
  page: number,
  pageSize: number,
): ApiPage<T> {
  return new ApiPage(rows, {
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}

/** Cursor pagination envelope (API_SPEC §10). */
export function cursorPage<T>(rows: T[], limit: number, nextCursor: string | null): ApiPage<T> {
  return new ApiPage(rows, { pagination: { limit, nextCursor, hasMore: nextCursor !== null } });
}
