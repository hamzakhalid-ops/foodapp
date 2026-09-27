import { Injectable } from '@nestjs/common';
import {
  type AdminReviewListQuery,
  type AdminReviewReportListQuery,
  type CreateReviewRequest,
  type PublicReview,
  type PublicReviewListQuery,
  RATING_DISPLAY_DECIMALS,
  type RatingSummary,
  type ReportReviewRequest,
  type RestaurantReviewListQuery,
  type Review as ReviewView,
  type ReviewEligibility,
  type ReviewReport as ReviewReportView,
  type UpdateReviewRequest,
} from '@quickbite/validation';
import { conflict, notFound, validationError } from '../../common/http/errors';
import { decodeCursor, encodeCursor } from '../../common/http/pagination';
import { type RequestMeta } from '../../common/http/request-meta';
import { OutboxService } from '../../common/outbox/outbox.service';
import { Prisma, type ReviewReport, type ReviewStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AUDIT_ACTIONS, type AuditAction } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';

type Tx = Prisma.TransactionClient;

const REVIEW_INCLUDE = {
  response: true,
  customer: { include: { customerProfile: true } },
} satisfies Prisma.ReviewInclude;
type ReviewRow = Prisma.ReviewGetPayload<{ include: typeof REVIEW_INCLUDE }>;

/** Moderation transitions (REVIEW_RULES §11, §34). */
const MODERATION: Record<
  'hide' | 'restore' | 'remove',
  { from: ReviewStatus[]; to: ReviewStatus; audit: AuditAction }
> = {
  hide: {
    from: ['PUBLISHED', 'PENDING_MODERATION'],
    to: 'HIDDEN',
    audit: AUDIT_ACTIONS.REVIEW_HIDDEN,
  },
  restore: {
    from: ['HIDDEN', 'PENDING_MODERATION'],
    to: 'PUBLISHED',
    audit: AUDIT_ACTIONS.REVIEW_RESTORED,
  },
  remove: {
    from: ['PUBLISHED', 'PENDING_MODERATION', 'HIDDEN'],
    to: 'REMOVED',
    audit: AUDIT_ACTIONS.REVIEW_REMOVED,
  },
};

