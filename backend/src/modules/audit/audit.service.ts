import { Injectable } from '@nestjs/common';
import { type RequestMeta } from '../../common/http/request-meta';
import { type Prisma } from '../../generated/prisma/client';
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
}
