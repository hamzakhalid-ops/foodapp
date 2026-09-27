import { z } from 'zod';
import { moneyAmountSchema } from './api';
import { cursorQuerySchema, optionalText, uuidSchema } from './common';
import { paymentMethodSchema, paymentStatusSchema } from './vocabulary';

const positiveAmount = moneyAmountSchema.refine((value) => Number(value) > 0, 'Must be positive');
const codeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z][A-Z0-9_]{1,49}$/, 'Use an upper-case code, e.g. ORDER_CANCELLED');

export const REFUND_STATUSES = [
  'PENDING',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
] as const;

/** API_SPEC §78 */
export const createPaymentRequestSchema = z
  .object({ orderId: uuidSchema, paymentMethod: paymentMethodSchema })
  .strict();

/** API_SPEC §82 (admin) */
export const refundRequestSchema = z
  .object({ amount: positiveAmount, reasonCode: codeSchema, reason: optionalText(500) })
  .strict();

/** ADR-0014 §9: the administrator's refund decision for a cancelled, paid order. */
export const refundDecisionRequestSchema = z.discriminatedUnion('decision', [
  z
    .object({ decision: z.literal('FULL_REFUND'), reason: z.string().trim().min(1).max(500) })
    .strict(),
  z
    .object({
      decision: z.literal('PARTIAL_REFUND'),
      amount: positiveAmount,
      reason: z.string().trim().min(1).max(500),
    })
    .strict(),
  z
    .object({ decision: z.literal('NO_REFUND'), reason: z.string().trim().min(1).max(500) })
    .strict(),
]);

/** Development/test only: simulate the customer completing the payment at the sandbox provider. */
export const sandboxPaymentOutcomeRequestSchema = z
  .object({ outcome: z.enum(['SUCCEEDED', 'FAILED', 'AUTHORIZED']) })
  .strict();

export const refundSchema = z.object({
  id: z.uuid(),
  paymentId: z.uuid(),
  orderId: z.uuid(),
  amount: z.string(),
  reason: z.string(),
  status: z.enum(REFUND_STATUSES),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});

export const paymentSchema = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  method: paymentMethodSchema,
  status: paymentStatusSchema,
  amount: z.string(),
  currency: z.string(),
  provider: z.string().nullable(),
  failureReason: z.string().nullable(),
  paidAt: z.string().nullable(),
  createdAt: z.string(),
  /** Present while an online payment is waiting for the customer at the provider. */
  nextAction: z.object({ type: z.literal('REDIRECT'), url: z.string() }).nullable(),
  refundedAmount: z.string(),
});

export const paymentMethodInfoSchema = z.object({
  method: paymentMethodSchema,
  available: z.boolean(),
});

export const adminPaymentListQuerySchema = cursorQuerySchema.extend({
  status: paymentStatusSchema.optional(),
  method: paymentMethodSchema.optional(),
  orderId: uuidSchema.optional(),
});
export const adminRefundListQuerySchema = cursorQuerySchema.extend({
  status: z.enum(REFUND_STATUSES).optional(),
  orderId: uuidSchema.optional(),
});

export type CreatePaymentRequest = z.infer<typeof createPaymentRequestSchema>;
export type RefundRequest = z.infer<typeof refundRequestSchema>;
export type RefundDecisionRequest = z.infer<typeof refundDecisionRequestSchema>;
export type SandboxPaymentOutcomeRequest = z.infer<typeof sandboxPaymentOutcomeRequestSchema>;
export type Refund = z.infer<typeof refundSchema>;
export type Payment = z.infer<typeof paymentSchema>;
export type PaymentMethodInfo = z.infer<typeof paymentMethodInfoSchema>;
export type AdminPaymentListQuery = z.infer<typeof adminPaymentListQuerySchema>;
export type AdminRefundListQuery = z.infer<typeof adminRefundListQuerySchema>;
