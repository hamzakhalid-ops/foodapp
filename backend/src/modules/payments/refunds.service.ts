import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  type AdminRefundListQuery,
  type Refund as RefundView,
  type RefundDecisionRequest,
  type RefundRequest,
} from '@quickbite/validation';
import { ApiException } from '../../common/http/api.exception';
import { conflict, notFound, unprocessable, validationError } from '../../common/http/errors';
import { decodeCursor, encodeCursor } from '../../common/http/pagination';
import { type RequestMeta } from '../../common/http/request-meta';
import { formatMoney, type Money, money, sumMoney } from '../../common/money/money';
import { OutboxService } from '../../common/outbox/outbox.service';
import { type Prisma, type Refund, type RefundStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
  type ProviderRefund,
} from './provider/payment-provider';

type Tx = Prisma.TransactionClient;

/** Refunds that count against the refundable amount (PAYMENT_RULES §30). */
const OPEN_OR_DONE: RefundStatus[] = ['PENDING', 'PROCESSING', 'SUCCEEDED'];

/**
 * Refunds (PAYMENT_RULES §24–32, ADR-0014 §9). A refund is its own record; the payment amount is
 * never changed. The refundable remainder is checked under the payment row lock, and the provider
 * is called after that transaction commits.
 */
@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  /** API_SPEC §82 (admin). */
  async refund(
    paymentId: string,
    input: RefundRequest,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<RefundView> {
    const reason = input.reason ? `${input.reasonCode}: ${input.reason}` : input.reasonCode;
    const refund = await this.prisma.$transaction(async (tx) => {
      const payment = await this.lockRefundable(tx, paymentId);
      const remaining = money(payment.amount).sub(await this.committed(tx, paymentId));
      const amount = money(input.amount);
      if (amount.greaterThan(remaining)) {
        throw unprocessable(
          'PAYMENT_INVALID_AMOUNT',
          'The refund exceeds the remaining refundable amount.',
          { remaining: formatMoney(remaining) },
        );
      }
      const created = await tx.refund.create({
        data: {
          paymentId,
          orderId: payment.orderId,
          amount,
          reason,
          status: 'PENDING',
          initiatedBy: actorUserId,
        },
      });
      await this.audit.record(
        {
          action: AUDIT_ACTIONS.REFUND_REQUESTED,
          actorUserId,
          entityType: 'REFUND',
          entityId: created.id,
          newValues: { paymentId, orderId: payment.orderId, amount: formatMoney(amount), reason },
          meta,
        },
        tx,
      );
      return {
        ...created,
        providerPaymentId: payment.providerPaymentId,
        currency: payment.currency,
      };
    });

    let result: ProviderRefund;
    try {
      result = await this.provider.createRefund({
        providerPaymentId: refund.providerPaymentId ?? '',
        reference: refund.id,
        amount: formatMoney(money(refund.amount)),
        currency: refund.currency,
      });
    } catch (error) {
      this.logger.error({ err: error, refundId: refund.id }, 'Provider refund failed');
      await this.prisma.$transaction((tx) => this.setStatus(tx, refund.id, 'FAILED', null));
      throw new ApiException(
        HttpStatus.BAD_GATEWAY,
        'REFUND_FAILED',
        'The payment provider could not process the refund.',
      );
    }
    await this.prisma.$transaction((tx) =>
      this.setStatus(
        tx,
        refund.id,
        result.status === 'PENDING' ? 'PROCESSING' : result.status,
        result.providerRefundId,
      ),
    );
    return this.view(refund.id);
  }

  /**
   * ADR-0014 §9: after a paid order is cancelled the administrator decides FULL_REFUND,
   * PARTIAL_REFUND (amount) or NO_REFUND. One decision per order; every decision is audited.
   */
  async decide(
    orderId: string,
    input: RefundDecisionRequest,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<{ decision: RefundDecisionRequest['decision']; refund: RefundView | null }> {
    const { payment, remaining } = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { cancellation: true },
      });
      if (!order) throw notFound('ORDER_NOT_FOUND');
      if (!order.cancellation) {
        throw conflict('REFUND_NOT_ALLOWED', 'Refund decisions apply to cancelled orders.');
      }
      const decided =
        order.cancellation.refundAmount !== null ||
        (await tx.refund.count({ where: { orderId, status: { in: OPEN_OR_DONE } } })) > 0;
      if (decided) throw conflict('REFUND_NOT_ALLOWED', 'A refund decision was already recorded.');
      const captured = await tx.payment.findFirst({
        where: {
          orderId,
          status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'] },
          method: 'ONLINE_PAYMENT',
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!captured) throw conflict('REFUND_NOT_ALLOWED', 'The order has no captured payment.');
      await this.audit.record(
        {
          action: AUDIT_ACTIONS.REFUND_DECISION_RECORDED,
          actorUserId,
          entityType: 'ORDER',
          entityId: orderId,
          newValues: {
            decision: input.decision,
            reason: input.reason,
            ...(input.decision === 'PARTIAL_REFUND' ? { amount: input.amount } : {}),
          },
          meta,
        },
        tx,
      );
      if (input.decision === 'NO_REFUND') {
        await tx.orderCancellation.update({ where: { orderId }, data: { refundAmount: 0 } });
      }
      return {
        payment: captured,
        remaining: money(captured.amount).sub(await this.committed(tx, captured.id)),
      };
    });
    if (input.decision === 'NO_REFUND') return { decision: input.decision, refund: null };
    const amount = input.decision === 'FULL_REFUND' ? remaining : money(input.amount);
    const refund = await this.refund(
      payment.id,
      { amount: formatMoney(amount), reasonCode: 'ORDER_CANCELLED', reason: input.reason },
      actorUserId,
      meta,
    );
    return { decision: input.decision, refund };
  }

  /** Provider-verified refund update (webhook). */
  async applyProviderRefund(tx: Tx, verified: ProviderRefund): Promise<void> {
    const refund = await tx.refund.findFirst({
      where: { providerRefundId: verified.providerRefundId },
    });
    if (!refund) {
      this.logger.warn('Provider refund event for an unknown refund');
      return;
    }
    const next: RefundStatus = verified.status === 'PENDING' ? 'PROCESSING' : verified.status;
    await this.setStatus(tx, refund.id, next, verified.providerRefundId);
  }

  /** GET /admin/refunds — newest first, keyset cursor (API_SPEC §102). */
  async adminList(query: AdminRefundListQuery) {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (query.cursor && !cursor) throw validationError({ cursor: 'Invalid cursor' });
    const rows = await this.prisma.refund.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.orderId ? { orderId: query.orderId } : {}),
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
      rows: page.map(toRefund),
      nextCursor: rows.length > query.limit && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async view(refundId: string): Promise<RefundView> {
    const refund = await this.prisma.refund.findUnique({ where: { id: refundId } });
    if (!refund) throw notFound('RESOURCE_NOT_FOUND', 'Refund not found.');
    return toRefund(refund);
  }

  /**
   * Moves a refund forward (never backwards out of a final state) and, on success, derives the
   * payment's REFUNDED / PARTIALLY_REFUNDED status and the order's refunded total.
   */
  private async setStatus(
    tx: Tx,
    refundId: string,
    status: RefundStatus,
    providerRefundId: string | null,
  ): Promise<void> {
    const [locked] = await tx.$queryRaw<{ status: RefundStatus }[]>`
      SELECT status FROM refunds WHERE id = ${refundId}::uuid FOR UPDATE`;
    if (!locked || locked.status === status) return;
    if (
      locked.status === 'SUCCEEDED' ||
      locked.status === 'FAILED' ||
      locked.status === 'CANCELLED'
    )
      return;

    const refund = await tx.refund.update({
      where: { id: refundId },
      data: {
        status,
        ...(providerRefundId ? { providerRefundId } : {}),
        ...(status === 'SUCCEEDED' || status === 'FAILED' ? { completedAt: new Date() } : {}),
      },
    });
    await this.audit.record(
      {
        action: AUDIT_ACTIONS.REFUND_STATUS_CHANGED,
        entityType: 'REFUND',
        entityId: refundId,
        oldValues: { status: locked.status },
        newValues: { status },
      },
      tx,
    );
    if (status !== 'SUCCEEDED') return;

    const payment = await tx.payment.findUniqueOrThrow({ where: { id: refund.paymentId } });
    const refunded = sumMoney(
      (await tx.refund.findMany({ where: { paymentId: payment.id, status: 'SUCCEEDED' } })).map(
        (row) => money(row.amount),
      ),
    );
    const paymentStatus = refunded.greaterThanOrEqualTo(payment.amount)
      ? 'REFUNDED'
      : 'PARTIALLY_REFUNDED';
    await tx.payment.update({ where: { id: payment.id }, data: { status: paymentStatus } });
    await tx.order.update({ where: { id: refund.orderId }, data: { paymentStatus } });
    await tx.orderCancellation.updateMany({
      where: { orderId: refund.orderId },
      data: { refundAmount: refunded },
    });
    await this.outbox.enqueue(tx, {
      eventType: 'refund.succeeded',
      aggregateType: 'refund',
      aggregateId: refundId,
      payload: {
        refundId,
        paymentId: payment.id,
        orderId: refund.orderId,
        customerId: payment.customerId,
        amount: formatMoney(money(refund.amount)),
        paymentStatus,
      },
    });
  }

  private async lockRefundable(tx: Tx, paymentId: string) {
    await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE`;
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw notFound('PAYMENT_NOT_FOUND');
    if (payment.method !== 'ONLINE_PAYMENT' || !payment.providerPaymentId) {
      throw conflict('REFUND_NOT_ALLOWED', 'Only captured online payments can be refunded.');
    }
    if (payment.status !== 'SUCCEEDED' && payment.status !== 'PARTIALLY_REFUNDED') {
      throw conflict('REFUND_NOT_ALLOWED', 'The payment has not been captured.');
    }
    return payment;
  }

  private async committed(tx: Tx, paymentId: string): Promise<Money> {
    const rows = await tx.refund.findMany({
      where: { paymentId, status: { in: OPEN_OR_DONE } },
      select: { amount: true },
    });
    return sumMoney(rows.map((row) => money(row.amount)));
  }
}

export function toRefund(refund: Refund): RefundView {
  return {
    id: refund.id,
    paymentId: refund.paymentId,
    orderId: refund.orderId,
    amount: formatMoney(money(refund.amount)),
    reason: refund.reason,
    status: refund.status,
    createdAt: refund.createdAt.toISOString(),
    completedAt: refund.completedAt?.toISOString() ?? null,
  };
}
