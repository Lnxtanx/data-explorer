// =============================================================================
// useAIUsage — fetches /api/ai/usage to surface proactive quota state.
//
// Used by AIChatMain to show the exhaustion banner BEFORE the user even sends
// a message (not just after a failed request).
// =============================================================================

import { useQuery } from '@tanstack/react-query';

export interface AIUsageStatus {
    plan_id: string;
    credit_limit_monthly: number;
    credit_limit_daily: number;
    credits_used_month: number;
    credits_used_day: number;
    credits_used_week: number;
    credits_remaining: number;
    daily_remaining: number;
    credits_balance: number;
    monthly_pct: number;
    is_lifetime_cap: boolean;
    max_tokens_per_run: number;
    max_agent_duration_secs: number;
    concurrent_slots: number;
    concurrent_limit: number;
    allowed_models: string[];
    weekly_reset_at: string;  // weekly reset (Sunday 5:30 PM IST)
}

async function fetchUsage(): Promise<AIUsageStatus> {
    const res = await fetch('/api/ai/usage', { credentials: 'include' });
    if (!res.ok) throw new Error(`Usage fetch failed: ${res.status}`);
    return res.json() as Promise<AIUsageStatus>;
}

export function useAIUsage() {
    return useQuery<AIUsageStatus>({
        queryKey: ['ai-usage'],
        queryFn: fetchUsage,
        staleTime: 30_000,          // re-use cached value for 30 s
        refetchInterval: 60_000,    // background refresh every 60 s
        retry: 1,
    });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a duration in ms as "X hr Y min" or "Y min". */
function formatDuration(ms: number): string {
    const totalMins = Math.ceil(ms / 60_000);
    const hrs  = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    if (hrs > 0 && mins > 0) return `${hrs} hr ${mins} min`;
    if (hrs > 0)             return `${hrs} hr`;
    return `${mins} min`;
}

/** Next UTC midnight — when the DAILY counter resets. */
function nextDailyReset(): Date {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(0, 0, 0, 0);
    return d;
}

/** ms until next UTC midnight */
function msUntilDailyReset(): number {
    return nextDailyReset().getTime() - Date.now();
}

// ─── Exhaustion error (red/amber banner, disables input) ─────────────────────

/**
 * Returns a human-readable error string when the user is OUT of daily or
 * monthly credits. The input is disabled when this returns non-null.
 *
 * Daily resets at UTC midnight — NOT at the weekly Sunday 5:30 PM IST reset.
 * The weekly reset time is for the weekly credits tracker only.
 */
export function getProactiveQuotaError(usage: AIUsageStatus | undefined): string | null {
    if (!usage) return null;

    // Daily exhaustion — resets at next UTC midnight
    if (usage.credit_limit_daily > 0 && usage.daily_remaining <= 0) {
        const resetIn = formatDuration(msUntilDailyReset());
        return `Daily credit limit reached (${usage.credits_used_day} / ${usage.credit_limit_daily} credits used). Resets in ${resetIn} or upgrade your plan.`;
    }

    // Monthly / lifetime exhaustion
    if (usage.credit_limit_monthly > 0 && usage.credits_remaining <= 0 && !usage.is_lifetime_cap) {
        return `Monthly credit limit reached (${usage.credits_used_month} / ${usage.credit_limit_monthly} credits). Upgrade your plan to continue.`;
    }

    return null;
}

// ─── Warning (75% / 90%) — yellow info bar, input still enabled ──────────────

export interface QuotaWarning {
    /** 'warning' = 75–89%, 'critical' = 90–99% */
    level: 'warning' | 'critical';
    message: string;
}

/**
 * Returns a warning when usage is at 75%+ or 90%+ of any limit.
 * Returns null if < 75% or if already exhausted (error banner takes over).
 * Priority: daily > monthly (daily is more immediate).
 */
export function getQuotaWarning(usage: AIUsageStatus | undefined): QuotaWarning | null {
    if (!usage) return null;

    // Don't stack with exhaustion error
    if (getProactiveQuotaError(usage)) return null;

    // Daily check
    if (usage.credit_limit_daily > 0) {
        const dailyPct = Math.round((usage.credits_used_day / usage.credit_limit_daily) * 100);
        const resetIn  = formatDuration(msUntilDailyReset());

        if (dailyPct >= 90) {
            return {
                level: 'critical',
                message: `Daily credits at ${dailyPct}% — ${usage.daily_remaining} of ${usage.credit_limit_daily} credits left. Resets in ${resetIn}.`,
            };
        }
        if (dailyPct >= 75) {
            return {
                level: 'warning',
                message: `Daily credits at ${dailyPct}% — ${usage.daily_remaining} of ${usage.credit_limit_daily} remaining today.`,
            };
        }
    }

    // Monthly check
    if (usage.credit_limit_monthly > 0 && !usage.is_lifetime_cap) {
        const mPct = usage.monthly_pct;

        if (mPct >= 90) {
            return {
                level: 'critical',
                message: `Monthly credits at ${mPct}% — ${usage.credits_remaining} of ${usage.credit_limit_monthly} credits left this month.`,
            };
        }
        if (mPct >= 75) {
            return {
                level: 'warning',
                message: `Monthly credits at ${mPct}% — ${usage.credits_remaining} of ${usage.credit_limit_monthly} remaining this month.`,
            };
        }
    }

    return null;
}
