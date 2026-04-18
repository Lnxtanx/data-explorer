/**
 * Usage Settings — Clean, Claude-inspired usage dashboard
 *
 * Sections: Overview stats · Daily · Weekly · Monthly
 * Square progress bars, tight layout, extra usage info.
 */

import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Loader2, Zap, Clock, Calendar, BarChart3, Cpu, Layers, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getAIUsage, getAIModels, type AIQuotaStatus, type AIModelInfo } from '@/lib/api/auth';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 10_000)    return `${(n / 1_000).toFixed(1)}K`;
    if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
}

function timeUntil(target: Date): string {
    const diff = target.getTime() - Date.now();
    if (diff <= 0) return 'Resets soon';
    const totalMins = Math.floor(diff / 60_000);
    const hours     = Math.floor(totalMins / 60);
    const mins      = totalMins % 60;
    if (hours >= 24) {
        const days = Math.floor(hours / 24);
        return `${days}d ${hours % 24}h`;
    }
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
}

function formatMonthReset(): string {
    const d = new Date();
    d.setMonth(d.getMonth() + 1, 1);
    d.setHours(0, 0, 0, 0);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatWeekReset(iso: string | undefined): string {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleDateString('en-US', {
            weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
        });
    } catch { return ''; }
}

const PLAN_LABELS: Record<string, string> = {
    free: 'Free', starter: 'Starter', pro_monthly: 'Pro', power_monthly: 'Power',
};

function barColor(pct: number): string {
    if (pct >= 90) return 'bg-red-500';
    if (pct >= 70) return 'bg-amber-500';
    return 'bg-blue-500';
}

function barTrack(pct: number): string {
    if (pct >= 90) return 'bg-red-500/10';
    if (pct >= 70) return 'bg-amber-500/10';
    return 'bg-blue-500/10';
}

function pctColor(pct: number): string {
    if (pct >= 90) return 'text-red-500';
    if (pct >= 70) return 'text-amber-500';
    return 'text-muted-foreground';
}

// ─── sub-components ─────────────────────────────────────────────────────────

interface UsageBarProps {
    label: string;
    icon: React.ReactNode;
    used: number;
    limit: number;
    remaining: number;
    pct: number;
    resetLabel: string;
    note?: string;
    showBar?: boolean;
}

function UsageBar({ label, icon, used, limit, remaining, pct, resetLabel, note, showBar = true }: UsageBarProps) {
    const clampedPct = Math.min(100, Math.max(0, pct));

    return (
        <div className="space-y-2.5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{icon}</span>
                    <span className="text-[13px] font-medium text-foreground">{label}</span>
                </div>
                {resetLabel && (
                    <span className="text-[11px] text-muted-foreground">{resetLabel}</span>
                )}
            </div>

            {/* Progress bar — square style */}
            {showBar && (
                <div className={cn('relative h-2 rounded-[3px] overflow-hidden', barTrack(clampedPct))}>
                    <div
                        className={cn('h-full rounded-[3px] transition-all duration-500 ease-out', barColor(clampedPct))}
                        style={{ width: `${Math.max(clampedPct, 1)}%` }}
                    />
                </div>
            )}

            {/* Stats */}
            <div className="flex items-center justify-between">
                <span className="text-[12px] text-muted-foreground">
                    {limit > 0
                        ? `${fmtNum(used)} / ${fmtNum(limit)} credits`
                        : `${fmtNum(used)} credits`
                    }
                </span>
                <div className="flex items-center gap-3">
                    {remaining > 0 && (
                        <span className="text-[12px] text-muted-foreground">
                            {fmtNum(remaining)} left
                        </span>
                    )}
                    {showBar && (
                        <span className={cn('text-[12px] font-medium tabular-nums', pctColor(clampedPct))}>
                            {Math.round(clampedPct)}%
                        </span>
                    )}
                </div>
            </div>

            {note && (
                <p className="text-[11px] text-muted-foreground/70">{note}</p>
            )}
        </div>
    );
}

