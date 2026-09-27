import { Injectable } from '@nestjs/common';
import { type CancellationReasonCode, type Order } from '@quickbite/validation';
import { conflict, notFound } from '../../common/http/errors';
import { type RequestMeta } from '../../common/http/request-meta';
import { OutboxService } from '../../common/outbox/outbox.service';
import { SettingsService } from '../../common/settings/settings.service';
import {
  type Order as OrderRow,
  type OrderStatus,
  type Prisma,
  type Role,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { DeliveriesService } from '../deliveries/deliveries.service';
import { DispatchService } from '../dispatch/dispatch.service';
import {
  CANCELLED_STATUSES,
  invalidStatus,
  OrderStateMachine,
} from '../orders/order-state-machine';
import { OrdersService, isReleasedToRestaurant } from '../orders/orders.service';

type Tx = Prisma.TransactionClient;

export type CancellationActor =
  | { kind: 'CUSTOMER'; userId: string }
  | { kind: 'RESTAURANT'; userId: string; restaurantId: string; role: Role }
  | { kind: 'ADMIN'; userId: string; role: Role };

export interface CancellationRequest {
  reasonCode: CancellationReasonCode;
  reason?: string | null | undefined;
}

const TARGET: Record<CancellationActor['kind'], OrderStatus> = {
  CUSTOMER: 'CANCELLED_BY_CUSTOMER',
  RESTAURANT: 'CANCELLED_BY_RESTAURANT',
  ADMIN: 'CANCELLED_BY_ADMIN',
};

/**
 * Cancellation Rules Engine (CANCELLATION_RULES, ADR-0014 §9, §12) — the single place that decides
 * whether an order may be cancelled and performs the cancellation atomically:
 * lock order → evaluate → transition → cancellation record → payment → audit → outbox.
 *
 * Refunds are never automatic: a captured payment stays as it is and the outbox event marks the
 * order as awaiting an administrator's refund decision. An unpaid payment is cancelled.
 */
@Injectable()
export class CancellationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly stateMachine: OrderStateMachine,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly deliveries: DeliveriesService,
    private readonly dispatch: DispatchService,
  ) {}

  async cancel(
    orderId: string,
    actor: CancellationActor,
    request: CancellationRequest,
    meta: RequestMeta,
  ): Promise<Order> {
    await this.prisma.$transaction(async (tx) => {
      // Row lock: a concurrent accept/cancel waits and then sees the committed state (§17).
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order || !this.canAct(order, actor)) throw notFound('ORDER_NOT_FOUND');
      await this.assertAllowed(tx, order, actor);

      const target = TARGET[actor.kind];
      const unpaid = order.paymentStatus === 'PENDING';
      await this.stateMachine.transition(tx, {
        orderId,
        to: target,
        actorUserId: actor.userId,
        reason: request.reason ?? request.reasonCode,
        metadata: { reasonCode: request.reasonCode },
        ...(unpaid ? { data: { paymentStatus: 'CANCELLED' } } : {}),
      });
      if (unpaid) {
        await tx.payment.updateMany({
          where: { orderId, status: 'PENDING' },
          data: { status: 'CANCELLED' },
        });
      }
      // Stop dispatch and release the rider (DISPATCH_RULES §38, CANCELLATION_RULES §24).
      await this.dispatch.cancelOffersForOrder(tx, orderId);
      await this.deliveries.cancelForOrder(tx, orderId);
      const role = actor.kind === 'CUSTOMER' ? 'CUSTOMER' : actor.role;
      await tx.orderCancellation.create({
        data: {
          orderId,
          cancelledByUserId: actor.userId,
          cancelledByRole: role,
          reasonCode: request.reasonCode,
          reasonText: request.reason ?? null,
        },
      });
      await this.audit.record(
        {
          action: AUDIT_ACTIONS.ORDER_CANCELLED,
          actorUserId: actor.userId,
          entityType: 'ORDER',
          entityId: orderId,
          oldValues: { status: order.status, paymentStatus: order.paymentStatus },
          newValues: {
            status: target,
            reasonCode: request.reasonCode,
            ...(request.reason ? { reason: request.reason } : {}),
            actorRole: role,
          },
          meta,
        },
        tx,
      );
      await this.outbox.enqueue(tx, {
        eventType: 'order.cancelled',
        aggregateType: 'order',
        aggregateId: orderId,
        payload: {
          orderId,
          customerId: order.customerId,
          restaurantId: order.restaurantId,
          fromStatus: order.status,
          toStatus: target,
          reasonCode: request.reasonCode,
          refundDecisionRequired: !unpaid && order.paymentMethod === 'ONLINE_PAYMENT',
        },
      });
    });
    return this.orders.getById(orderId);
  }

  /** Ownership / tenant check; failures read as not found (AUTH_AUTHORIZATION §83). */
  private canAct(order: OrderRow, actor: CancellationActor): boolean {
    switch (actor.kind) {
      case 'CUSTOMER':
        return order.customerId === actor.userId;
      case 'RESTAURANT':
        return order.restaurantId === actor.restaurantId && isReleasedToRestaurant(order);
      case 'ADMIN':
        return true;
    }
  }

  private async assertAllowed(tx: Tx, order: OrderRow, actor: CancellationActor): Promise<void> {
    if (order.status === 'DELIVERED' || CANCELLED_STATUSES.includes(order.status)) {
      throw invalidStatus(order.status, TARGET[actor.kind]);
    }
    if (actor.kind === 'ADMIN') return; // every active state (ORDER_RULES §11)
    if (actor.kind === 'RESTAURANT') {
      if (order.status !== 'PENDING') throw notAllowed('Restaurants can cancel only new orders.');
      return;
    }
    if (order.status === 'PENDING') return;
    if (order.status === 'RESTAURANT_ACCEPTED' && order.acceptedAt) {
      const window =
        (await this.settings.get('orders.accepted_cancellation_window_seconds', tx)) ?? 0;
      if (Date.now() - order.acceptedAt.getTime() <= window * 1000) return;
    }
    throw notAllowed('This order can no longer be cancelled. Please contact support.');
  }
}

function notAllowed(message: string) {
  return conflict('ORDER_CANCELLATION_NOT_ALLOWED', message);
}
