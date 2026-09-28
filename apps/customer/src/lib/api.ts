import { ApiClient, createAuthApi } from '@quickbite/api-client';
import { createSession } from './auth/session';
import { secureTokenStorage } from './auth/token-storage';
import { env } from './env';

/**
 * Single API client for this app. Endpoint calls are added per slice and must match
 * docs/api/API_SPEC.md exactly. Every request carries the session's access token when signed in.
 */
export const apiClient = new ApiClient({
  baseUrl: env.apiUrl,
  getAccessToken: () => session.getAccessToken(),
});

/**
 * Login, registration and token refresh go through a client without `getAccessToken`, so a
 * refresh never waits on itself.
 */
const publicClient = new ApiClient({ baseUrl: env.apiUrl });

export const session = createSession({
  publicAuth: createAuthApi(publicClient),
  auth: createAuthApi(apiClient),
  storage: secureTokenStorage,
});
