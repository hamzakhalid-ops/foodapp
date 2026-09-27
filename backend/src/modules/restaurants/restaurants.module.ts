import { Module, type OnModuleInit } from '@nestjs/common';
import { ScheduledTasks } from '../../infrastructure/scheduler/scheduler';
import { RestaurantAccessGuard } from './restaurant-access';
import { RestaurantReviewService } from './restaurant-review.service';
import {
  RestaurantOnboardingController,
  RestaurantOperationsController,
} from './restaurants.controller';
import { RestaurantsService } from './restaurants.service';

/**
 * Restaurants module — profile, onboarding/application lifecycle, documents, operating hours,
 * delivery settings, payment accounts, availability (ARCHITECTURE §7).
 *
 * Owns tables: restaurants, restaurant_applications, restaurant_documents,
 * restaurant_operating_hours, restaurant_delivery_settings, restaurant_payment_accounts,
 * restaurant_owner_profiles.
 * Implemented in slice: 3 — Restaurant Onboarding (docs/IMPLEMENTATION_PLAN.md).
 */
@Module({
  controllers: [RestaurantOnboardingController, RestaurantOperationsController],
  providers: [RestaurantsService, RestaurantReviewService, RestaurantAccessGuard],
  exports: [RestaurantsService, RestaurantReviewService, RestaurantAccessGuard],
})
export class RestaurantsModule implements OnModuleInit {
  constructor(
    private readonly tasks: ScheduledTasks,
    private readonly restaurants: RestaurantsService,
  ) {}

  onModuleInit(): void {
    this.tasks.register({
      name: 'restaurant-resume-pauses',
      everyMs: 30_000,
      run: () => this.restaurants.resumeExpiredPauses(),
    });
  }
}
