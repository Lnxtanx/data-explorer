// =============================================================================
// Charts API Client
// Typed functions for AI chart generation and saved chart management.
// =============================================================================

import { apiRequest } from '../client';
import type { TableContext } from './index';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChartConfig {
    chartType: 'bar' | 'line' | 'area' | 'pie' | 'scatter';
    title: string;
    xAxisKey: string;
    yAxisKeys: string[];
    colorScheme?: string[];
}

export interface GeneratedChart {
    config: ChartConfig;
    sql: string;
    explanation: string;
    confidence: number;
}

export interface SavedChart {
    id: string;
    title: string;
    chartType: string;
    config: ChartConfig;
    sqlQuery: string;
    schemaName: string;
    tags: string[];
    pinned: boolean;
    createdAt: string;
}

export interface ListChartsResponse {
    charts: SavedChart[];
    total: number;
}

// ─── API Functions ────────────────────────────────────────────────────────────

/**
 * Ask the AI to generate a chart config + SQL from a natural language prompt.
 */
export async function generateChart(params: {
    connectionId: string;
    prompt: string;
    tableContext?: TableContext;
    schemaName?: string;
}): Promise<GeneratedChart> {
    return apiRequest<GeneratedChart>('/api/ai/charts/generate', {
        method: 'POST',
        body: JSON.stringify(params),
    });
}

/**
 * Save a generated chart for future use.
 */
export async function saveChart(params: {
    connectionId: string;
    title: string;
    chartType: string;
    config: ChartConfig;
    sql: string;
    schemaName?: string;
    tags?: string[];
}): Promise<SavedChart> {
    return apiRequest<SavedChart>('/api/ai/charts/save', {
        method: 'POST',
        body: JSON.stringify(params),
    });
}

/**
 * List the user's saved charts, optionally scoped to a connection.
 */
export async function listCharts(params?: {
    connectionId?: string;
    limit?: number;
}): Promise<ListChartsResponse> {
    const qs = new URLSearchParams();
    if (params?.connectionId) qs.set('connectionId', params.connectionId);
    if (params?.limit)        qs.set('limit', String(params.limit));

    const query = qs.toString() ? `?${qs.toString()}` : '';
    return apiRequest<ListChartsResponse>(`/api/ai/charts${query}`);
}

/**
 * Delete a saved chart.
 */
export async function deleteChart(chartId: string): Promise<{ success: boolean }> {
    return apiRequest<{ success: boolean }>(`/api/ai/charts/${chartId}`, {
        method: 'DELETE',
    });
}
