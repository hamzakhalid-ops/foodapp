import { Module } from '@nestjs/common';

/**
 * Checkout module — Checkout preview and order-creation orchestration: recalculation, payment/COD validation, risk validation (API_SPEC §37–38).
 *
 * Owns tables: (none — orchestrates orders, payments, promotions, risk).
 * Implemented in slice: 7 — Checkout (docs/IMPLEMENTATION_PLAN.md).
 *
 * Status: BOUNDARY ONLY. No business logic is implemented yet.
 */
@Module({})
export class CheckoutModule {}
