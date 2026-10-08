// =============================================================================
// Dashboard View — Top-level render pipeline for Analytical Dashboards.
// Renders the sandboxed iframe, handles postMessage bidirectional communication,
// and manages loading/generating/empty states.
// =============================================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Users, Eye, EyeOff, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useTheme } from 'next-themes';
import { Dashboard, InsightEvidence, PanelData } from './api/dashboard';
import type { SwTheme } from '@/dashboard-engine/contract';
import { GenerateProgress } from './GenerateProgress';
import { DashboardEmptyState } from './DashboardEmptyState';
import { GenerationProgress, useDeletePanel, useReorderPanels, useResizePanel, useSetPanelVisibility } from './hooks/useDashboard';
import { useConnections } from '@/components/connector/api/useConnections';
import { useGreeting } from '../auth/hooks/useGreeting';
import { useAIUsage, getProactiveQuotaError } from '../ai/hooks/useAIUsage';

interface DashboardViewProps {
  connectionId: string | null;
  dashboard?: Dashboard | null;
  html?: string;
  isLoading?: boolean;
  isGenerating?: boolean;
  generationProgress?: GenerationProgress | null;
  onGenerate?: () => void;
  onCancelGenerate?: () => void;
  onRefreshPanel?: (panelKey: string) => Promise<PanelData | null>;
  onSectionVisible?: (sectionId: string) => void;
  iframeRef?: React.RefObject<HTMLIFrameElement>;
  onOpenConnectWizard?: () => void;
  onOpenPlans?: () => void;
  onInsightWhy?: (panelKey: string, evidence?: InsightEvidence, title?: string) => void;
}

