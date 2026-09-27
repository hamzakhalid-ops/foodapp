import { Module } from '@nestjs/common';

/**
 * Riders module — Rider profiles, onboarding documents, online/availability state, location updates.
 *
 * Owns tables: rider_profiles, rider_documents, rider_location_events.
 * Implemented in slice: 10 — Dispatch / 11 — Rider Delivery (docs/IMPLEMENTATION_PLAN.md).
 *
 * Status: BOUNDARY ONLY. No business logic is implemented yet.
 */
@Module({})
export class RidersModule {}
