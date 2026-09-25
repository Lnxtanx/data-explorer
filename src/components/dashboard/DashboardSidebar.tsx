// =============================================================================
// Dashboard Sidebar — Left rail navigation & controls for Analytical Dashboard.
// Displays section anchors + compact live controls (Refresh, Auto-Refresh, Settings, Delete).
// =============================================================================

import React, { useState, useEffect, useMemo } from 'react';
import {
  RefreshCw,
  RotateCcw,
  Plus,
  Layers,
  TrendingUp,
  DollarSign,
  Users,
  Activity,
  BarChart3,
  Clock,
  Check,
  Settings,
  Trash2,
  AlertTriangle,
  Search,
  X,
  EyeOff,
  Filter,
  Target,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Dashboard, DashboardSection } from './api/dashboard';
import { useDeleteDashboard } from './hooks/useDashboard';
import { toast } from 'sonner';

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
  filter: Filter,
  clock: Clock,
  target: Target,
  'alert-triangle': AlertTriangle,
};

// Title-keyword fallback for sections missing an icon (older dashboards,
// or agent omitted it). Explicit section.icon always wins over this.
const TITLE_ICON_MAP: [RegExp, React.ComponentType<{ className?: string }>][] = [
  [/\b(cost|price|spend|revenue|billing|budget|money)\b/i, DollarSign],
  [/\b(growth|trend|trending|delta|change|increase|decline)\b/i, TrendingUp],
  [/\b(funnel|onboard|onboarding|conversion|drop.?off|filter)\b/i, Filter],
  [/\b(retention|cohort|churn|signal|insight|alert|pulse|engagement|activity|usage|health)\b/i, Activity],
  [/\b(outcome|goal|target|kpi|score|performance|executive|summary|overview)\b/i, Target],
  [/\b(user|learner|student|member|customer|audience|people|sign.?up|sign.?ups|active)\b/i, Users],
  [/\b(time|duration|latency|response|recent|last|daily|weekly|monthly|hourly|rate)\b/i, Clock],
];

function getSectionIcon(iconName?: string, title?: string) {
  if (iconName) {
    const key = iconName.toLowerCase().replace(/_/g, '-');
    const byName = ICON_MAP[key];
    if (byName) return byName;
  }
  if (title) {
    for (const [pattern, Icon] of TITLE_ICON_MAP) {
      if (pattern.test(title)) return Icon;
    }
  }
  return Layers;
}

/**
 * Decodes HTML entities (e.g. &amp; -> &, &quot; -> ", etc.) commonly returned in generated titles.
 */
