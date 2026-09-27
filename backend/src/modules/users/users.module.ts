import { Module } from '@nestjs/common';

/**
 * Users module — Common identity records and role assignment (ARCHITECTURE §6).
 *
 * Owns tables: users, user_roles.
 * Implemented in slice: 1 — Authentication (docs/IMPLEMENTATION_PLAN.md).
 *
 * Status: BOUNDARY ONLY. No business logic is implemented yet.
 */
@Module({})
export class UsersModule {}
