// =============================================================================
// ChartView — standalone chart renderer for ALL chart-type artifacts
// Covers: bar, line, pie, heatmap, funnel, scatter
// Tools: compute_distribution, compute_aggregation, compute_trend,
//        compare_periods, compute_moving_average, detect_seasonality,
//        segment_data, compute_cohort, compute_funnel, compute_retention,
//        compare_segments, compute_pareto, forecast_trend, compute_correlation
// =============================================================================

import { useRef } from 'react';
import {
    BarChart as ReBarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart,
    Area, ReferenceLine, ScatterChart, Scatter, ZAxis,
} from 'recharts';
import { cn } from '@/lib/utils';
import { CHART_COLORS } from '../chartUtils';
import type { AgentArtifact, FunnelStage } from '@/hooks/useAIAgent';

const TOOLTIP_STYLE = {
    fontSize: 11,
    background: 'hsl(var(--background))',
    border: '1px solid hsl(var(--border))',
    borderRadius: 6,
};

// ─── Direction badge ──────────────────────────────────────────────────────────

function DirectionBadge({ direction, changePercent }: { direction?: string; changePercent?: number }) {
    if (!direction || direction === 'flat') return null;
    const isUp = direction === 'up';
    const isVolatile = direction === 'volatile';
    return (
        <div className={cn(
            'flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full',
            isVolatile ? 'bg-amber-500/10 text-amber-500' :
            isUp ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500',
        )}>
            <span>{isVolatile ? '⟳' : isUp ? '↑' : '↓'}</span>
            {changePercent != null && <span>{Math.abs(changePercent).toFixed(1)}%</span>}
        </div>
    );
}

// ─── Heatmap renderer ─────────────────────────────────────────────────────────

