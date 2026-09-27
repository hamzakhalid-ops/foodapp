import { Injectable } from '@nestjs/common';
import {
  type AcceptOrderRequest,
  type Order,
  type OrderSummary,
  type RestaurantOrderListQuery,
} from '@quickbite/validation';
import { conflict, notFound } from '../../common/http/errors';
import { type OrderStatus, type Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { OrderStateMachine } from './order-state-machine';
import { OrdersService, RELEASED_TO_RESTAURANT } from './orders.service';

/**
 * Restaurant order handling (API_SPEC §51–55, ORDER_RULES §12–16). Scoped to the caller's
 * restaurant; online orders appear only after payment confirmation.
 */
@Injectable()
export class RestaurantOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly stateMachine: OrderStateMachine,
  ) {}

  async listNew(restaurantId: string): Promise<OrderSummary[]> {
    const { rows } = await this.orders.listPage(
      { restaurantId, status: 'PENDING', ...RELEASED_TO_RESTAURANT },
      { limit: 100 },
    );
    return rows.reverse(); // oldest first: the queue order the kitchen works in
  }

  list(restaurantId: string, query: RestaurantOrderListQuery) {
    return this.orders.listPage(
      {
        restaurantId,
        ...RELEASED_TO_RESTAURANT,
        ...(query.search ? { orderNumber: { contains: query.search, mode: 'insensitive' } } : {}),
      },
      query,
    );
  }

  async detail(restaurantId: string, orderId: string): Promise<Order> {
    await this.findOwn(this.prisma, restaurantId, orderId);
    return this.orders.getById(orderId);
  }

  /** PENDING → RESTAURANT_ACCEPTED (API_SPEC §52). */
  async accept(
    restaurantId: string,
    orderId: string,
    actorUserId: string,
    input: AcceptOrderRequest,
  ): Promise<Order> {
    await this.prisma.$transaction(async (tx) => {
      await this.findOwn(tx, restaurantId, orderId);
      const restaurant = await tx.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
      if (restaurant.status === 'SUSPENDED') {
        throw conflict('RESTAURANT_SUSPENDED', 'The restaurant is suspended.');
      }
      if (restaurant.status === 'CLOSED') {
        throw conflict('RESTAURANT_CLOSED', 'The restaurant is closed.');
      }
      await this.stateMachine.transition(tx, {
        orderId,
        to: 'RESTAURANT_ACCEPTED',
        actorUserId,
        ...(input.estimatedPreparationMinutes
          ? { data: { estimatedPreparationMinutes: input.estimatedPreparationMinutes } }
          : {}),
      });
    });
    return this.orders.getById(orderId);
  }

  startPreparing(restaurantId: string, orderId: string, actorUserId: string) {
    return this.move(restaurantId, orderId, actorUserId, 'PREPARING');
  }

  /** PREPARING → READY_FOR_PICKUP; the outbox event starts dispatch (API_SPEC §55). */
  markReady(restaurantId: string, orderId: string, actorUserId: string) {
    return this.move(restaurantId, orderId, actorUserId, 'READY_FOR_PICKUP');
  }

  private async move(
    restaurantId: string,
    orderId: string,
    actorUserId: string,
    to: OrderStatus,
  ): Promise<Order> {
    await this.prisma.$transaction(async (tx) => {
      await this.findOwn(tx, restaurantId, orderId);
      await this.stateMachine.transition(tx, { orderId, to, actorUserId });
    });
    return this.orders.getById(orderId);
  }

  private async findOwn(tx: Prisma.TransactionClient, restaurantId: string, orderId: string) {
    const order = await tx.order.findFirst({
      where: { id: orderId, restaurantId, ...RELEASED_TO_RESTAURANT },
    });
    if (!order) throw notFound('ORDER_NOT_FOUND');
    return order;
  }
}
