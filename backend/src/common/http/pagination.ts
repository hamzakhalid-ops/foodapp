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

/** Opaque keyset cursor for newest-first lists ordered by (timestamp, id). */
export function encodeCursor(at: Date, id: string): string {
  return Buffer.from(`${at.toISOString()}|${id}`).toString('base64url');
}

export function decodeCursor(cursor: string): { at: Date; id: string } | null {
  const [iso, id] = Buffer.from(cursor, 'base64url').toString().split('|');
  const at = new Date(iso ?? '');
  if (!id || Number.isNaN(at.getTime()) || !/^[0-9a-f-]{36}$/.test(id)) return null;
  return { at, id };
}
