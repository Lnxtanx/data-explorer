// =============================================================================
// SuggestionsView — clickable analysis suggestion cards
// Triggered by: suggest_analysis
// =============================================================================

import { cn } from '@/lib/utils';
import type { AgentArtifact, AnalysisSuggestion } from '@/hooks/useAIAgent';

const INTENT_COLORS: Record<string, string> = {
    trend:               'bg-blue-500/10 text-blue-500',
    distribution:        'bg-violet-500/10 text-violet-500',
    correlation:         'bg-cyan-500/10 text-cyan-500',
    statistical_analysis:'bg-emerald-500/10 text-emerald-500',
    anomaly:             'bg-red-500/10 text-red-500',
    summary:             'bg-amber-500/10 text-amber-500',
    visualization:       'bg-pink-500/10 text-pink-500',
    segmentation:        'bg-indigo-500/10 text-indigo-500',
};

interface SuggestionsViewProps {
    artifact: AgentArtifact;
    onSelect?: (description: string) => void;
}

function SuggestionCard({ s, onSelect }: { s: AnalysisSuggestion; onSelect?: (d: string) => void }) {
    const colorClass = INTENT_COLORS[s.intent] ?? 'bg-muted/40 text-muted-foreground';
    return (
        <button
            onClick={() => onSelect?.(s.description)}
            className={cn(
                'flex flex-col gap-1.5 text-left rounded-lg border border-border/50 bg-muted/10 p-3 transition-all duration-150',
                onSelect ? 'hover:border-primary/40 hover:bg-primary/5 cursor-pointer active:scale-[0.98]' : 'cursor-default',
            )}
        >
            {/* Intent badge + tool */}
            <div className="flex items-center gap-1.5 flex-wrap">
                <span className={cn('text-[9px] font-semibold tracking-widest uppercase rounded-full px-2 py-0.5', colorClass)}>
                    {s.intent.replace(/_/g, ' ')}
                </span>
                <span className="text-[9px] text-muted-foreground/40 font-mono">{s.tool}</span>
            </div>
            {/* Description */}
            <p className="text-xs text-foreground/80 leading-relaxed">{s.description}</p>
            {/* Columns */}
            {s.columns?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {s.columns.map(c => (
                        <span key={c} className="text-[10px] font-mono bg-muted/50 text-muted-foreground/60 rounded px-1.5 py-0.5">{c}</span>
                    ))}
                </div>
            )}
        </button>
    );
}

export function SuggestionsView({ artifact, onSelect }: SuggestionsViewProps) {
    const suggestions = artifact.suggestions ?? [];
    const summary = artifact.columnSummary;

    return (
        <div className="flex flex-col gap-3">
            {/* Column summary pills */}
            {summary && (
                <div className="flex flex-wrap gap-2">
                    {Object.entries(summary).map(([kind, cols]) =>
                        cols.length > 0 ? (
                            <div key={kind} className="flex items-center gap-1">
                                <span className="text-[9px] font-semibold uppercase text-muted-foreground/40">{kind}:</span>
                                {cols.slice(0, 4).map(c => (
                                    <span key={c} className="text-[10px] font-mono bg-muted/40 rounded px-1.5 py-0.5 text-foreground/60">{c}</span>
                                ))}
                                {cols.length > 4 && <span className="text-[10px] text-muted-foreground/30">+{cols.length - 4}</span>}
                            </div>
                        ) : null
                    )}
                </div>
            )}

            {/* Suggestion grid */}
            {suggestions.length === 0 ? (
                <p className="text-xs text-muted-foreground/50">No suggestions available.</p>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {suggestions.map((s, i) => (
                        <SuggestionCard key={i} s={s} onSelect={onSelect} />
                    ))}
                </div>
            )}
        </div>
    );
}
