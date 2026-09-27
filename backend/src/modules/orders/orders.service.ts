import { Injectable } from '@nestjs/common';
import {
  type CustomerOrderListQuery,
  type Order,
  type OrderStatusView,
  type OrderSummary,
} from '@quickbite/validation';
import { type AuthContext } from '../../common/auth/auth.decorators';
import { notFound, validationError } from '../../common/http/errors';
import { formatMoney, type Money, money } from '../../common/money/money';
import {
  type Order as OrderRow,
  type PaymentMethod,
  type Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';

type Tx = Prisma.TransactionClient;

const ORDER_INCLUDE = {
  restaurant: { select: { id: true, name: true } },
  items: {
    orderBy: { createdAt: 'asc' },
    include: {
      variations: { orderBy: { createdAt: 'asc' } },
      addOns: { orderBy: { createdAt: 'asc' } },
    },
  },
} satisfies Prisma.OrderInclude;

type OrderWithItems = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

export interface NewOrder {
  customerId: string;
  restaurantId: string;
  deliveryAddressId: string;
  paymentMethod: PaymentMethod;
  subtotal: Money;
  discountAmount: Money;
  deliveryFee: Money;
  taxAmount: Money;
  serviceFee: Money;
  totalAmount: Money;
  currency: string;
  specialInstructions: string | null;
  estimatedPreparationMinutes: number;
  delivery: {
    recipientName: string;
    recipientPhone: string;
    addressText: string;
    area: string | null;
    city: string;
    postalCode: string | null;
    latitude: Money;
    longitude: Money;
    deliveryInstructions: string | null;
  };
  items: {
    menuItemId: string;
    itemName: string;
    unitPrice: Money;
    quantity: number;
    subtotal: Money;
    variations: { variationId: string; name: string; priceAdjustment: Money }[];
    addOns: { addOnId: string; name: string; price: Money }[];
  }[];
}

const ADMIN_ROLES = new Set(['ADMIN', 'SUPER_ADMIN']);

/**
 * Order records and snapshots (DATABASE.md §21–26, ORDER_RULES §6, §9, §24–28). State
 * transitions live in the order state machine (Slice 6); creation is orchestrated by checkout.
 */
@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Writes the order, its snapshots and the initial status-history entry inside `tx`. */
  async createInTx(tx: Tx, input: NewOrder, placedAt: Date): Promise<OrderRow> {
    const order = await tx.order.create({
      data: {
        customerId: input.customerId,
        restaurantId: input.restaurantId,
        deliveryAddressId: input.deliveryAddressId,
        status: 'PENDING',
        paymentMethod: input.paymentMethod,
        paymentStatus: 'PENDING',
        subtotal: input.subtotal,
        discountAmount: input.discountAmount,
        deliveryFee: input.deliveryFee,
        taxAmount: input.taxAmount,
        serviceFee: input.serviceFee,
        totalAmount: input.totalAmount,
        currency: input.currency,
        specialInstructions: input.specialInstructions,
        estimatedPreparationMinutes: input.estimatedPreparationMinutes,
        deliveryRecipientName: input.delivery.recipientName,
        deliveryRecipientPhone: input.delivery.recipientPhone,
        deliveryAddressText: input.delivery.addressText,
        deliveryArea: input.delivery.area,
        deliveryCity: input.delivery.city,
        deliveryPostalCode: input.delivery.postalCode,
        deliveryLatitude: input.delivery.latitude,
        deliveryLongitude: input.delivery.longitude,
        deliveryInstructions: input.delivery.deliveryInstructions,
        placedAt,
        statusHistory: {
          create: { fromStatus: null, toStatus: 'PENDING', changedByUserId: input.customerId },
        },
      },
    });
    for (const item of input.items) {
      await tx.orderItem.create({
        data: {
          orderId: order.id,
          menuItemId: item.menuItemId,
          itemName: item.itemName,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          subtotal: item.subtotal,
          variations: {
            create: item.variations.map((variation) => ({
              variationId: variation.variationId,
              name: variation.name,
              priceAdjustment: variation.priceAdjustment,
            })),
          },
          addOns: {
            create: item.addOns.map((addOn) => ({
              addOnId: addOn.addOnId,
              name: addOn.name,
              price: addOn.price,
            })),
          },
        },
      });
    }
    return order;
  }

  async getById(orderId: string): Promise<Order> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });
    if (!order) throw notFound('ORDER_NOT_FOUND');
    return toOrder(order);
  }

  /** API_SPEC §39: customer (own), restaurant staff (own restaurant), admin. Others: 404. */
  async getForActor(orderId: string, auth: AuthContext): Promise<Order> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });
    if (!order || !(await this.canView(order, auth))) throw notFound('ORDER_NOT_FOUND');
    return toOrder(order);
  }

  async statusForActor(orderId: string, auth: AuthContext): Promise<OrderStatusView> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { statusHistory: { orderBy: { createdAt: 'asc' } } },
    });
    if (!order || !(await this.canView(order, auth))) throw notFound('ORDER_NOT_FOUND');
    return {
      orderId: order.id,
      status: order.status,
      paymentStatus: order.paymentStatus,
      history: order.statusHistory.map((entry) => ({
        fromStatus: entry.fromStatus,
        toStatus: entry.toStatus,
        reason: entry.reason,
        createdAt: entry.createdAt.toISOString(),
      })),
    };
  }

  /** GET /customer/orders — newest first, cursor pagination (API_SPEC §10, §40). */
  async listForCustomer(
    customerId: string,
    query: CustomerOrderListQuery,
  ): Promise<{ rows: OrderSummary[]; nextCursor: string | null }> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (query.cursor && !cursor) throw validationError({ cursor: 'Invalid cursor' });
    const rows = await this.prisma.order.findMany({
      where: {
        customerId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.from || query.to
          ? {
              placedAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
        ...(cursor
          ? {
              OR: [
                { placedAt: { lt: cursor.placedAt } },
                { placedAt: cursor.placedAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      include: { restaurant: { select: { id: true, name: true } } },
      orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      rows: page.map((row) => ({
        id: row.id,
        orderNumber: row.orderNumber,
        status: row.status,
        paymentMethod: row.paymentMethod,
        paymentStatus: row.paymentStatus,
        restaurant: row.restaurant,
        totalAmount: formatMoney(money(row.totalAmount)),
        currency: row.currency,
        placedAt: row.placedAt.toISOString(),
      })),
      nextCursor: rows.length > query.limit && last ? encodeCursor(last) : null,
    };
  }

  private async canView(order: OrderRow, auth: AuthContext): Promise<boolean> {
    if (order.customerId === auth.userId) return true;
    if (auth.roles.some((role) => ADMIN_ROLES.has(role))) return true;
    if (auth.roles.includes('RESTAURANT_OWNER') || auth.roles.includes('RESTAURANT_OPERATOR')) {
      const membership = await this.prisma.restaurantStaff.count({
        where: { userId: auth.userId, restaurantId: order.restaurantId, status: 'ACTIVE' },
      });
      return membership > 0 && isReleasedToRestaurant(order);
    }
    return false;
  }
}

/**
 * Online orders reach the restaurant once payment is confirmed (PAYMENT_RULES §8 "payment marked
 * authoritative → order continues"); cash orders immediately.
 */
export function isReleasedToRestaurant(
  order: Pick<OrderRow, 'paymentMethod' | 'paymentStatus'>,
): boolean {
  return (
    order.paymentMethod === 'CASH_ON_DELIVERY' ||
    order.paymentStatus === 'AUTHORIZED' ||
    order.paymentStatus === 'SUCCEEDED' ||
    order.paymentStatus === 'REFUNDED' ||
    order.paymentStatus === 'PARTIALLY_REFUNDED'
  );
}

function encodeCursor(row: { placedAt: Date; id: string }): string {
  return Buffer.from(`${row.placedAt.toISOString()}|${row.id}`).toString('base64url');
}

function decodeCursor(cursor: string): { placedAt: Date; id: string } | null {
  const [iso, id] = Buffer.from(cursor, 'base64url').toString().split('|');
  const placedAt = new Date(iso ?? '');
  if (!id || Number.isNaN(placedAt.getTime()) || !/^[0-9a-f-]{36}$/.test(id)) return null;
  return { placedAt, id };
}

const iso = (value: Date | null) => value?.toISOString() ?? null;
const amount = (value: Prisma.Decimal) => formatMoney(money(value));

export function toOrder(order: OrderWithItems): Order {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    restaurant: order.restaurant,
    subtotal: amount(order.subtotal),
    discountAmount: amount(order.discountAmount),
    deliveryFee: amount(order.deliveryFee),
    taxAmount: amount(order.taxAmount),
    serviceFee: amount(order.serviceFee),
    totalAmount: amount(order.totalAmount),
    currency: order.currency,
    specialInstructions: order.specialInstructions,
    estimatedPreparationMinutes: order.estimatedPreparationMinutes,
    deliveryAddress: {
      recipientName: order.deliveryRecipientName,
      recipientPhone: order.deliveryRecipientPhone,
      addressText: order.deliveryAddressText,
      area: order.deliveryArea,
      city: order.deliveryCity,
      postalCode: order.deliveryPostalCode,
      latitude: order.deliveryLatitude.toNumber(),
      longitude: order.deliveryLongitude.toNumber(),
      deliveryInstructions: order.deliveryInstructions,
    },
    items: order.items.map((item) => ({
      id: item.id,
      menuItemId: item.menuItemId,
      name: item.itemName,
      unitPrice: amount(item.unitPrice),
      quantity: item.quantity,
      subtotal: amount(item.subtotal),
      variations: item.variations.map((variation) => ({
        name: variation.name,
        price: amount(variation.priceAdjustment),
      })),
      addOns: item.addOns.map((addOn) => ({ name: addOn.name, price: amount(addOn.price) })),
    })),
    placedAt: order.placedAt.toISOString(),
    acceptedAt: iso(order.acceptedAt),
    preparingAt: iso(order.preparingAt),
    readyAt: iso(order.readyAt),
    pickedUpAt: iso(order.pickedUpAt),
    deliveredAt: iso(order.deliveredAt),
    cancelledAt: iso(order.cancelledAt),
  };
}

export { ORDER_INCLUDE };
