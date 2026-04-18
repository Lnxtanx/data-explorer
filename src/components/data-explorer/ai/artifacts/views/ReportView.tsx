// =============================================================================
// ReportView — sectioned document view for report artifacts
// Triggered by: generate_summary_report
// =============================================================================

import { FileText, Lightbulb } from 'lucide-react';
import type { AgentArtifact } from '@/hooks/useAIAgent';

interface ReportViewProps {
    artifact: AgentArtifact;
}

export function ReportView({ artifact }: ReportViewProps) {
    const sections = artifact.sections ?? [];
    const insights = artifact.insights ?? [];

    return (
        <div className="flex flex-col gap-4">
            {/* Header meta */}
            {artifact.generatedAt && (
                <p className="text-[10px] text-muted-foreground/40">
                    Generated {new Date(artifact.generatedAt).toLocaleString()}
                </p>
            )}

            {/* Key insights */}
            {insights.length > 0 && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex flex-col gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                        <Lightbulb className="w-3.5 h-3.5" />
                        Key Insights
                    </div>
                    <ul className="flex flex-col gap-1">
                        {insights.map((ins, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-xs text-foreground/80">
                                <span className="text-primary/60 shrink-0 mt-0.5">•</span>
                                {ins}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Sections */}
            {sections.map((sec, i) => (
                <div key={i} className="flex flex-col gap-1.5 border-b border-border/20 last:border-0 pb-3 last:pb-0">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground/90">
                        <FileText className="w-3.5 h-3.5 text-muted-foreground/40" />
                        {sec.heading}
                    </div>
                    {sec.text && (
                        <p className="text-xs text-muted-foreground/70 leading-relaxed">{sec.text}</p>
                    )}
                </div>
            ))}

            {sections.length === 0 && insights.length === 0 && (
                <p className="text-xs text-muted-foreground/50">Empty report.</p>
            )}
        </div>
    );
}
