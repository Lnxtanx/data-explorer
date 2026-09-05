/**
 * Usage Settings — Redesigned, clean & unified AI credit quota dashboard
 * Matches the graphic typography and premium design language of Schema Weaver.
 */

import { useEffect, useState, useCallback } from 'react';
import {
    RefreshCw,
    Loader2,
    Zap,
    Clock,
    BarChart3,
    Cpu,
    Sparkles,
    ArrowUpRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getAIUsage, type AIQuotaStatus } from '@/lib/api/auth';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/AuthProvider';
import { logger } from '@/lib/logger';

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

const PLAN_META: Record<string, { label: string; badgeClass: string }> = {
    free:          { label: 'Free',    badgeClass: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/25' },
    starter:       { label: 'Starter', badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25' },
    pro_monthly:   { label: 'Pro',     badgeClass: 'bg-primary/10 text-primary border-primary/25' },
    power_monthly: { label: 'Power',   badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25' },
};

function getBarColor(pct: number): string {
    if (pct >= 90) return 'bg-rose-500';
    if (pct >= 75) return 'bg-amber-500';
    return 'bg-blue-500 dark:bg-blue-400';
}

function getPctColor(pct: number): string {
    if (pct >= 90) return 'text-rose-600 dark:text-rose-400 font-semibold';
    if (pct >= 75) return 'text-amber-600 dark:text-amber-400 font-semibold';
    return 'text-muted-foreground';
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

interface QuotaCardProps {
    title: string;
    icon: React.ReactNode;
    used: number;
    limit: number;
    remaining: number;
    pct: number;
    badgeText: string;
    subtext: string;
}

function QuotaCard({
    title,
    icon,
    used,
    limit,
    remaining,
    pct,
    badgeText,
    subtext,
}: QuotaCardProps) {
    const clampedPct = Math.min(100, Math.max(0, pct));
    const safeRemaining = Math.max(0, remaining);

    return (
        <div className="rounded-xl border border-border/70 bg-card/60 dark:bg-card/40 p-4 space-y-3.5 transition-colors hover:border-border">
            {/* Header row */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-muted/60 text-muted-foreground border border-border/40">
                        {icon}
                    </div>
                    <div>
                        <h4 className="text-[13px] font-semibold text-foreground tracking-tight">{title}</h4>
                    </div>
                </div>
                {badgeText && (
                    <span className="text-[11px] font-medium text-muted-foreground/80 bg-muted/50 px-2 py-0.5 rounded-md border border-border/40">
                        {badgeText}
                    </span>
                )}
            </div>

            {/* Progress bar */}
            <div className="relative h-2 w-full rounded-full overflow-hidden bg-muted/70">
                <div
                    className={cn(
                        'h-full rounded-full transition-all duration-500 ease-out',
                        getBarColor(clampedPct),
                    )}
                    style={{ width: `${Math.max(clampedPct, used > 0 ? 2 : 0)}%` }}
                />
            </div>

            {/* Stats row */}
            <div className="flex items-center justify-between text-xs">
                <div className="flex items-baseline gap-1 text-muted-foreground">
                    <span className="font-semibold text-foreground tabular-nums text-[13px]">
                        {fmtNum(used)}
                    </span>
                    <span>/</span>
                    <span className="tabular-nums font-medium">
                        {fmtNum(limit)} credits
                    </span>
                </div>

                <div className="flex items-center gap-2 tabular-nums">
                    <span className="font-medium text-foreground">
                        {fmtNum(safeRemaining)} left
                    </span>
                    <span className={cn('text-[11.5px]', getPctColor(clampedPct))}>
                        ({Math.round(clampedPct)}%)
                    </span>
                </div>
            </div>

            {/* Footer subtext */}
            <p className="text-[11px] text-muted-foreground/60 border-t border-border/30 pt-2.5">
                {subtext}
            </p>
        </div>
    );
}

// ─── Main Component ──────────────────────────────────────────────────────────

interface UsageSettingsProps {
    onNavigate?: (section: any) => void;
}

export function UsageSettings({ onNavigate }: UsageSettingsProps) {
    const { user, signInWithGoogle, signInWithGithub } = useAuth();
    const [usage, setUsage]             = useState<AIQuotaStatus | null>(null);
    const [loading, setLoading]         = useState(true);
    const [error, setError]             = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [now, setNow]                 = useState(() => new Date());

    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 30_000);
        return () => clearInterval(id);
    }, []);

    const fetchData = useCallback(async () => {
        if (!user) {
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const usageData = await getAIUsage();
            setUsage(usageData);
            setLastUpdated(new Date());
        } catch (err: any) {
            logger.error('[UsageSettings] Failed to fetch usage data:', err);
            setError(err?.message || 'Failed to load usage data');
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        if (user) {
            fetchData();
        } else {
            setLoading(false);
        }
    }, [user, fetchData]);

    // ── Derived Calculations ──────────────────────────────────────────────────

    const dailyLimit = usage?.credit_limit_daily || 0;
    const dailyUsed = usage?.credits_used_day || 0;
    const dailyPct = dailyLimit > 0 ? Math.min(100, (dailyUsed / dailyLimit) * 100) : 0;

    const monthlyLimit = usage?.credit_limit_monthly || 0;
    const monthlyUsed = usage?.credits_used_month || 0;
    const monthlyPct = monthlyLimit > 0 ? Math.min(100, (monthlyUsed / monthlyLimit) * 100) : (usage?.monthly_pct || 0);

    const tomorrowMidnight = new Date(now);
    tomorrowMidnight.setUTCDate(tomorrowMidnight.getUTCDate() + 1);
    tomorrowMidnight.setUTCHours(0, 0, 0, 0);

    const planKey = usage?.plan_id || 'free';
    const planInfo = PLAN_META[planKey] || { label: planKey, badgeClass: 'bg-primary/10 text-primary border-primary/25' };

    function lastUpdatedLabel() {
        if (!lastUpdated) return '';
        const diffS = Math.floor((now.getTime() - lastUpdated.getTime()) / 1000);
        if (diffS < 10)  return 'just now';
        if (diffS < 60)  return `${diffS}s ago`;
        return `${Math.floor(diffS / 60)}m ago`;
    }

    // ── Unauthenticated State ────────────────────────────────────────────────

    if (!user) {
        return (
            <div className="p-8 w-full flex flex-col items-center justify-center text-center space-y-4 py-16">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                    <BarChart3 className="w-6 h-6" />
                </div>
                <div className="space-y-1 max-w-sm">
                    <h3 className="text-base font-semibold text-foreground">Sign in to view usage</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        Sign in to view your real-time AI credits, daily limits, and plan quotas.
                    </p>
                </div>
                <div className="flex flex-col w-full max-w-xs gap-2.5 pt-2">
                    <Button
                        onClick={() => signInWithGoogle()}
                        variant="outline"
                        className="w-full h-9 text-xs rounded-xl font-medium gap-2 shadow-xs"
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
                        className="w-full h-9 text-xs rounded-xl font-medium gap-2 shadow-xs"
                    >
                        <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                            <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                        </svg>
                        Continue with GitHub
                    </Button>
                </div>
            </div>
        );
    }

    // ── Loading & Error States ────────────────────────────────────────────────

    if (loading && !usage) {
        return (
            <div className="p-6 w-full">
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-20">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    Loading usage data…
                </div>
            </div>
        );
    }

    if (error && !usage) {
        return (
            <div className="p-6 w-full">
                <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 p-4 space-y-2">
                    <p className="text-xs font-semibold text-red-600 dark:text-red-400">{error}</p>
                    <p className="text-[11px] text-muted-foreground">
                        Could not retrieve latest usage statistics from the server.
                    </p>
                    <Button
                        onClick={fetchData}
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs rounded-lg mt-1"
                    >
                        Try again
                    </Button>
                </div>
            </div>
        );
    }

    if (!usage) return null;

    // ── Render Dashboard ──────────────────────────────────────────────────────

    return (
        <div className="p-6 w-full space-y-6">

            {/* Header section */}
            <div className="flex items-start justify-between">
                <div>
                    <h3 className="text-base font-semibold text-foreground tracking-tight">Usage</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        AI credit usage and execution limits across all databases
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Badge
                        variant="outline"
                        className={cn('text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5', planInfo.badgeClass)}
                    >
                        {planInfo.label}
                    </Badge>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={fetchData}
                        disabled={loading}
                        className="h-8 w-8 p-0 rounded-lg hover:bg-muted/70 text-muted-foreground hover:text-foreground"
                        title="Refresh usage statistics"
                    >
                        <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
                    </Button>
                </div>
            </div>

            {/* Quick Metrics Grid (2 balanced cards) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Concurrency Card */}
                <div className="rounded-xl border border-border/70 bg-card/60 dark:bg-card/40 p-3.5 flex items-center gap-3.5">
                    <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/20">
                        <Cpu className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-base font-bold text-foreground tabular-nums tracking-tight">
                                {usage.concurrent_slots} / {usage.concurrent_limit}
                            </span>
                            <span className="text-[11px] text-muted-foreground/80 font-medium">
                                Active Slots
                            </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground/60 truncate">
                            Parallel agent execution capacity
                        </p>
                    </div>
                </div>

                {/* AI Modes Card */}
                <div className="rounded-xl border border-border/70 bg-card/60 dark:bg-card/40 p-3.5 flex items-center gap-3.5">
                    <div className="w-9 h-9 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-500/20">
                        <Sparkles className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-base font-bold text-foreground tracking-tight">
                                Flash & Deep
                            </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground/60 truncate">
                            Fast generation & multi-step reasoning
                        </p>
                    </div>
                </div>
            </div>

            {/* Usage Quotas Section */}
            <div className="space-y-3.5">
                {/* Daily Quota Card */}
                <QuotaCard
                    title="Daily Limit"
                    icon={<Clock className="w-3.5 h-3.5" />}
                    used={dailyUsed}
                    limit={dailyLimit}
                    remaining={usage.daily_remaining}
                    pct={dailyPct}
                    badgeText={`Resets in ${timeUntil(tomorrowMidnight)}`}
                    subtext="Daily quota resets automatically at 00:00 UTC"
                />

                {/* Monthly Quota Card */}
                <QuotaCard
                    title="Monthly Subscription Limit"
                    icon={<BarChart3 className="w-3.5 h-3.5" />}
                    used={monthlyUsed}
                    limit={monthlyLimit}
                    remaining={usage.credits_remaining}
                    pct={monthlyPct}
                    badgeText={`Resets ${formatMonthReset()}`}
                    subtext="Total monthly credit budget renewed on the 1st of each month"
                />
            </div>

            {/* Upgrade Banner / Plan Navigation */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 dark:bg-primary/[0.03] p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <Zap className="w-4 h-4" />
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-foreground">
                            Need more daily or monthly credits?
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                            Upgrade your plan to unlock higher capacity and increased limits.
                        </p>
                    </div>
                </div>
                {onNavigate && (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onNavigate('plans')}
                        className="h-8 text-xs font-medium gap-1.5 rounded-lg border-primary/30 hover:bg-primary/10 text-primary shrink-0 shadow-2xs"
                    >
                        <span>View Plans</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                    </Button>
                )}
            </div>

            {/* Footer Timestamp */}
            <div className="pt-1 text-center">
                <p className="text-[11px] text-muted-foreground/50">
                    Updated {lastUpdatedLabel()} · Usage is synchronized live with your database
                </p>
            </div>
        </div>
    );
}
