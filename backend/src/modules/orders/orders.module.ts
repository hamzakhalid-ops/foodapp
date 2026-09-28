import { Module } from '@nestjs/common';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { RiskModule } from '../risk/risk.module';
import { OrderStateMachine } from './order-state-machine';
import { CustomerOrdersController, OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { RestaurantAnalyticsController } from './restaurant-analytics.controller';
import { RestaurantAnalyticsService } from './restaurant-analytics.service';
import { RestaurantOrdersController } from './restaurant-orders.controller';
import { RestaurantOrdersService } from './restaurant-orders.service';

/**
 * Orders module — Order records, items, pricing snapshots and the backend-owned order state machine (ARCHITECTURE §10–13, ORDER_RULES).
 *
 * Owns tables: orders, order_items, order_item_variations, order_item_add_ons, order_status_history.
 * Implemented in slice: 7 — Checkout / 9 — Restaurant Orders (docs/IMPLEMENTATION_PLAN.md).
 */
@Module({
  imports: [RestaurantsModule, RiskModule, ReviewsModule],
  controllers: [
    OrdersController,
    CustomerOrdersController,
    RestaurantOrdersController,
    RestaurantAnalyticsController,
  ],
  providers: [
    OrdersService,
    OrderStateMachine,
    RestaurantOrdersService,
    RestaurantAnalyticsService,
  ],
  exports: [OrdersService, OrderStateMachine],
})
export class OrdersModule {}
