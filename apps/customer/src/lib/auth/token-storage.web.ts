import { type TokenStorage } from './token-storage';

/**
 * Web build (local preview only): browsers have no secure-storage equivalent to Keychain /
 * Keystore, and tokens must never go to plain storage such as localStorage
 * (apps/customer/README.md "Authentication"). The refresh token is therefore kept in memory:
 * a page reload signs the user out.
 */
let refreshToken: string | null = null;

export const secureTokenStorage: TokenStorage = {
  getRefreshToken: () => Promise.resolve(refreshToken),
  setRefreshToken: (token) => {
    refreshToken = token;
    return Promise.resolve();
  },
  clear: () => {
    refreshToken = null;
    return Promise.resolve();
  },
};
