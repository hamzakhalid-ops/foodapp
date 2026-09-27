import { Injectable } from '@nestjs/common';
import {
  type AddOn,
  type CreateAddOnRequest,
  type CreateMenuCategoryRequest,
  type CreateMenuItemRequest,
  type CreateVariationRequest,
  type MenuCategory,
  type MenuItem,
  type UpdateAddOnRequest,
  type UpdateMenuCategoryRequest,
  type UpdateMenuItemRequest,
  type UpdateVariationRequest,
  type Variation,
} from '@quickbite/validation';
import { conflict, notFound } from '../../common/http/errors';
import { formatMoney, money } from '../../common/money/money';
import {
  type ItemAddOn,
  type Prisma,
  type ItemVariation,
  type MenuCategory as MenuCategoryRow,
  type MenuItem as MenuItemRow,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';

const DISPLAY_ORDER = [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }];
const ITEM_INCLUDE = {
  variations: { orderBy: DISPLAY_ORDER },
  addOns: { orderBy: DISPLAY_ORDER },
} satisfies Prisma.MenuItemInclude;

type ItemWithOptions = MenuItemRow & { variations: ItemVariation[]; addOns: ItemAddOn[] };

/**
 * Restaurant menu management (API_SPEC §50, PRD §11, DATABASE.md §17–20). Every lookup is scoped
 * to the caller's restaurant, so another restaurant's ids read as not found.
 */
