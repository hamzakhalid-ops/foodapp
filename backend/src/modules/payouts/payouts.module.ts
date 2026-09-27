import { Module } from '@nestjs/common';

/**
 * Payouts module — Payout initiation and state via provider abstraction; idempotent (FINANCIAL_SPEC §34–39).
 *
 * Owns tables: payouts.
 * Implemented in slice: 14 — Settlements (docs/IMPLEMENTATION_PLAN.md).
 *
 * Status: BOUNDARY ONLY. No business logic is implemented yet.
 */
@Module({})
export class PayoutsModule {}
