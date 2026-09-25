import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { ToolCallCard } from './ToolCallCard';
import type { AgentToolStep } from '../hooks/useAIAgent';

interface LiveToolStepsProps {
    steps: AgentToolStep[];
    isLive: boolean;
    defaultExpanded?: boolean;
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

function getLiveLabel(steps: AgentToolStep[]): string {
    const activeStep = steps.find(s => s.status === 'calling') || steps[steps.length - 1];
    if (activeStep?.status === 'calling') {
        if (activeStep.type === 'thinking') return 'Thinking…';
        const name = activeStep.name?.toLowerCase() || '';
        if (name.includes('query')) return 'Running query…';
        if (name.includes('export')) return 'Exporting file…';
        if (name.includes('search')) return 'Searching the web…';
        if (name.includes('report')) return 'Generating report…';
        return `Executing ${activeStep.name}…`;
    }
    if (activeStep?.type === 'thinking') {
        return 'Thinking…';
    }
    const completedQueries = steps.filter(s => s.name?.toLowerCase().includes('query')).length;
    if (completedQueries > 0) {
        return `Running query (${completedQueries} completed)…`;
    }
    return 'Working…';
}

function getStepsSummary(steps: AgentToolStep[]): string {
    const queries = steps.filter(s => s.name === 'run_query' || s.name?.toLowerCase().includes('query')).length;
    const hasThinking = steps.some(s => s.type === 'thinking' || s.name === 'thinking');
    const exports = steps.filter(s => s.name === 'export').length;
    const searches = steps.filter(s => s.name === 'web_search').length;
    const reports = steps.filter(s => s.name === 'get_report_html').length;

    const parts: string[] = [];
    if (queries > 0) {
        parts.push(queries === 1 ? 'Queried database' : `Ran ${queries} queries`);
    }
    if (hasThinking) {
        parts.push('thought');
    }
    if (exports > 0) {
        parts.push(exports === 1 ? 'exported file' : `exported ${exports} files`);
    }
    if (reports > 0) {
        parts.push('generated report');
    }
    if (searches > 0) {
        parts.push('searched the web');
    }

    if (parts.length === 0) {
        return `${steps.length} step${steps.length !== 1 ? 's' : ''}`;
    }

    const summary = parts.join(', ');
    return summary.charAt(0).toUpperCase() + summary.slice(1);
}

export function LiveToolSteps({ steps, isLive, defaultExpanded = false }: LiveToolStepsProps) {
    const [isBoxOpen, setIsBoxOpen] = useState(isLive || defaultExpanded);
    const wasLiveRef = useRef(isLive);

    useEffect(() => {
        if (isLive) {
            setIsBoxOpen(true);
        } else if (wasLiveRef.current && !isLive) {
            // Auto-collapse to summary badge once completed
            setIsBoxOpen(false);
        }
        wasLiveRef.current = isLive;
    }, [isLive]);

    // Defensive deduplication: merge any adjacent thinking steps into one card
    const displaySteps: AgentToolStep[] = [];
    for (const step of steps) {
        const isThinking = step.type === 'thinking' || step.name === 'thinking';
        const prev = displaySteps[displaySteps.length - 1];
        if (isThinking && prev && (prev.type === 'thinking' || prev.name === 'thinking')) {
            displaySteps[displaySteps.length - 1] = {
                ...prev,
                status: prev.status === 'calling' && step.status === 'calling' ? 'calling' : 'done',
                latencyMs: prev.latencyMs || step.latencyMs,
                result: {
                    success: true,
                    summary: (step.result?.summary?.length || 0) >= (prev.result?.summary?.length || 0)
                        ? (step.result?.summary ?? '')
                        : (prev.result?.summary ?? ''),
                },
            };
            continue;
        }
        displaySteps.push(step);
    }

    if (displaySteps.length === 0) return null;

    const summaryLabel = isLive ? getLiveLabel(displaySteps) : getStepsSummary(displaySteps);
    const totalMs = displaySteps.reduce((acc, s) => acc + (s.latencyMs || 0), 0);
    const totalDuration = totalMs > 0 ? formatDuration(totalMs) : null;

    return (
        <div className="w-full my-2">
            {/* Claude-style collapsible header */}
            <button
                type="button"
                onClick={() => setIsBoxOpen(prev => !prev)}
                className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground font-medium py-1 px-1.5 rounded-md transition-colors group cursor-pointer select-none mb-1"
            >
                {isLive && (
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
                )}
                <span className="group-hover:underline underline-offset-4 decoration-muted-foreground/40">
                    {summaryLabel}
                </span>
                {isBoxOpen ? (
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/60 group-hover:text-foreground transition-transform" />
                ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 group-hover:text-foreground transition-transform" />
                )}
                {!isLive && totalDuration && (
                    <span className="text-[11px] text-muted-foreground/40 font-mono">
                        · {totalDuration}
                    </span>
                )}
            </button>

            {/* The single unified container box */}
            {isBoxOpen && (
                <div className="rounded-xl border border-border/50 bg-muted/15 dark:bg-muted/10 divide-y divide-border/25 overflow-hidden shadow-sm">
                    {displaySteps.map(step => (
                        <ToolCallCard
                            key={step.id}
                            step={step}
                            isLive={isLive}
                            defaultExpanded={step.type === 'thinking' && (displaySteps.length === 1 || (isLive && step.status === 'calling'))}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

