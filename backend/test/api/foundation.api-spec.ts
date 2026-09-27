import request from 'supertest';
import { createTestApp, type TestApp } from '../create-test-app';

describe('HTTP foundation (no external services)', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/live reports the process alive in the success envelope', async () => {
    const response = await request(app.getHttpServer()).get('/health/live').expect(200);
    expect(response.body).toEqual({ success: true, data: { status: 'ok' } });
  });

  it('GET /health/ready returns 503 with a structured error when dependencies are down', async () => {
    const response = await request(app.getHttpServer()).get('/health/ready').expect(503);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        details: { dependencies: { database: 'down', redis: 'down' } },
      },
    });
  });

  it('returns the standard error envelope with the request id for unknown routes', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/does-not-exist')
      .set('X-Request-ID', 'req_test_123')
      .expect(404);

    expect(response.headers['x-request-id']).toBe('req_test_123');
    expect(response.headers['x-correlation-id']).toMatch(/^corr_/);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: 'The requested resource was not found.',
        requestId: 'req_test_123',
      },
    });
  });

  it('generates a request id when the client does not send a safe one', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/does-not-exist')
      .set('X-Request-ID', 'not safe <script>')
      .expect(404);

    const body = response.body as { error: { requestId: string } };
    expect(body.error.requestId).toMatch(/^req_[0-9a-f-]{36}$/);
    expect(response.headers['x-request-id']).toBe(body.error.requestId);
  });

  it('does not expose framework fingerprinting headers', async () => {
    const response = await request(app.getHttpServer()).get('/health/live');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('serves product routes only under /api/v1', async () => {
    await request(app.getHttpServer()).get('/api/v1/health/live').expect(404);
  });
});
