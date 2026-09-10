import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { AgentToolStep, AgentPhase } from '@/hooks/useAIAgent';

// ─── Phase label defaults ─────────────────────────────────────────────────────

const PHASE_DEFAULTS: Record<string, string> = {
    planning:         'Thinking…',
    single_llm_start: 'Starting analysis…',
    executing:        'Working…',
    synthesizing:     'Writing response…',
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface AgentStatusBarProps {
    phase: AgentPhase | string; // Allow string for custom phases
    phaseDetail: string;
    toolSteps: AgentToolStep[];
    iteration: number;
    isLive: boolean;
    model?: string | null;
    liveThinking?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AgentStatusBar({
    phase,
    phaseDetail,
    toolSteps,
    iteration,
    isLive,
    liveThinking,
}: AgentStatusBarProps) {
    const [mounted, setMounted] = useState(false);
    const [fadeOut, setFadeOut] = useState(false);

    useEffect(() => {
        const t = requestAnimationFrame(() => setMounted(true));
        return () => cancelAnimationFrame(t);
    }, []);

    useEffect(() => {
        if (!isLive && mounted) setFadeOut(true);
    }, [isLive, mounted]);

    // Show status bar for ANY phase if it's live, or if there's live thinking
    const shouldShow = isLive || !!liveThinking || (phase !== 'idle' && phase !== 'done');

    if (!shouldShow && !fadeOut) return null;

    const hasCallingTool = toolSteps.some(s => s.status === 'calling');
    const statusText = liveThinking
        ? 'Thinking…'
        : (phaseDetail || PHASE_DEFAULTS[phase as string] || 'Thinking…');

    return (
        <div
            className={cn(
                'flex items-center gap-2.5 mb-2 mt-1 transition-all duration-300',
                mounted && !fadeOut ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1',
                fadeOut && 'pointer-events-none hidden',
            )}
        >
            {/* Animated pulse dot */}
            <span
                className={cn(
                    'w-2 h-2 rounded-full shrink-0 animate-pulse',
                    liveThinking
                        ? 'bg-indigo-400'
                        : hasCallingTool
                        ? 'bg-amber-500'
                        : 'bg-blue-500',
                )}
            />

            {/* Status text from backend / phase */}
            <div className="flex items-baseline gap-2 overflow-hidden max-w-[400px]">
                <span className="text-[13px] font-medium text-foreground/75 leading-none shrink-0">
                    {statusText}
                </span>
                {liveThinking && (
                    <span className="text-[11.5px] text-muted-foreground/50 truncate font-normal italic leading-none">
                        {liveThinking.slice(-100)}
                    </span>
                )}
            </div>

            {/* Iteration counter for multi-step reasoning */}
            {iteration > 1 && (
                <span className="text-[11px] text-muted-foreground/40 font-mono tabular-nums">
                    step {iteration}
                </span>
            )}
        </div>
    );
}

