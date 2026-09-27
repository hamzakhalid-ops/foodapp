import { PROMOTION_STATUSES, PROMOTION_TYPES } from '@quickbite/types';
import { z } from 'zod';
import { moneyAmountSchema } from './api';
import { optionalText, pageQuerySchema, requiredText } from './common';

/** Promotion codes: trimmed, upper-cased, 3–20 characters A–Z / 0–9 (PROMOTION_RULES §12). */
export const promotionCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{3,20}$/, 'Use 3–20 letters or digits');

const positiveAmount = moneyAmountSchema.refine((value) => Number(value) > 0, 'Must be positive');
const nonNegativeAmount = moneyAmountSchema.refine(
  (value) => !value.startsWith('-'),
  'Must not be negative',
);
const instant = z.iso.datetime({ offset: true });

const promotionFields = z.object({
  name: requiredText(120),
  description: optionalText(500),
  code: promotionCodeSchema,
  type: z.enum(PROMOTION_TYPES),
  /** Percent (0–100] for PERCENTAGE, amount for FIXED_AMOUNT. */
  value: positiveAmount,
  minimumOrderAmount: nonNegativeAmount.nullable().optional(),
  maximumDiscount: positiveAmount.nullable().optional(),
  usageLimit: z.number().int().min(1).nullable().optional(),
  perCustomerUsageLimit: z.number().int().min(1).nullable().optional(),
  startsAt: instant,
  endsAt: instant,
});

const valid = (body: {
  type?: string | undefined;
  value?: string | undefined;
  startsAt?: string | undefined;
  endsAt?: string | undefined;
}) =>
  (body.type !== 'PERCENTAGE' || body.value === undefined || Number(body.value) <= 100) &&
  (!body.startsAt || !body.endsAt || new Date(body.startsAt) < new Date(body.endsAt));

/** API_SPEC §58 */
export const createPromotionRequestSchema = promotionFields
  .strict()
  .refine(valid, 'Percentages must be at most 100 and startsAt must be before endsAt');

/** PATCH also activates/pauses (PROMOTION_RULES §40): status ACTIVE | PAUSED. */
export const updatePromotionRequestSchema = promotionFields
  .extend({ status: z.enum(['ACTIVE', 'PAUSED']) })
  .partial()
  .strict()
  .refine(valid, 'Percentages must be at most 100 and startsAt must be before endsAt');

/** API_SPEC §104: administrators edit status only (ADR-0014 §3). */
export const adminUpdatePromotionRequestSchema = z
  .object({ status: z.enum(['ACTIVE', 'PAUSED']), reason: requiredText(500) })
  .strict();

export const validatePromotionRequestSchema = z.object({ code: promotionCodeSchema }).strict();

export const promotionListQuerySchema = pageQuerySchema.extend({
  status: z.enum(PROMOTION_STATUSES).optional(),
});

export const promotionSchema = z.object({
  id: z.uuid(),
  restaurantId: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  code: z.string(),
  type: z.enum(PROMOTION_TYPES),
  value: z.string(),
  minimumOrderAmount: z.string().nullable(),
  maximumDiscount: z.string().nullable(),
  usageLimit: z.number().nullable(),
  usageCount: z.number(),
  perCustomerUsageLimit: z.number().nullable(),
  startsAt: z.string(),
  endsAt: z.string(),
  status: z.enum(PROMOTION_STATUSES),
  createdAt: z.string(),
});

/** Customer-facing promotion (no usage counters). */
export const publicPromotionSchema = promotionSchema.pick({
  id: true,
  name: true,
  description: true,
  code: true,
  type: true,
  value: true,
  minimumOrderAmount: true,
  maximumDiscount: true,
  endsAt: true,
});

export const promotionValidationSchema = z.object({
  valid: z.boolean(),
  promotionId: z.uuid().nullable(),
  discount: z.string(),
  currency: z.string(),
  /** Machine-readable reason when invalid (API error code). */
  reason: z.string().nullable(),
  message: z.string(),
});

export type CreatePromotionRequest = z.infer<typeof createPromotionRequestSchema>;
export type UpdatePromotionRequest = z.infer<typeof updatePromotionRequestSchema>;
export type AdminUpdatePromotionRequest = z.infer<typeof adminUpdatePromotionRequestSchema>;
export type ValidatePromotionRequest = z.infer<typeof validatePromotionRequestSchema>;
export type PromotionListQuery = z.infer<typeof promotionListQuerySchema>;
export type Promotion = z.infer<typeof promotionSchema>;
export type PublicPromotion = z.infer<typeof publicPromotionSchema>;
export type PromotionValidation = z.infer<typeof promotionValidationSchema>;
