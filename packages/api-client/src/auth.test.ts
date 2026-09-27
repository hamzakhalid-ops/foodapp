import { createAuthApi } from './auth';
import { ApiClient } from './client';

const user = {
  id: '4f0c1c1e-8f7e-4b8a-9f3e-2b1c0d9e8a7b',
  email: 'a@b.co',
  phone: '+923001234567',
  roles: ['CUSTOMER'],
  status: 'PENDING_VERIFICATION',
};

describe('createAuthApi', () => {
  it('posts login to /api/v1/auth/login and parses tokens + user', async () => {
    const fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: { accessToken: 'a', refreshToken: 'r', expiresIn: 900, user },
          }),
          { status: 200 },
        ),
      ),
    );
    const api = createAuthApi(
      new ApiClient({ baseUrl: 'http://api.test', fetch: fetchMock as unknown as typeof fetch }),
    );

    const result = await api.login({ identifier: 'a@b.co', password: 'pw' });

    expect(result.user.roles).toEqual(['CUSTOMER']);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://api.test/api/v1/auth/login');
  });

  it('treats 204 logout as success', async () => {
    const api = createAuthApi(
      new ApiClient({
        baseUrl: 'http://api.test',
        getAccessToken: () => 'token',
        fetch: () => Promise.resolve(new Response(null, { status: 204 })),
      }),
    );
    await expect(api.logout()).resolves.toBeUndefined();
  });
});
