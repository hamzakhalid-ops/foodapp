import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { RiskModule } from '../risk/risk.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';

/**
 * Checkout module — Checkout preview and order-creation orchestration: recalculation, payment/COD validation, risk validation (API_SPEC §37–38).
 *
 * Owns tables: (none — orchestrates orders, payments, promotions, risk).
 * Implemented in slice: 7 — Checkout (docs/IMPLEMENTATION_PLAN.md).
 */
@Module({
  imports: [CartModule, OrdersModule, PaymentsModule, RiskModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
