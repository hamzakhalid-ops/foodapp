import { Module } from '@nestjs/common';

/**
 * Notifications module — Notification records and channel delivery via provider abstractions (NOTIFICATION_RULES).
 *
 * Owns tables: notifications, notification_deliveries.
 * Implemented in slice: Cross-slice (first use: 3 — Restaurant Onboarding) (docs/IMPLEMENTATION_PLAN.md).
 *
 * Status: BOUNDARY ONLY. No business logic is implemented yet.
 */
@Module({})
export class NotificationsModule {}
