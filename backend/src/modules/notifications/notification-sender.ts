import { Logger } from '@nestjs/common';
import { type NotificationChannel } from '../../generated/prisma/client';

export interface OutgoingMessage {
  channel: Exclude<NotificationChannel, 'IN_APP'>;
  /** Push token, E.164 phone number or email address. */
  destination: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

/** Thrown for failures that must not be retried (invalid destination, provider rejection, §17). */
export class PermanentDeliveryError extends Error {}

/** Provider port for push/SMS/email (NOTIFICATION_RULES §32, CLAUDE.md §20). */
export interface NotificationSender {
  readonly name: string;
  send(message: OutgoingMessage): Promise<{ providerMessageId: string | null }>;
}

export const NOTIFICATION_SENDER = Symbol('NOTIFICATION_SENDER');

/**
 * DEVELOPMENT/TEST ONLY: logs instead of sending. Configuration refuses
 * `NOTIFICATION_DELIVERY=log` in staging/production.
 */
export class LogNotificationSender implements NotificationSender {
  readonly name = 'log';
  private readonly logger = new Logger('DevNotificationDelivery');

  send(message: OutgoingMessage): Promise<{ providerMessageId: string | null }> {
    this.logger.log(`[DEV ONLY] ${message.channel} "${message.title}"`);
    return Promise.resolve({ providerMessageId: null });
  }
}
