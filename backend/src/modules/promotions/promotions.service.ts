import { HttpStatus, Injectable } from '@nestjs/common';
import { type ApiErrorCode } from '@quickbite/types';
import {
  type AdminUpdatePromotionRequest,
  type CreatePromotionRequest,
  type Promotion as PromotionView,
  type PromotionListQuery,
  type PromotionValidation,
  type PublicPromotion,
  type UpdatePromotionRequest,
} from '@quickbite/validation';
import { ApiException } from '../../common/http/api.exception';
import { conflict, notFound } from '../../common/http/errors';
import { type RequestMeta } from '../../common/http/request-meta';
import {
  formatMoney,
  type Money,
  money,
  percentOf,
  roundMoney,
  ZERO,
} from '../../common/money/money';
import { AppConfigService } from '../../config/app-config.service';
import { Prisma, type Promotion, type PromotionStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';

type Tx = Prisma.TransactionClient;

/** Restaurant-side status changes (PROMOTION_RULES §40). */
const STATUS_CHANGES: Partial<Record<PromotionStatus, PromotionStatus[]>> = {
  DRAFT: ['ACTIVE'],
  ACTIVE: ['PAUSED'],
  PAUSED: ['ACTIVE'],
};

/**
 * PROMOTION_RULES §17–19: percentage of the item subtotal capped by the maximum discount, or a
 * fixed amount; never more than the subtotal. Rounded once, half-up, to 2 dp.
 */
export function computeDiscount(
  promotion: Pick<Promotion, 'type' | 'value' | 'maximumDiscountAmount'>,
  subtotal: Money,
): Money {
  let discount =
    promotion.type === 'PERCENTAGE'
      ? roundMoney(percentOf(subtotal, money(promotion.value)))
      : money(promotion.value);
  if (promotion.maximumDiscountAmount && discount.greaterThan(promotion.maximumDiscountAmount)) {
    discount = money(promotion.maximumDiscountAmount);
  }
  return discount.greaterThan(subtotal) ? subtotal : discount;
}

/**
 * Restaurant-funded promotions (ADR-0014 §3, PROMOTION_RULES, API_SPEC §58, §104). One promotion
 * per order; eligibility and discounts are always recalculated by the backend at checkout.
 */
@Injectable()
export class PromotionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
  ) {}

  // ---------------------------------------------------------------- restaurant management

  async list(restaurantId: string | null, query: PromotionListQuery) {
    const where: Prisma.PromotionWhereInput = {
      ...(restaurantId ? { restaurantId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.promotion.count({ where }),
      this.prisma.promotion.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { rows: rows.map(toPromotion), total };
  }

  async get(restaurantId: string | null, promotionId: string): Promise<PromotionView> {
    return toPromotion(await this.find(this.prisma, restaurantId, promotionId));
  }

  async create(
    restaurantId: string,
    input: CreatePromotionRequest,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<PromotionView> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const promotion = await tx.promotion.create({
          data: { restaurantId, ...fields(input), status: 'DRAFT' },
        });
        await this.auditChange(
          tx,
          AUDIT_ACTIONS.PROMOTION_CREATED,
          promotion,
          null,
          actorUserId,
          meta,
        );
        return toPromotion(promotion);
      });
    } catch (error) {
      throw duplicateCode(error);
    }
  }

  async update(
    restaurantId: string,
    promotionId: string,
    input: UpdatePromotionRequest,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<PromotionView> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await this.find(tx, restaurantId, promotionId);
        if (current.status === 'DISABLED' || current.status === 'EXPIRED') {
          throw conflict(
            'INVALID_REQUEST',
            `A ${current.status.toLowerCase()} promotion cannot be changed.`,
          );
        }
        if (input.code && input.code !== current.code && current.status !== 'DRAFT') {
          throw conflict(
            'INVALID_REQUEST',
            'The code can only be changed while the promotion is a draft.',
          );
        }
        const { status, ...rest } = input;
        if (status && status !== current.status) this.assertStatusChange(current, status);
        const merged = { ...current, ...fieldsPartial(rest) };
        if (merged.type === 'PERCENTAGE' && money(merged.value).greaterThan(100)) {
          throw conflict('INVALID_REQUEST', 'A percentage cannot exceed 100.');
        }
        if (merged.endsAt <= merged.startsAt) {
          throw conflict('INVALID_REQUEST', 'The promotion must end after it starts.');
        }
        const updated = await tx.promotion.update({
          where: { id: promotionId },
          data: { ...fieldsPartial(rest), ...(status ? { status } : {}) },
        });
        await this.auditChange(
          tx,
          AUDIT_ACTIONS.PROMOTION_UPDATED,
          updated,
          current,
          actorUserId,
          meta,
        );
        return toPromotion(updated);
      });
    } catch (error) {
      throw duplicateCode(error);
    }
  }

  /** Restaurant or admin disable (final; history is kept, PROMOTION_RULES §43). */
  async disable(
    restaurantId: string | null,
    promotionId: string,
    actorUserId: string,
    meta: RequestMeta,
    reason?: string,
  ): Promise<PromotionView> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.find(tx, restaurantId, promotionId);
      if (current.status === 'DISABLED')
        throw conflict('INVALID_REQUEST', 'The promotion is already disabled.');
      const updated = await tx.promotion.update({
        where: { id: promotionId },
        data: { status: 'DISABLED' },
      });
      await this.auditChange(
        tx,
        AUDIT_ACTIONS.PROMOTION_DISABLED,
        updated,
        current,
        actorUserId,
        meta,
        reason,
      );
      return toPromotion(updated);
    });
  }

  /** API_SPEC §104: administrators change status only (ADR-0014 §3). */
  async adminSetStatus(
    promotionId: string,
    input: AdminUpdatePromotionRequest,
    adminId: string,
    meta: RequestMeta,
  ): Promise<PromotionView> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.find(tx, null, promotionId);
      if (input.status !== current.status) this.assertStatusChange(current, input.status);
      const updated = await tx.promotion.update({
        where: { id: promotionId },
        data: { status: input.status },
      });
      await this.auditChange(
        tx,
        AUDIT_ACTIONS.PROMOTION_UPDATED,
        updated,
        current,
        adminId,
        meta,
        input.reason,
      );
      return toPromotion(updated);
    });
  }

  /** Scheduled: past-end promotions become EXPIRED (validation never relies on this, §8). */
  async expireEnded(): Promise<number> {
    const result = await this.prisma.promotion.updateMany({
      where: { status: { in: ['DRAFT', 'ACTIVE', 'PAUSED'] }, endsAt: { lte: new Date() } },
      data: { status: 'EXPIRED' },
    });
    return result.count;
  }

  // ---------------------------------------------------------------- customer side

  /** Promotions a customer can currently use at a restaurant (visibility ≠ eligibility, §39). */
  async publicForRestaurant(restaurantId: string): Promise<PublicPromotion[]> {
    const now = new Date();
    const rows = await this.prisma.promotion.findMany({
      where: { restaurantId, status: 'ACTIVE', startsAt: { lte: now }, endsAt: { gt: now } },
      orderBy: { endsAt: 'asc' },
    });
    return rows
      .filter((row) => row.usageLimit === null || row.usageCount < row.usageLimit)
      .map((row) => {
        const view = toPromotion(row);
        return {
          id: view.id,
          name: view.name,
          description: view.description,
          code: view.code,
          type: view.type,
          value: view.value,
          minimumOrderAmount: view.minimumOrderAmount,
          maximumDiscount: view.maximumDiscount,
          endsAt: view.endsAt,
        };
      });
  }

  /**
   * Resolves and validates a code for the order context (PROMOTION_RULES §7, §14–19, §26–27).
   * With `lock` the promotion row is locked so usage limits hold under concurrency (§29).
   */
  async evaluate(
    tx: Tx,
    context: {
      restaurantId: string;
      customerId: string;
      code: string;
      subtotal: Money;
      lock: boolean;
    },
  ): Promise<{ promotion: Promotion; discount: Money }> {
    const code = context.code.trim().toUpperCase();
    if (context.lock) {
      await tx.$queryRaw`SELECT id FROM promotions WHERE restaurant_id = ${context.restaurantId}::uuid AND code = ${code} FOR UPDATE`;
    }
    const promotion = await tx.promotion.findUnique({
      where: { restaurantId_code: { restaurantId: context.restaurantId, code } },
    });
    if (!promotion) throw invalid('PROMOTION_NOT_FOUND', 'No promotion matches this code.');
    const now = new Date();
    if (promotion.status !== 'ACTIVE' && promotion.status !== 'EXPIRED') {
      throw invalid('PROMOTION_INACTIVE', 'This promotion is not active.');
    }
    if (now < promotion.startsAt)
      throw invalid('PROMOTION_NOT_STARTED', 'This promotion has not started yet.');
    if (promotion.status === 'EXPIRED' || now >= promotion.endsAt) {
      throw invalid('PROMOTION_EXPIRED', 'This promotion has expired.');
    }
    if (promotion.minimumOrderAmount && context.subtotal.lessThan(promotion.minimumOrderAmount)) {
      throw invalid(
        'PROMOTION_NOT_ELIGIBLE',
        `Add items worth ${formatMoney(money(promotion.minimumOrderAmount))} to use this promotion.`,
        {
          reason: 'MINIMUM_ORDER_NOT_MET',
          minimumOrderAmount: formatMoney(money(promotion.minimumOrderAmount)),
        },
      );
    }
    if (promotion.usageLimit !== null && promotion.usageCount >= promotion.usageLimit) {
      throw invalid('PROMOTION_USAGE_LIMIT_REACHED', 'This promotion has been fully redeemed.', {
        scope: 'PROMOTION',
      });
    }
    if (promotion.perCustomerUsageLimit !== null) {
      const used = await tx.promotionUsage.count({
        where: { promotionId: promotion.id, customerId: context.customerId },
      });
      if (used >= promotion.perCustomerUsageLimit) {
        throw invalid('PROMOTION_USAGE_LIMIT_REACHED', 'You have already used this promotion.', {
          scope: 'CUSTOMER',
        });
      }
    }
    const discount = computeDiscount(promotion, context.subtotal);
    if (!discount.greaterThan(ZERO)) {
      throw invalid('PROMOTION_NOT_ELIGIBLE', 'This promotion does not apply to this order.');
    }
    return { promotion, discount };
  }

  /** Consumes one usage in the order transaction (after `evaluate` with `lock`), §28–31. */
  async redeem(
    tx: Tx,
    input: { promotionId: string; customerId: string; orderId: string; discount: Money },
  ): Promise<void> {
    const updated = await tx.$executeRaw`
      UPDATE promotions SET usage_count = usage_count + 1, updated_at = now()
      WHERE id = ${input.promotionId}::uuid AND (usage_limit IS NULL OR usage_count < usage_limit)`;
    if (updated === 0) {
      throw invalid('PROMOTION_USAGE_LIMIT_REACHED', 'This promotion has been fully redeemed.', {
        scope: 'PROMOTION',
      });
    }
    await tx.promotionUsage.create({
      data: {
        promotionId: input.promotionId,
        customerId: input.customerId,
        orderId: input.orderId,
        discountAmount: input.discount,
      },
    });
  }

  /** POST /promotions/validate — informational, against the customer's current cart (§22). */
  async validateForCart(
    customerId: string,
    code: string,
    cart: { restaurantId: string; subtotal: Money } | null,
  ): Promise<PromotionValidation> {
    const currency = this.config.get('APP_CURRENCY');
    if (!cart) {
      return {
        valid: false,
        promotionId: null,
        discount: '0.00',
        currency,
        reason: 'INVALID_REQUEST',
        message: 'Your cart is empty.',
      };
    }
    try {
      const { promotion, discount } = await this.evaluate(this.prisma, {
        restaurantId: cart.restaurantId,
        customerId,
        code,
        subtotal: cart.subtotal,
        lock: false,
      });
      return {
        valid: true,
        promotionId: promotion.id,
        discount: formatMoney(discount),
        currency,
        reason: null,
        message: 'Promotion applied.',
      };
    } catch (error) {
      if (!(error instanceof ApiException)) throw error;
      return {
        valid: false,
        promotionId: null,
        discount: '0.00',
        currency,
        reason: error.code,
        message: error.message,
      };
    }
  }

  // ---------------------------------------------------------------- helpers

  private assertStatusChange(current: Promotion, next: PromotionStatus): void {
    if (!STATUS_CHANGES[current.status]?.includes(next)) {
      throw conflict(
        'INVALID_REQUEST',
        `The promotion cannot move from ${current.status} to ${next}.`,
      );
    }
    if (next === 'ACTIVE' && current.endsAt <= new Date()) {
      throw conflict('INVALID_REQUEST', 'The promotion has already ended.');
    }
  }

  private async find(tx: Tx, restaurantId: string | null, promotionId: string): Promise<Promotion> {
    const promotion = await tx.promotion.findFirst({
      where: { id: promotionId, ...(restaurantId ? { restaurantId } : {}) },
    });
    if (!promotion) throw notFound('PROMOTION_NOT_FOUND');
    return promotion;
  }

  private async auditChange(
    tx: Tx,
    action: (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS],
    promotion: Promotion,
    previous: Promotion | null,
    actorUserId: string,
    meta: RequestMeta,
    reason?: string,
  ): Promise<void> {
    await this.audit.record(
      {
        action,
        actorUserId,
        entityType: 'PROMOTION',
        entityId: promotion.id,
        ...(previous ? { oldValues: auditValues(previous) } : {}),
        newValues: { ...auditValues(promotion), ...(reason ? { reason } : {}) },
        metadata: { restaurantId: promotion.restaurantId },
        meta,
      },
      tx,
    );
  }
}

