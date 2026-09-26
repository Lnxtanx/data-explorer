// =============================================================================
// Data Explorer Page
// Professional database explorer with table browsing and data inspection
// =============================================================================

import { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { DataExplorerLayout } from '@/components/data-explorer';
import { ConnectionSelector } from '@/components/data-explorer/ConnectionSelector';
import { useAuth } from '@/components/auth/AuthProvider';
import { Loader2, ChevronRight, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DEFAULT_VIEW_MODE_KEY,
  VIEW_MODE_SESSION_KEY,
  VIEW_MODE_CHANGED_EVENT,
  isViewMode,
  type ViewMode,
} from '@/lib/view-mode';
import { TableInfo } from '@/components/data-explorer/api/types';
import { useConnections } from '@/components/connector/api/useConnections';
import { toast } from 'sonner';
import { 
  acceptTeamInvitation, 
  getInvitationInfo, 
  declineTeamInvitation, 
  InvitationInfo 
} from '@/components/collaboration/api/collaboration';
import { NotificationBanner } from '@/components/notifications/NotificationBanner';
import { logger } from '@/lib/logger';
import { storePendingInvite, getPendingInvite, clearPendingInvite } from '@/components/auth/inviteToken';

// Lazy-load heavy modals with background preloading so they open instantaneously without UI freeze
const preloadSettingsModal = () => import('@/components/settings/SettingsModal');
const preloadConnectorDialog = () => import('@/components/connector/ConnectorDialog');

const SettingsModal = lazy(() => preloadSettingsModal().then(m => ({ default: m.SettingsModal })));
const ConnectorDialog = lazy(() => preloadConnectorDialog().then(m => ({ default: m.ConnectorDialog })));
const InvitationReviewModal = lazy(() => import('@/components/collaboration/InvitationReviewModal').then(m => ({ default: m.InvitationReviewModal })));

function ModalLoadingFallback() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/50 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-card border border-border shadow-md">
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
        <span className="text-xs font-medium text-muted-foreground">Opening...</span>
      </div>
    </div>
  );
}

const STORAGE_KEY = 'sw-data-explorer:connection-id';
const STORAGE_AI_PANEL_OPEN_KEY = 'sw-data-explorer:dashboard-ai-panel-open';

