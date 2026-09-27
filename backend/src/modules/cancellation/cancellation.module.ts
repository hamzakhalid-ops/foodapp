import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import {
  AdminCancellationController,
  CustomerCancellationController,
  RestaurantCancellationController,
} from './cancellation.controller';
import { CancellationService } from './cancellation.service';

/**
 * Cancellation module — Cancellation Rules Engine — cancellation eligibility and records (ARCHITECTURE §14, CANCELLATION_RULES).
 *
 * Owns tables: order_cancellations.
 * Implemented in slice: 7 — Checkout / 9 — Restaurant Orders (docs/IMPLEMENTATION_PLAN.md).
 */
@Module({
  imports: [OrdersModule, RestaurantsModule],
  controllers: [
    CustomerCancellationController,
    RestaurantCancellationController,
    AdminCancellationController,
  ],
  providers: [CancellationService],
  exports: [CancellationService],
})
export class CancellationModule {}
