import './instrument';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureHttpApp } from './bootstrap';
import { AppConfigService } from './config/app-config.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  configureHttpApp(app);
  await app.listen(app.get(AppConfigService).get('API_PORT'));
}

void bootstrap();
