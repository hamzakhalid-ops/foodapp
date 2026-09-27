import { type INestApplication, RequestMethod } from '@nestjs/common';
import { API_BASE_PATH } from '@quickbite/types';
import { Logger } from 'nestjs-pino';
import { AppConfigService } from './config/app-config.service';
import { RealtimeIoAdapter } from './infrastructure/realtime/realtime-io.adapter';

/**
 * Applies HTTP configuration shared by the production entrypoint and API tests so that tests
 * exercise exactly what runs in production.
 */
export function configureHttpApp(app: INestApplication): void {
  const config = app.get(AppConfigService);

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix(API_BASE_PATH.replace(/^\//, ''), {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
  app.enableCors({
    origin: config.get('API_CORS_ORIGINS'),
    credentials: true,
  });
  app.useWebSocketAdapter(new RealtimeIoAdapter(app, config.get('API_CORS_ORIGINS')));
  app.enableShutdownHooks();

  const httpAdapter = app.getHttpAdapter().getInstance() as {
    disable: (setting: string) => void;
    set: (setting: string, value: unknown) => void;
  };
  httpAdapter.disable('x-powered-by');
  if (config.get('API_TRUST_PROXY')) {
    httpAdapter.set('trust proxy', 1);
  }
}
