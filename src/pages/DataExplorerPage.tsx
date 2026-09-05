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
import { TableInfo } from '@/lib/api/data/explorer/types';
import { useConnections } from '@/lib/api/data/connection';
import { toast } from 'sonner';
import { 
  acceptTeamInvitation, 
  getInvitationInfo, 
  declineTeamInvitation, 
  InvitationInfo 
} from '@/lib/api/projects/collaboration';
import { NotificationBanner } from '@/components/ui/NotificationBanner';
import { logger } from '@/lib/logger';
import { storePendingInvite, getPendingInvite, clearPendingInvite } from '@/lib/inviteToken';

// Lazy-load heavy modals so their subviews/dependencies are not loaded on first render
const SettingsModal = lazy(() => import('@/components/settings/SettingsModal').then(m => ({ default: m.SettingsModal })));
const ConnectorDialog = lazy(() => import('@/components/connector/ConnectorDialog').then(m => ({ default: m.ConnectorDialog })));
const InvitationReviewModal = lazy(() => import('@/components/auth/InvitationReviewModal').then(m => ({ default: m.InvitationReviewModal })));

const STORAGE_KEY = 'sw-data-explorer:connection-id';

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

  const { data: connections, isSuccess: connectionsLoaded, refetch: refetchConnections } = useConnections();

  const [isAiMode, setIsAiMode] = useState(false);
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
    // Auto-select first active discovered database if available and no connection is set
    if (connectionsLoaded && connections && connections.length > 0 && !connectionId) {
      const activeConn = connections.find(c => c.is_online) || connections[0];
      if (activeConn) {
        setConnectionId(activeConn.id);
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
      <NotificationBanner />
      <div className="h-screen flex bg-background">
        <DataExplorerLayout
          isAiMode={isAiMode}
          onCloseAI={() => setIsAiMode(false)}
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
          onOpenAI={() => {
            if (!user) {
              toast.error('Authentication Required', {
                description: 'Please sign in to use Resona AI features.',
              });
              return;
            }
            setIsAiMode((prev) => !prev);
          }}
          onTableSelectChange={handleTableSelectChange}
          headerContent={
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
                {selectedTable.table && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground ml-1">
                    <ChevronRight className="w-3 h-3" />
                    <span>{selectedTable.schema}</span>
                    <ChevronRight className="w-3 h-3" />
                    <span className="font-medium text-foreground">{selectedTable.table.name}</span>
                  </div>
                )}
                <div id="table-actions-portal" className="flex items-center gap-1 ml-2" />
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {selectedTable.table && (
                  <button
                    onClick={() => {
                      setAiContextTable(selectedTable.table?.name || null);
                      setIsAiMode(true);
                    }}
                    className="flex items-center gap-1.5 h-7 px-2 rounded-md text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                    title="Ask Resona AI about this table"
                  >
                    <img src="/resona.png" alt="Resona AI" className="w-4 h-4" />
                  </button>
                )}
                {/* Export Button Portal Target (placed after Resona AI on top right) */}
                <div id="table-export-portal" className="flex items-center" />
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
          }
          onOpenAIForTable={(tableName: string) => {
            setAiContextTable(tableName);
            setIsAiMode(true);
          }}
          onOpenConnectWizard={() => handleOpenConnector('connect')}
          aiContextTable={aiContextTable}
          aiContextSchema={selectedTable.schema}
        />
      </div>

      {showSettings && (
        <Suspense fallback={null}>
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
        <Suspense fallback={null}>
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
