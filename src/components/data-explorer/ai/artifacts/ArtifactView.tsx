import { useState, useEffect, useMemo, useRef, type FormEvent } from 'react';
import { BarChart, LineChart as LineChartIcon, PieChart as PieChartIcon, TableIcon, Maximize2, PinIcon, ChevronDown, ChevronUp, HelpCircle, Check } from 'lucide-react';
import {
    BarChart as ReBarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/utils';
import { CHART_COLORS, ChartType, isNumericColumn } from './chartUtils';
import { exportCsv, exportJson, copyTsv, exportChartPng, exportExcel } from './exportUtils';
import { exportHtml, exportExecutiveHtml } from './htmlReport';
import { exportPdf, exportExecutivePdf } from './pdfReport';
import { useSaveChart } from '@/hooks/useCharts';
import { ChartView } from './views/ChartView';
import { StatBlockView } from './views/StatBlockView';
import { FileView } from './views/FileView';
import { ClarificationView } from './views/ClarificationView';
import type { AgentArtifact } from '@/hooks/useAIAgent';
interface ArtifactViewProps {
    artifact: AgentArtifact;
    connectionId?: string;
    variant?: 'chat' | 'card';
    onExpand?: (artifact: AgentArtifact) => void;
    onPin?: (artifact: AgentArtifact) => void;
    isPinned?: boolean;
    onQuickSend?: (message: string) => void;
    cachedAt?: number | null;
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
                    <span className="text-xs text-muted-foreground ml-1">rows</span>
                </div>
                <div>
                    <span className="text-2xl font-bold tabular-nums text-foreground">{cols.length}</span>
                    <span className="text-xs text-muted-foreground ml-1">columns</span>
                </div>
                {numericCols.length > 0 && (
                    <div>
                        <span className="text-2xl font-bold tabular-nums text-foreground">{numericCols.length}</span>
                        <span className="text-xs text-muted-foreground ml-1">numeric</span>
                    </div>
                )}
            </div>

            {/* Numeric column highlights */}
            {numericCols.length > 0 && (
                <div>
                    <span className="text-[10px] font-semibold tracking-widest text-muted-foreground/80 uppercase">Numeric Highlights</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1.5">
                        {numericCols.map(c => (
                            <div key={c.name} className="rounded-md border border-border/50 bg-background p-2.5">
                                <div className="text-xs font-medium text-foreground mb-1">{c.name}</div>
                                <div className="grid grid-cols-4 gap-1 text-[11px]">
                                    <div>
                                        <span className="text-muted-foreground/80 block">min</span>
                                        <span className="text-foreground font-mono tabular-nums">{c.min?.toLocaleString()}</span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground/80 block">max</span>
                                        <span className="text-foreground font-mono tabular-nums">{c.max?.toLocaleString()}</span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground/80 block">avg</span>
                                        <span className="text-foreground font-mono tabular-nums">{c.avg?.toFixed(2)}</span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground/80 block">sum</span>
                                        <span className="text-foreground font-mono tabular-nums">{c.sum?.toLocaleString()}</span>
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
                    <span className="text-[10px] font-semibold tracking-widest text-muted-foreground/80 uppercase">Categorical Summary</span>
                    <div className="flex flex-col gap-1 mt-1.5">
                        {categoryCols.map(c => (
                            <div key={c.name} className="flex items-baseline gap-3 text-xs py-1 border-b border-border/20 last:border-0">
                                <span className="font-medium text-foreground w-28 truncate shrink-0">{c.name}</span>
                                <span className="text-muted-foreground/80 tabular-nums">{c.uniqueCount} unique</span>
                                {c.topValue && (
                                    <span className="text-muted-foreground/75 font-mono truncate">top: {c.topValue}</span>
                                )}
                                {c.nullCount > 0 && (
                                    <span className="text-amber-500/80 tabular-nums ml-auto">{c.nullCount} null</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Preview — first 5 rows */}
            {rows.length > 0 && cols.length > 0 && (
                <div>
                    <span className="text-[10px] font-semibold tracking-widest text-muted-foreground/80 uppercase">Data Preview</span>
                    <div className="overflow-x-auto mt-1.5">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-border/60">
                                    {cols.map(c => (
                                        <th key={c.name} className="text-left px-2 py-1 font-semibold text-foreground whitespace-nowrap">{c.name}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.slice(0, 5).map((row, ri) => (
                                    <tr key={ri} className="border-b border-border/20 last:border-0">
                                        {cols.map(c => (
                                            <td key={c.name} className="px-2 py-1 text-foreground font-normal font-mono max-w-[150px] truncate">
                                                {row[c.name] === null || row[c.name] === undefined
                                                    ? <span className="text-muted-foreground/75 italic text-[11px]">null</span>
                                                    : String(row[c.name])}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {rows.length > 5 && (
                            <p className="text-[10px] text-muted-foreground/75 mt-1">+ {rows.length - 5} more rows</p>
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

export function ArtifactView({ artifact, connectionId, variant = 'chat', onExpand, onPin, isPinned = false, onQuickSend, cachedAt }: ArtifactViewProps) {
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

    // Detect special artifact types. The backend emits generic renderer types
    // ('chart', 'stat_block', 'file', 'clarification'); previewType is kept as a
    // forward-compat fallback so previously-persisted artifacts still render.
    const artType = artifact.type as string;
    const previewType = artifact.previewType as string | undefined;
    const isChart = artType === 'chart' || previewType === 'chart';
    const isStatBlock = artType === 'stat_block' || previewType === 'stat_block';
    const isFile = artType === 'file';
    const isClarification = artType === 'clarification';
    const isSpecial = isChart || isStatBlock || isFile || isClarification;

    const isAnswered = Boolean(artifact.answered || artifact.answer);
    const [isClarificationCollapsed, setIsClarificationCollapsed] = useState<boolean>(() => isClarification ? isAnswered : false);

    useEffect(() => {
        if (isClarification && isAnswered) {
            setIsClarificationCollapsed(true);
        }
    }, [isClarification, isAnswered]);

    const rows = artifact.rows ?? [];
    const cols = artifact.columns ?? [];

    const defaultMode = useMemo<ChartType>(() => {
        if (isChart) return 'chart';
        if (isStatBlock) return 'stat_block';
        if (isFile) return 'file';
        if (isClarification) return 'clarification';
        // Generic query results (run_query) always start in table view so the
        // user immediately sees their data. Chart toggle buttons (bar / line /
        // pie) remain available for manual switch.
        return 'table';
    }, [isChart, isStatBlock, isFile, isClarification]);

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

    const specialLabel = isChart ? (artifact.chartType ?? 'Chart') : isStatBlock ? 'Stats' : isFile ? 'File' : isClarification ? 'Clarification' : '';

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
    if (isChart) {
        headerText = headerText || (artifact.chartType ? artifact.chartType.charAt(0).toUpperCase() + artifact.chartType.slice(1) + ' Chart' : 'Chart');
        if (artifact.granularity) headerMeta = `· ${artifact.granularity}`;
        if (artifact.direction) headerMeta += ` · ${artifact.direction}`;
    } else if (isStatBlock) {
        headerText = headerText || 'Statistics';
        const kind = artifact.statBlockKind;
        if (kind === 'anomalies') {
            headerText = headerText || 'Anomaly Detection';
        } else if (kind === 'quality') {
            headerText = headerText || 'Quality Report';
            const qScore = artifact.qualityScore ?? artifact.score;
            headerMeta = qScore != null ? `· score ${qScore}` : '';
        } else if (kind === 'regression') {
            headerText = headerText || 'Regression Analysis';
        }
    } else if (isFile) {
        headerText = headerText || artifact.fileName || 'File';
        if (artifact.fileType) headerMeta = `· ${artifact.fileType.toUpperCase()}`;
    } else if (isClarification) {
        headerText = headerText || 'Clarification Needed';
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
        // HTML + PDF reports — available for all artifact types
        actions.push({ label: 'HTML Report', action: () => exportHtml(artifact, headerText) });
        actions.push({ label: 'PDF', action: () => exportPdf(artifact, headerText) });
        // Executive formats — only for table artifacts with data
        if (!isSpecial && rows.length > 0) {
            actions.push({ label: 'Executive HTML', action: () => exportExecutiveHtml(artifact, headerText) });
            actions.push({ label: 'Executive PDF', action: () => exportExecutivePdf(artifact, headerText) });
        }
        return actions;
    }, [rows, cols, headerText, isChartMode, artifact]);

    return (
        <div className={cn(
            'rounded-lg border border-border/60 bg-card overflow-hidden my-1 shadow-sm transition-all duration-200',
            isClarification && isAnswered && 'border-border/40 bg-card/60'
        )}>
            {/* Header: title + summary meta */}
            <div
                onClick={isClarification ? () => setIsClarificationCollapsed(c => !c) : undefined}
                className={cn(
                    'flex items-center justify-between px-3 h-10 bg-muted/20',
                    (!isClarification || !isClarificationCollapsed) && 'border-b border-border/40',
                    isClarification && 'cursor-pointer select-none hover:bg-muted/30 transition-colors'
                )}
            >
                <div className="flex items-center gap-2 min-w-0">
                    {isClarification && (
                        <HelpCircle className={cn('w-3.5 h-3.5 shrink-0', isAnswered ? 'text-emerald-500' : 'text-blue-500')} />
                    )}
                    <span className="text-xs font-semibold text-foreground truncate">
                        {isClarification && isAnswered ? 'Clarification Answered' : headerText}
                    </span>
                    {isClarification && isAnswered && artifact.answer && (
                        <span className="text-[11px] text-muted-foreground font-normal truncate">
                            · &quot;{artifact.answer}&quot;
                        </span>
                    )}
                    {isClarification && (
                        isAnswered ? (
                            <span className="text-[9px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded shrink-0">
                                Resolved
                            </span>
                        ) : (
                            <span className="text-[9px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded shrink-0">
                                Action Needed
                            </span>
                        )
                    )}
                    {!isClarification && headerMeta && (
                        <span className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0">{headerMeta}</span>
                    )}
                    {variant === 'card' && artifact.streaming && (
                        <span className="flex items-center gap-1 ml-1">
                            <span className="w-1 h-1 rounded-full bg-blue-500 animate-pulse" />
                        </span>
                    )}
                    {cachedAt && !artifact.streaming && variant === 'card' && (
                        <span className="text-[9px] text-muted-foreground/75 font-medium" title={`Cached at ${new Date(cachedAt).toLocaleTimeString()}`}>
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
                                            : 'text-muted-foreground hover:text-foreground',
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
                            {!isFile && !isClarification && <ExportDropdown actions={exportActions} />}
                            {onPin && !isClarification && (
                                <button
                                    onClick={() => onPin(artifact)}
                                    className={cn(
                                        'p-1.5 transition-colors shrink-0',
                                        isPinned
                                            ? 'text-primary hover:text-primary/80'
                                            : 'text-muted-foreground hover:text-primary',
                                    )}
                                    title={isPinned ? 'Pinned to dashboard' : 'Pin to dashboard'}
                                >
                                    <PinIcon className={cn('w-3.5 h-3.5', isPinned && 'fill-primary')} />
                                </button>
                            )}
                            {onExpand && !isClarification && (
                                <button
                                    onClick={() => onExpand(artifact)}
                                    className="p-1.5 text-muted-foreground hover:text-primary transition-colors shrink-0"
                                    title="Expand view"
                                >
                                    <Maximize2 className="w-3.5 h-3.5" />
                                </button>
                            )}
                            {isClarification && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsClarificationCollapsed(c => !c);
                                    }}
                                    className="p-1 text-muted-foreground/60 hover:text-foreground rounded transition-colors shrink-0"
                                    title={isClarificationCollapsed ? 'Expand clarification' : 'Collapse clarification'}
                                >
                                    {isClarificationCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
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
            {(!isClarification || !isClarificationCollapsed) && (
                <div className="p-3">
                    {/* ── Standalone artifact types ───────────────────────────── */}
                    {isChart && <ChartView artifact={artifact} height={200} />}
                    {isStatBlock && <StatBlockView artifact={artifact} />}
                    {isFile && <FileView artifact={artifact} onView={onExpand} />}
                    {isClarification && (
                        <ClarificationView
                            artifact={artifact}
                            onSelect={answer => {
                                onQuickSend?.(answer);
                                setIsClarificationCollapsed(true);
                            }}
                            answered={isAnswered}
                            answer={artifact.answer}
                        />
                    )}

                    {mode === 'executive' && rows.length > 0 && (
                        <ExecutiveView artifact={artifact} />
                    )}

                {mode === 'table' && (
                    <div>
                        <div className="overflow-x-auto max-h-72 overflow-y-auto [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full">
                            <table className="w-full text-xs">
                                <thead className="sticky top-0 z-10 bg-card">
                                    <tr className="border-b border-border/60">
                                        {cols.map(c => (
                                            <th key={c.name} className="text-left px-2 py-1.5 font-semibold text-foreground whitespace-nowrap bg-muted/60 border-b border-border/60">
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
                                                        className="px-2 py-1 text-foreground font-normal max-w-[160px] truncate"
                                                        title={str ?? ''}
                                                    >
                                                        {str === null
                                                            ? <span className="text-muted-foreground/75 italic text-[11px]">null</span>
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
                                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Row Detail</span>
                                    <button
                                        onClick={() => setExpandedRow(null)}
                                        className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
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
                                                <span className="shrink-0 w-28 text-muted-foreground font-mono truncate text-right">{c.name}</span>
                                                <span className="text-border/60">·</span>
                                                <span className="text-foreground font-normal break-all">
                                                    {str === null
                                                        ? <span className="italic text-muted-foreground/75">null</span>
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
            )}

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
