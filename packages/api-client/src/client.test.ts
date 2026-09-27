import { z } from 'zod';
import { ApiClient, createIdempotencyKey } from './client';
import { type ApiError, ApiTransportError } from './errors';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('ApiClient', () => {
  it('sends request id, auth and idempotency headers to /api/v1', async () => {
    const fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>(() =>
      Promise.resolve(jsonResponse(200, { success: true, data: { id: 'x' } })),
    );
    const client = new ApiClient({
      baseUrl: 'http://localhost:3000/',
      getAccessToken: () => 'token-1',
      createRequestId: () => 'req_fixed',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const result = await client.request({
      method: 'POST',
      path: '/example',
      schema: z.object({ id: z.string() }),
      body: { a: 1 },
      idempotencyKey: 'key-1',
    });

    expect(result.data.id).toBe('x');
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('http://localhost:3000/api/v1/example');
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer token-1',
      'X-Request-ID': 'req_fixed',
      'Idempotency-Key': 'key-1',
      'Content-Type': 'application/json',
    });
  });

  it('throws a structured ApiError for standard error envelopes', async () => {
    const client = new ApiClient({
      baseUrl: 'http://localhost:3000',
      fetch: () =>
        Promise.resolve(
          jsonResponse(409, {
            success: false,
            error: { code: 'ORDER_INVALID_STATUS', message: 'Nope', requestId: 'req_9' },
          }),
        ),
    });

    await expect(
      client.request({ method: 'GET', path: '/x', schema: z.unknown() }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      code: 'ORDER_INVALID_STATUS',
      requestId: 'req_9',
    } satisfies Partial<ApiError>);
  });

  it('rejects responses that violate the contract', async () => {
    const client = new ApiClient({
      baseUrl: 'http://localhost:3000',
      fetch: () => Promise.resolve(jsonResponse(200, { data: 1 })),
    });

    await expect(
      client.request({ method: 'GET', path: '/x', schema: z.number() }),
    ).rejects.toBeInstanceOf(ApiTransportError);
  });

  it('creates unique idempotency keys', () => {
    expect(createIdempotencyKey('order-create')).not.toBe(createIdempotencyKey('order-create'));
  });
});
