import { Injectable } from '@nestjs/common';
import {
  type CreateRiskEventRequest,
  type CreateRiskRestrictionRequest,
  type CreateRiskRuleRequest,
  RISK_FLAG_STATUSES,
  RISK_RESTRICTION_STATUSES,
  type RiskEvent as RiskEventView,
  type RiskFlag as RiskFlagView,
  type RiskListQuery,
  type RiskRestriction as RiskRestrictionView,
  type RiskRule as RiskRuleView,
  type UpdateRiskRestrictionRequest,
  type UpdateRiskRuleRequest,
} from '@quickbite/validation';
import { conflict, notFound, validationError } from '../../common/http/errors';
import { decodeCursor, encodeCursor } from '../../common/http/pagination';
import { type RequestMeta } from '../../common/http/request-meta';
import {
  type Prisma,
  type RiskEvent,
  type RiskFlag,
  type RiskRestriction,
  type RiskRule,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { RiskService } from './risk.service';

type Keyed = { id: string; createdAt: Date };

/**
 * Risk administration (API_SPEC §84–87, RISK_RULES §22–27, ADMIN_SPEC §23–24). Events are never
 * edited; flags and restrictions change state through audited actions.
 */
@Injectable()
export class RiskAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly risk: RiskService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- events

  async recordEvent(input: CreateRiskEventRequest, adminId: string, meta: RequestMeta) {
    await this.prisma.$transaction(async (tx) => {
      await this.risk.record(tx, {
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        eventType: input.eventType,
        severity: input.severity,
        metadata: { ...(input.metadata as Prisma.InputJsonObject), recordedBy: adminId },
      });
      await this.audit.record(
        {
          action: AUDIT_ACTIONS.RISK_EVENT_RECORDED,
          actorUserId: adminId,
          entityType: input.subjectType,
          entityId: input.subjectId,
          newValues: { eventType: input.eventType, severity: input.severity },
          meta,
        },
        tx,
      );
    });
  }

  async listEvents(query: RiskListQuery) {
    return this.page(
      query,
      (where, take) =>
        this.prisma.riskEvent.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take,
        }),
      toEvent,
    );
  }

  // ---------------------------------------------------------------- rules

  async listRules(): Promise<RiskRuleView[]> {
    const rules = await this.prisma.riskRule.findMany({ orderBy: { createdAt: 'asc' } });
    return rules.map(toRule);
  }

  async createRule(input: CreateRiskRuleRequest, adminId: string, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const { enabled, ...fields } = input;
      const rule = await tx.riskRule.create({
        data: { ...fields, isEnabled: enabled, createdBy: adminId, updatedBy: adminId },
      });
      await this.audit.record(
        {
          action: AUDIT_ACTIONS.RISK_RULE_CREATED,
          actorUserId: adminId,
          entityType: 'RISK_RULE',
          entityId: rule.id,
          newValues: { ...input },
          meta,
        },
        tx,
      );
      return toRule(rule);
    });
  }

  /** Changes apply to new evaluations only; history is untouched (§26–27). */
  async updateRule(
    ruleId: string,
    input: UpdateRiskRuleRequest,
    adminId: string,
    meta: RequestMeta,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.riskRule.findUnique({ where: { id: ruleId } });
      if (!rule) throw notFound('RESOURCE_NOT_FOUND', 'Risk rule not found.');
      const { enabled, ...fields } = input;
      const updated = await tx.riskRule.update({
        where: { id: ruleId },
        data: {
          ...Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)),
          ...(enabled !== undefined ? { isEnabled: enabled } : {}),
          updatedBy: adminId,
        },
      });
      await this.audit.record(
        {
          action: AUDIT_ACTIONS.RISK_RULE_UPDATED,
          actorUserId: adminId,
          entityType: 'RISK_RULE',
          entityId: ruleId,
          oldValues: toRule(rule),
          newValues: { ...input },
          meta,
        },
        tx,
      );
      return toRule(updated);
    });
  }

  // ---------------------------------------------------------------- flags

  async listFlags(query: RiskListQuery) {
    return this.page(
      query,
      (where, take) =>
        this.prisma.riskFlag.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take,
        }),
      toFlag,
      RISK_FLAG_STATUSES,
    );
  }

  async getFlag(flagId: string): Promise<RiskFlagView & { restrictions: RiskRestrictionView[] }> {
    const flag = await this.prisma.riskFlag.findUnique({
      where: { id: flagId },
      include: { restrictions: true },
    });
    if (!flag) throw notFound('RESOURCE_NOT_FOUND', 'Risk flag not found.');
    return { ...toFlag(flag), restrictions: flag.restrictions.map(toRestriction) };
  }

  /**
   * RESOLVED keeps any restriction (the concern was handled); DISMISSED marks a false positive
   * and removes the restrictions it caused (RISK_RULES §23).
   */
  async closeFlag(
    flagId: string,
    outcome: 'RESOLVED' | 'DISMISSED',
    reason: string,
    adminId: string,
    meta: RequestMeta,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.riskFlag.updateMany({
        where: { id: flagId, status: 'ACTIVE' },
        data: { status: outcome, resolvedAt: new Date(), resolvedBy: adminId },
      });
      if (updated.count === 0) {
        const exists = await tx.riskFlag.count({ where: { id: flagId } });
        if (!exists) throw notFound('RESOURCE_NOT_FOUND', 'Risk flag not found.');
        throw conflict('INVALID_REQUEST', 'The flag is not active.');
      }
      if (outcome === 'DISMISSED') {
        await tx.riskRestriction.updateMany({
          where: { riskFlagId: flagId, status: 'ACTIVE' },
          data: { status: 'REMOVED' },
        });
      }
      await this.audit.record(
        {
          action:
            outcome === 'DISMISSED'
              ? AUDIT_ACTIONS.RISK_FLAG_DISMISSED
              : AUDIT_ACTIONS.RISK_FLAG_RESOLVED,
          actorUserId: adminId,
          entityType: 'RISK_FLAG',
          entityId: flagId,
          newValues: { status: outcome, reason },
          meta,
        },
        tx,
      );
    });
    return this.getFlag(flagId);
  }

  // ---------------------------------------------------------------- restrictions

  async listRestrictions(query: RiskListQuery) {
    return this.page(
      query,
      (where, take) =>
        this.prisma.riskRestriction.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take,
        }),
      toRestriction,
      RISK_RESTRICTION_STATUSES,
    );
  }

  async createRestriction(input: CreateRiskRestrictionRequest, adminId: string, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const active = await tx.riskRestriction.count({
        where: {
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          restrictionType: input.restrictionType,
          status: 'ACTIVE',
        },
      });
      if (active) throw conflict('RISK_RESTRICTION_ACTIVE', 'This restriction is already active.');
      const restriction = await tx.riskRestriction.create({
        data: {
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          restrictionType: input.restrictionType,
          reason: input.reason,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          createdBy: adminId,
        },
      });
      await this.audit.record(
        {
          action: AUDIT_ACTIONS.RISK_RESTRICTION_CREATED,
          actorUserId: adminId,
          entityType: 'RISK_RESTRICTION',
          entityId: restriction.id,
          newValues: { ...input },
          meta,
        },
        tx,
      );
      return toRestriction(restriction);
    });
  }

  /** Admin override of an active restriction's expiry (§25). */
  async updateRestriction(
    restrictionId: string,
    input: UpdateRiskRestrictionRequest,
    adminId: string,
    meta: RequestMeta,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const restriction = await tx.riskRestriction.findUnique({ where: { id: restrictionId } });
      if (!restriction) throw notFound('RESOURCE_NOT_FOUND', 'Restriction not found.');
      if (restriction.status !== 'ACTIVE')
        throw conflict('INVALID_REQUEST', 'The restriction is not active.');
      const updated = await tx.riskRestriction.update({
        where: { id: restrictionId },
        data: { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null },
      });
      await this.audit.record(
        {
          action: AUDIT_ACTIONS.RISK_RESTRICTION_OVERRIDDEN,
          actorUserId: adminId,
          entityType: 'RISK_RESTRICTION',
          entityId: restrictionId,
          oldValues: { expiresAt: restriction.expiresAt?.toISOString() ?? null },
          newValues: { expiresAt: input.expiresAt, reason: input.reason },
          meta,
        },
        tx,
      );
      return toRestriction(updated);
    });
  }

  async removeRestriction(
    restrictionId: string,
    reason: string,
    adminId: string,
    meta: RequestMeta,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.riskRestriction.updateMany({
        where: { id: restrictionId, status: 'ACTIVE' },
        data: { status: 'REMOVED' },
      });
      if (updated.count === 0) {
        const exists = await tx.riskRestriction.count({ where: { id: restrictionId } });
        if (!exists) throw notFound('RESOURCE_NOT_FOUND', 'Restriction not found.');
        throw conflict('INVALID_REQUEST', 'The restriction is not active.');
      }
      await this.audit.record(
        {
          action: AUDIT_ACTIONS.RISK_RESTRICTION_RESOLVED,
          actorUserId: adminId,
          entityType: 'RISK_RESTRICTION',
          entityId: restrictionId,
          newValues: { status: 'REMOVED', reason },
          meta,
        },
        tx,
      );
      return toRestriction(
        await tx.riskRestriction.findUniqueOrThrow({ where: { id: restrictionId } }),
      );
    });
  }

  private async page<Row extends Keyed, View>(
    query: RiskListQuery,
    load: (where: Record<string, unknown>, take: number) => Promise<Row[]>,
    present: (row: Row) => View,
    statuses: readonly string[] = [],
  ): Promise<{ rows: View[]; nextCursor: string | null }> {
    if (query.status && !statuses.includes(query.status)) {
      throw validationError({ status: `Expected one of: ${statuses.join(', ') || '(none)'}` });
    }
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (query.cursor && !cursor) throw validationError({ cursor: 'Invalid cursor' });
    const rows = await load(
      {
        ...(query.subjectType ? { subjectType: query.subjectType } : {}),
        ...(query.subjectId ? { subjectId: query.subjectId } : {}),
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
      query.limit + 1,
    );
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      rows: page.map(present),
      nextCursor: rows.length > query.limit && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }
}

