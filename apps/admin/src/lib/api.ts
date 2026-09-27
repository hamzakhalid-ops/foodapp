import { ApiClient } from '@quickbite/api-client';
import { env } from './env';

/**
 * API client for the Admin Panel. Admin endpoints (`/api/v1/admin/...`) are added per batch and
 * must match docs/api/API_SPEC.md §93–108. All authorization is enforced by the backend; hiding a
 * control in this UI is never a security boundary.
 */
export const apiClient = new ApiClient({ baseUrl: env.apiUrl });
