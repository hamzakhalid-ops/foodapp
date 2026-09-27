import { Module } from '@nestjs/common';
import { RiskModule } from '../risk/risk.module';
import { RiderLocationStore } from './rider-location.store';
import { RiderReviewService } from './rider-review.service';
import { AdminRidersController, RidersController } from './riders.controller';
import { RidersService } from './riders.service';

/**
 * Riders module — Rider profiles, onboarding documents, online/availability state, location updates.
 *
 * Owns tables: rider_profiles, rider_documents (current locations live in Redis).
 * Implemented in slice: 10 — Dispatch / 11 — Rider Delivery (docs/IMPLEMENTATION_PLAN.md).
 */
@Module({
  imports: [RiskModule],
  controllers: [RidersController, AdminRidersController],
  providers: [RidersService, RiderReviewService, RiderLocationStore],
  exports: [RidersService, RiderLocationStore],
})
export class RidersModule {}
