import { ApiClient } from '@quickbite/api-client';
import { env } from './env';

/**
 * Single API client for this app. Endpoint calls are added per slice and must match
 * docs/api/API_SPEC.md exactly.
 *
 * Authentication (Slice 1) will provide `getAccessToken` from secure storage. Until then every
 * request is anonymous; protected endpoints will correctly return AUTH_* errors.
 */
export const apiClient = new ApiClient({ baseUrl: env.apiUrl });
