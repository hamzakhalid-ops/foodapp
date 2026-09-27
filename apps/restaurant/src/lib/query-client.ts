import { shouldRetryQuery } from '@quickbite/api-client';
import { QueryClient } from '@tanstack/react-query';

/**
 * TanStack Query holds server state. Zustand is reserved for genuinely client-side state
 * (e.g. UI preferences) — never for authoritative data such as prices, totals or order status.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetryQuery,
        staleTime: 30_000,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
