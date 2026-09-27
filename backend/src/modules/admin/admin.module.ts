import { Module } from '@nestjs/common';

/**
 * Admin module — Admin operations and system configuration. Acts only through domain modules' services; no direct table manipulation (ADMIN_SPEC §3, §67).
 *
 * Owns tables: system_settings.
 * Implemented in slice: 18 — Admin Operations (docs/IMPLEMENTATION_PLAN.md).
 *
 * Status: BOUNDARY ONLY. No business logic is implemented yet.
 */
@Module({})
export class AdminModule {}
