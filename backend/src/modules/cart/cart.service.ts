import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type AddCartItemRequest,
  type Cart,
  type CartIssue,
  DISCOVERABLE_STATUSES,
} from '@quickbite/validation';
import { type ApiErrorCode } from '@quickbite/types';
import { ApiException } from '../../common/http/api.exception';
import { conflict, notFound, unprocessable } from '../../common/http/errors';
import { formatMoney, type Money, money, sumMoney } from '../../common/money/money';
import { SettingsService } from '../../common/settings/settings.service';
import { AppConfigService } from '../../config/app-config.service';
import { type Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { loadPricingRates, NO_TOTALS, orderTotals, type OrderTotals, unitPrice } from './pricing';

type Tx = Prisma.TransactionClient;

const CART_INCLUDE = {
  restaurant: { include: { operatingHours: true, deliverySettings: true } },
  items: {
    orderBy: { createdAt: 'asc' },
    include: {
      menuItem: { include: { category: true, variations: { where: { isActive: true } } } },
      variations: { include: { variation: true } },
      addOns: { include: { addOn: true } },
    },
  },
} satisfies Prisma.CartInclude;

type CartRow = Prisma.CartGetPayload<{ include: typeof CART_INCLUDE }>;
type CartItemRow = CartRow['items'][number];

export interface QuotedLine {
  row: CartItemRow;
  unitPrice: Money;
  lineTotal: Money;
  issues: ApiErrorCode[];
}

/** A cart re-priced against current menu data (ORDER_RULES §4–7). */
export interface CartQuote {
  cart: CartRow | null;
  lines: QuotedLine[];
  subtotal: Money;
  issues: CartIssue[];
  isOrderableNow: boolean;
}

const MESSAGES: Partial<Record<ApiErrorCode, string>> = {
  ORDER_ITEM_UNAVAILABLE: 'This item is currently unavailable.',
  INVALID_VARIATION: 'The selected option is no longer valid for this item.',
  INVALID_ADD_ON: 'A selected add-on is no longer available.',
  RESTAURANT_NOT_AVAILABLE: 'The restaurant is not accepting orders right now.',
  ORDER_MINIMUM_NOT_MET: 'The order does not reach the restaurant minimum.',
};

/**
 * Server-side cart (API_SPEC §32–36, ADR-0014 §4). The cart stores selections only; every read
 * re-prices it from the menu, so price or availability changes are never hidden.
 */
@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurants: RestaurantsService,
    private readonly settings: SettingsService,
    private readonly config: AppConfigService,
  ) {}

  async get(customerId: string): Promise<Cart> {
    const quote = await this.quote(customerId);
    const totals =
      quote.lines.length > 0
        ? orderTotals(quote.subtotal, money(0), await loadPricingRates(this.settings))
        : NO_TOTALS;
    return this.present(quote, totals);
  }

  async addItem(customerId: string, input: AddCartItemRequest): Promise<Cart> {
    const item = await this.prisma.menuItem.findFirst({
      where: {
        id: input.menuItemId,
        restaurantId: input.restaurantId,
        restaurant: { approvalStatus: 'APPROVED', status: { in: [...DISCOVERABLE_STATUSES] } },
      },
      include: { category: true, variations: true, addOns: true },
    });
    if (!item) throw notFound('MENU_ITEM_NOT_FOUND', 'Menu item not found.');
    if (!item.isAvailable || !item.category.isActive) {
      throw unprocessable('ORDER_ITEM_UNAVAILABLE', 'This item is currently unavailable.');
    }
    const activeVariations = item.variations.filter((variation) => variation.isActive);
    const variationsValid =
      input.variationIds.every((id) => activeVariations.some((variation) => variation.id === id)) &&
      (activeVariations.length === 0 || input.variationIds.length === 1);
    if (!variationsValid) {
      throw unprocessable(
        'INVALID_VARIATION',
        activeVariations.length > 0
          ? 'Choose exactly one of the available options for this item.'
          : 'This item has no options.',
      );
    }
    if (
      !input.addOnIds.every((id) => item.addOns.some((addOn) => addOn.id === id && addOn.isActive))
    ) {
      throw unprocessable('INVALID_ADD_ON', 'A selected add-on is not available for this item.');
    }

    await this.prisma.$transaction(async (tx) => {
      const cart = await this.lockCart(tx, customerId);
      const itemCount = await tx.cartItem.count({ where: { cartId: cart.id } });
      if (itemCount > 0 && cart.restaurantId !== input.restaurantId) {
        throw conflict(
          'CART_RESTAURANT_MISMATCH',
          'Your cart contains items from another restaurant. Clear the cart first.',
        );
      }
      if (cart.restaurantId !== input.restaurantId) {
        await tx.cart.update({
          where: { id: cart.id },
          data: { restaurantId: input.restaurantId },
        });
      }
      await tx.cartItem.create({
        data: {
          cartId: cart.id,
          menuItemId: item.id,
          quantity: input.quantity,
          variations: { create: input.variationIds.map((variationId) => ({ variationId })) },
          addOns: { create: input.addOnIds.map((addOnId) => ({ addOnId })) },
        },
      });
    });
    return this.get(customerId);
  }

  async updateQuantity(customerId: string, cartItemId: string, quantity: number): Promise<Cart> {
    const updated = await this.prisma.cartItem.updateMany({
      where: { id: cartItemId, cart: { customerId } },
      data: { quantity },
    });
    if (updated.count === 0) throw notFound('RESOURCE_NOT_FOUND', 'Cart item not found.');
    return this.get(customerId);
  }

  async removeItem(customerId: string, cartItemId: string): Promise<Cart> {
    await this.prisma.$transaction(async (tx) => {
      const cart = await this.lockCart(tx, customerId);
      const removed = await tx.cartItem.deleteMany({ where: { id: cartItemId, cartId: cart.id } });
      if (removed.count === 0) throw notFound('RESOURCE_NOT_FOUND', 'Cart item not found.');
      if ((await tx.cartItem.count({ where: { cartId: cart.id } })) === 0) {
        await tx.cart.update({ where: { id: cart.id }, data: { restaurantId: null } });
      }
    });
    return this.get(customerId);
  }

  async clear(customerId: string, tx: Tx = this.prisma): Promise<void> {
    await tx.cartItem.deleteMany({ where: { cart: { customerId } } });
    await tx.cart.updateMany({ where: { customerId }, data: { restaurantId: null } });
  }

  /**
   * Re-prices the cart from current menu data. Inside a transaction the cart row should be
   * locked first (`lockCart`) so checkout sees a stable cart.
   */
  async quote(customerId: string, tx: Tx = this.prisma, at = new Date()): Promise<CartQuote> {
    const cart = await tx.cart.findUnique({ where: { customerId }, include: CART_INCLUDE });
    if (!cart || cart.items.length === 0 || !cart.restaurant) {
      return { cart, lines: [], subtotal: money(0), issues: [], isOrderableNow: false };
    }
    const lines = cart.items.map((row) => priceLine(row));
    const subtotal = sumMoney(lines.map((line) => line.lineTotal));
    const restaurant = cart.restaurant;
    const isOrderableNow = this.restaurants.isOrderable(restaurant, at);

    const issues: CartIssue[] = [];
    for (const line of lines) {
      for (const code of line.issues) issues.push(issue(code, line.row.id));
    }
    if (!isOrderableNow) issues.push(issue('RESTAURANT_NOT_AVAILABLE', null));
    const minimum = restaurant.deliverySettings?.minimumOrderAmount;
    if (minimum && subtotal.lessThan(minimum)) {
      issues.push({
        ...issue('ORDER_MINIMUM_NOT_MET', null),
        message: `The minimum order for this restaurant is ${formatMoney(money(minimum))}.`,
      });
    }
    return { cart, lines, subtotal, issues, isOrderableNow };
  }

  /** Creates the customer's cart if needed and locks it for the current transaction. */
  async lockCart(tx: Tx, customerId: string) {
    await tx.cart.upsert({ where: { customerId }, create: { customerId }, update: {} });
    const [cart] = await tx.$queryRaw<{ id: string; restaurant_id: string | null }[]>`
      SELECT id, restaurant_id FROM carts WHERE customer_id = ${customerId}::uuid FOR UPDATE`;
    if (!cart)
      throw new ApiException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'INTERNAL_ERROR',
        'Cart lock failed.',
      );
    return { id: cart.id, restaurantId: cart.restaurant_id };
  }

  present(quote: CartQuote, totals: OrderTotals): Cart {
    const restaurant = quote.lines.length > 0 ? quote.cart?.restaurant : null;
    return {
      restaurant: restaurant
        ? { id: restaurant.id, name: restaurant.name, isOrderableNow: quote.isOrderableNow }
        : null,
      items: quote.lines.map(({ row, unitPrice: unit, lineTotal, issues }) => ({
        id: row.id,
        menuItemId: row.menuItemId,
        name: row.menuItem.name,
        imageUrl: row.menuItem.imageUrl,
        quantity: row.quantity,
        unitPrice: formatMoney(unit),
        lineTotal: formatMoney(lineTotal),
        variations: row.variations.map(({ variation }) => ({
          id: variation.id,
          name: variation.name,
          price: formatMoney(money(variation.priceAdjustment)),
        })),
        addOns: row.addOns.map(({ addOn }) => ({
          id: addOn.id,
          name: addOn.name,
          price: formatMoney(money(addOn.price)),
        })),
        isAvailable: issues.length === 0,
      })),
      subtotal: formatMoney(totals.subtotal),
      deliveryFee: formatMoney(totals.deliveryFee),
      serviceFee: formatMoney(totals.serviceFee),
      tax: formatMoney(totals.tax),
      total: formatMoney(totals.total),
      currency: this.config.get('APP_CURRENCY'),
      minimumOrderAmount: restaurant?.deliverySettings
        ? formatMoney(money(restaurant.deliverySettings.minimumOrderAmount))
        : null,
      issues: quote.issues,
      isCheckoutReady: quote.lines.length > 0 && quote.issues.length === 0,
    };
  }
}

/** Prices one line from current menu data and lists what makes it unorderable. */
function priceLine(row: CartItemRow): QuotedLine {
  const issues: ApiErrorCode[] = [];
  const item = row.menuItem;
  if (!item.isAvailable || !item.category.isActive) issues.push('ORDER_ITEM_UNAVAILABLE');
  const selected = row.variations.map(({ variation }) => variation);
  if (
    selected.some((variation) => !variation.isActive) ||
    (item.variations.length > 0 && selected.length !== 1) ||
    (item.variations.length === 0 && selected.length > 0)
  ) {
    issues.push('INVALID_VARIATION');
  }
  if (row.addOns.some(({ addOn }) => !addOn.isActive)) issues.push('INVALID_ADD_ON');

  const unit = unitPrice(
    money(item.basePrice),
    selected.map((variation) => money(variation.priceAdjustment)),
    row.addOns.map(({ addOn }) => money(addOn.price)),
  );
  return { row, unitPrice: unit, lineTotal: unit.mul(row.quantity), issues };
}

function issue(code: ApiErrorCode, cartItemId: string | null): CartIssue {
  return { code, message: MESSAGES[code] ?? code, cartItemId };
}
