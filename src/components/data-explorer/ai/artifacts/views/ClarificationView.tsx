// =============================================================================
// ClarificationView — clean, minimal clarification question and choice selector
// Triggered by: ask_clarification tool
// =============================================================================

import { useMemo } from 'react';
import { ArrowRight, Check } from 'lucide-react';
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
    const rawOptions = artifact.options ?? [];
    const recommended = (artifact.default || '').trim();
    const reason = artifact.reason || '';

    const isAnswered = Boolean(answered ?? artifact.answered ?? answer ?? artifact.answer);
    const chosenAnswer = answer ?? artifact.answer ?? '';

    const accept = (selectedAnswer: string) => {
        if (isAnswered) return;
        onSelect?.(selectedAnswer);
    };

    // Deduplicate options and ensure recommended (if any) is ordered first
    const allOptions = useMemo(() => {
        if (!rawOptions || rawOptions.length === 0) {
            return recommended ? [recommended] : [];
        }

        const seen = new Set<string>();
        const list: string[] = [];

        if (recommended) {
            list.push(recommended);
            seen.add(recommended.toLowerCase());
        }

        for (const opt of rawOptions) {
            const trimmed = opt.trim();
            const key = trimmed.toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                list.push(trimmed);
            }
        }
        return list;
    }, [rawOptions, recommended]);

    return (
        <div className="flex flex-col gap-3 text-left">
            {/* Question & optional context */}
            <div className="space-y-1">
                <p className="text-sm font-medium text-foreground leading-snug">
                    {question}
                </p>
                {reason && (
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        {reason}
                    </p>
                )}
            </div>

            {/* Answered State */}
            {isAnswered ? (
                <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                    <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span>
                        Selected: <strong className="font-medium text-foreground">{chosenAnswer}</strong>
                    </span>
                </div>
            ) : (
                /* Unanswered Options */
                allOptions.length > 0 ? (
                    <div className="flex flex-col gap-2 pt-1">
                        {allOptions.map((opt, i) => {
                            const isRec = Boolean(recommended && opt.toLowerCase() === recommended.toLowerCase());

                            return (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => accept(opt)}
                                    className={cn(
                                        'group flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg border text-left text-xs transition-all duration-150 cursor-pointer',
                                        isRec
                                            ? 'border-primary/40 bg-primary/[0.03] hover:bg-primary/[0.08] hover:border-primary/60 text-foreground font-medium shadow-2xs'
                                            : 'border-border/60 bg-card hover:bg-muted/40 hover:border-border text-foreground/90 font-normal'
                                    )}
                                >
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                        {isRec && (
                                            <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded shrink-0">
                                                Recommended
                                            </span>
                                        )}
                                        <span className="line-clamp-2">{opt}</span>
                                    </div>
                                    <ArrowRight className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0 text-muted-foreground group-hover:text-foreground" />
                                </button>
                            );
                        })}

                        <p className="text-[11px] text-muted-foreground/60 pt-0.5">
                            Or type your response in the chat input below.
                        </p>
                    </div>
                ) : (
                    <p className="text-xs text-muted-foreground pt-1">
                        Type your response in the chat input below.
                    </p>
                )
            )}
        </div>
    );
}