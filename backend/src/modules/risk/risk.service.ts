import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { type ApiErrorCode } from '@quickbite/types';
import { ApiException } from '../../common/http/api.exception';
import { OutboxService } from '../../common/outbox/outbox.service';
import {
  type Prisma,
  type RiskEventType,
  type RiskRestrictionType,
  type RiskSeverity,
  type RiskSubjectType,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';

type Tx = Prisma.TransactionClient;

export interface RiskSignal {
  subjectType: RiskSubjectType;
  subjectId: string;
  eventType: RiskEventType;
  /** Automatically captured signals default to LOW; the rule decides the consequence. */
  severity?: RiskSeverity;
  metadata?: Prisma.InputJsonObject;
}

/** Restrictions that stop a subject from transacting (RISK_RULES §16, §30–32). */
const BLOCKING: RiskRestrictionType[] = ['ORDER_RESTRICTED', 'ACCOUNT_RESTRICTED'];

/**
 * Trust & Risk Engine (RISK_RULES, DATABASE.md §39–43).
 *
 * - `record` stores an immutable event in the caller's transaction and queues its evaluation.
 * - `evaluate` (outbox worker) applies the enabled rules: when the events of that type inside the
 *   rule window reach its threshold it raises one flag and, for restricting actions, one
 *   restriction. Thresholds and windows only come from `risk_rules` (§6).
 * - `assert*` helpers enforce active restrictions synchronously where they matter.
 */
@Injectable()
export class RiskService {
  private readonly logger = new Logger(RiskService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  async record(tx: Tx, signal: RiskSignal): Promise<void> {
    const event = await tx.riskEvent.create({
      data: {
        subjectType: signal.subjectType,
        subjectId: signal.subjectId,
        eventType: signal.eventType,
        severity: signal.severity ?? 'LOW',
        ...(signal.metadata ? { metadata: signal.metadata } : {}),
      },
    });
    await this.outbox.enqueue(tx, {
      eventType: 'risk.event_recorded',
      aggregateType: 'risk_subject',
      aggregateId: signal.subjectId,
      payload: { riskEventId: event.id },
    });
  }

  /** Idempotent: re-running for the same event never duplicates flags or restrictions. */
  async evaluate(riskEventId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const event = await tx.riskEvent.findUnique({ where: { id: riskEventId } });
      if (!event) return;
      // Serialise evaluations of one subject across workers (§42).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`risk:${event.subjectType}:${event.subjectId}`}))`;
      const rules = await tx.riskRule.findMany({
        where: { subjectType: event.subjectType, eventType: event.eventType, isEnabled: true },
      });
      for (const rule of rules) {
        if (rule.action === 'NORMAL') continue;
        const since = new Date(event.occurredAt.getTime() - rule.windowSeconds * 1000);
        const count = await tx.riskEvent.count({
          where: {
            subjectType: event.subjectType,
            subjectId: event.subjectId,
            eventType: event.eventType,
            occurredAt: { gt: since, lte: event.occurredAt },
          },
        });
        if (count < rule.threshold) continue;
        const existing = await tx.riskFlag.findFirst({
          where: {
            subjectType: event.subjectType,
            subjectId: event.subjectId,
            riskRuleId: rule.id,
            status: 'ACTIVE',
          },
        });
        if (existing) continue;
        const reason = `${rule.name}: ${count} × ${rule.eventType} within ${rule.windowSeconds}s (threshold ${rule.threshold})`;
        const flag = await tx.riskFlag.create({
          data: {
            subjectType: event.subjectType,
            subjectId: event.subjectId,
            riskRuleId: rule.id,
            severity: rule.severity,
            reason,
          },
        });
        if (rule.action === 'MONITORED') continue;
        const type = rule.action;
        const active = await tx.riskRestriction.count({
          where: {
            subjectType: event.subjectType,
            subjectId: event.subjectId,
            restrictionType: type,
            status: 'ACTIVE',
          },
        });
        if (active > 0) continue;
        const restriction = await tx.riskRestriction.create({
          data: {
            subjectType: event.subjectType,
            subjectId: event.subjectId,
            restrictionType: type,
            reason,
            riskFlagId: flag.id,
          },
        });
        await this.audit.record(
          {
            action: AUDIT_ACTIONS.RISK_RESTRICTION_CREATED,
            entityType: 'RISK_RESTRICTION',
            entityId: restriction.id,
            newValues: {
              subjectType: event.subjectType,
              subjectId: event.subjectId,
              restrictionType: type,
              ruleId: rule.id,
            },
          },
          tx,
        );
        await this.outbox.enqueue(tx, {
          eventType: 'risk.restriction_created',
          aggregateType: 'risk_subject',
          aggregateId: event.subjectId,
          payload: {
            restrictionId: restriction.id,
            subjectType: event.subjectType,
            subjectId: event.subjectId,
            restrictionType: type,
          },
        });
        this.logger.log(
          { subjectType: event.subjectType, restrictionType: type, ruleId: rule.id },
          'Risk restriction created',
        );
      }
    });
  }

  /** Active restriction types of a subject, honouring expiry (§15). */
  async activeRestrictions(
    subjectType: RiskSubjectType,
    subjectId: string,
    tx: Tx = this.prisma,
  ): Promise<Set<RiskRestrictionType>> {
    const rows = await tx.riskRestriction.findMany({
      where: {
        subjectType,
        subjectId,
        status: 'ACTIVE',
        startsAt: { lte: new Date() },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { restrictionType: true },
    });
    return new Set(rows.map((row) => row.restrictionType));
  }

  /**
   * Checkout enforcement for customers (RISK_RULES §16, §18–19, ORDER_RULES §21, §30).
   * `ADDITIONAL_VERIFICATION` blocks ordering until an administrator removes it — no customer
   * verification flow is specified for V1.
   */
  async assertCustomerMayOrder(
    customerId: string,
    paymentMethod: 'ONLINE_PAYMENT' | 'CASH_ON_DELIVERY',
    tx: Tx = this.prisma,
  ): Promise<void> {
    const active = await this.activeRestrictions('CUSTOMER', customerId, tx);
    if (active.has('ACCOUNT_RESTRICTED'))
      throw restricted('ACCOUNT_RESTRICTED', 'Your account is restricted.');
    if (active.has('ORDER_RESTRICTED'))
      throw restricted('ORDER_RESTRICTED', 'Ordering is currently restricted on your account.');
    if (active.has('ADDITIONAL_VERIFICATION')) {
      throw restricted(
        'RISK_VERIFICATION_REQUIRED',
        'Additional verification is required. Please contact support.',
      );
    }
    if (paymentMethod === 'CASH_ON_DELIVERY' && active.has('COD_RESTRICTED')) {
      throw restricted('COD_RESTRICTED', 'Cash on delivery is not available for your account.');
    }
  }

  async isCodRestricted(customerId: string): Promise<boolean> {
    return (await this.activeRestrictions('CUSTOMER', customerId)).has('COD_RESTRICTED');
  }

  /** Restaurants and riders with ORDER/ACCOUNT restrictions cannot operate (§30–32). */
  async isBlocked(subjectType: 'RESTAURANT' | 'RIDER', subjectId: string, tx: Tx = this.prisma) {
    const active = await this.activeRestrictions(subjectType, subjectId, tx);
    return BLOCKING.some((type) => active.has(type));
  }

  /** Rider ids among `riderIds` that are blocked from dispatch. */
  async blockedRiders(riderIds: string[], tx: Tx = this.prisma): Promise<Set<string>> {
    if (riderIds.length === 0) return new Set();
    const rows = await tx.riskRestriction.findMany({
      where: {
        subjectType: 'RIDER',
        subjectId: { in: riderIds },
        restrictionType: { in: BLOCKING },
        status: 'ACTIVE',
        startsAt: { lte: new Date() },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { subjectId: true },
    });
    return new Set(rows.map((row) => row.subjectId));
  }
}

function restricted(code: ApiErrorCode, message: string) {
  return new ApiException(HttpStatus.FORBIDDEN, code, message);
}
