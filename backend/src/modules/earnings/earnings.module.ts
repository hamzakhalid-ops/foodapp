import { Module } from '@nestjs/common';

/**
 * Earnings module — Restaurant and rider earnings records (FINANCIAL_SPEC §7–22).
 *
 * Owns tables: restaurant_earnings, rider_earnings.
 * Implemented in slice: 13 — Earnings (docs/IMPLEMENTATION_PLAN.md).
 *
 * Status: BOUNDARY ONLY. No business logic is implemented yet.
 */
@Module({})
export class EarningsModule {}
