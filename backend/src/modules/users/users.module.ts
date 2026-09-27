import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { UsersService } from './users.service';

/**
 * Users module — Common identity records and role assignment (ARCHITECTURE §6).
 *
 * Owns tables: users, user_roles.
 * Implemented in slice: 1 — Authentication (docs/IMPLEMENTATION_PLAN.md).
 */
@Module({
  controllers: [MeController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
