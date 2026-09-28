import { type Server } from 'node:http';
import { type INestApplication, type Type } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/bootstrap';

export type TestApp = INestApplication<Server>;

/**
 * Boots the real AppModule with production HTTP configuration for Supertest.
 * Configuration is read from process.env, which each Jest project prepares in a setup file
 * (configuration is validated when AppModule is first imported).
 */
export async function createTestApp(
  customize: (builder: TestingModuleBuilder) => TestingModuleBuilder = (builder) => builder,
  extraControllers: Type[] = [],
): Promise<TestApp> {
  const moduleRef = await customize(
    Test.createTestingModule({ imports: [AppModule], controllers: extraControllers }),
  ).compile();
  const app = moduleRef.createNestApplication<TestApp>({ bufferLogs: true, rawBody: true });
  configureHttpApp(app);
  await app.init();
  return app;
}
