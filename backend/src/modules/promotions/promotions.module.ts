import { Module } from '@nestjs/common';

/**
 * Promotions module — PERCENTAGE / FIXED_AMOUNT promotions, eligibility and redemption; one promotion per order (PROMOTION_RULES).
 *
 * Owns tables: promotions, promotion_usages.
 * Implemented in slice: 15 — Promotions (docs/IMPLEMENTATION_PLAN.md).
 *
 * Status: BOUNDARY ONLY. No business logic is implemented yet.
 */
@Module({})
export class PromotionsModule {}
