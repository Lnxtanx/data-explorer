/**
 * Minimal tool icon mapping — uses only subtle, professional icons.
 * Tools without a specific icon get a generic Code2.
 */
import {
    Database, Table2, Search, Play, Hash, BarChart2,
    GitMerge, TrendingUp, AlertTriangle, Layers,
    FileText, MessageSquare, Code2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const TOOL_ICON_MAP: Record<string, React.ElementType> = {
    list_tables: Database,
    get_schema: Layers,
    sample_rows: Table2,
    run_query: Code2,
    count_rows: Hash,
    get_column_stats: BarChart2,
    search_rows: Search,
    detect_anomalies: AlertTriangle,
    check_quality: FileText,
    find_join_paths: GitMerge,
    infer_metrics: TrendingUp,
    ask_clarification: MessageSquare,
};

export function ToolIcon({ name, className }: { name: string; className?: string }) {
    const Icon = TOOL_ICON_MAP[name] ?? Code2;
    return <Icon className={cn('w-3.5 h-3.5 shrink-0 opacity-50', className)} />;
}

export function toolLabel(name: string): string {
    return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
