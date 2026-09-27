import request from 'supertest';
import { createTestApp, type TestApp } from '../create-test-app';

/** Requires live PostgreSQL and Redis (DATABASE_URL / REDIS_URL). */
describe('readiness against live infrastructure', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/ready reports PostgreSQL and Redis up', async () => {
    const response = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(response.body).toEqual({
      success: true,
      data: { status: 'ok', dependencies: { database: 'up', redis: 'up' } },
    });
  });
});
