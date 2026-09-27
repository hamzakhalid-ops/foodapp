import { Module } from '@nestjs/common';

/**
 * Payments module — Online payment and COD, provider abstraction, webhooks, refunds (PAYMENT_RULES).
 *
 * Owns tables: payments, refunds.
 * Implemented in slice: 8 — Payments (docs/IMPLEMENTATION_PLAN.md).
 *
 * Status: BOUNDARY ONLY. No business logic is implemented yet.
 */
@Module({})
export class PaymentsModule {}
