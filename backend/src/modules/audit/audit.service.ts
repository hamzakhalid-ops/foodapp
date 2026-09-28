import { Injectable } from '@nestjs/common';
import { type AuditLog as AuditLogView, type AuditLogListQuery } from '@quickbite/validation';
import { notFound } from '../../common/http/errors';
import { createdBefore, keysetPage } from '../../common/http/pagination';
import { type RequestMeta } from '../../common/http/request-meta';
import { type AuditLog, type Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { type AuditAction } from './audit.actions';

export interface AuditEntry {
  action: AuditAction;
  actorUserId?: string | null | undefined;
  entityType?: string | undefined;
  entityId?: string | undefined;
  oldValues?: Prisma.InputJsonObject;
  newValues?: Prisma.InputJsonObject;
  metadata?: Prisma.InputJsonObject;
  meta?: RequestMeta;
}

/**
 * Append-only audit trail (DATABASE.md §59). Never pass passwords, tokens, OTPs or other
 * secrets in any field (AUTH_AUTHORIZATION §61, §107).
 *
 * Pass the transaction client when the audit record must commit atomically with the change.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, tx: Prisma.TransactionClient = this.prisma): Promise<void> {
    await tx.auditLog.create({
      data: {
        action: entry.action,
        actorUserId: entry.actorUserId ?? null,
        entityType: entry.entityType ?? null,
        entityId: entry.entityId ?? null,
        ...(entry.oldValues ? { oldValues: entry.oldValues } : {}),
        ...(entry.newValues ? { newValues: entry.newValues } : {}),
        ipAddress: entry.meta?.ipAddress ?? null,
        userAgent: entry.meta?.userAgent ?? null,
        metadata: {
          ...entry.metadata,
          ...(entry.meta?.requestId ? { requestId: entry.meta.requestId } : {}),
          ...(entry.meta?.correlationId ? { correlationId: entry.meta.correlationId } : {}),
        },
      },
    });
  }

  /** API_SPEC §108 — read-only; the application never updates or deletes audit rows. */
  async list(query: AuditLogListQuery) {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
        ...(query.action ? { action: query.action } : {}),
        ...(query.entityType ? { entityType: query.entityType } : {}),
        ...(query.entityId ? { entityId: query.entityId } : {}),
        createdAt: {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lte: new Date(query.to) } : {}),
        },
        ...createdBefore(query.cursor),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    return keysetPage(rows, query.limit, toAuditLog);
  }

  async get(id: string): Promise<AuditLogView> {
    const row = await this.prisma.auditLog.findUnique({ where: { id } });
    if (!row) throw notFound();
    return toAuditLog(row);
  }
}

function toAuditLog(row: AuditLog): AuditLogView {
  return {
    id: row.id,
    actorUserId: row.actorUserId,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    oldValues: row.oldValues ?? null,
    newValues: row.newValues ?? null,
    metadata: row.metadata ?? null,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    createdAt: row.createdAt.toISOString(),
  };
}
