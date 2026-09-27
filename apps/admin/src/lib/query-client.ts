import { shouldRetryQuery } from '@quickbite/api-client';
import { QueryClient } from '@tanstack/react-query';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetryQuery, staleTime: 15_000 },
      // Administrative actions are never retried automatically.
      mutations: { retry: false },
    },
  });
}
