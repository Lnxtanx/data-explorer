import { MessageSquare, Archive } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ContextMeta } from '@/hooks/agentTypes';

interface ContextWindowBarProps {
    contextMeta: ContextMeta | null;
    /** Number of messages accumulated locally (before server confirms) */
    localMessageCount?: number;
    tokenCount?: number | null;
    className?: string;
}

/**
 * Model-aware indicator showing context usage and compaction status.
 * Data Explorer context is managed on a token-budget model (limit comes from
 * the backend's model context table via contextMeta.context_limit, defaulting
 * to 128k), with LLM compaction retaining a full-fidelity tail.
 */
export function ContextWindowBar({
    contextMeta,
    localMessageCount,
    tokenCount,
    className,
}: ContextWindowBarProps) {
    const msgCount = contextMeta?.messages_in_window ?? localMessageCount ?? 0;
    const tokens = contextMeta?.tokens_estimated ?? tokenCount ?? null;
    const limit = contextMeta?.context_limit ?? 128_000;
    const pct = tokens != null && limit > 0 ? Math.round((tokens / limit) * 100) : null;

    if (msgCount === 0 && tokens === null) return null;

    const isCompacted = contextMeta?.compacted || (contextMeta?.saved_tokens ?? 0) > 0;
    const nearLimit = (pct !== null && pct >= 80) || msgCount >= 16;
    const atLimit = (pct !== null && pct >= 95) || msgCount >= 20;

    return (
        <div
            className={cn(
                'inline-flex items-center gap-1.5 text-[11px] font-medium transition-colors select-none',
                atLimit
                    ? 'text-amber-500 dark:text-amber-400 font-semibold'
                    : nearLimit
                    ? 'text-amber-500/80 dark:text-amber-400/80'
                    : 'text-muted-foreground/50 hover:text-muted-foreground/80',
                className
            )}
            title={
                tokens
                    ? `Context window: ${tokens.toLocaleString()} / ${limit.toLocaleString()} tokens (~${pct}%). Auto-compacted when approaching capacity.`
                    : `${msgCount} message${msgCount !== 1 ? 's' : ''} in context.`
            }
        >
            {isCompacted ? (
                <Archive className="w-3 h-3 text-emerald-500 shrink-0" />
            ) : atLimit ? (
                <Archive className="w-3 h-3 animate-pulse text-amber-500 shrink-0" />
            ) : (
                <MessageSquare className="w-3 h-3 shrink-0" />
            )}

            <span>
                {isCompacted ? (
                    `compacted (${Math.round((contextMeta?.saved_tokens ?? 0) / 1000)}k saved)`
                ) : atLimit ? (
                    'compacting context…'
                ) : pct !== null && pct > 0 ? (
                    `${msgCount > 0 ? `${msgCount} msgs · ` : ''}${pct}% context`
                ) : (
                    `${msgCount} message${msgCount !== 1 ? 's' : ''} in context`
                )}
            </span>
        </div>
    );
}