function HeatmapChart({ artifact }: { artifact: AgentArtifact }) {
    const { matrix, columns: colHeaders, cohorts, periods } = artifact;
    if (!matrix?.length) return <p className="text-xs text-muted-foreground">No data</p>;

    const colLabels = colHeaders?.map(c => (typeof c === 'string' ? c : c.name)) ?? (periods as string[] ?? []);
    const rowLabels = cohorts ?? colHeaders?.map(c => (typeof c === 'string' ? c : c.name)) ?? [];

    const allVals = matrix.flat().filter(v => v != null);
    const minV = Math.min(...allVals);
    const maxV = Math.max(...allVals);

    const cell = (v: number | null) => {
        if (v == null) return { bg: 'hsl(var(--muted))', text: '—' };
        const t = maxV === minV ? 0.5 : (v - minV) / (maxV - minV);
        const r = Math.round(99 + t * (16 - 99));
        const g = Math.round(102 + t * (185 - 102));
        const b = Math.round(241 + t * (129 - 241));
        return { bg: `rgb(${r},${g},${b})`, text: typeof v === 'number' ? (v % 1 === 0 ? String(v) : v.toFixed(2)) : String(v) };
    };

    return (
        <div className="overflow-x-auto">
            <table className="text-[10px] border-collapse">
                <thead>
                    <tr>
                        <th className="w-20" />
                        {colLabels.map((l, i) => (
                            <th key={i} className="px-1 py-0.5 font-medium text-muted-foreground/60 text-center whitespace-nowrap">{l}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {matrix.map((row, ri) => (
                        <tr key={ri}>
                            <td className="pr-2 py-0.5 font-medium text-muted-foreground/70 text-right whitespace-nowrap">{rowLabels[ri] ?? ri}</td>
                            {row.map((v, ci) => {
                                const { bg, text } = cell(v);
                                return (
                                    <td key={ci} className="px-1 py-0.5 text-center rounded-sm text-white text-[10px] font-mono" style={{ backgroundColor: bg }}>
                                        {text}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
            {/* Top pairs for correlation heatmap */}
            {artifact.topPairs && artifact.topPairs.length > 0 && (
                <div className="mt-3 flex flex-col gap-1">
                    <span className="text-[10px] font-semibold tracking-widest text-muted-foreground/40 uppercase">Top Correlations</span>
                    {artifact.topPairs.slice(0, 5).map((p, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                            <span className="font-mono text-foreground/70">{p.col_a}</span>
                            <span className="text-muted-foreground/40">↔</span>
                            <span className="font-mono text-foreground/70">{p.col_b}</span>
                            <span className={cn('ml-auto font-mono tabular-nums', Math.abs(p.r) > 0.7 ? 'text-emerald-500' : Math.abs(p.r) > 0.4 ? 'text-amber-500' : 'text-muted-foreground/60')}>
                                r = {p.r.toFixed(3)}
                            </span>
                            <span className="text-[10px] text-muted-foreground/40">{p.strength}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Funnel renderer ──────────────────────────────────────────────────────────

function FunnelChart({ stages, overallConversion }: { stages: FunnelStage[]; overallConversion?: number }) {
    const maxCount = stages[0]?.count ?? 1;
    return (
        <div className="flex flex-col gap-1.5">
            {stages.map((s, i) => {
                const pct = (s.count / maxCount) * 100;
                return (
                    <div key={i} className="flex flex-col gap-0.5">
                        <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-foreground/80">{s.stage}</span>
                            <div className="flex items-center gap-2 text-muted-foreground/60">
                                <span className="tabular-nums">{s.count.toLocaleString()}</span>
                                {i > 0 && s.conversionFromPrev != null && (
                                    <span className={cn('text-[10px] tabular-nums', s.conversionFromPrev < 50 ? 'text-red-500/70' : 'text-emerald-500/70')}>
                                        {s.conversionFromPrev.toFixed(1)}%
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="h-6 bg-muted/30 rounded overflow-hidden">
                            <div
                                className="h-full rounded transition-all duration-500"
                                style={{
                                    width: `${pct}%`,
                                    background: `hsl(${240 - i * 25}, 60%, ${55 + i * 3}%)`,
                                }}
                            />
                        </div>
                        {s.dropOff != null && s.dropOff > 0 && (
                            <div className="text-[10px] text-red-500/60 text-right">
                                −{s.dropOff.toLocaleString()} dropped off
                            </div>
                        )}
                    </div>
                );
            })}
            {overallConversion != null && (
                <div className="mt-2 text-xs text-muted-foreground/60 text-right">
                    Overall conversion: <span className="font-semibold text-foreground/80">{overallConversion.toFixed(1)}%</span>
                </div>
            )}
        </div>
    );
}

// ─── Forecast / Pareto / Moving Average line chart ────────────────────────────

function ForecastChart({ artifact }: { artifact: AgentArtifact }) {
    const data: Record<string, unknown>[] = [];
    // Historical
    (artifact.historicalLabels ?? []).forEach((l, i) => {
        data.push({
            _label: l,
            actual: artifact.historicalValues?.[i] ?? null,
        });
    });
    // Forecast
    (artifact.forecastLabels ?? []).forEach((l, i) => {
        data.push({
            _label: l,
            forecast: artifact.forecastValues?.[i] ?? null,
            ci_lower: artifact.confidenceLower?.[i] ?? null,
            ci_upper: artifact.confidenceUpper?.[i] ?? null,
        });
    });
    if (!data.length) return null;

    return (
        <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis dataKey="_label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                {/* CI band */}
                <Area dataKey="ci_upper" fill="#6366f140" stroke="none" legendType="none" />
                <Area dataKey="ci_lower" fill="#ffffff" stroke="none" legendType="none" />
                {/* Lines */}
                <Line dataKey="actual" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} />
                <Line dataKey="forecast" stroke={CHART_COLORS[2]} strokeWidth={2} dot={false} strokeDasharray="5 3" />
            </ComposedChart>
        </ResponsiveContainer>
    );
}

// ─── Moving Average dual-line chart ──────────────────────────────────────────

function MovingAverageChart({ artifact }: { artifact: AgentArtifact }) {
    const labels = artifact.labels ?? [];
    const data = labels.map((l, i) => ({
        _label: l,
        raw: artifact.rawValues?.[i] ?? artifact.values?.[i] ?? null,
        ma: artifact.maValues?.[i] ?? null,
    }));

    return (
        <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis dataKey="_label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Line dataKey="raw" stroke={CHART_COLORS[0]} strokeWidth={1.5} dot={false} opacity={0.5} name="Raw" />
                <Line dataKey="ma" stroke={CHART_COLORS[1]} strokeWidth={2} dot={false} name="Moving Avg" />
            </LineChart>
        </ResponsiveContainer>
    );
}

// ─── Pareto bar+line chart ───────────────────────────────────────────────────

function ParetoChart({ artifact }: { artifact: AgentArtifact }) {
    const labels = artifact.labels ?? [];
    const data = labels.map((l, i) => ({
        _label: l,
        value: artifact.values?.[i] ?? 0,
        cumPct: artifact.cumulativePct?.[i] ?? null,
    }));

    const paretoIdx = artifact.paretoIndex;

    return (
        <div className="flex flex-col gap-2">
            <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                    <XAxis dataKey="_label" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} unit="%" />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar yAxisId="left" dataKey="value" fill={CHART_COLORS[0]} radius={[3, 3, 0, 0]} />
                    <Line yAxisId="right" dataKey="cumPct" stroke={CHART_COLORS[2]} strokeWidth={2} dot={false} name="Cumulative %" />
                    {paretoIdx != null && (
                        <ReferenceLine yAxisId="left" x={labels[paretoIdx]} stroke="#f43f5e" strokeDasharray="3 3" label={{ value: '80%', position: 'top', fontSize: 10, fill: '#f43f5e' }} />
                    )}
                </ComposedChart>
            </ResponsiveContainer>
            {artifact.interpretation && (
                <p className="text-[11px] text-muted-foreground/60 italic">{artifact.interpretation}</p>
            )}
        </div>
    );
}

// ─── Main ChartView ───────────────────────────────────────────────────────────

interface ChartViewProps {
    artifact: AgentArtifact;
    height?: number;
}

export function ChartView({ artifact, height = 200 }: ChartViewProps) {
    const chartRef = useRef<HTMLDivElement>(null);
    const chartType = artifact.chartType ?? 'bar';

    const labels = artifact.labels ?? [];
    const values = artifact.values ?? [];

    const simpleData = labels.map((l, i) => ({ _label: l, value: values[i] ?? 0 }));

    // Trend direction badge
    const hasTrend = artifact.direction != null;

    return (
        <div className="flex flex-col gap-2" ref={chartRef}>
            {hasTrend && (
                <div className="flex items-center gap-2">
                    <DirectionBadge direction={artifact.direction} changePercent={artifact.changePercent} />
                    {artifact.granularity && (
                        <span className="text-[10px] text-muted-foreground/40">{artifact.granularity}</span>
                    )}
                </div>
            )}

            {/* Heatmap */}
            {chartType === 'heatmap' && <HeatmapChart artifact={artifact} />}

            {/* Funnel */}
            {chartType === 'funnel' && artifact.stages && (
                <FunnelChart stages={artifact.stages} overallConversion={artifact.overallConversion} />
            )}

            {/* Forecast line (has historicalLabels) */}
            {chartType === 'line' && artifact.historicalLabels?.length && <ForecastChart artifact={artifact} />}

            {/* Moving average dual-line (has maValues) */}
            {chartType === 'line' && !artifact.historicalLabels?.length && artifact.maValues?.length && (
                <MovingAverageChart artifact={artifact} />
            )}

            {/* Pareto bar+line overlay */}
            {chartType === 'bar' && artifact.cumulativePct?.length && <ParetoChart artifact={artifact} />}

            {/* Simple bar */}
            {chartType === 'bar' && !artifact.cumulativePct?.length && !artifact.stages && simpleData.length > 0 && (
                <ResponsiveContainer width="100%" height={height}>
                    <ReBarChart data={simpleData} margin={{ top: 4, right: 4, left: -16, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                        <XAxis dataKey="_label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Bar dataKey="value" fill={CHART_COLORS[0]} radius={[3, 3, 0, 0]}>
                            {simpleData.map((_, idx) => (
                                <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                            ))}
                        </Bar>
                    </ReBarChart>
                </ResponsiveContainer>
            )}

            {/* Simple line (no special variants) */}
            {chartType === 'line' && !artifact.historicalLabels?.length && !artifact.maValues?.length && simpleData.length > 0 && (
                <ResponsiveContainer width="100%" height={height}>
                    <LineChart data={simpleData} margin={{ top: 4, right: 4, left: -16, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                        <XAxis dataKey="_label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Line dataKey="value" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} />
                    </LineChart>
                </ResponsiveContainer>
            )}

            {/* Pie */}
            {chartType === 'pie' && simpleData.length > 0 && (
                <ResponsiveContainer width="100%" height={height}>
                    <PieChart>
                        <Pie data={simpleData} dataKey="value" nameKey="_label" cx="50%" cy="50%" outerRadius={75}
                            label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                            labelLine={false}>
                            {simpleData.map((_, idx) => (
                                <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                    </PieChart>
                </ResponsiveContainer>
            )}

            {/* Scatter */}
            {chartType === 'scatter' && (
                <ResponsiveContainer width="100%" height={height}>
                    <ScatterChart margin={{ top: 4, right: 4, left: -16, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                        <XAxis type="number" dataKey="x" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis type="number" dataKey="y" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                        <ZAxis range={[20, 100]} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ strokeDasharray: '3 3' }} />
                        <Scatter data={simpleData as Record<string, unknown>[]} fill={CHART_COLORS[0]} opacity={0.8} />
                    </ScatterChart>
                </ResponsiveContainer>
            )}

            {/* Seasonality annotation strip */}
            {artifact.seasonalPeriods && artifact.seasonalPeriods.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                    {artifact.seasonalPeriods.map((p, i) => (
                        <span key={i} className="text-[10px] bg-primary/10 text-primary rounded-full px-2 py-0.5">
                            {p.label} <span className="opacity-60">({(p.strength * 100).toFixed(0)}%)</span>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}
