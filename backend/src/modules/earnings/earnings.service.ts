import { Injectable, Logger } from '@nestjs/common';
import {
  type EarningListQuery,
  type FinanceRangeQuery,
  type RestaurantEarning as RestaurantEarningView,
  type RestaurantEarningsSummary,
  type RestaurantFeesSummary,
  type RiderEarning as RiderEarningView,
  type RiderEarningsSummary,
} from '@quickbite/validation';
import { notFound } from '../../common/http/errors';
import { createdBefore, keysetPage } from '../../common/http/pagination';
import { formatMoney, money, ZERO } from '../../common/money/money';
import { SettingsService } from '../../common/settings/settings.service';
import { AppConfigService } from '../../config/app-config.service';
import {
  type EarningStatus,
  type Prisma,
  type RestaurantEarning,
  type RiderEarning,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { restaurantEarningAmounts } from './earning-calculator';

const STATUSES: EarningStatus[] = ['AVAILABLE', 'IN_SETTLEMENT', 'SETTLED'];

type Decimalish = Prisma.Decimal | null | undefined;
const sum = (value: Decimalish) => formatMoney(value ?? ZERO);

/**
 * Restaurant and rider earnings (FINANCIAL_SPEC §7–22, ADR-0014 §2). Earnings are created once per
 * delivered order/delivery from the `delivery.delivered` outbox event; the unique order/delivery
 * keys make redelivery harmless.
 */
@Injectable()
export class EarningsService {
  private readonly logger = new Logger(EarningsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Missing finance settings fail the handler (503) so the outbox retries once they are configured.
   * ponytail: rates are read when the event is handled (normally seconds after delivery); add
   * effective-dated rates (FINANCIAL_SPEC §60) if rates change often.
   */
  async recordForDelivery(deliveryId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const delivery = await tx.delivery.findUniqueOrThrow({
        where: { id: deliveryId },
        include: { order: true },
      });
      const { order } = delivery;
      if (delivery.status !== 'DELIVERED' || order.status !== 'DELIVERED' || !delivery.riderId) {
        this.logger.warn({ deliveryId }, 'Delivery is not delivered; no earnings created');
        return;
      }
      const commissionPercent = money(
        await this.settings.require('finance.commission_percent', tx),
      );
      const riderBase = money(await this.settings.require('finance.rider_delivery_earning', tx));
      const amounts = restaurantEarningAmounts(
        order.subtotal,
        order.discountAmount,
        commissionPercent,
      );
      await tx.restaurantEarning.createMany({
        data: [
          {
            restaurantId: order.restaurantId,
            orderId: order.id,
            commissionPercent,
            currency: order.currency,
            ...amounts,
          },
        ],
        skipDuplicates: true,
      });
      await tx.riderEarning.createMany({
        data: [
          {
            riderId: delivery.riderId,
            deliveryId: delivery.id,
            baseAmount: riderBase,
            bonusAmount: ZERO,
            adjustmentAmount: ZERO,
            totalAmount: riderBase,
            currency: order.currency,
          },
        ],
        skipDuplicates: true,
      });
    });
  }

  // ------------------------------------------------------------------ restaurant (owner only)

  async restaurantSummary(
    restaurantId: string,
    range: FinanceRangeQuery,
  ): Promise<RestaurantEarningsSummary> {
    const groups = await this.prisma.restaurantEarning.groupBy({
      by: ['status'],
      where: { restaurantId, createdAt: createdRange(range) },
      _count: { _all: true },
      _sum: {
        grossAmount: true,
        commissionAmount: true,
        feeAmount: true,
        refundAmount: true,
        netAmount: true,
      },
    });
    const total = (field: keyof (typeof groups)[number]['_sum']) =>
      sum(groups.reduce((acc, g) => acc.add(g._sum[field] ?? ZERO), ZERO));
    return {
      ...rangeView(range),
      currency: this.config.get('APP_CURRENCY'),
      orderCount: groups.reduce((acc, g) => acc + g._count._all, 0),
      grossAmount: total('grossAmount'),
      commissionAmount: total('commissionAmount'),
      feeAmount: total('feeAmount'),
      refundAmount: total('refundAmount'),
      netAmount: total('netAmount'),
      netByStatus: byStatus(groups.map((g) => [g.status, g._sum.netAmount])),
    };
  }

  async restaurantFees(
    restaurantId: string,
    range: FinanceRangeQuery,
  ): Promise<RestaurantFeesSummary> {
    const [totals, percent] = await Promise.all([
      this.prisma.restaurantEarning.aggregate({
        where: { restaurantId, createdAt: createdRange(range) },
        _sum: { commissionAmount: true, feeAmount: true },
      }),
      this.settings.get('finance.commission_percent'),
    ]);
    return {
      ...rangeView(range),
      currency: this.config.get('APP_CURRENCY'),
      currentCommissionPercent: percent ?? null,
      commissionAmount: sum(totals._sum.commissionAmount),
      feeAmount: sum(totals._sum.feeAmount),
    };
  }

  async restaurantList(restaurantId: string, query: EarningListQuery) {
    const rows = await this.prisma.restaurantEarning.findMany({
      where: {
        restaurantId,
        ...(query.status ? { status: query.status } : {}),
        createdAt: createdRange(query),
        ...createdBefore(query.cursor),
      },
      include: { order: { select: { orderNumber: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    return keysetPage(rows, query.limit, toRestaurantEarning);
  }

  async restaurantEarning(restaurantId: string, id: string): Promise<RestaurantEarningView> {
    const row = await this.prisma.restaurantEarning.findFirst({
      where: { id, restaurantId },
      include: { order: { select: { orderNumber: true } } },
    });
    if (!row) throw notFound();
    return toRestaurantEarning(row);
  }

  // ------------------------------------------------------------------ rider (own records)

  async riderSummary(riderId: string, range: FinanceRangeQuery): Promise<RiderEarningsSummary> {
    const groups = await this.prisma.riderEarning.groupBy({
      by: ['status'],
      where: { riderId, createdAt: createdRange(range) },
      _count: { _all: true },
      _sum: { baseAmount: true, bonusAmount: true, adjustmentAmount: true, totalAmount: true },
    });
    const total = (field: keyof (typeof groups)[number]['_sum']) =>
      sum(groups.reduce((acc, g) => acc.add(g._sum[field] ?? ZERO), ZERO));
    return {
      ...rangeView(range),
      currency: this.config.get('APP_CURRENCY'),
      deliveryCount: groups.reduce((acc, g) => acc + g._count._all, 0),
      baseAmount: total('baseAmount'),
      bonusAmount: total('bonusAmount'),
      adjustmentAmount: total('adjustmentAmount'),
      totalAmount: total('totalAmount'),
      totalByStatus: byStatus(groups.map((g) => [g.status, g._sum.totalAmount])),
    };
  }

  async riderList(riderId: string, query: EarningListQuery) {
    const rows = await this.prisma.riderEarning.findMany({
      where: {
        riderId,
        ...(query.status ? { status: query.status } : {}),
        createdAt: createdRange(query),
        ...createdBefore(query.cursor),
      },
      include: { delivery: { select: { order: { select: { orderNumber: true } } } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    return keysetPage(rows, query.limit, toRiderEarning);
  }

  async riderEarning(riderId: string, id: string): Promise<RiderEarningView> {
    const row = await this.prisma.riderEarning.findFirst({
      where: { id, riderId },
      include: { delivery: { select: { order: { select: { orderNumber: true } } } } },
    });
    if (!row) throw notFound();
    return toRiderEarning(row);
  }
}

function createdRange(range: FinanceRangeQuery): Prisma.DateTimeFilter {
  return {
    ...(range.from ? { gte: new Date(range.from) } : {}),
    ...(range.to ? { lt: new Date(range.to) } : {}),
  };
}

function rangeView(range: FinanceRangeQuery) {
  return { from: range.from ?? null, to: range.to ?? null };
}

function byStatus(entries: [EarningStatus, Decimalish][]): Record<EarningStatus, string> {
  const totals = new Map(entries);
  return Object.fromEntries(STATUSES.map((status) => [status, sum(totals.get(status))])) as Record<
    EarningStatus,
    string
  >;
}

function toRestaurantEarning(
  row: RestaurantEarning & { order: { orderNumber: string } },
): RestaurantEarningView {
  return {
    id: row.id,
    orderId: row.orderId,
    orderNumber: row.order.orderNumber,
    grossAmount: formatMoney(row.grossAmount),
    commissionPercent: row.commissionPercent.toString(),
    commissionAmount: formatMoney(row.commissionAmount),
    feeAmount: formatMoney(row.feeAmount),
    refundAmount: formatMoney(row.refundAmount),
    netAmount: formatMoney(row.netAmount),
    currency: row.currency,
    status: row.status,
    settlementId: row.settlementId,
    createdAt: row.createdAt.toISOString(),
  };
}

function toRiderEarning(
  row: RiderEarning & { delivery: { order: { orderNumber: string } } },
): RiderEarningView {
  return {
    id: row.id,
    deliveryId: row.deliveryId,
    orderNumber: row.delivery.order.orderNumber,
    baseAmount: formatMoney(row.baseAmount),
    bonusAmount: formatMoney(row.bonusAmount),
    adjustmentAmount: formatMoney(row.adjustmentAmount),
    totalAmount: formatMoney(row.totalAmount),
    currency: row.currency,
    status: row.status,
    settlementId: row.settlementId,
    createdAt: row.createdAt.toISOString(),
  };
}
