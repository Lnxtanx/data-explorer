export const CHART_COLORS = [
    '#6366f1', '#22d3ee', '#f59e0b', '#10b981',
    '#f43f5e', '#a78bfa', '#34d399', '#fb923c',
];

export type ChartType =
    | 'table' | 'bar' | 'line' | 'pie'
    | 'heatmap' | 'funnel' | 'scatter'
    | 'stats' | 'anomalies' | 'quality' | 'joins' | 'metrics'
    | 'executive' | 'diagram'
    | 'chart' | 'stat_block' | 'report' | 'file' | 'suggestions' | 'analysis_plan' | 'slide_deck';

export function isNumericColumn(rows: Record<string, unknown>[], key: string): boolean {
    const vals = rows.slice(0, 15).map(r => r[key]);
    const nonNull = vals.filter(v => v !== null && v !== undefined);
    if (nonNull.length === 0) return false;
    return nonNull.every(v => !isNaN(Number(v)));
}

export function isDateColumn(key: string): boolean {
    return /date|time|created|updated|_at$/i.test(key);
}

export function detectChartType(
    rows: Record<string, unknown>[],
    columns: { name: string }[],
): ChartType {
    if (!rows?.length || rows.length > 200 || !columns?.length) return 'table';
    // Wide tables (>5 cols) are raw/row data — never auto-chart them.
    if (columns.length > 5) return 'table';
    const numCols = columns.filter(c => isNumericColumn(rows, c.name));
    const labelCols = columns.filter(c => !isNumericColumn(rows, c.name));
    if (numCols.length === 0) return 'table';
    // Prefer bar over pie — bar renders correctly for all numeric data including counts,
    // while pie can render blank when values are all equal or very small.
    if (labelCols.length === 1 && numCols.length === 1 && rows.length <= 8) return 'bar';
    // 'line' only for clear 2-column time series: exactly one date label + one metric.
    // Prevents triggering on raw tables that happen to have a date column + any numeric.
    if (labelCols.length === 1 && isDateColumn(labelCols[0].name) && numCols.length === 1) return 'line';
    if (labelCols.length >= 1 && numCols.length >= 1 && rows.length <= 40) return 'bar';
    return 'table';
}
