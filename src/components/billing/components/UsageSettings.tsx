/**
 * Usage Settings — clean, minimal AI credit usage view.
 * Typography intentionally matches the Plans & Billing page (text-lg title,
 * rounded-xl border bg-card panels, text-2xs labels, tabular numbers).
 */

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAIUsage } from '../../ai/hooks/useAIUsage';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/AuthProvider';

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
    if (n == null || isNaN(n)) return '0';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
    if (n >= 10_000)    return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
    if (n >= 1_000)     return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
    return n.toLocaleString();
}

function timeUntil(target: Date): string {
    const diff = target.getTime() - Date.now();
    if (diff <= 0) return 'soon';
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

const PLAN_META: Record<string, { label: string; badgeClass: string }> = {
    free:          { label: 'Free',    badgeClass: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/25' },
    starter:       { label: 'Starter', badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25' },
    pro_monthly:   { label: 'Pro',     badgeClass: 'bg-primary/10 text-primary border-primary/25' },
    power_monthly: { label: 'Power',   badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25' },
    team_monthly:  { label: 'Team',    badgeClass: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/25' },
};

function getBarColor(pct: number): string {
    if (pct >= 90) return 'bg-rose-500';
    if (pct >= 75) return 'bg-amber-500';
    return 'bg-primary';
}

function getPctColor(pct: number): string {
    if (pct >= 90) return 'text-rose-600 dark:text-rose-400 font-semibold';
    if (pct >= 75) return 'text-amber-600 dark:text-amber-400 font-semibold';
    return 'text-muted-foreground';
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function UsageSettings() {
    const { user, signInWithGoogle, signInWithGithub } = useAuth();
    const {
        data: usage,
        isLoading,
        isFetching,
        error: queryError,
        refetch,
        dataUpdatedAt,
    } = useAIUsage(!!user);

    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 30_000);
        return () => clearInterval(id);
    }, []);

    // ── Derived Values ──────────────────────────────────────────────────────

    const monthLimit = usage?.credit_limit_monthly || 0;
    const monthUsed = usage?.credits_used_month || 0;
    const monthPct = monthLimit > 0 ? Math.min(100, (monthUsed / monthLimit) * 100) : 0;
    const monthRemaining = usage?.credits_remaining ?? Math.max(0, monthLimit - monthUsed);

    const dayLimit = usage?.credit_limit_daily || 0;
    const dayUsed = usage?.credits_used_day || 0;
    const dayPct = dayLimit > 0 ? Math.min(100, (dayUsed / dayLimit) * 100) : 0;
    const dayRemaining = Math.max(0, dayLimit - dayUsed);

    const tomorrowMidnight = (() => {
        const d = new Date(now);
        d.setUTCHours(24, 0, 0, 0);
        return d;
    })();

    const planKey = usage?.plan_id || 'free';
    const planInfo = PLAN_META[planKey] ?? { label: planKey, badgeClass: 'bg-primary/10 text-primary border-primary/25' };

    function lastUpdatedLabel() {
        if (!dataUpdatedAt) return 'just now';
        const diffS = Math.floor((now.getTime() - dataUpdatedAt) / 1000);
        if (diffS < 10)  return 'just now';
        if (diffS < 60)  return `${diffS}s ago`;
        return `${Math.floor(diffS / 60)}m ago`;
    }

    // Reusable billing-style stat cell (no icons).
    function StatCell({ label, value, hint }: { label: string; value: string; hint?: string }) {
        return (
            <div className="rounded-lg bg-muted/40 border border-border/50 p-3">
                <p className="text-2xs font-medium text-muted-foreground">{label}</p>
                <p className="text-sm font-semibold text-foreground mt-0.5 tabular-nums">{value}</p>
                {hint && <p className="text-2xs text-muted-foreground/70 mt-0.5">{hint}</p>}
            </div>
        );
    }

    // ── Unauthenticated State ────────────────────────────────────────────────

    if (!user) {
        return (
            <div className="p-6 w-full">
                <div className="rounded-xl border bg-card p-8 flex flex-col items-center justify-center text-center space-y-4">
                    <div className="space-y-1 max-w-sm">
                        <h3 className="text-lg font-semibold tracking-tight text-foreground">Sign in to view usage</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            View your real-time AI credits, daily limits, and plan quotas.
                        </p>
                    </div>
                    <div className="flex flex-col w-full max-w-xs gap-2.5 pt-2">
                        <Button
                            onClick={() => signInWithGoogle()}
                            variant="outline"
                            className="w-full rounded-xl font-medium gap-2 shadow-sm"
                        >
                            <svg className="w-4 h-4" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                            </svg>
                            Continue with Google
                        </Button>
                        <Button
                            onClick={() => signInWithGithub()}
                            variant="outline"
                            className="w-full rounded-xl font-medium gap-2 shadow-sm"
                        >
                            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.532 1.088 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                            </svg>
                            Continue with GitHub
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Loading Skeleton State (Only shown when cold without cache) ──────────

    if (isLoading && !usage) {
        return (
            <div className="p-6 w-full space-y-6 animate-pulse">
                {/* Header Skeleton */}
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-semibold tracking-tight text-foreground">AI Credit Usage</h3>
                    </div>
                    <div className="flex items-center gap-2">
                        <Skeleton className="h-5 w-14 rounded-full" />
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled
                            className="h-8 w-8 p-0 rounded-lg text-muted-foreground"
                        >
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        </Button>
                    </div>
                </div>

                {/* Monthly Credits Card Skeleton */}
                <div className="rounded-xl border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-3 w-16" />
                    </div>
                    <div className="flex items-baseline gap-2">
                        <Skeleton className="h-7 w-20" />
                        <Skeleton className="h-4 w-24" />
                    </div>
                    <Skeleton className="h-1.5 w-full rounded-full" />
                    <div className="flex items-center justify-between">
                        <Skeleton className="h-3 w-28" />
                        <Skeleton className="h-3 w-20" />
                    </div>
                </div>

                {/* Daily Credits Card Skeleton */}
                <div className="rounded-xl border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-3 w-16" />
                    </div>
                    <div className="flex items-baseline gap-2">
                        <Skeleton className="h-7 w-20" />
                        <Skeleton className="h-4 w-24" />
                    </div>
                    <Skeleton className="h-1.5 w-full rounded-full" />
                    <div className="flex items-center justify-between">
                        <Skeleton className="h-3 w-28" />
                        <Skeleton className="h-3 w-20" />
                    </div>
                </div>

                {/* Stat Cells Grid Skeleton */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="rounded-lg bg-muted/40 border border-border/50 p-3 space-y-2">
                        <Skeleton className="h-3 w-28" />
                        <Skeleton className="h-5 w-16" />
                        <Skeleton className="h-3 w-36" />
                    </div>
                    <div className="rounded-lg bg-muted/40 border border-border/50 p-3 space-y-2">
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-5 w-20" />
                        <Skeleton className="h-3 w-24" />
                    </div>
                </div>

                {/* Footer Skeleton */}
                <div className="pt-1 text-center">
                    <Skeleton className="h-3 w-24 mx-auto" />
                </div>
            </div>
        );
    }

    // ── Error State (Only when no cached data exists) ────────────────────────

    if (queryError && !usage) {
        return (
            <div className="p-6 w-full space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-semibold tracking-tight text-foreground">AI Credit Usage</h3>
                    </div>
                </div>
                <div className="rounded-xl border bg-card p-4 space-y-2">
                    <p className="text-xs font-semibold text-foreground">
                        {(queryError as any)?.message || 'Failed to load usage data'}
                    </p>
                    <p className="text-2xs text-muted-foreground">
                        Could not retrieve the latest usage statistics from the server.
                    </p>
                    <Button
                        onClick={() => refetch()}
                        size="sm"
                        variant="outline"
                        className="text-xs rounded-lg mt-1"
                    >
                        Try again
                    </Button>
                </div>
            </div>
        );
    }

    if (!usage) return null;

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="p-6 w-full space-y-6">

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold tracking-tight text-foreground">AI Credit Usage</h3>
                </div>
                <div className="flex items-center gap-2">
                    <Badge
                        variant="outline"
                        className={cn('text-2xs font-medium px-2 py-0.5 rounded-full', planInfo.badgeClass)}
                    >
                        {planInfo.label}
                    </Badge>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => refetch()}
                        disabled={isFetching}
                        className="h-8 w-8 p-0 rounded-lg hover:bg-muted/70 text-muted-foreground hover:text-foreground"
                        title="Refresh usage statistics"
                    >
                        <RefreshCw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')} />
                    </Button>
                </div>
            </div>

            {/* Monthly credits — primary number, no decoration */}
            <div className="rounded-xl border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <p className="text-2xs font-medium text-muted-foreground">Monthly credits</p>
                    <span className={cn('text-2xs', getPctColor(monthPct))}>
                        {Math.round(monthPct)}% used
                    </span>
                </div>
                <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
                        {fmtNum(monthUsed)}
                    </span>
                    <span className="text-sm text-muted-foreground tabular-nums">
                        / {fmtNum(monthLimit)} credits
                    </span>
                </div>
                <div className="relative h-1.5 w-full rounded-full overflow-hidden bg-muted/70">
                    <div
                        className={cn('h-full rounded-full transition-all duration-500 ease-out', getBarColor(monthPct))}
                        style={{ width: `${Math.max(monthPct, monthUsed > 0 ? 2 : 0)}%` }}
                    />
                </div>
                <div className="flex items-center justify-between text-2xs text-muted-foreground">
                    <span className="tabular-nums">{fmtNum(monthRemaining)} credits remaining</span>
                    <span>
                        {usage?.monthly_reset_at ? `Resets in ${timeUntil(new Date(usage.monthly_reset_at))}` : `${fmtNum(dayUsed)} used today`}
                    </span>
                </div>
            </div>

            {/* Daily credits — full card with progress bar, styled identically to Monthly */}
            <div className="rounded-xl border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <p className="text-2xs font-medium text-muted-foreground">Daily credits</p>
                    <span className={cn('text-2xs', getPctColor(dayPct))}>
                        {Math.round(dayPct)}% used
                    </span>
                </div>
                <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
                        {fmtNum(dayUsed)}
                    </span>
                    <span className="text-sm text-muted-foreground tabular-nums">
                        / {fmtNum(dayLimit)} credits
                    </span>
                </div>
                <div className="relative h-1.5 w-full rounded-full overflow-hidden bg-muted/70">
                    <div
                        className={cn('h-full rounded-full transition-all duration-500 ease-out', getBarColor(dayPct))}
                        style={{ width: `${Math.max(dayPct, dayUsed > 0 ? 2 : 0)}%` }}
                    />
                </div>
                <div className="flex items-center justify-between text-2xs text-muted-foreground">
                    <span className="tabular-nums">{fmtNum(dayRemaining)} credits remaining</span>
                    <span>Resets in {timeUntil(tomorrowMidnight)}</span>
                </div>
            </div>

            {/* Stat cells — Concurrent agents & Plan */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <StatCell
                    label="Concurrent agents"
                    value={`${usage.concurrent_slots} / ${usage.concurrent_limit}`}
                    hint="Parallel execution capacity"
                />
                <StatCell
                    label="Plan tier"
                    value={planInfo.label}
                    hint={planKey === 'free' ? 'Free tier quotas' : 'Active subscription'}
                />
            </div>

            {/* Footer */}
            <div className="pt-1 text-center">
                <p className="text-2xs text-muted-foreground/50">
                    Updated {lastUpdatedLabel()}
                </p>
            </div>
        </div>
    );
}