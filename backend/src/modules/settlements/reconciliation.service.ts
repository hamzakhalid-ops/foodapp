import { Injectable, Logger } from '@nestjs/common';
import { type ReconciliationReport } from '@quickbite/validation';
import { PrismaService } from '../../infrastructure/database/prisma.service';

/** Earnings are created asynchronously; give the outbox this long before reporting them missing. */
const GRACE = "interval '10 minutes'";

/**
 * Cross-layer financial checks (FINANCIAL_SPEC §50–52, IMPLEMENTATION_PLAN §19):
 * Order → Payment → Earnings → Settlement → Payout. Each query returns the offending rows only.
 */
const CHECKS: { check: string; entityType: string; sql: string }[] = [
  {
    check: 'DELIVERED_ORDER_WITHOUT_RESTAURANT_EARNING',
    entityType: 'order',
    sql: `SELECT o.id, o.order_number AS detail FROM orders o
          LEFT JOIN restaurant_earnings e ON e.order_id = o.id
          WHERE o.status = 'DELIVERED' AND e.id IS NULL AND o.delivered_at < now() - ${GRACE}`,
  },
  {
    check: 'DELIVERED_DELIVERY_WITHOUT_RIDER_EARNING',
    entityType: 'delivery',
    sql: `SELECT d.id, d.order_id::text AS detail FROM deliveries d
          LEFT JOIN rider_earnings e ON e.delivery_id = d.id
          WHERE d.status = 'DELIVERED' AND e.id IS NULL AND d.delivered_at < now() - ${GRACE}`,
  },
  {
    check: 'PAYMENT_AMOUNT_MISMATCH',
    entityType: 'payment',
    sql: `SELECT p.id, p.amount::text || ' <> ' || o.total_amount::text AS detail FROM payments p
          JOIN orders o ON o.id = p.order_id
          WHERE p.status IN ('SUCCEEDED', 'REFUNDED', 'PARTIALLY_REFUNDED')
            AND p.amount <> o.total_amount`,
  },
  {
    check: 'REFUNDS_EXCEED_PAYMENT',
    entityType: 'payment',
    sql: `SELECT p.id, sum(r.amount)::text || ' > ' || p.amount::text AS detail FROM payments p
          JOIN refunds r ON r.payment_id = p.id AND r.status = 'SUCCEEDED'
          GROUP BY p.id, p.amount HAVING sum(r.amount) > p.amount`,
  },
  {
    check: 'SETTLEMENT_ITEMS_MISMATCH',
    entityType: 'settlement',
    sql: `SELECT s.id, coalesce(sum(i.amount), 0)::text || ' <> ' || s.net_amount::text AS detail
          FROM settlements s LEFT JOIN settlement_items i ON i.settlement_id = s.id
          GROUP BY s.id, s.net_amount HAVING coalesce(sum(i.amount), 0) <> s.net_amount`,
  },
  {
    check: 'PAYOUT_AMOUNT_MISMATCH',
    entityType: 'payout',
    sql: `SELECT p.id, p.amount::text || ' <> ' || s.net_amount::text AS detail FROM payouts p
          JOIN settlements s ON s.id = p.settlement_id WHERE p.amount <> s.net_amount`,
  },
  {
    check: 'COMPLETED_PAYOUT_SETTLEMENT_OPEN',
    entityType: 'payout',
    sql: `SELECT p.id, s.status::text AS detail FROM payouts p
          JOIN settlements s ON s.id = p.settlement_id
          WHERE p.status = 'COMPLETED' AND s.status <> 'COMPLETED'
            AND p.completed_at < now() - ${GRACE}`,
  },
  {
    check: 'COMPLETED_SETTLEMENT_WITHOUT_PAYOUT',
    entityType: 'settlement',
    sql: `SELECT s.id, s.net_amount::text AS detail FROM settlements s
          WHERE s.status = 'COMPLETED' AND NOT EXISTS (
            SELECT 1 FROM payouts p WHERE p.settlement_id = s.id AND p.status = 'COMPLETED')`,
  },
];

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async run(): Promise<ReconciliationReport> {
    const issues: ReconciliationReport['issues'] = [];
    for (const { check, entityType, sql } of CHECKS) {
      // Static SQL only: no request data is ever interpolated.
      const rows = await this.prisma.$queryRawUnsafe<{ id: string; detail: string }[]>(
        `${sql} LIMIT 500`,
      );
      for (const row of rows)
        issues.push({ check, entityType, entityId: row.id, detail: row.detail });
    }
    return { checkedAt: new Date().toISOString(), issues };
  }

  /** Worker task: mismatches are operational alerts (FINANCIAL_SPEC §33, §70). */
  async alert(): Promise<void> {
    const { issues } = await this.run();
    if (issues.length === 0) return;
    const byCheck: Record<string, number> = {};
    for (const issue of issues) byCheck[issue.check] = (byCheck[issue.check] ?? 0) + 1;
    this.logger.error(
      { reconciliationMismatches: issues.length, byCheck },
      'Financial reconciliation mismatches',
    );
  }
}
