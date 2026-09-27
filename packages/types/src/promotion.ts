/**
 * Frozen V1 promotion vocabulary.
 *
 * Source: CLAUDE.md §17, docs/promotions/PROMOTION_RULES.md.
 * Promotion eligibility is backend-authoritative. V1: one promotion per order, no stacking.
 */
export const PROMOTION_TYPES = ['PERCENTAGE', 'FIXED_AMOUNT'] as const;

export const PROMOTION_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED', 'DISABLED'] as const;

export type PromotionType = (typeof PROMOTION_TYPES)[number];
export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];
