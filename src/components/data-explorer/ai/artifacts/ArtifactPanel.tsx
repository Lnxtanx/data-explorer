// =============================================================================
// ArtifactPanel — expanded side panel for viewing artifacts at full size
// =============================================================================

import { useState, useMemo, useRef } from 'react';
import { X, Copy, Check, Database, BarChart, LineChart as LineChartIcon, PieChart as PieChartIcon, TableIcon } from 'lucide-react';
import {
    BarChart as ReBarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/utils';
import { CHART_COLORS, ChartType, detectChartType, isNumericColumn } from './chartUtils';
import { exportCsv, exportJson, copyTsv, exportChartPng } from './exportUtils';
import { exportHtml } from './htmlReport';
import { exportPdf } from './pdfReport';
import { exportPptx } from './pptxReport';
import { ChartView } from './views/ChartView';
import { StatBlockView } from './views/StatBlockView';
import { FileView } from './views/FileView';
import { SuggestionsView } from './views/SuggestionsView';
import { ReportView } from './views/ReportView';
import { PlanView } from './views/PlanView';
import type { AgentArtifact, ColumnStat, AnomalyEntry, QualityIssue, JoinPath } from '@/hooks/useAIAgent';

interface ArtifactPanelProps {
    artifact: AgentArtifact;
    onClose: () => void;
    onQuickSend?: (message: string) => void;
}

// ─── Stat card (expanded — wider layout) ─────────────────────────────────────

function StatCardExpanded({ stat }: { stat: ColumnStat }) {
    const nullPct = stat.nullPercent ?? 0;
    const badges: string[] = [];
    if (stat.isPrimaryKey) badges.push('PK');
    if (stat.isIndexed) badges.push('IDX');
    if (stat.nullable) badges.push('NULL');

    return (
        <div className="rounded-md border border-border/50 bg-muted/10 p-3 flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2 min-w-0">
                <span className="text-sm font-medium text-foreground truncate">{stat.name}</span>
                <span className="text-[10px] text-muted-foreground/60 font-mono shrink-0">{stat.dataType}</span>
            </div>
            {badges.length > 0 && (
                <div className="flex gap-1">
                    {badges.map(b => (
                        <span key={b} className="text-[9px] font-semibold tracking-wider text-muted-foreground/50 bg-muted/40 rounded px-1.5 py-0.5">{b}</span>
                    ))}
                </div>
            )}
            {(stat.min !== null || stat.max !== null || stat.avg !== null) && (
                <div className="grid grid-cols-3 gap-1 text-[11px]">
                    {stat.min !== null && <div><span className="text-muted-foreground/50 block">min</span><span className="text-foreground/80 font-mono truncate block">{String(stat.min)}</span></div>}
                    {stat.max !== null && <div><span className="text-muted-foreground/50 block">max</span><span className="text-foreground/80 font-mono truncate block">{String(stat.max)}</span></div>}
                    {stat.avg !== null && <div><span className="text-muted-foreground/50 block">avg</span><span className="text-foreground/80 font-mono truncate block">{stat.avg}</span></div>}
                </div>
            )}
            <div className="text-[11px] text-muted-foreground/60">
                {stat.distinctCount} distinct value{stat.distinctCount !== 1 ? 's' : ''}
            </div>
            <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-muted/50 rounded-full overflow-hidden">
                    <div
                        className={cn('h-full rounded-full', nullPct === 0 ? 'bg-emerald-500/60' : nullPct < 20 ? 'bg-amber-500/60' : 'bg-red-500/60')}
                        style={{ width: `${Math.max(nullPct, nullPct > 0 ? 2 : 0)}%` }}
                    />
                </div>
                <span className="text-[10px] text-muted-foreground/50 tabular-nums shrink-0 w-10 text-right">{nullPct.toFixed(1)}% null</span>
            </div>
            {stat.topValues && stat.topValues.length > 0 && (
                <div className="text-[11px]">
                    <span className="text-muted-foreground/50">top: </span>
                    <span className="text-foreground/60 font-mono">{stat.topValues.map(v => v === null ? 'null' : String(v)).join(', ')}</span>
                </div>
            )}
        </div>
    );
}

// ─── Severity badge class helper ─────────────────────────────────────────────

const SEVERITY_CLASS = {
    high: 'text-red-500 bg-red-500/10',
    medium: 'text-amber-500 bg-amber-500/10',
    low: 'text-muted-foreground bg-muted/40',
} as const;

// ─── Metric groups ───────────────────────────────────────────────────────────

const METRIC_GROUPS = [
    { key: 'identifiers', label: 'Identifiers', className: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
    { key: 'dimensions', label: 'Dimensions', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
    { key: 'measures', label: 'Measures', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
    { key: 'timestamps', label: 'Timestamps', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
] as const;

// =============================================================================
// ArtifactPanel
// =============================================================================

export function ArtifactPanel({ artifact, onClose, onQuickSend }: ArtifactPanelProps) {
    const artType = artifact.type as string;
    const isStats = artType === 'stats' && Array.isArray(artifact.stats);
    const isAnomalies = artType === 'anomalies' && Array.isArray(artifact.anomalies);
    const isQuality = (artType === 'quality' && artifact.score != null) || (artType === 'stat_block' && artifact.statBlockKind === 'quality');
    const isJoins = artType === 'joins' && Array.isArray(artifact.paths);
    const isMetrics = artType === 'metrics';
    const isChart = artType === 'chart';
    const isStatBlock = artType === 'stat_block';
    const isReport = artType === 'report';
    const isFile = artType === 'file';
    const isSuggestions = artType === 'suggestions';
    const isPlan = artType === 'analysis_plan';
    const isSpecial = isStats || isAnomalies || isQuality || isJoins || isMetrics
        || isChart || isStatBlock || isReport || isFile || isSuggestions || isPlan;

    const rows = artifact.rows ?? [];
    const cols = artifact.columns ?? [];

    const defaultMode = useMemo<ChartType>(() => {
        if (isStats) return 'stats';
        if (isAnomalies) return 'anomalies';
        if (isQuality) return 'quality';
        if (isJoins) return 'joins';
        if (isMetrics) return 'metrics';
        if (isChart) return 'chart';
        if (isStatBlock) return 'stat_block';
        if (isReport) return 'report';
        if (isFile) return 'file';
        if (isSuggestions) return 'suggestions';
        if (isPlan) return 'analysis_plan';
        return 'table';
    }, [isStats, isAnomalies, isQuality, isJoins, isMetrics, isChart, isStatBlock, isReport, isFile, isSuggestions, isPlan]);

    const [mode, setMode] = useState<ChartType>(defaultMode);
    const [copied, setCopied] = useState(false);
    const chartRef = useRef<HTMLDivElement>(null);

    const numCols = cols.filter(c => isNumericColumn(rows, c.name));
    const labelCol = cols.find(c => !isNumericColumn(rows, c.name)) ?? cols[0];

    const canBar = numCols.length >= 1 && !!labelCol && rows.length <= 50;
    const canLine = numCols.length >= 1 && !!labelCol && rows.length <= 100;
    const canPie = numCols.length === 1 && !!labelCol && rows.length <= 10;

    const chartData = rows.map(r => ({
        ...r,
        _label: String(r[labelCol?.name ?? ''] ?? ''),
    }));

    const isChartMode = mode === 'bar' || mode === 'line' || mode === 'pie';

    // Header text
    let headerText = artifact.title ?? '';
    if (isStats) headerText = headerText || `${artifact.stats!.length} columns`;
    else if (isAnomalies) headerText = headerText || 'Anomaly Detection';
    else if (isQuality) headerText = headerText || 'Quality Report';
    else if (isJoins) headerText = headerText || 'Join Paths';
    else if (isMetrics) headerText = headerText || 'Inferred Metrics';
    else headerText = headerText || `${rows.length} row${rows.length !== 1 ? 's' : ''}`;

    // When locked=true (or any special type), no toggle shown.
    const viewOptions = (isSpecial || artifact.locked)
        ? []
        : [
            { id: 'table' as ChartType, icon: TableIcon },
            ...(canBar  ? [{ id: 'bar'  as ChartType, icon: BarChart }] : []),
            ...(canLine ? [{ id: 'line' as ChartType, icon: LineChartIcon }] : []),
            ...(canPie  ? [{ id: 'pie'  as ChartType, icon: PieChartIcon }] : []),
        ];

    const tooltipStyle = {
        fontSize: 11,
        background: 'hsl(var(--background))',
        border: '1px solid hsl(var(--border))',
        borderRadius: 6,
    };

    const handleExport = () => {
        if (isChartMode) {
            exportChartPng(chartRef.current, headerText);
        } else if (rows.length > 0 && cols.length > 0) {
            exportCsv(rows, cols, headerText);
        } else if (isStats && artifact.stats) {
            exportJson(artifact.stats, headerText);
        } else if (isAnomalies && artifact.anomalies) {
            exportJson(artifact.anomalies, headerText);
        } else if (isQuality) {
            exportJson({ score: artifact.score, issues: artifact.issues, summary: artifact.summary }, headerText);
        } else if (isJoins && artifact.paths) {
            exportJson(artifact.paths, headerText);
        } else if (isMetrics) {
            exportJson({ identifiers: artifact.identifiers, dimensions: artifact.dimensions, measures: artifact.measures, timestamps: artifact.timestamps }, headerText);
        }
    };

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/20 shrink-0">
                <div className="flex items-center gap-2 text-sm text-foreground min-w-0">
                    <Database className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{headerText}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    {viewOptions.map(v => (
                        <button key={v.id} onClick={() => setMode(v.id)}
                            className={cn('p-1.5 rounded transition-colors',
                                mode === v.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground/50 hover:text-muted-foreground')}>
                            <v.icon className="w-4 h-4" />
                        </button>
                    ))}
                    {artifact.sql && (
                        <button
                            onClick={() => { navigator.clipboard.writeText(artifact.sql!); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                            className="p-1.5 rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                        </button>
                    )}
                    <button
                        onClick={handleExport}
                        className="text-[11px] font-medium px-2 py-1 rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                    >
                        Export
                    </button>
                    <button
                        onClick={() => exportHtml(artifact, headerText)}
                        className="text-[11px] font-medium px-2 py-1 rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                    >
                        HTML
                    </button>
                    <button
                        onClick={() => exportPdf(artifact, headerText)}
                        className="text-[11px] font-medium px-2 py-1 rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                    >
                        PDF
                    </button>
                    <button
                        onClick={() => exportPptx(artifact, headerText)}
                        className="text-[11px] font-medium px-2 py-1 rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                    >
                        PPTX
                    </button>
                    <button onClick={onClose} className="p-1.5 rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors ml-1">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-auto p-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full">
                {/* ── New standalone artifact types ───────────────── */}
                {isChart && <ChartView artifact={artifact} height={260} />}
                {isStatBlock && <StatBlockView artifact={artifact} />}
                {isReport && <ReportView artifact={artifact} />}
                {isFile && <FileView artifact={artifact} />}
                {isSuggestions && <SuggestionsView artifact={artifact} />}
                {isPlan && <PlanView artifact={artifact} onProceed={onQuickSend} />}

                {/* ── Legacy special types ─────────────────────────── */}
                {mode === 'stats' && isStats && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                        {artifact.stats!.map(stat => <StatCardExpanded key={stat.name} stat={stat} />)}
                    </div>
                )}

                {/* Anomalies */}
                {mode === 'anomalies' && isAnomalies && (
                    <div className="flex flex-col gap-3">
                        <p className="text-sm text-muted-foreground">
                            {artifact.totalAnomalies ?? 0} anomal{(artifact.totalAnomalies ?? 0) === 1 ? 'y' : 'ies'} found across {artifact.scannedColumns ?? 0} columns
                        </p>
                        {artifact.anomalies!.length > 0 && (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-border/40">
                                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Column</th>
                                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Type</th>
                                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Severity</th>
                                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Count</th>
                                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Detail</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {artifact.anomalies!.map((a, i) => (
                                            <tr key={i} className="border-b border-border/20 last:border-0">
                                                <td className="px-3 py-2 font-mono text-foreground/80">{a.column}</td>
                                                <td className="px-3 py-2 text-muted-foreground">{a.type.replace(/_/g, ' ')}</td>
                                                <td className="px-3 py-2">
                                                    <span className={cn('text-[10px] font-semibold tracking-wide rounded px-1.5 py-0.5', SEVERITY_CLASS[a.severity] ?? SEVERITY_CLASS.low)}>
                                                        {a.severity.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2 text-right tabular-nums text-foreground/70">{a.count}</td>
                                                <td className="px-3 py-2 text-muted-foreground/70">{a.explanation}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* Quality */}
                {mode === 'quality' && isQuality && (() => {
                    const score = artifact.score!;
                    const scoreColor = score >= 80 ? 'text-emerald-500' : score >= 50 ? 'text-amber-500' : 'text-red-500';
                    const barColor = score >= 80 ? 'bg-emerald-500/60' : score >= 50 ? 'bg-amber-500/60' : 'bg-red-500/60';
                    return (
                        <div className="flex flex-col gap-4">
                            <div className="flex items-baseline gap-3">
                                <span className={cn('text-4xl font-bold tabular-nums', scoreColor)}>{score}</span>
                                <span className="text-sm text-muted-foreground/60">/100</span>
                                <div className="flex-1 h-2 bg-muted/50 rounded-full overflow-hidden ml-2">
                                    <div className={cn('h-full rounded-full', barColor)} style={{ width: `${score}%` }} />
                                </div>
                            </div>
                            {artifact.summary && <p className="text-sm text-muted-foreground/70">{artifact.summary}</p>}
                            {(artifact.issues ?? []).length > 0 && (
                                <div className="flex flex-col gap-1.5">
                                    {artifact.issues!.map((issue, i) => (
                                        <div key={i} className="flex items-baseline gap-2 text-sm py-2 border-b border-border/20 last:border-0">
                                            <span className={cn('text-[10px] font-semibold tracking-wide rounded px-1.5 py-0.5 shrink-0', SEVERITY_CLASS[issue.severity] ?? SEVERITY_CLASS.low)}>
                                                {issue.severity.toUpperCase()}
                                            </span>
                                            <span className="font-mono text-foreground/80 shrink-0">{issue.column}</span>
                                            <span className="text-muted-foreground/60">{issue.issueType.replace(/_/g, ' ')}</span>
                                            <span className="text-muted-foreground/40 tabular-nums shrink-0">{issue.affectedRows} rows</span>
                                            {issue.recommendation && (
                                                <span className="text-muted-foreground/50 ml-auto">{issue.recommendation}</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* Joins */}
                {mode === 'joins' && isJoins && (
                    <div className="flex flex-col gap-2">
                        {artifact.paths!.length === 0
                            ? <p className="text-sm text-muted-foreground">No join paths found.</p>
                            : artifact.paths!.map((p, i) => (
                                <div key={i} className="flex items-center gap-2 text-sm py-2 border-b border-border/20 last:border-0 flex-wrap">
                                    <span className="font-mono text-foreground/80">{p.from}</span>
                                    <span className="text-muted-foreground/40">.</span>
                                    <span className="font-mono text-primary/70">{p.fromColumn}</span>
                                    <span className="text-muted-foreground/40 px-1">&rarr;</span>
                                    <span className="font-mono text-foreground/80">{p.to}</span>
                                    <span className="text-muted-foreground/40">.</span>
                                    <span className="font-mono text-primary/70">{p.toColumn}</span>
                                    <span className="ml-auto flex items-center gap-2 shrink-0">
                                        <span className="text-[11px] text-muted-foreground/50 font-mono">{p.joinType === 'foreign_key' ? 'FK' : 'heuristic'}</span>
                                        <span className="text-[11px] tabular-nums text-muted-foreground/40">{Math.round(p.confidence * 100)}%</span>
                                    </span>
                                </div>
                            ))
                        }
                    </div>
                )}

                {/* Metrics */}
                {mode === 'metrics' && isMetrics && (() => {
                    const groups = {
                        identifiers: artifact.identifiers ?? [],
                        dimensions: artifact.dimensions ?? [],
                        measures: artifact.measures ?? [],
                        timestamps: artifact.timestamps ?? [],
                    };
                    return (
                        <div className="flex flex-col gap-4">
                            {METRIC_GROUPS.map(({ key, label, className }) => {
                                const items = groups[key];
                                if (!items || items.length === 0) return null;
                                return (
                                    <div key={key}>
                                        <span className="text-[11px] font-semibold tracking-widest text-muted-foreground/50 uppercase">{label}</span>
                                        <div className="flex flex-wrap gap-2 mt-1.5">
                                            {items.map(col => (
                                                <span key={col} className={cn('text-sm font-mono rounded-md px-2.5 py-1', className)}>{col}</span>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    );
                })()}

                {/* Table — expanded, no height limit */}
                {mode === 'table' && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-background z-10">
                                <tr className="border-b border-border/40">
                                    {cols.map(c => (
                                        <th key={c.name} className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">{c.name}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row, ri) => (
                                    <tr key={ri} className="border-b border-border/20 last:border-0 hover:bg-muted/20">
                                        {cols.map(c => (
                                            <td key={c.name} className="px-3 py-2 text-foreground/80 whitespace-nowrap">
                                                {row[c.name] === null || row[c.name] === undefined
                                                    ? <span className="text-muted-foreground/30 italic text-xs">null</span>
                                                    : String(row[c.name])}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {rows.length === 0 && (
                            <p className="text-center text-sm text-muted-foreground py-8">No rows</p>
                        )}
                    </div>
                )}

                {/* Charts — expanded, taller */}
                {mode === 'bar' && canBar && (
                    <div ref={chartRef}>
                        <ResponsiveContainer width="100%" height={400}>
                            <ReBarChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 8 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                                <XAxis dataKey="_label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                                <Tooltip contentStyle={tooltipStyle} />
                                {numCols.slice(0, 4).map((c, idx) => (
                                    <Bar key={c.name} dataKey={c.name} fill={CHART_COLORS[idx % CHART_COLORS.length]} radius={[3, 3, 0, 0]} />
                                ))}
                            </ReBarChart>
                        </ResponsiveContainer>
                    </div>
                )}

                {mode === 'line' && canLine && (
                    <div ref={chartRef}>
                        <ResponsiveContainer width="100%" height={400}>
                            <LineChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 8 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                                <XAxis dataKey="_label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                                <Tooltip contentStyle={tooltipStyle} />
                                {numCols.slice(0, 4).map((c, idx) => (
                                    <Line key={c.name} type="monotone" dataKey={c.name}
                                        stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                                        strokeWidth={2} dot={false} />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}

                {mode === 'pie' && canPie && (
                    <div ref={chartRef}>
                        <ResponsiveContainer width="100%" height={400}>
                            <PieChart>
                                <Pie data={chartData} dataKey={numCols[0]?.name ?? ''}
                                    nameKey="_label" cx="50%" cy="50%" outerRadius={150}
                                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                                    labelLine={false}>
                                    {chartData.map((_, idx) => (
                                        <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={tooltipStyle} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            {/* SQL footer */}
            {artifact.sql && (
                <details className="border-t border-border/30 shrink-0">
                    <summary className="px-4 py-2 text-xs text-muted-foreground/60 cursor-pointer hover:text-muted-foreground hover:bg-muted/20 transition-colors select-none">
                        View SQL
                    </summary>
                    <pre className="px-4 pb-3 pt-1 text-xs font-mono text-foreground/70 overflow-x-auto bg-muted/10 max-h-40 overflow-y-auto">{artifact.sql}</pre>
                </details>
            )}
        </div>
    );
}
