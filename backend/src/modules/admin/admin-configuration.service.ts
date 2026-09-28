import { Injectable } from '@nestjs/common';
import { type ConfigurationEntry, type UpdateConfigurationRequest } from '@quickbite/validation';
import { notFound, validationError } from '../../common/http/errors';
import { type RequestMeta } from '../../common/http/request-meta';
import { isSettingKey, SETTINGS } from '../../common/settings/settings.registry';
import { SettingsService } from '../../common/settings/settings.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuditService } from '../audit/audit.service';

/** Key/value platform settings (DATABASE.md §60, API_SPEC §107). Only registered keys exist. */
@Injectable()
export class AdminConfigurationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  list(): Promise<ConfigurationEntry[]> {
    return this.settings.list();
  }

  async update(
    key: string,
    input: UpdateConfigurationRequest,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<ConfigurationEntry> {
    if (!isSettingKey(key)) throw notFound();
    const parsed = SETTINGS[key].schema.safeParse(input.value);
    if (!parsed.success) {
      throw validationError({ value: parsed.error.issues[0]?.message ?? 'Invalid value' });
    }
    await this.prisma.$transaction(async (tx) => {
      const { previous } = await this.settings.set(key, parsed.data, actorUserId, tx);
      await this.audit.record(
        {
          action: 'CONFIGURATION_CHANGED',
          actorUserId,
          entityType: 'system_setting',
          oldValues: { key, value: previous ?? null },
          newValues: { key, value: parsed.data },
          metadata: { key, reason: input.reason },
          meta,
        },
        tx,
      );
    });
    const entry = (await this.settings.list()).find((row) => row.key === key);
    if (!entry) throw notFound();
    return entry;
  }
}
