/**
 * Public, non-secret configuration. `NEXT_PUBLIC_*` values are embedded in the browser bundle —
 * never put secrets here.
 */
export const env = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000',
} as const;