function toEvent(event: RiskEvent): RiskEventView {
  return {
    id: event.id,
    subjectType: event.subjectType,
    subjectId: event.subjectId,
    eventType: event.eventType,
    severity: event.severity,
    metadata: event.metadata,
    occurredAt: event.occurredAt.toISOString(),
  };
}

function toRule(rule: RiskRule): RiskRuleView {
  return {
    id: rule.id,
    name: rule.name,
    subjectType: rule.subjectType,
    eventType: rule.eventType,
    threshold: rule.threshold,
    windowSeconds: rule.windowSeconds,
    action: rule.action,
    severity: rule.severity,
    enabled: rule.isEnabled,
    updatedAt: rule.updatedAt.toISOString(),
  };
}

function toFlag(flag: RiskFlag): RiskFlagView {
  return {
    id: flag.id,
    subjectType: flag.subjectType,
    subjectId: flag.subjectId,
    riskRuleId: flag.riskRuleId,
    status: flag.status,
    severity: flag.severity,
    reason: flag.reason,
    createdAt: flag.createdAt.toISOString(),
    resolvedAt: flag.resolvedAt?.toISOString() ?? null,
    resolvedBy: flag.resolvedBy,
  };
}

function toRestriction(restriction: RiskRestriction): RiskRestrictionView {
  return {
    id: restriction.id,
    subjectType: restriction.subjectType,
    subjectId: restriction.subjectId,
    restrictionType: restriction.restrictionType,
    status: restriction.status,
    startsAt: restriction.startsAt.toISOString(),
    expiresAt: restriction.expiresAt?.toISOString() ?? null,
    reason: restriction.reason,
    riskFlagId: restriction.riskFlagId,
    createdBy: restriction.createdBy,
    createdAt: restriction.createdAt.toISOString(),
  };
}
