import { useMemo } from 'react';
import { Wifi, WifiOff, Plus, ArrowRight, Activity, Clock, Zap, ShieldCheck, Terminal, Server, CheckCircle2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useConnectors, useExecutionLogs, useHealthEvents } from '@/lib/api/connector';
import { DatabaseEngineIcon, PostgresIcon } from '@/components/data-explorer/shared/DatabaseEngineIcon';
import { cn } from '@/lib/utils';

interface ConnectorOverviewProps {
    onNavigate: (tab: string) => void;
}

export function ConnectorOverview({ onNavigate }: ConnectorOverviewProps) {
    const { data: connectors = [], isLoading: connectorsLoading } = useConnectors();
    const { data: logs = [], isLoading: logsLoading } = useExecutionLogs(null);
    const { data: healthData } = useHealthEvents(null);

    const totalConnectors = connectors.length;
    const onlineConnectors = connectors.filter((c) => c.is_online).length;
    const offlineConnectors = totalConnectors - onlineConnectors;
    const avgLatency = healthData?.averageLatencyMs || 0;
    const successRate = healthData?.successRate ?? 100;
    const totalQueries = logs.length;

    // Sort: Online connectors first, followed by offline
    const sortedConnectors = useMemo(() => {
        return [...connectors].sort((a, b) => {
            if (a.is_online && !b.is_online) return -1;
            if (!a.is_online && b.is_online) return 1;
            return 0;
        });
    }, [connectors]);

    const recentLogs = logs.slice(0, 4);

    return (
        <div className="p-6 space-y-4 flex flex-col h-full overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b shrink-0 pr-8">
                <div>
                    <h3 className="text-xl font-semibold tracking-tight">Connector Overview</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        System telemetry, active host proxies, and recent database queries.
                    </p>
                </div>
                <Button
                    size="sm"
                    onClick={() => onNavigate('connect')}
                    className="h-8 gap-1.5 text-xs rounded-lg shadow-sm shrink-0"
                >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Connector</span>
                </Button>
            </div>

            {/* Quick Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
                <div className="p-3 rounded-xl border bg-background space-y-1 shadow-sm">
                    <div className="flex items-center justify-between text-muted-foreground">
                        <span className="text-[10px] font-semibold uppercase tracking-wider">Connectors</span>
                        <PostgresIcon className="w-3.5 h-3.5" />
                    </div>
                    <div className="text-base font-semibold text-foreground pt-0.5">
                        {connectorsLoading ? '—' : `${totalConnectors} ${totalConnectors === 1 ? 'host' : 'hosts'}`}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span className={cn(
                            "w-1.5 h-1.5 rounded-full shrink-0",
                            onlineConnectors > 0 ? "bg-emerald-500" : totalConnectors > 0 ? "bg-amber-500" : "bg-muted-foreground/40"
                        )} />
                        {onlineConnectors > 0 ? (
                            <span>
                                {onlineConnectors} online{offlineConnectors > 0 && ` • ${offlineConnectors} offline`}
                            </span>
                        ) : totalConnectors > 0 ? (
                            <span>0 online • {totalConnectors} offline</span>
                        ) : (
                            <span>None registered</span>
                        )}
                    </div>
                </div>

                <div className="p-3 rounded-xl border bg-background space-y-1 shadow-sm">
                    <div className="flex items-center justify-between text-muted-foreground">
                        <span className="text-[10px] font-semibold uppercase tracking-wider">Relay Status</span>
                        <Server className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div className="flex items-center gap-1.5 pt-0.5">
                        <span className={cn(
                            "w-2 h-2 rounded-full shrink-0",
                            onlineConnectors > 0 ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                        )} />
                        <span className="text-base font-semibold text-foreground">
                            {onlineConnectors > 0 ? 'Active' : 'Standby'}
                        </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">
                        {onlineConnectors > 0
                            ? `${onlineConnectors} ${onlineConnectors === 1 ? 'host' : 'hosts'} online`
                            : totalConnectors > 0
                            ? 'connector offline'
                            : 'No connectors added'}
                    </p>
                </div>

                <div className="p-3 rounded-xl border bg-background space-y-1 shadow-sm">
                    <div className="flex items-center justify-between text-muted-foreground">
                        <span className="text-[10px] font-semibold uppercase tracking-wider">Avg Latency</span>
                        <Zap className="w-3.5 h-3.5 text-emerald-500" />
                    </div>
                    <div className="text-base font-semibold font-mono text-foreground pt-0.5">
                        {logs.length > 0 ? `${avgLatency}ms` : '—'}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                        {logs.length === 0
                            ? 'No queries recorded'
                            : avgLatency < 500
                            ? '⚡ Fast response'
                            : 'Normal response'}
                    </p>
                </div>

                <div className="p-3 rounded-xl border bg-background space-y-1 shadow-sm">
                    <div className="flex items-center justify-between text-muted-foreground">
                        <span className="text-[10px] font-semibold uppercase tracking-wider">Query Activity</span>
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                    </div>
                    <div className="text-base font-semibold text-foreground pt-0.5">
                        {logsLoading ? '—' : `${totalQueries} queries`}
                    </div>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                        {totalQueries > 0 ? `${successRate}% success rate` : 'Ready for queries'}
                    </p>
                </div>
            </div>

            {/* Registered Host Proxies Card */}
            <Card className="border rounded-xl shadow-none shrink-0 overflow-hidden">
                <CardHeader className="py-2.5 px-4 border-b bg-muted/10 shrink-0 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                        <PostgresIcon className="w-3.5 h-3.5" />
                        <span>Registered Host Proxies</span>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onNavigate('connectors')}
                        className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground gap-1"
                    >
                        <span>Manage Connectors</span>
                        <ArrowRight className="w-3 h-3" />
                    </Button>
                </CardHeader>
                <CardContent className="p-0">
                    {connectorsLoading ? (
                        <div className="py-8 text-center text-xs text-muted-foreground">
                            Loading connectors...
                        </div>
                    ) : sortedConnectors.length > 0 ? (
                        <div className="divide-y">
                            {sortedConnectors.map((connector) => (
                                <div
                                    key={connector.id}
                                    className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors text-xs"
                                >
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <div className={cn(
                                            'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border',
                                            connector.is_online
                                                ? 'bg-emerald-500/10 border-emerald-500/20'
                                                : 'bg-muted border-border'
                                        )}>
                                            <DatabaseEngineIcon
                                                engine="postgres"
                                                className="w-4 h-4"
                                                isOnline={connector.is_online}
                                                showStatusDot={true}
                                            />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="font-semibold text-foreground truncate">
                                                {connector.machine_label || 'Local Agent Proxy'}
                                            </p>
                                            <p className="text-[10px] text-muted-foreground font-mono truncate">
                                                {connector.agent_id}
                                                {!connector.is_online && connector.last_seen_at && (
                                                    <span className="text-muted-foreground/60 ml-2 font-sans">
                                                        • Last active {new Date(connector.last_seen_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        {connector.access_type === 'team' && (
                                            <Badge
                                                variant="outline"
                                                className="text-[9.5px] uppercase px-1.5 py-0 font-medium shrink-0 bg-primary/10 text-primary border-primary/20"
                                            >
                                                Team
                                            </Badge>
                                        )}
                                        <Badge
                                            variant="outline"
                                            className={cn(
                                                'text-[9.5px] uppercase px-1.5 py-0 font-medium shrink-0',
                                                connector.is_online
                                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                                            )}
                                        >
                                            {connector.is_online ? 'Online' : 'Offline'}
                                        </Badge>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => onNavigate('databases')}
                                            className="h-7 text-[11px] px-2.5 rounded-lg hidden sm:inline-flex"
                                        >
                                            Databases
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="p-8 text-center space-y-2">
                            <PostgresIcon className="w-8 h-8 mx-auto opacity-50" />
                            <p className="text-xs font-semibold text-foreground">No proxy connectors connected</p>
                            <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
                                Run <code className="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">sw-agent start</code> on your local PostgreSQL machine to begin.
                            </p>
                            <Button
                                size="sm"
                                onClick={() => onNavigate('connect')}
                                className="h-8 text-xs gap-1.5 mt-2 rounded-lg font-medium"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Connect Local Database</span>
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Recent Database Query Executions Snapshot */}
            <Card className="border rounded-xl shadow-none shrink-0 overflow-hidden">
                <CardHeader className="py-2.5 px-4 border-b bg-muted/10 shrink-0 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                        <Terminal className="w-3.5 h-3.5 text-primary" />
                        <span>Recent Query Activity Snapshot</span>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onNavigate('logs')}
                        className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground gap-1"
                    >
                        <span>View All Execution Logs</span>
                        <ArrowRight className="w-3 h-3" />
                    </Button>
                </CardHeader>
                <CardContent className="p-0">
                    {logsLoading ? (
                        <div className="py-8 text-center text-xs text-muted-foreground">
                            Loading activity snapshot...
                        </div>
                    ) : recentLogs.length > 0 ? (
                        <div className="divide-y">
                            {recentLogs.map((log) => {
                                const isSuccess = log.status === 'success';
                                const date = new Date(log.created_at);
                                const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                                const duration = log.duration_ms ?? (log.metadata as any)?.duration_ms ?? 0;
                                const sql = log.query_sql || (log.metadata as any)?.sql || 'Database query execution';

                                // Extract clean headline
                                const isSchema = /information_schema|pg_catalog/i.test(sql) || log.event_type === 'SCHEMA_PROBE';
                                const fromMatch = sql.match(/FROM\s+(?:"?[\w]+"?\.)?"?([\w]+)"?/i);
                                const table = fromMatch ? fromMatch[1] : undefined;
                                const headline = isSchema ? 'Schema Catalog Probe' : table ? `SELECT FROM ${table}` : sql.slice(0, 45);

                                return (
                                    <div
                                        key={log.id}
                                        onClick={() => onNavigate('logs')}
                                        className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors cursor-pointer text-xs"
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                            {isSuccess ? (
                                                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                            ) : (
                                                <XCircle className="w-4 h-4 text-destructive shrink-0" />
                                            )}
                                            <Badge
                                                variant="outline"
                                                className={cn(
                                                    "text-[9px] uppercase px-1.5 py-0 shrink-0 font-medium",
                                                    isSchema
                                                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900"
                                                        : "bg-muted/40 text-foreground"
                                                )}
                                            >
                                                {isSchema ? 'Schema' : 'Query'}
                                            </Badge>
                                            <span className="font-medium text-foreground truncate min-w-0 flex-1">
                                                {headline}
                                            </span>
                                            {table && (
                                                <span className="hidden md:inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-muted/60 text-[10px] text-muted-foreground shrink-0">
                                                    <PostgresIcon className="w-2.5 h-2.5" />
                                                    {table}
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2.5 shrink-0 text-xs">
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
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="py-6 text-center text-xs text-muted-foreground">
                            No recent query executions recorded. Run queries in Data Explorer to see live activity.
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
