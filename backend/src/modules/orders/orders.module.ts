import { Module } from '@nestjs/common';
import { CustomerOrdersController, OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

/**
 * Orders module — Order records, items, pricing snapshots and the backend-owned order state machine (ARCHITECTURE §10–13, ORDER_RULES).
 *
 * Owns tables: orders, order_items, order_item_variations, order_item_add_ons, order_status_history.
 * Implemented in slice: 7 — Checkout / 9 — Restaurant Orders (docs/IMPLEMENTATION_PLAN.md).
 */
@Module({
  controllers: [OrdersController, CustomerOrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
