import { MessageSquare, Archive } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ContextMeta } from '@/hooks/useAIAgent';

interface ContextWindowBarProps {
    contextMeta: ContextMeta | null;
    /** Number of messages accumulated locally (before server confirms) */
    localMessageCount?: number;
    className?: string;
}

/**
 * Subtle indicator showing how many messages are in the current context window.
 * Appears above the chat input once the first response has been received.
 * Turns amber when >= 16 messages (approaching compaction threshold of 20).
 */
export function ContextWindowBar({ contextMeta, localMessageCount, className }: ContextWindowBarProps) {
    // Use server-reported count if available, else fall back to local estimate
    const count = contextMeta?.messages_in_window ?? localMessageCount ?? 0;
    if (count === 0) return null;

    const nearLimit = count >= 16;
    const atLimit   = count >= 20;

    return (
        <div className={cn(
            'flex items-center gap-1.5 px-3 py-1 text-[11px] select-none',
            atLimit   ? 'text-amber-500/80' :
            nearLimit ? 'text-amber-400/60' :
                        'text-muted-foreground/40',
            className,
        )}>
            <MessageSquare className="w-3 h-3 shrink-0" />
            <span>
                {count} message{count !== 1 ? 's' : ''} in context
            </span>

            {atLimit && (
                <span className="flex items-center gap-1 ml-0.5 text-amber-500/70">
                    <Archive className="w-3 h-3" />
                    <span>compacting…</span>
                </span>
            )}
        </div>
    );
}