function invalid(code: ApiErrorCode, message: string, details?: Record<string, unknown>) {
  return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, code, message, details);
}

function duplicateCode(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return conflict('INVALID_REQUEST', 'This restaurant already has a promotion with this code.');
  }
  return error;
}

function fields(input: CreatePromotionRequest) {
  return {
    name: input.name,
    description: input.description ?? null,
    code: input.code,
    type: input.type,
    value: money(input.value),
    minimumOrderAmount: input.minimumOrderAmount ? money(input.minimumOrderAmount) : null,
    maximumDiscountAmount: input.maximumDiscount ? money(input.maximumDiscount) : null,
    usageLimit: input.usageLimit ?? null,
    perCustomerUsageLimit: input.perCustomerUsageLimit ?? null,
    startsAt: new Date(input.startsAt),
    endsAt: new Date(input.endsAt),
  };
}

function fieldsPartial(input: Omit<UpdatePromotionRequest, 'status'>) {
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.code !== undefined ? { code: input.code } : {}),
    ...(input.type !== undefined ? { type: input.type } : {}),
    ...(input.value !== undefined ? { value: money(input.value) } : {}),
    ...(input.minimumOrderAmount !== undefined
      ? { minimumOrderAmount: input.minimumOrderAmount ? money(input.minimumOrderAmount) : null }
      : {}),
    ...(input.maximumDiscount !== undefined
      ? { maximumDiscountAmount: input.maximumDiscount ? money(input.maximumDiscount) : null }
      : {}),
    ...(input.usageLimit !== undefined ? { usageLimit: input.usageLimit } : {}),
    ...(input.perCustomerUsageLimit !== undefined
      ? { perCustomerUsageLimit: input.perCustomerUsageLimit }
      : {}),
    ...(input.startsAt !== undefined ? { startsAt: new Date(input.startsAt) } : {}),
    ...(input.endsAt !== undefined ? { endsAt: new Date(input.endsAt) } : {}),
  };
}

