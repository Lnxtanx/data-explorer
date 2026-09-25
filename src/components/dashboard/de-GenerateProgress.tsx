// =============================================================================
// Generate Progress Modal / Card
// Visual feedback during 5-phase AI dashboard generation.
// =============================================================================

import React from 'react';
import { BarChart3, Database, Layout, ShieldCheck, CheckCircle2, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { GenerationProgress } from '@/hooks/de-useDashboard';
import { LiveToolSteps } from '@/components/data-explorer/ai/tools/LiveToolSteps';
import { sanitizeToolSummary } from '@/components/data-explorer/ai/tools/toolSanitize';

interface GenerateProgressProps {
  progress: GenerationProgress | null;
  onCancel: () => void;
}

const PHASES = [
  { id: 'introspect', label: 'Schema', icon: Database },
  { id: 'plan', label: 'Layout & KPIs', icon: Layout },
  { id: 'validate', label: 'SQL Safety', icon: ShieldCheck },
  { id: 'persist', label: 'Save', icon: CheckCircle2 },
  { id: 'render', label: 'Render', icon: BarChart3 },
];

export function GenerateProgress({ progress, onCancel }: GenerateProgressProps) {
  const percent = progress?.percent || 15;
  const currentPhase = progress?.phase || 'introspect';
  const [dismissedWarnings, setDismissedWarnings] = React.useState<Set<string>>(new Set());
  const visibleWarnings = (progress?.warnings || [])
    .map((w) => sanitizeToolSummary(w))
    .filter((w) => w && !dismissedWarnings.has(w));
  const progressMessage = progress?.message
    ? sanitizeToolSummary(progress.message)
    : 'Analyzing tables, relations, and drafting business metrics...';

  const currentIdx = PHASES.findIndex((p) => p.id === currentPhase);

  return (
    <div className="flex flex-col items-center justify-center p-8 max-w-lg w-full mx-auto bg-card border border-border rounded-xl shadow-lg animate-in fade-in zoom-in-95 duration-200">
      {/* Header icon with subtle loader */}
      <div className="relative mb-5 flex items-center justify-center">
        <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
          <BarChart3 className="w-6 h-6 animate-pulse" />
        </div>
      </div>

      <h3 className="text-base font-semibold text-foreground mb-1">
        Generating Analytics Dashboard
      </h3>
      <p className="text-xs text-muted-foreground text-center mb-6 max-w-xs">
        {progressMessage}
      </p>

      {/* Progress Bar */}
      <div className="w-full bg-muted rounded-full h-2 overflow-hidden mb-6">
        <div
          className="bg-primary h-full transition-all duration-500 ease-out rounded-full"
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Live tool steps — mirrors the reasoning-agent step list */}
      <div className="w-full mb-4">
        <LiveToolSteps steps={progress?.toolSteps || []} isLive />
      </div>

      {visibleWarnings.length > 0 && (
        <div className="w-full mb-4 space-y-1.5">
          {visibleWarnings.map((w, i) => (
            <div
              key={i}
              className="flex items-start justify-between gap-1.5 text-[11px] text-amber-600 dark:text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5 leading-snug animate-in fade-in duration-150"
            >
              <div className="flex items-start gap-1.5 flex-1 min-w-0">
                <span className="shrink-0 select-none">⚠️</span>
                <span className="flex-1 select-text">{w}</span>
              </div>
              <button
                type="button"
                onClick={() => setDismissedWarnings((prev) => new Set([...prev, w]))}
                className="shrink-0 p-0.5 rounded text-amber-600/60 dark:text-amber-500/60 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-500/20 transition-colors ml-1"
                title="Dismiss warning"
                aria-label="Dismiss warning"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Step Indicators */}
      <div className="w-full flex items-center justify-between px-2 mb-6">
        {PHASES.map((p, idx) => {
          const Icon = p.icon;
          const isDone = currentIdx > idx || percent >= 100;
          const isCurrent = currentIdx === idx && percent < 100;

          return (
            <div key={p.id} className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-xs transition-colors border',
                  isDone && 'bg-primary text-primary-foreground border-primary',
                  isCurrent && 'bg-primary/15 text-primary border-primary animate-pulse',
                  !isDone && !isCurrent && 'bg-muted/40 text-muted-foreground border-border'
                )}
              >
                {isCurrent ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Icon className="w-4 h-4" />
                )}
              </div>
              <span
                className={cn(
                  'text-[10px] font-medium tracking-tight',
                  isCurrent ? 'text-primary' : isDone ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {p.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Cancel button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onCancel}
        className="text-xs text-muted-foreground hover:text-foreground h-8 px-3 gap-1.5"
      >
        <X className="w-3.5 h-3.5" />
        Cancel Generation
      </Button>
    </div>
  );
}
