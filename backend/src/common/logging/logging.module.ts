import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigService } from '../../config/app-config.service';
import { assignRequestContext, type RequestWithContext } from '../http/request-context';

/**
 * Structured JSON logging (OBSERVABILITY_SPEC §7). Every HTTP log line carries request_id and
 * correlation_id. Credentials, tokens and personal data are redacted (CLAUDE.md §32).
 */
export const REDACTED_LOG_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.otp',
  '*.secret',
];

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL'),
          base: {
            service: 'api',
            environment: config.get('APP_ENV'),
            version: config.get('APP_VERSION'),
          },
          messageKey: 'message',
          timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
          formatters: { level: (label: string) => ({ level: label.toUpperCase() }) },
          redact: { paths: REDACTED_LOG_PATHS, censor: '[REDACTED]' },
          genReqId: assignRequestContext,
          customAttributeKeys: { reqId: 'request_id', responseTime: 'duration_ms' },
          customProps: (req: RequestWithContext) => ({ correlation_id: req.correlationId }),
          // Health probes are high-frequency and carry no business signal.
          autoLogging: { ignore: (req) => req.url?.startsWith('/health/') ?? false },
          ...(config.get('LOG_PRETTY') ? { transport: { target: 'pino-pretty' } } : {}),
        },
      }),
    }),
  ],
})
export class LoggingModule {}
