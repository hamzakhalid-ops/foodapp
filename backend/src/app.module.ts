import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { SentryModule } from '@sentry/nestjs/setup';
import { ApiExceptionFilter } from './common/http/api-exception.filter';
import { ApiResponseInterceptor } from './common/http/api-response.interceptor';
import { CoreModule } from './core.module';
import { HealthModule } from './infrastructure/health/health.module';
import { RealtimeModule } from './infrastructure/realtime/realtime.module';

/** HTTP API process: REST /api/v1, Socket.IO gateway, health probes. */
@Module({
  imports: [SentryModule.forRoot(), CoreModule, RealtimeModule, HealthModule],
  providers: [
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ApiResponseInterceptor },
  ],
})
export class AppModule {}
