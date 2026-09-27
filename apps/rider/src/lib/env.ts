/**
 * Public, non-secret runtime configuration. Only `EXPO_PUBLIC_*` variables are embedded in the
 * app bundle — never put secrets here (INFRASTRUCTURE_RULES §21).
 */
const DEFAULT_DEV_API_URL = 'http://localhost:3000';

export const env = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_DEV_API_URL,
} as const;
