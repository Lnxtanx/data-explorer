import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Download, Loader2, X, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ToolIcon, toolLabel, getToolKeyParam } from './ToolIcon';
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
    const [copiedSql, setCopiedSql] = useState(false);
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

    const inputEntries = step.input
        ? Object.entries(step.input).filter(([k]) => k !== 'connection_id' && k !== 'connectionId')
        : [];
    const hasMeaningfulInput = step.type !== 'thinking' && inputEntries.length > 0;
    const canExpand = Boolean(step.result?.summary || hasMeaningfulInput || step.downloadUrl);

    const liveElapsed = isPending
        ? Math.max(0, (now - (step.startedAt ?? now))) / 1000
        : null;
    const duration = !isPending && step.latencyMs != null ? formatDuration(step.latencyMs) : null;
    const keyParam = getToolKeyParam(step.name, step.input as Record<string, unknown>);

    const sqlQuery = typeof step.input?.sql === 'string' ? step.input.sql : null;
    const otherInputs = inputEntries.filter(([k]) => k !== 'sql');

    const handleCopySql = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!sqlQuery) return;
        await navigator.clipboard.writeText(sqlQuery);
        setCopiedSql(true);
        setTimeout(() => setCopiedSql(false), 2000);
    };

    return (
        <div className={cn(
            'rounded-lg border overflow-hidden text-xs transition-colors my-0.5',
            isPending && 'border-blue-500/40 bg-blue-500/5 shadow-2xs',
            isThinking ? 'border-indigo-500/20 bg-indigo-500/[0.02]' : (isDone && 'border-border/50 bg-card shadow-2xs'),
            isError && (isInterrupted ? 'border-border/40 bg-muted/5' : 'border-red-500/30 bg-red-500/5'),
        )}>
            <button
                type="button"
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted/30 transition-colors text-left cursor-pointer select-none"
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
                                isDone ? 'text-foreground/80' : 'text-muted-foreground/60',
                                isInterrupted && 'text-muted-foreground/40'
                            )}
                        />
                    )}
                </div>

                {/* Label + Key Param */}
                <div className="flex items-baseline gap-1.5 min-w-0 flex-1 overflow-hidden">
                    <span className={cn(
                        'text-[12px] font-medium shrink-0',
                        isInterrupted ? 'text-muted-foreground/70' : 'text-foreground/90'
                    )}>
                        {step.label || (isThinking ? 'Thinking' : toolLabel(step.name))}
                    </span>
                    {keyParam && (
                        <span className="text-[11px] font-mono text-muted-foreground/60 truncate" title={keyParam}>
                            · {keyParam}
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
                    <span className="text-[10px] tabular-nums text-muted-foreground/50 font-mono ml-auto shrink-0">
                        {duration}
                    </span>
                )}

                {/* Expand chevron */}
                {canExpand && (
                    <span className="ml-1 text-muted-foreground/40 shrink-0">
                        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </span>
                )}
            </button>

            {/* Expanded input + output */}
            {expanded && (
                <div className="border-t border-border/30 bg-muted/10 divide-y divide-border/20">
                    {/* SQL query block if present */}
                    {sqlQuery && (
                        <div className="p-2.5">
                            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold mb-1.5">
                                <span>SQL Query</span>
                                <button
                                    type="button"
                                    onClick={handleCopySql}
                                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground cursor-pointer px-1.5 py-0.5 rounded hover:bg-muted"
                                >
                                    {copiedSql ? (
                                        <>
                                            <Check className="w-3 h-3 text-emerald-500" />
                                            <span className="text-emerald-500">Copied</span>
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="w-3 h-3" />
                                            <span>Copy</span>
                                        </>
                                    )}
                                </button>
                            </div>
                            <pre className="bg-muted/40 border border-border/40 p-2 rounded-md font-mono text-[11px] leading-relaxed text-foreground/90 whitespace-pre-wrap overflow-x-auto">
                                {sqlQuery}
                            </pre>
                        </div>
                    )}

                    {/* Other inputs */}
                    {otherInputs.length > 0 && (
                        <div className="p-2.5">
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold mb-1">
                                Parameters
                            </div>
                            <div className="bg-muted/40 border border-border/40 rounded-md p-2 font-mono text-[11px] space-y-0.5">
                                {otherInputs.map(([k, v]) => (
                                    <div key={k} className="flex items-start gap-2">
                                        <span className="text-muted-foreground/70 shrink-0">{k}:</span>
                                        <span className="text-foreground/90 break-all">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Output summary */}
                    {step.result?.summary && (
                        <div className="p-2.5">
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold mb-1">
                                Result
                            </div>
                            <p className="text-foreground/80 text-[11.5px] leading-relaxed whitespace-pre-wrap">
                                {step.result.summary}
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