import { Module } from '@nestjs/common';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { RestaurantStaffController } from './restaurant-staff.controller';
import { RestaurantStaffService } from './restaurant-staff.service';

/**
 * RestaurantStaff module — restaurant membership for RESTAURANT_OWNER / RESTAURANT_OPERATOR and
 * tenant resolution (ARCHITECTURE §8). No additional restaurant roles.
 *
 * Owns tables: restaurant_staff.
 * Implemented in slice: 3 — Restaurant Onboarding (docs/IMPLEMENTATION_PLAN.md).
 */
@Module({
  imports: [RestaurantsModule],
  controllers: [RestaurantStaffController],
  providers: [RestaurantStaffService],
  exports: [RestaurantStaffService],
})
export class RestaurantStaffModule {}
