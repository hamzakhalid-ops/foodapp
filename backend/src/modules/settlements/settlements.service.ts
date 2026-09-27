import { Injectable, Logger } from '@nestjs/common';
import {
  type AdjustmentListQuery,
  type AdminSettlementListQuery,
  type CreateFinancialAdjustmentRequest,
  type FinancialAdjustment as AdjustmentView,
  type Invoice as InvoiceView,
  type Settlement as SettlementView,
  type SettlementDetail,
  type SettlementListQuery,
} from '@quickbite/validation';
import { conflict, notFound } from '../../common/http/errors';
import { createdBefore, keysetPage } from '../../common/http/pagination';
import { type RequestMeta } from '../../common/http/request-meta';
import { formatMoney, money, type Money, sumMoney, ZERO } from '../../common/money/money';
import { OutboxService } from '../../common/outbox/outbox.service';
import { SettingsService } from '../../common/settings/settings.service';
import { lastClosedPeriod } from '../../common/time/business-time';
import { AppConfigService } from '../../config/app-config.service';
import {
  type FinancialAdjustment,
  type Invoice,
  Prisma,
  type Settlement,
  type SettlementRecipientType,
  type SettlementSourceType,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PayoutsService, toPayout } from '../payouts/payouts.service';

type Tx = Prisma.TransactionClient;

interface Source {
  type: SettlementSourceType;
  id: string;
  /** Contribution to the settlement net. */
  amount: Money;
  gross: Money;
  fees: Money;
  currency: string;
}

const invalidStatus = (status: string) =>
  conflict(
    'SETTLEMENT_INVALID_STATUS',
    `The settlement cannot do this while it is ${status.toLowerCase()}.`,
  );

/**
 * Settlements, invoices and manual adjustments (FINANCIAL_SPEC §17–18, §25–33, §44–46).
 *
 * Lifecycle: generated PENDING → approved (reconciled sign-off) → PROCESSING with a payout →
 * COMPLETED (payout confirmed, sources SETTLED, invoice issued) or FAILED (payout failed; the
 * settlement can be processed again with a new payout attempt, §38).
 */
@Injectable()
export class SettlementsService {
  private readonly logger = new Logger(SettlementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly payouts: PayoutsService,
  ) {}

  // ------------------------------------------------------------------ generation (§31–32)

  /**
   * Groups every AVAILABLE earning and adjustment created before the end of the last closed
   * period into one settlement per recipient. Idempotent: the (recipient, period) key and the
   * one-settlement-per-source key make reruns and concurrent workers harmless.
   */
  async generate(now = new Date()): Promise<number> {
    const frequency = await this.settings.get('finance.settlement_frequency');
    if (!frequency) {
      this.logger.warn('finance.settlement_frequency is not configured; no settlements generated');
      return 0;
    }
    const period = lastClosedPeriod(now, frequency, this.config.get('APP_TIMEZONE'));
    const before = { status: 'AVAILABLE' as const, createdAt: { lt: period.end } };
    const [restaurants, riders, adjustments] = await Promise.all([
      this.prisma.restaurantEarning.findMany({
        where: before,
        distinct: ['restaurantId'],
        select: { restaurantId: true },
      }),
      this.prisma.riderEarning.findMany({
        where: before,
        distinct: ['riderId'],
        select: { riderId: true },
      }),
      this.prisma.financialAdjustment.findMany({
        where: before,
        distinct: ['recipientType', 'recipientId'],
        select: { recipientType: true, recipientId: true },
      }),
    ]);
    const recipients = new Map<string, [SettlementRecipientType, string]>();
    for (const row of restaurants)
      recipients.set(`R:${row.restaurantId}`, ['RESTAURANT', row.restaurantId]);
    for (const row of riders) recipients.set(`D:${row.riderId}`, ['RIDER', row.riderId]);
    for (const row of adjustments) {
      recipients.set(`${row.recipientType === 'RESTAURANT' ? 'R' : 'D'}:${row.recipientId}`, [
        row.recipientType,
        row.recipientId,
      ]);
    }
    let created = 0;
    for (const [type, id] of recipients.values()) {
      try {
        if (await this.generateFor(type, id, period)) created += 1;
      } catch (error) {
        if (isUniqueViolation(error) || error instanceof ConcurrentSettlement) continue;
        throw error;
      }
    }
    return created;
  }

