import { Module } from '@nestjs/common';

/**
 * Reviews module — Customer → restaurant reviews (1–5), responses, reports, moderation, rating aggregation (REVIEW_RULES).
 *
 * Owns tables: reviews, review_responses, review_reports.
 * Implemented in slice: 16 — Reviews (docs/IMPLEMENTATION_PLAN.md).
 *
 * Status: BOUNDARY ONLY. No business logic is implemented yet.
 */
@Module({})
export class ReviewsModule {}
