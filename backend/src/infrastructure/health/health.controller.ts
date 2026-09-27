import { Controller, Get, HttpStatus, Inject } from '@nestjs/common';
import { type Redis } from 'ioredis';
import { Public } from '../../common/auth/auth.decorators';
import { ApiException } from '../../common/http/api.exception';
import { PrismaService } from '../database/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';

type DependencyStatus = 'up' | 'down';

/**
 * Liveness/readiness probes (OBSERVABILITY_SPEC §39–41, DEPLOYMENT_SPEC §25).
 * Served outside /api/v1 because they are infrastructure endpoints, not product API.
 */
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /** Is the process alive? No dependency checks. */
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Can this instance serve traffic? Checks PostgreSQL and Redis. */
  @Get('ready')
  async ready(): Promise<{ status: 'ok'; dependencies: Record<string, DependencyStatus> }> {
    const [database, redis] = await Promise.all([
      this.check(() => this.prisma.ping()),
      this.check(async () => {
        if (this.redis.status === 'wait') await this.redis.connect();
        await this.redis.ping();
      }),
    ]);
    const dependencies = { database, redis };

    if (database === 'down' || redis === 'down') {
      // No dedicated "not ready" code exists in API_SPEC §13; see REPOSITORY_CONSISTENCY_REPORT.
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'INTERNAL_ERROR',
        'Service is not ready.',
        { dependencies },
      );
    }
    return { status: 'ok', dependencies };
  }

  private async check(probe: () => Promise<void>): Promise<DependencyStatus> {
    try {
      await probe();
      return 'up';
    } catch {
      return 'down';
    }
  }
}
