import {
  currentUserSchema,
  type CurrentUser,
  type ForgotPasswordRequest,
  type LoginRequest,
  type LoginResponse,
  loginResponseSchema,
  type AuthTokens,
  authTokensSchema,
  type RefreshRequest,
  type RegisterRequest,
  type RegisterResponse,
  registerResponseSchema,
  type ResetPasswordRequest,
  type VerifyEmailRequest,
  type VerifyPhoneRequest,
} from '@quickbite/validation';
import { z } from 'zod';
import { type ApiClient } from './client';

/**
 * Authentication endpoints (docs/api/API_SPEC.md §16–25).
 *
 * Token storage is the caller's responsibility: mobile apps must use secure device storage;
 * never persist tokens in plain storage or logs. Refresh tokens are single-use — callers must
 * serialize refreshes (one in flight at a time), because a concurrently reused refresh token
 * revokes the whole session.
 */
export function createAuthApi(client: ApiClient) {
  const empty = z.null();

  return {
    register: async (body: RegisterRequest): Promise<RegisterResponse> =>
      (
        await client.request({
          method: 'POST',
          path: '/auth/register',
          body,
          schema: registerResponseSchema,
        })
      ).data,

    login: async (body: LoginRequest): Promise<LoginResponse> =>
      (
        await client.request({
          method: 'POST',
          path: '/auth/login',
          body,
          schema: loginResponseSchema,
        })
      ).data,

    refresh: async (body: RefreshRequest): Promise<AuthTokens> =>
      (
        await client.request({
          method: 'POST',
          path: '/auth/refresh',
          body,
          schema: authTokensSchema,
        })
      ).data,

    logout: async (): Promise<void> => {
      await client.request({ method: 'POST', path: '/auth/logout', schema: empty });
    },

    verifyPhone: async (body: VerifyPhoneRequest): Promise<CurrentUser> =>
      (
        await client.request({
          method: 'POST',
          path: '/auth/verify-phone',
          body,
          schema: currentUserSchema,
        })
      ).data,

    resendPhoneVerification: async (): Promise<void> => {
      await client.request({ method: 'POST', path: '/auth/verify-phone/resend', schema: empty });
    },

    verifyEmail: async (body: VerifyEmailRequest): Promise<void> => {
      await client.request({ method: 'POST', path: '/auth/verify-email', body, schema: empty });
    },

    forgotPassword: async (body: ForgotPasswordRequest): Promise<void> => {
      await client.request({ method: 'POST', path: '/auth/forgot-password', body, schema: empty });
    },

    resetPassword: async (body: ResetPasswordRequest): Promise<void> => {
      await client.request({ method: 'POST', path: '/auth/reset-password', body, schema: empty });
    },

    me: async (): Promise<CurrentUser> =>
      (await client.request({ method: 'GET', path: '/me', schema: currentUserSchema })).data,
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;
