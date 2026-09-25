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
//
// Phase 1: removed `user.session`, the whole `files` factory, and the
// `connections` factory — all had zero consumers.
//
// The `connections` removal matters most: it was a SECOND, disagreeing
// definition of the same namespace. The live one is `connectionKeys` in
// lib/api/data/connection, which scopes the list key by user
// (['connections','list', userId]). The dead one here produced
// ['connections','list'] with no user segment, so the two could not be
// reconciled by prefix matching and would silently disagree on identity.
//
// Phase 3 folds the remaining factories into one shared/query/queryKeys root.
// =============================================================================

export const queryKeys = {
  user: {
    all:      ['user'] as const,
    profile:  ['user', 'profile'] as const,
  },
  payments: {
    all:          ['payments'] as const,
    plans:        ['payments', 'plans'] as const,
    subscription: ['payments', 'subscription'] as const,
    usage:        ['payments', 'usage'] as const,
    history:      (userId: string) => ['payments', 'history', userId] as const,
    invoices:     ['payments', 'invoices'] as const,
  },
  /**
   * The legacy duplicate subscription fetch.
   *
   * Phase 3: `useUserProfile` queries `/api/payments/subscription` under the bare
   * key ['subscription'] while `usePayments` queries the SAME endpoint under
   * ['payments','subscription'] — so the subscription is fetched and cached
   * twice, under two keys, with no invalidation path keeping them in sync.
   * usePayments and PlansSettings both invalidated this literal while the query
   * lived in a third file.
   *
   * The two are reconciled in Phase 4, when useUserProfile stops fetching the
   * subscription and consumes usePayments.useSubscription instead. Until then
   * this key must stay exactly ['subscription'] so the existing invalidations
   * keep matching, which is why it lives here rather than being renamed.
   */
  legacySubscription: ['subscription'] as const,
  /**
   * AI credit quota poll, owned by useAIUsage.
   *
   * Phase 3: previously the bare literal ['ai-usage'] in three files — the
   * query in useAIUsage, and invalidations in usePayments (billing) and
   * PlansSettings. Billing invalidating a key owned by the AI module is a real
   * cross-domain coupling; the key now has one owner and is imported.
   */
  aiUsage: ['ai-usage'] as const,
} as const;