  private async generateFor(
    recipientType: SettlementRecipientType,
    recipientId: string,
    period: { start: Date; end: Date },
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const sources = await this.availableSources(tx, recipientType, recipientId, period.end);
      const currency = this.config.get('APP_CURRENCY');
      if (sources.some((source) => source.currency !== currency)) {
        this.logger.error({ recipientType, recipientId }, 'Settlement sources mix currencies');
        return false;
      }
      const gross = sumMoney(sources.map((s) => s.gross));
      const fees = sumMoney(sources.map((s) => s.fees));
      const adjustments = sumMoney(
        sources.filter((s) => s.type === 'ADJUSTMENT').map((s) => s.amount),
      );
      const net = gross.sub(fees).add(adjustments);
      // ponytail: a zero or negative net is not settled; its records stay AVAILABLE and roll into
      // the next period. Add carried-forward debt records if negative balances must be invoiced.
      if (!net.isPositive()) return false;

      const settlement = await tx.settlement.create({
        data: {
          recipientType,
          recipientId,
          periodStart: period.start,
          periodEnd: period.end,
          grossAmount: gross,
          fees,
          adjustments,
          netAmount: net,
          currency,
        },
      });
      await tx.settlementItem.createMany({
        data: sources.map((source) => ({
          settlementId: settlement.id,
          sourceType: source.type,
          sourceId: source.id,
          amount: source.amount,
        })),
      });
      await this.claimSources(tx, sources, settlement.id);
      await this.audit.record(
        {
          action: 'SETTLEMENT_CREATED',
          entityType: 'settlement',
          entityId: settlement.id,
          newValues: { recipientType, recipientId, netAmount: formatMoney(net) },
        },
        tx,
      );
      await this.outbox.enqueue(tx, {
        eventType: 'settlement.created',
        aggregateType: 'settlement',
        aggregateId: settlement.id,
        payload: {
          settlementId: settlement.id,
          recipientType,
          recipientId,
          netAmount: formatMoney(net),
          currency,
        },
      });
      return true;
    });
  }

  private async availableSources(
    tx: Tx,
    recipientType: SettlementRecipientType,
    recipientId: string,
    before: Date,
  ): Promise<Source[]> {
    const where = { status: 'AVAILABLE' as const, createdAt: { lt: before } };
    const adjustments = (
      await tx.financialAdjustment.findMany({ where: { ...where, recipientType, recipientId } })
    ).map<Source>((row) => ({
      type: 'ADJUSTMENT',
      id: row.id,
      amount: row.amount,
      gross: ZERO,
      fees: ZERO,
      currency: row.currency,
    }));
    if (recipientType === 'RESTAURANT') {
      const earnings = await tx.restaurantEarning.findMany({
        where: { ...where, restaurantId: recipientId },
      });
      return [
        ...earnings.map<Source>((row) => ({
          type: 'RESTAURANT_EARNING',
          id: row.id,
          amount: row.netAmount,
          gross: row.grossAmount,
          fees: row.commissionAmount.add(row.feeAmount).add(row.refundAmount),
          currency: row.currency,
        })),
        ...adjustments,
      ];
    }
    const earnings = await tx.riderEarning.findMany({ where: { ...where, riderId: recipientId } });
    return [
      ...earnings.map<Source>((row) => ({
        type: 'RIDER_EARNING',
        id: row.id,
        amount: row.totalAmount,
        gross: row.totalAmount,
        fees: ZERO,
        currency: row.currency,
      })),
      ...adjustments,
    ];
  }

  /** Compare-and-set AVAILABLE → IN_SETTLEMENT; a concurrent claim rolls the settlement back. */
  private async claimSources(tx: Tx, sources: Source[], settlementId: string): Promise<void> {
    const ids = (type: SettlementSourceType) =>
      sources.filter((s) => s.type === type).map((s) => s.id);
    const data = { status: 'IN_SETTLEMENT' as const, settlementId };
    const counts = await Promise.all([
      tx.restaurantEarning.updateMany({
        where: { id: { in: ids('RESTAURANT_EARNING') }, status: 'AVAILABLE' },
        data,
      }),
      tx.riderEarning.updateMany({
        where: { id: { in: ids('RIDER_EARNING') }, status: 'AVAILABLE' },
        data,
      }),
      tx.financialAdjustment.updateMany({
        where: { id: { in: ids('ADJUSTMENT') }, status: 'AVAILABLE' },
        data,
      }),
    ]);
    if (counts.reduce((acc, c) => acc + c.count, 0) !== sources.length) {
      throw new ConcurrentSettlement();
    }
  }

  // ------------------------------------------------------------------ admin workflow (API_SPEC §103)

  async approve(
    settlementId: string,
    adminId: string,
    meta: RequestMeta,
  ): Promise<SettlementDetail> {
    await this.prisma.$transaction(async (tx) => {
      const settlement = await this.lock(tx, settlementId);
      if (settlement.status !== 'PENDING' || settlement.approvedAt) {
        throw invalidStatus(settlement.approvedAt ? 'approved' : settlement.status);
      }
      await this.assertReconciled(tx, settlement);
      await tx.settlement.update({
        where: { id: settlementId },
        data: { approvedBy: adminId, approvedAt: new Date() },
      });
      await this.audit.record(
        {
          action: 'SETTLEMENT_APPROVED',
          actorUserId: adminId,
          entityType: 'settlement',
          entityId: settlementId,
          newValues: { netAmount: formatMoney(settlement.netAmount) },
          meta,
        },
        tx,
      );
    });
    return this.detail(settlementId);
  }

  /**
   * Starts (or, after a failed payout, retries) the payout of an approved settlement. The payout
   * row is committed before the provider call; the provider call itself is idempotent on the
   * payout id, and at most one live payout can exist per settlement.
   */
  async process(
    settlementId: string,
    adminId: string,
    meta: RequestMeta,
  ): Promise<SettlementDetail> {
    const payout = await this.prisma.$transaction(async (tx) => {
      const settlement = await this.lock(tx, settlementId);
      if (!settlement.approvedAt) throw invalidStatus('awaiting approval');
      if (settlement.status !== 'PENDING' && settlement.status !== 'FAILED') {
        throw invalidStatus(settlement.status);
      }
      await this.assertReconciled(tx, settlement);
      await tx.settlement.update({
        where: { id: settlementId },
        data: { status: 'PROCESSING', processedAt: new Date() },
      });
      const created = await this.payouts.create(tx, settlement);
      await this.audit.record(
        {
          action: 'SETTLEMENT_PROCESSING',
          actorUserId: adminId,
          entityType: 'settlement',
          entityId: settlementId,
          oldValues: { status: settlement.status },
          newValues: { status: 'PROCESSING', payoutId: created.id },
          meta,
        },
        tx,
      );
      return created;
    });
    await this.payouts.submit(payout.id);
    return this.detail(settlementId);
  }

  /** Outbox handler for `payout.status_changed` (§36, §38). */
  async onPayoutFinished(payload: { settlementId: string; payoutId: string; status: string }) {
    await this.prisma.$transaction(async (tx) => {
      const settlement = await this.lock(tx, payload.settlementId);
      if (settlement.status !== 'PROCESSING') return;
      const payout = await tx.payout.findUniqueOrThrow({ where: { id: payload.payoutId } });
      if (payout.status === 'FAILED') {
        await tx.settlement.update({ where: { id: settlement.id }, data: { status: 'FAILED' } });
        await this.audit.record(
          {
            action: 'SETTLEMENT_FAILED',
            entityType: 'settlement',
            entityId: settlement.id,
            newValues: { payoutId: payout.id, failureReason: payout.failureReason ?? null },
          },
          tx,
        );
        return;
      }
      if (payout.status !== 'COMPLETED') return;
      const now = new Date();
      await tx.settlement.update({
        where: { id: settlement.id },
        data: { status: 'COMPLETED', completedAt: now },
      });
      const where = { settlementId: settlement.id, status: 'IN_SETTLEMENT' as const };
      const data = { status: 'SETTLED' as const };
      await tx.restaurantEarning.updateMany({ where, data });
      await tx.riderEarning.updateMany({ where, data });
      await tx.financialAdjustment.updateMany({ where, data });
      // ponytail: invoice PDF rendering is not implemented (`file_url` stays null); the record and
      // backend-generated number are the financial document of record until a renderer exists.
      await tx.invoice.create({
        data: {
          recipientType: settlement.recipientType,
          recipientId: settlement.recipientId,
          settlementId: settlement.id,
          amount: settlement.netAmount,
          currency: settlement.currency,
        },
      });
      await this.audit.record(
        {
          action: 'SETTLEMENT_COMPLETED',
          entityType: 'settlement',
          entityId: settlement.id,
          newValues: { payoutId: payout.id, netAmount: formatMoney(settlement.netAmount) },
        },
        tx,
      );
    });
  }

  private async lock(tx: Tx, settlementId: string): Promise<Settlement> {
    await tx.$queryRaw`SELECT id FROM settlements WHERE id = ${settlementId}::uuid FOR UPDATE`;
    const settlement = await tx.settlement.findUnique({ where: { id: settlementId } });
    if (!settlement) throw notFound('SETTLEMENT_NOT_FOUND', 'Settlement not found.');
    return settlement;
  }

  /** §33: items must add up to the stored net before any money moves. */
  private async assertReconciled(tx: Tx, settlement: Settlement): Promise<void> {
    const items = await tx.settlementItem.aggregate({
      where: { settlementId: settlement.id },
      _sum: { amount: true },
    });
    const total = items._sum.amount ?? ZERO;
    const componentNet = settlement.grossAmount.sub(settlement.fees).add(settlement.adjustments);
    if (!total.equals(settlement.netAmount) || !componentNet.equals(settlement.netAmount)) {
      this.logger.error(
        { settlementId: settlement.id, items: formatMoney(total) },
        'Settlement reconciliation mismatch',
      );
      throw conflict(
        'SETTLEMENT_RECONCILIATION_FAILED',
        'Settlement items do not match the settlement amount.',
      );
    }
  }

  // ------------------------------------------------------------------ reads

  async list(query: AdminSettlementListQuery) {
    const rows = await this.prisma.settlement.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.recipientType ? { recipientType: query.recipientType } : {}),
        ...(query.recipientId ? { recipientId: query.recipientId } : {}),
        ...createdBefore(query.cursor),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    return keysetPage(rows, query.limit, toSettlement);
  }

  listForRecipient(
    recipientType: SettlementRecipientType,
    recipientId: string,
    query: SettlementListQuery,
  ) {
    return this.list({ ...query, recipientType, recipientId });
  }

  /** Recipient-scoped detail: another recipient's settlement is reported as not found. */
  async detail(
    settlementId: string,
    recipient?: { type: SettlementRecipientType; id: string },
  ): Promise<SettlementDetail> {
    const row = await this.prisma.settlement.findFirst({
      where: {
        id: settlementId,
        ...(recipient ? { recipientType: recipient.type, recipientId: recipient.id } : {}),
      },
      include: {
        items: { orderBy: { createdAt: 'asc' } },
        payouts: { orderBy: { createdAt: 'asc' } },
        invoice: true,
      },
    });
    if (!row) throw notFound('SETTLEMENT_NOT_FOUND', 'Settlement not found.');
    return {
      ...toSettlement(row),
      items: row.items.map((item) => ({
        id: item.id,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        amount: formatMoney(item.amount),
      })),
      payouts: row.payouts.map(toPayout),
      invoice: row.invoice ? toInvoice(row.invoice) : null,
    };
  }

  async invoices(
    recipientType: SettlementRecipientType,
    recipientId: string,
    limit: number,
    cursor?: string,
  ) {
    const rows = await this.prisma.invoice.findMany({
      where: { recipientType, recipientId, ...createdBefore(cursor) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return keysetPage(rows, limit, toInvoice);
  }

  // ------------------------------------------------------------------ adjustments (§17–18)

  async createAdjustment(
    input: CreateFinancialAdjustmentRequest,
    adminId: string,
    meta: RequestMeta,
  ): Promise<AdjustmentView> {
    const recipient =
      input.recipientType === 'RESTAURANT'
        ? await this.prisma.restaurant.findUnique({ where: { id: input.recipientId } })
        : await this.prisma.riderProfile.findUnique({ where: { id: input.recipientId } });
    if (!recipient) {
      throw notFound(
        input.recipientType === 'RESTAURANT' ? 'RESTAURANT_NOT_FOUND' : 'RIDER_NOT_FOUND',
      );
    }
    const adjustment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.financialAdjustment.create({
        data: {
          recipientType: input.recipientType,
          recipientId: input.recipientId,
          amount: money(input.amount),
          currency: this.config.get('APP_CURRENCY'),
          reason: input.reason,
          reference: input.reference ?? null,
          createdBy: adminId,
        },
      });
      await this.audit.record(
        {
          action: 'FINANCIAL_ADJUSTMENT_CREATED',
          actorUserId: adminId,
          entityType: 'financial_adjustment',
          entityId: created.id,
          newValues: {
            recipientType: created.recipientType,
            recipientId: created.recipientId,
            amount: formatMoney(created.amount),
            reason: created.reason,
          },
          meta,
        },
        tx,
      );
      return created;
    });
    return toAdjustment(adjustment);
  }

  async listAdjustments(query: AdjustmentListQuery) {
    const rows = await this.prisma.financialAdjustment.findMany({
      where: {
        ...(query.recipientType ? { recipientType: query.recipientType } : {}),
        ...(query.recipientId ? { recipientId: query.recipientId } : {}),
        ...createdBefore(query.cursor),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    return keysetPage(rows, query.limit, toAdjustment);
  }
}

class ConcurrentSettlement extends Error {}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function toSettlement(row: Settlement): SettlementView {
  return {
    id: row.id,
    recipientType: row.recipientType,
    recipientId: row.recipientId,
    periodStart: row.periodStart.toISOString(),
    periodEnd: row.periodEnd.toISOString(),
    grossAmount: formatMoney(row.grossAmount),
    fees: formatMoney(row.fees),
    adjustments: formatMoney(row.adjustments),
    netAmount: formatMoney(row.netAmount),
    currency: row.currency,
    status: row.status,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    processedAt: row.processedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toInvoice(row: Invoice): InvoiceView {
  return {
    id: row.id,
    settlementId: row.settlementId,
    invoiceNumber: row.invoiceNumber,
    amount: formatMoney(row.amount),
    currency: row.currency,
    status: row.status,
    fileUrl: row.fileUrl,
    issuedAt: row.issuedAt.toISOString(),
  };
}

function toAdjustment(row: FinancialAdjustment): AdjustmentView {
  return {
    id: row.id,
    recipientType: row.recipientType,
    recipientId: row.recipientId,
    amount: formatMoney(row.amount),
    currency: row.currency,
    reason: row.reason,
    reference: row.reference,
    status: row.status,
    settlementId: row.settlementId,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}
