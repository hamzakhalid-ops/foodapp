import { HttpStatus, Injectable } from '@nestjs/common';
import { ApiException } from '../../common/http/api.exception';
import { conflict } from '../../common/http/errors';
import { OutboxService } from '../../common/outbox/outbox.service';
import { type Order, type OrderStatus, type Prisma } from '../../generated/prisma/client';

type Tx = Prisma.TransactionClient;

/**
 * ORDER_RULES §11, plus RESTAURANT_ACCEPTED → CANCELLED_BY_CUSTOMER inside the configurable
 * post-acceptance window (ADR-0014 §12, CANCELLATION_RULES §5.2).
 */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDING: [
    'RESTAURANT_ACCEPTED',
    'CANCELLED_BY_CUSTOMER',
    'CANCELLED_BY_RESTAURANT',
    'CANCELLED_BY_ADMIN',
  ],
  RESTAURANT_ACCEPTED: ['PREPARING', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_ADMIN'],
  PREPARING: ['READY_FOR_PICKUP', 'CANCELLED_BY_ADMIN'],
  READY_FOR_PICKUP: ['RIDER_ASSIGNED', 'CANCELLED_BY_ADMIN'],
  RIDER_ASSIGNED: ['PICKED_UP', 'CANCELLED_BY_ADMIN'],
  PICKED_UP: ['OUT_FOR_DELIVERY', 'CANCELLED_BY_ADMIN'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'CANCELLED_BY_ADMIN'],
  DELIVERED: [],
  CANCELLED_BY_CUSTOMER: [],
  CANCELLED_BY_RESTAURANT: [],
  CANCELLED_BY_ADMIN: [],
};

export const CANCELLED_STATUSES: readonly OrderStatus[] = [
  'CANCELLED_BY_CUSTOMER',
  'CANCELLED_BY_RESTAURANT',
  'CANCELLED_BY_ADMIN',
];

/** Timestamp column set when an order enters a status (DATABASE.md §21). */
const TIMESTAMP_FIELD: Partial<Record<OrderStatus, keyof Prisma.OrderUpdateManyMutationInput>> = {
  RESTAURANT_ACCEPTED: 'acceptedAt',
  PREPARING: 'preparingAt',
  READY_FOR_PICKUP: 'readyAt',
  PICKED_UP: 'pickedUpAt',
  DELIVERED: 'deliveredAt',
  CANCELLED_BY_CUSTOMER: 'cancelledAt',
  CANCELLED_BY_RESTAURANT: 'cancelledAt',
  CANCELLED_BY_ADMIN: 'cancelledAt',
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export interface TransitionRequest {
  orderId: string;
  to: OrderStatus;
  actorUserId: string | null;
  reason?: string | null;
  metadata?: Prisma.InputJsonObject;
  /** Extra order columns written in the same update. */
  data?: Prisma.OrderUpdateManyMutationInput;
}

/**
 * The only writer of `orders.status` (ORDER_RULES §23–24, CANCELLATION_RULES §30). Each transition
 * is a compare-and-set on the current status inside the caller's transaction, appends
 * `order_status_history` and an `order.status_changed` outbox event. A concurrent change makes
 * the losing request fail with `ORDER_STATE_CHANGED`.
 */
@Injectable()
export class OrderStateMachine {
  constructor(private readonly outbox: OutboxService) {}

  async transition(tx: Tx, request: TransitionRequest): Promise<Order> {
    const current = await tx.order.findUnique({ where: { id: request.orderId } });
    if (!current) {
      throw new ApiException(HttpStatus.NOT_FOUND, 'ORDER_NOT_FOUND', 'Order not found.');
    }
    if (!canTransition(current.status, request.to)) {
      throw invalidStatus(current.status, request.to);
    }
    const at = new Date();
    const stamp = TIMESTAMP_FIELD[request.to];
    const updated = await tx.order.updateMany({
      where: { id: current.id, status: current.status },
      data: { ...request.data, status: request.to, ...(stamp ? { [stamp]: at } : {}) },
    });
    if (updated.count === 0) {
      throw conflict('ORDER_STATE_CHANGED', 'The order changed while this request was processed.');
    }
    await tx.orderStatusHistory.create({
      data: {
        orderId: current.id,
        fromStatus: current.status,
        toStatus: request.to,
        changedByUserId: request.actorUserId,
        reason: request.reason ?? null,
        ...(request.metadata ? { metadata: request.metadata } : {}),
      },
    });
    await this.outbox.enqueue(tx, {
      eventType: 'order.status_changed',
      aggregateType: 'order',
      aggregateId: current.id,
      payload: {
        orderId: current.id,
        orderNumber: current.orderNumber,
        customerId: current.customerId,
        restaurantId: current.restaurantId,
        fromStatus: current.status,
        toStatus: request.to,
        occurredAt: at.toISOString(),
      },
    });
    return tx.order.findUniqueOrThrow({ where: { id: current.id } });
  }
}

export function invalidStatus(from: OrderStatus, to: OrderStatus): ApiException {
  if (from === 'DELIVERED') {
    return conflict('ORDER_ALREADY_COMPLETED', 'The order has already been delivered.');
  }
  if (CANCELLED_STATUSES.includes(from)) {
    return conflict('ORDER_ALREADY_CANCELLED', 'The order has already been cancelled.');
  }
  return conflict('ORDER_INVALID_STATUS', `The order cannot move from ${from} to ${to}.`, {
    status: from,
  });
}
