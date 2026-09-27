import { Module } from '@nestjs/common';
import { AdminSupportController, SupportController } from './support.controller';
import { SupportService } from './support.service';

/**
 * Support module — Support tickets and conversations for customers, restaurants, riders and admins.
 *
 * Owns tables: support_tickets, support_messages.
 * Implemented in slice: 17 — Support (docs/IMPLEMENTATION_PLAN.md).
 */
@Module({
  controllers: [SupportController, AdminSupportController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}
