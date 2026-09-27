import { Module, type OnModuleInit } from '@nestjs/common';
import { ScheduledTasks } from '../../infrastructure/scheduler/scheduler';
import { CartModule } from '../cart/cart.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import {
  AdminPromotionsController,
  CustomerPromotionsController,
  RestaurantPromotionsController,
} from './promotions.controller';
import { PromotionsService } from './promotions.service';

/**
 * Promotions module — PERCENTAGE / FIXED_AMOUNT promotions, eligibility and redemption; one promotion per order (PROMOTION_RULES).
 *
 * Owns tables: promotions, promotion_usages.
 * Implemented in slice: 15 — Promotions (docs/IMPLEMENTATION_PLAN.md).
 */
@Module({
  imports: [CartModule, RestaurantsModule],
  controllers: [
    RestaurantPromotionsController,
    AdminPromotionsController,
    CustomerPromotionsController,
  ],
  providers: [PromotionsService],
  exports: [PromotionsService],
})
export class PromotionsModule implements OnModuleInit {
  constructor(
    private readonly promotions: PromotionsService,
    private readonly tasks: ScheduledTasks,
  ) {}

  onModuleInit(): void {
    this.tasks.register({
      name: 'promotions-expire',
      everyMs: 60_000,
      run: () => this.promotions.expireEnded(),
    });
  }
}
