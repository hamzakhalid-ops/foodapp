import { Module } from '@nestjs/common';

/**
 * RestaurantStaff module — Restaurant membership for RESTAURANT_OWNER / RESTAURANT_OPERATOR and tenant resolution (ARCHITECTURE §8). No additional restaurant roles.
 *
 * Owns tables: restaurant_staff.
 * Implemented in slice: 3 — Restaurant Onboarding (docs/IMPLEMENTATION_PLAN.md).
 *
 * Status: BOUNDARY ONLY. No business logic is implemented yet.
 */
@Module({})
export class RestaurantStaffModule {}
