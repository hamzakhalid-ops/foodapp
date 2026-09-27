import { Injectable } from '@nestjs/common';
import {
  type CompleteDeliveryRequest,
  type Delivery as DeliveryView,
  type RiderDeliveryListQuery,
} from '@quickbite/validation';
import { type AuthContext } from '../../common/auth/auth.decorators';
import { conflict, notFound, unprocessable, validationError } from '../../common/http/errors';
import { decodeCursor, encodeCursor } from '../../common/http/pagination';
import { formatMoney, money } from '../../common/money/money';
import { OutboxService } from '../../common/outbox/outbox.service';
import { type DeliveryStatus, type OrderStatus, type Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { OrderStateMachine } from '../orders/order-state-machine';
import { ACTIVE_DELIVERY_STATUSES, RidersService } from '../riders/riders.service';

type Tx = Prisma.TransactionClient;

const DELIVERY_INCLUDE = {
  order: { include: { restaurant: true } },
} satisfies Prisma.DeliveryInclude;
type DeliveryRow = Prisma.DeliveryGetPayload<{ include: typeof DELIVERY_INCLUDE }>;

const ADMIN_ROLES = new Set(['ADMIN', 'SUPER_ADMIN']);

/** Rider step → (allowed delivery states, next delivery state, order transition). */
const STEPS: Record<
  'arriving' | 'pickup' | 'outForDelivery',
  { from: DeliveryStatus[]; to: DeliveryStatus; order: OrderStatus | null }
> = {
  arriving: { from: ['ASSIGNED'], to: 'ARRIVING_AT_RESTAURANT', order: null },
  pickup: { from: ['ASSIGNED', 'ARRIVING_AT_RESTAURANT'], to: 'PICKED_UP', order: 'PICKED_UP' },
  outForDelivery: { from: ['PICKED_UP'], to: 'OUT_FOR_DELIVERY', order: 'OUT_FOR_DELIVERY' },
};

/**
 * Deliveries (API_SPEC §73–74, DISPATCH_RULES §20, §27–30, DATABASE.md §35, §37). Only the
 * assigned rider moves a delivery; each step moves the order through the order state machine in
 * the same transaction.
 */
@Injectable()
export class DeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly riders: RidersService,
    private readonly stateMachine: OrderStateMachine,
    private readonly outbox: OutboxService,
  ) {}

  /** The order's delivery, created when the order becomes READY_FOR_PICKUP. */
  ensureForOrder(tx: Tx, orderId: string) {
    return tx.delivery.upsert({ where: { orderId }, create: { orderId }, update: {} });
  }

  /**
   * Atomic assignment (DISPATCH_RULES §18–21): PENDING → ASSIGNED only once, assignment history,
   * rider busy, order READY_FOR_PICKUP → RIDER_ASSIGNED.
   */
  async assign(
    tx: Tx,
    input: { deliveryId: string; riderId: string; actorUserId: string; reason: string },
  ): Promise<void> {
    const updated = await tx.delivery.updateMany({
      where: { id: input.deliveryId, status: 'PENDING' },
      data: { riderId: input.riderId, status: 'ASSIGNED' },
    });
    if (updated.count === 0) {
      throw conflict('DELIVERY_ALREADY_ASSIGNED', 'This delivery has already been assigned.');
    }
    const delivery = await tx.delivery.findUniqueOrThrow({ where: { id: input.deliveryId } });
    await tx.deliveryAssignment.create({
      data: { deliveryId: delivery.id, riderId: input.riderId, reason: input.reason },
    });
    await tx.riderProfile.update({ where: { id: input.riderId }, data: { isAvailable: false } });
    await this.stateMachine.transition(tx, {
      orderId: delivery.orderId,
      to: 'RIDER_ASSIGNED',
      actorUserId: input.actorUserId,
      metadata: { deliveryId: delivery.id, riderId: input.riderId },
    });
    await this.outbox.enqueue(tx, {
      eventType: 'delivery.assigned',
      aggregateType: 'delivery',
      aggregateId: delivery.id,
      payload: { deliveryId: delivery.id, orderId: delivery.orderId, riderId: input.riderId },
    });
  }

  arriving(userId: string, deliveryId: string) {
    return this.step(userId, deliveryId, 'arriving');
  }

  pickup(userId: string, deliveryId: string) {
    return this.step(userId, deliveryId, 'pickup');
  }

  outForDelivery(userId: string, deliveryId: string) {
    return this.step(userId, deliveryId, 'outForDelivery');
  }

  /**
   * OUT_FOR_DELIVERY → DELIVERED by the assigned rider (ADR-0014 §11). For cash on delivery the
   * rider confirms the cash was collected and the payment becomes SUCCEEDED in the same
   * transaction (ADR-0014 §10).
   */
  async complete(
    userId: string,
    deliveryId: string,
    input: CompleteDeliveryRequest,
  ): Promise<DeliveryView> {
    const rider = await this.riders.requireByUser(userId);
    await this.prisma.$transaction(async (tx) => {
      const delivery = await this.lockOwn(tx, rider.id, deliveryId);
      if (delivery.status !== 'OUT_FOR_DELIVERY') throw invalidStep(delivery.status);
      const order = delivery.order;
      const cash = order.paymentMethod === 'CASH_ON_DELIVERY';
      if (cash && input.cashCollected !== true) {
        throw unprocessable(
          'INVALID_REQUEST',
          'Confirm that the cash was collected. Report non-receipt through support.',
        );
      }
      const now = new Date();
      await tx.delivery.update({
        where: { id: delivery.id },
        data: { status: 'DELIVERED', deliveredAt: now, deliveryNotes: input.notes ?? null },
      });
      await this.stateMachine.transition(tx, {
        orderId: order.id,
        to: 'DELIVERED',
        actorUserId: userId,
        ...(cash ? { data: { paymentStatus: 'SUCCEEDED' } } : {}),
      });
      if (cash) {
        await tx.payment.updateMany({
          where: { orderId: order.id, method: 'CASH_ON_DELIVERY', status: 'PENDING' },
          data: { status: 'SUCCEEDED', paidAt: now },
        });
      }
      await tx.deliveryAssignment.updateMany({
        where: { deliveryId: delivery.id, unassignedAt: null },
        data: { unassignedAt: now, reason: 'DELIVERED' },
      });
      await tx.riderProfile.update({
        where: { id: rider.id },
        data: { isAvailable: rider.isOnline },
      });
      await this.outbox.enqueue(tx, {
        eventType: 'delivery.delivered',
        aggregateType: 'delivery',
        aggregateId: delivery.id,
        payload: {
          deliveryId: delivery.id,
          orderId: order.id,
          riderId: rider.id,
          customerId: order.customerId,
          restaurantId: order.restaurantId,
          paymentMethod: order.paymentMethod,
          cashCollected: cash,
        },
      });
    });
    return this.view(deliveryId);
  }

  /** Cancellation integration (DISPATCH_RULES §38, CANCELLATION_RULES §24). */
  async cancelForOrder(tx: Tx, orderId: string): Promise<void> {
    const delivery = await tx.delivery.findUnique({ where: { orderId } });
    if (!delivery || delivery.status === 'DELIVERED' || delivery.status === 'CANCELLED') return;
    const now = new Date();
    await tx.delivery.update({ where: { id: delivery.id }, data: { status: 'CANCELLED' } });
    await tx.deliveryAssignment.updateMany({
      where: { deliveryId: delivery.id, unassignedAt: null },
      data: { unassignedAt: now, reason: 'ORDER_CANCELLED' },
    });
    if (delivery.riderId) {
      const rider = await tx.riderProfile.findUniqueOrThrow({ where: { id: delivery.riderId } });
      await tx.riderProfile.update({
        where: { id: rider.id },
        data: { isAvailable: rider.isOnline && rider.status === 'ACTIVE' },
      });
    }
    await this.outbox.enqueue(tx, {
      eventType: 'delivery.cancelled',
      aggregateType: 'delivery',
      aggregateId: delivery.id,
      payload: { deliveryId: delivery.id, orderId, riderId: delivery.riderId },
    });
  }

  async current(userId: string): Promise<DeliveryView | null> {
    const rider = await this.riders.requireByUser(userId);
    const delivery = await this.prisma.delivery.findFirst({
      where: { riderId: rider.id, status: { in: ACTIVE_DELIVERY_STATUSES } },
    });
    return delivery ? this.view(delivery.id) : null;
  }

  /** GET /deliveries/{id}: assigned rider, the order's customer or restaurant staff, admins. */
  async detailForActor(deliveryId: string, auth: AuthContext): Promise<DeliveryView> {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { order: true, rider: true },
    });
    if (!delivery) throw notFound('DELIVERY_NOT_FOUND');
    const isAdmin = auth.roles.some((role) => ADMIN_ROLES.has(role));
    const isRider = delivery.rider?.userId === auth.userId;
    const isCustomer = delivery.order.customerId === auth.userId;
    const isStaff =
      (await this.prisma.restaurantStaff.count({
        where: { userId: auth.userId, restaurantId: delivery.order.restaurantId, status: 'ACTIVE' },
      })) > 0;
    if (!isAdmin && !isRider && !isCustomer && !isStaff) throw notFound('DELIVERY_NOT_FOUND');
    return this.view(deliveryId);
  }

  async history(userId: string, query: RiderDeliveryListQuery) {
    const rider = await this.riders.requireByUser(userId);
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (query.cursor && !cursor) throw validationError({ cursor: 'Invalid cursor' });
    const rows = await this.prisma.delivery.findMany({
      where: {
        riderId: rider.id,
        ...(query.status ? { status: query.status } : {}),
        ...(query.from || query.to
          ? {
              createdAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.at } },
                { createdAt: cursor.at, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      include: DELIVERY_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      rows: page.map(toDelivery),
      nextCursor: rows.length > query.limit && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async view(deliveryId: string): Promise<DeliveryView> {
    return toDelivery(
      await this.prisma.delivery.findUniqueOrThrow({
        where: { id: deliveryId },
        include: DELIVERY_INCLUDE,
      }),
    );
  }

  private async step(
    userId: string,
    deliveryId: string,
    name: keyof typeof STEPS,
  ): Promise<DeliveryView> {
    const rider = await this.riders.requireByUser(userId);
    const step = STEPS[name];
    await this.prisma.$transaction(async (tx) => {
      const delivery = await this.lockOwn(tx, rider.id, deliveryId);
      if (!step.from.includes(delivery.status)) throw invalidStep(delivery.status);
      const now = new Date();
      await tx.delivery.update({
        where: { id: delivery.id },
        data: {
          status: step.to,
          ...(step.to === 'ARRIVING_AT_RESTAURANT' ? { pickupAt: now } : {}),
          ...(step.to === 'PICKED_UP' ? { pickedUpAt: now } : {}),
        },
      });
      if (step.order) {
        await this.stateMachine.transition(tx, {
          orderId: delivery.orderId,
          to: step.order,
          actorUserId: userId,
        });
      }
      await this.outbox.enqueue(tx, {
        eventType: `delivery.${step.to.toLowerCase()}`,
        aggregateType: 'delivery',
        aggregateId: delivery.id,
        payload: { deliveryId: delivery.id, orderId: delivery.orderId, riderId: rider.id },
      });
    });
    return this.view(deliveryId);
  }

  /** Locks the delivery; another rider's delivery reads as not found (DISPATCH_RULES §40). */
  private async lockOwn(tx: Tx, riderId: string, deliveryId: string): Promise<DeliveryRow> {
    await tx.$queryRaw`SELECT id FROM deliveries WHERE id = ${deliveryId}::uuid FOR UPDATE`;
    const delivery = await tx.delivery.findFirst({
      where: { id: deliveryId, riderId },
      include: DELIVERY_INCLUDE,
    });
    if (!delivery) throw notFound('DELIVERY_NOT_FOUND');
    return delivery;
  }
}

function invalidStep(status: DeliveryStatus) {
  return conflict('ORDER_INVALID_STATUS', `The delivery is ${status}.`, { status });
}

export function toDelivery(row: DeliveryRow): DeliveryView {
  const { order } = row;
  const { restaurant } = order;
  const cash = order.paymentMethod === 'CASH_ON_DELIVERY';
  return {
    id: row.id,
    orderId: order.id,
    orderNumber: order.orderNumber,
    orderStatus: order.status,
    status: row.status,
    riderId: row.riderId,
    restaurant: {
      name: restaurant.name,
      addressText: [restaurant.addressLine1, restaurant.addressLine2].filter(Boolean).join(', '),
      area: restaurant.area,
      city: restaurant.city,
      latitude: restaurant.latitude?.toNumber() ?? null,
      longitude: restaurant.longitude?.toNumber() ?? null,
      phone: restaurant.phone,
    },
    destination: {
      recipientName: order.deliveryRecipientName,
      recipientPhone: order.deliveryRecipientPhone,
      addressText: order.deliveryAddressText,
      area: order.deliveryArea,
      city: order.deliveryCity,
      latitude: order.deliveryLatitude.toNumber(),
      longitude: order.deliveryLongitude.toNumber(),
      instructions: order.deliveryInstructions,
    },
    paymentMethod: order.paymentMethod,
    amountToCollect: cash ? formatMoney(money(order.totalAmount)) : null,
    currency: order.currency,
    pickupAt: row.pickupAt?.toISOString() ?? null,
    pickedUpAt: row.pickedUpAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    deliveryNotes: row.deliveryNotes,
    createdAt: row.createdAt.toISOString(),
  };
}
