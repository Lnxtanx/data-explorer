import { useState, useMemo } from 'react';
import { Search, CheckCircle2, XCircle, FileText, Loader2, Copy, Check, Clock, Rows, RefreshCw, Terminal } from 'lucide-react';
import { PostgresIcon } from '@/components/data-explorer/shared/DatabaseEngineIcon';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useExecutionLogs } from '@/lib/api/connector';
import type { ExecutionEvent } from '@/lib/api/connector/types';

interface ConnectorExecutionLogsProps {
    connectionId?: string | null;
}

interface ParsedLogSummary {
    headline: string;
    secondary?: string;
    table?: string;
    category: 'QUERY' | 'SCHEMA' | 'EXPORT' | 'CONNECT';
}

function parseSqlSummary(sql: string | null | undefined, rawEventType: string): ParsedLogSummary {
    if (!sql) {
        return { headline: 'Database Connection Event', category: 'CONNECT' };
    }
    const clean = sql.trim();
    
    // Check if it's a schema query
    if (/information_schema|pg_catalog|pg_class|pg_indexes|pg_tables|pg_attribute/i.test(clean) || rawEventType === 'SCHEMA_PROBE') {
        if (/pg_indexes/i.test(clean)) {
            const m = clean.match(/tablename\s*=\s*'([^']+)'/i);
            return { headline: 'Inspect Table Indexes', secondary: m ? `Table: ${m[1]}` : undefined, table: m ? m[1] : undefined, category: 'SCHEMA' };
        }
        if (/table_name/i.test(clean) || /table_schema/i.test(clean)) {
            return { headline: 'Discover Tables & Schemas', secondary: 'information_schema.tables', category: 'SCHEMA' };
        }
        if (/columns/i.test(clean)) {
            const m = clean.match(/table_name\s*=\s*'([^']+)'/i);
            return { headline: 'Inspect Column Metadata', secondary: m ? `Table: ${m[1]}` : undefined, table: m ? m[1] : undefined, category: 'SCHEMA' };
        }
        return { headline: 'Schema Catalog Probe', secondary: 'System catalog query', category: 'SCHEMA' };
    }
    
    // Extract table name from "FROM <table_name>" or "FROM "<schema>"."<table_name>""
    const fromMatch = clean.match(/FROM\s+(?:"?[\w]+"?\.)?"?([\w]+)"?/i);
    const table = fromMatch ? fromMatch[1] : undefined;
    
    if (/^SELECT\s+count\(/i.test(clean)) {
        return { headline: `COUNT FROM ${table || 'table'}`, secondary: clean, table, category: 'QUERY' };
    }
    
    if (table) {
        return { headline: `SELECT FROM ${table}`, secondary: clean, table, category: 'QUERY' };
    }
    
    return { headline: clean.slice(0, 60), secondary: clean, category: 'QUERY' };
}

