import { ROLES, USER_STATUSES } from '@quickbite/types';
import { z } from 'zod';

/**
 * Request/response shapes for the authentication API (docs/api/API_SPEC.md §16–25).
 *
 * These validate SHAPE only. The backend owns normalization (email/phone), the password policy
 * (configurable, AUTH_AUTHORIZATION §9) and every security decision.
 */

/** Upper bound on raw password input size; the actual policy maximum is enforced by the backend. */
const MAX_PASSWORD_INPUT = 1024;

const requiredText = (max: number) => z.string().trim().min(1).max(max);

export const registerRequestSchema = z.object({
  email: z.string().trim().max(254).pipe(z.email()),
  phone: requiredText(32),
  password: z.string().min(1).max(MAX_PASSWORD_INPUT),
  firstName: requiredText(100),
  lastName: requiredText(100),
});

export const loginRequestSchema = z.object({
  identifier: requiredText(254),
  password: z.string().min(1).max(MAX_PASSWORD_INPUT),
});

export const refreshRequestSchema = z.object({
  refreshToken: requiredText(512),
});

export const verifyPhoneRequestSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});

export const verifyEmailRequestSchema = z.object({
  token: requiredText(512),
});

export const forgotPasswordRequestSchema = z.object({
  identifier: requiredText(254),
});

export const resetPasswordRequestSchema = z.object({
  token: requiredText(512),
  newPassword: z.string().min(1).max(MAX_PASSWORD_INPUT),
});

/** API_SPEC §25 */
export const currentUserSchema = z.object({
  id: z.uuid(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  roles: z.array(z.enum(ROLES)),
  status: z.enum(USER_STATUSES),
});

export const authTokensSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
});

export const loginResponseSchema = authTokensSchema.extend({
  user: currentUserSchema,
});

export const registerResponseSchema = z.object({
  user: currentUserSchema,
  verification: z.object({
    phoneRequired: z.boolean(),
    emailRequired: z.boolean(),
  }),
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;
export type VerifyPhoneRequest = z.infer<typeof verifyPhoneRequestSchema>;
export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
export type CurrentUser = z.infer<typeof currentUserSchema>;
export type AuthTokens = z.infer<typeof authTokensSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type RegisterResponse = z.infer<typeof registerResponseSchema>;
