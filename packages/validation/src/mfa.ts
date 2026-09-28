import { z } from 'zod';

/** Admin TOTP MFA (AUTH_AUTHORIZATION §34–38, ADR-0014 §8). */
export const mfaCodeRequestSchema = z
  .object({ code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code') })
  .strict();

export const mfaStatusSchema = z.object({
  enrolled: z.boolean(),
  verifiedAt: z.string().nullable(),
});

/** Returned once at enrolment; the secret is never shown again. */
export const mfaSetupSchema = z.object({ secret: z.string(), otpauthUrl: z.string() });

export type MfaCodeRequest = z.infer<typeof mfaCodeRequestSchema>;
export type MfaStatus = z.infer<typeof mfaStatusSchema>;
export type MfaSetup = z.infer<typeof mfaSetupSchema>;
