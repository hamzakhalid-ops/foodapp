import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Payout as PayoutView, type PayoutListQuery } from '@quickbite/validation';
import { createdBefore, keysetPage } from '../../common/http/pagination';
import { formatMoney } from '../../common/money/money';
import { OutboxService } from '../../common/outbox/outbox.service';
import {
  type Payout,
  type Prisma,
  type Settlement,
  type SettlementRecipientType,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import {
  PAYOUT_PROVIDER,
  type PayoutProvider,
  type ProviderPayout,
} from './provider/payout-provider';

type Tx = Prisma.TransactionClient;

/** How long a PENDING payout may wait for its first provider call before the worker resubmits it. */
const RESUBMIT_AFTER_MS = 60_000;

/**
 * Payout state (FINANCIAL_SPEC §34–39). Provider calls happen outside transactions; every
 * provider answer is verified (reference, amount, currency) before it changes a payout, and a
 * timeout never marks a payout failed: the worker asks the provider again (§71).
 */
@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    @Inject(PAYOUT_PROVIDER) private readonly provider: PayoutProvider,
  ) {}

  /** Creates the PENDING payout for a settlement inside the caller's transaction. */
  create(tx: Tx, settlement: Settlement): Promise<Payout> {
    return tx.payout.create({
      data: {
        settlementId: settlement.id,
        recipientType: settlement.recipientType,
        recipientId: settlement.recipientId,
        provider: this.provider.name,
        amount: settlement.netAmount,
        currency: settlement.currency,
      },
    });
  }

  /** Sends a PENDING payout to the provider. Safe to repeat: the provider is idempotent on our id. */
  async submit(payoutId: string): Promise<void> {
    const payout = await this.prisma.payout.findUniqueOrThrow({ where: { id: payoutId } });
    if (payout.status !== 'PENDING') return;
    let result: ProviderPayout;
    try {
      result = await this.provider.createPayout({
        reference: payout.id,
        recipientType: payout.recipientType,
        recipientId: payout.recipientId,
        amount: formatMoney(payout.amount),
        currency: payout.currency,
      });
    } catch (error) {
      this.logger.warn(
        { payoutId, err: error instanceof Error ? error.message : String(error) },
        'Payout provider call failed; the payout stays PENDING and will be resubmitted',
      );
      return;
    }
    await this.apply(payout, result);
  }

  /** Worker task: resubmit stalled PENDING payouts and poll PROCESSING ones (§56). */
  async sync(): Promise<void> {
    const pending = await this.prisma.payout.findMany({
      where: { status: 'PENDING', createdAt: { lt: new Date(Date.now() - RESUBMIT_AFTER_MS) } },
      take: 50,
    });
    for (const payout of pending) await this.submit(payout.id);
    const processing = await this.prisma.payout.findMany({
      where: { status: 'PROCESSING', providerReference: { not: null } },
      take: 50,
    });
    for (const payout of processing) await this.refresh(payout);
  }

  /** Re-reads a payout from the provider (sandbox outcome, polling). */
  async refreshByReference(providerReference: string): Promise<void> {
    const payout = await this.prisma.payout.findUnique({ where: { providerReference } });
    if (payout) await this.refresh(payout);
  }

  private async refresh(payout: Payout): Promise<void> {
    if (!payout.providerReference) return;
    try {
      await this.apply(payout, await this.provider.getPayout(payout.providerReference));
    } catch (error) {
      this.logger.warn(
        { payoutId: payout.id, err: error instanceof Error ? error.message : String(error) },
        'Payout provider lookup failed',
      );
    }
  }

  private async apply(payout: Payout, result: ProviderPayout): Promise<void> {
    if (
      result.reference !== payout.id ||
      result.amount !== formatMoney(payout.amount) ||
      result.currency !== payout.currency ||
      (payout.providerReference !== null && payout.providerReference !== result.providerReference)
    ) {
      // Reconciliation alert (FINANCIAL_SPEC §51): never trust a mismatching provider answer.
      this.logger.error(
        { payoutId: payout.id, providerReference: result.providerReference },
        'Payout provider answer does not match the payout record',
      );
      return;
    }
    const now = new Date();
    const terminal = result.status !== 'PROCESSING';
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.payout.updateMany({
        where: {
          id: payout.id,
          status: terminal ? { in: ['PENDING', 'PROCESSING'] } : 'PENDING',
        },
        data: {
          providerReference: result.providerReference,
          status: result.status,
          initiatedAt: payout.initiatedAt ?? now,
          ...(result.status === 'COMPLETED' ? { completedAt: now } : {}),
          failureReason: result.failureReason,
        },
      });
      if (changed.count === 0 || !terminal) return;
      await this.outbox.enqueue(tx, {
        eventType: 'payout.status_changed',
        aggregateType: 'payout',
        aggregateId: payout.id,
        payload: {
          payoutId: payout.id,
          settlementId: payout.settlementId,
          status: result.status,
          recipientType: payout.recipientType,
          recipientId: payout.recipientId,
          amount: formatMoney(payout.amount),
          currency: payout.currency,
        },
      });
    });
  }

  async listForRecipient(
    recipientType: SettlementRecipientType,
    recipientId: string,
    query: PayoutListQuery,
  ) {
    const rows = await this.prisma.payout.findMany({
      where: {
        recipientType,
        recipientId,
        ...(query.status ? { status: query.status } : {}),
        ...createdBefore(query.cursor),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    return keysetPage(rows, query.limit, toPayout);
  }
}

export function toPayout(row: Payout): PayoutView {
  return {
    id: row.id,
    settlementId: row.settlementId,
    recipientType: row.recipientType,
    recipientId: row.recipientId,
    provider: row.provider,
    providerReference: row.providerReference,
    amount: formatMoney(row.amount),
    currency: row.currency,
    status: row.status,
    failureReason: row.failureReason,
    initiatedAt: row.initiatedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
