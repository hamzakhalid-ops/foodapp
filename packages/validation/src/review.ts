import { REVIEW_STATUSES } from '@quickbite/types';
import { z } from 'zod';
import { cursorQuerySchema, optionalText, pageQuerySchema, requiredText } from './common';

/** Central limits (REVIEW_RULES §9, §23). */
export const REVIEW_COMMENT_MAX_LENGTH = 1000;
export const REVIEW_RESPONSE_MAX_LENGTH = 1000;
/** Public average rating precision (decimal places). */
export const RATING_DISPLAY_DECIMALS = 1;

export const REVIEW_REPORT_REASONS = [
  'ABUSIVE_CONTENT',
  'HARASSMENT',
  'SPAM',
  'PERSONAL_INFORMATION',
  'FRAUDULENT_CONTENT',
  'THREAT',
  'PROMOTIONAL_CONTENT',
  'OTHER',
] as const;

const rating = z.number().int().min(1).max(5);

export const createReviewRequestSchema = z
  .object({ rating, comment: optionalText(REVIEW_COMMENT_MAX_LENGTH) })
  .strict();
export const updateReviewRequestSchema = z
  .object({ rating, comment: optionalText(REVIEW_COMMENT_MAX_LENGTH) })
  .partial()
  .strict()
  .refine((body) => body.rating !== undefined || body.comment !== undefined, 'Nothing to update');

export const reviewReplyRequestSchema = z
  .object({ response: requiredText(REVIEW_RESPONSE_MAX_LENGTH) })
  .strict();

export const reportReviewRequestSchema = z
  .object({
    reason: z.enum(REVIEW_REPORT_REASONS),
    details: optionalText(500),
  })
  .strict()
  .refine((body) => body.reason !== 'OTHER' || Boolean(body.details), {
    message: 'Details are required for OTHER',
    path: ['details'],
  });

export const publicReviewListQuerySchema = pageQuerySchema.extend({
  rating: z.coerce.number().int().min(1).max(5).optional(),
  sort: z.enum(['newest', 'highest', 'lowest']).default('newest'),
});

export const restaurantReviewListQuerySchema = cursorQuerySchema.extend({
  rating: z.coerce.number().int().min(1).max(5).optional(),
});

export const adminReviewListQuerySchema = cursorQuerySchema.extend({
  status: z.enum(REVIEW_STATUSES).optional(),
  restaurantId: z.uuid().optional(),
});

export const adminReviewReportListQuerySchema = cursorQuerySchema.extend({
  status: z.enum(['OPEN', 'RESOLVED', 'DISMISSED']).optional(),
});

export const resolveReviewReportRequestSchema = z
  .object({ outcome: z.enum(['RESOLVED', 'DISMISSED']), reason: requiredText(500) })
  .strict();

export const reviewResponseSchema = z.object({
  response: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const reviewSchema = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  restaurantId: z.uuid(),
  rating: z.number(),
  comment: z.string().nullable(),
  status: z.enum(REVIEW_STATUSES),
  createdAt: z.string(),
  updatedAt: z.string(),
  response: reviewResponseSchema.nullable(),
});

/** Public view: no customer identity beyond a first name (REVIEW_RULES §38). */
export const publicReviewSchema = reviewSchema
  .omit({ orderId: true, status: true })
  .extend({ customerFirstName: z.string() });

export const reviewEligibilitySchema = z.object({
  eligible: z.boolean(),
  reason: z.string().nullable(),
  reviewId: z.uuid().nullable(),
});

export const ratingSummarySchema = z.object({
  averageRating: z.number().nullable(),
  reviewCount: z.number(),
  distribution: z.object({
    1: z.number(),
    2: z.number(),
    3: z.number(),
    4: z.number(),
    5: z.number(),
  }),
});

export const reviewReportSchema = z.object({
  id: z.uuid(),
  reviewId: z.uuid(),
  reason: z.enum(REVIEW_REPORT_REASONS),
  details: z.string().nullable(),
  status: z.enum(['OPEN', 'RESOLVED', 'DISMISSED']),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
});

export type CreateReviewRequest = z.infer<typeof createReviewRequestSchema>;
export type UpdateReviewRequest = z.infer<typeof updateReviewRequestSchema>;
export type ReviewReplyRequest = z.infer<typeof reviewReplyRequestSchema>;
export type ReportReviewRequest = z.infer<typeof reportReviewRequestSchema>;
export type PublicReviewListQuery = z.infer<typeof publicReviewListQuerySchema>;
export type RestaurantReviewListQuery = z.infer<typeof restaurantReviewListQuerySchema>;
export type AdminReviewListQuery = z.infer<typeof adminReviewListQuerySchema>;
export type AdminReviewReportListQuery = z.infer<typeof adminReviewReportListQuerySchema>;
export type ResolveReviewReportRequest = z.infer<typeof resolveReviewReportRequestSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type PublicReview = z.infer<typeof publicReviewSchema>;
export type ReviewEligibility = z.infer<typeof reviewEligibilitySchema>;
export type RatingSummary = z.infer<typeof ratingSummarySchema>;
export type ReviewReport = z.infer<typeof reviewReportSchema>;
