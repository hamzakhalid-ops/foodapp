import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { SentryModule } from '@sentry/nestjs/setup';
import { ApiExceptionFilter } from './common/http/api-exception.filter';
import { ApiResponseInterceptor } from './common/http/api-response.interceptor';
import { LoggingModule } from './common/logging/logging.module';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { HealthModule } from './infrastructure/health/health.module';
import { QueueModule } from './infrastructure/queue/queue.module';
import { RealtimeModule } from './infrastructure/realtime/realtime.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { DOMAIN_MODULES } from './modules';

/** HTTP API process: REST /api/v1, Socket.IO gateway, health probes. */
@Module({
  imports: [
    SentryModule.forRoot(),
    AppConfigModule,
    LoggingModule,
    DatabaseModule,
    RedisModule,
    QueueModule,
    RealtimeModule,
    HealthModule,
    ...DOMAIN_MODULES,
  ],
  providers: [
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ApiResponseInterceptor },
  ],
})
export class AppModule {}
