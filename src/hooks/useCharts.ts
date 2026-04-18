// =============================================================================
// useCharts
// React Query hooks for AI chart generation and saved chart management.
//
// Hooks exported:
//   useSavedCharts    — query: list user's saved charts
//   useGenerateChart  — mutation: ask AI to generate a chart
//   useSaveChart      — mutation: persist a generated chart
//   useDeleteChart    — mutation: delete a saved chart (invalidates list)
// =============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import {
    generateChart,
    saveChart,
    listCharts,
    deleteChart,
    type GeneratedChart,
    type SavedChart,
    type ListChartsResponse,
} from '../lib/api/ai/charts';
import type { TableContext } from '../lib/api/ai';

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const chartQueryKeys = {
    all: ['ai', 'charts'] as const,
    list: (connectionId?: string) => ['ai', 'charts', 'list', connectionId ?? 'all'] as const,
};

// =============================================================================
// useSavedCharts
// Fetch the user's saved charts, optionally scoped to a connection.
// =============================================================================

export function useSavedCharts(connectionId?: string) {
    return useQuery<ListChartsResponse, Error>({
        queryKey: chartQueryKeys.list(connectionId),
        queryFn: () => listCharts({ connectionId, limit: 50 }),
        staleTime: 30_000,
        gcTime: 5 * 60_000,
    });
}

// =============================================================================
// useGenerateChart
// Ask the AI to generate a chart config from a natural language prompt.
// =============================================================================

export function useGenerateChart() {
    return useMutation<GeneratedChart, Error, {
        connectionId: string;
        prompt: string;
        tableContext?: TableContext;
        schemaName?: string;
    }>({
        mutationFn: generateChart,
    });
}

// =============================================================================
// useSaveChart
// Persist a generated chart to the user's saved charts.
// =============================================================================

export function useSaveChart() {
    const queryClient = useQueryClient();

    return useMutation<SavedChart, Error, {
        connectionId: string;
        title: string;
        chartType: string;
        config: import('../lib/api/ai/charts').ChartConfig;
        sql: string;
        schemaName?: string;
        tags?: string[];
    }>({
        mutationFn: saveChart,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: chartQueryKeys.all });
        },
    });
}

// =============================================================================
// useDeleteChart
// Delete a saved chart. Invalidates the saved charts list on success.
// =============================================================================

export function useDeleteChart() {
    const queryClient = useQueryClient();

    return useMutation<{ success: boolean }, Error, string>({
        mutationFn: (chartId: string) => deleteChart(chartId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: chartQueryKeys.all });
        },
    });
}
