import { Module } from '@nestjs/common';

/**
 * Cart module — Server-side cart and backend recalculation (API_SPEC §32–36).
 *
 * Owns tables: Cart storage is not defined in DATABASE.md (see REPOSITORY_CONSISTENCY_REPORT).
 * Implemented in slice: 6 — Cart (docs/IMPLEMENTATION_PLAN.md).
 *
 * Status: BOUNDARY ONLY. No business logic is implemented yet.
 */
@Module({})
export class CartModule {}
