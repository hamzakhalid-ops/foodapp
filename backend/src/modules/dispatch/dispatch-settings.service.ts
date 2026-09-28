import { Injectable } from '@nestjs/common';
import {
  type DispatchSettings as DispatchSettingsView,
  type UpdateDispatchSettingsRequest,
} from '@quickbite/validation';
import { notFound } from '../../common/http/errors';
import { type RequestMeta } from '../../common/http/request-meta';
import { type DispatchSettings } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuditService } from '../audit/audit.service';

/** Admin management of the singleton `dispatch_settings` row (DISPATCH_RULES §23, API_SPEC §107). */
@Injectable()
export class DispatchSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(): Promise<DispatchSettingsView> {
    const row = await this.prisma.dispatchSettings.findFirst();
    if (!row) throw notFound('RESOURCE_NOT_FOUND', 'Dispatch settings are not configured.');
    return toView(row);
  }

  async update(
    input: UpdateDispatchSettingsRequest,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<DispatchSettingsView> {
    const { reason, ...values } = input;
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.dispatchSettings.findFirst();
      const saved = existing
        ? await tx.dispatchSettings.update({ where: { id: existing.id }, data: values })
        : await tx.dispatchSettings.create({ data: values });
      await this.audit.record(
        {
          action: 'DISPATCH_SETTINGS_CHANGED',
          actorUserId,
          entityType: 'dispatch_settings',
          entityId: saved.id,
          ...(existing ? { oldValues: toView(existing) } : {}),
          newValues: toView(saved),
          metadata: { reason },
          meta,
        },
        tx,
      );
      return saved;
    });
    return toView(row);
  }
}

function toView(row: DispatchSettings): DispatchSettingsView {
  return {
    initialRadius: row.initialRadius.toNumber(),
    radiusIncrement: row.radiusIncrement.toNumber(),
    maximumRadius: row.maximumRadius.toNumber(),
    offerTimeoutSeconds: row.offerTimeoutSeconds,
    maxOfferAttempts: row.maxOfferAttempts,
    locationMaxAgeSeconds: row.locationMaxAgeSeconds,
  };
}
