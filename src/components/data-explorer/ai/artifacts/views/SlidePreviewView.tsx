// =============================================================================
// SlidePreviewView — renders a JSON slide deck as navigable slides.
// Supports layouts: title, metric_grid, chart, table, text, bullet, two_column
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { cn } from '@/lib/utils';

const CHART_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'];

// ─── Slide Renderers ──────────────────────────────────────────────────────────

function TitleSlideView({ slide }: { slide: any }) {
    return (
        <div className="flex flex-col items-center justify-center h-full text-center gap-3 px-8">
            <h1 className="text-2xl font-bold text-foreground">{slide.title}</h1>
            {slide.subtitle && <p className="text-base text-muted-foreground">{slide.subtitle}</p>}
        </div>
    );
}

function MetricGridSlideView({ slide }: { slide: any }) {
    const metrics = slide.metrics || [];
    return (
        <div className="flex flex-col gap-4 h-full px-4 py-3">
            <h2 className="text-lg font-semibold text-foreground">{slide.title}</h2>
            <div className={cn(
                'grid gap-3 flex-1',
                metrics.length <= 2 ? 'grid-cols-2' :
                metrics.length <= 4 ? 'grid-cols-2' : 'grid-cols-3'
            )}>
                {metrics.map((m: any, i: number) => (
                    <div key={i} className="rounded-lg border border-border/40 bg-muted/20 p-3 flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground/70">{m.label}</span>
                        <span className="text-xl font-bold text-foreground tabular-nums">{m.value}</span>
                        {m.delta && (
                            <span className={cn(
                                'text-xs font-medium',
                                m.trend === 'up' ? 'text-emerald-500' :
                                m.trend === 'down' ? 'text-red-500' : 'text-muted-foreground'
                            )}>
                                {m.delta}
                                {m.period && <span className="text-muted-foreground/60 font-normal ml-1">{m.period}</span>}
                            </span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

function ChartSlideView({ slide }: { slide: any }) {
    const labels: string[] = slide.labels || [];
    const series: { name: string; values: number[] }[] = slide.series || [];

    const data = labels.map((label, i) => {
        const row: Record<string, any> = { label };
        series.forEach(s => { row[s.name] = s.values[i] ?? null; });
        return row;
    });

    const tooltipStyle = {
        fontSize: 11,
        background: 'hsl(var(--background))',
        border: '1px solid hsl(var(--border))',
        borderRadius: 6,
    };

    return (
        <div className="flex flex-col gap-3 h-full px-4 py-3">
            <h2 className="text-lg font-semibold text-foreground">{slide.title}</h2>
            <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    {slide.chart_type === 'pie' ? (
                        <PieChart>
                            <Pie data={data} dataKey={series[0]?.name ?? ''} nameKey="label"
                                cx="50%" cy="50%" outerRadius="70%"
                                label={({ name, percent }: any) => `${name} (${(percent * 100).toFixed(0)}%)`}
                                labelLine={false}>
                                {data.map((_, idx) => (
                                    <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip contentStyle={tooltipStyle} />
                        </PieChart>
                    ) : slide.chart_type === 'line' || slide.chart_type === 'area' ? (
                        <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                            <Tooltip contentStyle={tooltipStyle} />
                            {series.length > 1 && <Legend />}
                            {series.map((s, idx) => (
                                <Line key={s.name} type="monotone" dataKey={s.name}
                                    stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                                    strokeWidth={2} dot={false} />
                            ))}
                        </LineChart>
                    ) : (
                        <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                            <Tooltip contentStyle={tooltipStyle} />
                            {series.length > 1 && <Legend />}
                            {series.map((s, idx) => (
                                <Bar key={s.name} dataKey={s.name}
                                    fill={CHART_COLORS[idx % CHART_COLORS.length]}
                                    radius={[3, 3, 0, 0]} />
                            ))}
                        </BarChart>
                    )}
                </ResponsiveContainer>
            </div>
        </div>
    );
}

function TableSlideView({ slide }: { slide: any }) {
    const columns: string[] = slide.columns || [];
    const rows: any[][] = slide.rows || [];
    return (
        <div className="flex flex-col gap-3 h-full px-4 py-3 overflow-hidden">
            <h2 className="text-lg font-semibold text-foreground">{slide.title}</h2>
            <div className="flex-1 overflow-auto">
                <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background">
                        <tr className="border-b border-border/40">
                            {columns.map(c => (
                                <th key={c} className="text-left px-2 py-1.5 text-xs font-medium text-muted-foreground">{c}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, ri) => (
                            <tr key={ri} className="border-b border-border/20 last:border-0">
                                {row.map((cell, ci) => (
                                    <td key={ci} className="px-2 py-1.5 text-xs text-foreground/80">
                                        {cell === null ? <span className="text-muted-foreground/30 italic">null</span> : String(cell)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function TextSlideView({ slide }: { slide: any }) {
    return (
        <div className="flex flex-col gap-3 h-full px-4 py-3">
            <h2 className="text-lg font-semibold text-foreground">{slide.title}</h2>
            <p className="text-sm text-muted-foreground/80 leading-relaxed flex-1">{slide.body}</p>
        </div>
    );
}

function BulletSlideView({ slide }: { slide: any }) {
    return (
        <div className="flex flex-col gap-3 h-full px-4 py-3">
            <h2 className="text-lg font-semibold text-foreground">{slide.title}</h2>
            <ul className="space-y-2 flex-1">
                {(slide.bullets || []).map((b: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                        <span className="mt-1 w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
                        {b}
                    </li>
                ))}
            </ul>
        </div>
    );
}

function TwoColumnSlideView({ slide }: { slide: any }) {
    return (
        <div className="flex flex-col gap-3 h-full px-4 py-3">
            <h2 className="text-lg font-semibold text-foreground">{slide.title}</h2>
            <div className="grid grid-cols-2 gap-4 flex-1">
                {[slide.left, slide.right].map((col, i) => col ? (
                    <div key={i} className="flex flex-col gap-2 rounded-lg border border-border/40 p-3">
                        <span className="text-sm font-medium text-foreground">{col.heading}</span>
                        <p className="text-xs text-muted-foreground/80 leading-relaxed">{col.body}</p>
                    </div>
                ) : null)}
            </div>
        </div>
    );
}

// ─── Slide Router ─────────────────────────────────────────────────────────────

function SlideView({ slide }: { slide: any }) {
    switch (slide.layout) {
        case 'title':       return <TitleSlideView slide={slide} />;
        case 'metric_grid': return <MetricGridSlideView slide={slide} />;
        case 'chart':       return <ChartSlideView slide={slide} />;
        case 'table':       return <TableSlideView slide={slide} />;
        case 'text':        return <TextSlideView slide={slide} />;
        case 'bullet':      return <BulletSlideView slide={slide} />;
        case 'two_column':  return <TwoColumnSlideView slide={slide} />;
        default:
            return (
                <div className="flex items-center justify-center h-full">
                    <p className="text-sm text-muted-foreground">Unknown layout: {slide.layout}</p>
                </div>
            );
    }
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface SlidePreviewViewProps {
    content: string;   // raw JSON string from workspace file
    height?: number;   // default 400
}

export function SlidePreviewView({ content, height = 400 }: SlidePreviewViewProps) {
    const [currentSlide, setCurrentSlide] = useState(0);

    let deck: any = null;
    try {
        deck = JSON.parse(content);
    } catch {
        return (
            <div className="flex items-center justify-center" style={{ height }}>
                <p className="text-sm text-muted-foreground">Invalid slide deck JSON</p>
            </div>
        );
    }

    const slides: any[] = deck?.slides || [];
    if (slides.length === 0) {
        return (
            <div className="flex items-center justify-center" style={{ height }}>
                <p className="text-sm text-muted-foreground">No slides</p>
            </div>
        );
    }

    const slide = slides[Math.min(currentSlide, slides.length - 1)];

    // Keyboard navigation
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'ArrowLeft') setCurrentSlide(i => Math.max(0, i - 1));
        if (e.key === 'ArrowRight') setCurrentSlide(i => Math.min(slides.length - 1, i + 1));
    }, [slides.length]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    return (
        <div className="flex flex-col rounded-lg border border-border/40 overflow-hidden" style={{ height }}>
            {/* Deck title */}
            {deck.title && (
                <div className="px-3 py-1.5 border-b border-border/30 bg-muted/10">
                    <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">{deck.title}</span>
                </div>
            )}

            {/* Slide area */}
            <div className="flex-1 min-h-0 bg-background">
                <SlideView slide={slide} />
            </div>

            {/* Navigation bar */}
            <div className="flex items-center justify-between px-3 py-2 border-t border-border/40 bg-muted/20 shrink-0">
                <button
                    onClick={() => setCurrentSlide(i => Math.max(0, i - 1))}
                    disabled={currentSlide === 0}
                    className="p-1 rounded text-muted-foreground/50 hover:text-muted-foreground disabled:opacity-30 transition-colors"
                >
                    <ChevronLeft className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-1.5">
                    {slides.map((_: any, i: number) => (
                        <button
                            key={i}
                            onClick={() => setCurrentSlide(i)}
                            className={cn(
                                'w-1.5 h-1.5 rounded-full transition-colors',
                                i === currentSlide ? 'bg-primary' : 'bg-muted-foreground/30'
                            )}
                        />
                    ))}
                    <span className="text-xs text-muted-foreground/60 ml-2 tabular-nums">
                        {currentSlide + 1} / {slides.length}
                    </span>
                </div>

                <button
                    onClick={() => setCurrentSlide(i => Math.min(slides.length - 1, i + 1))}
                    disabled={currentSlide === slides.length - 1}
                    className="p-1 rounded text-muted-foreground/50 hover:text-muted-foreground disabled:opacity-30 transition-colors"
                >
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
