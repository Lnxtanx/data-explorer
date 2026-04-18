import { cn } from '@/lib/utils';
import type { PlanStep } from '@/hooks/useAIAgent';

interface PlanStepsProps {
    steps: PlanStep[];
    isLive: boolean;
}

const STATUS_STYLES = {
    pending: 'border-muted-foreground/20 bg-transparent',
    running: 'border-blue-500 bg-blue-500/20 animate-pulse',
    done: 'border-green-500 bg-green-500 scale-100',
    error: 'border-red-500 bg-red-500 scale-100',
} as const;

export function PlanSteps({ steps, isLive }: PlanStepsProps) {
    if (steps.length === 0) return null;

    const doneCount = steps.filter(s => s.status === 'done').length;
    const allDone = doneCount === steps.length && !isLive;

    return (
        <div className={cn(
            'rounded-lg border border-border/40 bg-muted/5 px-3 py-2.5 mb-1 transition-opacity duration-500',
            allDone && 'opacity-60',
        )}>
            {/* Header */}
            <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-semibold tracking-widest text-violet-500 dark:text-violet-400">
                    PLAN
                </span>
                <span className="text-[11px] text-muted-foreground/40 tabular-nums">
                    {doneCount}/{steps.length}
                </span>
                {/* Progress bar */}
                <div className="flex-1 h-0.5 bg-border/30 rounded-full overflow-hidden ml-1">
                    <div
                        className="h-full bg-violet-500/60 rounded-full transition-all duration-500"
                        style={{ width: `${(doneCount / steps.length) * 100}%` }}
                    />
                </div>
            </div>

            {/* Steps */}
            <div className="flex flex-col gap-1.5">
                {steps.map((step, idx) => (
                    <div key={step.id} className="flex items-start gap-2">
                        {/* Connector + dot */}
                        <div className="flex flex-col items-center pt-0.5">
                            <span className={cn(
                                'w-2 h-2 rounded-full border shrink-0 transition-all duration-300',
                                STATUS_STYLES[step.status],
                            )} />
                            {idx < steps.length - 1 && (
                                <span className={cn(
                                    'w-px flex-1 min-h-[12px] mt-0.5',
                                    step.status === 'done' ? 'bg-green-500/30' : 'bg-border/30',
                                )} />
                            )}
                        </div>

                        {/* Goal text */}
                        <span className={cn(
                            'text-[12px] leading-snug transition-colors duration-300',
                            step.status === 'done' && 'text-muted-foreground/40 line-through',
                            step.status === 'running' && 'text-foreground/80',
                            step.status === 'pending' && 'text-muted-foreground/50',
                            step.status === 'error' && 'text-red-400/70',
                        )}>
                            {step.goal}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