@Injectable()
export class MenuService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------- categories

  async listCategories(restaurantId: string): Promise<MenuCategory[]> {
    const rows = await this.prisma.menuCategory.findMany({
      where: { restaurantId },
      orderBy: DISPLAY_ORDER,
    });
    return rows.map(toCategory);
  }

  async createCategory(
    restaurantId: string,
    input: CreateMenuCategoryRequest,
  ): Promise<MenuCategory> {
    await this.requireApproved(restaurantId);
    const row = await this.prisma.menuCategory.create({
      data: {
        restaurantId,
        name: input.name,
        description: input.description ?? null,
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
    return toCategory(row);
  }

  async updateCategory(
    restaurantId: string,
    categoryId: string,
    input: UpdateMenuCategoryRequest,
  ): Promise<MenuCategory> {
    await this.requireApproved(restaurantId);
    await this.findCategory(restaurantId, categoryId);
    const row = await this.prisma.menuCategory.update({
      where: { id: categoryId },
      data: definedOnly(input),
    });
    return toCategory(row);
  }

  /** Only empty categories can be deleted; otherwise deactivate them (PRD §11 "delete/deactivate"). */
  async deleteCategory(restaurantId: string, categoryId: string): Promise<void> {
    await this.requireApproved(restaurantId);
    await this.findCategory(restaurantId, categoryId);
    const items = await this.prisma.menuItem.count({ where: { categoryId } });
    if (items > 0) {
      throw conflict(
        'INVALID_REQUEST',
        'The category still contains items. Move or delete them, or deactivate the category.',
      );
    }
    await this.prisma.menuCategory.delete({ where: { id: categoryId } });
  }

  // ---------------------------------------------------------------- items

  async listItems(restaurantId: string, categoryId?: string): Promise<MenuItem[]> {
    const rows = await this.prisma.menuItem.findMany({
      where: { restaurantId, ...(categoryId ? { categoryId } : {}) },
      include: ITEM_INCLUDE,
      orderBy: DISPLAY_ORDER,
    });
    return rows.map(toItem);
  }

  async getItem(restaurantId: string, itemId: string): Promise<MenuItem> {
    return toItem(await this.findItem(restaurantId, itemId));
  }

  async createItem(restaurantId: string, input: CreateMenuItemRequest): Promise<MenuItem> {
    await this.requireApproved(restaurantId);
    await this.findCategory(restaurantId, input.categoryId);
    const row = await this.prisma.menuItem.create({
      data: {
        restaurantId,
        categoryId: input.categoryId,
        name: input.name,
        description: input.description ?? null,
        imageUrl: input.imageUrl ?? null,
        basePrice: money(input.basePrice),
        ...(input.isAvailable !== undefined ? { isAvailable: input.isAvailable } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
      include: ITEM_INCLUDE,
    });
    return toItem(row);
  }

  async updateItem(
    restaurantId: string,
    itemId: string,
    input: UpdateMenuItemRequest,
  ): Promise<MenuItem> {
    await this.requireApproved(restaurantId);
    await this.findItem(restaurantId, itemId);
    if (input.categoryId) await this.findCategory(restaurantId, input.categoryId);
    const { basePrice, ...rest } = definedOnly(input);
    const row = await this.prisma.menuItem.update({
      where: { id: itemId },
      data: { ...rest, ...(basePrice !== undefined ? { basePrice: money(basePrice) } : {}) },
      include: ITEM_INCLUDE,
    });
    return toItem(row);
  }

  /** Order history keeps its own snapshots (ORDER_RULES §6), so items can be deleted outright. */
  async deleteItem(restaurantId: string, itemId: string): Promise<void> {
    await this.requireApproved(restaurantId);
    await this.findItem(restaurantId, itemId);
    await this.prisma.menuItem.delete({ where: { id: itemId } });
  }

  /** Owner or operator (AUTH_AUTHORIZATION §43: operators manage availability). */
  async setAvailability(restaurantId: string, itemId: string, available: boolean) {
    await this.findItem(restaurantId, itemId);
    const row = await this.prisma.menuItem.update({
      where: { id: itemId },
      data: { isAvailable: available },
      include: ITEM_INCLUDE,
    });
    return toItem(row);
  }

  // ---------------------------------------------------------------- variations

  async listVariations(restaurantId: string, itemId: string): Promise<Variation[]> {
    return (await this.findItem(restaurantId, itemId)).variations.map(toVariation);
  }

  async createVariation(
    restaurantId: string,
    itemId: string,
    input: CreateVariationRequest,
  ): Promise<Variation> {
    await this.requireApproved(restaurantId);
    await this.findItem(restaurantId, itemId);
    const row = await this.prisma.itemVariation.create({
      data: {
        menuItemId: itemId,
        name: input.name,
        priceAdjustment: money(input.priceAdjustment ?? '0'),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    });
    return toVariation(row);
  }

  async updateVariation(
    restaurantId: string,
    variationId: string,
    input: UpdateVariationRequest,
  ): Promise<Variation> {
    await this.requireApproved(restaurantId);
    await this.findVariation(restaurantId, variationId);
    const { priceAdjustment, ...rest } = definedOnly(input);
    const row = await this.prisma.itemVariation.update({
      where: { id: variationId },
      data: {
        ...rest,
        ...(priceAdjustment !== undefined ? { priceAdjustment: money(priceAdjustment) } : {}),
      },
    });
    return toVariation(row);
  }

  async deleteVariation(restaurantId: string, variationId: string): Promise<void> {
    await this.requireApproved(restaurantId);
    await this.findVariation(restaurantId, variationId);
    await this.prisma.itemVariation.delete({ where: { id: variationId } });
  }

  // ---------------------------------------------------------------- add-ons

  async listAddOns(restaurantId: string, itemId: string): Promise<AddOn[]> {
    return (await this.findItem(restaurantId, itemId)).addOns.map(toAddOn);
  }

  async createAddOn(
    restaurantId: string,
    itemId: string,
    input: CreateAddOnRequest,
  ): Promise<AddOn> {
    await this.requireApproved(restaurantId);
    await this.findItem(restaurantId, itemId);
    const row = await this.prisma.itemAddOn.create({
      data: {
        menuItemId: itemId,
        name: input.name,
        price: money(input.price),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    });
    return toAddOn(row);
  }

  async updateAddOn(
    restaurantId: string,
    addOnId: string,
    input: UpdateAddOnRequest,
  ): Promise<AddOn> {
    await this.requireApproved(restaurantId);
    await this.findAddOn(restaurantId, addOnId);
    const { price, ...rest } = definedOnly(input);
    const row = await this.prisma.itemAddOn.update({
      where: { id: addOnId },
      data: { ...rest, ...(price !== undefined ? { price: money(price) } : {}) },
    });
    return toAddOn(row);
  }

  async deleteAddOn(restaurantId: string, addOnId: string): Promise<void> {
    await this.requireApproved(restaurantId);
    await this.findAddOn(restaurantId, addOnId);
    await this.prisma.itemAddOn.delete({ where: { id: addOnId } });
  }

  // ---------------------------------------------------------------- lookups

  /** Menu setup follows approval (PRD §10 flow, IMPLEMENTATION_PLAN Slice 4). */
  private async requireApproved(restaurantId: string): Promise<void> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { approvalStatus: true },
    });
    if (!restaurant) throw notFound('RESTAURANT_NOT_FOUND');
    if (restaurant.approvalStatus !== 'APPROVED') {
      throw conflict('RESTAURANT_NOT_APPROVED', 'The menu can be managed after approval.');
    }
  }

  private async findCategory(restaurantId: string, categoryId: string) {
    const row = await this.prisma.menuCategory.findFirst({
      where: { id: categoryId, restaurantId },
    });
    if (!row) throw notFound('RESOURCE_NOT_FOUND', 'Menu category not found.');
    return row;
  }

  private async findItem(restaurantId: string, itemId: string): Promise<ItemWithOptions> {
    const row = await this.prisma.menuItem.findFirst({
      where: { id: itemId, restaurantId },
      include: ITEM_INCLUDE,
    });
    if (!row) throw notFound('MENU_ITEM_NOT_FOUND', 'Menu item not found.');
    return row;
  }

  private async findVariation(restaurantId: string, variationId: string) {
    const row = await this.prisma.itemVariation.findFirst({
      where: { id: variationId, menuItem: { restaurantId } },
    });
    if (!row) throw notFound('RESOURCE_NOT_FOUND', 'Variation not found.');
    return row;
  }

  private async findAddOn(restaurantId: string, addOnId: string) {
    const row = await this.prisma.itemAddOn.findFirst({
      where: { id: addOnId, menuItem: { restaurantId } },
    });
    if (!row) throw notFound('RESOURCE_NOT_FOUND', 'Add-on not found.');
    return row;
  }
}

/** Drops keys whose value is `undefined` (PATCH semantics under exactOptionalPropertyTypes). */
function definedOnly<T extends object>(input: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as {
    [K in keyof T]-?: Exclude<T[K], undefined>;
  };
}

export function toCategory(row: MenuCategoryRow): MenuCategory {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

export function toVariation(row: ItemVariation): Variation {
  return {
    id: row.id,
    name: row.name,
    priceAdjustment: formatMoney(money(row.priceAdjustment)),
    isActive: row.isActive,
    sortOrder: row.sortOrder,
  };
}

export function toAddOn(row: ItemAddOn): AddOn {
  return {
    id: row.id,
    name: row.name,
    price: formatMoney(money(row.price)),
    isActive: row.isActive,
    sortOrder: row.sortOrder,
  };
}

export function toItem(row: ItemWithOptions): MenuItem {
  return {
    id: row.id,
    categoryId: row.categoryId,
    name: row.name,
    description: row.description,
    imageUrl: row.imageUrl,
    basePrice: formatMoney(money(row.basePrice)),
    isAvailable: row.isAvailable,
    sortOrder: row.sortOrder,
    variations: row.variations.map(toVariation),
    addOns: row.addOns.map(toAddOn),
  };
}
