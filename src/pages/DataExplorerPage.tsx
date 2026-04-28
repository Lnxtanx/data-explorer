// =============================================================================
// Data Explorer Page
// Professional database explorer with table browsing and data inspection
// =============================================================================

import { useState, useCallback, useEffect } from 'react';
import { DataExplorerLayout } from '@/components/data-explorer';
import { ConnectionSelector } from '@/components/data-explorer/ConnectionSelector';
import { useAuth } from '@/components/auth/AuthProvider';
import { Loader2, ChevronRight } from 'lucide-react';
import { SettingsModal } from '@/components/settings';
import { ExportButton } from '@/components/data-explorer/ExportButton';
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
import { InvitationReviewModal } from '@/components/auth/InvitationReviewModal';
import { NotificationBanner } from '@/components/ui/NotificationBanner';

const STORAGE_KEY = 'sw-data-explorer:connection-id';

export default function DataExplorerPage() {
  const { user, loading: authLoading, isLoggingIn, signOut, signInWithGoogle } = useAuth();
  const [connectionId, setConnectionId] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY);
  });
  const [showSettings, setShowSettings] = useState(false);
  const [settingsSection, setSettingsSection] = useState<'profile' | 'usage' | 'plans' | 'appearance' | 'shortcuts' | 'documentation' | 'collaboration'>('profile');
  const [hasShownSelectToast, setHasShownSelectToast] = useState(false);

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
    if (connectionsLoaded && connections && connections.length > 0 && !connectionId) {
      const firstId = connections[0].id;
      setConnectionId(firstId);
      localStorage.setItem(STORAGE_KEY, firstId);
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
    const teamInviteToken = params.get('teamInvite');
    
    if (teamInviteToken) {
      setInviteToken(teamInviteToken);
      const fetchInfo = async () => {
        try {
          const info = await getInvitationInfo(teamInviteToken, 'team');
          setPendingInviteInfo(info);
        } catch (error) {
          console.error('[Invitation] Info fetch failed:', error);
          if (!pendingInviteInfo) {
            toast.error('Invalid or expired invitation link');
          }
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      };
      fetchInfo();
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
      }
      setPendingInviteInfo(null);
      setInviteToken(null);
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (error: any) {
      console.error('[Invitation] Accept failed:', error);
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
      console.warn('Backend decline failed', e);
    }
    setPendingInviteInfo(null);
    setInviteToken(null);
    window.history.replaceState({}, document.title, window.location.pathname);
  };

  const handleConnectionChange = useCallback((newConnectionId: string | null) => {
    setConnectionId(newConnectionId);
    setSelectedTable({ table: null, schema: 'public' });
  }, []);

  const handleTableSelectChange = useCallback((table: TableInfo | null, schemaName: string) => {
    setSelectedTable({ table, schema: schemaName });
  }, []);

  if (authLoading || isLoggingIn) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        {isLoggingIn && <p className="text-sm text-muted-foreground">Signing you in...</p>}
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
                <div className="w-44 shrink-0">
                  <ConnectionSelector
                    selectedConnectionId={connectionId}
                    onConnectionChange={handleConnectionChange}
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
                <ExportButton
                  connectionId={connectionId}
                  tableName={selectedTable.table?.name || ''}
                  schemaName={selectedTable.schema}
                />
                {!user && (
                  <Button
                    onClick={signInWithGoogle}
                    variant="outline"
                    size="sm"
                    className="gap-2 text-blue-600 border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                  >
                    <img
                      src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                      alt="Google"
                      className="w-4 h-4"
                    />
                    Sign In
                  </Button>
                )}
              </div>
            </div>
          }
          onOpenAIForTable={(tableName: string) => {
            setAiContextTable(tableName);
            setIsAiMode(true);
          }}
          aiContextTable={aiContextTable}
          aiContextSchema={selectedTable.schema}
        />
      </div>

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        user={user}
        signOut={signOut}
        signInWithGoogle={signInWithGoogle}
        initialSection={settingsSection}
      />

      <InvitationReviewModal
        isOpen={!!pendingInviteInfo}
        onClose={() => setPendingInviteInfo(null)}
        invitation={pendingInviteInfo}
        onAccept={handleAcceptInvite}
        onDecline={handleDeclineInvite}
        isAuthenticated={!!user}
        onSignIn={signInWithGoogle}
        isProcessing={isProcessingInvite}
      />
    </>
  );
}
