// =============================================================================
// StatBlockView — unified renderer for stat_block artifacts
// Covers kinds: statistics, anomalies, quality, outliers, text, cardinality,
//               table_diff, regression
// Tools: compute_statistics, detect_anomalies, check_quality, detect_outliers,
//        analyze_text_column, compute_cardinality, compare_tables, compute_regression
// =============================================================================

import { cn } from '@/lib/utils';
import type {
    AgentArtifact, ColumnStatistic, CardinalityColumn, RegressionCoefficient,
    AnomalyEntry, QualityIssue, ColumnStat,
} from '@/hooks/useAIAgent';

// ─── Shared helpers ───────────────────────────────────────────────────────────

const SEV_CLASS = {
    high: 'text-red-500 bg-red-500/10',
    medium: 'text-amber-500 bg-amber-500/10',
    low: 'text-muted-foreground bg-muted/40',
} as const;

function SeverityBadge({ severity }: { severity: 'high' | 'medium' | 'low' }) {
    return (
        <span className={cn('text-[10px] font-semibold tracking-wide rounded px-1.5 py-0.5 shrink-0', SEV_CLASS[severity] ?? SEV_CLASS.low)}>
            {severity.toUpperCase()}
        </span>
    );
}

function NullBar({ pct }: { pct: number }) {
    return (
        <div className="flex items-center gap-2 w-full">
            <div className="flex-1 h-1 bg-muted/50 rounded-full overflow-hidden">
                <div
                    className={cn('h-full rounded-full', pct === 0 ? 'bg-emerald-500/60' : pct < 20 ? 'bg-amber-500/60' : 'bg-red-500/60')}
                    style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }}
                />
            </div>
            <span className="text-[10px] text-muted-foreground/50 tabular-nums w-14 text-right shrink-0">{pct.toFixed(1)}% null</span>
        </div>
    );
}

// ─── Statistics kind ──────────────────────────────────────────────────────────