export function ConnectorExecutionLogs({ connectionId = null }: ConnectorExecutionLogsProps) {
    const { data: realEvents = [], isLoading, isFetching, refetch } = useExecutionLogs(connectionId);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedType, setSelectedType] = useState<string>('ALL');
    const [inspectedLog, setInspectedLog] = useState<{ event: ExecutionEvent; parsed: ParsedLogSummary } | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const parsedLogs = useMemo(() => {
        return realEvents.map((log) => {
            const sql = log.query_sql || (log.metadata as any)?.sql || null;
            const parsed = parseSqlSummary(sql, log.event_type);
            return { log, parsed, sql };
        });
    }, [realEvents]);

    const filteredLogs = useMemo(() => {
        return parsedLogs.filter(({ log, parsed, sql }) => {
            // Category filter
            if (selectedType !== 'ALL') {
                if (selectedType === 'QUERY' && parsed.category !== 'QUERY') return false;
                if (selectedType === 'SCHEMA' && parsed.category !== 'SCHEMA' && log.event_type !== 'SCHEMA_PROBE') return false;
                if (selectedType === 'EXPORT' && parsed.category !== 'EXPORT' && log.event_type !== 'EXPORT') return false;
                if (selectedType === 'CONNECT' && parsed.category !== 'CONNECT') return false;
            }

            // Search filter
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const sqlText = (sql || '').toLowerCase();
                const headline = parsed.headline.toLowerCase();
                const table = (parsed.table || '').toLowerCase();
                const typeStr = (log.event_type || '').toLowerCase();
                return sqlText.includes(q) || headline.includes(q) || table.includes(q) || typeStr.includes(q);
            }

            return true;
        });
    }, [parsedLogs, selectedType, searchQuery]);

    const counts = useMemo(() => {
        const c = { ALL: parsedLogs.length, QUERY: 0, SCHEMA: 0, EXPORT: 0, CONNECT: 0 };
        for (const item of parsedLogs) {
            if (item.parsed.category === 'QUERY') c.QUERY++;
            else if (item.parsed.category === 'SCHEMA' || item.log.event_type === 'SCHEMA_PROBE') c.SCHEMA++;
            else if (item.parsed.category === 'EXPORT' || item.log.event_type === 'EXPORT') c.EXPORT++;
            else if (item.parsed.category === 'CONNECT') c.CONNECT++;
        }
        return c;
    }, [parsedLogs]);

    const handleCopySql = (e: React.MouseEvent, id: string, sql: string) => {
        e.stopPropagation();
        navigator.clipboard.writeText(sql);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    return (
        <div className="p-6 space-y-3.5 flex flex-col h-full overflow-hidden w-full min-w-0 max-w-full">
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b shrink-0 pr-6">
                <div>
                    <h3 className="text-xl font-semibold tracking-tight">Execution Logs</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Real-time query execution telemetry, duration metrics, and audit history.
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetch()}
                    disabled={isFetching}
                    className="h-8 gap-1.5 text-xs rounded-lg shadow-xs shrink-0"
                >
                    <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin text-primary")} />
                    <span>Refresh</span>
                </Button>
            </div>

            {/* Filter Bar with Bounded Search Input */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 p-1.5 bg-muted/20 border rounded-xl shrink-0 min-w-0">
                <div className="flex items-center gap-1 overflow-x-auto min-w-0">
                    {[
                        { id: 'ALL', label: 'All', count: counts.ALL },
                        { id: 'QUERY', label: 'Queries', count: counts.QUERY },
                        { id: 'SCHEMA', label: 'Schema', count: counts.SCHEMA },
                        { id: 'EXPORT', label: 'Export', count: counts.EXPORT },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setSelectedType(tab.id)}
                            className={cn(
                                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors font-medium whitespace-nowrap shrink-0",
                                selectedType === tab.id
                                    ? "bg-background text-foreground shadow-xs font-semibold"
                                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                            )}
                        >
                            <span>{tab.label}</span>
                            {tab.count > 0 && (
                                <span className={cn(
                                    "px-1.5 py-0.2 rounded-full text-[10px] font-mono",
                                    selectedType === tab.id ? "bg-muted text-foreground" : "text-muted-foreground"
                                )}>
                                    {tab.count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                <div className="relative w-full sm:w-48 sm:max-w-xs shrink-0">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                    <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Filter SQL or table..."
                        className="pl-7 h-8 text-xs bg-background rounded-lg pr-3 w-full text-foreground"
                    />
                </div>
            </div>

            {/* Dedicated Box Component for Query Logs */}
            <Card className="border rounded-xl shadow-none overflow-hidden flex-1 flex flex-col min-h-0 w-full">
                <CardHeader className="py-2.5 px-4 border-b bg-muted/10 shrink-0 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                        <PostgresIcon className="w-3.5 h-3.5" />
                        <span>Recorded Query Executions</span>
                    </div>
                    <span className="text-[11px] font-mono text-muted-foreground">
                        {filteredLogs.length} {filteredLogs.length === 1 ? 'event' : 'events'}
                    </span>
                </CardHeader>
                <CardContent className="p-0 flex-1 min-h-0">
                    {isLoading ? (
                        <div className="h-[280px] flex flex-col items-center justify-center text-xs text-muted-foreground gap-2">
                            <Loader2 className="w-5 h-5 animate-spin text-primary" />
                            Loading execution logs...
                        </div>
                    ) : filteredLogs.length > 0 ? (
                        <ScrollArea className="h-[300px] w-full">
                            <div className="divide-y pr-1">
                                {filteredLogs.map(({ log, parsed, sql }) => {
                                    const date = new Date(log.created_at);
                                    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                                    const isSuccess = log.status === 'success';
                                    const duration = log.duration_ms ?? (log.metadata as any)?.duration_ms ?? 0;
                                    const rowCount = log.row_count ?? 0;

                                    return (
                                        <div
                                            key={log.id}
                                            onClick={() => setInspectedLog({ event: log, parsed })}
                                            className="px-4 py-2.5 hover:bg-muted/30 transition-colors cursor-pointer flex items-center justify-between gap-3 group text-xs w-full min-w-0"
                                        >
                                            {/* Left Status & Headline */}
                                            <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
                                                {isSuccess ? (
                                                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                                ) : (
                                                    <XCircle className="w-4 h-4 text-destructive shrink-0" />
                                                )}

                                                <Badge
                                                    variant="outline"
                                                    className={cn(
                                                        "text-[9.5px] uppercase px-1.5 py-0 shrink-0 font-semibold tracking-wide",
                                                        parsed.category === 'SCHEMA' ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900" :
                                                        parsed.category === 'EXPORT' ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-900" :
                                                        "bg-muted/40 text-foreground"
                                                    )}
                                                >
                                                    {parsed.category}
                                                </Badge>

                                                <span className="font-medium text-foreground truncate min-w-0 flex-1">
                                                    {parsed.headline}
                                                </span>

                                                {parsed.table && (
                                                    <span className="hidden md:inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-muted/60 text-[10px] text-muted-foreground shrink-0">
                                                        <PostgresIcon className="w-2.5 h-2.5" />
                                                        {parsed.table}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Right Side Telemetry Badges & Copy Action */}
                                            <div className="flex items-center gap-2.5 shrink-0 text-xs">
                                                {rowCount > 0 && (
                                                    <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded font-mono">
                                                        <Rows className="w-2.5 h-2.5 text-muted-foreground/70" />
                                                        {rowCount.toLocaleString()} rows
                                                    </span>
                                                )}

                                                <span className={cn(
                                                    "inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium font-mono tabular-nums",
                                                    duration < 200
                                                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                                        : duration < 1000
                                                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                                                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                                                )}>
                                                    <Clock className="w-2.5 h-2.5 opacity-80" />
                                                    {duration}ms
                                                </span>

                                                <span className="text-muted-foreground/60 text-[10px] font-mono hidden sm:inline">
                                                    {timeStr}
                                                </span>

                                                {sql ? (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => handleCopySql(e, log.id, sql)}
                                                        className="p-1 rounded hover:bg-muted text-muted-foreground/60 hover:text-foreground transition-colors shrink-0"
                                                        title="Copy SQL query"
                                                    >
                                                        {copiedId === log.id ? (
                                                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                                                        ) : (
                                                            <Copy className="w-3.5 h-3.5" />
                                                        )}
                                                    </button>
                                                ) : (
                                                    <div className="w-5 shrink-0" />
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </ScrollArea>
                    ) : (
                        <div className="h-[280px] flex flex-col items-center justify-center p-8 text-xs text-muted-foreground gap-1.5 text-center">
                            <Terminal className="w-6 h-6 text-muted-foreground/40 mb-1" />
                            <span>No execution logs found matching your filter criteria.</span>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Inspector Modal (Opens on Click) */}
            {inspectedLog && (
                <div className="p-3.5 rounded-xl border bg-background space-y-2.5 shadow-xs shrink-0">
                    <div className="flex items-center justify-between border-b pb-1.5">
                        <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-primary" />
                            Log Detail — {inspectedLog.parsed.headline}
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[11px] px-2 rounded-md"
                            onClick={() => setInspectedLog(null)}
                        >
                            Close
                        </Button>
                    </div>
                    {inspectedLog.event.query_sql && (
                        <div>
                            <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Executed SQL Query</div>
                            <pre className="p-2.5 bg-muted/30 rounded-lg font-mono text-xs overflow-x-auto text-foreground border whitespace-pre-wrap max-h-28">
                                {inspectedLog.event.query_sql}
                            </pre>
                        </div>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                        <div className="p-1.5 rounded bg-muted/20 border">
                            <div className="text-[10px] text-muted-foreground">Duration</div>
                            <div className="font-semibold text-foreground">{inspectedLog.event.duration_ms || 0}ms</div>
                        </div>
                        <div className="p-1.5 rounded bg-muted/20 border">
                            <div className="text-[10px] text-muted-foreground">Status</div>
                            <div className="font-semibold text-emerald-600 capitalize">{inspectedLog.event.status}</div>
                        </div>
                        <div className="p-1.5 rounded bg-muted/20 border">
                            <div className="text-[10px] text-muted-foreground">Rows</div>
                            <div className="font-semibold text-foreground">{inspectedLog.event.row_count || 0}</div>
                        </div>
                        <div className="p-1.5 rounded bg-muted/20 border">
                            <div className="text-[10px] text-muted-foreground">Connection</div>
                            <div className="font-semibold text-foreground truncate">{inspectedLog.event.connection_id || 'default'}</div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
