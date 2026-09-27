import { type AddressInfo } from 'node:net';
import { io } from 'socket.io-client';
import { createTestApp, type TestApp } from '../create-test-app';

describe('Realtime gateway (fail-closed until authentication exists)', () => {
  let app: TestApp;
  let url: string;

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;
    url = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated Socket.IO connections with a structured error', async () => {
    const socket = io(url, { path: '/realtime', transports: ['websocket'], reconnection: false });

    const [error, reason] = await Promise.all([
      new Promise<unknown>((resolve) => socket.on('error', resolve)),
      new Promise<string>((resolve) => socket.on('disconnect', resolve)),
    ]);

    expect(error).toEqual({ code: 'AUTH_TOKEN_INVALID', message: 'Authentication is required.' });
    expect(reason).toBe('io server disconnect');
    socket.close();
  });
});
