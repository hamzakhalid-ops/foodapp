/**
 * Frozen V1 review vocabulary.
 *
 * Source: CLAUDE.md §18, docs/reviews/REVIEW_RULES.md.
 * V1 relationship: CUSTOMER → RESTAURANT only. Eligibility is backend-authoritative.
 */
export const REVIEW_STATUSES = ['PUBLISHED', 'PENDING_MODERATION', 'HIDDEN', 'REMOVED'] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
