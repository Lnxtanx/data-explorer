// =============================================================================
// useSidePanelSessions.ts — Side Panel Session History & Switching Manager
// Tracks durable sessions, session selection, message caching per session,
// history items for the dropdown menu, and deletion.
// =============================================================================

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { dashboardKeys } from '../api/dashboard';
import {
  useDashboardSessions,
  useDashboardRunState,
  useDeleteDashboardSession,
} from '../hooks/useDashboard';
import { type SidePanelMessage } from './ResonaAIMessageItem';

interface UseSidePanelSessionsOptions {
  connectionId?: string | null;
  localMessages: SidePanelMessage[];
  setLocalMessages: React.Dispatch<React.SetStateAction<SidePanelMessage[]>>;
  localMessagesRef: React.MutableRefObject<SidePanelMessage[]>;
  isGenerating: boolean;
  onCancelGeneration?: () => void;
}

export function useSidePanelSessions({
  connectionId,
  localMessages,
  setLocalMessages,
  localMessagesRef,
  isGenerating,
  onCancelGeneration,
}: UseSidePanelSessionsOptions) {
  const queryClient = useQueryClient();

  const {
    data: sessions = [],
    isLoading: isSessionsLoading,
    refetch: refetchSessions,
  } = useDashboardSessions(connectionId ?? null);

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const { data: runState, isFetching: isRunStateLoading } = useDashboardRunState(selectedRunId);
  const deleteSessionMutation = useDeleteDashboardSession(connectionId ?? null);

  // Per-session message cache so switching chats doesn't destroy unsaved turns
  const messagesBySessionRef = useRef<Record<string, SidePanelMessage[]>>({});

  const hasAutoSelectedRef = useRef(false);

  // History items for the header dropdown menu — includes an optimistic
  // pending entry for the active chat when the server list hasn't caught up yet.
  const historyItems = useMemo(() => {
    const items = sessions.map((s) => ({
      id: s.run_id,
      sessionId: s.session_id,
      title: s.message || 'Dashboard Session',
      status: s.status,
      createdAt: s.created_at,
      turnCount: s.turn_count,
      isActive: s.run_id === selectedRunId || (!!currentSessionId && s.session_id === currentSessionId),
    }));

    // Optimistic entry: current session exists locally but not yet on server
    if (
      currentSessionId &&
      !sessions.some((s) => s.session_id === currentSessionId) &&
      (localMessages.length > 0 || isGenerating)
    ) {
      const firstUser = localMessages.find((m) => m.role === 'user');
      items.unshift({
        id: selectedRunId || `pending-${currentSessionId}`,
        sessionId: currentSessionId,
        title: firstUser?.content?.slice(0, 80) || 'New chat',
        status: isGenerating ? 'running' : 'pending',
        createdAt: localMessages[0]?.timestamp || new Date().toISOString(),
        turnCount: Math.max(1, Math.ceil(localMessages.length / 2)),
        isActive: true,
      });
    }
    return items;
  }, [sessions, selectedRunId, currentSessionId, localMessages, isGenerating]);

  // Auto-select the most recent dashboard session ONCE on initial mount if runs exist,
  // or advance if selectedRunId points to an older turn in the active session.
  useEffect(() => {
    if (!sessions.length) return;
    const first = sessions[0];
    if (!first?.run_id) return;

    if (!selectedRunId) {
      // Auto-select the latest session ONLY once on initial mount. After the
      // user starts a fresh chat (handleNewChat), hasAutoSelectedRef stays
      // true so this branch never re-selects sessions[0] and undoes the reset.
      if (hasAutoSelectedRef.current) return;
      hasAutoSelectedRef.current = true;
      setSelectedRunId(first.run_id);
      setCurrentSessionId(first.session_id);
      return;
    }

    // If selectedRunId belongs to the active session and a newer run exists for this session, advance to it
    if (currentSessionId) {
      const latestForSession = sessions.find((s) => s.session_id === currentSessionId);
      if (latestForSession && latestForSession.run_id !== selectedRunId) {
        setSelectedRunId(latestForSession.run_id);
      }
    }
  }, [sessions, selectedRunId, currentSessionId]);

  const handleSelectSession = useCallback((id: string) => {
    hasAutoSelectedRef.current = true;
    // Pending entry (current chat not yet on server) — stay on it
    if (id.startsWith('pending-')) return;
    // Stash current session's messages before switching
    if (currentSessionId && localMessagesRef.current.length > 0) {
      messagesBySessionRef.current[currentSessionId] = localMessagesRef.current;
    }
    const target = sessions.find((s) => s.run_id === id || s.session_id === id);
    if (target) {
      setSelectedRunId(target.run_id);
      setCurrentSessionId(target.session_id);
      // Invalidate the session query so we always fetch fresh transcript if needed
      queryClient.invalidateQueries({ queryKey: dashboardKeys.session(target.run_id) });
      // Restore stashed messages for the target session (server transcript
      // rehydration will overwrite once runState arrives).
      const stashed = messagesBySessionRef.current[target.session_id] ?? [];
      localMessagesRef.current = stashed;
      setLocalMessages(stashed);
    } else {
      setSelectedRunId(id);
      queryClient.invalidateQueries({ queryKey: dashboardKeys.session(id) });
      localMessagesRef.current = [];
      setLocalMessages([]);
    }
  }, [sessions, currentSessionId, queryClient, localMessagesRef, setLocalMessages]);

  const handleDeleteSession = useCallback(async (runId: string) => {
    try {
      await deleteSessionMutation.mutateAsync(runId);
      toast.success('Session deleted from your history.');
      const targetSession = sessions.find((s) => s.run_id === runId || s.session_id === runId);
      if (selectedRunId === runId || (targetSession && currentSessionId === targetSession.session_id)) {
        setSelectedRunId(null);
        const newSessionId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sess-${Date.now()}`;
        setCurrentSessionId(newSessionId);
        setLocalMessages([]);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete session');
    }
  }, [deleteSessionMutation, selectedRunId, currentSessionId, sessions, setLocalMessages]);

  const handleNewChat = useCallback(() => {
    hasAutoSelectedRef.current = true;
    onCancelGeneration?.();
    // Stash current session's messages so switching back restores them
    if (currentSessionId && localMessagesRef.current.length > 0) {
      messagesBySessionRef.current[currentSessionId] = localMessagesRef.current;
    }
    const newSessionId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sess-${Date.now()}`;
    setCurrentSessionId(newSessionId);
    setSelectedRunId(null);
    localMessagesRef.current = [];
    setLocalMessages([]);
  }, [currentSessionId, localMessagesRef, setLocalMessages, onCancelGeneration]);

  return {
    sessions,
    isSessionsLoading,
    refetchSessions,
    selectedRunId,
    setSelectedRunId,
    currentSessionId,
    setCurrentSessionId,
    runState,
    isRunStateLoading,
    messagesBySessionRef,
    historyItems,
    hasAutoSelectedRef,
    handleSelectSession,
    handleDeleteSession,
    handleNewChat,
  };
}

