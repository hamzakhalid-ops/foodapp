import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ApiException } from '../http/api.exception';
import { type Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { SETTINGS, type SettingKey, type SettingValue } from './settings.registry';

export interface SettingEntry {
  key: SettingKey;
  description: string;
  value: unknown;
  updatedAt: string | null;
  updatedBy: string | null;
}

/** Typed access to admin-managed platform settings (DATABASE.md §60). */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async get<K extends SettingKey>(
    key: K,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<SettingValue<K> | undefined> {
    const row = await tx.systemSetting.findUnique({ where: { key } });
    if (!row) return undefined;
    const parsed = SETTINGS[key].schema.safeParse(row.value);
    if (!parsed.success) {
      this.logger.error({ key }, 'Stored setting is invalid');
      return undefined;
    }
    return parsed.data as SettingValue<K>;
  }

  /** Fails the operation (503) when a required business setting has not been configured. */
  async require<K extends SettingKey>(
    key: K,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<SettingValue<K>> {
    const value = await this.get(key, tx);
    if (value === undefined) {
      this.logger.error({ key }, 'Required platform setting is not configured');
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'INTERNAL_ERROR',
        'This operation is temporarily unavailable.',
      );
    }
    return value;
  }

  async set<K extends SettingKey>(
    key: K,
    value: SettingValue<K>,
    updatedBy: string | null,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<{ previous: unknown }> {
    const parsed = SETTINGS[key].schema.parse(value) as Prisma.InputJsonValue;
    const existing = await tx.systemSetting.findUnique({ where: { key } });
    await tx.systemSetting.upsert({
      where: { key },
      create: {
        key,
        value: parsed,
        valueType: typeof parsed,
        description: SETTINGS[key].description,
        updatedBy,
      },
      update: { value: parsed, valueType: typeof parsed, updatedBy },
    });
    return { previous: existing?.value ?? null };
  }

  /** Every registered setting with its current value (unset = null). */
  async list(): Promise<SettingEntry[]> {
    const rows = await this.prisma.systemSetting.findMany({
      where: { key: { in: Object.keys(SETTINGS) } },
    });
    const byKey = new Map(rows.map((row) => [row.key, row]));
    return (Object.keys(SETTINGS) as SettingKey[]).map((key) => {
      const row = byKey.get(key);
      return {
        key,
        description: SETTINGS[key].description,
        value: row?.value ?? null,
        updatedAt: row?.updatedAt.toISOString() ?? null,
        updatedBy: row?.updatedBy ?? null,
      };
    });
  }
}
