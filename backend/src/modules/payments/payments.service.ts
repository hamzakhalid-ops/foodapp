import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  type AdminPaymentListQuery,
  type CreatePaymentRequest,
  type Payment as PaymentView,
  type PaymentMethodInfo,
} from '@quickbite/validation';
import { type AuthContext } from '../../common/auth/auth.decorators';
import { ApiException } from '../../common/http/api.exception';
import { conflict, notFound, unprocessable, validationError } from '../../common/http/errors';
import { decodeCursor, encodeCursor } from '../../common/http/pagination';
import { formatMoney, money, sumMoney } from '../../common/money/money';
import { OutboxService } from '../../common/outbox/outbox.service';
import {
  type Order,
  type Payment,
  type PaymentStatus,
  type Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
  type ProviderPayment,
  type VerifiedWebhookEvent,
} from './provider/payment-provider';
import { RefundsService } from './refunds.service';
import { RiskService } from '../risk/risk.service';

type Tx = Prisma.TransactionClient;

const ADMIN_ROLES = new Set(['ADMIN', 'SUPER_ADMIN']);

/**
 * Verified provider status changes that may be recorded. A locally CANCELLED or FAILED payment can
 * still turn out captured at the provider; that reality is recorded and handed to an administrator
 * (PAYMENT_RULES §22, §35) instead of being ignored.
 */
const PAYMENT_TRANSITIONS: Partial<Record<PaymentStatus, readonly PaymentStatus[]>> = {
  PENDING: ['AUTHORIZED', 'SUCCEEDED', 'FAILED'],
  AUTHORIZED: ['SUCCEEDED', 'FAILED'],
  FAILED: ['AUTHORIZED', 'SUCCEEDED'],
  CANCELLED: ['AUTHORIZED', 'SUCCEEDED'],
};

