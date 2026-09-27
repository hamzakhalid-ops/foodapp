import { Module } from '@nestjs/common';

/**
 * Cancellation module — Cancellation Rules Engine — cancellation eligibility and records (ARCHITECTURE §14, CANCELLATION_RULES).
 *
 * Owns tables: order_cancellations.
 * Implemented in slice: 7 — Checkout / 9 — Restaurant Orders (docs/IMPLEMENTATION_PLAN.md).
 *
 * Status: BOUNDARY ONLY. No business logic is implemented yet.
 */
@Module({})
export class CancellationModule {}
