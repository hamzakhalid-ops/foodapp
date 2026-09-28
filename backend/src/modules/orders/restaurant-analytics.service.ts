import { Injectable } from '@nestjs/common';
import {
  type AnalyticsCancellations,
  type AnalyticsOrders,
  type AnalyticsOverview,
  type AnalyticsPopularItems,
  type AnalyticsRangeQuery,
  type AnalyticsRatings,
  type AnalyticsSales,
  type PopularItemsQuery,
} from '@quickbite/validation';
import { formatMoney, money, ZERO } from '../../common/money/money';
import { AppConfigService } from '../../config/app-config.service';
import { type Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { ReviewsService } from '../reviews/reviews.service';
import { RELEASED_TO_RESTAURANT } from './orders.service';

const CANCELLED = [
  'CANCELLED_BY_CUSTOMER',
  'CANCELLED_BY_RESTAURANT',
  'CANCELLED_BY_ADMIN',
] as const;

/**
 * Restaurant analytics (API_SPEC §61): read-only aggregates over the restaurant's own orders that
 * were released to it (unpaid online orders are never visible, ORDER_RULES). Order counts use
 * `placed_at`; sales, popular items and daily series use delivered orders by `delivered_at`.
 * Sales = subtotal − discount (the restaurant's gross, ADR-0014 §2); fees and tax are excluded.
 */
@Injectable()
export class RestaurantAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reviews: ReviewsService,
    private readonly config: AppConfigService,
  ) {}

  async overview(restaurantId: string, range: AnalyticsRangeQuery): Promise<AnalyticsOverview> {
    const placed = this.scope(restaurantId, { placedAt: between(range) });
    const [orderCount, cancelledCount, delivered, rating] = await Promise.all([
      this.prisma.order.count({ where: placed }),
      this.prisma.order.count({ where: { AND: [placed, { status: { in: [...CANCELLED] } }] } }),
      this.prisma.order.aggregate({
        where: this.scope(restaurantId, { status: 'DELIVERED', deliveredAt: between(range) }),
        _count: { _all: true },
        _sum: { subtotal: true, discountAmount: true },
      }),
      this.reviews.ratingSummaries([restaurantId], between(range)),
    ]);
    const sales = (delivered._sum.subtotal ?? ZERO).sub(delivered._sum.discountAmount ?? ZERO);
    const deliveredCount = delivered._count._all;
    const summary = rating.get(restaurantId);
    return {
      ...rangeView(range),
      currency: this.config.get('APP_CURRENCY'),
      orderCount,
      deliveredCount,
      cancelledCount,
      salesAmount: formatMoney(sales),
      averageOrderValue: deliveredCount ? formatMoney(sales.div(deliveredCount)) : null,
      averageRating: summary?.averageRating ?? null,
      reviewCount: summary?.reviewCount ?? 0,
    };
  }

  /** Daily delivered orders and sales, by business-timezone date (ADR-0014 §6). */
  async sales(restaurantId: string, range: AnalyticsRangeQuery): Promise<AnalyticsSales> {
    const timeZone = this.config.get('APP_TIMEZONE');
    const from = range.from ? new Date(range.from) : null;
    const to = range.to ? new Date(range.to) : null;
    const rows = await this.prisma.$queryRaw<{ date: string; count: number; sales: string }[]>`
      SELECT to_char(delivered_at AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS date,
             count(*)::int AS count,
             sum(subtotal - discount_amount)::text AS sales
      FROM orders
      WHERE restaurant_id = ${restaurantId}::uuid
        AND status = 'DELIVERED'
        AND (${from}::timestamptz IS NULL OR delivered_at >= ${from}::timestamptz)
        AND (${to}::timestamptz IS NULL OR delivered_at <= ${to}::timestamptz)
      GROUP BY 1
      ORDER BY 1`;
    return {
      ...rangeView(range),
      currency: this.config.get('APP_CURRENCY'),
      days: rows.map((row) => ({
        date: row.date,
        deliveredCount: row.count,
        salesAmount: formatMoney(money(row.sales)),
      })),
    };
  }

  async orders(restaurantId: string, range: AnalyticsRangeQuery): Promise<AnalyticsOrders> {
    const groups = await this.prisma.order.groupBy({
      by: ['status'],
      where: this.scope(restaurantId, { placedAt: between(range) }),
      _count: { _all: true },
    });
    return {
      ...rangeView(range),
      total: groups.reduce((sum, group) => sum + group._count._all, 0),
      byStatus: Object.fromEntries(groups.map((group) => [group.status, group._count._all])),
    };
  }

  async popularItems(
    restaurantId: string,
    query: PopularItemsQuery,
  ): Promise<AnalyticsPopularItems> {
    const groups = await this.prisma.orderItem.groupBy({
      by: ['menuItemId', 'itemName'],
      where: {
        order: this.scope(restaurantId, { status: 'DELIVERED', deliveredAt: between(query) }),
      },
      _sum: { quantity: true, subtotal: true },
      orderBy: [{ _sum: { quantity: 'desc' } }, { itemName: 'asc' }],
      take: query.limit,
    });
    return {
      ...rangeView(query),
      currency: this.config.get('APP_CURRENCY'),
      items: groups.map((group) => ({
        menuItemId: group.menuItemId,
        itemName: group.itemName,
        quantity: group._sum.quantity ?? 0,
        salesAmount: formatMoney(group._sum.subtotal ?? ZERO),
      })),
    };
  }

  /** Published reviews created in the range (REVIEW_RULES §22–23). */
  async ratings(restaurantId: string, range: AnalyticsRangeQuery): Promise<AnalyticsRatings> {
    const summary = (await this.reviews.ratingSummaries([restaurantId], between(range))).get(
      restaurantId,
    );
    return {
      ...rangeView(range),
      averageRating: summary?.averageRating ?? null,
      reviewCount: summary?.reviewCount ?? 0,
      distribution: summary?.distribution ?? { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    };
  }

  async cancellations(
    restaurantId: string,
    range: AnalyticsRangeQuery,
  ): Promise<AnalyticsCancellations> {
    const where = this.scope(restaurantId, {
      placedAt: between(range),
      status: { in: [...CANCELLED] },
    });
    const [byStatus, byReason] = await Promise.all([
      this.prisma.order.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.orderCancellation.groupBy({
        by: ['reasonCode'],
        where: { order: where },
        _count: { _all: true },
        orderBy: { _count: { reasonCode: 'desc' } },
      }),
    ]);
    return {
      ...rangeView(range),
      total: byStatus.reduce((sum, group) => sum + group._count._all, 0),
      byStatus: Object.fromEntries(byStatus.map((group) => [group.status, group._count._all])),
      byReason: byReason.map((group) => ({
        reasonCode: group.reasonCode,
        count: group._count._all,
      })),
    };
  }

  private scope(restaurantId: string, extra: Prisma.OrderWhereInput): Prisma.OrderWhereInput {
    return { AND: [{ restaurantId }, RELEASED_TO_RESTAURANT, extra] };
  }
}

function between(range: AnalyticsRangeQuery): Prisma.DateTimeFilter {
  return {
    ...(range.from ? { gte: new Date(range.from) } : {}),
    ...(range.to ? { lte: new Date(range.to) } : {}),
  };
}

function rangeView(range: AnalyticsRangeQuery) {
  return { from: range.from ?? null, to: range.to ?? null };
}
