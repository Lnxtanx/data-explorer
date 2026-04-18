import { Loader2 } from 'lucide-react';
import { ToolCallCard } from './ToolCallCard';
import type { AgentToolStep } from '@/hooks/useAIAgent';

interface LiveToolStepsProps {
    steps: AgentToolStep[];
    isLive: boolean;
    defaultExpanded?: boolean;
}

export function LiveToolSteps({ steps, isLive, defaultExpanded }: LiveToolStepsProps) {
    if (steps.length === 0) return null;

    const doneCount = steps.filter(s => s.status === 'done').length;
    const hasPending = steps.some(s => s.status === 'calling');

    return (
        <div className="flex flex-col gap-1.5 my-2">
            {/* Live execution indicator */}
            {isLive && hasPending && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 px-0.5">
                    <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />
                    <span>{doneCount}/{steps.length} tools completed</span>
                </div>
            )}

            {/* Independent tool cards */}
            {steps.map(step => (
                <ToolCallCard
                    key={step.id}
                    step={step}
                    defaultExpanded={defaultExpanded}
                />
            ))}
        </div>
    );
}
