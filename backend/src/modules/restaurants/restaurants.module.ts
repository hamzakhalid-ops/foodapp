import { Module } from '@nestjs/common';

/**
 * Restaurants module — Restaurant profile, onboarding/application lifecycle, documents, operating hours, delivery settings, payment accounts, availability (ARCHITECTURE §7).
 *
 * Owns tables: restaurants, restaurant_applications, restaurant_documents, restaurant_operating_hours, restaurant_delivery_settings, restaurant_payment_accounts.
 * Implemented in slice: 3 — Restaurant Onboarding (docs/IMPLEMENTATION_PLAN.md).
 *
 * Status: BOUNDARY ONLY. No business logic is implemented yet.
 */
@Module({})
export class RestaurantsModule {}
