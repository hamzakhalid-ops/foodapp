import { ApiError, ApiTransportError } from '@quickbite/api-client';
import { type CurrentUser } from '@quickbite/validation';
import { createSession, type SessionDeps, useSessionStore } from './session';
import { type TokenStorage } from './token-storage';

const user: CurrentUser = {
  id: '5b1c1f0e-2f5d-4b7a-9c1e-2d3f4a5b6c7d',
  email: 'ali@example.com',
  phone: '+923001234567',
  roles: ['CUSTOMER'],
  status: 'PENDING_VERIFICATION',
};

function memoryStorage(initial: string | null = null): TokenStorage & { value: string | null } {
  const storage = {
    value: initial,
    getRefreshToken: () => Promise.resolve(storage.value),
    setRefreshToken: (token: string) => {
      storage.value = token;
      return Promise.resolve();
    },
    clear: () => {
      storage.value = null;
      return Promise.resolve();
    },
  };
  return storage;
}

function setup(storage = memoryStorage(), now = () => 0) {
  const deps = {
    publicAuth: {
      login: jest.fn(() =>
        Promise.resolve({
          accessToken: 'access-1',
          refreshToken: 'refresh-1',
          expiresIn: 900,
          user,
        }),
      ),
      register: jest.fn(() =>
        Promise.resolve({ user, verification: { phoneRequired: true, emailRequired: true } }),
      ),
      refresh: jest.fn(() =>
        Promise.resolve({ accessToken: 'access-2', refreshToken: 'refresh-2', expiresIn: 900 }),
      ),
    },
    auth: { me: jest.fn(() => Promise.resolve(user)), logout: jest.fn(() => Promise.resolve()) },
    storage,
    now,
  } satisfies SessionDeps;
  return { session: createSession(deps), deps, storage };
}

beforeEach(() => {
  useSessionStore.setState({ status: 'unknown' });
});

describe('session', () => {
  it('signs out on restore when no refresh token is stored', async () => {
    const { session, deps } = setup();
    await expect(session.restore()).resolves.toBe('signedOut');
    expect(deps.publicAuth.refresh).not.toHaveBeenCalled();
    expect(useSessionStore.getState().status).toBe('signedOut');
  });

  it('restores a stored session by rotating the refresh token', async () => {
    const { session, deps, storage } = setup(memoryStorage('refresh-0'));
    await expect(session.restore()).resolves.toBe('signedIn');
    expect(deps.publicAuth.refresh).toHaveBeenCalledWith({ refreshToken: 'refresh-0' });
    expect(storage.value).toBe('refresh-2');
    await expect(session.getAccessToken()).resolves.toBe('access-2');
  });

  it('discards the stored token when the backend rejects it', async () => {
    const { session, deps, storage } = setup(memoryStorage('refresh-0'));
    deps.publicAuth.refresh.mockRejectedValueOnce(
      new ApiError(401, { code: 'AUTH_REFRESH_TOKEN_INVALID', message: 'invalid' }),
    );
    await expect(session.restore()).resolves.toBe('signedOut');
    expect(storage.value).toBeNull();
  });

  it('keeps the stored token when the network is unavailable', async () => {
    const { session, deps, storage } = setup(memoryStorage('refresh-0'));
    deps.publicAuth.refresh.mockRejectedValueOnce(new ApiTransportError('offline'));
    await expect(session.restore()).rejects.toBeInstanceOf(ApiTransportError);
    expect(storage.value).toBe('refresh-0');
  });

  it('stores the refresh token and marks the session signed in after login', async () => {
    const { session, storage } = setup();
    await expect(
      session.login({ identifier: 'ali@example.com', password: 'secret123' }),
    ).resolves.toEqual(user);
    expect(storage.value).toBe('refresh-1');
    expect(useSessionStore.getState().status).toBe('signedIn');
    await expect(session.getAccessToken()).resolves.toBe('access-1');
  });

  it('refreshes once for concurrent callers when the access token is about to expire', async () => {
    let time = 0;
    const { session, deps } = setup(memoryStorage(), () => time);
    await session.login({ identifier: 'ali@example.com', password: 'secret123' });
    time = 900_000 - 10_000; // inside the expiry margin
    const tokens = await Promise.all([session.getAccessToken(), session.getAccessToken()]);
    expect(tokens).toEqual(['access-2', 'access-2']);
    expect(deps.publicAuth.refresh).toHaveBeenCalledTimes(1);
  });

  it('logs in with the same credentials after registering (API_SPEC §16.1)', async () => {
    const { session, deps } = setup();
    await session.register({
      firstName: 'Ali',
      lastName: 'Khan',
      email: 'ali@example.com',
      phone: '+923001234567',
      password: 'secret123',
    });
    expect(deps.publicAuth.login).toHaveBeenCalledWith({
      identifier: 'ali@example.com',
      password: 'secret123',
    });
  });

  it('clears local credentials on logout even when the server call fails', async () => {
    const { session, deps, storage } = setup();
    await session.login({ identifier: 'ali@example.com', password: 'secret123' });
    deps.auth.logout.mockRejectedValueOnce(new ApiTransportError('offline'));
    await session.logout();
    expect(storage.value).toBeNull();
    expect(useSessionStore.getState().status).toBe('signedOut');
    await expect(session.getAccessToken()).resolves.toBeNull();
  });
});
