import { useState, useMemo } from 'react';
import { Activity, Loader2, RefreshCw, CheckCircle2, XCircle, Clock, Server, Zap, ShieldCheck } from 'lucide-react';
import { PostgresIcon } from './DatabaseEngineIcon';
import { useConnectors, useHealthEvents } from './api/index';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { HealthEvent } from './api/types';

export function ConnectorHealth() {
    const { data: connectors = [], isLoading: connectorsLoading } = useConnectors();
    const [selectedConnectorId, setSelectedConnectorId] = useState<string | 'all'>('all');
    const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h');

    const { data: healthData, isLoading: eventsLoading, isFetching, refetch } = useHealthEvents(
        selectedConnectorId === 'all' ? null : selectedConnectorId,
        timeRange
    );

    const connectorOptions = useMemo(() => {
        return connectors.map((c) => ({
            id: c.agent_id,
            name: c.machine_label || 'Local Agent',
        }));
    }, [connectors]);

    const events: HealthEvent[] = healthData?.events || [];
    const avgLatency = healthData?.averageLatencyMs || 0;
    const p95Latency = healthData?.p95LatencyMs || (events.length > 0
        ? [...events].map(e => e.latency_ms ?? 0).sort((a, b) => a - b)[Math.floor(events.length * 0.95)] || avgLatency
        : 0);
    const successRate = healthData?.successRate ?? (events.length > 0
        ? Math.round((events.filter(e => e.status === 'healthy' || e.status === 'online' || e.status === 'success').length / events.length) * 100)
        : 100);
    const onlineHostsCount = connectors.filter(c => c.is_online).length;

    // Take the 16 most recent executions for the latency visualizer (chronological order)
    const recentSamples = useMemo(() => {
        return events.slice(0, 16).reverse();
    }, [events]);

    const maxLatency = useMemo(() => {
        if (recentSamples.length === 0) return 100;
        return Math.max(...recentSamples.map((s) => s.latency_ms || 10), 100);
    }, [recentSamples]);

    return (
        <div className="p-6 space-y-4 w-full min-w-0 pb-10">
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b shrink-0 pr-8">
                <div>
                    <h3 className="text-xl font-semibold tracking-tight">Health Monitor</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Monitor latency metrics, connector connectivity, and query response health.
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetch()}
                    disabled={isFetching}
                    className="h-8 gap-1.5 text-xs rounded-lg shadow-sm shrink-0"
                >
                    <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin text-primary")} />
                    <span>Refresh</span>
                </Button>
            </div>

            {/* Filters Bar */}
            <div className="flex flex-col sm:flex-row gap-3 p-2 bg-muted/20 border rounded-xl shrink-0">
                <div className="flex-1 space-y-1">
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
                        Connector Host
                    </label>
                    <Select
                        value={selectedConnectorId}
                        onValueChange={(val) => setSelectedConnectorId(val)}
                    >
                        <SelectTrigger className="h-8 text-xs bg-background rounded-lg">
                            <SelectValue placeholder="All Connectors" />
                        </SelectTrigger>
                        <SelectContent className="max-w-xs">
                            <SelectItem value="all" className="text-xs">
                                All Connectors ({connectors.length})
                            </SelectItem>
                            {connectorOptions.map((connector) => (
                                <SelectItem key={connector.id} value={connector.id} className="text-xs">
                                    {connector.name} ({connector.id.slice(0, 12)}...)
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="w-full sm:w-48 space-y-1">
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
                        Time Window
                    </label>
                    <Select
                        value={timeRange}
                        onValueChange={(val: '1h' | '24h' | '7d' | '30d') => setTimeRange(val)}
                    >
                        <SelectTrigger className="h-8 text-xs bg-background rounded-lg">
                            <SelectValue placeholder="Select window" />
                        </SelectTrigger>
                        <SelectContent className="max-w-xs">
                            <SelectItem value="1h" className="text-xs">Last 1 hour</SelectItem>
                            <SelectItem value="24h" className="text-xs">Last 24 hours</SelectItem>
                            <SelectItem value="7d" className="text-xs">Last 7 days</SelectItem>
                            <SelectItem value="30d" className="text-xs">Last 30 days</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* 4 Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
                <div className="p-3 rounded-xl border bg-background space-y-1 shadow-sm">
                    <div className="flex items-center justify-between text-muted-foreground">
                        <span className="text-[10px] font-semibold uppercase tracking-wider">Relay Status</span>
                        <PostgresIcon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex items-center gap-1.5 pt-0.5">
                        <span className={cn(
                            "w-2 h-2 rounded-full shrink-0",
                            onlineHostsCount > 0 ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                        )} />
                        <span className="text-sm font-semibold text-foreground">
                            {onlineHostsCount > 0 ? 'Active' : 'Standby'}
                        </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">
                        {onlineHostsCount > 0
                            ? `${onlineHostsCount} host ${onlineHostsCount === 1 ? 'online' : 'online'}`
                            : '0 hosts online'}
                    </p>
                </div>

                <div className="p-3 rounded-xl border bg-background space-y-1 shadow-sm">
                    <div className="flex items-center justify-between text-muted-foreground">
                        <span className="text-[10px] font-semibold uppercase tracking-wider">Avg Latency</span>
                        <Zap className="w-3.5 h-3.5 text-emerald-500" />
                    </div>
                    <div className="text-sm font-semibold font-mono text-foreground pt-0.5">
                        {events.length > 0 ? `${avgLatency}ms` : '—'}
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">
                        {events.length === 0
                            ? 'No queries logged'
                            : avgLatency > 500
                            ? 'High Latency (> 500ms)'
                            : 'Normal (< 500ms)'}
                    </p>
                </div>

                <div className="p-3 rounded-xl border bg-background space-y-1 shadow-sm">
                    <div className="flex items-center justify-between text-muted-foreground">
                        <span className="text-[10px] font-semibold uppercase tracking-wider">P95 Latency</span>
                        <Clock className="w-3.5 h-3.5 text-blue-500" />
                    </div>
                    <div className="text-sm font-semibold font-mono text-foreground pt-0.5">
                        {events.length > 0 ? `${p95Latency}ms` : '—'}
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">
                        95% of queries
                    </p>
                </div>

                <div className="p-3 rounded-xl border bg-background space-y-1 shadow-sm">
                    <div className="flex items-center justify-between text-muted-foreground">
                        <span className="text-[10px] font-semibold uppercase tracking-wider">Success Rate</span>
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                    </div>
                    <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 pt-0.5">
                        {events.length > 0 ? `${successRate}%` : '100%'}
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">
                        {events.length} queries logged
                    </p>
                </div>
            </div>

            {/* Latency & Health Timeline Card with Legend */}
            <Card className="border rounded-xl shadow-none shrink-0 overflow-hidden">
                <CardHeader className="py-2.5 px-4 border-b bg-muted/10">
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-xs font-semibold text-foreground">
                            <Activity className="w-3.5 h-3.5 text-primary" />
                            <span>Live Relay Query Latency & Response Timeline</span>
                        </CardTitle>
                        <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
                            <span className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                &lt;100ms
                            </span>
                            <span className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                &lt;500ms
                            </span>
                            <span className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                &gt;500ms
                            </span>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-3.5">
                    {connectorsLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : connectors.length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground text-xs">
                            Add a PostgreSQL connector to view latency and connectivity history
                        </div>
                    ) : (
                        <div className="bg-background rounded-xl p-3.5 flex flex-col justify-between border space-y-2.5">
                            {recentSamples.length > 0 ? (
                                <div className="flex items-end justify-between gap-1.5 h-28 border-b pb-2">
                                    {recentSamples.map((sample: HealthEvent, idx: number) => {
                                        const lat = sample.latency_ms || 0;
                                        const barHeight = Math.min(100, Math.max(14, Math.round((lat / maxLatency) * 100)));
                                        const isHealthy = sample.status === 'healthy' || sample.status === 'online' || sample.status === 'success';

                                        return (
                                            <div key={sample.id || idx} className="flex-1 flex flex-col items-center gap-1 group relative h-full justify-end">
                                                <div
                                                    style={{ height: `${barHeight}%` }}
                                                    className={cn(
                                                        "w-full rounded-t-md transition-all shadow-sm",
                                                        !isHealthy
                                                            ? "bg-destructive/60 group-hover:bg-destructive"
                                                            : lat < 100
                                                            ? "bg-emerald-500/50 group-hover:bg-emerald-500"
                                                            : lat < 500
                                                            ? "bg-blue-500/50 group-hover:bg-blue-500"
                                                            : "bg-amber-500/50 group-hover:bg-amber-500"
                                                    )}
                                                />
                                                <span className="text-[9px] font-mono text-muted-foreground/80">{lat}ms</span>
                                                <div className="absolute -top-8 opacity-0 group-hover:opacity-100 transition-opacity bg-popover text-popover-foreground text-[10px] font-mono px-2 py-0.5 rounded shadow-md border whitespace-nowrap pointer-events-none z-10">
                                                    {lat}ms • {isHealthy ? 'Healthy' : 'Error'}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-center py-6 text-xs text-muted-foreground">
                                    <Activity className="w-5 h-5 text-muted-foreground/40 mb-1" />
                                    <span>No latency pings recorded in this time window ({timeRange})</span>
                                </div>
                            )}

                            <div className="flex justify-between items-center text-[10px] text-muted-foreground font-mono">
                                <span>Recent Queries ({recentSamples.length} sampled)</span>
                                <span>Time Window: {timeRange}</span>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Dedicated Box for Recent Health Events - Spacious Multi-Log View */}
            <Card className="border rounded-xl shadow-none overflow-hidden shrink-0">
                <CardHeader className="py-2.5 px-4 border-b bg-muted/10 shrink-0 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                        <Server className="w-3.5 h-3.5 text-primary" />
                        <span>Recent Health Events</span>
                    </div>
                    <span className="text-[11px] font-mono text-muted-foreground">
                        {events.length} {events.length === 1 ? 'event' : 'events'}
                    </span>
                </CardHeader>
                <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
                    {eventsLoading ? (
                        <div className="py-12 flex items-center justify-center text-xs text-muted-foreground gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                            Loading health events...
                        </div>
                    ) : events.length > 0 ? (
                        <ScrollArea className="flex-1 h-full min-h-[300px] max-h-[520px]">
                            <div className="divide-y pr-1">
                                {events.map((event: HealthEvent) => {
                                    const isHealthy = event.status === 'healthy' || event.status === 'online' || event.status === 'success';
                                    const date = new Date(event.created_at);
                                    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                                    const lat = event.latency_ms ?? (event.metadata as any)?.duration_ms ?? 0;

                                    const matchingConnector = connectors.find((c) => c.agent_id === event.connector_id || c.id === event.connector_id);
                                    const hostLabel = matchingConnector?.machine_label || event.connection_name || 'PostgreSQL Host';
                                    const agentId = event.connector_id || matchingConnector?.agent_id;

                                    return (
                                        <div
                                            key={event.id}
                                            className="px-4 py-3 hover:bg-muted/30 transition-colors flex items-center justify-between gap-3 text-xs"
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                {isHealthy ? (
                                                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                                ) : (
                                                    <XCircle className="w-4 h-4 text-destructive shrink-0" />
                                                )}
                                                <Badge
                                                    variant="outline"
                                                    className={cn(
                                                        "text-[9px] uppercase px-1.5 py-0 shrink-0 font-medium",
                                                        isHealthy
                                                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                                            : "bg-destructive/10 text-destructive border-destructive/20"
                                                    )}
                                                >
                                                    {isHealthy ? 'Healthy' : 'Unhealthy'}
                                                </Badge>
                                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                                    <span className="font-semibold text-foreground truncate">
                                                        {hostLabel}
                                                    </span>
                                                    {agentId && (
                                                        <span className="text-[10px] text-muted-foreground/70 font-mono hidden sm:inline truncate">
                                                            ({agentId})
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2.5 shrink-0 text-xs font-mono">
                                                {lat > 0 && (
                                                    <span className={cn(
                                                        "inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium tabular-nums",
                                                        lat < 200
                                                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                                            : lat < 1000
                                                            ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                                                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                                                    )}>
                                                        <Clock className="w-2.5 h-2.5 opacity-80" />
                                                        {lat}ms
                                                    </span>
                                                )}
                                                <span className="text-muted-foreground/60 text-[10px]">
                                                    {timeStr}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </ScrollArea>
                    ) : (
                        <div className="py-12 flex flex-col items-center justify-center p-6 text-xs text-muted-foreground gap-1 text-center">
                            <Activity className="w-5 h-5 text-muted-foreground/40 mb-1" />
                            <span>No health events recorded in this time window ({timeRange})</span>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
