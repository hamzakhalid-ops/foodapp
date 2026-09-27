import { Module } from '@nestjs/common';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { DiscoveryController } from './discovery.controller';
import { DiscoveryService } from './discovery.service';

/**
 * Discovery module — Customer-facing restaurant listing, details, menu read models and search (API_SPEC §28–31). Reads through the restaurants/menu modules' public services.
 *
 * Owns tables: (none — read-only over restaurants/menu).
 * Implemented in slice: 5 — Customer Discovery (docs/IMPLEMENTATION_PLAN.md).
 */
@Module({
  imports: [RestaurantsModule, ReviewsModule],
  controllers: [DiscoveryController],
  providers: [DiscoveryService],
})
export class DiscoveryModule {}
