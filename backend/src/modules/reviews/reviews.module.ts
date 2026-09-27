import { Module } from '@nestjs/common';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import {
  AdminReviewsController,
  CustomerReviewsController,
  RestaurantReviewsController,
} from './reviews.controller';
import { ReviewsService } from './reviews.service';

/**
 * Reviews module — Customer → restaurant reviews (1–5), eligibility after DELIVERED, one review per order, moderation, restaurant responses.
 *
 * Owns tables: reviews, review_responses, review_reports.
 * Implemented in slice: 16 — Reviews (docs/IMPLEMENTATION_PLAN.md).
 */
@Module({
  imports: [RestaurantsModule],
  controllers: [CustomerReviewsController, RestaurantReviewsController, AdminReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
