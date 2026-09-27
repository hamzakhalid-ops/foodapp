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
