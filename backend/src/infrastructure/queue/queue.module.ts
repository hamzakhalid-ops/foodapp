import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';

/**
 * BullMQ on Redis for background jobs (outbox processing, notifications, dispatch timeouts,
 * financial jobs). Queues are registered by the slice that first needs them, e.g.
 * `BullModule.registerQueue({ name: 'outbox' })`, and processed by the worker process.
 *
 * Job payloads carry identifiers, not authoritative business state; workers re-read PostgreSQL.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => {
        const url = new URL(config.get('REDIS_URL'));
        return {
          prefix: 'quickbite',
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
            ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
            ...(url.pathname.length > 1 ? { db: Number(url.pathname.slice(1)) } : {}),
            ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
            // Required by BullMQ workers (blocking commands).
            maxRetriesPerRequest: null,
          },
        };
      },
    }),
  ],
})
export class QueueModule {}
