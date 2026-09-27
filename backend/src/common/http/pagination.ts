import { ApiPage } from './api-response.interceptor';
import { validationError } from './errors';

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

/** Keyset filter for newest-first `(createdAt, id)` lists; rejects malformed cursors. */
export function createdBefore(cursor: string | undefined) {
  if (!cursor) return {};
  const decoded = decodeCursor(cursor);
  if (!decoded) throw validationError({ cursor: 'Invalid cursor' });
  return {
    OR: [{ createdAt: { lt: decoded.at } }, { createdAt: decoded.at, id: { lt: decoded.id } }],
  };
}

/** Trims the look-ahead row fetched with `take: limit + 1` and builds the next cursor. */
export function keysetPage<R extends { createdAt: Date; id: string }, T>(
  rows: R[],
  limit: number,
  map: (row: R) => T,
): { rows: T[]; nextCursor: string | null } {
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    rows: page.map(map),
    nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
  };
}
