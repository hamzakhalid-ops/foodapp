import { Injectable } from '@nestjs/common';
import {
  type CheckoutPreview,
  type CheckoutPreviewRequest,
  type CreateOrderRequest,
  type Order,
} from '@quickbite/validation';
import { notFound, unprocessable } from '../../common/http/errors';
import { straightLineKm } from '../../common/geo/distance';
import { formatMoney, money } from '../../common/money/money';
import { OutboxService } from '../../common/outbox/outbox.service';
import { SettingsService } from '../../common/settings/settings.service';
import { AppConfigService } from '../../config/app-config.service';
import { type Address, type Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { type CartQuote, CartService } from '../cart/cart.service';
import { loadPricingRates, orderTotals, type OrderTotals } from '../cart/pricing';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import { PromotionsService } from '../promotions/promotions.service';
import { RiskService } from '../risk/risk.service';

type Tx = Prisma.TransactionClient;
type QuotedRestaurant = NonNullable<NonNullable<CartQuote['cart']>['restaurant']>;

interface Priced {
  quote: CartQuote;
  restaurant: QuotedRestaurant;
  address: Address;
  totals: OrderTotals;
  promotionId: string | null;
}

/**
 * Checkout preview and order creation (API_SPEC §37–38, ORDER_RULES §4–9). Everything is
 * recalculated from the database; the client only chooses the address, payment method and code.
 */
@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
    private readonly orders: OrdersService,
    private readonly payments: PaymentsService,
    private readonly settings: SettingsService,
    private readonly outbox: OutboxService,
    private readonly config: AppConfigService,
    private readonly risk: RiskService,
    private readonly promotions: PromotionsService,
  ) {}

  async preview(customerId: string, input: CheckoutPreviewRequest): Promise<CheckoutPreview> {
    const { restaurant, totals } = await this.price(this.prisma, customerId, input, false);
    return {
      restaurantId: restaurant.id,
      addressId: input.addressId,
      subtotal: formatMoney(totals.subtotal),
      discount: formatMoney(totals.discount),
      deliveryFee: formatMoney(totals.deliveryFee),
      tax: formatMoney(totals.tax),
      serviceFee: formatMoney(totals.serviceFee),
      total: formatMoney(totals.total),
      currency: this.config.get('APP_CURRENCY'),
      paymentMethod: input.paymentMethod,
      promotionCode: input.promotionCode ?? null,
    };
  }

  /**
   * One transaction: lock and re-price the cart, create the order with its snapshots and status
   * history, the payment record and the `order.created` outbox event, then empty the cart
   * (API_SPEC §38). Retries are deduplicated by the Idempotency-Key interceptor.
   */
  async placeOrder(
    customerId: string,
    input: CreateOrderRequest,
    idempotencyKey: string | null,
  ): Promise<Order> {
    const orderId = await this.prisma.$transaction(async (tx) => {
      await this.cart.lockCart(tx, customerId);
      const { quote, restaurant, address, totals, promotionId } = await this.price(
        tx,
        customerId,
        input,
        true,
      );
      const now = new Date();
      const order = await this.orders.createInTx(
        tx,
        {
          customerId,
          restaurantId: restaurant.id,
          deliveryAddressId: address.id,
          promotionId,
          paymentMethod: input.paymentMethod,
          subtotal: totals.subtotal,
          discountAmount: totals.discount,
          deliveryFee: totals.deliveryFee,
          taxAmount: totals.tax,
          serviceFee: totals.serviceFee,
          totalAmount: totals.total,
          currency: this.config.get('APP_CURRENCY'),
          specialInstructions: input.instructions ?? null,
          estimatedPreparationMinutes:
            restaurant.deliverySettings?.estimatedPreparationMinutes ?? 0,
          delivery: {
            recipientName: address.recipientName,
            recipientPhone: address.phone,
            addressText: [address.addressLine1, address.addressLine2].filter(Boolean).join(', '),
            area: address.area,
            city: address.city,
            postalCode: address.postalCode,
            latitude: address.latitude,
            longitude: address.longitude,
            deliveryInstructions: address.deliveryInstructions,
          },
          items: quote.lines.map(({ row, lineTotal }) => ({
            menuItemId: row.menuItemId,
            itemName: row.menuItem.name,
            unitPrice: money(row.menuItem.basePrice),
            quantity: row.quantity,
            subtotal: lineTotal,
            variations: row.variations.map(({ variation }) => ({
              variationId: variation.id,
              name: variation.name,
              priceAdjustment: money(variation.priceAdjustment),
            })),
            addOns: row.addOns.map(({ addOn }) => ({
              addOnId: addOn.id,
              name: addOn.name,
              price: money(addOn.price),
            })),
          })),
        },
        now,
      );
      if (promotionId) {
        // One promotion per order; usage consumed with the order (PROMOTION_RULES §24, §28).
        await this.promotions.redeem(tx, {
          promotionId,
          customerId,
          orderId: order.id,
          discount: totals.discount,
        });
      }
      await this.payments.createForOrder(tx, order, idempotencyKey);
      await this.outbox.enqueue(tx, {
        eventType: 'order.created',
        aggregateType: 'order',
        aggregateId: order.id,
        payload: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerId,
          restaurantId: restaurant.id,
          status: order.status,
          paymentMethod: order.paymentMethod,
          totalAmount: formatMoney(totals.total),
        },
      });
      await this.cart.clear(customerId, tx);
      return order.id;
    });
    return this.orders.getById(orderId);
  }

  private async price(
    tx: Tx,
    customerId: string,
    input: CheckoutPreviewRequest,
    forOrder: boolean,
  ): Promise<Priced> {
    const quote = await this.cart.quote(customerId, tx);
    const restaurant = quote.cart?.restaurant;
    if (quote.lines.length === 0 || !restaurant) {
      throw unprocessable('INVALID_REQUEST', 'Your cart is empty.');
    }
    // Authoritative restriction check before creating anything (RISK_RULES §19, ORDER_RULES §21).
    await this.risk.assertCustomerMayOrder(customerId, input.paymentMethod, tx);
    if (await this.risk.isBlocked('RESTAURANT', restaurant.id, tx)) {
      throw unprocessable(
        'RESTAURANT_NOT_AVAILABLE',
        'The restaurant is not accepting orders right now.',
      );
    }
    const [first] = quote.issues;
    if (first) {
      throw unprocessable(first.code as Parameters<typeof unprocessable>[0], first.message, {
        issues: quote.issues,
      });
    }

    const address = await tx.address.findFirst({
      where: { id: input.addressId, userId: customerId },
    });
    if (!address) throw notFound('RESOURCE_NOT_FOUND', 'Address not found.');
    if (!this.deliversTo(restaurant, address)) {
      throw unprocessable(
        'ADDRESS_NOT_SERVICEABLE',
        'The restaurant does not deliver to this address.',
      );
    }

    const applied = input.promotionCode
      ? await this.promotions.evaluate(tx, {
          restaurantId: restaurant.id,
          customerId,
          code: input.promotionCode,
          subtotal: quote.subtotal,
          lock: forOrder,
        })
      : null;
    const totals = orderTotals(
      quote.subtotal,
      applied?.discount ?? money(0),
      await loadPricingRates(this.settings, tx),
    );
    return { quote, restaurant, address, totals, promotionId: applied?.promotion.id ?? null };
  }

  /** Radius-based delivery eligibility on straight-line distance (MAPS_LOCATION_RULES §12–13, §30). */
  private deliversTo(restaurant: QuotedRestaurant, address: Address): boolean {
    const radius = restaurant.deliverySettings?.deliveryRadius;
    if (!radius || !restaurant.latitude || !restaurant.longitude) return false;
    const km = straightLineKm(
      { latitude: restaurant.latitude.toNumber(), longitude: restaurant.longitude.toNumber() },
      { latitude: address.latitude.toNumber(), longitude: address.longitude.toNumber() },
    );
    return km <= radius.toNumber();
  }
}