export function DashboardView({
  connectionId,
  dashboard,
  html,
  isLoading = false,
  isGenerating = false,
  generationProgress = null,
  onGenerate,
  onCancelGenerate,
  onRefreshPanel,
  onSectionVisible,
  iframeRef: externalIframeRef,
  onOpenConnectWizard,
  onOpenPlans,
  onInsightWhy,
}: DashboardViewProps) {
  const internalIframeRef = useRef<HTMLIFrameElement>(null);
  const iframeRef = externalIframeRef || internalIframeRef;

  const { data: connections } = useConnections();
  const { firstName } = useGreeting();
  const { theme, resolvedTheme } = useTheme();
  const activeTheme = theme === 'system' ? resolvedTheme : theme;
  const dashTheme: SwTheme = (
    activeTheme === 'light' || activeTheme === 'dark-black' || activeTheme === 'blue-gray'
      ? activeTheme
      : 'dark'
  );

  const selectedConnection = connections?.find((c) => c.id === connectionId);
  const isConnectorOnline = selectedConnection ? Boolean(selectedConnection.is_online) : true;
  const { data: usageStatus } = useAIUsage();
  const proactiveQuotaError = getProactiveQuotaError(usageStatus);
  const displayName = firstName || 'there';
  const isTeamMember = selectedConnection?.access_type === 'team';

  const deletePanelMutation = useDeletePanel(connectionId);
  const reorderPanelsMutation = useReorderPanels(connectionId);
  const resizePanelMutation = useResizePanel(connectionId);
  const setVisibilityMutation = useSetPanelVisibility(connectionId);

  const [pendingDelete, setPendingDelete] = useState<{ panelKey: string; title: string } | null>(null);
  const [hiddenPanels, setHiddenPanels] = useState<Array<{ key: string; title: string }>>([]);
  const [showHiddenModal, setShowHiddenModal] = useState(false);

  useEffect(() => {
    if (dashboard?.panels) {
      const hidden = dashboard.panels
        .filter((p) => p.config?.is_hidden === true)
        .map((p) => ({ key: p.panel_key || (p as any).key || '', title: p.title || p.panel_key || '' }))
        .filter((p) => Boolean(p.key));
      setHiddenPanels(hidden);
    }
  }, [dashboard?.panels]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('sw:hidden-panels-changed', {
        detail: { count: hiddenPanels.length, panels: hiddenPanels },
      })
    );
  }, [hiddenPanels]);

  useEffect(() => {
    const handleOpenModal = () => setShowHiddenModal(true);
    window.addEventListener('sw:open-hidden-panels-modal', handleOpenModal);
    return () => window.removeEventListener('sw:open-hidden-panels-modal', handleOpenModal);
  }, []);

  // Keep the sandboxed engine's palette and permissions in sync
  const pushThemeSync = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'THEME_SYNC', theme: dashTheme }, '*');
    iframeRef.current?.contentWindow?.postMessage({ type: 'SET_PERMISSIONS', canEdit: !isTeamMember }, '*');
  }, [dashTheme, isTeamMember, iframeRef]);

  useEffect(() => {
    pushThemeSync();
  }, [pushThemeSync]);

  const handleConfirmDelete = async () => {
    if (!pendingDelete || !dashboard?.id) return;
    const { panelKey, title } = pendingDelete;
    setPendingDelete(null);

    // Optimistically animate out inside the iframe
    iframeRef.current?.contentWindow?.postMessage({ type: 'PANEL_DELETED', panelKey }, '*');

    try {
      await deletePanelMutation.mutateAsync({
        dashboardId: dashboard.id,
        panelKey,
      });
      toast.success(`Removed "${title}" from dashboard`);
    } catch (err: any) {
      toast.error(`Failed to delete panel: ${err?.message || 'Deletion failed'}`);
    }
  };

  const handleUnhidePanel = (panelKey: string) => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'UNHIDE_PANEL', panelKey }, '*');
    setHiddenPanels((prev) => prev.filter((p) => p.key !== panelKey));
    if (dashboard?.id) {
      setVisibilityMutation.mutate({
        dashboardId: dashboard.id,
        panelKey,
        isHidden: false,
      });
    }
  };

  // postMessage bridge: listen for events coming from inside the sandboxed iframe
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      // Source-identity check: only accept messages from OUR sandboxed iframe
      if (event.source !== iframeRef.current?.contentWindow) return;

      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'DASHBOARD_LOADED') {
        pushThemeSync();
      } else if (msg.type === 'PANEL_DELETE_REQUEST') {
        if (isTeamMember) {
          toast.error('Only the dashboard owner can delete panels.');
          return;
        }
        setPendingDelete({ panelKey: msg.panelKey, title: msg.title || msg.panelKey });
      } else if (msg.type === 'PANEL_MOVE_REQUEST') {
        if (isTeamMember) {
          toast.error('Only the dashboard owner can reorder panels.');
          return;
        }
        if (dashboard?.id && msg.panelKey && msg.direction) {
          reorderPanelsMutation.mutate({
            dashboardId: dashboard.id,
            panelKey: msg.panelKey,
            direction: msg.direction,
          }, {
            onError: (err: any) => {
              toast.error(`Failed to move panel: ${err?.message || 'Unknown error'}`);
            },
          });
        }
      } else if (msg.type === 'PANEL_RESIZE_REQUEST') {
        if (isTeamMember) return;
        if (dashboard?.id && msg.panelKey && (msg.colSpan || msg.height !== undefined)) {
          resizePanelMutation.mutate({
            dashboardId: dashboard.id,
            panelKey: msg.panelKey,
            colSpan: msg.colSpan,
            height: msg.height,
          });
        }
      } else if (msg.type === 'PANEL_HIDE_REQUEST') {
        if (isTeamMember) return;
        if (dashboard?.id && msg.panelKey) {
          const isHidden = Boolean(msg.isHidden);
          if (isHidden) {
            setHiddenPanels((prev) => {
              if (prev.some((p) => p.key === msg.panelKey)) return prev;
              return [...prev, { key: msg.panelKey, title: msg.title || msg.panelKey }];
            });
            toast.success(`Hidden "${msg.title || msg.panelKey}". You can restore it from Hidden Panels.`);
          } else {
            setHiddenPanels((prev) => prev.filter((p) => p.key !== msg.panelKey));
          }
          setVisibilityMutation.mutate({
            dashboardId: dashboard.id,
            panelKey: msg.panelKey,
            isHidden,
          });
        }
      } else if (msg.type === 'PANEL_REFRESH_REQUEST') {
        const { panelKey } = msg;
        if (panelKey && onRefreshPanel) {
          try {
            const data = await onRefreshPanel(panelKey);
            if (data && iframeRef.current?.contentWindow) {
              iframeRef.current.contentWindow.postMessage(
                {
                  type: 'PANEL_DATA_UPDATED',
                  panelKey,
                  data,
                },
                '*'
              );
              if (data.error) {
                toast.error(`Panel error: ${data.error}`);
              }
            }
          } catch (err: any) {
            const errorMsg = err?.message || 'Refresh failed';
            toast.error(`Failed to refresh panel: ${errorMsg}`);
            if (iframeRef.current?.contentWindow) {
              iframeRef.current.contentWindow.postMessage(
                {
                  type: 'PANEL_DATA_UPDATED',
                  panelKey,
                  data: { columns: [], rows: [], error: errorMsg },
                },
                '*'
              );
            }
          }
        }
      } else if (msg.type === 'SECTION_VISIBLE') {
        if (msg.sectionId && onSectionVisible) {
          onSectionVisible(msg.sectionId);
        }
      } else if (msg.type === 'INSIGHT_WHY_REQUEST') {
        if (onInsightWhy && msg.panelKey) {
          onInsightWhy(msg.panelKey, msg.evidence, msg.title);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onRefreshPanel, onSectionVisible, iframeRef, onInsightWhy, pushThemeSync, isTeamMember, dashboard?.id, reorderPanelsMutation]);

  // 1. Currently generating dashboard
  if (isGenerating) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6 bg-background">
        <GenerateProgress progress={generationProgress} onCancel={onCancelGenerate || (() => {})} />
      </div>
    );
  }

  // 2. Initial loading state
  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6 text-center bg-background">
        <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
        <p className="text-xs text-muted-foreground">Loading dashboard...</p>
      </div>
    );
  }

  // 3. Empty state: no dashboard exists yet OR no database connected/selected yet
  if (!dashboard || !html) {
    const hasConnection = Boolean(selectedConnection);
    return (
      <DashboardEmptyState
        displayName={displayName}
        databaseName={selectedConnection?.name}
        hasConnection={hasConnection}
        isOnline={isConnectorOnline}
        quotaError={proactiveQuotaError}
        onOpenPlans={onOpenPlans}
        onGenerate={onGenerate}
        onOpenConnectWizard={onOpenConnectWizard}
        isGenerating={isGenerating}
        accessType={selectedConnection?.access_type ?? 'owner'}
      />
    );
  }

  // 5. Ready state: Render sandboxed iframe
  return (
    <div className="flex flex-1 flex-col w-full h-full overflow-hidden bg-background">
      {!isConnectorOnline && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-amber-500/30 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-300">
          <WifiOff className="w-3.5 h-3.5 shrink-0 text-amber-500" />
          <span>
            Database connector is offline. Queries and metrics cannot be refreshed until the connector daemon reconnects.
          </span>
        </div>
      )}

      {dashboard.isShared && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border bg-muted/40 text-[11px] text-muted-foreground">
          <Users className="w-3 h-3 shrink-0" />
          <span>
            {isTeamMember
              ? 'Shared with your team — generated by the connection owner'
              : 'Shared with your team — teammates view & refresh it free'}
          </span>
        </div>
      )}

      <iframe
        ref={iframeRef}
        srcDoc={html}
        title={dashboard.title || 'Analytics Dashboard'}
        sandbox="allow-scripts"
        className="w-full h-full border-none flex-1"
        onLoad={pushThemeSync}
      />

      {/* Delete Confirmation Modal */}
      <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Panel</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove <strong className="text-foreground">{pendingDelete?.title}</strong> from this dashboard?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button
              variant="outline"
              onClick={() => setPendingDelete(null)}
              disabled={deletePanelMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deletePanelMutation.isPending}
            >
              {deletePanelMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Panel'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hidden Panels Management Modal */}
      <Dialog open={showHiddenModal} onOpenChange={setShowHiddenModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <EyeOff className="w-4 h-4 text-amber-500" />
              Manage Hidden Panels
            </DialogTitle>
            <DialogDescription>
              These panels are currently hidden from your dashboard. Click "Restore" to unhide any card.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 max-h-64 overflow-y-auto py-2">
            {hiddenPanels.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">No panels are currently hidden.</p>
            ) : (
              hiddenPanels.map((p) => (
                <div key={p.key} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40 border border-border">
                  <span className="text-xs font-medium text-foreground truncate max-w-[260px]">{p.title}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleUnhidePanel(p.key)}
                    className="h-7 text-xs gap-1 text-primary hover:text-primary hover:bg-primary/10 border-primary/20"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Restore
                  </Button>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={() => setShowHiddenModal(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

