// =============================================================================
// Data Explorer React Query Hooks
// =============================================================================

import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
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
  all: ['data-explorer'] as const,
  schemas: (connectionId: string) => [...dataExplorerKeys.all, 'schemas', connectionId] as const,
  tables: (connectionId: string) => [...dataExplorerKeys.all, 'tables', connectionId] as const,
  rows: (connectionId: string, tableName: string) => 
    [...dataExplorerKeys.all, 'rows', connectionId, tableName] as const,
  stats: (connectionId: string, tableName: string) => 
    [...dataExplorerKeys.all, 'stats', connectionId, tableName] as const,
  schema: (connectionId: string, tableName: string) => 
    [...dataExplorerKeys.all, 'schema', connectionId, tableName] as const,
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
  });
}

// =============================================================================
// Table List Hook
// =============================================================================

export function useTableList(connectionId: string | null, schemaName: string = 'public') {
  return useQuery({
    queryKey: dataExplorerKeys.tables(connectionId || ''),
    queryFn: () => fetchTableList(connectionId!, schemaName),
    enabled: !!connectionId,
    staleTime: 30_000, // 30 seconds
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
    enabled: !!connectionId && !!tableName,
    staleTime: 10_000, // 10 seconds
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
    staleTime: 10_000, // 10 seconds
  });
}

// =============================================================================
// Column Stats Hook
// =============================================================================

export function useColumnStats(
  connectionId: string | null,
  tableName: string | null,
  schemaName: string = 'public'
) {
  return useQuery({
    queryKey: dataExplorerKeys.stats(connectionId || '', tableName || ''),
    queryFn: () => fetchColumnStats(connectionId!, tableName!, schemaName),
    enabled: !!connectionId && !!tableName,
    staleTime: 60_000, // 1 minute (stats are expensive)
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
    queryKey: dataExplorerKeys.schema(connectionId || '', tableName || ''),
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
  
  return (connectionId: string, tableName: string, schemaName: string = 'public') => {
    queryClient.prefetchQuery({
      queryKey: dataExplorerKeys.stats(connectionId, tableName),
      queryFn: () => fetchColumnStats(connectionId, tableName, schemaName),
    });
  };
}
