import { z } from 'zod';
import { moneyAmountSchema } from './api';
import { cursorQuerySchema, optionalText, requiredText, uuidSchema } from './common';

/** Financial vocabulary (FINANCIAL_SPEC §19–20, §27, §35; DATABASE.md §51–56). */
export const EARNING_STATUSES = ['AVAILABLE', 'IN_SETTLEMENT', 'SETTLED'] as const;
export const SETTLEMENT_RECIPIENT_TYPES = ['RESTAURANT', 'RIDER'] as const;
export const SETTLEMENT_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] as const;
export const SETTLEMENT_SOURCE_TYPES = [
  'RESTAURANT_EARNING',
  'RIDER_EARNING',
  'ADJUSTMENT',
] as const;
export const PAYOUT_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] as const;

export const earningStatusSchema = z.enum(EARNING_STATUSES);
export const settlementRecipientTypeSchema = z.enum(SETTLEMENT_RECIPIENT_TYPES);
export const settlementStatusSchema = z.enum(SETTLEMENT_STATUSES);
export const payoutStatusSchema = z.enum(PAYOUT_STATUSES);

const instant = z.iso.datetime({ offset: true });

/** `from`/`to` range for earnings overviews (API_SPEC §59). */
export const financeRangeQuerySchema = z.object({
  from: instant.optional(),
  to: instant.optional(),
});

export const earningListQuerySchema = cursorQuerySchema.extend({
  status: earningStatusSchema.optional(),
  from: instant.optional(),
  to: instant.optional(),
});

export const settlementListQuerySchema = cursorQuerySchema.extend({
  status: settlementStatusSchema.optional(),
});

export const adminSettlementListQuerySchema = settlementListQuerySchema.extend({
  recipientType: settlementRecipientTypeSchema.optional(),
  recipientId: uuidSchema.optional(),
});

export const payoutListQuerySchema = cursorQuerySchema.extend({
  status: payoutStatusSchema.optional(),
});

export const adjustmentListQuerySchema = cursorQuerySchema.extend({
  recipientType: settlementRecipientTypeSchema.optional(),
  recipientId: uuidSchema.optional(),
});

/** FINANCIAL_SPEC §17–18: signed, non-zero, explained adjustment for a restaurant or rider. */
export const createFinancialAdjustmentRequestSchema = z
  .object({
    recipientType: settlementRecipientTypeSchema,
    recipientId: uuidSchema,
    amount: moneyAmountSchema.refine((value) => Number(value) !== 0, 'Must not be zero'),
    reason: requiredText(500),
    reference: optionalText(200),
  })
  .strict();

/** Development/test only: the sandbox payout provider's final answer. */
export const sandboxPayoutOutcomeRequestSchema = z
  .object({ outcome: z.enum(['COMPLETED', 'FAILED']) })
  .strict();

export const restaurantEarningSchema = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  orderNumber: z.string(),
  grossAmount: z.string(),
  commissionPercent: z.string(),
  commissionAmount: z.string(),
  feeAmount: z.string(),
  refundAmount: z.string(),
  netAmount: z.string(),
  currency: z.string(),
  status: earningStatusSchema,
  settlementId: z.uuid().nullable(),
  createdAt: z.string(),
});

export const riderEarningSchema = z.object({
  id: z.uuid(),
  deliveryId: z.uuid(),
  orderNumber: z.string(),
  baseAmount: z.string(),
  bonusAmount: z.string(),
  adjustmentAmount: z.string(),
  totalAmount: z.string(),
  currency: z.string(),
  status: earningStatusSchema,
  settlementId: z.uuid().nullable(),
  createdAt: z.string(),
});

const statusTotalsSchema = z.object({
  AVAILABLE: z.string(),
  IN_SETTLEMENT: z.string(),
  SETTLED: z.string(),
});

/** GET /restaurant/earnings (API_SPEC §59). */
export const restaurantEarningsSummarySchema = z.object({
  from: z.string().nullable(),
  to: z.string().nullable(),
  currency: z.string(),
  orderCount: z.number().int(),
  grossAmount: z.string(),
  commissionAmount: z.string(),
  feeAmount: z.string(),
  refundAmount: z.string(),
  netAmount: z.string(),
  netByStatus: statusTotalsSchema,
});

/** GET /restaurant/earnings/fees (API_SPEC §59). */
export const restaurantFeesSummarySchema = z.object({
  from: z.string().nullable(),
  to: z.string().nullable(),
  currency: z.string(),
  currentCommissionPercent: z.string().nullable(),
  commissionAmount: z.string(),
  feeAmount: z.string(),
});

