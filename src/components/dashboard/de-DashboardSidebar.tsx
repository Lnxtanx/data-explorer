// =============================================================================
// Dashboard Sidebar — Left rail navigation & controls for Analytical Dashboard.
// Displays section anchors + live controls (Refresh All, Auto-Refresh, Regenerate).
// =============================================================================

import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  Sparkles,
  Layers,
  TrendingUp,
  DollarSign,
  Users,
  Activity,
  BarChart3,
  Clock,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { Dashboard, DashboardSection } from '@/lib/api/dashboard';

interface DashboardSidebarProps {
  connectionId?: string | null;
  dashboard?: Dashboard | null;
  isGenerating?: boolean;
  isRefreshing?: boolean;
  onRefreshAll?: () => void;
  onRegenerate?: () => void;
  onScrollToSection?: (sectionId: string) => void;
  activeSectionId?: string | null;
  /** 'owner' = this user owns the connection; 'team' = shared via a team (view-only). */
  accessType?: 'owner' | 'team';
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  'trending-up': TrendingUp,
  'dollar-sign': DollarSign,
  users: Users,
  activity: Activity,
  overview: BarChart3,
  layers: Layers,
};

function getSectionIcon(iconName?: string) {
  if (!iconName) return Layers;
  const key = iconName.toLowerCase().replace(/_/g, '-');
  return ICON_MAP[key] || Layers;
}

export function DashboardSidebar({
  connectionId,
  dashboard,
  isGenerating = false,
  isRefreshing = false,
  onRefreshAll,
  onRegenerate,
  onScrollToSection,
  activeSectionId,
  accessType = 'owner',
}: DashboardSidebarProps) {
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(0); // 0 = off, 60 = 1m, 300 = 5m
  const isTeamMember = accessType === 'team';

  // Handle auto-refresh timer
  useEffect(() => {
    if (!autoRefreshInterval || !dashboard?.id || isRefreshing || isGenerating) return;

    const intervalId = setInterval(() => {
      onRefreshAll?.();
    }, autoRefreshInterval * 1000);

    return () => clearInterval(intervalId);
  }, [autoRefreshInterval, dashboard?.id, isRefreshing, isGenerating, onRefreshAll]);

  if (!connectionId) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-4 text-center text-muted-foreground">
        <p className="text-xs">Select a database to view its dashboard.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full justify-between">
      {/* Top: Sections navigation */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Sections
        </div>

        {dashboard && dashboard.sections && dashboard.sections.length > 0 ? (
          <nav className="space-y-1 mt-1">
            {dashboard.sections.map((section: DashboardSection) => {
              const Icon = getSectionIcon(section.icon);
              const isActive = activeSectionId === section.id;

              return (
                <button
                  key={section.id}
                  onClick={() => onScrollToSection?.(section.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors text-left',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{section.title}</span>
                </button>
              );
            })}
          </nav>
        ) : (
          <div className="px-2 py-3 text-xs text-muted-foreground italic">
            {isGenerating ? 'Generating sections...' : 'No sections defined'}
          </div>
        )}
      </div>

      {/* Bottom: Live Controls */}
      <div className="p-3 border-t border-border bg-card/50 space-y-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
          Controls
        </div>

        {dashboard ? (
          <>
            {/* Refresh All Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={onRefreshAll}
              disabled={isRefreshing || isGenerating}
              className="w-full justify-start text-xs h-8 gap-2 font-medium"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin text-primary')} />
              <span>{isRefreshing ? 'Refreshing data...' : 'Refresh All Cards'}</span>
            </Button>

            {/* Auto Refresh Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isGenerating}
                  className="w-full justify-between text-xs h-7 px-2 text-muted-foreground hover:text-foreground"
                >
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    <span>
                      {autoRefreshInterval === 0
                        ? 'Auto-refresh: Off'
                        : autoRefreshInterval === 60
                        ? 'Auto-refresh: 1 min'
                        : 'Auto-refresh: 5 min'}
                    </span>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36 text-xs">
                <DropdownMenuItem onClick={() => setAutoRefreshInterval(0)} className="gap-2">
                  {autoRefreshInterval === 0 && <Check className="w-3 h-3 text-primary" />}
                  <span className={cn(autoRefreshInterval !== 0 && 'pl-5')}>Off</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setAutoRefreshInterval(60)} className="gap-2">
                  {autoRefreshInterval === 60 && <Check className="w-3 h-3 text-primary" />}
                  <span className={cn(autoRefreshInterval !== 60 && 'pl-5')}>Every 1 min</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setAutoRefreshInterval(300)} className="gap-2">
                  {autoRefreshInterval === 300 && <Check className="w-3 h-3 text-primary" />}
                  <span className={cn(autoRefreshInterval !== 300 && 'pl-5')}>Every 5 min</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Regenerate Button (owner only — team members view & refresh) */}
            {isTeamMember ? (
              <div className="px-2 py-1.5 text-[11px] text-muted-foreground/70 italic leading-snug">
                Shared dashboard — only the connection owner can regenerate it.
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRegenerate}
                disabled={isGenerating}
                className="w-full justify-start text-xs h-7 px-2 text-muted-foreground hover:text-foreground gap-1.5"
              >
                <RefreshCw className="w-3 h-3 text-muted-foreground" />
                <span>Regenerate Dashboard</span>
              </Button>
            )}
          </>
        ) : isTeamMember ? (
          <div className="px-2 py-1.5 text-[11px] text-muted-foreground/70 italic leading-snug">
            No dashboard yet — the connection owner will generate it once and it will
            be shared with your team automatically.
          </div>
        ) : (
          <Button
            size="sm"
            onClick={onRegenerate}
            disabled={isGenerating}
            className="w-full justify-center text-xs h-8 font-medium gap-1.5"
          >
            <span>Create Dashboard</span>
          </Button>
        )}
      </div>
    </div>
  );
}