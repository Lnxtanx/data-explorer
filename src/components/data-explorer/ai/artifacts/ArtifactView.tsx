import { useState, useMemo, useRef, useEffect, type FormEvent } from 'react';
import { Copy, Check, Database, BarChart, LineChart as LineChartIcon, PieChart as PieChartIcon, TableIcon, Maximize2, PinIcon } from 'lucide-react';
import {
    BarChart as ReBarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/utils';
import { CHART_COLORS, ChartType, detectChartType, isNumericColumn } from './chartUtils';
import { exportCsv, exportJson, copyTsv, exportChartPng, exportExcel } from './exportUtils';
import { exportHtml, exportExecutiveHtml } from './htmlReport';
import { exportPdf, exportExecutivePdf } from './pdfReport';
import { exportPptx } from './pptxReport';
import { useSaveChart } from '@/hooks/useCharts';
import { ChartView } from './views/ChartView';
import { StatBlockView } from './views/StatBlockView';
import { FileView } from './views/FileView';
import { SuggestionsView } from './views/SuggestionsView';
import { ReportView } from './views/ReportView';
import { PlanView } from './views/PlanView';
import { SlidePreviewView } from './views/SlidePreviewView';
import type { AgentArtifact, ColumnStat, AnomalyEntry, QualityIssue, JoinPath } from '@/hooks/useAIAgent';
interface ArtifactViewProps {
    artifact: AgentArtifact;
    connectionId?: string;
    variant?: 'chat' | 'card';
    onExpand?: (artifact: AgentArtifact) => void;
    onPin?: (artifact: AgentArtifact) => void;
    onQuickSend?: (message: string) => void;
    cachedAt?: number | null;
}

// ─── Stats card sub-component ─────────────────────────────────────────────────

function StatCard({ stat }: { stat: ColumnStat }) {
    const nullPct = stat.nullPercent ?? 0;
    const badges: string[] = [];
    if (stat.isPrimaryKey) badges.push('PK');
    if (stat.isIndexed) badges.push('IDX');
    if (stat.nullable) badges.push('NULL');

    return (
        <div className="rounded-md border border-border/50 bg-background p-3 flex flex-col gap-2">
            {/* Column name + type */}
            <div className="flex items-baseline justify-between gap-2 min-w-0">
                <span className="text-sm font-medium text-foreground truncate">{stat.name}</span>
                <span className="text-[10px] text-muted-foreground/60 font-mono shrink-0">{stat.dataType}</span>
            </div>

            {/* Badges */}
            {badges.length > 0 && (
                <div className="flex gap-1">
                    {badges.map(b => (
                        <span key={b} className="text-[9px] font-semibold tracking-wider text-muted-foreground/50 bg-muted/40 rounded px-1.5 py-0.5">
                            {b}
                        </span>
                    ))}
                </div>
            )}

            {/* Min / Max / Avg row */}
            {(stat.min !== null || stat.max !== null || stat.avg !== null) && (
                <div className="grid grid-cols-3 gap-1 text-[11px]">
                    {stat.min !== null && (
                        <div>
                            <span className="text-muted-foreground/50 block">min</span>
                            <span className="text-foreground/80 font-mono truncate block">{String(stat.min)}</span>
                        </div>
                    )}
                    {stat.max !== null && (
                        <div>
                            <span className="text-muted-foreground/50 block">max</span>
                            <span className="text-foreground/80 font-mono truncate block">{String(stat.max)}</span>
                        </div>
                    )}
                    {stat.avg !== null && (
                        <div>
                            <span className="text-muted-foreground/50 block">avg</span>
                            <span className="text-foreground/80 font-mono truncate block">{stat.avg}</span>
                        </div>
                    )}
                </div>
            )}

            {/* Distinct count */}
            <div className="text-[11px] text-muted-foreground/60">
                {stat.distinctCount} distinct value{stat.distinctCount !== 1 ? 's' : ''}
            </div>

            {/* Null rate bar */}
            <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-muted/50 rounded-full overflow-hidden">
                    <div
                        className={cn(
                            'h-full rounded-full transition-all',
                            nullPct === 0 ? 'bg-emerald-500/60' : nullPct < 20 ? 'bg-amber-500/60' : 'bg-red-500/60',
                        )}
                        style={{ width: `${Math.max(nullPct, nullPct > 0 ? 2 : 0)}%` }}
                    />
                </div>
                <span className="text-[10px] text-muted-foreground/50 tabular-nums shrink-0 w-10 text-right">
                    {nullPct.toFixed(1)}% null
                </span>
            </div>

            {/* Top values */}
            {stat.topValues && stat.topValues.length > 0 && (
                <div className="text-[11px]">
                    <span className="text-muted-foreground/50">top: </span>
                    <span className="text-foreground/60 font-mono">
                        {stat.topValues.map(v => v === null ? 'null' : String(v)).join(', ')}
                    </span>
                </div>
            )}
        </div>
    );
}

// ─── Anomalies renderer ───────────────────────────────────────────────────────

const SEVERITY_CLASS = {
    high: 'text-red-500 bg-red-500/10',
    medium: 'text-amber-500 bg-amber-500/10',
    low: 'text-muted-foreground bg-muted/40',
} as const;

function AnomaliesView({ anomalies, scannedColumns, totalAnomalies }: {
    anomalies: AnomalyEntry[];
    scannedColumns: number;
    totalAnomalies: number;
}) {
    return (
        <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
                {totalAnomalies} anomal{totalAnomalies === 1 ? 'y' : 'ies'} found across {scannedColumns} columns
            </p>
            {anomalies.length > 0 && (
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b border-border/40">
                                <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Column</th>
                                <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Type</th>
                                <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Severity</th>
                                <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Count</th>
                                <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Detail</th>
                            </tr>
                        </thead>
                        <tbody>
                            {anomalies.map((a, i) => (
                                <tr key={i} className="border-b border-border/20 last:border-0">
                                    <td className="px-2 py-1.5 font-mono text-foreground/80">{a.column}</td>
                                    <td className="px-2 py-1.5 text-muted-foreground">{a.type.replace(/_/g, ' ')}</td>
                                    <td className="px-2 py-1.5">
                                        <span className={cn('text-[10px] font-semibold tracking-wide rounded px-1.5 py-0.5', SEVERITY_CLASS[a.severity] ?? SEVERITY_CLASS.low)}>
                                            {a.severity.toUpperCase()}
                                        </span>
                                    </td>
                                    <td className="px-2 py-1.5 text-right tabular-nums text-foreground/70">{a.count}</td>
                                    <td className="px-2 py-1.5 text-muted-foreground/70 max-w-[200px] truncate">{a.explanation}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ─── Quality renderer ─────────────────────────────────────────────────────────

function QualityView({ score, summary, issues }: {
    score: number;
    summary: string;
    issues: QualityIssue[];
}) {
    const scoreColor = score >= 80 ? 'text-emerald-500' : score >= 50 ? 'text-amber-500' : 'text-red-500';
    const barColor = score >= 80 ? 'bg-emerald-500/60' : score >= 50 ? 'bg-amber-500/60' : 'bg-red-500/60';

    return (
        <div className="flex flex-col gap-3">
            {/* Score display */}
            <div className="flex items-baseline gap-3">
                <span className={cn('text-3xl font-bold tabular-nums', scoreColor)}>{score}</span>
                <span className="text-sm text-muted-foreground/60">/100</span>
                <div className="flex-1 h-1.5 bg-muted/50 rounded-full overflow-hidden ml-2">
                    <div className={cn('h-full rounded-full', barColor)} style={{ width: `${score}%` }} />
                </div>
            </div>
            {summary && <p className="text-xs text-muted-foreground/70">{summary}</p>}

            {/* Issues list */}
            {issues.length > 0 && (
                <div className="flex flex-col gap-1">
                    {issues.map((issue, i) => (
                        <div key={i} className="flex items-baseline gap-2 text-xs py-1.5 border-b border-border/20 last:border-0">
                            <span className={cn('text-[10px] font-semibold tracking-wide rounded px-1.5 py-0.5 shrink-0', SEVERITY_CLASS[issue.severity] ?? SEVERITY_CLASS.low)}>
                                {issue.severity.toUpperCase()}
                            </span>
                            <span className="font-mono text-foreground/80 shrink-0">{issue.column}</span>
                            <span className="text-muted-foreground/60">{issue.issueType.replace(/_/g, ' ')}</span>
                            <span className="text-muted-foreground/40 tabular-nums shrink-0">{issue.affectedRows} rows</span>
                            {issue.recommendation && (
                                <span className="text-muted-foreground/50 truncate ml-auto max-w-[200px]">{issue.recommendation}</span>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Join paths renderer ──────────────────────────────────────────────────────

function JoinsView({ paths }: { paths: JoinPath[] }) {
    if (paths.length === 0) return <p className="text-xs text-muted-foreground">No join paths found.</p>;

    return (
        <div className="flex flex-col gap-1.5">
            {paths.map((p, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs py-1.5 border-b border-border/20 last:border-0 flex-wrap">
                    <span className="font-mono text-foreground/80">{p.from}</span>
                    <span className="text-muted-foreground/40">.</span>
                    <span className="font-mono text-primary/70">{p.fromColumn}</span>
                    <span className="text-muted-foreground/40 px-1">→</span>
                    <span className="font-mono text-foreground/80">{p.to}</span>
                    <span className="text-muted-foreground/40">.</span>
                    <span className="font-mono text-primary/70">{p.toColumn}</span>
                    <span className="ml-auto flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] text-muted-foreground/50 font-mono">
                            {p.joinType === 'foreign_key' ? 'FK' : 'heuristic'}
                        </span>
                        <span className="text-[10px] tabular-nums text-muted-foreground/40">
                            {Math.round(p.confidence * 100)}%
                        </span>
                    </span>
                </div>
            ))}
        </div>
    );
}

// ─── Metrics renderer ─────────────────────────────────────────────────────────

const METRIC_GROUPS = [
    { key: 'identifiers', label: 'Identifiers', className: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
    { key: 'dimensions', label: 'Dimensions', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
    { key: 'measures', label: 'Measures', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
    { key: 'timestamps', label: 'Timestamps', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
] as const;

function MetricsView({ identifiers, dimensions, measures, timestamps }: {
    identifiers: string[];
    dimensions: string[];
    measures: string[];
    timestamps: string[];
}) {
    const groups = { identifiers, dimensions, measures, timestamps };

    return (
        <div className="flex flex-col gap-3">
            {METRIC_GROUPS.map(({ key, label, className }) => {
                const items = groups[key];
                if (!items || items.length === 0) return null;
                return (
                    <div key={key}>
                        <span className="text-[10px] font-semibold tracking-widest text-muted-foreground/50 uppercase">{label}</span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                            {items.map(col => (
                                <span key={col} className={cn('text-xs font-mono rounded-md px-2 py-1', className)}>
                                    {col}
                                </span>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Mermaid diagram renderer ────────────────────────────────────────────────

function DiagramView({ mermaid: mermaidCode, title }: { mermaid: string; title?: string }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [svgContent, setSvgContent] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const mermaid = (await import('mermaid')).default;
                mermaid.initialize({
                    startOnLoad: false,
                    theme: 'neutral',
                    securityLevel: 'strict',
                    er: { useMaxWidth: true },
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                });

                const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                const { svg } = await mermaid.render(id, mermaidCode);
                if (!cancelled) {
                    setSvgContent(svg);
                    setError(null);
                }
            } catch (e) {
                if (!cancelled) {
                    setError(e instanceof Error ? e.message : 'Failed to render diagram');
                    setSvgContent(null);
                }
            }
        })();

        return () => { cancelled = true; };
    }, [mermaidCode]);

    if (error) {
        return (
            <div className="flex flex-col gap-2">
                <p className="text-xs text-red-500/70">Diagram render error: {error}</p>
                <details className="text-[11px]">
                    <summary className="text-muted-foreground/50 cursor-pointer">View Mermaid source</summary>
                    <pre className="mt-1 p-2 bg-muted/10 rounded text-foreground/60 overflow-x-auto whitespace-pre-wrap text-[10px]">
                        {mermaidCode}
                    </pre>
                </details>
            </div>
        );
    }

    if (!svgContent) {
        return (
            <div className="flex items-center justify-center py-8">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse mr-2" />
                <span className="text-xs text-muted-foreground/50">Rendering diagram...</span>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2">
            {title && <span className="text-xs font-medium text-muted-foreground/60">{title}</span>}
            <div
                ref={containerRef}
                className="overflow-x-auto [&_svg]:max-w-full [&_svg]:h-auto"
                dangerouslySetInnerHTML={{ __html: svgContent }}
            />
            <details className="text-[11px]">
                <summary className="text-muted-foreground/40 cursor-pointer hover:text-muted-foreground transition-colors">
                    View Mermaid source
                </summary>
                <pre className="mt-1 p-2 bg-muted/10 rounded text-foreground/60 overflow-x-auto whitespace-pre-wrap text-[10px]">
                    {mermaidCode}
                </pre>
            </details>
        </div>
    );
}

// ─── Executive summary view ─────────────────────────────────────────────────

function ExecutiveView({ artifact }: { artifact: AgentArtifact }) {
    const rows = artifact.rows ?? [];
    const cols = artifact.columns ?? [];

    // Compute per-column summaries
    const colSummaries = cols.map(c => {
        const vals = rows.map(r => r[c.name]).filter(v => v !== null && v !== undefined);
        const isNum = vals.length > 0 && vals.every(v => !isNaN(Number(v)));
        const numVals = isNum ? vals.map(Number) : [];

        return {
            name: c.name,
            isNumeric: isNum,
            nonNull: vals.length,
            nullCount: rows.length - vals.length,
            ...(isNum && numVals.length > 0 ? {
                min: Math.min(...numVals),
                max: Math.max(...numVals),
                avg: numVals.reduce((a, b) => a + b, 0) / numVals.length,
                sum: numVals.reduce((a, b) => a + b, 0),
            } : {}),
            ...(!isNum && vals.length > 0 ? {
                uniqueCount: new Set(vals.map(String)).size,
                topValue: (() => {
                    const freq = new Map<string, number>();
                    vals.forEach(v => freq.set(String(v), (freq.get(String(v)) ?? 0) + 1));
                    return [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
                })(),
            } : {}),
        };
    });

    const numericCols = colSummaries.filter(c => c.isNumeric);
    const categoryCols = colSummaries.filter(c => !c.isNumeric);

    return (
        <div className="flex flex-col gap-4">
            {/* Key metrics banner */}
            <div className="flex items-center gap-6 py-2">
                <div>
                    <span className="text-2xl font-bold tabular-nums text-foreground">{rows.length}</span>
                    <span className="text-xs text-muted-foreground/50 ml-1">rows</span>
                </div>
                <div>
                    <span className="text-2xl font-bold tabular-nums text-foreground">{cols.length}</span>
                    <span className="text-xs text-muted-foreground/50 ml-1">columns</span>
                </div>
                {numericCols.length > 0 && (
                    <div>
                        <span className="text-2xl font-bold tabular-nums text-foreground">{numericCols.length}</span>
                        <span className="text-xs text-muted-foreground/50 ml-1">numeric</span>
                    </div>
                )}
            </div>

            {/* Numeric column highlights */}
            {numericCols.length > 0 && (
                <div>
                    <span className="text-[10px] font-semibold tracking-widest text-muted-foreground/50 uppercase">Numeric Highlights</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1.5">
                        {numericCols.map(c => (
                            <div key={c.name} className="rounded-md border border-border/50 bg-background p-2.5">
                                <div className="text-xs font-medium text-foreground mb-1">{c.name}</div>
                                <div className="grid grid-cols-4 gap-1 text-[11px]">
                                    <div>
                                        <span className="text-muted-foreground/50 block">min</span>
                                        <span className="text-foreground/80 font-mono tabular-nums">{c.min?.toLocaleString()}</span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground/50 block">max</span>
                                        <span className="text-foreground/80 font-mono tabular-nums">{c.max?.toLocaleString()}</span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground/50 block">avg</span>
                                        <span className="text-foreground/80 font-mono tabular-nums">{c.avg?.toFixed(2)}</span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground/50 block">sum</span>
                                        <span className="text-foreground/80 font-mono tabular-nums">{c.sum?.toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Categorical highlights */}
            {categoryCols.length > 0 && (
                <div>
                    <span className="text-[10px] font-semibold tracking-widest text-muted-foreground/50 uppercase">Categorical Summary</span>
                    <div className="flex flex-col gap-1 mt-1.5">
                        {categoryCols.map(c => (
                            <div key={c.name} className="flex items-baseline gap-3 text-xs py-1 border-b border-border/20 last:border-0">
                                <span className="font-medium text-foreground/80 w-28 truncate shrink-0">{c.name}</span>
                                <span className="text-muted-foreground/50 tabular-nums">{c.uniqueCount} unique</span>
                                {c.topValue && (
                                    <span className="text-muted-foreground/40 font-mono truncate">top: {c.topValue}</span>
                                )}
                                {c.nullCount > 0 && (
                                    <span className="text-amber-500/60 tabular-nums ml-auto">{c.nullCount} null</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Preview — first 5 rows */}
            {rows.length > 0 && cols.length > 0 && (
                <div>
                    <span className="text-[10px] font-semibold tracking-widest text-muted-foreground/50 uppercase">Data Preview</span>
                    <div className="overflow-x-auto mt-1.5">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-border/40">
                                    {cols.map(c => (
                                        <th key={c.name} className="text-left px-2 py-1 font-medium text-muted-foreground whitespace-nowrap">{c.name}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.slice(0, 5).map((row, ri) => (
                                    <tr key={ri} className="border-b border-border/20 last:border-0">
                                        {cols.map(c => (
                                            <td key={c.name} className="px-2 py-1 text-foreground/70 font-mono max-w-[150px] truncate">
                                                {row[c.name] === null || row[c.name] === undefined
                                                    ? <span className="text-muted-foreground/30 italic text-[10px]">null</span>
                                                    : String(row[c.name])}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {rows.length > 5 && (
                            <p className="text-[10px] text-muted-foreground/40 mt-1">+ {rows.length - 5} more rows</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Export dropdown ──────────────────────────────────────────────────────────

interface ExportAction {
    label: string;
    action: () => void | Promise<void>;
}

function ExportDropdown({ actions }: { actions: ExportAction[] }) {
    const [open, setOpen] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);

    if (actions.length === 0) return null;

    const handleAction = async (act: ExportAction) => {
        try {
            await act.action();
            setFeedback(act.label);
            setTimeout(() => setFeedback(null), 1500);
        } catch {
            // silently fail
        }
        setOpen(false);
    };

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(o => !o)}
                className={cn(
                    'text-[10px] font-medium px-1.5 py-1 rounded transition-colors',
                    feedback
                        ? 'text-emerald-500'
                        : 'text-muted-foreground/50 hover:text-muted-foreground',
                )}
            >
                {feedback ? `${feedback} done` : 'Export'}
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[120px]">
                        {actions.map(act => (
                            <button
                                key={act.label}
                                onClick={() => handleAction(act)}
                                className="w-full text-left px-3 py-1.5 text-xs text-foreground/80 hover:bg-muted transition-colors"
                            >
                                {act.label}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

// ─── Inline save form ────────────────────────────────────────────────────────

function SaveForm({ defaultTitle, onConfirm, onCancel, isPending }: {
    defaultTitle: string;
    onConfirm: (title: string, tags: string[]) => void;
    onCancel: () => void;
    isPending: boolean;
}) {
    const [title, setTitle] = useState(defaultTitle);
    const [tagsInput, setTagsInput] = useState('');

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
        onConfirm(title.trim() || defaultTitle, tags);
    };

    return (
        <form onSubmit={handleSubmit} className="flex items-center gap-2 flex-wrap">
            <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Title"
                className="text-xs bg-background border border-border rounded px-2 py-1 w-40 focus:outline-none focus:ring-1 focus:ring-primary/40"
                autoFocus
            />
            <input
                type="text"
                value={tagsInput}
                onChange={e => setTagsInput(e.target.value)}
                placeholder="Tags (comma-separated)"
                className="text-xs bg-background border border-border rounded px-2 py-1 w-44 focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
            <button
                type="submit"
                disabled={isPending || !title.trim()}
                className="text-[10px] font-medium px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors"
            >
                {isPending ? 'Saving...' : 'Save'}
            </button>
            <button
                type="button"
                onClick={onCancel}
                className="text-[10px] font-medium px-2 py-1 rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
                Cancel
            </button>
        </form>
    );
}

// ─── Main artifact component ──────────────────────────────────────────────────

export function ArtifactView({ artifact, connectionId, variant = 'chat', onExpand, onPin, onQuickSend, cachedAt }: ArtifactViewProps) {
    // Loading placeholder — show skeleton while tool is executing
    if (artifact.loading) {
        return (
            <div className="rounded-lg border border-border/60 bg-card overflow-hidden my-1">
                <div className="flex items-center gap-2 px-3 py-3 bg-muted/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                    <span className="text-xs text-muted-foreground/60">{artifact.title || 'Loading...'}</span>
                </div>
                <div className="p-3">
                    <div className="flex flex-col gap-2">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-4 bg-muted/30 rounded animate-pulse" style={{ width: `${90 - i * 15}%` }} />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // Detect special artifact types
    const artType = artifact.type as string;
    const isStats = artType === 'stats' && Array.isArray(artifact.stats);
    const isAnomalies = (artType === 'anomalies' && Array.isArray(artifact.anomalies)) || (artType === 'stat_block' && artifact.statBlockKind === 'anomalies');
    const isQuality = (artType === 'quality' && artifact.score != null) || (artType === 'stat_block' && artifact.statBlockKind === 'quality');
    const isJoins = artType === 'joins' && Array.isArray(artifact.paths);
    const isMetrics = artType === 'metrics';
    const isDiagram = artType === 'diagram' && !!artifact.mermaid;
    // New artifact types
    const isChart = artType === 'chart';
    const isStatBlock = artType === 'stat_block';
    const isReport = artType === 'report';
    const isFile = artType === 'file';
    const isSuggestions = artType === 'suggestions';
    const isPlan = artType === 'analysis_plan';
    const isSlideDeck = artType === 'slide_deck' && !!artifact.content;
    const isSpecial = isStats || isAnomalies || isQuality || isJoins || isMetrics || isDiagram
        || isChart || isStatBlock || isReport || isFile || isSuggestions || isPlan || isSlideDeck;

    const rows = artifact.rows ?? [];
    const cols = artifact.columns ?? [];

    const defaultMode = useMemo<ChartType>(() => {
        // Raw-row artifact types: always start in table view.
        // The agent explicitly used sample_rows or search_rows — the user wants to see rows.
        if (artType === 'sample' || artType === 'search') return 'table';
        if (isStats) return 'stats';
        if (isAnomalies) return 'anomalies';
        if (isQuality) return 'quality';
        if (isJoins) return 'joins';
        if (isMetrics) return 'metrics';
        if (isDiagram) return 'diagram';
        if (isChart) return 'chart';
        if (isStatBlock) return 'stat_block';
        if (isReport) return 'report';
        if (isFile) return 'file';
        if (isSuggestions) return 'suggestions';
        if (isPlan) return 'analysis_plan';
        if (isSlideDeck) return 'slide_deck';
        // Generic query results (run_query, compute_distribution, etc.) always
        // start in table view so the user immediately sees their data.
        // Chart toggle buttons (bar / line / pie) remain available for manual switch.
        return 'table';
    }, [artType, isStats, isAnomalies, isQuality, isJoins, isMetrics, isDiagram, isChart, isStatBlock, isReport, isFile, isSuggestions, isPlan, isSlideDeck]);

    const [mode, setMode] = useState<ChartType>(defaultMode);
    const [copied, setCopied] = useState(false);
    const chartRef = useRef<HTMLDivElement>(null);
    const [expandedRow, setExpandedRow] = useState<Record<string, unknown> | null>(null);

    // Save state
    const [saveTarget, setSaveTarget] = useState<'query' | 'chart' | null>(null);
    const [savedLabel, setSavedLabel] = useState<string | null>(null);
    const saveChartMutation = useSaveChart();

    const sqlSnippet = artifact.sql
        ? artifact.sql.replace(/\s+/g, ' ').trim().slice(0, 40)
        : 'query';

    const numCols = cols.filter(c => isNumericColumn(rows, c.name));
    const labelCol = cols.find(c => !isNumericColumn(rows, c.name)) ?? cols[0];

    const canBar = numCols.length >= 1 && !!labelCol && rows.length <= 50;
    const canLine = numCols.length >= 1 && !!labelCol && rows.length <= 100;
    const canPie = numCols.length === 1 && !!labelCol && rows.length <= 10;

    const chartData = rows.map(r => ({
        ...r,
        _label: String(r[labelCol?.name ?? ''] ?? ''),
    }));

    const specialLabel = isStats ? 'Stats' : isAnomalies ? 'Anomalies' : isQuality ? 'Quality' : isJoins ? 'Joins' : isMetrics ? 'Metrics' : isDiagram ? 'Diagram'
        : isChart ? (artifact.chartType ?? 'Chart') : isStatBlock ? 'Stats' : isReport ? 'Report' : isFile ? 'File' : isSuggestions ? 'Suggestions' : isPlan ? 'Plan' : isSlideDeck ? 'Slides' : '';

    // When locked=true (or any special type), show NO toggle buttons.
    // This is the core of the standalone-UI feature.
    const viewOptions = (isSpecial || artifact.locked)
        ? []
        : [
            { id: 'table' as ChartType, icon: TableIcon },
            ...(canBar  ? [{ id: 'bar'  as ChartType, icon: BarChart }] : []),
            ...(canLine ? [{ id: 'line' as ChartType, icon: LineChartIcon }] : []),
            ...(canPie  ? [{ id: 'pie'  as ChartType, icon: PieChartIcon }] : []),
            ...(rows.length > 0 ? [{ id: 'executive' as ChartType, label: 'Exec' }] : []),
        ];

    const tooltipStyle = {
        fontSize: 11,
        background: 'hsl(var(--background))',
        border: '1px solid hsl(var(--border))',
        borderRadius: 6,
    };

    // Header summary text
    let headerText = artifact.title ?? '';
    let headerMeta = '';
    if (isStats) {
        headerText = headerText || `${artifact.stats!.length} columns`;
        headerMeta = artifact.totalRows != null ? `· ${artifact.totalRows.toLocaleString()} rows` : '';
    } else if (isAnomalies) {
        headerText = headerText || 'Anomaly Detection';
        headerMeta = `· ${artifact.totalAnomalies ?? 0} found`;
    } else if (isQuality) {
        headerText = headerText || 'Quality Report';
        headerMeta = `· score ${artifact.score}`;
    } else if (isJoins) {
        headerText = headerText || 'Join Paths';
        headerMeta = `· ${artifact.paths?.length ?? 0} path${(artifact.paths?.length ?? 0) !== 1 ? 's' : ''}`;
    } else if (isMetrics) {
        headerText = headerText || 'Inferred Metrics';
    } else if (isDiagram) {
        headerText = headerText || 'Schema Diagram';
        const parts: string[] = [];
        if (artifact.tableCount) parts.push(`${artifact.tableCount} table${artifact.tableCount !== 1 ? 's' : ''}`);
        if (artifact.relationshipCount) parts.push(`${artifact.relationshipCount} relationship${artifact.relationshipCount !== 1 ? 's' : ''}`);
        headerMeta = parts.length > 0 ? `· ${parts.join(', ')}` : '';
    } else if (isChart) {
        headerText = headerText || (artifact.chartType ? artifact.chartType.charAt(0).toUpperCase() + artifact.chartType.slice(1) + ' Chart' : 'Chart');
        if (artifact.granularity) headerMeta = `· ${artifact.granularity}`;
        if (artifact.direction) headerMeta += ` · ${artifact.direction}`;
    } else if (isStatBlock) {
        headerText = headerText || 'Statistics';
    } else if (isReport) {
        headerText = headerText || 'Report';
        headerMeta = artifact.sections ? `· ${artifact.sections.length} section${artifact.sections.length !== 1 ? 's' : ''}` : '';
    } else if (isFile) {
        headerText = headerText || artifact.fileName || 'File';
        if (artifact.fileType) headerMeta = `· ${artifact.fileType.toUpperCase()}`;
    } else if (isSuggestions) {
        headerText = headerText || 'Suggested Analyses';
        headerMeta = artifact.suggestions ? `· ${artifact.suggestions.length} suggestion${artifact.suggestions.length !== 1 ? 's' : ''}` : '';
    } else if (isPlan) {
        headerText = headerText || 'Analysis Plan';
        headerMeta = artifact.planStepsData ? `· ${artifact.planStepsData.length} steps` : '';
    } else if (isSlideDeck) {
        headerText = headerText || 'Slide Deck';
        try {
            const deckObj = JSON.parse(artifact.content!);
            headerMeta = deckObj?.slides ? `· ${deckObj.slides.length} slides` : '';
        } catch { headerMeta = ''; }
    } else {
        headerText = headerText || `${rows.length} row${rows.length !== 1 ? 's' : ''}`;
        headerMeta = cols.length > 0 ? `· ${cols.length} col${cols.length !== 1 ? 's' : ''}` : '';
    }

    // Build export actions based on artifact type and current view mode
    const isChartMode = mode === 'bar' || mode === 'line' || mode === 'pie';
    const exportActions = useMemo<ExportAction[]>(() => {
        const actions: ExportAction[] = [];
        // Table artifacts with rows
        if (rows.length > 0 && cols.length > 0) {
            actions.push({ label: 'Excel', action: () => exportExcel(rows, cols, headerText) });
            actions.push({ label: 'CSV', action: () => exportCsv(rows, cols, headerText) });
            actions.push({ label: 'JSON', action: () => exportJson(rows, headerText) });
            actions.push({ label: 'Copy TSV', action: () => copyTsv(rows, cols) });
        }
        // Chart PNG (only when a chart is visible)
        if (isChartMode) {
            actions.push({ label: 'PNG', action: () => exportChartPng(chartRef.current, headerText) });
        }
        // Special types — JSON dump of the structured data
        if (isStats && artifact.stats) {
            actions.push({ label: 'JSON', action: () => exportJson(artifact.stats, headerText) });
        }
        if (isAnomalies && artifact.anomalies) {
            actions.push({ label: 'JSON', action: () => exportJson(artifact.anomalies, headerText) });
        }
        if (isQuality) {
            actions.push({ label: 'JSON', action: () => exportJson({ score: artifact.score, issues: artifact.issues, summary: artifact.summary }, headerText) });
        }
        if (isJoins && artifact.paths) {
            actions.push({ label: 'JSON', action: () => exportJson(artifact.paths, headerText) });
        }
        if (isMetrics) {
            actions.push({ label: 'JSON', action: () => exportJson({ identifiers: artifact.identifiers, dimensions: artifact.dimensions, measures: artifact.measures, timestamps: artifact.timestamps }, headerText) });
        }
        if (isDiagram && artifact.mermaid) {
            actions.push({ label: 'Mermaid', action: () => {
                const blob = new Blob([artifact.mermaid!], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${(headerText || 'diagram').replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_').slice(0, 60)}.mmd`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }});
            actions.push({ label: 'PNG', action: async () => {
                const container = document.querySelector('[data-diagram-container]');
                if (container) await exportChartPng(container as HTMLElement, headerText);
            }});
        }
        // HTML + PDF reports — available for all artifact types
        actions.push({ label: 'HTML Report', action: () => exportHtml(artifact, headerText) });
        actions.push({ label: 'PDF', action: () => exportPdf(artifact, headerText) });
        actions.push({ label: 'PPTX', action: () => exportPptx(artifact, headerText) });
        // Executive formats — only for table artifacts with data
        if (!isSpecial && rows.length > 0) {
            actions.push({ label: 'Executive HTML', action: () => exportExecutiveHtml(artifact, headerText) });
            actions.push({ label: 'Executive PDF', action: () => exportExecutivePdf(artifact, headerText) });
        }
        return actions;
    }, [rows, cols, headerText, isChartMode, isStats, isAnomalies, isQuality, isJoins, isMetrics, artifact]);

    return (
        <div className="rounded-lg border border-border/60 bg-card overflow-hidden my-1 shadow-sm">
            {/* Header: title + summary meta */}
            <div className="flex items-center justify-between px-3 h-10 bg-muted/20 border-b border-border/40">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-semibold text-foreground truncate">{headerText}</span>
                    {headerMeta && (
                        <span className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0">{headerMeta}</span>
                    )}
                    {variant === 'card' && artifact.streaming && (
                        <span className="flex items-center gap-1 ml-1">
                            <span className="w-1 h-1 rounded-full bg-blue-500 animate-pulse" />
                        </span>
                    )}
                    {cachedAt && !artifact.streaming && variant === 'card' && (
                        <span className="text-[9px] text-muted-foreground/40" title={`Cached at ${new Date(cachedAt).toLocaleTimeString()}`}>
                            cached
                        </span>
                    )}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1 shrink-0 ml-4">
                    {/* View toggles — only if not special/locked */}
                    {!isSpecial && !artifact.locked && viewOptions.length > 0 && (
                        <div className="flex items-center gap-0.5 mr-2 pr-2 border-r border-border/30">
                            {viewOptions.map(v => (
                                <button
                                    key={v.id}
                                    onClick={() => setMode(v.id)}
                                    className={cn(
                                        'p-1.5 rounded transition-colors',
                                        mode === v.id
                                            ? 'bg-primary/10 text-primary font-bold'
                                            : 'text-muted-foreground/40 hover:text-muted-foreground',
                                    )}
                                    title={v.id}
                                >
                                    {'icon' in v && v.icon ? <v.icon className="w-3.5 h-3.5" /> : (
                                        <span className="text-[10px] uppercase font-bold tracking-tighter">{'label' in v ? v.label : v.id}</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}

                    {variant === 'chat' && (
                        <>
                            <ExportDropdown actions={exportActions} />
                            {onPin && (
                                <button
                                    onClick={() => onPin(artifact)}
                                    className="p-1.5 text-muted-foreground/40 hover:text-primary transition-colors shrink-0"
                                    title="Pin to dashboard"
                                >
                                    <PinIcon className="w-3.5 h-3.5" />
                                </button>
                            )}
                            {onExpand && (
                                <button
                                    onClick={() => onExpand(artifact)}
                                    className="p-1.5 text-muted-foreground/40 hover:text-primary transition-colors shrink-0"
                                    title="Expand view"
                                >
                                    <Maximize2 className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Inline save form */}
            {saveTarget && connectionId && artifact.sql && (
                <div className="px-3 py-2 border-b border-border/40 bg-muted/10">
                    <SaveForm
                        defaultTitle={sqlSnippet}
                        isPending={saveChartMutation.isPending}
                        onCancel={() => setSaveTarget(null)}
                        onConfirm={(title, tags) => {
                            const chartType = mode as string;
                            const config = {
                                chartType: chartType as 'bar' | 'line' | 'pie',
                                title,
                                xAxisKey: labelCol?.name ?? '',
                                yAxisKeys: numCols.map(c => c.name),
                            };
                            saveChartMutation.mutate({
                                connectionId,
                                title,
                                chartType,
                                config,
                                sql: artifact.sql!,
                                tags,
                            }, {
                                onSuccess: () => {
                                    setSaveTarget(null);
                                    setSavedLabel('chart');
                                    setTimeout(() => setSavedLabel(null), 3000);
                                },
                            });
                        }}
                    />
                </div>
            )}

            {/* Content */}
            <div className="p-3">
                {/* ── New standalone artifact types ──────────────────────────── */}
                {isChart && <ChartView artifact={artifact} height={200} />}
                {isStatBlock && <StatBlockView artifact={artifact} />}
                {isReport && <ReportView artifact={artifact} />}
                {isFile && <FileView artifact={artifact} />}
                {isSuggestions && <SuggestionsView artifact={artifact} />}
                {isPlan && <PlanView artifact={artifact} onProceed={onQuickSend} />}
                {isSlideDeck && artifact.content && <SlidePreviewView content={artifact.content} height={320} />}

                {/* ── Legacy special types ────────────────────────────────────── */}
                {mode === 'stats' && isStats && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        {artifact.stats!.map(stat => (
                            <StatCard key={stat.name} stat={stat} />
                        ))}
                    </div>
                )}

                {mode === 'anomalies' && isAnomalies && (
                    <AnomaliesView
                        anomalies={artifact.anomalies!}
                        scannedColumns={artifact.scannedColumns ?? 0}
                        totalAnomalies={artifact.totalAnomalies ?? 0}
                    />
                )}

                {mode === 'quality' && isQuality && (
                    <QualityView
                        score={artifact.score!}
                        summary={artifact.summary ?? ''}
                        issues={artifact.issues ?? []}
                    />
                )}

                {mode === 'joins' && isJoins && (
                    <JoinsView paths={artifact.paths!} />
                )}

                {mode === 'metrics' && isMetrics && (
                    <MetricsView
                        identifiers={artifact.identifiers ?? []}
                        dimensions={artifact.dimensions ?? []}
                        measures={artifact.measures ?? []}
                        timestamps={artifact.timestamps ?? []}
                    />
                )}

                {mode === 'diagram' && isDiagram && (
                    <div data-diagram-container>
                        <DiagramView mermaid={artifact.mermaid!} title={artifact.title} />
                    </div>
                )}

                {mode === 'executive' && rows.length > 0 && (
                    <ExecutiveView artifact={artifact} />
                )}

                {mode === 'table' && (
                    <div>
                        <div className="overflow-x-auto max-h-72 overflow-y-auto [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full">
                            <table className="w-full text-xs">
                                <thead className="sticky top-0 z-10 bg-card">
                                    <tr className="border-b border-border/40">
                                        {cols.map(c => (
                                            <th key={c.name} className="text-left px-2 py-1.5 font-medium text-muted-foreground whitespace-nowrap bg-muted/30">
                                                {c.name}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.slice(0, 50).map((row, ri) => (
                                        <tr
                                            key={ri}
                                            className={cn(
                                                'border-b border-border/20 last:border-0 hover:bg-muted/20 cursor-pointer',
                                                expandedRow === row && 'bg-muted/30',
                                            )}
                                            onClick={() => setExpandedRow(prev => prev === row ? null : row)}
                                        >
                                            {cols.map(c => {
                                                const val = row[c.name];
                                                const str = val === null || val === undefined ? null : String(val);
                                                return (
                                                    <td key={c.name}
                                                        className="px-2 py-1 text-foreground/80 max-w-[160px] truncate"
                                                        title={str ?? ''}
                                                    >
                                                        {str === null
                                                            ? <span className="text-muted-foreground/30 italic text-[10px]">null</span>
                                                            : str}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {rows.length > 50 && !artifact.streaming && (
                                <p className="text-center text-xs text-muted-foreground py-2">
                                    Showing 50 of {rows.length} rows
                                </p>
                            )}
                            {artifact.streaming && (
                                <div className="flex items-center justify-center gap-2 py-2">
                                    <span className="w-1 h-1 rounded-full bg-blue-500 animate-pulse" />
                                    <span className="text-xs text-blue-500/60">{rows.length} rows loaded...</span>
                                </div>
                            )}
                        </div>

                        {/* Row detail panel — click any row to expand */}
                        {expandedRow && (
                            <div className="border-t border-border/40 bg-muted/10 px-3 py-2.5">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Row Detail</span>
                                    <button
                                        onClick={() => setExpandedRow(null)}
                                        className="text-[10px] text-muted-foreground/40 hover:text-foreground/60 transition-colors"
                                    >
                                        ✕ close
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 gap-1 max-h-48 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full">
                                    {cols.map(c => {
                                        const val = expandedRow[c.name];
                                        const str = val === null || val === undefined ? null : String(val);
                                        return (
                                            <div key={c.name} className="flex gap-2 text-xs min-w-0">
                                                <span className="shrink-0 w-28 text-muted-foreground/60 font-mono truncate text-right">{c.name}</span>
                                                <span className="text-border/60">·</span>
                                                <span className="text-foreground/80 break-all">
                                                    {str === null
                                                        ? <span className="italic text-muted-foreground/30">null</span>
                                                        : str}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {mode === 'bar' && canBar && (
                    <div ref={chartRef}>
                        <ResponsiveContainer width="100%" height={200}>
                            <ReBarChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                                <XAxis dataKey="_label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
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
                        <ResponsiveContainer width="100%" height={200}>
                            <LineChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                                <XAxis dataKey="_label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
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
                        <ResponsiveContainer width="100%" height={200}>
                            <PieChart>
                                <Pie data={chartData} dataKey={numCols[0]?.name ?? ''}
                                    nameKey="_label" cx="50%" cy="50%" outerRadius={75}
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

            {artifact.sql && (
                <details className="border-t border-border/30 group">
                    <summary className="px-3 py-1.5 text-[11px] text-muted-foreground/60 cursor-pointer hover:text-muted-foreground hover:bg-muted/20 transition-colors select-none">
                        View SQL
                    </summary>
                    <pre className="px-3 pb-3 pt-1 text-[11px] font-mono text-foreground/70 overflow-x-auto bg-muted/10">{artifact.sql}</pre>
                </details>
            )}
        </div>
    );
}
