import { useState } from 'react';
import { Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toolLabel } from './ToolIcon';
import type { AgentToolStep } from '@/hooks/useAIAgent';

interface ToolCallCardProps {
    step: AgentToolStep;
    defaultExpanded?: boolean;
}

function SquareDotsLoading() {
    return (
        <div className="flex items-center gap-1.5 px-0.5">
            <div className="w-1.5 h-1.5 bg-blue-500/80 rounded-[1px] animate-pulse" style={{ animationDuration: '1s' }} />
            <div className="w-1.5 h-1.5 bg-blue-500/80 rounded-[1px] animate-pulse" style={{ animationDuration: '1s', animationDelay: '200ms' }} />
            <div className="w-1.5 h-1.5 bg-blue-500/80 rounded-[1px] animate-pulse" style={{ animationDuration: '1s', animationDelay: '400ms' }} />
        </div>
    );
}

export function ToolCallCard({ step, defaultExpanded = false }: ToolCallCardProps) {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const isPending = step.status === 'calling';
    const isDone = step.status === 'done';
    const isError = step.status === 'error';
    const isThinking = step.type === 'thinking';

    return (
        <div className={cn(
            'rounded-md border overflow-hidden text-xs transition-colors',
            isPending && 'border-blue-500/30 bg-blue-500/5',
            isThinking ? 'border-indigo-500/20 bg-indigo-500/[0.02]' : (isDone && 'border-border/40 bg-muted/5'),
            isError && 'border-red-500/30 bg-red-500/5',
        )}>
            <button
                className="w-full flex items-center gap-2 px-2.5 py-2 hover:bg-muted/20 transition-colors text-left"
                onClick={() => setExpanded(e => !e)}
            >
                {/* Status indicator */}
                <div className="shrink-0 min-w-[14px] flex items-center justify-center">
                    {isPending ? (
                        <SquareDotsLoading />
                    ) : (
                        <>
                            {!isThinking && (
                                <>
                                    {isDone && (
                                        <Check className="w-3.5 h-3.5 text-green-500" />
                                    )}
                                    {isError && (
                                        <X className="w-3.5 h-3.5 text-red-500" />
                                    )}
                                </>
                            )}
                        </>
                    )}
                </div>

                {/* Label */}
                <span className={cn(
                    'text-[11px] text-foreground/80 truncate',
                    !isThinking && 'font-mono'
                )}>
                    {step.label || (isThinking ? 'Thinking…' : toolLabel(step.name))}
                </span>

                {/* Expand chevron (only if result exists) */}
                {step.result && (
                    <span className="ml-auto text-muted-foreground/50">
                        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </span>
                )}
            </button>

            {/* Expanded result */}
            {expanded && step.result?.summary && (
                <div className="border-t border-border/20 px-2.5 py-2">
                    <p className="text-muted-foreground/80 leading-relaxed whitespace-pre-wrap">
                        {step.result.summary}
                    </p>
                </div>
            )}
        </div>
    );
}