function auditValues(promotion: Promotion) {
  const view = toPromotion(promotion);
  return {
    status: view.status,
    code: view.code,
    type: view.type,
    value: view.value,
    minimumOrderAmount: view.minimumOrderAmount,
    maximumDiscount: view.maximumDiscount,
    usageLimit: view.usageLimit,
    perCustomerUsageLimit: view.perCustomerUsageLimit,
    startsAt: view.startsAt,
    endsAt: view.endsAt,
  };
}

export function toPromotion(promotion: Promotion): PromotionView {
  return {
    id: promotion.id,
    restaurantId: promotion.restaurantId,
    name: promotion.name,
    description: promotion.description,
    code: promotion.code,
    type: promotion.type,
    value: formatMoney(money(promotion.value)),
    minimumOrderAmount: promotion.minimumOrderAmount
      ? formatMoney(money(promotion.minimumOrderAmount))
      : null,
    maximumDiscount: promotion.maximumDiscountAmount
      ? formatMoney(money(promotion.maximumDiscountAmount))
      : null,
    usageLimit: promotion.usageLimit,
    usageCount: promotion.usageCount,
    perCustomerUsageLimit: promotion.perCustomerUsageLimit,
    startsAt: promotion.startsAt.toISOString(),
    endsAt: promotion.endsAt.toISOString(),
    status: promotion.status,
    createdAt: promotion.createdAt.toISOString(),
  };
}
