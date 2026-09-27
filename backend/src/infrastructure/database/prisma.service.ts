import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaClient } from '../../generated/prisma/client';

/**
 * PostgreSQL access through Prisma — the durable source of truth (ADR-0002).
 *
 * The connection is established lazily on first query so that process startup does not depend on
 * database availability; readiness is reported through /health/ready.
 *
 * Critical state changes must use `$transaction` and must not call external providers inside
 * the transaction (CLAUDE.md §9).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: AppConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: config.get('DATABASE_URL'),
        connectionTimeoutMillis: 5_000,
      }),
    });
  }

  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
