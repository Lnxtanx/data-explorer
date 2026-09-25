import React from 'react';
import {
    Database, Table2, Search, Hash, BarChart2,
    GitMerge, TrendingUp, AlertTriangle, Layers,
    FileText, Code2, Download,
    Globe, Brain, Bookmark, FolderSearch,
    LineChart, Split, ShieldCheck, Repeat,
    Users, UserCheck, Filter, HelpCircle, Sparkles, Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── 18 Tools from backend-ai/src/tools/data_explorer/de_registry.py ─────────

const TOOL_CONFIG: Record<string, { label: string; icon: React.ElementType; color?: string }> = {
    // Core (1)
    run_query: { label: 'Query Database', icon: Database, color: 'text-blue-500' },

    // Export (2)
    export: { label: 'Export Data', icon: Download, color: 'text-emerald-500' },
    get_report_html: { label: 'View Report', icon: FileText, color: 'text-orange-500' },

    // Always-on (5)
    ask_clarification: { label: 'Ask Clarification', icon: HelpCircle, color: 'text-amber-500' },
    web_search: { label: 'Web Search', icon: Globe, color: 'text-sky-500' },
    search_memory: { label: 'Search Memory', icon: Brain, color: 'text-purple-500' },
    save_fact: { label: 'Save Fact', icon: Bookmark, color: 'text-amber-500' },
    search_artifacts: { label: 'Search Artifacts', icon: FolderSearch, color: 'text-violet-500' },

    // Specialized Analytics (10)
    compute_correlation: { label: 'Correlation Analysis', icon: Activity, color: 'text-cyan-500' },
    forecast_trend: { label: 'Forecast Trend', icon: TrendingUp, color: 'text-blue-500' },
    compute_regression: { label: 'Regression Analysis', icon: LineChart, color: 'text-indigo-500' },
    compare_segments: { label: 'Compare Segments', icon: Split, color: 'text-orange-500' },
    detect_anomalies: { label: 'Detect Anomalies', icon: AlertTriangle, color: 'text-amber-500' },
    check_quality: { label: 'Check Data Quality', icon: ShieldCheck, color: 'text-teal-500' },
    detect_seasonality: { label: 'Detect Seasonality', icon: Repeat, color: 'text-rose-500' },
    compute_cohort: { label: 'Cohort Analysis', icon: Users, color: 'text-purple-500' },
    compute_retention: { label: 'Retention Analysis', icon: UserCheck, color: 'text-emerald-500' },
    compute_funnel: { label: 'Funnel Analysis', icon: Filter, color: 'text-indigo-500' },

    // Thinking pseudo-tool
    thinking: { label: 'Thinking', icon: Sparkles, color: 'text-indigo-400' },

    // Dashboard AI Tools
    get_schema_context: { label: 'Get Schema Context', icon: Code2, color: 'text-indigo-500' },
    save_dashboard: { label: 'Save Dashboard', icon: BarChart2, color: 'text-primary' },
    edit_panel: { label: 'Edit Panel', icon: BarChart2, color: 'text-amber-500' },
    add_panel: { label: 'Add Panel', icon: BarChart2, color: 'text-emerald-500' },
    remove_panel: { label: 'Remove Panel', icon: BarChart2, color: 'text-rose-500' },

    // Legacy / historical session fallbacks
    list_tables: { label: 'List Tables', icon: Database, color: 'text-blue-500' },
    get_schema: { label: 'Table Schema', icon: Layers, color: 'text-slate-500' },
    sample_rows: { label: 'Sample Rows', icon: Table2, color: 'text-blue-500' },
    count_rows: { label: 'Count Rows', icon: Hash, color: 'text-slate-500' },
    get_column_stats: { label: 'Column Stats', icon: BarChart2, color: 'text-cyan-500' },
    search_rows: { label: 'Search Rows', icon: Search, color: 'text-sky-500' },
    find_join_paths: { label: 'Join Paths', icon: GitMerge, color: 'text-violet-500' },
    infer_metrics: { label: 'Infer Metrics', icon: TrendingUp, color: 'text-indigo-500' },
};

export function ToolIcon({ name, className }: { name: string; className?: string }) {
    const config = TOOL_CONFIG[name];
    const Icon = config?.icon ?? Code2;
    return <Icon className={cn('w-3.5 h-3.5 shrink-0', className)} />;
}

export function toolLabel(name: string): string {
    if (TOOL_CONFIG[name]) {
        return TOOL_CONFIG[name].label;
    }
    return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const UNSAFE_PREVIEW_KEYS = new Set([
    'connection_id', 'connectionId', 'sql', 'query', 'user_id', 'session_id',
    'run_id', 'dashboard_id', 'config', 'html_template', 'panels', 'sections',
]);

export function getToolKeyParam(name: string, input?: Record<string, unknown>): string | null {
    if (!input || Object.keys(input).length === 0) return null;

    if (name === 'save_dashboard' && input.title) {
        const title = String(input.title).trim();
        return title.length > 35 ? title.slice(0, 35) + '…' : title;
    }
    if ((name === 'edit_panel' || name === 'remove_panel') && (input.panel_key || input.panelKey)) {
        return String(input.panel_key || input.panelKey);
    }
    if (name === 'add_panel' && (input.title || input.panel_key)) {
        return String(input.title || input.panel_key);
    }
    if (name === 'get_schema_context') {
        if (input.tables) return String(input.tables);
        return input.table_names ? String(input.table_names) : null;
    }
    if (name === 'run_query') {
        // SQL is never previewed in the UI.
        return null;
    }
    if (name === 'export') {
        const fmt = input.format ? String(input.format).toUpperCase() : 'FILE';
        const file = input.filename ? ` (${input.filename})` : '';
        return `${fmt}${file}`;
    }
    if (name === 'get_report_html' && input.name) {
        return String(input.name);
    }
    if ((name === 'web_search' || name === 'search_memory') && input.query) {
        const q = String(input.query).trim();
        return `"${q.length > 30 ? q.slice(0, 30) + '…' : q}"`;
    }
    if (name === 'save_fact' && input.fact) {
        const f = String(input.fact).trim();
        return `"${f.length > 30 ? f.slice(0, 30) + '…' : f}"`;
    }
    if (name === 'ask_clarification' && input.question) {
        const q = String(input.question).trim();
        return `"${q.length > 30 ? q.slice(0, 30) + '…' : q}"`;
    }
    if (input.table_name || input.table) {
        const tbl = String(input.table_name || input.table);
        if (input.metric_column) return `${tbl} · ${input.metric_column}`;
        if (input.target_column) return `${tbl} · ${input.target_column}`;
        if (input.segment_column) return `${tbl} · ${input.segment_column}`;
        return tbl;
    }
    if (input.target_column) return String(input.target_column);
    if (input.metric_column) return String(input.metric_column);
    if (input.column) return String(input.column);

    // Fallback: first safe primitive entry (never sql / connection / id keys).
    const entries = Object.entries(input).filter(
        ([k, v]) =>
            !UNSAFE_PREVIEW_KEYS.has(k) &&
            !/(^|_)(id|uuid|token|secret)$/i.test(k) &&
            (typeof v === 'string' || typeof v === 'number')
    );
    if (entries.length > 0) {
        const str = String(entries[0][1]);
        return str.length > 30 ? str.slice(0, 30) + '…' : str;
    }
    return null;
}

