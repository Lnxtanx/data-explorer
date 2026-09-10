// =============================================================================
// DashboardPanel — multi-artifact grid layout for composing dashboards
// =============================================================================

import { useState, useRef, useMemo } from 'react';
import { X, GripVertical, Columns2, Columns3, LayoutGrid, Rows2 } from 'lucide-react';
import {
    BarChart as ReBarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/utils';
import { CHART_COLORS, ChartType, detectChartType, isNumericColumn } from './chartUtils';
import { ChartView } from './views/ChartView';
import { StatBlockView } from './views/StatBlockView';
import { exportHtml as exportSingleHtml } from './htmlReport';
import { exportPdf as exportSinglePdf } from './pdfReport';
import type { AgentArtifact } from '@/hooks/useAIAgent';

// ─── Types ───────────────────────────────────────────────────────────────────

type LayoutMode = '1-col' | '2-col' | '3-col' | '2-row';

interface DashboardPanelProps {
    artifacts: AgentArtifact[];
    onClose: () => void;
    onRemove: (index: number) => void;
}

// ─── Mini artifact card (rendered inside dashboard grid) ─────────────────────

function DashboardCard({ artifact, onRemove }: { artifact: AgentArtifact; onRemove: () => void }) {
    const artType = artifact.type as string;
    const isChart = artType === 'chart' || artifact.previewType === 'chart';
    const isStatBlock = artType === 'stat_block' || artifact.previewType === 'stat_block';

    const rows = artifact.rows ?? [];
    const cols = artifact.columns ?? [];

    const mode = useMemo<ChartType>(() => {
        if (isChart) return 'chart';
        if (isStatBlock) return 'stat_block';
        return detectChartType(rows, cols);
    }, [isChart, isStatBlock, rows, cols]);

    const numCols = cols.filter(c => isNumericColumn(rows, c.name));
    const labelCol = cols.find(c => !isNumericColumn(rows, c.name)) ?? cols[0];
    const chartData = rows.map(r => ({ ...r, _label: String(r[labelCol?.name ?? ''] ?? '') }));

    const tooltipStyle = {
        fontSize: 10,
        background: 'hsl(var(--background))',
        border: '1px solid hsl(var(--border))',
        borderRadius: 6,
    };

    // Title
    let title = artifact.title ?? '';
    if (!title) {
        if (isChart) title = artifact.chartType ? `${artifact.chartType.charAt(0).toUpperCase()}${artifact.chartType.slice(1)} Chart` : 'Chart';
        else if (isStatBlock) title = 'Stats';
        else title = `${rows.length} row${rows.length !== 1 ? 's' : ''}`;
    }

    return (
        <div className="rounded-lg border border-border/60 bg-card overflow-hidden flex flex-col h-full">
            {/* Card header */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/40 bg-muted/20 shrink-0">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
                    <GripVertical className="w-3 h-3 text-muted-foreground/30 shrink-0" />
                    <span className="font-medium truncate">{title}</span>
                </div>
                <button onClick={onRemove} className="p-1 rounded text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0">
                    <X className="w-3 h-3" />
                </button>
            </div>

            {/* Card body */}
            <div className="flex-1 overflow-auto p-2 min-h-0">
                {/* Stats summary */}
                {/* Chart */}
                {mode === 'chart' && isChart && <ChartView artifact={artifact} height={160} />}

                {/* Stat block */}
                {mode === 'stat_block' && isStatBlock && <StatBlockView artifact={artifact} />}

                {/* Table */}
                {mode === 'table' && (
                    <div className="overflow-auto max-h-full">
                        <table className="w-full text-[11px]">
                            <thead><tr className="border-b border-border/40">{cols.map(c => <th key={c.name} className="text-left px-1.5 py-1 font-medium text-muted-foreground whitespace-nowrap">{c.name}</th>)}</tr></thead>
                            <tbody>
                                {rows.slice(0, 15).map((row, ri) => (
                                    <tr key={ri} className="border-b border-border/20 last:border-0">
                                        {cols.map(c => <td key={c.name} className="px-1.5 py-0.5 text-foreground/80 truncate max-w-[120px]">{row[c.name] == null ? <span className="text-muted-foreground/30 italic">null</span> : String(row[c.name])}</td>)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {rows.length > 15 && <p className="text-center text-[10px] text-muted-foreground/40 py-1">+{rows.length - 15} more</p>}
                    </div>
                )}

                {/* Bar chart */}
                {mode === 'bar' && numCols.length >= 1 && labelCol && (
                    <ResponsiveContainer width="100%" height="100%">
                        <ReBarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                            <XAxis dataKey="_label" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                            <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                            <Tooltip contentStyle={tooltipStyle} />
                            {numCols.slice(0, 3).map((c, idx) => (
                                <Bar key={c.name} dataKey={c.name} fill={CHART_COLORS[idx % CHART_COLORS.length]} radius={[2, 2, 0, 0]} />
                            ))}
                        </ReBarChart>
                    </ResponsiveContainer>
                )}

                {/* Line chart */}
                {mode === 'line' && numCols.length >= 1 && labelCol && (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                            <XAxis dataKey="_label" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                            <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                            <Tooltip contentStyle={tooltipStyle} />
                            {numCols.slice(0, 3).map((c, idx) => (
                                <Line key={c.name} type="monotone" dataKey={c.name} stroke={CHART_COLORS[idx % CHART_COLORS.length]} strokeWidth={2} dot={false} />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                )}

                {/* Pie chart */}
                {mode === 'pie' && numCols.length === 1 && labelCol && (
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie data={chartData} dataKey={numCols[0]?.name ?? ''} nameKey="_label" cx="50%" cy="50%" outerRadius="70%"
                                label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} labelLine={false}>
                                {chartData.map((_, idx) => <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />)}
                            </Pie>
                            <Tooltip contentStyle={tooltipStyle} />
                        </PieChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    );
}

// =============================================================================
// DashboardPanel
// =============================================================================

export function DashboardPanel({ artifacts, onClose, onRemove }: DashboardPanelProps) {
    const [layout, setLayout] = useState<LayoutMode>('2-col');

    const gridClass = {
        '1-col': 'grid-cols-1',
        '2-col': 'grid-cols-1 sm:grid-cols-2',
        '3-col': 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
        '2-row': 'grid-cols-1',
    }[layout];

    const cardMinH = layout === '2-row' ? 'min-h-[250px]' : 'min-h-[200px]';

    const layoutOptions: { id: LayoutMode; icon: typeof Columns2; label: string }[] = [
        { id: '1-col', icon: Rows2, label: '1 column' },
        { id: '2-col', icon: Columns2, label: '2 columns' },
        { id: '3-col', icon: Columns3, label: '3 columns' },
        { id: '2-row', icon: LayoutGrid, label: 'Stacked' },
    ];

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/20 shrink-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">Dashboard</span>
                    <span className="text-xs text-muted-foreground/50">{artifacts.length} artifact{artifacts.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="flex items-center gap-1">
                    {layoutOptions.map(opt => (
                        <button
                            key={opt.id}
                            onClick={() => setLayout(opt.id)}
                            title={opt.label}
                            className={cn('p-1.5 rounded transition-colors',
                                layout === opt.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground/50 hover:text-muted-foreground')}
                        >
                            <opt.icon className="w-4 h-4" />
                        </button>
                    ))}
                    <button onClick={onClose} className="p-1.5 rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors ml-2">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-auto p-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full">
                {artifacts.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-sm text-muted-foreground/50">
                        Pin artifacts from the chat to build your dashboard.
                    </div>
                ) : (
                    <div className={cn('grid gap-3', gridClass)}>
                        {artifacts.map((artifact, idx) => (
                            <div key={idx} className={cardMinH}>
                                <DashboardCard artifact={artifact} onRemove={() => onRemove(idx)} />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
