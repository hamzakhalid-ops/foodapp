import { Module } from '@nestjs/common';
import { LoggingModule } from './common/logging/logging.module';
import { OutboxModule } from './common/outbox/outbox.module';
import { RateLimitModule } from './common/rate-limit/rate-limit.module';
import { SettingsModule } from './common/settings/settings.module';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { QueueModule } from './infrastructure/queue/queue.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { ScheduledTasksModule } from './infrastructure/scheduler/scheduled-tasks.module';
import { DOMAIN_MODULES } from './modules';

/** Infrastructure + domain modules shared by the API and the worker process. */
@Module({
  imports: [
    AppConfigModule,
    LoggingModule,
    DatabaseModule,
    RedisModule,
    RateLimitModule,
    QueueModule,
    SettingsModule,
    OutboxModule,
    ScheduledTasksModule,
    ...DOMAIN_MODULES,
  ],
})
export class CoreModule {}
