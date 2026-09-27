import { Module } from '@nestjs/common';

/**
 * Customers module — Customer profile and delivery addresses.
 *
 * Owns tables: customer_profiles, addresses.
 * Implemented in slice: 2 — Customer Profile (docs/IMPLEMENTATION_PLAN.md).
 *
 * Status: BOUNDARY ONLY. No business logic is implemented yet.
 */
@Module({})
export class CustomersModule {}