/**
 * Customer → restaurant reviews (REVIEW_RULES, REVIEW_SPEC, API_SPEC §62, §88–89, §105). One
 * review per delivered order, derived customer/restaurant, no destructive deletes, public rating
 * computed from PUBLISHED reviews only.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  // ---------------------------------------------------------------- customer

  async eligibility(customerId: string, orderId: string): Promise<ReviewEligibility> {
    const order = await this.ownOrder(customerId, orderId);
    const existing = await this.prisma.review.findUnique({ where: { orderId } });
    if (existing)
      return { eligible: false, reason: 'REVIEW_ALREADY_EXISTS', reviewId: existing.id };
    if (order.status !== 'DELIVERED')
      return { eligible: false, reason: 'REVIEW_NOT_ELIGIBLE', reviewId: null };
    return { eligible: true, reason: null, reviewId: null };
  }

  async create(
    customerId: string,
    orderId: string,
    input: CreateReviewRequest,
  ): Promise<ReviewView> {
    try {
      const reviewId = await this.prisma.$transaction(async (tx) => {
        const order = await this.ownOrder(customerId, orderId, tx);
        if (order.status !== 'DELIVERED') {
          throw conflict('REVIEW_NOT_ELIGIBLE', 'Only delivered orders can be reviewed.');
        }
        const review = await tx.review.create({
          data: {
            orderId,
            customerId,
            restaurantId: order.restaurantId,
            rating: input.rating,
            comment: input.comment ?? null,
          },
        });
        await this.outbox.enqueue(tx, {
          eventType: 'review.created',
          aggregateType: 'review',
          aggregateId: review.id,
          payload: {
            reviewId: review.id,
            orderId,
            restaurantId: order.restaurantId,
            rating: input.rating,
          },
        });
        return review.id;
      });
      return await this.view(reviewId);
    } catch (error) {
      // UNIQUE(order_id) is the final guard against concurrent duplicates (§7).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw conflict('REVIEW_ALREADY_EXISTS', 'This order has already been reviewed.');
      }
      throw error;
    }
  }

  async getForOrder(customerId: string, orderId: string): Promise<ReviewView> {
    await this.ownOrder(customerId, orderId);
    const review = await this.prisma.review.findUnique({ where: { orderId } });
    if (!review) throw notFound('REVIEW_NOT_FOUND');
    return this.view(review.id);
  }

  /** Editing never restores moderated visibility (REVIEW_RULES §12–13). */
  async update(
    customerId: string,
    reviewId: string,
    input: UpdateReviewRequest,
  ): Promise<ReviewView> {
    const review = await this.ownReview(customerId, reviewId);
    if (review.status === 'REMOVED' || review.status === 'HIDDEN') {
      throw conflict('REVIEW_ALREADY_REMOVED', 'This review can no longer be edited.');
    }
    await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        ...(input.rating !== undefined ? { rating: input.rating } : {}),
        ...(input.comment !== undefined ? { comment: input.comment } : {}),
      },
    });
    return this.view(reviewId);
  }

  /** Customer removal is a status change, never a delete (§14). */
  async removeOwn(customerId: string, reviewId: string, meta: RequestMeta): Promise<void> {
    const review = await this.ownReview(customerId, reviewId);
    if (review.status === 'REMOVED')
      throw conflict('REVIEW_ALREADY_REMOVED', 'The review is already removed.');
    await this.prisma.$transaction(async (tx) => {
      await tx.review.update({ where: { id: reviewId }, data: { status: 'REMOVED' } });
      await this.audit.record(
        {
          action: AUDIT_ACTIONS.REVIEW_REMOVED,
          actorUserId: customerId,
          entityType: 'REVIEW',
          entityId: reviewId,
          oldValues: { status: review.status },
          newValues: { status: 'REMOVED', by: 'CUSTOMER' },
          meta,
        },
        tx,
      );
    });
  }

  /** Any authenticated user may report a review they can see (§18–19); one report per user. */
  async report(
    userId: string,
    reviewId: string,
    input: ReportReviewRequest,
    restaurantId?: string,
  ) {
    const review = await this.prisma.review.findFirst({
      where: {
        id: reviewId,
        ...(restaurantId ? { restaurantId } : { status: 'PUBLISHED' }),
      },
    });
    if (!review) throw notFound('REVIEW_NOT_FOUND');
    try {
      const report = await this.prisma.reviewReport.create({
        data: {
          reviewId,
          reportedBy: userId,
          reason: input.reason,
          details: input.details ?? null,
        },
      });
      return toReport(report);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw conflict('REVIEW_REPORT_INVALID', 'You have already reported this review.');
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------- public

  async publicList(restaurantId: string, query: PublicReviewListQuery) {
    const where: Prisma.ReviewWhereInput = {
      restaurantId,
      status: 'PUBLISHED',
      ...(query.rating ? { rating: query.rating } : {}),
    };
    const orderBy: Prisma.ReviewOrderByWithRelationInput[] =
      query.sort === 'highest'
        ? [{ rating: 'desc' }, { createdAt: 'desc' }]
        : query.sort === 'lowest'
          ? [{ rating: 'asc' }, { createdAt: 'desc' }]
          : [{ createdAt: 'desc' }];
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        include: REVIEW_INCLUDE,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { rows: rows.map(toPublic), total };
  }

  async ratingSummary(restaurantId: string): Promise<RatingSummary> {
    return (await this.ratingSummaries([restaurantId])).get(restaurantId) ?? emptySummary();
  }

  /** Aggregates over PUBLISHED reviews only (REVIEW_RULES §22–23). */
  async ratingSummaries(restaurantIds: string[]): Promise<Map<string, RatingSummary>> {
    const result = new Map<string, RatingSummary>();
    if (restaurantIds.length === 0) return result;
    const groups = await this.prisma.review.groupBy({
      by: ['restaurantId', 'rating'],
      where: { restaurantId: { in: restaurantIds }, status: 'PUBLISHED' },
      _count: { _all: true },
    });
    for (const group of groups) {
      const summary = result.get(group.restaurantId) ?? emptySummary();
      summary.distribution[group.rating as 1 | 2 | 3 | 4 | 5] = group._count._all;
      result.set(group.restaurantId, summary);
    }
    for (const summary of result.values()) {
      const entries = Object.entries(summary.distribution);
      summary.reviewCount = entries.reduce((total, [, count]) => total + count, 0);
      const sum = entries.reduce((total, [stars, count]) => total + Number(stars) * count, 0);
      // Integer sum / count, rounded once for display (exact inputs, no accumulated float error).
      summary.averageRating = summary.reviewCount
        ? Number((sum / summary.reviewCount).toFixed(RATING_DISPLAY_DECIMALS))
        : null;
    }
    return result;
  }

  // ---------------------------------------------------------------- restaurant

  async restaurantList(restaurantId: string, query: RestaurantReviewListQuery) {
    return this.page(
      {
        restaurantId,
        status: { not: 'REMOVED' },
        ...(query.rating ? { rating: query.rating } : {}),
      },
      query,
    );
  }

  async restaurantGet(restaurantId: string, reviewId: string): Promise<ReviewView> {
    const review = await this.prisma.review.findFirst({ where: { id: reviewId, restaurantId } });
    if (!review) throw notFound('REVIEW_NOT_FOUND');
    return this.view(reviewId);
  }

  /** Create or edit the restaurant's single response (REVIEW_RULES §15–17). */
  async reply(
    restaurantId: string,
    reviewId: string,
    userId: string,
    response: string,
    meta: RequestMeta,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const review = await tx.review.findFirst({ where: { id: reviewId, restaurantId } });
      if (!review) throw notFound('REVIEW_NOT_FOUND');
      if (review.status === 'REMOVED')
        throw conflict('REVIEW_ALREADY_REMOVED', 'The review was removed.');
      const existing = await tx.reviewResponse.findUnique({ where: { reviewId } });
      await tx.reviewResponse.upsert({
        where: { reviewId },
        create: { reviewId, restaurantUserId: userId, response },
        update: { response, restaurantUserId: userId },
      });
      await this.audit.record(
        {
          action: AUDIT_ACTIONS.REVIEW_RESPONSE_SAVED,
          actorUserId: userId,
          entityType: 'REVIEW',
          entityId: reviewId,
          ...(existing ? { oldValues: { response: existing.response } } : {}),
          newValues: { response },
          metadata: { restaurantId },
          meta,
        },
        tx,
      );
      if (!existing) {
        await this.outbox.enqueue(tx, {
          eventType: 'review.responded',
          aggregateType: 'review',
          aggregateId: reviewId,
          payload: { reviewId, customerId: review.customerId, restaurantId },
        });
      }
    });
    return this.view(reviewId);
  }

  // ---------------------------------------------------------------- admin

  adminList(query: AdminReviewListQuery) {
    return this.page(
      {
        ...(query.status ? { status: query.status } : {}),
        ...(query.restaurantId ? { restaurantId: query.restaurantId } : {}),
      },
      query,
    );
  }

  async adminGet(reviewId: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      include: { reports: true },
    });
    if (!review) throw notFound('REVIEW_NOT_FOUND');
    return {
      ...(await this.view(reviewId)),
      customerId: review.customerId,
      reports: review.reports.map(toReport),
    };
  }

  /**
   * hide / restore / remove with a reason (audited). Hiding or removing resolves the review's
   * open reports; restoring dismisses them.
   */
  async moderate(
    reviewId: string,
    action: keyof typeof MODERATION,
    reason: string,
    adminId: string,
    meta: RequestMeta,
  ): Promise<ReviewView> {
    const rule = MODERATION[action];
    await this.prisma.$transaction(async (tx) => {
      const review = await tx.review.findUnique({ where: { id: reviewId } });
      if (!review) throw notFound('REVIEW_NOT_FOUND');
      const updated = await tx.review.updateMany({
        where: { id: reviewId, status: { in: rule.from } },
        data: { status: rule.to },
      });
      if (updated.count === 0) {
        throw conflict(
          'INVALID_REQUEST',
          `The review cannot be moved from ${review.status} to ${rule.to}.`,
        );
      }
      await tx.reviewReport.updateMany({
        where: { reviewId, status: 'OPEN' },
        data: {
          status: action === 'restore' ? 'DISMISSED' : 'RESOLVED',
          resolvedBy: adminId,
          resolvedAt: new Date(),
        },
      });
      await this.audit.record(
        {
          action: rule.audit,
          actorUserId: adminId,
          entityType: 'REVIEW',
          entityId: reviewId,
          oldValues: { status: review.status },
          newValues: { status: rule.to, reason },
          meta,
        },
        tx,
      );
    });
    return this.view(reviewId);
  }

  async adminReports(query: AdminReviewReportListQuery) {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (query.cursor && !cursor) throw validationError({ cursor: 'Invalid cursor' });
    const rows = await this.prisma.reviewReport.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.at } },
                { createdAt: cursor.at, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      rows: page.map(toReport),
      nextCursor: rows.length > query.limit && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async resolveReport(
    reportId: string,
    outcome: 'RESOLVED' | 'DISMISSED',
    reason: string,
    adminId: string,
    meta: RequestMeta,
  ): Promise<ReviewReportView> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.reviewReport.updateMany({
        where: { id: reportId, status: 'OPEN' },
        data: { status: outcome, resolvedBy: adminId, resolvedAt: new Date() },
      });
      if (updated.count === 0) {
        if (!(await tx.reviewReport.count({ where: { id: reportId } })))
          throw notFound('RESOURCE_NOT_FOUND', 'Report not found.');
        throw conflict('INVALID_REQUEST', 'The report is already closed.');
      }
      await this.audit.record(
        {
          action: AUDIT_ACTIONS.REVIEW_REPORT_RESOLVED,
          actorUserId: adminId,
          entityType: 'REVIEW_REPORT',
          entityId: reportId,
          newValues: { status: outcome, reason },
          meta,
        },
        tx,
      );
      return toReport(await tx.reviewReport.findUniqueOrThrow({ where: { id: reportId } }));
    });
  }

  // ---------------------------------------------------------------- helpers

  private async page(
    where: Prisma.ReviewWhereInput,
    query: { cursor?: string | undefined; limit: number },
  ) {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (query.cursor && !cursor) throw validationError({ cursor: 'Invalid cursor' });
    const rows = await this.prisma.review.findMany({
      where: {
        AND: [where],
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.at } },
                { createdAt: cursor.at, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      include: REVIEW_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      rows: page.map(toReview),
      nextCursor: rows.length > query.limit && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  private async ownOrder(customerId: string, orderId: string, tx: Tx = this.prisma) {
    const order = await tx.order.findFirst({ where: { id: orderId, customerId } });
    if (!order) throw notFound('ORDER_NOT_FOUND');
    return order;
  }

  private async ownReview(customerId: string, reviewId: string) {
    const review = await this.prisma.review.findFirst({ where: { id: reviewId, customerId } });
    if (!review) throw notFound('REVIEW_NOT_FOUND');
    return review;
  }

  private async view(reviewId: string): Promise<ReviewView> {
    return toReview(
      await this.prisma.review.findUniqueOrThrow({
        where: { id: reviewId },
        include: REVIEW_INCLUDE,
      }),
    );
  }
}

function emptySummary(): RatingSummary {
  return { averageRating: null, reviewCount: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
}

function toReview(review: ReviewRow): ReviewView {
  return {
    id: review.id,
    orderId: review.orderId,
    restaurantId: review.restaurantId,
    rating: review.rating,
    comment: review.comment,
    status: review.status,
    createdAt: review.createdAt.toISOString(),
    updatedAt: review.updatedAt.toISOString(),
    response: review.response
      ? {
          response: review.response.response,
          createdAt: review.response.createdAt.toISOString(),
          updatedAt: review.response.updatedAt.toISOString(),
        }
      : null,
  };
}

function toPublic(review: ReviewRow): PublicReview {
  const { orderId: _orderId, status: _status, ...rest } = toReview(review);
  return { ...rest, customerFirstName: review.customer.customerProfile?.firstName ?? 'Customer' };
}

function toReport(report: ReviewReport): ReviewReportView {
  return {
    id: report.id,
    reviewId: report.reviewId,
    reason: report.reason as ReviewReportView['reason'],
    details: report.details,
    status: report.status,
    createdAt: report.createdAt.toISOString(),
    resolvedAt: report.resolvedAt?.toISOString() ?? null,
  };
}
