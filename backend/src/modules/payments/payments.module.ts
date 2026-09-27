import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';

/**
 * Payments module — Online payment and COD, provider abstraction, webhooks, refunds (PAYMENT_RULES).
 *
 * Owns tables: payments, refunds.
 * Implemented in slice: 8 — Payments (docs/IMPLEMENTATION_PLAN.md).
 */
@Module({
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
