import { type Server } from 'node:http';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/bootstrap';

/**
 * Boots the real AppModule with production HTTP configuration for Supertest.
 * Configuration is read from process.env, which each Jest project prepares in a setup file
 * (configuration is validated when AppModule is first imported).
 */
export type TestApp = INestApplication<Server>;

export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<TestApp>({ bufferLogs: true });
  configureHttpApp(app);
  await app.init();
  return app;
}
