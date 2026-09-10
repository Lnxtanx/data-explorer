// =============================================================================
// ClarificationView — interactive clarification question and choice selector
// Triggered by: ask_clarification tool
//
// Claude Code-style: when the agent provides a recommended `default`, it is
// pre-highlighted and focused so a single Enter (or click) accepts it; the
// agent's `reason` for the recommendation is shown alongside the question.
// =============================================================================

import { HelpCircle, ArrowRight, CornerDownLeft, Check, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentArtifact } from '@/hooks/useAIAgent';

interface ClarificationViewProps {
    artifact: AgentArtifact;
    onSelect?: (answer: string) => void;
    answered?: boolean;
    answer?: string;
}

export function ClarificationView({ artifact, onSelect, answered, answer }: ClarificationViewProps) {
    const question = artifact.question || artifact.title || 'Please clarify your request:';
    const options = artifact.options ?? [];
    const recommended = artifact.default || '';
    const reason = artifact.reason || '';

    const isAnswered = Boolean(answered ?? artifact.answered ?? answer ?? artifact.answer);
    const chosenAnswer = answer ?? artifact.answer ?? '';

    const accept = (selectedAnswer: string) => {
        if (isAnswered) return;
        onSelect?.(selectedAnswer);
    };

    return (
        <div className="flex flex-col gap-3 py-1 text-left">
            <div className="flex items-start gap-3">
                <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border',
                    isAnswered
                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                        : 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                )}>
                    {isAnswered ? <Check className="w-4 h-4" /> : <HelpCircle className="w-4 h-4" />}
                </div>
                <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        {isAnswered ? (
                            <>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                    Resolved
                                </span>
                                {chosenAnswer && (
                                    <span className="text-[11px] text-muted-foreground/80 truncate">
                                        Answer: <strong className="text-foreground font-semibold">{chosenAnswer}</strong>
                                    </span>
                                )}
                            </>
                        ) : (
                            <>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded">
                                    Action Needed
                                </span>
                                <span className="text-[11px] text-muted-foreground/60">
                                    The agent paused to confirm your intent
                                </span>
                            </>
                        )}
                    </div>
                    <p className="text-sm font-semibold text-foreground leading-relaxed">
                        {question}
                    </p>
                    {reason && (
                        <p className="text-[11px] text-muted-foreground/70 italic leading-relaxed">
                            {reason}
                        </p>
                    )}
                </div>
            </div>

            {options.length > 0 ? (
                <div className="flex flex-col gap-2 mt-1 pt-2.5 border-t border-border/30">
                    {recommended && !isAnswered ? (
                        <button
                            type="button"
                            autoFocus
                            onClick={() => accept(recommended)}
                            className={cn(
                                'flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-left text-xs font-semibold transition-all duration-150',
                                'border-primary/60 bg-primary/10 text-primary hover:bg-primary/15 hover:shadow-xs active:scale-[0.98] cursor-pointer group'
                            )}
                        >
                            <span className="flex items-center gap-2 min-w-0">
                                <Zap className="w-3.5 h-3.5 shrink-0 text-primary" />
                                <span className="flex items-center gap-1.5 min-w-0">
                                    <span className="text-[9px] font-bold uppercase tracking-wider bg-primary/15 text-primary px-1.5 py-0.5 rounded shrink-0">
                                        Recommended
                                    </span>
                                    <span className="line-clamp-2">{recommended}</span>
                                </span>
                            </span>
                            <span className="flex items-center gap-1 shrink-0 text-primary/70 group-hover:text-primary">
                                <CornerDownLeft className="w-3 h-3" />
                                <span className="text-[10px] font-medium">Enter</span>
                            </span>
                        </button>
                    ) : null}

                    {!isAnswered && (
                        <span className="text-[11px] font-medium text-muted-foreground/70">
                            {recommended ? 'Or choose another option:' : 'Choose an option to continue:'}
                        </span>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {options.map((opt, i) => {
                            const isSelected = isAnswered && (chosenAnswer === opt || (chosenAnswer.toLowerCase() === opt.toLowerCase()));
                            const isDefault = !isAnswered && recommended && opt === recommended;
                            return (
                                <button
                                    key={i}
                                    type="button"
                                    disabled={isAnswered}
                                    onClick={() => accept(opt)}
                                    className={cn(
                                        'flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-left text-xs font-medium transition-all duration-150',
                                        isSelected
                                            ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold shadow-2xs'
                                            : isAnswered
                                                ? 'border-border/40 bg-muted/10 text-muted-foreground/50 opacity-60 cursor-default'
                                                : isDefault
                                                    ? 'border-primary/60 bg-primary/10 text-primary hover:bg-primary/15 hover:shadow-xs cursor-pointer'
                                                    : 'border-border/60 bg-muted/20 hover:bg-primary/10 hover:border-primary/50 hover:text-primary hover:shadow-xs cursor-pointer',
                                        !isAnswered && 'active:scale-[0.98] group'
                                    )}
                                >
                                    <span className="flex items-center gap-1.5 min-w-0">
                                        {isSelected ? (
                                            <Check className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                                        ) : isDefault ? (
                                            <Check className="w-3.5 h-3.5 shrink-0 text-primary" />
                                        ) : null}
                                        <span className="line-clamp-2">{opt}</span>
                                    </span>
                                    {!isAnswered && (
                                        <ArrowRight className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0 text-primary" />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            ) : recommended && !isAnswered ? (
                // No multiple-choice options, but the agent has a recommended answer.
                <div className="flex flex-col gap-2 mt-1 pt-2.5 border-t border-border/30">
                    <button
                        type="button"
                        autoFocus
                        onClick={() => accept(recommended)}
                        className={cn(
                            'flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-left text-xs font-semibold transition-all duration-150',
                            'border-primary/60 bg-primary/10 text-primary hover:bg-primary/15 hover:shadow-xs active:scale-[0.98] cursor-pointer group'
                        )}
                    >
                        <span className="flex items-center gap-2 min-w-0">
                            <Zap className="w-3.5 h-3.5 shrink-0 text-primary" />
                            <span className="flex items-center gap-1.5 min-w-0">
                                <span className="text-[9px] font-bold uppercase tracking-wider bg-primary/15 text-primary px-1.5 py-0.5 rounded shrink-0">
                                    Recommended
                                </span>
                                <span className="line-clamp-2">{recommended}</span>
                            </span>
                        </span>
                        <span className="flex items-center gap-1 shrink-0 text-primary/70 group-hover:text-primary">
                            <CornerDownLeft className="w-3 h-3" />
                            <span className="text-[10px] font-medium">Enter</span>
                        </span>
                    </button>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground/70">
                        <CornerDownLeft className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span>Or type a different response in the chat input to resume the analysis.</span>
                    </div>
                </div>
            ) : !isAnswered ? (
                <div className="flex items-center gap-2 mt-1 pt-2 border-t border-border/30 text-xs text-muted-foreground/70">
                    <CornerDownLeft className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span>Type your response in the chat input below to resume the analysis.</span>
                </div>
            ) : null}
        </div>
    );
}