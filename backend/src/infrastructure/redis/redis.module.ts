import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppConfigService } from '../../config/app-config.service';

/**
 * Redis for operational/temporary workloads only: cache, rate limiting, presence, dispatch
 * coordination, short-lived locks, realtime coordination (ADR-0003). Never the durable source of
 * truth for business records.
 */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        new Redis(config.get('REDIS_URL'), {
          lazyConnect: true,
          connectTimeout: 5_000,
          maxRetriesPerRequest: 1,
          // Upper bound for closing a half-open socket during shutdown.
          disconnectTimeout: 250,
        }),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    if (this.redis.status === 'ready') {
      await this.redis.quit();
    } else {
      this.redis.disconnect();
    }
  }
}
