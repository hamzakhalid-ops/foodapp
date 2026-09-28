import { z } from 'zod';
import { cursorQuerySchema, requiredText, uuidSchema } from './common';

export const RISK_SUBJECT_TYPES = ['CUSTOMER', 'RESTAURANT', 'RIDER'] as const;
export const RISK_EVENT_TYPES = [
  'COD_NON_RECEIPT',
  'REPEATED_ORDER_CANCELLATION',
  'REPEATED_PAYMENT_FAILURE',
  'SUSPICIOUS_ORDER_PATTERN',
  'MULTIPLE_FAILED_DELIVERIES',
  'EXCESSIVE_REFUNDS',
  'ABNORMAL_ORDER_FREQUENCY',
  'SUSPICIOUS_ACCOUNT_ACTIVITY',
  'REPEATED_FALSE_COMPLAINT',
] as const;
export const RISK_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const RISK_ACTIONS = [
  'NORMAL',
  'MONITORED',
  'COD_RESTRICTED',
  'ADDITIONAL_VERIFICATION',
  'ORDER_RESTRICTED',
  'ACCOUNT_RESTRICTED',
] as const;
export const RISK_RESTRICTION_TYPES = [
  'COD_RESTRICTED',
  'ORDER_RESTRICTED',
  'ADDITIONAL_VERIFICATION',
  'ACCOUNT_RESTRICTED',
] as const;
export const RISK_FLAG_STATUSES = ['ACTIVE', 'RESOLVED', 'DISMISSED', 'EXPIRED'] as const;
export const RISK_RESTRICTION_STATUSES = ['ACTIVE', 'REMOVED', 'EXPIRED'] as const;

const subjectType = z.enum(RISK_SUBJECT_TYPES);
const futureInstant = z.iso.datetime({ offset: true });

/** API_SPEC §84 (admin/internal only). */
export const createRiskEventRequestSchema = z
  .object({
    subjectType,
    subjectId: uuidSchema,
    eventType: z.enum(RISK_EVENT_TYPES),
    severity: z.enum(RISK_SEVERITIES).default('MEDIUM'),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

/** API_SPEC §85 */
export const createRiskRuleRequestSchema = z
  .object({
    name: requiredText(120),
    subjectType,
    eventType: z.enum(RISK_EVENT_TYPES),
    threshold: z.number().int().min(1).max(1000),
    windowSeconds: z
      .number()
      .int()
      .min(60)
      .max(3 * 365 * 86_400),
    action: z.enum(RISK_ACTIONS),
    severity: z.enum(RISK_SEVERITIES),
    enabled: z.boolean().default(true),
  })
  .strict();
export const updateRiskRuleRequestSchema = z
  .object({
    name: requiredText(120),
    threshold: z.number().int().min(1).max(1000),
    windowSeconds: z
      .number()
      .int()
      .min(60)
      .max(3 * 365 * 86_400),
    action: z.enum(RISK_ACTIONS),
    severity: z.enum(RISK_SEVERITIES),
    enabled: z.boolean(),
  })
  .partial()
  .strict();

/** API_SPEC §87 */
export const createRiskRestrictionRequestSchema = z
  .object({
    subjectType,
    subjectId: uuidSchema,
    restrictionType: z.enum(RISK_RESTRICTION_TYPES),
    reason: requiredText(500),
    expiresAt: futureInstant.optional(),
  })
  .strict();
export const updateRiskRestrictionRequestSchema = z
  .object({ expiresAt: futureInstant.nullable(), reason: requiredText(500) })
  .strict();

export const riskListQuerySchema = cursorQuerySchema.extend({
  subjectType: subjectType.optional(),
  subjectId: uuidSchema.optional(),
  status: z.string().trim().max(30).optional(),
});

export const riskEventSchema = z.object({
  id: z.uuid(),
  subjectType,
  subjectId: z.uuid(),
  eventType: z.enum(RISK_EVENT_TYPES),
  severity: z.enum(RISK_SEVERITIES),
  metadata: z.unknown(),
  occurredAt: z.string(),
});
export const riskRuleSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  subjectType,
  eventType: z.enum(RISK_EVENT_TYPES),
  threshold: z.number(),
  windowSeconds: z.number(),
  action: z.enum(RISK_ACTIONS),
  severity: z.enum(RISK_SEVERITIES),
  enabled: z.boolean(),
  updatedAt: z.string(),
});
export const riskFlagSchema = z.object({
  id: z.uuid(),
  subjectType,
  subjectId: z.uuid(),
  riskRuleId: z.uuid().nullable(),
  status: z.enum(RISK_FLAG_STATUSES),
  severity: z.enum(RISK_SEVERITIES),
  reason: z.string(),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
  resolvedBy: z.uuid().nullable(),
});
export const riskRestrictionSchema = z.object({
  id: z.uuid(),
  subjectType,
  subjectId: z.uuid(),
  restrictionType: z.enum(RISK_RESTRICTION_TYPES),
  status: z.enum(RISK_RESTRICTION_STATUSES),
  startsAt: z.string(),
  expiresAt: z.string().nullable(),
  reason: z.string(),
  riskFlagId: z.uuid().nullable(),
  createdBy: z.uuid().nullable(),
  createdAt: z.string(),
});

export type CreateRiskEventRequest = z.infer<typeof createRiskEventRequestSchema>;
export type CreateRiskRuleRequest = z.infer<typeof createRiskRuleRequestSchema>;
/** What a client sends: fields with server defaults may be omitted (`z.input`). */
export type CreateRiskEventInput = z.input<typeof createRiskEventRequestSchema>;
export type CreateRiskRuleInput = z.input<typeof createRiskRuleRequestSchema>;
export type UpdateRiskRuleRequest = z.infer<typeof updateRiskRuleRequestSchema>;
export type CreateRiskRestrictionRequest = z.infer<typeof createRiskRestrictionRequestSchema>;
export type UpdateRiskRestrictionRequest = z.infer<typeof updateRiskRestrictionRequestSchema>;
export type RiskListQuery = z.infer<typeof riskListQuerySchema>;
export type RiskEvent = z.infer<typeof riskEventSchema>;
export type RiskRule = z.infer<typeof riskRuleSchema>;
export type RiskFlag = z.infer<typeof riskFlagSchema>;
export type RiskRestriction = z.infer<typeof riskRestrictionSchema>;