function StatItem({ label, value, subtext, onClick }: { label: string; value: string; subtext?: string; onClick?: () => void }) {
    return (
        <div 
            className={cn(
                "flex flex-col gap-0.5",
                onClick && "cursor-pointer group hover:opacity-80 transition-opacity"
            )}
            onClick={onClick}
        >
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">{label}</p>
            <div className="flex items-baseline gap-1.5">
                <p className="text-[17px] font-semibold tracking-tight text-foreground">{value}</p>
                {onClick && <ChevronRight className="w-3 h-3 text-muted-foreground/30 group-hover:text-primary transition-colors" />}
            </div>
            {subtext && <p className="text-[11px] text-muted-foreground/60">{subtext}</p>}
        </div>
    );
}

// ─── main component ──────────────────────────────────────────────────────────

export function UsageSettings() {
    const [usage, setUsage]             = useState<AIQuotaStatus | null>(null);
    const [models, setModels]           = useState<AIModelInfo[]>([]);
    const [loading, setLoading]         = useState(true);
    const [error, setError]             = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [now, setNow]                 = useState(() => new Date());
    const [showModels, setShowModels]   = useState(false);

    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 30_000);
        return () => clearInterval(id);
    }, []);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [usageData, modelsData] = await Promise.all([
                getAIUsage(),
                getAIModels()
            ]);
            setUsage(usageData);
            setModels(modelsData.models);
            setLastUpdated(new Date());
        } catch (err: any) {
            console.error('[UsageSettings] Failed to fetch data:', err);
            setError(err?.message || 'Failed to load usage data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    // ── derived values ──────────────────────────────────────────────────────

    const dailyPct   = usage ? Math.min(100, (usage.credits_used_day / Math.max(usage.credit_limit_daily, 1)) * 100) : 0;
    const monthlyPct = usage?.monthly_pct ?? 0;

    const tomorrowMidnight = new Date(now);
    tomorrowMidnight.setUTCDate(tomorrowMidnight.getUTCDate() + 1);
    tomorrowMidnight.setUTCHours(0, 0, 0, 0);

    const planLabel = usage ? (PLAN_LABELS[usage.plan_id] ?? usage.plan_id) : 'Free';

    function lastUpdatedLabel() {
        if (!lastUpdated) return '';
        const diffS = Math.floor((now.getTime() - lastUpdated.getTime()) / 1000);
        if (diffS < 10)  return 'just now';
        if (diffS < 60)  return `${diffS}s ago`;
        return `${Math.floor(diffS / 60)}m ago`;
    }

    // ── render ───────────────────────────────────────────────────────────────

    if (loading && !usage) {
        return (
            <div className="p-5 w-full">
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-16">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading usage…
                </div>
            </div>
        );
    }

    if (error && !usage) {
        return (
            <div className="p-5 w-full">
                <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 px-4 py-3">
                    <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                    <button
                        onClick={fetchData}
                        className="mt-2 text-xs text-red-500 hover:text-red-700 underline"
                    >
                        Try again
                    </button>
                </div>
            </div>
        );
    }

    if (!usage) {
        return (
            <div className="p-5 w-full">
                <p className="text-sm text-muted-foreground py-4">
                    Sign in to view your usage.
                </p>
            </div>
        );
    }

    return (
        <div className="p-5 w-full space-y-5">

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-[15px] font-semibold text-foreground">Usage</h3>
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                        AI credit usage across all features
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm bg-primary/10 text-primary border border-primary/20">
                        {planLabel}
                    </span>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={fetchData}
                        disabled={loading}
                        className="h-7 w-7 p-0 hover:bg-muted/50"
                        title="Refresh"
                    >
                        <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
                    </Button>
                </div>
            </div>

            {/* Quick stats row — Clean, horizontal metrics */}
            <div className="flex items-center justify-between px-1 py-1">
                <StatItem
                    label="Concurrency"
                    value={`${usage.concurrent_slots}/${usage.concurrent_limit}`}
                    subtext="Parallel agent tasks"
                />
                <div className="w-px h-8 bg-border/40 mx-2" />
                
                <StatItem
                    label="AI Models"
                    value={`${usage.allowed_models?.length ?? 0}`}
                    subtext="Plan models available"
                    onClick={() => setShowModels(!showModels)}
                />

                <div className="w-px h-8 bg-border/40 mx-2" />
                <StatItem
                    label="Extra Credit"
                    value={usage.credits_balance > 0 ? `+${fmtNum(usage.credits_balance)}` : '—'}
                    subtext="Post-plan safety net"
                />
            </div>

            {/* Inline Model Explorer */}
            <AnimatePresence>
                {showModels && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden mb-6"
                    >
                        <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-4">
                            <div className="flex items-center justify-between px-1">
                                <div className="flex items-center gap-2">
                                    <h4 className="text-[13px] font-semibold text-foreground tracking-tight">Available AI Models</h4>
                                    <Badge variant="secondary" className="px-1.5 py-0 h-4 text-[10px] font-bold bg-primary/10 text-primary border-none">
                                        {usage.allowed_models?.length ?? 0}
                                    </Badge>
                                </div>
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-7 px-2 text-[11px] text-muted-foreground hover:bg-muted/50 transition-colors"
                                    onClick={() => setShowModels(false)}
                                >
                                    <X className="w-3.5 h-3.5 mr-1" />
                                    Close
                                </Button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[340px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-muted-foreground/10 hover:scrollbar-thumb-muted-foreground/20">
                                {models
                                    .filter(m => usage.allowed_models.includes(m.id))
                                    .sort((a, b) => (a.tier === b.tier ? 0 : a.tier === 'Pro' ? -1 : 1)) // Sort Pro models first
                                    .map(model => (
                                        <div 
                                            key={model.id} 
                                            className="group flex flex-col p-3 rounded-lg border border-border/40 bg-background/50 hover:border-primary/40 hover:bg-background hover:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] transition-all cursor-default"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div 
                                                    className="w-8 h-8 rounded-md flex items-center justify-center text-white text-[10px] font-bold shrink-0 shadow-sm transition-transform group-hover:scale-105"
                                                    style={{ backgroundColor: model.color || '#3b82f6' }}
                                                >
                                                    {model.name.substring(0, 2).toUpperCase()}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center justify-between gap-1">
                                                        <p className="text-[12px] font-semibold text-foreground truncate">{model.name}</p>
                                                        <Badge variant="outline" className="text-[9px] h-3.5 px-1 bg-muted/40 font-mono border-none text-muted-foreground/60 shrink-0">
                                                            {model.multiplier}x
                                                        </Badge>
                                                    </div>
                                                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">{model.provider}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Divider */}
            <div className="border-t border-border" />

            {/* Daily */}
            <UsageBar
                label="Daily"
                icon={<Clock className="w-3.5 h-3.5" />}
                used={usage.credits_used_day}
                limit={usage.credit_limit_daily}
                remaining={usage.daily_remaining}
                pct={dailyPct}
                resetLabel={`Resets in ${timeUntil(tomorrowMidnight)}`}
            />

            {/* Divider */}
            <div className="border-t border-border" />

            {/* Weekly */}
            <UsageBar
                label="Weekly"
                icon={<Calendar className="w-3.5 h-3.5" />}
                used={usage.credits_used_week}
                limit={0}
                remaining={0}
                pct={0}
                resetLabel={formatWeekReset(usage.weekly_reset_at) ? `Resets ${formatWeekReset(usage.weekly_reset_at)}` : ''}
                showBar={false}
                note="Tracking only — no weekly limit enforced"
            />

            {/* Divider */}
            <div className="border-t border-border" />

            {/* Monthly */}
            <UsageBar
                label="Monthly"
                icon={<BarChart3 className="w-3.5 h-3.5" />}
                used={usage.credits_used_month}
                limit={usage.credit_limit_monthly}
                remaining={usage.credits_remaining}
                pct={monthlyPct}
                resetLabel={`Resets ${formatMonthReset()}`}
                note={
                    usage.credits_balance > 0
                        ? `Includes +${fmtNum(usage.credits_balance)} top-up credits`
                        : undefined
                }
            />

            {/* Footer */}
            <div className="pt-1">
                <p className="text-[11px] text-muted-foreground/60">
                    Updated {lastUpdatedLabel()} · Daily resets at UTC midnight
                </p>
            </div>
        </div>
    );
}
