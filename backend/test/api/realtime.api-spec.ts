import { type AddressInfo } from 'node:net';
import { io } from 'socket.io-client';
import { createTestApp, type TestApp } from '../create-test-app';

describe('Realtime gateway authentication', () => {
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

  it('refuses connections without an access token before any event can flow', async () => {
    const socket = io(url, { path: '/realtime', transports: ['websocket'], reconnection: false });
    const error = await new Promise<Error>((resolve) => socket.on('connect_error', resolve));
    expect(error.message).toBe('AUTH_TOKEN_INVALID');
    expect(socket.connected).toBe(false);
    socket.close();
  });

  it('refuses malformed tokens', async () => {
    const socket = io(url, {
      path: '/realtime',
      transports: ['websocket'],
      reconnection: false,
      auth: { token: 'not-a-jwt' },
    });
    const error = await new Promise<Error>((resolve) => socket.on('connect_error', resolve));
    expect(error.message).toBe('AUTH_TOKEN_INVALID');
    socket.close();
  });
});
