// =============================================================================
// PlanView — analysis plan steps display
// Triggered by: build_analysis_plan
// =============================================================================

import { Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentArtifact } from '@/hooks/useAIAgent';

const STATUS_STYLES = {
    pending:  { circle: 'bg-muted/60 text-muted-foreground/50', bar: '' },
    running:  { circle: 'bg-blue-500 text-white animate-pulse', bar: 'bg-blue-500/30' },
    done:     { circle: 'bg-emerald-500 text-white', bar: 'bg-emerald-500/20' },
    error:    { circle: 'bg-red-500 text-white', bar: 'bg-red-500/10' },
} as const;

const TOOL_COLORS: Record<string, string> = {
    compute_trend:        'bg-blue-500/10 text-blue-500',
    compute_distribution: 'bg-violet-500/10 text-violet-500',
    compute_statistics:   'bg-emerald-500/10 text-emerald-500',
    detect_anomalies:     'bg-red-500/10 text-red-500',
    check_quality:        'bg-amber-500/10 text-amber-500',
    run_query:            'bg-cyan-500/10 text-cyan-500',
    compute_aggregation:  'bg-pink-500/10 text-pink-500',
    forecast_trend:       'bg-indigo-500/10 text-indigo-500',
};

interface PlanViewProps {
    artifact: AgentArtifact;
    onProceed?: (message: string) => void;
}

export function PlanView({ artifact, onProceed }: PlanViewProps) {
    const steps = artifact.planStepsData ?? [];
    // Show "Run Analysis" only when all steps are still pending (plan not yet executed)
    const allPending = steps.length > 0 && steps.every(s => s.status === 'pending');

    if (steps.length === 0) {
        return <p className="text-xs text-muted-foreground/50">No plan steps.</p>;
    }

    return (
        <div className="flex flex-col gap-1">
            {steps.map((step, i) => {
                const styles = STATUS_STYLES[step.status] ?? STATUS_STYLES.pending;
                const toolColor = step.tool ? (TOOL_COLORS[step.tool] ?? 'bg-muted/40 text-muted-foreground/60') : '';
                const isLast = i === steps.length - 1;

                return (
                    <div key={step.id} className="flex gap-2.5">
                        {/* Connector column */}
                        <div className="flex flex-col items-center">
                            <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0', styles.circle)}>
                                {step.status === 'done' ? '✓' : step.status === 'error' ? '✕' : step.id}
                            </div>
                            {!isLast && <div className="w-px flex-1 bg-border/30 my-0.5" />}
                        </div>

                        {/* Content */}
                        <div className={cn('flex flex-col gap-0.5 pb-3 flex-1', isLast ? '' : '')}>
                            <p className="text-xs text-foreground/80 leading-snug">{step.goal}</p>
                            {step.tool && (
                                <span className={cn('self-start text-[9px] font-mono rounded px-1.5 py-0.5', toolColor)}>
                                    {step.tool}
                                </span>
                            )}
                        </div>
                    </div>
                );
            })}

            {/* Run Analysis button — only shown when plan hasn't been executed yet */}
            {allPending && onProceed && (
                <div className="mt-3 pt-3 border-t border-border/20">
                    <button
                        onClick={() => onProceed('Yes, proceed with this analysis plan.')}
                        className="flex items-center gap-2 text-xs font-medium text-violet-500 hover:text-violet-400 bg-violet-500/10 hover:bg-violet-500/20 rounded-lg px-3 py-2 transition-colors w-full justify-center"
                    >
                        <Play className="w-3 h-3" />
                        Run Analysis
                    </button>
                </div>
            )}
        </div>
    );
}
