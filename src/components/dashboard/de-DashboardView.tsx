// =============================================================================
// Dashboard View — Top-level render pipeline for Analytical Dashboards.
// Renders the sandboxed iframe, handles postMessage bidirectional communication,
// and manages loading/generating/empty states.
// =============================================================================

import React, { useCallback, useEffect, useRef } from 'react';
import { Database, Loader2, Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
import { Dashboard, InsightEvidence, PanelData } from '@/lib/api/dashboard';
import type { SwTheme } from '@/dashboard-engine/contract';
import { GenerateProgress } from './de-GenerateProgress';
import { DashboardEmptyState } from './de-DashboardEmptyState';
import { GenerationProgress } from '@/hooks/de-useDashboard';
import { useConnections } from '@/lib/api/data/connection';
import { useGreeting } from '@/hooks/useGreeting';

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
  onInsightWhy?: (panelKey: string, evidence?: InsightEvidence) => void;
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
  onInsightWhy,
}: DashboardViewProps) {
  const internalIframeRef = useRef<HTMLIFrameElement>(null);
  const iframeRef = externalIframeRef || internalIframeRef;

  const { data: connections, isSuccess: connectionsLoaded } = useConnections();
  const { firstName } = useGreeting();
  const { theme, resolvedTheme } = useTheme();
  const activeTheme = theme === 'system' ? resolvedTheme : theme;
  const dashTheme: SwTheme = (
    activeTheme === 'light' || activeTheme === 'dark-black' || activeTheme === 'blue-gray'
      ? activeTheme
      : 'dark'
  );

  const selectedConnection = connections?.find((c) => c.id === connectionId);
  const displayName = firstName || 'there';
  const isTeamMember = selectedConnection?.access_type === 'team';

  // Keep the sandboxed engine's palette in sync when the app theme changes.
  const pushThemeSync = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'THEME_SYNC', theme: dashTheme }, '*');
  }, [dashTheme, iframeRef]);

  useEffect(() => {
    pushThemeSync();
  }, [pushThemeSync]);

  // postMessage bridge: listen for events coming from inside the sandboxed iframe
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      // Source-identity check: only accept messages from OUR sandboxed iframe
      // (the iframe has sandbox="allow-scripts" only, so it cannot spoof this).
      if (event.source !== iframeRef.current?.contentWindow) return;

      // Ensure the message has our expected structure
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'DASHBOARD_LOADED') {
        // The runtime just finished rendering a (possibly fresh) html snapshot —
        // reply with the current theme so __SW_THEME__ can never go stale.
        pushThemeSync();
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
          onInsightWhy(msg.panelKey, msg.evidence);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onRefreshPanel, onSectionVisible, iframeRef, onInsightWhy, pushThemeSync]);

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
      />
    </div>
  );
}