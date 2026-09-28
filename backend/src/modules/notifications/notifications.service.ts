import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type NotificationListQuery,
  type NotificationPreferenceUpdate,
  type NotificationPreferenceView,
  type NotificationView,
  type RegisterDeviceRequest,
} from '@quickbite/validation';
import { notFound, unprocessable, validationError } from '../../common/http/errors';
import { decodeCursor, encodeCursor } from '../../common/http/pagination';
import { AppConfigService } from '../../config/app-config.service';
import {
  type Notification,
  type NotificationCategory,
  type NotificationChannel,
  Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { RealtimePublisher } from '../../infrastructure/realtime/realtime.publisher';
import {
  NOTIFICATION_SENDER,
  type NotificationSender,
  PermanentDeliveryError,
} from './notification-sender';
import {
  MANDATORY_CATEGORIES,
  type NotificationTemplate,
  type NotificationType,
  TEMPLATE_LOCALE,
  TEMPLATE_VERSION,
  TEMPLATES,
  type TemplateVars,
} from './templates';

const EXTERNAL_CHANNELS = ['PUSH', 'SMS', 'EMAIL'] as const;
const ALL_CATEGORIES: NotificationCategory[] = [
  'AUTHENTICATION',
  'SECURITY',
  'ORDER',
  'PAYMENT',
  'DELIVERY',
  'DISPATCH',
  'RESTAURANT',
  'RIDER',
  'EARNINGS',
  'SETTLEMENT',
  'PROMOTION',
  'REVIEW',
  'SUPPORT',
  'SYSTEM',
];

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  vars: TemplateVars;
  /** Non-sensitive references for the client (ids, statuses). */
  data: Record<string, string>;
  /** Deterministic key — the same logical notification is created once (§16). */
  dedupKey: string;
}

