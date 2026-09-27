import { Module } from '@nestjs/common';
import { LoggingModule } from './common/logging/logging.module';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { QueueModule } from './infrastructure/queue/queue.module';
import { RedisModule } from './infrastructure/redis/redis.module';

/**
 * Background worker process (ARCHITECTURE §33, DEPLOYMENT_SPEC §8–9).
 *
 * Runs BullMQ processors and outbox dispatching. No processors exist yet; they are added by
 * the slices that introduce asynchronous work (outbox, notifications, dispatch timeouts,
 * financial jobs).
 */
@Module({
  imports: [AppConfigModule, LoggingModule, DatabaseModule, RedisModule, QueueModule],
})
export class WorkerModule {}
