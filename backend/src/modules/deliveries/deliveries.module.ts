import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { RidersModule } from '../riders/riders.module';
import { DeliveriesController, RiderDeliveriesController } from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';

/**
 * Deliveries module — Delivery records, pickup/transit/completion, assignment history.
 *
 * Owns tables: deliveries, delivery_assignments.
 * Implemented in slice: 10 — Dispatch / 11 — Rider Delivery / 12 — Completion (docs/IMPLEMENTATION_PLAN.md).
 */
@Module({
  imports: [OrdersModule, RidersModule],
  controllers: [RiderDeliveriesController, DeliveriesController],
  providers: [DeliveriesService],
  exports: [DeliveriesService],
})
export class DeliveriesModule {}
