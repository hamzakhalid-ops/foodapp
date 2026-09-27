import { Module } from '@nestjs/common';

/**
 * Auth module — Registration, login/logout, sessions and refresh tokens, verification, password management, account status checks (ARCHITECTURE §5, AUTH_AUTHORIZATION).
 *
 * Owns tables: Session/refresh-token storage defined in AUTH_AUTHORIZATION but not yet in DATABASE.md (see REPOSITORY_CONSISTENCY_REPORT).
 * Implemented in slice: 1 — Authentication (docs/IMPLEMENTATION_PLAN.md).
 *
 * Status: BOUNDARY ONLY. No business logic is implemented yet.
 */
@Module({})
export class AuthModule {}
