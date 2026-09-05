// =============================================================================
// React Query Client Configuration
// Centralized query client with sensible defaults and query key factory
// =============================================================================

import { QueryClient } from '@tanstack/react-query';
import { explorerQueryPersister } from './persist';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,            // 60s default
      gcTime: 5 * 60 * 1000,           // 5min garbage collection
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
      refetchOnWindowFocus: false,     // focus is not a data-change signal; prevents refetch storms on infinite lists
      persister: explorerQueryPersister,
    },
    mutations: {
      retry: 1,
    },
  },
});

// =============================================================================
// Query Keys Factory
// Prevents typos and enables type-safe invalidation
// =============================================================================

export const queryKeys = {
  user: {
    all:      ['user'] as const,
    profile:  ['user', 'profile'] as const,
    session:  ['user', 'session'] as const,
  },
  files: {
    all:      ['files'] as const,
    list:     (userId: string) => ['files', 'list', userId] as const,
    detail:   (id: string) => ['files', 'detail', id] as const,
  },
  connections: {
    all:      ['connections'] as const,
    list:     ['connections', 'list'] as const,
    detail:   (id: string) => ['connections', id] as const,
  },
  payments: {
    all:          ['payments'] as const,
    plans:        ['payments', 'plans'] as const,
    subscription: ['payments', 'subscription'] as const,
    usage:        ['payments', 'usage'] as const,
    history:      (userId: string) => ['payments', 'history', userId] as const,
    invoices:     ['payments', 'invoices'] as const,
  },
} as const;
