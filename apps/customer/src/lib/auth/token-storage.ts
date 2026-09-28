import * as SecureStore from 'expo-secure-store';

/**
 * Persists the refresh token in secure device storage (Keychain / Android Keystore) only —
 * never AsyncStorage, logs or Zustand persistence (apps/customer/README.md "Authentication").
 * The short-lived access token is kept in memory and never written to disk.
 */
export interface TokenStorage {
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(token: string): Promise<void>;
  clear(): Promise<void>;
}

const REFRESH_TOKEN_KEY = 'quickbite.refreshToken';

export const secureTokenStorage: TokenStorage = {
  getRefreshToken: () => SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
  setRefreshToken: (token) => SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token),
  clear: () => SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
};