/**
 * Payments (PAYMENT_RULES, API_SPEC §77–81). Payment state changes only from provider data the
 * backend verified itself (signed webhook or a provider lookup), never from the client.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly refunds: RefundsService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly risk: RiskService,
  ) {}

  /**
   * The order's payment record, created in the order-creation transaction (PAYMENT_RULES §9).
   * COD stays PENDING until collection on delivery (ADR-0014 §10); online payments stay PENDING
   * until the provider confirms them.
   */
  createForOrder(tx: Tx, order: Order, idempotencyKey: string | null): Promise<Payment> {
    return tx.payment.create({
      data: {
        orderId: order.id,
        customerId: order.customerId,
        method: order.paymentMethod,
        status: 'PENDING',
        amount: order.totalAmount,
        currency: order.currency,
        idempotencyKey,
      },
    });
  }

  /** API_SPEC §77. Cash on delivery is unavailable while the customer is COD-restricted. */
  async paymentMethods(customerId: string): Promise<PaymentMethodInfo[]> {
    return [
      { method: 'ONLINE_PAYMENT', available: true },
      { method: 'CASH_ON_DELIVERY', available: !(await this.risk.isCodRestricted(customerId)) },
    ];
  }

  /**
   * API_SPEC §78: starts (or resumes) the online payment for the customer's order. The amount comes
   * from the order; the provider is called outside any transaction. After a failed attempt a new
   * payment attempt is created.
   */
  async initiate(
    customerId: string,
    input: CreatePaymentRequest,
    idempotencyKey: string | null,
  ): Promise<PaymentView> {
    const order = await this.prisma.order.findFirst({
      where: { id: input.orderId, customerId },
    });
    if (!order) throw notFound('ORDER_NOT_FOUND');
    if (order.paymentMethod !== input.paymentMethod) {
      throw unprocessable('INVALID_REQUEST', 'The payment method does not match the order.');
    }
    if (order.paymentMethod === 'CASH_ON_DELIVERY') {
      throw unprocessable('INVALID_REQUEST', 'Cash on delivery orders are paid to the rider.');
    }
    if (order.status !== 'PENDING') {
      throw conflict('ORDER_INVALID_STATUS', 'This order can no longer be paid.', {
        status: order.status,
      });
    }

    const payment = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id}::uuid FOR UPDATE`;
      const latest = await tx.payment.findFirst({
        where: { orderId: order.id },
        orderBy: { createdAt: 'desc' },
      });
      if (latest && latest.status !== 'FAILED' && latest.status !== 'PENDING') {
        throw conflict('PAYMENT_ALREADY_PROCESSED', 'This order has already been paid.');
      }
      if (latest?.status === 'PENDING') return latest;
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'PENDING' } });
      return this.createForOrder(tx, order, idempotencyKey);
    });

    if (!payment.providerPaymentId) {
      const created = await this.providerCall(() =>
        this.provider.createPayment({
          reference: payment.id,
          amount: formatMoney(money(payment.amount)),
          currency: payment.currency,
        }),
      );
      // Only the first concurrent initiator attaches its provider payment.
      await this.prisma.payment.updateMany({
        where: { id: payment.id, providerPaymentId: null },
        data: { provider: this.provider.name, providerPaymentId: created.providerPaymentId },
      });
    }
    return this.view(payment.id);
  }

  async getForActor(paymentId: string, auth: AuthContext): Promise<PaymentView> {
    await this.findForActor(paymentId, auth);
    return this.view(paymentId);
  }

  /** API_SPEC §80: re-reads the payment from the provider; the client's claim is not used. */
  async confirm(paymentId: string, auth: AuthContext): Promise<PaymentView> {
    const payment = await this.findForActor(paymentId, auth);
    if (payment.method !== 'ONLINE_PAYMENT' || !payment.providerPaymentId) {
      throw unprocessable('INVALID_REQUEST', 'This payment has not been started with a provider.');
    }
    const providerPaymentId = payment.providerPaymentId;
    const verified = await this.providerCall(() => this.provider.getPayment(providerPaymentId));
    await this.prisma.$transaction((tx) => this.applyVerified(tx, verified));
    return this.view(paymentId);
  }

  /**
   * API_SPEC §81, §116–117: verify signature → record provider event id (duplicates are no-ops)
   * → apply in the same transaction.
   */
  async handleWebhook(
    providerName: string,
    rawBody: Buffer | undefined,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<{ duplicate: boolean }> {
    if (providerName !== this.provider.name) throw notFound();
    const event = rawBody ? this.provider.verifyWebhook(rawBody, headers) : null;
    if (!event) {
      throw new ApiException(HttpStatus.BAD_REQUEST, 'INVALID_REQUEST', 'Invalid webhook.');
    }
    return this.prisma.$transaction(async (tx) => {
      const recorded = await tx.paymentWebhookEvent.createMany({
        data: [
          {
            provider: this.provider.name,
            providerEventId: event.eventId,
            eventType: event.type,
            payload: event as unknown as Prisma.InputJsonObject,
          },
        ],
        skipDuplicates: true,
      });
      if (recorded.count === 0) return { duplicate: true };
      await this.applyEvent(tx, event);
      return { duplicate: false };
    });
  }

  private async applyEvent(tx: Tx, event: VerifiedWebhookEvent): Promise<void> {
    if (event.type === 'payment') await this.applyVerified(tx, event.payment);
    else await this.refunds.applyProviderRefund(tx, event.refund);
  }

  /**
   * Records a provider-verified payment state (PAYMENT_RULES §14–17): the provider reference must
   * map to a QuickBite payment and amount/currency must match, otherwise the payment fails.
   */
  async applyVerified(tx: Tx, verified: ProviderPayment): Promise<void> {
    const [locked] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM payments
      WHERE provider = ${this.provider.name} AND provider_payment_id = ${verified.providerPaymentId}
      FOR UPDATE`;
    if (!locked) {
      this.logger.warn({ provider: this.provider.name }, 'Provider event for an unknown payment');
      return;
    }
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: locked.id } });
    const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId } });

    const matches =
      money(verified.amount).equals(payment.amount) && verified.currency === payment.currency;
    const next: PaymentStatus = matches ? verified.status : 'FAILED';
    if (next === payment.status) return;
    if (!PAYMENT_TRANSITIONS[payment.status]?.includes(next)) {
      this.logger.warn(
        { paymentId: payment.id, from: payment.status, to: next },
        'Ignoring provider status that cannot follow the current state',
      );
      return;
    }

    const now = new Date();
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: next,
        ...(next === 'SUCCEEDED' ? { paidAt: now } : {}),
        failureReason:
          next === 'FAILED'
            ? matches
              ? (verified.failureReason ?? 'The payment was not completed.')
              : 'The payment could not be verified.'
            : null,
      },
    });
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus: next } });
    await this.audit.record(
      {
        action: matches
          ? AUDIT_ACTIONS.PAYMENT_STATUS_CHANGED
          : AUDIT_ACTIONS.PAYMENT_VERIFICATION_FAILED,
        entityType: 'PAYMENT',
        entityId: payment.id,
        oldValues: { status: payment.status },
        newValues: {
          status: next,
          ...(matches
            ? {}
            : { providerAmount: verified.amount, providerCurrency: verified.currency }),
        },
      },
      tx,
    );
    if (next === 'FAILED' && matches) {
      await this.risk.record(tx, {
        subjectType: 'CUSTOMER',
        subjectId: order.customerId,
        eventType: 'REPEATED_PAYMENT_FAILURE',
        metadata: { paymentId: payment.id, orderId: order.id },
      });
    }
    const orderCancelled = order.status.startsWith('CANCELLED');
    await this.outbox.enqueue(tx, {
      eventType: 'payment.status_changed',
      aggregateType: 'payment',
      aggregateId: payment.id,
      payload: {
        paymentId: payment.id,
        orderId: order.id,
        customerId: order.customerId,
        restaurantId: order.restaurantId,
        fromStatus: payment.status,
        toStatus: next,
        orderStatus: order.status,
        refundDecisionRequired: orderCancelled && next === 'SUCCEEDED',
      },
    });
  }

  /** GET /admin/payments — newest first, keyset cursor (API_SPEC §102). */
  async adminList(query: AdminPaymentListQuery) {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (query.cursor && !cursor) throw validationError({ cursor: 'Invalid cursor' });
    const rows = await this.prisma.payment.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.method ? { method: query.method } : {}),
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
      select: { id: true, createdAt: true },
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      rows: await Promise.all(page.map((row) => this.view(row.id))),
      nextCursor: rows.length > query.limit && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async view(paymentId: string): Promise<PaymentView> {
    const payment = await this.prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: { refunds: { where: { status: 'SUCCEEDED' } } },
    });
    return {
      id: payment.id,
      orderId: payment.orderId,
      method: payment.method,
      status: payment.status,
      amount: formatMoney(money(payment.amount)),
      currency: payment.currency,
      provider: payment.provider,
      failureReason: payment.failureReason,
      paidAt: payment.paidAt?.toISOString() ?? null,
      createdAt: payment.createdAt.toISOString(),
      nextAction:
        payment.status === 'PENDING' && payment.providerPaymentId
          ? this.provider.nextAction(payment.providerPaymentId)
          : null,
      refundedAmount: formatMoney(sumMoney(payment.refunds.map((refund) => money(refund.amount)))),
    };
  }

  private async findForActor(paymentId: string, auth: AuthContext): Promise<Payment> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    const allowed =
      payment &&
      (payment.customerId === auth.userId || auth.roles.some((role) => ADMIN_ROLES.has(role)));
    if (!allowed) throw notFound('PAYMENT_NOT_FOUND');
    return payment;
  }

  private async providerCall<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      this.logger.error({ err: error }, 'Payment provider call failed');
      throw new ApiException(
        HttpStatus.BAD_GATEWAY,
        'PAYMENT_PROVIDER_ERROR',
        'The payment provider is unavailable. Please try again.',
      );
    }
  }
}
