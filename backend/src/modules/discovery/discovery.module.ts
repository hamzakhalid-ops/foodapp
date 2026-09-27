import { Module } from '@nestjs/common';

/**
 * Discovery module — Customer-facing restaurant listing, details, menu read models and search (API_SPEC §28–31). Reads through the restaurants/menu modules' public services.
 *
 * Owns tables: (none — read-only over restaurants/menu).
 * Implemented in slice: 5 — Customer Discovery (docs/IMPLEMENTATION_PLAN.md).
 *
 * Status: BOUNDARY ONLY. No business logic is implemented yet.
 */
@Module({})
export class DiscoveryModule {}
