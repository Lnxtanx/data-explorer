import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ToolIcon, toolLabel } from '../tools/ToolIcon';
import type { AgentToolStep, AgentPhase } from '@/hooks/useAIAgent';

// ─── Model display name ────────────────────────────────────────────────────────

function formatModel(model: string): string {
    const m = model.toLowerCase();
    if (m.includes('claude')) {
        if (m.includes('opus'))   return 'Claude Opus';
        if (m.includes('sonnet')) return 'Claude Sonnet';
        if (m.includes('haiku'))  return 'Claude Haiku';
        return 'Claude';
    }
    if (m.includes('gpt-4o'))  return 'GPT-4o';
    if (m.includes('gpt-4'))   return 'GPT-4';
    if (m.includes('o3'))      return 'o3';
    if (m.includes('o1'))      return 'o1';
    if (m.includes('gemini')) {
        if (m.includes('flash')) return 'Gemini Flash';
        if (m.includes('pro'))   return 'Gemini Pro';
        return 'Gemini';
    }
    // OpenRouter models: "openrouter/..." → strip prefix
    return model.split('/').pop()?.slice(0, 20) ?? model;
}

// ─── Key input param for a tool call ──────────────────────────────────────────

function getKeyParam(input: Record<string, unknown>): string | null {
    if (input.table)   return String(input.table);
    if (input.sql)     return String(input.sql).replace(/\s+/g, ' ').slice(0, 40) + (String(input.sql).length > 40 ? '…' : '');
    if (input.column)  return String(input.column);
    if (input.query)   return String(input.query).slice(0, 40);
    const entries = Object.entries(input).filter(([, v]) => typeof v === 'string' || typeof v === 'number');
    if (entries.length > 0) return String(entries[0][1]).slice(0, 40);
    return null;
}

// ─── Phase label ───────────────────────────────────────────────────────────────

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
    model,
    liveThinking,
}: AgentStatusBarProps) {
    const [mounted, setMounted] = useState(false);
    const [fadeOut, setFadeOut] = useState(false);
    const [dotIndex, setDotIndex] = useState(0);

    useEffect(() => {
        const t = requestAnimationFrame(() => setMounted(true));
        return () => cancelAnimationFrame(t);
    }, []);

    useEffect(() => {
        if (!isLive && mounted) setFadeOut(true);
    }, [isLive, mounted]);

    // Cycle dot index for animated dots
    useEffect(() => {
        if (!isLive) return;
        const id = setInterval(() => setDotIndex(i => (i + 1) % 3), 400);
        return () => clearInterval(id);
    }, [isLive]);

    // Show status bar for ANY phase if it's live, or if there's live thinking
    const shouldShow = isLive || !!liveThinking || (phase !== 'idle' && phase !== 'done');
    
    if (!shouldShow && !fadeOut) return null;

    const callingStep = toolSteps.find(s => s.status === 'calling');
    const doneSteps   = toolSteps.filter(s => s.status === 'done');

    const statusText = liveThinking ? 'Thinking…' : (phaseDetail || PHASE_DEFAULTS[phase as string] || 'Thinking…');

    return (
        <div
            className={cn(
                'flex flex-col gap-1 mb-2 mt-1 transition-all duration-300',
                mounted && !fadeOut ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1',
                fadeOut && 'pointer-events-none hidden',
            )}
        >
            {/* ── Main status row ─────────────────────────────────────── */}
            <div className="flex items-center gap-2.5">
                {/* Animated pulse dot */}
                <span className={cn(
                    "w-2 h-2 rounded-full shrink-0 animate-pulse",
                    liveThinking ? "bg-indigo-400" : (callingStep ? "bg-amber-500" : "bg-blue-500")
                )} />

                {/* Status text from backend (e.g. "Running sample_rows…") */}
                <div className="flex items-baseline gap-2 overflow-hidden max-w-[300px]">
                    <span className="text-[13.5px] font-medium text-foreground/75 leading-none shrink-0">
                        {statusText}
                    </span>
                    {liveThinking && (
                        <span className="text-[12px] text-muted-foreground/50 truncate font-normal italic leading-none">
                            {liveThinking.slice(-100)}
                        </span>
                    )}
                </div>

                {/* Explicit Action Badge for tools */}
                {callingStep && (
                    <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5 animate-in fade-in zoom-in duration-300">
                        <ToolIcon name={callingStep.name} className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                        <span className="text-[10px] font-bold font-mono text-amber-700 dark:text-amber-300 uppercase tracking-tight">
                            {toolLabel(callingStep.name)}
                        </span>
                    </div>
                )}

                {/* Iteration counter */}
                {iteration > 1 && (
                    <span className="text-[11px] text-muted-foreground/40 font-mono tabular-nums">
                        step {iteration}
                    </span>
                )}

                {/* Model badge — shown when model is known */}
                {model && (
                    <span className="ml-auto shrink-0 text-[10px] font-mono text-muted-foreground/50 bg-muted/50 border border-border/30 rounded px-1.5 py-0.5 leading-none">
                        {formatModel(model)}
                    </span>
                )}
            </div>

            {/* ── Currently calling tool row ──────────────────────────── */}
            {callingStep && (
                <div className="flex items-center gap-2 pl-5 ml-0.5">
                    <span className="flex gap-0.5 shrink-0">
                        {[0, 1, 2].map(d => (
                            <span
                                key={d}
                                className={cn(
                                    'w-0.5 rounded-full bg-blue-400 transition-all duration-200',
                                    dotIndex === d ? 'h-3' : 'h-1.5',
                                )}
                            />
                        ))}
                    </span>
                    <ToolIcon name={callingStep.name} className="w-3 h-3 text-muted-foreground/60" />
                    <span className="text-[12px] font-mono text-foreground/60">
                        {toolLabel(callingStep.name)}
                    </span>
                    {getKeyParam(callingStep.input) && (
                        <span className="text-[11px] text-muted-foreground/40 truncate max-w-[200px]">
                            · {getKeyParam(callingStep.input)}
                        </span>
                    )}
                </div>
            )}

            {/* ── Completed tools summary (shown when no tool is calling) ── */}
            {doneSteps.length > 0 && !callingStep && phase === 'synthesizing' && (
                <div className="pl-5 ml-0.5 flex flex-wrap gap-1">
                    {doneSteps.slice(-4).map(s => (
                        <span
                            key={s.id}
                            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/50 bg-muted/30 rounded px-1.5 py-0.5 font-mono"
                        >
                            <ToolIcon name={s.name} className="w-2.5 h-2.5" />
                            {toolLabel(s.name)}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}
