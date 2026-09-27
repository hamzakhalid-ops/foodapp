import { Module } from '@nestjs/common';

/**
 * Support module — Support tickets and messages (SUPPORT_RULES). Support cannot bypass business integrity.
 *
 * Owns tables: support_tickets, support_messages.
 * Implemented in slice: 17 — Support (docs/IMPLEMENTATION_PLAN.md).
 *
 * Status: BOUNDARY ONLY. No business logic is implemented yet.
 */
@Module({})
export class SupportModule {}
