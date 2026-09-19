// =============================================================================
// ArtifactPanel — expanded side panel for viewing artifacts at full size
// =============================================================================

import { useState, useMemo, useRef } from 'react';
import { X, Copy, Check, Database, BarChart, LineChart as LineChartIcon, PieChart as PieChartIcon, TableIcon, FileSpreadsheet } from 'lucide-react';
import {
    BarChart as ReBarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/utils';
import { CHART_COLORS, ChartType, isNumericColumn } from './chartUtils';
import { exportCsv, exportChartPng } from './exportUtils';
import { exportHtml } from './htmlReport';
import { exportPdf } from './pdfReport';
import { ChartView } from './views/ChartView';
import { StatBlockView } from './views/StatBlockView';
import { FileView } from './views/FileView';
import { FilePreviewView } from './views/FilePreviewView';
import type { AgentArtifact } from '@/hooks/useAIAgent';

interface ArtifactPanelProps {
    artifact: AgentArtifact;
    onClose: () => void;
    onQuickSend?: (message: string) => void;
}

// =============================================================================
// ArtifactPanel
// =============================================================================

export function ArtifactPanel({ artifact, onClose }: ArtifactPanelProps) {
    const artType = artifact.type as string;
    const isChart = artType === 'chart' || artifact.previewType === 'chart';
    const isStatBlock = artType === 'stat_block' || artifact.previewType === 'stat_block';
    const isFile = artType === 'file' || Boolean(artifact.fileType) || Boolean(artifact.fileName) || Boolean((artifact as any).format) || Boolean(artifact.downloadUrl) || Boolean(artifact.key);
    const isSpecial = isChart || isStatBlock || isFile;

    const rows = artifact.rows ?? [];
    const cols = useMemo(() => {
        const rawCols = artifact.columns;
        if (Array.isArray(rawCols) && rawCols.length > 0) {
            return rawCols.map(c => typeof c === 'string' ? { name: c } : c);
        }
        if (rows.length > 0 && typeof rows[0] === 'object' && rows[0] !== null) {
            return Object.keys(rows[0]).map(name => ({ name }));
        }
        return [];
    }, [artifact.columns, rows]);

    const defaultMode = useMemo<ChartType>(() => {
        if (isChart) return 'chart';
        if (isStatBlock) return 'stat_block';
        if (isFile) return 'file';
        return 'table';
    }, [isChart, isStatBlock, isFile]);

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
    if (isChart) headerText = headerText || (artifact.chartType ? artifact.chartType.charAt(0).toUpperCase() + artifact.chartType.slice(1) + ' Chart' : 'Chart');
    else if (isStatBlock) headerText = headerText || 'Statistics';
    else if (isFile) headerText = headerText || artifact.fileName || 'File Preview';
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
        }
    };

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Panel header — only rendered for non-file artifacts (tables, charts, stat blocks). FilePreviewView renders its own unified header with controls and close button */}
            {!isFile && (
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
                        <button onClick={onClose} className="p-1.5 rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors ml-1">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* Body */}
            {isFile ? (
                <div className="flex-1 overflow-hidden">
                    <FilePreviewView artifact={artifact} onClose={onClose} />
                </div>
            ) : (
                <div className="flex-1 overflow-auto p-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full">
                    {/* ── Standalone artifact types ───────────────────── */}
                    {isChart && <ChartView artifact={artifact} height={260} />}
                    {isStatBlock && <StatBlockView artifact={artifact} />}

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
                                        {cols.map(c => {
                                            const val = row[c.name];
                                            let str: string | null = null;
                                            if (val === null || val === undefined) {
                                                str = null;
                                            } else if (typeof val === 'object') {
                                                str = JSON.stringify(val);
                                            } else {
                                                str = String(val);
                                            }
                                            return (
                                                <td key={c.name} className="px-3 py-2 text-foreground/80 whitespace-nowrap" title={str ?? ''}>
                                                    {str === null
                                                        ? <span className="text-muted-foreground/30 italic text-xs">null</span>
                                                        : str}
                                                </td>
                                            );
                                        })}
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
        )}

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
