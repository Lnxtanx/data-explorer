import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Download, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ToolIcon, toolLabel, getToolKeyParam } from './ToolIcon';
import { sanitizeToolInput, sanitizeToolSummary, humanizeParamKey } from './toolSanitize';
import type { AgentToolStep } from '@/hooks/useAIAgent';

interface ToolCallCardProps {
    step: AgentToolStep;
    isLive?: boolean;
    defaultExpanded?: boolean;
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

export function ToolCallCard({ step, isLive = false, defaultExpanded = false }: ToolCallCardProps) {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const isPending = step.status === 'calling' && isLive;
    const isInterrupted = step.status === 'calling' && !isLive;
    const isDone = step.status === 'done';
    const isError = step.status === 'error' || isInterrupted;
    const isThinking = step.type === 'thinking';

    // Live elapsed timer while a tool is executing.
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!isPending) return;
        const t = setInterval(() => setNow(Date.now()), 500);
        return () => clearInterval(t);
    }, [isPending]);

    // Strip internal metadata (ids, sql, config, html_template…) before display.
    // Thinking steps keep their full text (no SQL redaction).
    const safeInput = sanitizeToolInput(step.name, step.input);
    const inputEntries = Object.entries(safeInput);
    const hasMeaningfulInput = step.type !== 'thinking' && inputEntries.length > 0;
    const safeSummary = step.result
        ? isThinking
            ? step.result.summary
            : sanitizeToolSummary(step.result.summary)
        : '';
    const canExpand = Boolean(safeSummary || hasMeaningfulInput || step.downloadUrl);

    const liveElapsed = isPending
        ? Math.max(0, (now - (step.startedAt ?? now))) / 1000
        : null;
    const rawLatency = step.latencyMs ?? (step.result as any)?.latencyMs ?? (step.result as any)?.latency_ms;
    const duration = !isPending && rawLatency != null ? formatDuration(rawLatency) : null;
    const keyParam = getToolKeyParam(step.name, safeInput);

    return (
        <div className="text-xs transition-colors">
            <button
                type="button"
                className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted/30 dark:hover:bg-muted/20 transition-colors text-left cursor-pointer select-none group",
                    expanded && "bg-muted/25 dark:bg-muted/15"
                )}
                onClick={() => canExpand && setExpanded(e => !e)}
            >
                {/* Tool Icon with status indicator */}
                <div className="shrink-0 flex items-center justify-center">
                    {isPending ? (
                        <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                    ) : isError && !isInterrupted ? (
                        <X className="w-3.5 h-3.5 text-red-500" />
                    ) : (
                        <ToolIcon
                            name={step.name}
                            className={cn(
                                'w-3.5 h-3.5 transition-colors',
                                isDone ? 'text-foreground/75 group-hover:text-foreground' : 'text-muted-foreground/60',
                                isInterrupted && 'text-muted-foreground/40'
                            )}
                        />
                    )}
                </div>

                {/* Label + Key Param */}
                <div className="flex items-baseline gap-1.5 min-w-0 flex-1 overflow-hidden">
                    <span className={cn(
                        'text-[12px] font-medium shrink-0',
                        isInterrupted ? 'text-muted-foreground/70' : 'text-muted-foreground group-hover:text-foreground'
                    )}>
                        {step.label || (isThinking ? 'Thinking' : toolLabel(step.name))}
                    </span>
                    {keyParam && (
                        <span className="text-[12px] font-mono text-foreground/80 truncate font-normal" title={keyParam}>
                            {keyParam}
                        </span>
                    )}
                    {isInterrupted && (
                        <span className="text-[10px] text-muted-foreground/40 font-sans italic font-normal shrink-0">
                            (stopped)
                        </span>
                    )}
                </div>

                {/* Live timer / Duration */}
                {isPending && liveElapsed != null && (
                    <span className="text-[10px] tabular-nums text-blue-500/90 font-mono ml-auto animate-pulse shrink-0">
                        {liveElapsed >= 1 ? `${liveElapsed.toFixed(1)}s` : '…'}
                    </span>
                )}
                {duration && (
                    <span className="text-[10px] tabular-nums text-muted-foreground/40 font-mono ml-auto shrink-0">
                        {duration}
                    </span>
                )}

                {/* Expand chevron */}
                {canExpand && (
                    <span className="ml-1 text-muted-foreground/40 group-hover:text-muted-foreground/70 transition-colors shrink-0">
                        {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </span>
                )}
            </button>

            {/* Expanded parameters + output (never SQL / internal ids) */}
            {expanded && (
                <div className="px-3 pb-3 pt-2 bg-muted/20 dark:bg-muted/10 border-t border-border/20 space-y-2.5">
                    {inputEntries.length > 0 && (
                        <div className="space-y-1">
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">
                                Parameters
                            </div>
                            <div className="bg-background/80 border border-border/30 rounded-lg p-2 font-mono text-[11px] space-y-0.5">
                                {inputEntries.map(([k, v]) => (
                                    <div key={k} className="flex items-start gap-2">
                                        <span className="text-muted-foreground/70 shrink-0">{humanizeParamKey(k)}:</span>
                                        <span className="text-foreground/90 break-all">
                                            {typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {safeSummary && (
                        <div className="space-y-1">
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">
                                Result
                            </div>
                            <p className="text-foreground/80 text-[11.5px] leading-relaxed whitespace-pre-wrap select-text">
                                {safeSummary}
                            </p>
                            {step.downloadUrl && (
                                <a
                                    href={step.downloadUrl}
                                    download={step.filename}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    Download {step.filename || 'Exported File'}
                                </a>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