export default function DataExplorerPage() {
  const { user, loading: authLoading, isLoggingIn, signOut, signInWithGoogle, signInWithGithub } = useAuth();
  const [connectionId, setConnectionId] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY) || null;
  });
  const [showSettings, setShowSettings] = useState(false);
  const [settingsSection, setSettingsSection] = useState<'profile' | 'usage' | 'plans' | 'appearance' | 'shortcuts' | 'documentation' | 'collaboration'>('profile');
  const [hasShownSelectToast, setHasShownSelectToast] = useState(false);
  const [showConnectorDialog, setShowConnectorDialog] = useState(false);
  const [connectorDialogTab, setConnectorDialogTab] = useState<'overview' | 'connectors' | 'databases' | 'logs' | 'settings' | 'health' | 'connect'>('connect');
  const [isAiPanelOpen, setIsAiPanelOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(STORAGE_AI_PANEL_OPEN_KEY) === 'true';
  });

  const { data: connections, isSuccess: connectionsLoaded, refetch: refetchConnections } = useConnections();

  const [mode, setMode] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'explorer';

    const urlView = new URLSearchParams(window.location.search).get('view');
    if (isViewMode(urlView)) return urlView;

    const defaultMode = localStorage.getItem(DEFAULT_VIEW_MODE_KEY);
    if (isViewMode(defaultMode)) return defaultMode;

    const savedSession = localStorage.getItem(VIEW_MODE_SESSION_KEY);
    if (isViewMode(savedSession)) return savedSession;

    // Backward-compat: old boolean session key
    if (localStorage.getItem('sw-data-explorer:is-ai-mode') === 'true') return 'ai';

    return 'explorer';
  });
  const [aiContextTable, setAiContextTable] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<{ table: TableInfo | null; schema: string }>({
    table: null,
    schema: 'public',
  });

  // Invitation State
  const [pendingInviteInfo, setPendingInviteInfo] = useState<InvitationInfo | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [isProcessingInvite, setIsProcessingInvite] = useState(false);

  useEffect(() => {
    if (!connectionsLoaded || !connections) return;

    if (connections.length === 0) {
      if (connectionId) {
        setConnectionId(null);
      }
      return;
    }

    // Validate stored connectionId against live connections list
    const isCurrentValid = connectionId ? connections.some(c => c.id === connectionId) : false;
    if (!isCurrentValid) {
      const activeConn = connections.find(c => c.is_online) || connections[0];
      if (activeConn) {
        setConnectionId(activeConn.id);
      } else {
        setConnectionId(null);
      }
    }
  }, [connectionsLoaded, connections, connectionId]);

  useEffect(() => {
    if (connectionId) {
      localStorage.setItem(STORAGE_KEY, connectionId);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [connectionId]);

  useEffect(() => {
    localStorage.setItem(VIEW_MODE_SESSION_KEY, mode);

    const params = new URLSearchParams(window.location.search);
    const currentView = params.get('view');
    if (mode === 'ai' && currentView !== 'ai') {
      params.set('view', 'ai');
      window.history.replaceState({}, document.title, `${window.location.pathname}?${params.toString()}`);
    } else if (mode === 'dashboard' && currentView !== 'dashboard') {
      params.set('view', 'dashboard');
      window.history.replaceState({}, document.title, `${window.location.pathname}?${params.toString()}`);
    } else if (mode === 'explorer' && (currentView === 'ai' || currentView === 'dashboard')) {
      params.delete('view');
      params.delete('chat');
      params.delete('project');
      const newQuery = params.toString();
      window.history.replaceState({}, document.title, newQuery ? `${window.location.pathname}?${newQuery}` : window.location.pathname);
    }
  }, [mode]);

  const handleToggleAiPanel = useCallback(() => {
    setIsAiPanelOpen(prev => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_AI_PANEL_OPEN_KEY, String(next));
      } catch {}
      return next;
    });
  }, []);

  const handleCloseAiPanel = useCallback(() => {
    setIsAiPanelOpen(false);
    try {
      localStorage.setItem(STORAGE_AI_PANEL_OPEN_KEY, 'false');
    } catch {}
  }, []);

  const handleOpenAiPanel = useCallback(() => {
    setIsAiPanelOpen(true);
    try {
      localStorage.setItem(STORAGE_AI_PANEL_OPEN_KEY, 'true');
    } catch {}
  }, []);

  useEffect(() => {
    if (mode === 'dashboard') {
      try {
        const saved = localStorage.getItem(STORAGE_AI_PANEL_OPEN_KEY);
        if (saved === 'true') {
          setIsAiPanelOpen(true);
        }
      } catch {}
    } else {
      setIsAiPanelOpen(false);
    }
  }, [mode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
        if (mode === 'dashboard') {
          e.preventDefault();
          handleToggleAiPanel();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, handleToggleAiPanel]);

  useEffect(() => {
    if (!authLoading && !user && mode !== 'explorer') {
      setMode('explorer');
    }
  }, [authLoading, user, mode]);

  useEffect(() => {
    const handleModeChange = (e: Event) => {
      const customEvent = e as CustomEvent<ViewMode>;
      if (isViewMode(customEvent.detail)) {
        setMode(customEvent.detail);
      }
    };
    window.addEventListener(VIEW_MODE_CHANGED_EVENT, handleModeChange);
    return () => window.removeEventListener(VIEW_MODE_CHANGED_EVENT, handleModeChange);
  }, []);

  useEffect(() => {
    if (user && !connectionId && !hasShownSelectToast && connectionsLoaded && connections && connections.length > 0) {
      toast.info('Select a connection from the top right to get started', {
        description: 'You are now logged in and can access your databases.',
        duration: 5000,
      });
      setHasShownSelectToast(true);
    }
  }, [user, connectionId, hasShownSelectToast, connectionsLoaded, connections]);

  // Handle Invitations Detection
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('teamInvite');
    // Survive the OAuth round-trip: persist on arrival, restore after login
    // redirects back to a bare origin.
    if (urlToken) {
      storePendingInvite(urlToken, 'team');
    }
    const stored = getPendingInvite();
    const teamInviteToken = urlToken || (stored?.k === 'team' ? stored.t : null);

    if (teamInviteToken) {
      setInviteToken(teamInviteToken);
      const fetchInfo = async () => {
        try {
          const info = await getInvitationInfo(teamInviteToken, 'team');
          setPendingInviteInfo(info);
        } catch (error) {
          logger.error('[Invitation] Info fetch failed:', error);
          if (!pendingInviteInfo) {
            toast.error('Invalid or expired invitation link');
          }
          clearPendingInvite();
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      };
      fetchInfo();
    } else {
      // Nothing pending - drop stale storage from previous sessions.
      clearPendingInvite();
    }
  }, []);

  // Handle ?plan= deep link — open the Plans & Billing section so the user can
  // purchase/upgrade directly in-app (the marketing site deep-links here).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('plan')) {
      setSettingsSection('plans');
      setShowSettings(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleAcceptInvite = async () => {
    if (!inviteToken || !pendingInviteInfo || !user) return;
    setIsProcessingInvite(true);
    try {
      const res = await acceptTeamInvitation(inviteToken);
      if (res.success) {
        toast.success('Joined team successfully!');
        refetchConnections();
        clearPendingInvite();
      }
      setPendingInviteInfo(null);
      setInviteToken(null);
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (error: any) {
      logger.error('[Invitation] Accept failed:', error);
      toast.error(error.message || 'Failed to join');
    } finally {
      setIsProcessingInvite(false);
    }
  };

  const handleDeclineInvite = async () => {
    if (!inviteToken || !pendingInviteInfo) return;
    try {
      if (pendingInviteInfo.type === 'team' && pendingInviteInfo.teamId) {
        await declineTeamInvitation(pendingInviteInfo.teamId, pendingInviteInfo.id);
      }
    } catch (e) {
      logger.warn('Backend decline failed', e);
    }
    clearPendingInvite();
    setPendingInviteInfo(null);
    window.history.replaceState({}, document.title, window.location.pathname);
  };

  // Persist the token before the full-page OAuth redirect so the invite
  // survives the round-trip (restored on mount after login).
  const handleSignInForInvite = useCallback(() => {
    if (inviteToken) {
      storePendingInvite(inviteToken, 'team');
    }
    signInWithGoogle();
  }, [inviteToken, signInWithGoogle]);

  const handleConnectionChange = useCallback((newConnectionId: string | null) => {
    setConnectionId(newConnectionId);
    setSelectedTable({ table: null, schema: 'public' });
  }, []);

  const handleTableSelectChange = useCallback((table: TableInfo | null, schemaName: string) => {
    setSelectedTable({ table, schema: schemaName });
  }, []);

  const handleOpenConnector = useCallback((tab: 'overview' | 'connect' | 'databases' = 'overview') => {
    if (!user) {
      setSettingsSection('profile');
      setShowSettings(true);
      toast.info('Sign in required', {
        description: 'Please sign in to connect and manage your PostgreSQL databases.',
      });
      return;
    }
    setConnectorDialogTab(tab);
    setShowConnectorDialog(true);
  }, [user]);

  // Preload heavy modals in background during idle time so click-to-open is instantaneous
  useEffect(() => {
    const preload = () => {
      preloadSettingsModal();
      preloadConnectorDialog();
    };
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const handle = (window as any).requestIdleCallback(preload, { timeout: 1500 });
      return () => (window as any).cancelIdleCallback(handle);
    } else {
      const timer = setTimeout(preload, 600);
      return () => clearTimeout(timer);
    }
  }, []);

  if (isLoggingIn) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center gap-3 bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <p className="text-sm text-muted-foreground">Signing you in...</p>
      </div>
    );
  }

  return (
    <>
      <div className="h-screen flex flex-col bg-background overflow-hidden">
        <NotificationBanner />
        <div className="flex-1 flex min-h-0 overflow-hidden">
          <DataExplorerLayout
          mode={mode}
          onModeChange={setMode}
          connectionId={connectionId}
          onConnectionChange={handleConnectionChange}
          onOpenSettings={() => {
            setSettingsSection('profile');
            setShowSettings(true);
          }}
          onOpenPlans={() => {
            setSettingsSection('plans');
            setShowSettings(true);
          }}
          onTableSelectChange={handleTableSelectChange}
          headerContent={({ exportButton }) => (
            <div className="flex items-center justify-between px-4 h-10 border-b border-border bg-card w-full shrink-0">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="flex items-center shrink-0">
                  <ConnectionSelector
                    selectedConnectionId={connectionId}
                    onConnectionChange={handleConnectionChange}
                    onOpenOverview={() => handleOpenConnector('overview')}
                    onOpenConnectWizard={() => handleOpenConnector('connect')}
                  />
                </div>
                {selectedTable.table && mode !== 'dashboard' && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground ml-1">
                    <ChevronRight className="w-3 h-3" />
                    <span>{selectedTable.schema}</span>
                    <ChevronRight className="w-3 h-3" />
                    <span className="font-medium text-foreground">{selectedTable.table.name}</span>
                  </div>
                )}
                {/* Portal host stays mounted (createPortal needs it) but is hidden on
                    dashboard so the portaled grid toolbar never shows there. */}
                <div
                  id="table-actions-portal"
                  className={
                    mode === 'dashboard'
                      ? 'hidden'
                      : 'flex items-center gap-1 ml-2'
                  }
                />
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {/* Resona AI Side Panel Toggle (Dashboard AI only) - hidden when panel is open */}
                {mode === 'dashboard' && !isAiPanelOpen && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleOpenAiPanel}
                    className="h-8 px-2.5 gap-2 cursor-pointer shadow-xs transition-all duration-150 select-none font-medium text-xs rounded-lg border hover:bg-muted/70 text-foreground border-border/80 animate-in fade-in zoom-in-95 duration-150"
                    title="Open Resona AI panel (Ctrl+J)"
                  >
                    <img src="/resona.png" alt="Resona AI" className="w-3.5 h-3.5 object-contain shrink-0" />
                    <span>Resona AI</span>
                  </Button>
                )}

                {/* Export Button - grid only, never on dashboard */}
                {mode !== 'dashboard' && exportButton}
                <div id="table-export-portal" className="hidden" />
                {!user && !authLoading && (
                  <Button
                    onClick={() => {
                      setSettingsSection('profile');
                      setShowSettings(true);
                    }}
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs px-2.5"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Sign In</span>
                  </Button>
                )}
              </div>
            </div>
          )}
          onOpenAIForTable={(tableName: string) => {
            setAiContextTable(tableName);
            setMode('ai');
          }}
          onOpenConnectWizard={() => handleOpenConnector('connect')}
          aiContextTable={aiContextTable}
          aiContextSchema={selectedTable.schema}
          isAiPanelOpen={isAiPanelOpen}
          onCloseAiPanel={handleCloseAiPanel}
          onOpenAiPanel={handleOpenAiPanel}
        />
        </div>
      </div>

      {showSettings && (
        <Suspense fallback={<ModalLoadingFallback />}>
          <SettingsModal
            isOpen={showSettings}
            onClose={() => setShowSettings(false)}
            user={user}
            signOut={signOut}
            signInWithGoogle={signInWithGoogle}
            signInWithGithub={signInWithGithub}
            initialSection={settingsSection}
          />
        </Suspense>
      )}

      {pendingInviteInfo && (
        <Suspense fallback={null}>
          <InvitationReviewModal
            isOpen={!!pendingInviteInfo}
            onClose={() => setPendingInviteInfo(null)}
            invitation={pendingInviteInfo}
            onAccept={handleAcceptInvite}
            onDecline={handleDeclineInvite}
            isAuthenticated={!!user}
            currentUserEmail={user?.email ?? null}
            onSignIn={handleSignInForInvite}
            isProcessing={isProcessingInvite}
          />
        </Suspense>
      )}

      {showConnectorDialog && (
        <Suspense fallback={<ModalLoadingFallback />}>
          <ConnectorDialog
            open={showConnectorDialog}
            onClose={() => setShowConnectorDialog(false)}
            initialTab={connectorDialogTab}
            onSelectConnection={handleConnectionChange}
          />
        </Suspense>
      )}
    </>
  );
}