/** GET /rider/earnings (API_SPEC §75). */
export const riderEarningsSummarySchema = z.object({
  from: z.string().nullable(),
  to: z.string().nullable(),
  currency: z.string(),
  deliveryCount: z.number().int(),
  baseAmount: z.string(),
  bonusAmount: z.string(),
  adjustmentAmount: z.string(),
  totalAmount: z.string(),
  totalByStatus: statusTotalsSchema,
});

export const settlementSchema = z.object({
  id: z.uuid(),
  recipientType: settlementRecipientTypeSchema,
  recipientId: z.uuid(),
  periodStart: z.string(),
  periodEnd: z.string(),
  grossAmount: z.string(),
  fees: z.string(),
  adjustments: z.string(),
  netAmount: z.string(),
  currency: z.string(),
  status: settlementStatusSchema,
  approvedAt: z.string().nullable(),
  processedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const settlementItemSchema = z.object({
  id: z.uuid(),
  sourceType: z.enum(SETTLEMENT_SOURCE_TYPES),
  sourceId: z.uuid(),
  amount: z.string(),
});

export const payoutSchema = z.object({
  id: z.uuid(),
  settlementId: z.uuid(),
  recipientType: settlementRecipientTypeSchema,
  recipientId: z.uuid(),
  provider: z.string(),
  providerReference: z.string().nullable(),
  amount: z.string(),
  currency: z.string(),
  status: payoutStatusSchema,
  failureReason: z.string().nullable(),
  initiatedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const invoiceSchema = z.object({
  id: z.uuid(),
  settlementId: z.uuid(),
  invoiceNumber: z.string(),
  amount: z.string(),
  currency: z.string(),
  status: z.literal('ISSUED'),
  fileUrl: z.string().nullable(),
  issuedAt: z.string(),
});

export const settlementDetailSchema = settlementSchema.extend({
  items: z.array(settlementItemSchema),
  payouts: z.array(payoutSchema),
  invoice: invoiceSchema.nullable(),
});

export const financialAdjustmentSchema = z.object({
  id: z.uuid(),
  recipientType: settlementRecipientTypeSchema,
  recipientId: z.uuid(),
  amount: z.string(),
  currency: z.string(),
  reason: z.string(),
  reference: z.string().nullable(),
  status: earningStatusSchema,
  settlementId: z.uuid().nullable(),
  createdBy: z.uuid(),
  createdAt: z.string(),
});

/** One detected discrepancy between financial layers (FINANCIAL_SPEC §50–52). */
export const reconciliationIssueSchema = z.object({
  check: z.string(),
  entityType: z.string(),
  entityId: z.uuid(),
  detail: z.string(),
});

export const reconciliationReportSchema = z.object({
  checkedAt: z.string(),
  issues: z.array(reconciliationIssueSchema),
});

export type FinanceRangeQuery = z.infer<typeof financeRangeQuerySchema>;
export type EarningListQuery = z.infer<typeof earningListQuerySchema>;
export type SettlementListQuery = z.infer<typeof settlementListQuerySchema>;
export type AdminSettlementListQuery = z.infer<typeof adminSettlementListQuerySchema>;
export type PayoutListQuery = z.infer<typeof payoutListQuerySchema>;
export type AdjustmentListQuery = z.infer<typeof adjustmentListQuerySchema>;
export type CreateFinancialAdjustmentRequest = z.infer<
  typeof createFinancialAdjustmentRequestSchema
>;
export type SandboxPayoutOutcomeRequest = z.infer<typeof sandboxPayoutOutcomeRequestSchema>;
export type RestaurantEarning = z.infer<typeof restaurantEarningSchema>;
export type RiderEarning = z.infer<typeof riderEarningSchema>;
export type RestaurantEarningsSummary = z.infer<typeof restaurantEarningsSummarySchema>;
export type RestaurantFeesSummary = z.infer<typeof restaurantFeesSummarySchema>;
export type RiderEarningsSummary = z.infer<typeof riderEarningsSummarySchema>;
export type Settlement = z.infer<typeof settlementSchema>;
export type SettlementDetail = z.infer<typeof settlementDetailSchema>;
export type Payout = z.infer<typeof payoutSchema>;
export type Invoice = z.infer<typeof invoiceSchema>;
export type FinancialAdjustment = z.infer<typeof financialAdjustmentSchema>;
export type ReconciliationReport = z.infer<typeof reconciliationReportSchema>;