function decodeHtmlEntities(text?: string): string {
  if (!text) return '';
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
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
  const isTeamMember = accessType === 'team';

  // Auto-refresh interval (0 = off, 60 = 1m, 300 = 5m, 900 = 15m)
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(0);

  // Search filter for dashboards with many sections (e.g. 10 to 50 sections)
  const [sectionFilter, setSectionFilter] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Track count of hidden panels for clean badge and menu trigger
  const [hiddenCount, setHiddenCount] = useState<number>(() => {
    if (!dashboard?.panels) return 0;
    return dashboard.panels.filter((p: any) => p.config?.is_hidden === true).length;
  });

  useEffect(() => {
    if (dashboard?.panels) {
      setHiddenCount(dashboard.panels.filter((p: any) => p.config?.is_hidden === true).length);
    }
  }, [dashboard?.panels]);

  useEffect(() => {
    const handleHiddenChange = (e: any) => {
      if (typeof e.detail?.count === 'number') {
        setHiddenCount(e.detail.count);
      }
    };
    window.addEventListener('sw:hidden-panels-changed', handleHiddenChange);
    return () => window.removeEventListener('sw:hidden-panels-changed', handleHiddenChange);
  }, []);

  const handleOpenHiddenModal = () => {
    window.dispatchEvent(new CustomEvent('sw:open-hidden-panels-modal'));
  };

  // Delete dashboard dialog state & mutation
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const deleteDashboardMutation = useDeleteDashboard(connectionId || null);

  // Handle auto-refresh timer
  useEffect(() => {
    if (!autoRefreshInterval || !dashboard?.id || isRefreshing || isGenerating) return;

    const intervalId = setInterval(() => {
      onRefreshAll?.();
    }, autoRefreshInterval * 1000);

    return () => clearInterval(intervalId);
  }, [autoRefreshInterval, dashboard?.id, isRefreshing, isGenerating, onRefreshAll]);

  // Filtered sections list for 50+ sections
  const filteredSections = useMemo(() => {
    if (!dashboard?.sections) return [];
    if (!sectionFilter.trim()) return dashboard.sections;
    const query = sectionFilter.toLowerCase();
    return dashboard.sections.filter((s: DashboardSection) =>
      decodeHtmlEntities(s.title).toLowerCase().includes(query)
    );
  }, [dashboard?.sections, sectionFilter]);

  const handleConfirmDelete = async () => {
    if (!dashboard?.id) return;
    try {
      await deleteDashboardMutation.mutateAsync(dashboard.id);
      toast.success(`"${dashboard.title || 'Dashboard'}" has been permanently removed.`);
      setShowDeleteDialog(false);
    } catch (err: any) {
      toast.error(err.message || 'An unexpected error occurred while deleting.');
    }
  };

  if (!connectionId) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-4 text-center text-muted-foreground">
        <p className="text-xs">Select a database to view its dashboard.</p>
      </div>
    );
  }

  const sectionsCount = dashboard?.sections?.length || 0;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col h-full min-h-0 justify-between bg-card select-none">
        {/* =================================================================== */}
        {/* Top: Sections Navigation (Independent Auto-Scrolling for 50+ items) */}
        {/* =================================================================== */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Section Header with count and optional search toggle */}
          <div className="px-3 py-2 flex items-center justify-between border-b border-border/40 shrink-0">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Sections {sectionsCount > 0 && `(${sectionsCount})`}
            </span>
            {sectionsCount > 6 && (
              <button
                onClick={() => {
                  setIsSearching((prev) => !prev);
                  if (isSearching) setSectionFilter('');
                }}
                className={cn(
                  'p-1 rounded text-muted-foreground hover:text-foreground transition-colors',
                  (isSearching || sectionFilter) && 'text-primary'
                )}
                title={isSearching ? 'Close search' : 'Filter sections'}
              >
                {isSearching ? <X className="w-3.5 h-3.5" /> : <Search className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>

          {/* Quick Search Input for Large Section Lists */}
          {isSearching && (
            <div className="px-2.5 pt-1.5 pb-1 border-b border-border/30 shrink-0">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                <input
                  type="text"
                  value={sectionFilter}
                  onChange={(e) => setSectionFilter(e.target.value)}
                  placeholder="Filter sections..."
                  className="w-full bg-muted/40 text-[13px] pl-7 pr-7 py-1.5 rounded border border-border/60 focus:outline-none focus:ring-1 focus:ring-primary/60 placeholder:text-muted-foreground/60"
                  autoFocus
                />
                {sectionFilter && (
                  <button
                    onClick={() => setSectionFilter('')}
                    className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Scrollable Section Items */}
          <div className="flex-1 min-h-0 overflow-y-auto px-2 py-1.5 space-y-1 scrollbar-thin">
            {dashboard && filteredSections.length > 0 ? (
              <nav className="space-y-0.5">
                {filteredSections.map((section: DashboardSection) => {
                  const Icon = getSectionIcon(section.icon, section.title);
                  const isActive = activeSectionId === section.id;
                  const decodedTitle = decodeHtmlEntities(section.title);

                  return (
                    <button
                      key={section.id}
                      onClick={() => onScrollToSection?.(section.id)}
                      title={decodedTitle}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all text-left group',
                        isActive
                          ? 'bg-primary/10 text-primary font-semibold shadow-sm'
                          : 'text-foreground/80 hover:text-foreground hover:bg-muted/60'
                      )}
                    >
                      <Icon
                        className={cn(
                          'w-4 h-4 shrink-0 transition-transform group-hover:scale-105',
                          isActive ? 'text-primary' : 'text-muted-foreground/70 group-hover:text-foreground'
                        )}
                      />
                      <span className="truncate leading-snug">{decodedTitle}</span>
                    </button>
                  );
                })}
              </nav>
            ) : dashboard && sectionsCount > 0 ? (
              <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                No sections match &ldquo;{sectionFilter}&rdquo;
              </div>
            ) : (
              <div className="px-2 py-4 text-xs text-muted-foreground italic text-center">
                {isGenerating ? 'Generating sections...' : 'No sections defined'}
              </div>
            )}
          </div>
        </div>

        {/* =================================================================== */}
        {/* =================================================================== */}
        {/* Bottom: Streamlined Dashboard Footer Toolbar                        */}
        {/* =================================================================== */}
        <div className="shrink-0 border-t border-border bg-card/60 backdrop-blur-sm p-2">
          {dashboard ? (
            <div className="flex items-center gap-1.5">
              {/* Refresh All Cards Button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onRefreshAll}
                    disabled={isRefreshing || isGenerating}
                    className="flex-1 h-7 text-xs font-medium gap-1.5 px-2 justify-center shadow-sm"
                  >
                    <RefreshCw
                      className={cn('w-3 h-3 shrink-0', isRefreshing && 'animate-spin text-primary')}
                    />
                    <span className="truncate">
                      {isRefreshing ? 'Refreshing...' : 'Refresh All'}
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  Fetch fresh data for all dashboard cards
                </TooltipContent>
              </Tooltip>

              {/* Hidden Panels quick restore pill (only shown when >= 1 hidden panel) */}
              {hiddenCount > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleOpenHiddenModal}
                      className="h-7 px-2 text-xs font-medium gap-1 shrink-0 border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 shadow-sm"
                    >
                      <EyeOff className="w-3 h-3 shrink-0" />
                      <span>{hiddenCount}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {hiddenCount} panel{hiddenCount > 1 ? 's' : ''} hidden — click to manage
                  </TooltipContent>
                </Tooltip>
              )}

              {/* Settings Dropdown: Auto-refresh, Hidden Cards, Regenerate, Delete */}
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          'h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-foreground shadow-sm relative',
                          autoRefreshInterval > 0 && 'text-primary border-primary/40'
                        )}
                      >
                        <Settings className="w-3.5 h-3.5" />
                        {autoRefreshInterval > 0 && (
                          <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    Dashboard Settings
                  </TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end" className="w-52 text-xs">
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Settings & Actions
                  </DropdownMenuLabel>

                  {/* Auto-Refresh Sub-Menu */}
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="gap-2 cursor-pointer">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>
                        Auto-Refresh:{' '}
                        {autoRefreshInterval === 0
                          ? 'Off'
                          : autoRefreshInterval === 60
                          ? '1m'
                          : autoRefreshInterval === 300
                          ? '5m'
                          : `${autoRefreshInterval / 60}m`}
                      </span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-36 text-xs">
                      <DropdownMenuItem
                        onClick={() => setAutoRefreshInterval(0)}
                        className="gap-2 cursor-pointer"
                      >
                        {autoRefreshInterval === 0 ? (
                          <Check className="w-3 h-3 text-primary" />
                        ) : (
                          <span className="w-3" />
                        )}
                        <span>Off</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setAutoRefreshInterval(60)}
                        className="gap-2 cursor-pointer"
                      >
                        {autoRefreshInterval === 60 ? (
                          <Check className="w-3 h-3 text-primary" />
                        ) : (
                          <span className="w-3" />
                        )}
                        <span>Every 1 min</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setAutoRefreshInterval(300)}
                        className="gap-2 cursor-pointer"
                      >
                        {autoRefreshInterval === 300 ? (
                          <Check className="w-3 h-3 text-primary" />
                        ) : (
                          <span className="w-3" />
                        )}
                        <span>Every 5 min</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setAutoRefreshInterval(900)}
                        className="gap-2 cursor-pointer"
                      >
                        {autoRefreshInterval === 900 ? (
                          <Check className="w-3 h-3 text-primary" />
                        ) : (
                          <span className="w-3" />
                        )}
                        <span>Every 15 min</span>
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>

                  {/* Manage Hidden Cards */}
                  {hiddenCount > 0 && (
                    <DropdownMenuItem
                      onClick={handleOpenHiddenModal}
                      className="gap-2 cursor-pointer"
                    >
                      <EyeOff className="w-3.5 h-3.5 text-amber-500" />
                      <span>Manage Hidden Cards ({hiddenCount})</span>
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuSeparator />

                  {!isTeamMember ? (
                    <>
                      <DropdownMenuItem
                        onClick={onRegenerate}
                        disabled={isGenerating}
                        className="gap-2 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>Regenerate Dashboard</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setShowDeleteDialog(true)}
                        className="gap-2 text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Dashboard...</span>
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <div className="px-2 py-1.5 text-[11px] text-muted-foreground italic">
                      Shared dashboard (View-only)
                    </div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : isTeamMember ? (
            <div className="p-3 text-[11px] text-muted-foreground/70 italic leading-snug">
              No dashboard yet — the connection owner will generate it once and it will be shared
              with your team automatically.
            </div>
          ) : (
            <Button
              size="sm"
              onClick={onRegenerate}
              disabled={isGenerating}
              className="w-full justify-center text-xs h-8 font-medium gap-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Dashboard</span>
            </Button>
          )}
        </div>

        {/* =================================================================== */}
        {/* Delete Dashboard Confirmation Dialog                                */}
        {/* =================================================================== */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent className="sm:max-w-md">
            <AlertDialogHeader>
              <div className="w-10 h-10 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mb-1">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <AlertDialogTitle className="text-base font-semibold">
                Delete Dashboard?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-xs text-muted-foreground leading-relaxed pt-1">
                Are you sure you want to delete{' '}
                <strong className="text-foreground font-medium">
                  {decodeHtmlEntities(dashboard?.title) || 'this dashboard'}
                </strong>
                ? This action is permanent and cannot be undone. All dashboard panels, metric
                configurations, and customized layout sizes will be permanently deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2 sm:gap-0 mt-3">
              <AlertDialogCancel
                disabled={deleteDashboardMutation.isPending}
                className="text-xs h-8"
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleConfirmDelete();
                }}
                disabled={deleteDashboardMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs h-8 font-medium gap-1.5"
              >
                {deleteDashboardMutation.isPending ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3 h-3" />
                    <span>Delete Dashboard</span>
                  </>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}