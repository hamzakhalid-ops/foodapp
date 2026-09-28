import { Module, type OnModuleInit } from '@nestjs/common';
import { OutboxProcessor } from '../../common/outbox/outbox.processor';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { RidersModule } from '../riders/riders.module';
import { RestaurantEarningsController, RiderEarningsController } from './earnings.controller';
import { EarningsService } from './earnings.service';

/**
 * Earnings module — Restaurant and rider earnings records (FINANCIAL_SPEC §7–22, ADR-0014 §2).
 *
 * Owns tables: restaurant_earnings, rider_earnings.
 * Implemented in slice: 13 — Earnings (docs/IMPLEMENTATION_PLAN.md).
 */
@Module({
  imports: [RestaurantsModule, RidersModule],
  controllers: [RestaurantEarningsController, RiderEarningsController],
  providers: [EarningsService],
  exports: [EarningsService],
})
export class EarningsModule implements OnModuleInit {
  constructor(
    private readonly earnings: EarningsService,
    private readonly outbox: OutboxProcessor,
  ) {}

  onModuleInit(): void {
    this.outbox.register('delivery.delivered', 'earnings.record', async (event) => {
      await this.earnings.recordForDelivery((event.payload as { deliveryId: string }).deliveryId);
    });
  }
}
