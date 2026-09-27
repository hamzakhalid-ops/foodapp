import { Injectable } from '@nestjs/common';
import { formatMoney, money } from '../../common/money/money';
import { type OutboxEvent, type OrderStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { RealtimePublisher } from '../../infrastructure/realtime/realtime.publisher';
import { isReleasedToRestaurant } from '../orders/orders.service';
import { NotificationsService } from './notifications.service';
import { type NotificationType } from './templates';

type Payload = Record<string, string | boolean | number | null | undefined>;

/** Customer notification per order status (NOTIFICATION_RULES §9, §23–24). */
const CUSTOMER_STATUS_TYPES: Partial<Record<OrderStatus, NotificationType>> = {
  RESTAURANT_ACCEPTED: 'ORDER_ACCEPTED',
  PREPARING: 'ORDER_PREPARING',
  READY_FOR_PICKUP: 'ORDER_READY',
  RIDER_ASSIGNED: 'ORDER_RIDER_ASSIGNED',
  PICKED_UP: 'ORDER_PICKED_UP',
  OUT_FOR_DELIVERY: 'ORDER_OUT_FOR_DELIVERY',
  DELIVERED: 'ORDER_DELIVERED',
  CANCELLED_BY_CUSTOMER: 'ORDER_CANCELLED',
  CANCELLED_BY_ADMIN: 'ORDER_CANCELLED',
  CANCELLED_BY_RESTAURANT: 'ORDER_REJECTED',
};

/**
 * Turns committed domain events (outbox) into notifications and realtime events
 * (NOTIFICATION_RULES §2.2–2.3, REALTIME_SPEC §63–65). Handlers are idempotent: notifications use
 * deterministic dedup keys; realtime duplicates are tolerated by clients (REALTIME_SPEC §21).
 * Realtime payloads carry ids and statuses only; clients fetch details over REST.
 */
@Injectable()
export class NotificationEvents {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimePublisher,
  ) {}

  readonly handlers: Record<string, (event: OutboxEvent) => Promise<void>> = {
    'order.created': (event) => this.orderCreated(payload(event)),
    'order.status_changed': (event) => this.orderStatusChanged(payload(event)),
    'payment.status_changed': (event) => this.paymentStatusChanged(payload(event)),
    'refund.succeeded': (event) => this.refundSucceeded(payload(event), event.id),
    'dispatch.offer_created': (event) =>
      this.offer(payload(event), 'delivery.offer_created', 'DELIVERY_OFFER'),
    'dispatch.offer_expired': (event) =>
      this.offer(payload(event), 'delivery.offer_expired', 'DELIVERY_OFFER_EXPIRED'),
    'delivery.assigned': (event) =>
      this.delivery(payload(event), 'delivery.assigned', 'DELIVERY_ASSIGNED'),
    'delivery.arriving_at_restaurant': (event) =>
      this.delivery(payload(event), 'delivery.status_changed', null),
    'delivery.picked_up': (event) => this.delivery(payload(event), 'delivery.status_changed', null),
    'delivery.out_for_delivery': (event) =>
      this.delivery(payload(event), 'delivery.status_changed', null),
    'delivery.delivered': (event) =>
      this.delivery(payload(event), 'delivery.status_changed', 'DELIVERY_COMPLETED'),
    'delivery.cancelled': (event) =>
      this.delivery(payload(event), 'delivery.cancelled', 'DELIVERY_CANCELLED'),
    'dispatch.failed': (event) => this.dispatchFailed(payload(event)),
    'restaurant.application_submitted': (event) =>
      this.restaurantSubmitted(payload(event), event.id),
    'restaurant.application_reviewed': (event) => this.restaurantReviewed(payload(event), event.id),
    'rider.application_submitted': (event) => this.riderSubmitted(payload(event), event.id),
    'rider.status_changed': (event) => this.riderStatusChanged(payload(event), event.id),
    'review.created': (event) => this.reviewCreated(payload(event)),
    'review.responded': (event) => this.reviewResponded(payload(event)),
    'support.ticket_created': (event) => this.supportCreated(payload(event), event.id),
    'support.message_created': (event) => this.supportMessage(payload(event), event.id),
    'support.ticket_status_changed': (event) => this.supportStatus(payload(event), event.id),
  };

  private async orderCreated(p: Payload): Promise<void> {
    const order = await this.order(String(p.orderId));
    await this.realtime.publish([`user:${order.customerId}`, `order:${order.id}`], {
      eventType: 'order.created',
      resourceType: 'order',
      resourceId: order.id,
      data: { orderId: order.id, status: order.status },
    });
    await this.notifications.notify({
      userId: order.customerId,
      type: 'ORDER_CREATED',
      vars: { orderNumber: order.orderNumber, restaurantName: order.restaurant.name },
      data: { orderId: order.id },
      dedupKey: `order:${order.id}:created:user:${order.customerId}`,
    });
    if (isReleasedToRestaurant(order)) await this.newOrderForRestaurant(order);
  }

  private async orderStatusChanged(p: Payload): Promise<void> {
    const order = await this.order(String(p.orderId));
    const toStatus = String(p.toStatus) as OrderStatus;
    const released = isReleasedToRestaurant(order);
    await this.realtime.publish(
      [
        `order:${order.id}`,
        `user:${order.customerId}`,
        ...(released ? [`restaurant:${order.restaurantId}:orders`] : []),
      ],
      {
        eventType: 'order.status_changed',
        resourceType: 'order',
        resourceId: order.id,
        data: { orderId: order.id, fromStatus: p.fromStatus ?? null, toStatus },
      },
    );
    const type = CUSTOMER_STATUS_TYPES[toStatus];
    if (type) {
      await this.notifications.notify({
        userId: order.customerId,
        type,
        vars: { orderNumber: order.orderNumber, restaurantName: order.restaurant.name },
        data: { orderId: order.id, status: toStatus },
        dedupKey: `order:${order.id}:status:${toStatus}:user:${order.customerId}`,
      });
    }
    if (released && (toStatus === 'CANCELLED_BY_CUSTOMER' || toStatus === 'CANCELLED_BY_ADMIN')) {
      for (const userId of await this.staffOf(order.restaurantId)) {
        await this.notifications.notify({
          userId,
          type: 'RESTAURANT_ORDER_CANCELLED',
          vars: { orderNumber: order.orderNumber },
          data: { orderId: order.id },
          dedupKey: `order:${order.id}:status:${toStatus}:user:${userId}`,
        });
      }
    }
  }

  private async paymentStatusChanged(p: Payload): Promise<void> {
    const order = await this.order(String(p.orderId));
    const toStatus = String(p.toStatus);
    await this.realtime.publish([`order:${order.id}`, `user:${order.customerId}`], {
      eventType: 'payment.status_changed',
      resourceType: 'payment',
      resourceId: String(p.paymentId),
      data: { paymentId: String(p.paymentId), orderId: order.id, toStatus },
    });
    if (toStatus === 'SUCCEEDED' || toStatus === 'FAILED') {
      await this.notifications.notify({
        userId: order.customerId,
        type: toStatus === 'SUCCEEDED' ? 'PAYMENT_SUCCEEDED' : 'PAYMENT_FAILED',
        vars: { orderNumber: order.orderNumber },
        data: { orderId: order.id, paymentId: String(p.paymentId) },
        dedupKey: `payment:${String(p.paymentId)}:${toStatus}`,
      });
    }
    // An online order reaches the restaurant once payment is confirmed (PAYMENT_RULES §8).
    if (
      order.status === 'PENDING' &&
      order.paymentMethod === 'ONLINE_PAYMENT' &&
      isReleasedToRestaurant(order)
    ) {
      await this.newOrderForRestaurant(order);
    }
  }

  private async refundSucceeded(p: Payload, eventId: string): Promise<void> {
    const order = await this.order(String(p.orderId));
    await this.notifications.notify({
      userId: order.customerId,
      type: 'PAYMENT_REFUNDED',
      vars: {
        orderNumber: order.orderNumber,
        amount: formatMoney(money(String(p.amount))),
        currency: order.currency,
      },
      data: { orderId: order.id, refundId: String(p.refundId) },
      dedupKey: `refund:${String(p.refundId)}:${eventId}`,
    });
  }

  private async offer(p: Payload, eventType: string, type: NotificationType): Promise<void> {
    const rider = await this.prisma.riderProfile.findUniqueOrThrow({
      where: { id: String(p.riderId) },
    });
    const order = await this.order(String(p.orderId));
    await this.realtime.publish([`rider:${rider.id}`], {
      eventType,
      resourceType: 'dispatch_offer',
      resourceId: String(p.offerId),
      data: { offerId: String(p.offerId), orderId: order.id, expiresAt: p.expiresAt ?? null },
    });
    await this.notifications.notify({
      userId: rider.userId,
      type,
      vars: { orderNumber: order.orderNumber, restaurantName: order.restaurant.name },
      data: { offerId: String(p.offerId), orderId: order.id },
      dedupKey: `offer:${String(p.offerId)}:${type}`,
    });
  }

  private async delivery(
    p: Payload,
    eventType: string,
    type: NotificationType | null,
  ): Promise<void> {
    const delivery = await this.prisma.delivery.findUniqueOrThrow({
      where: { id: String(p.deliveryId) },
      include: { rider: true, order: true },
    });
    await this.realtime.publish(
      [
        `delivery:${delivery.id}`,
        `order:${delivery.orderId}`,
        ...(delivery.riderId ? [`rider:${delivery.riderId}`] : []),
      ],
      {
        eventType,
        resourceType: 'delivery',
        resourceId: delivery.id,
        data: { deliveryId: delivery.id, orderId: delivery.orderId, status: delivery.status },
      },
    );
    const riderUserId = delivery.rider?.userId;
    if (type && riderUserId) {
      await this.notifications.notify({
        userId: riderUserId,
        type,
        vars: { orderNumber: delivery.order.orderNumber },
        data: { deliveryId: delivery.id, orderId: delivery.orderId },
        dedupKey: `delivery:${delivery.id}:${type}:user:${riderUserId}`,
      });
    }
  }

  private async dispatchFailed(p: Payload): Promise<void> {
    await this.realtime.publish(['admin:dispatch', 'admin:operations'], {
      eventType: 'dispatch.failed',
      resourceType: 'order',
      resourceId: String(p.orderId),
      data: { orderId: String(p.orderId), deliveryId: String(p.deliveryId) },
    });
  }

  private async restaurantSubmitted(p: Payload, eventId: string): Promise<void> {
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: String(p.restaurantId) },
    });
    for (const userId of await this.admins()) {
      await this.notifications.notify({
        userId,
        type: 'RESTAURANT_APPLICATION_SUBMITTED',
        vars: { restaurantName: restaurant.name },
        data: { restaurantId: restaurant.id },
        dedupKey: `restaurant:${restaurant.id}:submitted:${eventId}:user:${userId}`,
      });
    }
  }

  private async restaurantReviewed(p: Payload, eventId: string): Promise<void> {
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: String(p.restaurantId) },
    });
    const types: Record<string, NotificationType> = {
      APPROVED: 'RESTAURANT_APPLICATION_APPROVED',
      REJECTED: 'RESTAURANT_APPLICATION_REJECTED',
      RESUBMISSION_REQUIRED: 'RESTAURANT_RESUBMISSION_REQUIRED',
    };
    const type = types[String(p.decision)];
    if (!type) return;
    await this.notifications.notify({
      userId: restaurant.ownerUserId,
      type,
      vars: { restaurantName: restaurant.name },
      data: { restaurantId: restaurant.id },
      dedupKey: `restaurant:${restaurant.id}:review:${eventId}`,
    });
  }

  private async riderSubmitted(p: Payload, eventId: string): Promise<void> {
    for (const userId of await this.admins()) {
      await this.notifications.notify({
        userId,
        type: 'RIDER_APPLICATION_SUBMITTED',
        vars: {},
        data: { riderId: String(p.riderId) },
        dedupKey: `rider:${String(p.riderId)}:submitted:${eventId}:user:${userId}`,
      });
    }
  }

  private async riderStatusChanged(p: Payload, eventId: string): Promise<void> {
    const type: NotificationType | null =
      p.approvalStatus === 'APPROVED'
        ? 'RIDER_ACCOUNT_APPROVED'
        : p.approvalStatus === 'REJECTED'
          ? 'RIDER_ACCOUNT_REJECTED'
          : null;
    if (!type) return;
    await this.notifications.notify({
      userId: String(p.userId),
      type,
      vars: {},
      data: { riderId: String(p.riderId) },
      dedupKey: `rider:${String(p.riderId)}:status:${eventId}`,
    });
  }

  private async reviewCreated(p: Payload): Promise<void> {
    const order = await this.order(String(p.orderId));
    for (const userId of await this.staffOf(order.restaurantId)) {
      await this.notifications.notify({
        userId,
        type: 'REVIEW_RECEIVED',
        vars: { orderNumber: order.orderNumber, rating: String(p.rating) },
        data: { reviewId: String(p.reviewId) },
        dedupKey: `review:${String(p.reviewId)}:received:user:${userId}`,
      });
    }
  }

  private async reviewResponded(p: Payload): Promise<void> {
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: String(p.restaurantId) },
    });
    await this.notifications.notify({
      userId: String(p.customerId),
      type: 'REVIEW_RESPONSE',
      vars: { restaurantName: restaurant.name },
      data: { reviewId: String(p.reviewId) },
      dedupKey: `review:${String(p.reviewId)}:response`,
    });
  }

  private async supportCreated(p: Payload, eventId: string): Promise<void> {
    const ticketId = String(p.ticketId);
    await this.realtime.publish(['admin:support'], {
      eventType: 'support.ticket_created',
      resourceType: 'support_ticket',
      resourceId: ticketId,
      data: { ticketId, priority: p.priority ?? null },
    });
    for (const userId of await this.admins()) {
      await this.notifications.notify({
        userId,
        type: 'SUPPORT_TICKET_CREATED',
        vars: { ticketNumber: String(p.ticketNumber), priority: String(p.priority) },
        data: { ticketId },
        dedupKey: `support:${ticketId}:created:${eventId}:user:${userId}`,
      });
    }
  }

  /** Internal notes stay on admin channels only (SUPPORT_RULES §17). */
  private async supportMessage(p: Payload, eventId: string): Promise<void> {
    const ticketId = String(p.ticketId);
    const internal = p.internal === true;
    await this.realtime.publish(
      internal ? ['admin:support'] : [`support_ticket:${ticketId}`, 'admin:support'],
      {
        eventType: 'support.message_created',
        resourceType: 'support_ticket',
        resourceId: ticketId,
        data: { ticketId, internal },
      },
    );
    if (internal || p.fromSupport !== true) return;
    await this.notifications.notify({
      userId: String(p.requesterId),
      type: 'SUPPORT_TICKET_MESSAGE',
      vars: { ticketNumber: String(p.ticketNumber) },
      data: { ticketId },
      dedupKey: `support:${ticketId}:message:${eventId}`,
    });
  }

  private async supportStatus(p: Payload, eventId: string): Promise<void> {
    const ticketId = String(p.ticketId);
    await this.realtime.publish([`support_ticket:${ticketId}`, 'admin:support'], {
      eventType: 'support.ticket_updated',
      resourceType: 'support_ticket',
      resourceId: ticketId,
      data: { ticketId, status: p.status ?? null },
    });
    if (p.status !== 'RESOLVED' && p.status !== 'WAITING_FOR_CUSTOMER') return;
    await this.notifications.notify({
      userId: String(p.requesterId),
      type: 'SUPPORT_TICKET_UPDATED',
      vars: {
        ticketNumber: String(p.ticketNumber),
        status: p.status.toLowerCase().replaceAll('_', ' '),
      },
      data: { ticketId },
      dedupKey: `support:${ticketId}:status:${eventId}`,
    });
  }

  private async newOrderForRestaurant(order: Awaited<ReturnType<NotificationEvents['order']>>) {
    await this.realtime.publish(
      [`restaurant:${order.restaurantId}:orders`, `restaurant:${order.restaurantId}`],
      {
        eventType: 'order.created',
        resourceType: 'order',
        resourceId: order.id,
        data: { orderId: order.id, orderNumber: order.orderNumber, status: order.status },
      },
    );
    for (const userId of await this.staffOf(order.restaurantId)) {
      await this.notifications.notify({
        userId,
        type: 'RESTAURANT_NEW_ORDER',
        vars: { orderNumber: order.orderNumber },
        data: { orderId: order.id },
        dedupKey: `order:${order.id}:new-for-restaurant:user:${userId}`,
      });
    }
  }

  private order(orderId: string) {
    return this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { restaurant: true },
    });
  }

  private async staffOf(restaurantId: string): Promise<string[]> {
    const staff = await this.prisma.restaurantStaff.findMany({
      where: { restaurantId, status: 'ACTIVE' },
      select: { userId: true },
    });
    return staff.map((row) => row.userId);
  }

  private async admins(): Promise<string[]> {
    const rows = await this.prisma.userRole.findMany({
      where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, user: { status: 'ACTIVE' } },
      select: { userId: true },
      distinct: ['userId'],
    });
    return rows.map((row) => row.userId);
  }
}

function payload(event: OutboxEvent): Payload {
  return (event.payload ?? {}) as Payload;
}