function StatisticsView({ cols, sampleSize }: { cols: ColumnStatistic[]; sampleSize?: number }) {
    return (
        <div className="flex flex-col gap-2">
            {sampleSize != null && (
                <p className="text-[11px] text-muted-foreground/50">Sample size: {sampleSize.toLocaleString()} rows</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {cols.map(c => {
                    const nullPct = c.count > 0 ? (c.nullCount / (c.count + c.nullCount)) * 100 : 0;
                    return (
                        <div key={c.name} className="rounded-md border border-border/50 bg-muted/10 p-3 flex flex-col gap-1.5">
                            <span className="text-xs font-medium text-foreground">{c.name}</span>
                            <div className="grid grid-cols-3 gap-1 text-[11px]">
                                {c.mean != null && <div><span className="text-muted-foreground/50 block">mean</span><span className="font-mono text-foreground/70">{c.mean.toFixed(2)}</span></div>}
                                {c.median != null && <div><span className="text-muted-foreground/50 block">median</span><span className="font-mono text-foreground/70">{c.median.toFixed(2)}</span></div>}
                                {c.std != null && <div><span className="text-muted-foreground/50 block">σ</span><span className="font-mono text-foreground/70">{c.std.toFixed(2)}</span></div>}
                                {c.p25 != null && <div><span className="text-muted-foreground/50 block">p25</span><span className="font-mono text-foreground/70">{c.p25.toFixed(2)}</span></div>}
                                {c.p75 != null && <div><span className="text-muted-foreground/50 block">p75</span><span className="font-mono text-foreground/70">{c.p75.toFixed(2)}</span></div>}
                                {c.p95 != null && <div><span className="text-muted-foreground/50 block">p95</span><span className="font-mono text-foreground/70">{c.p95.toFixed(2)}</span></div>}
                            </div>
                            <NullBar pct={nullPct} />
                            {c.skewness != null && (
                                <span className="text-[10px] text-muted-foreground/40">skew {c.skewness.toFixed(2)} · kurt {c.kurtosis?.toFixed(2)}</span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Anomalies kind ───────────────────────────────────────────────────────────

function AnomaliesKind({ anomalies, scannedColumns, totalAnomalies }: {
    anomalies: AnomalyEntry[];
    scannedColumns?: number;
    totalAnomalies?: number;
}) {
    return (
        <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
                {totalAnomalies ?? anomalies.length} anomal{(totalAnomalies ?? anomalies.length) === 1 ? 'y' : 'ies'} found
                {scannedColumns ? ` across ${scannedColumns} columns` : ''}
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
                                    <td className="px-2 py-1.5"><SeverityBadge severity={a.severity} /></td>
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

// ─── Quality kind ─────────────────────────────────────────────────────────────

function QualityKind({ score, summary, issues }: { score: number; summary?: string; issues?: QualityIssue[] }) {
    const scoreColor = score >= 80 ? 'text-emerald-500' : score >= 50 ? 'text-amber-500' : 'text-red-500';
    const barColor = score >= 80 ? 'bg-emerald-500/60' : score >= 50 ? 'bg-amber-500/60' : 'bg-red-500/60';
    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-baseline gap-3">
                <span className={cn('text-3xl font-bold tabular-nums', scoreColor)}>{score}</span>
                <span className="text-sm text-muted-foreground/60">/100</span>
                <div className="flex-1 h-1.5 bg-muted/50 rounded-full overflow-hidden ml-2">
                    <div className={cn('h-full rounded-full', barColor)} style={{ width: `${score}%` }} />
                </div>
            </div>
            {summary && <p className="text-xs text-muted-foreground/70">{summary}</p>}
            {(issues ?? []).length > 0 && (
                <div className="flex flex-col gap-1">
                    {issues!.map((issue, i) => (
                        <div key={i} className="flex items-baseline gap-2 text-xs py-1.5 border-b border-border/20 last:border-0">
                            <SeverityBadge severity={issue.severity} />
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

// ─── Legacy ColumnStat kind (get_column_stats) ───────────────────────────────

function LegacyStatsKind({ stats }: { stats: ColumnStat[] }) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {stats.map(stat => {
                const nullPct = stat.nullPercent ?? 0;
                const badges: string[] = [];
                if (stat.isPrimaryKey) badges.push('PK');
                if (stat.isIndexed) badges.push('IDX');
                if (stat.nullable) badges.push('NULL');
                return (
                    <div key={stat.name} className="rounded-md border border-border/50 bg-background p-3 flex flex-col gap-2">
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
                                {stat.min !== null && <div><span className="text-muted-foreground/50 block">min</span><span className="font-mono text-foreground/80 truncate block">{String(stat.min)}</span></div>}
                                {stat.max !== null && <div><span className="text-muted-foreground/50 block">max</span><span className="font-mono text-foreground/80 truncate block">{String(stat.max)}</span></div>}
                                {stat.avg !== null && <div><span className="text-muted-foreground/50 block">avg</span><span className="font-mono text-foreground/80 truncate block">{stat.avg}</span></div>}
                            </div>
                        )}
                        <div className="text-[11px] text-muted-foreground/60">{stat.distinctCount} distinct values</div>
                        <NullBar pct={nullPct} />
                        {stat.topValues && stat.topValues.length > 0 && (
                            <div className="text-[11px]">
                                <span className="text-muted-foreground/50">top: </span>
                                <span className="text-foreground/60 font-mono">{stat.topValues.map(v => v === null ? 'null' : String(v)).join(', ')}</span>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ─── Cardinality kind ─────────────────────────────────────────────────────────

function CardinalityKind({ cols }: { cols: CardinalityColumn[] }) {
    return (
        <div className="flex flex-col gap-3">
            {cols.map(c => (
                <div key={c.name} className="rounded-md border border-border/50 bg-muted/10 p-3 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-foreground">{c.name}</span>
                        <span className="text-[10px] text-muted-foreground/50 tabular-nums">{c.cardinality.toLocaleString()} unique · entropy {c.entropy.toFixed(2)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {c.topValues.map((v, i) => (
                            <span key={i} className="text-[10px] bg-muted/40 text-foreground/70 rounded px-1.5 py-0.5 font-mono">
                                {v.value} <span className="text-muted-foreground/40">×{v.count}</span>
                            </span>
                        ))}
                    </div>
                    <div className="h-1 bg-muted/40 rounded-full overflow-hidden">
                        <div className="h-full bg-primary/40 rounded-full" style={{ width: `${Math.min(c.cardinalityRatio * 100, 100)}%` }} />
                    </div>
                </div>
            ))}
        </div>
    );
}

// ─── Regression kind ─────────────────────────────────────────────────────────

function RegressionKind({ coefficients, rSquared, adjRSquared, intercept }: {
    coefficients?: RegressionCoefficient[];
    rSquared?: number;
    adjRSquared?: number;
    intercept?: number;
}) {
    const r2Color = !rSquared ? '' : rSquared >= 0.7 ? 'text-emerald-500' : rSquared >= 0.4 ? 'text-amber-500' : 'text-red-500';
    return (
        <div className="flex flex-col gap-3">
            {/* R² meter */}
            <div className="flex items-center gap-3">
                {rSquared != null && (
                    <div className="flex items-baseline gap-1">
                        <span className={cn('text-2xl font-bold tabular-nums', r2Color)}>R²={rSquared.toFixed(3)}</span>
                        {adjRSquared != null && <span className="text-xs text-muted-foreground/50">adj {adjRSquared.toFixed(3)}</span>}
                    </div>
                )}
                {intercept != null && (
                    <span className="text-xs text-muted-foreground/50 ml-auto">intercept {intercept.toFixed(3)}</span>
                )}
            </div>
            {/* Coefficients table */}
            {(coefficients ?? []).length > 0 && (
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b border-border/40">
                                <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Feature</th>
                                <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Coeff</th>
                                <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">p-value</th>
                                <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Sig</th>
                            </tr>
                        </thead>
                        <tbody>
                            {coefficients!.map((c, i) => (
                                <tr key={i} className={cn('border-b border-border/20 last:border-0', c.significant ? '' : 'opacity-50')}>
                                    <td className="px-2 py-1.5 font-mono text-foreground/80">{c.feature}</td>
                                    <td className="px-2 py-1.5 text-right tabular-nums font-mono">{c.coefficient.toFixed(4)}</td>
                                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground/70">{c.pValue < 0.001 ? '<0.001' : c.pValue.toFixed(3)}</td>
                                    <td className="px-2 py-1.5">{c.significant ? <span className="text-emerald-500 text-[10px]">✓ sig</span> : <span className="text-muted-foreground/30 text-[10px]">ns</span>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ─── Table diff kind ──────────────────────────────────────────────────────────

function TableDiffKind({ diff }: { diff: NonNullable<AgentArtifact['tableDiff']> }) {
    return (
        <div className="flex flex-col gap-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
                <div className="rounded border border-border/50 p-2">
                    <span className="text-[10px] font-semibold uppercase text-muted-foreground/40">Table A rows</span>
                    <div className="text-lg font-bold tabular-nums">{diff.rowCountA.toLocaleString()}</div>
                </div>
                <div className="rounded border border-border/50 p-2">
                    <span className="text-[10px] font-semibold uppercase text-muted-foreground/40">Table B rows</span>
                    <div className="text-lg font-bold tabular-nums">{diff.rowCountB.toLocaleString()}</div>
                </div>
            </div>
            {diff.onlyInA.length > 0 && (
                <div>
                    <span className="text-[10px] font-semibold uppercase text-muted-foreground/40">Only in A</span>
                    <div className="flex flex-wrap gap-1 mt-1">{diff.onlyInA.map(c => <span key={c} className="font-mono bg-red-500/10 text-red-500 rounded px-1.5 py-0.5 text-[10px]">{c}</span>)}</div>
                </div>
            )}
            {diff.onlyInB.length > 0 && (
                <div>
                    <span className="text-[10px] font-semibold uppercase text-muted-foreground/40">Only in B</span>
                    <div className="flex flex-wrap gap-1 mt-1">{diff.onlyInB.map(c => <span key={c} className="font-mono bg-blue-500/10 text-blue-500 rounded px-1.5 py-0.5 text-[10px]">{c}</span>)}</div>
                </div>
            )}
            {diff.typeChanges.length > 0 && (
                <div>
                    <span className="text-[10px] font-semibold uppercase text-muted-foreground/40">Type changes</span>
                    <div className="flex flex-col gap-0.5 mt-1">
                        {diff.typeChanges.map((t, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <span className="font-mono text-foreground/80">{t.column}</span>
                                <span className="text-amber-500 text-[10px]">{t.typeA} → {t.typeB}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {diff.statDiffs.length > 0 && (
                <div>
                    <span className="text-[10px] font-semibold uppercase text-muted-foreground/40">Stat diffs</span>
                    <table className="w-full text-xs mt-1">
                        <thead><tr className="border-b border-border/40"><th className="text-left py-1 text-muted-foreground">Column</th><th className="text-right py-1 text-muted-foreground">Mean A</th><th className="text-right py-1 text-muted-foreground">Mean B</th><th className="text-right py-1 text-muted-foreground">Δ</th></tr></thead>
                        <tbody>
                            {diff.statDiffs.map((s, i) => (
                                <tr key={i} className="border-b border-border/20 last:border-0">
                                    <td className="py-1 font-mono text-foreground/80">{s.column}</td>
                                    <td className="py-1 text-right tabular-nums text-muted-foreground/70">{s.meanA.toFixed(2)}</td>
                                    <td className="py-1 text-right tabular-nums text-muted-foreground/70">{s.meanB.toFixed(2)}</td>
                                    <td className={cn('py-1 text-right tabular-nums font-mono', s.delta > 0 ? 'text-emerald-500' : 'text-red-500')}>{s.delta > 0 ? '+' : ''}{s.delta.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ─── Text analysis kind ───────────────────────────────────────────────────────

function TextKind({ analysis }: { analysis: NonNullable<AgentArtifact['textAnalysis']> }) {
    return (
        <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded border border-border/50 p-2 text-center">
                    <span className="text-muted-foreground/50 block text-[10px]">Avg length</span>
                    <span className="font-bold tabular-nums">{analysis.avgLength.toFixed(0)}</span>
                </div>
                <div className="rounded border border-border/50 p-2 text-center">
                    <span className="text-muted-foreground/50 block text-[10px]">Unique</span>
                    <span className="font-bold tabular-nums">{analysis.uniqueCount.toLocaleString()}</span>
                </div>
                <div className="rounded border border-border/50 p-2 text-center">
                    <span className="text-muted-foreground/50 block text-[10px]">Range</span>
                    <span className="font-bold tabular-nums">{analysis.minLength}–{analysis.maxLength}</span>
                </div>
            </div>
            {/* Top words */}
            {analysis.topWords?.length > 0 && (
                <div>
                    <span className="text-[10px] font-semibold uppercase text-muted-foreground/40">Top words</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                        {analysis.topWords.slice(0, 20).map((w, i) => (
                            <span key={i} className="text-[10px] bg-primary/10 text-primary rounded-full px-2 py-0.5">
                                {w.word} <span className="opacity-60">×{w.count}</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}
            {/* Pattern bullets */}
            <div className="flex flex-wrap gap-2 text-[11px]">
                {Object.entries(analysis.patterns ?? {}).filter(([, v]) => v > 0).map(([k, v]) => (
                    <span key={k} className="text-muted-foreground/60">{k.replace(/_count$/, '').replace(/_/g, ' ')}: <span className="font-mono text-foreground/70">{v}</span></span>
                ))}
            </div>
        </div>
    );
}

// ─── Main StatBlockView ───────────────────────────────────────────────────────

interface StatBlockViewProps {
    artifact: AgentArtifact;
}

export function StatBlockView({ artifact }: StatBlockViewProps) {
    const kind = artifact.statBlockKind;

    // Regression
    if (kind === 'regression' || artifact.coefficients) {
        return <RegressionKind coefficients={artifact.coefficients} rSquared={artifact.rSquared} adjRSquared={artifact.adjRSquared} intercept={artifact.intercept} />;
    }

    // Statistics (compute_statistics)
    if ((kind === 'statistics' || artifact.columnStats) && artifact.columnStats?.length) {
        return <StatisticsView cols={artifact.columnStats} sampleSize={artifact.sampleSize} />;
    }

    // Cardinality
    if ((kind === 'cardinality' || artifact.cardinalityColumns) && artifact.cardinalityColumns?.length) {
        return <CardinalityKind cols={artifact.cardinalityColumns} />;
    }

    // Table diff
    if ((kind === 'table_diff' || artifact.tableDiff) && artifact.tableDiff) {
        return <TableDiffKind diff={artifact.tableDiff} />;
    }

    // Text analysis
    if ((kind === 'text' || artifact.textAnalysis) && artifact.textAnalysis) {
        return <TextKind analysis={artifact.textAnalysis} />;
    }

    // Quality (new stat_block style OR legacy 'quality' type)
    if (kind === 'quality' || (artifact.score != null && artifact.type !== 'chart')) {
        return <QualityKind score={artifact.score!} summary={artifact.summary} issues={artifact.issues} />;
    }

    // Anomalies (new stat_block style OR legacy 'anomalies' type)
    if (kind === 'anomalies' || artifact.anomalies) {
        return (
            <AnomaliesKind
                anomalies={artifact.anomalies ?? []}
                scannedColumns={artifact.scannedColumns}
                totalAnomalies={artifact.totalAnomalies}
            />
        );
    }

    // Legacy column stats (get_column_stats → old 'stats' type)
    if (artifact.stats?.length) {
        return <LegacyStatsKind stats={artifact.stats} />;
    }

    return <p className="text-xs text-muted-foreground">No data</p>;
}
