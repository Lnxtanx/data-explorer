// =============================================================================
// Data Explorer React Query Hooks
// =============================================================================

import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { DATA_EXPLORER_QUERY_ROOT } from '@/shared/lib/queryRoots';
import {
  fetchSchemas,
  fetchTableList,
  fetchTableRows,
  fetchColumnStats,
  fetchTableSchema,
} from './api';
import type { TableRowsParams } from './types';

// =============================================================================
// Query Keys
// =============================================================================

export const dataExplorerKeys = {
    all: [DATA_EXPLORER_QUERY_ROOT] as const,
  schemas: (connectionId: string) => [...dataExplorerKeys.all, 'schemas', connectionId] as const,
  tables: (connectionId: string, schemaName: string) =>
    [...dataExplorerKeys.all, 'tables', connectionId, schemaName] as const,
  rows: (connectionId: string, tableName: string) => 
    [...dataExplorerKeys.all, 'rows', connectionId, tableName] as const,
  stats: (connectionId: string, tableName: string, schemaName: string) =>
    [...dataExplorerKeys.all, 'stats', connectionId, tableName, schemaName] as const,
  schema: (connectionId: string, tableName: string, schemaName: string) =>
    [...dataExplorerKeys.all, 'schema', connectionId, tableName, schemaName] as const,
};

// =============================================================================
// Schema List Hook
// =============================================================================

export function useSchemas(connectionId: string | null) {
  return useQuery({
    queryKey: dataExplorerKeys.schemas(connectionId || ''),
    queryFn: () => fetchSchemas(connectionId!),
    enabled: !!connectionId,
    staleTime: 60_000, // 1 minute (schemas rarely change)
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
    refetchOnReconnect: true,
  });
}

// =============================================================================
// Table List Hook
// =============================================================================

export function useTableList(connectionId: string | null, schemaName: string = 'public') {
  return useQuery({
    queryKey: dataExplorerKeys.tables(connectionId || '', schemaName),
    queryFn: () => fetchTableList(connectionId!, schemaName),
    enabled: !!connectionId,
    staleTime: 30_000, // 30 seconds
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
    refetchOnReconnect: true,
  });
}

// =============================================================================
// Table Rows Hook (with infinite scroll support)
// =============================================================================

export function useTableRows(
  connectionId: string | null,
  tableName: string | null,
  params: Omit<TableRowsParams, 'cursor'> = {}
) {
  return useInfiniteQuery({
    queryKey: [...dataExplorerKeys.rows(connectionId || '', tableName || ''), params],
    queryFn: ({ pageParam }) => fetchTableRows(connectionId!, tableName!, {
      ...params,
      cursor: pageParam,
    }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.pagination.nextCursor,
    maxPages: 5,
    enabled: !!connectionId && !!tableName,
    staleTime: 60_000, // 1 minute (rows only refetch in background on revisit)
    gcTime: 30 * 60_000, // keep visited tables in memory for 30 minutes
    placeholderData: (prevData, prevQuery) =>
      prevData && prevQuery &&
      prevQuery.queryKey[2] === connectionId &&
      prevQuery.queryKey[3] === tableName
        ? prevData
        : undefined,
  });
}

// =============================================================================
// Table Rows Hook (simple pagination)
// =============================================================================

export function useTableRowsSimple(
  connectionId: string | null,
  tableName: string | null,
  params: TableRowsParams = {}
) {
  return useQuery({
    queryKey: [...dataExplorerKeys.rows(connectionId || '', tableName || ''), params],
    queryFn: () => fetchTableRows(connectionId!, tableName!, params),
    enabled: !!connectionId && !!tableName,
    staleTime: 60_000, // 1 minute (rows only refetch in background on revisit)
    gcTime: 30 * 60_000, // keep visited tables in memory for 30 minutes
    placeholderData: (prevData, prevQuery) =>
      prevData && prevQuery &&
      prevQuery.queryKey[2] === connectionId &&
      prevQuery.queryKey[3] === tableName
        ? prevData
        : undefined,
  });
}

// =============================================================================
// Column Stats Hook
// =============================================================================

export function useColumnStats(
  connectionId: string | null,
  tableName: string | null,
  schemaName: string = 'public',
  column?: string | null
) {
  return useQuery({
    queryKey: [...dataExplorerKeys.stats(connectionId || '', tableName || '', schemaName), column ?? 'all'],
    queryFn: () => fetchColumnStats(connectionId!, tableName!, schemaName, column || undefined),
    enabled: !!connectionId && !!tableName,
    staleTime: 60_000, // 1 minute (stats are expensive)
  });
}

// =============================================================================
// Header Distribution Profiles Hook
// Cheap pg_stats-only profile for every column of a table, used to render the
// inline distribution bar under column headers (single relay query).
// =============================================================================

export function useColumnHeaderProfiles(
  connectionId: string | null,
  tableName: string | null,
  schemaName: string = 'public'
) {
  return useQuery({
    queryKey: [...dataExplorerKeys.all, 'header-profiles', connectionId || '', tableName || '', schemaName],
    queryFn: () => fetchColumnStats(connectionId!, tableName!, schemaName, undefined, 'pg_stats'),
    enabled: !!connectionId && !!tableName,
    staleTime: 60_000,
  });
}

// =============================================================================
// Table Schema Hook
// =============================================================================

export function useTableSchema(
  connectionId: string | null,
  tableName: string | null,
  schemaName: string = 'public'
) {
  return useQuery({
    queryKey: dataExplorerKeys.schema(connectionId || '', tableName || '', schemaName),
    queryFn: () => fetchTableSchema(connectionId!, tableName!, schemaName),
    enabled: !!connectionId && !!tableName,
    staleTime: 60_000, // 1 minute
  });
}

// =============================================================================
// Prefetch Hooks
// =============================================================================

export function usePrefetchTableRows() {
  const queryClient = useQueryClient();
  
  return (connectionId: string, tableName: string, params: TableRowsParams = {}) => {
    queryClient.prefetchQuery({
      queryKey: [...dataExplorerKeys.rows(connectionId, tableName), params],
      queryFn: () => fetchTableRows(connectionId, tableName, params),
    });
  };
}

export function usePrefetchColumnStats() {
  const queryClient = useQueryClient();
  
  return (connectionId: string, tableName: string, schemaName: string = 'public', column?: string) => {
    queryClient.prefetchQuery({
      queryKey: [...dataExplorerKeys.stats(connectionId, tableName, schemaName), column ?? 'all'],
      queryFn: () => fetchColumnStats(connectionId, tableName, schemaName, column || undefined),
    });
  };
}
