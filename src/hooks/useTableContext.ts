// =============================================================================
// useTableContext
// Builds a TableContext object from the data explorer's current table selection.
// Fetches live column + stats data from the backend for accurate AI context.
// =============================================================================

import { useQuery } from '@tanstack/react-query';
import { fetchTableSchema, fetchColumnStats } from '@/lib/api/data/explorer';
import type { TableContext, ColumnInfo } from '@/lib/api/ai';

interface UseTableContextParams {
    connectionId?: string;
    tableName?: string;
    schemaName?: string;
}

/**
 * Builds a TableContext for the AI chat panel by fetching live schema + stats.
 * Returns undefined if no table is selected or if connectionId is missing.
 */
export function useTableContext({
    connectionId,
    tableName,
    schemaName = 'public',
}: UseTableContextParams): TableContext | undefined {
    const enabled = Boolean(connectionId && tableName);

    // Fetch table schema (columns, PKs, indexes, FKs)
    const schemaQuery = useQuery({
        queryKey: ['table-schema', connectionId, schemaName, tableName],
        queryFn: () => fetchTableSchema(connectionId!, tableName!, schemaName),
        enabled,
        staleTime: 60_000,
        gcTime: 5 * 60_000,
    });

    // Fetch column stats (row count + sample values for AI context)
    const statsQuery = useQuery({
        queryKey: ['table-stats', connectionId, schemaName, tableName],
        queryFn: () => fetchColumnStats(connectionId!, tableName!, schemaName),
        enabled,
        staleTime: 60_000,
        gcTime: 5 * 60_000,
    });

    if (!connectionId || !tableName) return undefined;

    // Map schema columns to the ColumnInfo format expected by the AI service
    const columns: ColumnInfo[] = (schemaQuery.data?.columns ?? []).map(col => ({
        name: col.name,
        data_type: col.type,
        is_nullable: col.nullable ? 'YES' : 'NO',
        is_pk: col.is_pk,
    }));

    const stats = statsQuery.data
        ? {
            total_rows: statsQuery.data.totalRows,
            totalRows: statsQuery.data.totalRows,
          }
        : {};

    return {
        tableName,
        schemaName,
        columns: columns.length > 0 ? columns : undefined,
        stats,
    };
}