/**
 * Notifications (NOTIFICATION_RULES, API_SPEC §90–91). Every notification is stored in-app;
 * push/SMS/email deliveries are queued per channel and sent by `processDeliveries` through the
 * provider port with retries, so provider failures never affect business state (§18).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimePublisher,
    private readonly config: AppConfigService,
    @Inject(NOTIFICATION_SENDER) private readonly sender: NotificationSender,
  ) {}

  async notify(input: NotifyInput): Promise<void> {
    const template: NotificationTemplate = TEMPLATES[input.type];
    let notification: Notification;
    try {
      notification = await this.prisma.notification.create({
        data: {
          userId: input.userId,
          type: input.type,
          category: template.category,
          priority: template.priority,
          title: template.title(input.vars),
          body: template.body(input.vars),
          data: { ...input.data, templateVersion: TEMPLATE_VERSION, locale: TEMPLATE_LOCALE },
          dedupKey: input.dedupKey,
          deliveries: {
            create: { channel: 'IN_APP', status: 'DELIVERED', deliveredAt: new Date() },
          },
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
      throw error;
    }

    const channels = await this.allowedChannels(input.userId, template.category, template.channels);
    if (channels.length > 0) {
      await this.prisma.notificationDelivery.createMany({
        data: channels.map((channel) => ({ notificationId: notification.id, channel })),
      });
    }
    await this.realtime.publish([`user:${input.userId}`], {
      eventType: 'notification.created',
      resourceType: 'notification',
      resourceId: notification.id,
      data: {
        notificationId: notification.id,
        type: notification.type,
        category: notification.category,
        title: notification.title,
        body: notification.body,
      },
    });
  }

  /** Sends due push/SMS/email deliveries (worker task). */
  async processDeliveries(limit = 50): Promise<number> {
    const claimed = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE notification_deliveries SET status = 'PROCESSING', attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM notification_deliveries
        WHERE status = 'PENDING' AND next_attempt_at <= now()
        ORDER BY next_attempt_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id`;
    for (const { id } of claimed) await this.deliver(id);
    return claimed.length;
  }

  // ---------------------------------------------------------------- API (§90–91)

  async list(userId: string, query: NotificationListQuery) {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (query.cursor && !cursor) throw validationError({ cursor: 'Invalid cursor' });
    const rows = await this.prisma.notification.findMany({
      where: {
        userId,
        ...(query.read === undefined
          ? {}
          : { readAt: query.read === 'true' ? { not: null } : null }),
        ...(query.type ? { type: query.type } : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.at } },
                { createdAt: cursor.at, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    const unread = await this.prisma.notification.count({ where: { userId, readAt: null } });
    return {
      rows: page.map(toView),
      unread,
      nextCursor: rows.length > query.limit && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async get(userId: string, notificationId: string): Promise<NotificationView> {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });
    if (!notification) throw notFound('RESOURCE_NOT_FOUND', 'Notification not found.');
    return toView(notification);
  }

  async markRead(userId: string, notificationId: string): Promise<NotificationView> {
    await this.get(userId, notificationId);
    await this.prisma.notification.updateMany({
      where: { id: notificationId, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return this.get(userId, notificationId);
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  async preferences(userId: string): Promise<NotificationPreferenceView[]> {
    const rows = await this.prisma.notificationPreference.findMany({ where: { userId } });
    const stored = new Map(rows.map((row) => [`${row.category}:${row.channel}`, row.enabled]));
    return ALL_CATEGORIES.flatMap((category) =>
      EXTERNAL_CHANNELS.map((channel) => ({
        category,
        channel,
        mandatory: MANDATORY_CATEGORIES.has(category),
        enabled:
          MANDATORY_CATEGORIES.has(category) || (stored.get(`${category}:${channel}`) ?? true),
      })),
    );
  }

  async updatePreferences(
    userId: string,
    updates: NotificationPreferenceUpdate[],
  ): Promise<NotificationPreferenceView[]> {
    const blocked = updates.find(
      (update) => !update.enabled && MANDATORY_CATEGORIES.has(update.category),
    );
    if (blocked) {
      throw unprocessable(
        'VALIDATION_ERROR',
        `${blocked.category} notifications cannot be turned off.`,
      );
    }
    await this.prisma.$transaction(
      updates.map((update) =>
        this.prisma.notificationPreference.upsert({
          where: {
            userId_category_channel: { userId, category: update.category, channel: update.channel },
          },
          create: {
            userId,
            category: update.category,
            channel: update.channel,
            enabled: update.enabled,
          },
          update: { enabled: update.enabled },
        }),
      ),
    );
    return this.preferences(userId);
  }

  async registerDevice(userId: string, input: RegisterDeviceRequest): Promise<void> {
    await this.prisma.deviceToken.upsert({
      where: { userId_deviceId: { userId, deviceId: input.deviceId } },
      create: { userId, ...input },
      update: {
        platform: input.platform,
        pushToken: input.pushToken,
        active: true,
        lastSeenAt: new Date(),
      },
    });
  }

  async unregisterDevice(userId: string, deviceId: string): Promise<void> {
    await this.prisma.deviceToken.updateMany({
      where: { userId, deviceId },
      data: { active: false },
    });
  }

  // ---------------------------------------------------------------- internals

  private async allowedChannels(
    userId: string,
    category: NotificationCategory,
    channels: NotificationChannel[],
  ): Promise<NotificationChannel[]> {
    if (channels.length === 0) return [];
    const [user, disabled, devices] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      this.prisma.notificationPreference.findMany({
        where: { userId, category, enabled: false },
        select: { channel: true },
      }),
      this.prisma.deviceToken.count({ where: { userId, active: true } }),
    ]);
    const off = MANDATORY_CATEGORIES.has(category)
      ? new Set<NotificationChannel>()
      : new Set(disabled.map((row) => row.channel));
    return channels.filter((channel) => {
      if (off.has(channel)) return false;
      if (channel === 'PUSH') return devices > 0;
      if (channel === 'SMS') return Boolean(user.phone && user.phoneVerifiedAt);
      if (channel === 'EMAIL') return Boolean(user.email);
      return false;
    });
  }

  private async deliver(deliveryId: string): Promise<void> {
    const delivery = await this.prisma.notificationDelivery.findUniqueOrThrow({
      where: { id: deliveryId },
      include: { notification: { include: { user: true } } },
    });
    const { notification } = delivery;
    const channel = delivery.channel as (typeof EXTERNAL_CHANNELS)[number];
    const destinations =
      channel === 'PUSH'
        ? (
            await this.prisma.deviceToken.findMany({
              where: { userId: notification.userId, active: true },
            })
          ).map((device) => device.pushToken)
        : [channel === 'SMS' ? notification.user.phone : notification.user.email].filter(
            (value): value is string => Boolean(value),
          );
    try {
      if (destinations.length === 0) throw new PermanentDeliveryError('No destination');
      let providerMessageId: string | null = null;
      for (const destination of destinations) {
        const result = await this.sender.send({
          channel,
          destination,
          title: notification.title,
          body: notification.body,
          data: (notification.data ?? {}) as Record<string, unknown>,
        });
        providerMessageId ??= result.providerMessageId;
      }
      await this.prisma.notificationDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'SENT',
          provider: this.sender.name,
          providerMessageId,
          sentAt: new Date(),
          lastError: null,
        },
      });
    } catch (error) {
      const permanent = error instanceof PermanentDeliveryError;
      const exhausted = delivery.attempts >= this.config.get('NOTIFICATION_MAX_ATTEMPTS');
      const message = error instanceof Error ? error.message.slice(0, 500) : 'Delivery failed';
      this.logger.warn(
        { deliveryId, channel, permanent, attempts: delivery.attempts },
        'Notification delivery failed',
      );
      await this.prisma.notificationDelivery.update({
        where: { id: deliveryId },
        data:
          permanent || exhausted
            ? {
                status: 'FAILED',
                failedAt: new Date(),
                lastError: message,
                provider: this.sender.name,
              }
            : {
                status: 'PENDING',
                lastError: message,
                // Backoff: 10 s, 20 s, 40 s … capped at 1 h (NOTIFICATION_RULES §17).
                nextAttemptAt: new Date(
                  Date.now() + Math.min(10_000 * 2 ** (delivery.attempts - 1), 3_600_000),
                ),
              },
      });
    }
  }
}

function toView(notification: Notification): NotificationView {
  return {
    id: notification.id,
    type: notification.type,
    category: notification.category,
    priority: notification.priority,
    title: notification.title,
    body: notification.body,
    data: (notification.data ?? {}) as Record<string, unknown>,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  };
}
