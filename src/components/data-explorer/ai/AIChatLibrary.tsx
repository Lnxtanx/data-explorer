import { useState } from 'react';
import {
    BarChart2, HardDrive, MoreHorizontal, Trash2, Clock, Pin, Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listCharts, deleteChart, type SavedChart } from '@/lib/api/ai/charts';
import { listConnections } from '@/lib/api/data/connection/crud';
import type { Connection } from '@/lib/api/data/connection/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

const CHART_TYPE_LABEL: Record<string, string> = {
    bar: 'Bar', line: 'Line', area: 'Area', pie: 'Pie', scatter: 'Scatter',
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useSavedCharts(search: string) {
    return useQuery({
        queryKey: ['ai', 'charts', search],
        queryFn: () => listCharts({ limit: 50 }),
        staleTime: 30_000,
        select: (data) => {
            if (!search) return data.charts;
            const q = search.toLowerCase();
            return data.charts.filter(c =>
                c.title.toLowerCase().includes(q) ||
                c.chartType.toLowerCase().includes(q)
            );
        },
    });
}

function useDeleteChart() {
    const qc = useQueryClient();
    return useMutation<{ success: boolean }, Error, string>({
        mutationFn: deleteChart,
        onSuccess: () => qc.invalidateQueries({ queryKey: ['ai', 'charts'] }),
    });
}

function useConnections() {
    return useQuery({
        queryKey: ['connections', 'list'],
        queryFn: listConnections,
        staleTime: 60_000,
        select: (data) => data.connections,
    });
}

// ─── Chart Card ───────────────────────────────────────────────────────────────

function ChartCard({ chart }: { chart: SavedChart }) {
    const del = useDeleteChart();

    return (
        <div className="group border border-border/60 bg-card rounded-xl p-4 hover:border-border hover:shadow-sm transition-all flex flex-col gap-3">
            <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                    <BarChart2 className="w-5 h-5" />
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {chart.pinned && <Pin className="w-3.5 h-3.5 text-muted-foreground" />}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="w-6 h-6 text-muted-foreground hover:text-red-500"
                        onClick={() => del.mutate(chart.id)}
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                </div>
            </div>
            <div>
                <h4 className="font-medium text-sm text-foreground truncate" title={chart.title}>
                    {chart.title}
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                    {CHART_TYPE_LABEL[chart.chartType] ?? chart.chartType} · {timeAgo(chart.createdAt)}
                </p>
            </div>
            {chart.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {chart.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {tag}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Connection Row ───────────────────────────────────────────────────────────

function ConnectionRow({ conn }: { conn: Connection }) {
    const statusColor = conn.health_status === 'healthy'
        ? 'bg-green-400'
        : conn.health_status === 'unhealthy'
            ? 'bg-red-400'
            : 'bg-yellow-400';

    return (
        <tr className="border-b border-border/40 hover:bg-muted/10 last:border-0">
            <td className="py-3 px-4 font-medium flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-muted-foreground shrink-0" />
                {conn.name}
            </td>
            <td className="py-3 px-4 text-muted-foreground">{conn.database}</td>
            <td className="py-3 px-4 text-muted-foreground">
                <div className="flex items-center gap-1.5">
                    <span className={cn('w-2 h-2 rounded-full', statusColor)} />
                    {conn.health_status ?? 'unknown'}
                </div>
            </td>
            <td className="py-3 px-4 text-muted-foreground">
                {conn.lastUsedAt ? (
                    <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {timeAgo(conn.lastUsedAt)}
                    </span>
                ) : '—'}
            </td>
            <td className="py-3 px-4">
                <Button variant="ghost" size="icon" className="w-6 h-6 text-muted-foreground">
                    <MoreHorizontal className="w-4 h-4" />
                </Button>
            </td>
        </tr>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AIChatLibrary() {
    const [search, setSearch] = useState('');
    const { data: charts, isLoading: chartsLoading } = useSavedCharts(search);
    const { data: connections, isLoading: connLoading } = useConnections();

    return (
        <main className="flex-1 flex flex-col h-full bg-background overflow-hidden">
            {/* Header */}
            <div className="h-14 flex items-center px-6 shrink-0 border-b border-border/40">
                <h2 className="text-sm font-semibold text-foreground">Library</h2>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-8 py-8">
                <div className="max-w-5xl mx-auto flex flex-col gap-8">

                    {/* Search bar */}
                    <div className="relative w-72">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search charts..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="pl-9 bg-muted/50 border-transparent focus:bg-background focus:border-input transition-colors"
                        />
                    </div>

                    {/* Saved Charts */}
                    <div>
                        <h3 className="text-lg font-semibold text-foreground mb-4">Saved Charts</h3>
                        {chartsLoading ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {[1, 2, 3, 4].map(i => (
                                    <div key={i} className="border border-border/40 rounded-xl p-4 h-28 animate-pulse bg-muted/20" />
                                ))}
                            </div>
                        ) : charts && charts.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {charts.map(chart => (
                                    <ChartCard key={chart.id} chart={chart} />
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground italic">
                                {search ? 'No charts match your search.' : 'No saved charts yet. Ask Resona to generate a chart and save it.'}
                            </p>
                        )}
                    </div>

                    {/* Connections */}
                    <div>
                        <h3 className="text-lg font-semibold text-foreground mb-4">Connections</h3>
                        {connLoading ? (
                            <div className="border border-border/60 rounded-xl p-4 h-24 animate-pulse bg-muted/20" />
                        ) : connections && connections.length > 0 ? (
                            <div className="bg-card border border-border/60 rounded-xl overflow-hidden text-sm">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="border-b border-border/60 bg-muted/20">
                                            <th className="font-medium text-muted-foreground py-3 px-4">Name</th>
                                            <th className="font-medium text-muted-foreground py-3 px-4">Database</th>
                                            <th className="font-medium text-muted-foreground py-3 px-4">Health</th>
                                            <th className="font-medium text-muted-foreground py-3 px-4">Last Used</th>
                                            <th className="w-10" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {connections.map(conn => (
                                            <ConnectionRow key={conn.id} conn={conn} />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground italic">No connections found.</p>
                        )}
                    </div>

                </div>
            </div>
        </main>
    );
}
