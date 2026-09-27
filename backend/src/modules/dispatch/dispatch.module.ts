import { Module } from '@nestjs/common';

/**
 * Dispatch module — Dispatch Engine — eligibility, ranking, offers, atomic assignment, radius expansion (DISPATCH_RULES). Never broadcasts globally.
 *
 * Owns tables: dispatch_offers, delivery_assignments, dispatch_settings.
 * Implemented in slice: 10 — Dispatch (docs/IMPLEMENTATION_PLAN.md).
 *
 * Status: BOUNDARY ONLY. No business logic is implemented yet.
 */
@Module({})
export class DispatchModule {}
