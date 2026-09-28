import { ApiError, type AuthApi } from '@quickbite/api-client';
import {
  type AuthTokens,
  type CurrentUser,
  type LoginRequest,
  type RegisterRequest,
} from '@quickbite/validation';
import { create } from 'zustand';
import { type TokenStorage } from './token-storage';

/**
 * Client-side authentication session (AUTH_AUTHORIZATION §21–25, API_SPEC §16–19, §25).
 *
 * * The access token lives in memory only; the refresh token lives in secure storage.
 * * Refresh tokens are single-use and reuse revokes the whole session, so refreshes are
 *   serialized: at most one is in flight and concurrent callers share it.
 * * The backend decides everything about the account; the client only tracks whether it holds a
 *   usable session.
 */
export type SessionStatus = 'unknown' | 'signedOut' | 'signedIn';

/** Client-only state (never authoritative data), per apps/customer/README.md. */
export const useSessionStore = create<{ status: SessionStatus }>(() => ({ status: 'unknown' }));

/** Refresh a little before expiry so requests never race the access token's lifetime. */
const EXPIRY_MARGIN_MS = 30_000;

export interface SessionDeps {
  /** Auth endpoints called without an access token (login, register, refresh). */
  publicAuth: Pick<AuthApi, 'login' | 'register' | 'refresh'>;
  /** Auth endpoints called with the session's access token (me, logout). */
  auth: Pick<AuthApi, 'me' | 'logout'>;
  storage: TokenStorage;
  now?: () => number;
}

export function createSession({ publicAuth, auth, storage, now = Date.now }: SessionDeps) {
  let accessToken: string | null = null;
  let accessTokenExpiresAt = 0;
  let refreshInFlight: Promise<string | null> | null = null;

  const setStatus = (status: SessionStatus) => {
    useSessionStore.setState({ status });
  };

  async function adopt(tokens: AuthTokens): Promise<void> {
    await storage.setRefreshToken(tokens.refreshToken);
    accessToken = tokens.accessToken;
    accessTokenExpiresAt = now() + tokens.expiresIn * 1000;
  }

  async function forget(): Promise<void> {
    accessToken = null;
    accessTokenExpiresAt = 0;
    await storage.clear();
    setStatus('signedOut');
  }

  /**
   * Rotates the refresh token. Returns the new access token, or null when there is no usable
   * session (no token, or the backend rejected it — the stored token is then discarded).
   * Network failures are re-thrown and keep the stored token, so an offline start does not sign
   * the customer out.
   */
  function refresh(): Promise<string | null> {
    refreshInFlight ??= (async (): Promise<string | null> => {
      try {
        const refreshToken = await storage.getRefreshToken();
        if (!refreshToken) return null;
        try {
          await adopt(await publicAuth.refresh({ refreshToken }));
          return accessToken;
        } catch (error) {
          if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
            await forget();
            return null;
          }
          throw error;
        }
      } finally {
        refreshInFlight = null;
      }
    })();
    return refreshInFlight;
  }

  async function login(credentials: LoginRequest): Promise<CurrentUser> {
    const result = await publicAuth.login(credentials);
    await adopt(result);
    setStatus('signedIn');
    return result.user;
  }

  return {
    /** For `ApiClient.getAccessToken`: the current access token, refreshed when near expiry. */
    async getAccessToken(): Promise<string | null> {
      if (accessToken && now() < accessTokenExpiresAt - EXPIRY_MARGIN_MS) return accessToken;
      if (!accessToken) return null;
      return refresh();
    },

    /** Restores a stored session at app start. Throws on network failure (caller may retry). */
    async restore(): Promise<SessionStatus> {
      const token = await refresh();
      if (!token) {
        setStatus('signedOut');
        return 'signedOut';
      }
      setStatus('signedIn');
      return 'signedIn';
    },

    login,

    /**
     * Registration does not return tokens (API_SPEC §16.1): the client registers, then logs in
     * with the same credentials so the customer can verify their phone.
     */
    async register(input: RegisterRequest): Promise<CurrentUser> {
      await publicAuth.register(input);
      return login({ identifier: input.email, password: input.password });
    },

    me: () => auth.me(),

    /** Revokes the server session when possible; always clears local credentials. */
    async logout(): Promise<void> {
      try {
        if (accessToken) await auth.logout();
      } catch {
        // The local session is discarded regardless; the server session expires on its own.
      } finally {
        await forget();
      }
    },
  };
}

export type Session = ReturnType<typeof createSession>;
