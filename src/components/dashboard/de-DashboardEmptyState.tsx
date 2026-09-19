// =============================================================================
// Dashboard Empty State — Clean Graph/Timeline Guide & Creation View
// Minimalist, single-line points with elevated typography and zero fluff.
// =============================================================================

import React from 'react';
import { ArrowRight, Loader2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DashboardEmptyStateProps {
  displayName: string;
  databaseName?: string;
  onGenerate?: () => void;
  isGenerating?: boolean;
  hasConnection?: boolean;
  onOpenConnectWizard?: () => void;
  /** 'owner' = this user owns the connection; 'team' = shared with them via a team. */
  accessType?: 'owner' | 'team';
}

const GENERATION_POINTS = [
  {
    step: '01',
    text: 'AI understands your database structure, tables, and relationships to map how your business data is organized.',
  },
  {
    step: '02',
    text: 'AI identifies your core business metrics, revenue drivers, customer behavior, and growth trends across your data.',
  },
  {
    step: '03',
    text: 'AI safely analyzes your live production data using controlled, read-only queries with zero database modifications.',
  },
  {
    step: '04',
    text: 'AI transforms complex data into executive KPIs, growth trends, segment insights, and actionable business insights.',
  },
  {
    step: '05',
    text: 'Get a live view of your business with interactive dashboards, critical KPIs, key trends, and AI recommendations.',
  },
];

export function DashboardEmptyState({
  displayName,
  databaseName,
  onGenerate,
  isGenerating = false,
  hasConnection = true,
  onOpenConnectWizard,
  accessType = 'owner',
}: DashboardEmptyStateProps) {
  // Clean up email/dot suffixes (e.g. "Vivek.ky" -> "Vivek")
  const cleanName = displayName.replace(/\.[a-zA-Z0-9_-]+/g, '').trim() || displayName;
  const dbLabel = databaseName?.trim() || 'database';
  const isTeamMember = accessType === 'team';

  const handleAction = () => {
    if (!hasConnection) {
      if (onOpenConnectWizard) onOpenConnectWizard();
      return;
    }
    if (onGenerate) onGenerate();
  };

  return (
    <div className="flex flex-1 flex-col h-full overflow-y-auto bg-background">
      {/* Expansive layout with generous margin before the side panel divider */}
      <div className="w-full max-w-4xl px-8 sm:px-12 pr-16 sm:pr-28 py-8 sm:py-9">
        {/* Single Line Heading without emoji — Capitalized 'Generate' */}
        {isTeamMember ? (
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
            Team dashboard for {dbLabel} is on the way
          </h1>
        ) : (
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
            Welcome {cleanName}, Generate {dbLabel} analytics quickly
          </h1>
        )}

        {/* Timeline for the owner; team explanation for members */}
        {isTeamMember ? (
          <div className="mt-7 sm:mt-8 ml-4 pl-9">
            <div className="flex items-start gap-3 text-muted-foreground">
              <Users className="w-4 h-4 mt-0.5 shrink-0" />
              <p className="text-[13.5px] sm:text-[14px] font-medium leading-relaxed">
                This database is shared with your team. The connection owner generates
                the AI dashboard once, and it is shared with everyone automatically —
                members can view it and refresh it free, without spending AI credits.
              </p>
            </div>
            <p className="text-[12.5px] text-muted-foreground/80 mt-3">
              As soon as the connection owner generates it, it will appear here for your whole team.
            </p>
          </div>
        ) : (
          <div className="relative mt-7 sm:mt-8 ml-4 pl-9 space-y-4 before:absolute before:left-3 before:top-2.5 before:bottom-2.5 before:w-[1.5px] before:bg-border/70">
            {GENERATION_POINTS.map((point) => (
              <div key={point.step} className="relative flex items-start sm:items-center min-h-[28px]">
                {/* Node indicator on the timeline */}
                <div className="absolute -left-[37px] top-0.5 sm:top-auto w-6.5 h-6.5 rounded-full border border-border/90 bg-card flex items-center justify-center text-[11px] font-mono font-semibold text-foreground/80 shadow-2xs shrink-0">
                  {point.step}
                </div>
                <p className="text-[13.5px] sm:text-[14px] lg:text-[14.5px] text-foreground/85 font-medium leading-relaxed">
                  {point.text}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Direct Action Button placed comfortably above the fold */}
        <div className="mt-8 ml-4 pl-9">
          {isTeamMember ? (
            <p className="text-xs text-muted-foreground/80 italic">
              No dashboard yet — the connection owner will be able to generate one here.
            </p>
          ) : (
            <Button
              onClick={handleAction}
              disabled={isGenerating}
              className="h-10 px-6 text-sm font-semibold gap-2 shadow-sm rounded-lg cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Generating {databaseName ? `${databaseName} ` : ''}Dashboard...</span>
                </>
              ) : !hasConnection ? (
                <>
                  <span>Connect Database to Generate</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  <span>Generate {databaseName ? `${databaseName} ` : ''}Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}


