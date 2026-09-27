import { Injectable } from '@nestjs/common';
import {
  DISCOVERABLE_STATUSES,
  type PublicMenu,
  type RestaurantDetails,
  type RestaurantListQuery,
  type RestaurantSummary,
  type SearchQuery,
  type SearchResult,
} from '@quickbite/validation';
import { notFound } from '../../common/http/errors';
import { boundingBox, type Coordinates, straightLineKm } from '../../common/geo/distance';
import { formatMoney, money } from '../../common/money/money';
import { SettingsService } from '../../common/settings/settings.service';
import { type Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { toAddOn, toVariation } from '../menu/menu.service';
import { effectiveStatus, RestaurantsService } from '../restaurants/restaurants.service';

const INCLUDE = { operatingHours: true, deliverySettings: true } as const;
type Row = Prisma.RestaurantGetPayload<{ include: typeof INCLUDE }>;

interface Located {
  latitude?: number | undefined;
  longitude?: number | undefined;
  radius?: number | undefined;
}

/**
 * Customer discovery read models (API_SPEC §28–31, MAPS_LOCATION_RULES §32–33). Public: only
 * approved, non-suspended, non-closed restaurants are visible; a visible restaurant may still be
 * not orderable right now, which `isOrderableNow` reports.
 */
@Injectable()
export class DiscoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurants: RestaurantsService,
    private readonly settings: SettingsService,
  ) {}

  async list(query: RestaurantListQuery): Promise<{ rows: RestaurantSummary[]; total: number }> {
    const rows = await this.candidates(query, [
      ...(query.search
        ? [
            {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' as const } },
                { cuisineDescription: { contains: query.search, mode: 'insensitive' as const } },
                { description: { contains: query.search, mode: 'insensitive' as const } },
              ],
            },
          ]
        : []),
      ...(query.cuisine
        ? [{ cuisineDescription: { contains: query.cuisine, mode: 'insensitive' as const } }]
        : []),
    ]);
    let summaries = await this.summarize(rows, query);
    if (query.status) summaries = summaries.filter((row) => row.status === query.status);
    summaries.sort(
      query.sort === 'distance'
        ? (a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0) || a.name.localeCompare(b.name)
        : (a, b) => a.name.localeCompare(b.name),
    );
    const start = (query.page - 1) * query.pageSize;
    return { rows: summaries.slice(start, start + query.pageSize), total: summaries.length };
  }

  async details(restaurantId: string, location: Located): Promise<RestaurantDetails> {
    const row = await this.visible(restaurantId);
    const summarize = await this.summarizer(location);
    return {
      ...summarize(row),
      addressLine1: row.addressLine1,
      latitude: row.latitude?.toNumber() ?? null,
      longitude: row.longitude?.toNumber() ?? null,
      deliveryRadius: row.deliverySettings?.deliveryRadius.toNumber() ?? null,
      operatingHours: [...row.operatingHours]
        .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
        .map((day) => ({
          dayOfWeek: day.dayOfWeek,
          opensAt: day.opensAt,
          closesAt: day.closesAt,
          isClosed: day.isClosed,
        })),
    };
  }

  /**
   * Active categories with their items; unavailable items stay listed with `isAvailable: false`
   * so customers see them as unavailable (API_SPEC §30). Inactive options are hidden.
   */
  async menu(restaurantId: string): Promise<PublicMenu> {
    const restaurant = await this.visible(restaurantId);
    const categories = await this.prisma.menuCategory.findMany({
      where: { restaurantId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        items: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: {
            variations: {
              where: { isActive: true },
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            },
            addOns: {
              where: { isActive: true },
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            },
          },
        },
      },
    });
    return {
      restaurantId,
      isOrderableNow: this.restaurants.isOrderable(restaurant),
      categories: categories
        .filter((category) => category.items.length > 0)
        .map((category) => ({
          id: category.id,
          name: category.name,
          description: category.description,
          sortOrder: category.sortOrder,
          items: category.items.map((item) => ({
            id: item.id,
            name: item.name,
            description: item.description,
            imageUrl: item.imageUrl,
            basePrice: formatMoney(money(item.basePrice)),
            isAvailable: item.isAvailable,
            sortOrder: item.sortOrder,
            variations: item.variations.map((variation) => withoutActive(toVariation(variation))),
            addOns: item.addOns.map((addOn) => withoutActive(toAddOn(addOn))),
          })),
        })),
    };
  }

  /**
   * PostgreSQL substring search (API_SPEC §31 "V1 may use PostgreSQL-based search").
   * `page`/`pageSize` apply to each result list independently.
   */
  async search(query: SearchQuery): Promise<SearchResult> {
    const start = (query.page - 1) * query.pageSize;
    const contains = { contains: query.q, mode: 'insensitive' as const };
    const result: SearchResult = { restaurants: [], menuItems: [] };

    if (query.type !== 'MENU_ITEM') {
      const rows = await this.candidates(query, [
        { OR: [{ name: contains }, { cuisineDescription: contains }] },
      ]);
      const summaries = (await this.summarize(rows, query)).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      result.restaurants = summaries.slice(start, start + query.pageSize);
    }

    if (query.type !== 'RESTAURANT') {
      // ponytail: loads every matching visible restaurant to apply the radius in memory; move
      // distance into SQL (PostGIS or a lat/lng expression) when the catalogue outgrows one city.
      const restaurants = await this.candidates(query, []);
      const summarize = await this.summarizer(query);
      const items = await this.prisma.menuItem.findMany({
        where: {
          restaurantId: { in: restaurants.map((restaurant) => restaurant.id) },
          category: { isActive: true },
          OR: [{ name: contains }, { description: contains }],
        },
        include: { restaurant: { include: INCLUDE } },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: start,
        take: query.pageSize,
      });
      result.menuItems = items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        imageUrl: item.imageUrl,
        basePrice: formatMoney(money(item.basePrice)),
        isAvailable: item.isAvailable,
        restaurant: summarize(item.restaurant),
      }));
    }
    return result;
  }

  // ---------------------------------------------------------------- helpers

  private async visible(restaurantId: string): Promise<Row> {
    const row = await this.prisma.restaurant.findFirst({
      where: {
        id: restaurantId,
        approvalStatus: 'APPROVED',
        status: { in: [...DISCOVERABLE_STATUSES] },
      },
      include: INCLUDE,
    });
    if (!row) throw notFound('RESTAURANT_NOT_FOUND');
    return row;
  }

  /**
   * Visible restaurants matching `filters`, limited to `radius` km of the caller when given.
   * ponytail: exact distance is applied in memory after a bounding-box prefilter; fine for a
   * single-city V1 catalogue, move to SQL/PostGIS when the restaurant count grows large.
   */
  private async candidates(
    location: Located,
    filters: Prisma.RestaurantWhereInput[],
  ): Promise<Row[]> {
    const origin = coordinates(location);
    const box = origin && location.radius ? boundingBox(origin, location.radius) : null;
    const rows = await this.prisma.restaurant.findMany({
      where: {
        approvalStatus: 'APPROVED',
        status: { in: [...DISCOVERABLE_STATUSES] },
        AND: [
          ...filters,
          ...(box
            ? [
                { latitude: { gte: box.minLatitude, lte: box.maxLatitude } },
                { longitude: { gte: box.minLongitude, lte: box.maxLongitude } },
              ]
            : []),
        ],
      },
      include: INCLUDE,
    });
    const radius = location.radius;
    if (!origin || radius === undefined) return rows;
    return rows.filter((row) => {
      const distance = distanceTo(origin, row);
      return distance !== null && distance <= radius;
    });
  }

  private async summarize(rows: Row[], location: Located): Promise<RestaurantSummary[]> {
    return rows.map(await this.summarizer(location));
  }

  private async summarizer(location: Located): Promise<(row: Row) => RestaurantSummary> {
    const origin = coordinates(location);
    const deliveryFee = await this.settings.get('pricing.delivery_fee');
    const now = new Date();
    return (row) => {
      const distanceKm = origin ? distanceTo(origin, row) : null;
      const radius = row.deliverySettings?.deliveryRadius.toNumber();
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        logoUrl: row.logoUrl,
        coverImageUrl: row.coverImageUrl,
        cuisineDescription: row.cuisineDescription,
        area: row.area,
        city: row.city,
        status: effectiveStatus(row, now),
        isOrderableNow: this.restaurants.isOrderable(row, now),
        minimumOrderAmount: row.deliverySettings
          ? formatMoney(money(row.deliverySettings.minimumOrderAmount))
          : null,
        estimatedPreparationMinutes: row.deliverySettings?.estimatedPreparationMinutes ?? null,
        deliveryFee: deliveryFee === undefined ? null : formatMoney(money(deliveryFee)),
        distanceKm: distanceKm === null ? null : Math.round(distanceKm * 100) / 100,
        deliversToLocation:
          distanceKm === null ? null : radius !== undefined && distanceKm <= radius,
      };
    };
  }
}

function coordinates(location: Located): Coordinates | null {
  return location.latitude !== undefined && location.longitude !== undefined
    ? { latitude: location.latitude, longitude: location.longitude }
    : null;
}

function distanceTo(origin: Coordinates, row: Row): number | null {
  if (!row.latitude || !row.longitude) return null;
  return straightLineKm(origin, {
    latitude: row.latitude.toNumber(),
    longitude: row.longitude.toNumber(),
  });
}

function withoutActive<T extends { isActive: boolean }>(value: T): Omit<T, 'isActive'> {
  const { isActive: _isActive, ...rest } = value;
  return rest;
}
