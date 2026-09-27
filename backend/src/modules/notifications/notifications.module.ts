import { Module, type OnModuleInit } from '@nestjs/common';
import { OutboxProcessor } from '../../common/outbox/outbox.processor';
import { ScheduledTasks } from '../../infrastructure/scheduler/scheduler';
import { LogNotificationSender, NOTIFICATION_SENDER } from './notification-sender';
import { NotificationEvents } from './notification-events';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/**
 * Notifications module — Notification records and channel delivery via provider abstractions (NOTIFICATION_RULES).
 *
 * Owns tables: notifications, notification_deliveries, notification_preferences, device_tokens.
 * Also maps domain events to realtime events (REALTIME_SPEC §63–65).
 */
@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationEvents,
    // Only the development/test adapter exists; configuration refuses it when deployed.
    { provide: NOTIFICATION_SENDER, useClass: LogNotificationSender },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule implements OnModuleInit {
  constructor(
    private readonly events: NotificationEvents,
    private readonly notifications: NotificationsService,
    private readonly outbox: OutboxProcessor,
    private readonly tasks: ScheduledTasks,
  ) {}

  onModuleInit(): void {
    for (const [eventType, handle] of Object.entries(this.events.handlers)) {
      this.outbox.register(eventType, `notifications:${eventType}`, handle);
    }
    this.tasks.register({
      name: 'notification-deliveries',
      everyMs: 5_000,
      run: () => this.notifications.processDeliveries(),
    });
  }
}
