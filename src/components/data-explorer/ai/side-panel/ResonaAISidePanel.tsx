// =============================================================================
// Resona AI Side Panel — Dashboard AI Orchestrator
// Interactive right-side drawer dedicated exclusively to Dashboard AI.
// OpenCode / Claude Code style interactive workspace for granular mutations,
// metric inspection Q&A, and full-fidelity dashboard generation sessions.
// =============================================================================

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ResonaAIHeader } from './ResonaAIHeader';
import { ResonaAIMessageList } from './ResonaAIMessageList';
import { ResonaAIInput } from './ResonaAIInput';
import { type SidePanelMessage } from './ResonaAIMessageItem';
import {
  useDashboardSessions,
  useDashboardRunState,
  useDashboardGenerate,
  useDeleteDashboardSession,
  type GenerationProgress,
} from '@/hooks/de-useDashboard';
import { type DashboardRunState } from '@/lib/api/dashboard';
import { type AgentMode } from '@/components/data-explorer/ai/models/ModeSelector';
import type { AgentToolStep } from '@/hooks/useAIAgent';
import { sanitizeToolInput, sanitizeToolSummary } from '@/components/data-explorer/ai/tools/toolSanitize';
import { cn, stripTemporalTag } from '@/lib/utils';
import { toast } from 'sonner';

interface ResonaAISidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  onExpandFullScreen?: () => void;
  connectionId?: string;
  databaseName?: string;
  // Parent-driven generation state (from DataExplorerLayout's useGenerateDashboard)
  isDashboardGenerating?: boolean;
  dashboardGenerationProgress?: GenerationProgress | null;
  activeRunId?: string | null;
  pendingInquiry?: { id: string; message: string } | null;
  onClearPendingInquiry?: () => void;
}

const DEFAULT_WIDTH = 400;
const MIN_WIDTH = 340;
const MAX_WIDTH = 750;
const STORAGE_WIDTH_KEY = 'sw-data-explorer:resona-ai-panel-width';

/**
 * Map a durable run's transcript (user/assistant/tool messages) into side-panel
 * bubbles. Assistant content is surfaced; tool/system scaffolding, internal ids
 * and SQL are stripped so history reads like a conversation, not a wire dump.
 */
function _transcriptToMessages(runState: DashboardRunState, _isResuming: boolean): SidePanelMessage[] {
  const msgs: SidePanelMessage[] = [];
  const rawTranscript = (runState.transcript || runState.conversation || []).filter(
    (m) => m && typeof m.role === 'string' && !(m as any)._durable_marker && !(m as any)._pinboard
  );

  // Defensive deduplication: strip duplicate consecutive user turns or legacy dumps
  const transcript: typeof rawTranscript = [];
  for (const m of rawTranscript) {
    if (m.role === 'system') continue;
    if (m.role === 'user') {
      const content = stripTemporalTag((m.content || '').trim());
      if (!content) continue;
      const lastMsg = transcript[transcript.length - 1];
      if (lastMsg && lastMsg.role === 'user') {
        const prevContent = stripTemporalTag((lastMsg.content || '').trim());
        if (prevContent === content) {
          continue; // drop immediate duplicate user turn
        }
      }
    }
    transcript.push(m);
  }

  let currentAssistantMsg: SidePanelMessage | null = null;
  const toolStepMap = new Map<string, AgentToolStep>();
  const seenStepKeys = new Set<string>();

  for (const m of transcript) {
    if (m.role === 'user') {
      const content = stripTemporalTag((m.content || '').trim());
      const timestamp = (m as any).timestamp || (m as any).created_at || runState.created_at;
      if (content) {
        currentAssistantMsg = null;
        msgs.push({ id: `u-${msgs.length}-${Date.now()}`, role: 'user', content, timestamp });
      }
    } else if (m.role === 'assistant') {
      const content = (m.content || '').trim();
      const rawToolCalls = (m as any).tool_calls;
      const timestamp = (m as any).timestamp || (m as any).created_at || runState.completed_at || runState.created_at;

      const newToolSteps: AgentToolStep[] = [];
      const thinkingText = typeof (m as any).thinking === 'string' ? (m as any).thinking.trim() : '';
      if (thinkingText) {
        newToolSteps.push({
          id: `thinking-${msgs.length}-${transcript.indexOf(m)}`,
          name: 'thinking',
          type: 'thinking',
          label: 'Thinking…',
          input: {},
          status: 'done',
          result: { success: true, summary: thinkingText },
        });
      }
      if (Array.isArray(rawToolCalls) && rawToolCalls.length > 0) {
        rawToolCalls.forEach((tc: any, idx: number) => {
          let input = tc.args || tc.arguments || tc.function?.arguments || {};
          if (typeof input === 'string') {
            try {
              input = JSON.parse(input);
            } catch {
              // Leave as-is
            }
          }
          const stepId = tc.id || `tc-${msgs.length}-${idx}`;
          const stepKey = tc.id || `${tc.name || tc.function?.name || 'tool'}:${typeof input === 'object' ? JSON.stringify(input) : input}`;
          if (seenStepKeys.has(stepKey)) return;
          seenStepKeys.add(stepKey);

          const toolName = tc.name || tc.function?.name || 'tool';
          const step: AgentToolStep = {
            id: stepId,
            name: toolName,
            input: sanitizeToolInput(
              toolName,
              typeof input === 'object' && input !== null ? input : {}
            ),
            status: 'done',
          };
          newToolSteps.push(step);
          if (tc.id) {
            toolStepMap.set(tc.id, step);
          }
        });
      }

      if (!currentAssistantMsg) {
        currentAssistantMsg = {
          id: `a-${msgs.length}-${Date.now()}`,
          role: 'assistant',
          content: content,
          toolSteps: newToolSteps.length > 0 ? newToolSteps : undefined,
          thinking: (m as any).thinking || undefined,
          isStreaming: false,
          timestamp,
        };
        msgs.push(currentAssistantMsg);
      } else {
        // Coalesce additional tool calls from this turn into the active assistant container
        if (newToolSteps.length > 0) {
          currentAssistantMsg.toolSteps = [
            ...(currentAssistantMsg.toolSteps || []),
            ...newToolSteps,
          ];
        }
        const laterThinking = typeof (m as any).thinking === 'string' ? (m as any).thinking.trim() : '';
        if (laterThinking && !currentAssistantMsg.thinking) {
          currentAssistantMsg.thinking = laterThinking;
        }
        if (content) {
          currentAssistantMsg.content = currentAssistantMsg.content
            ? `${currentAssistantMsg.content}\n\n${content}`
            : content;
        }
        if (timestamp) {
          currentAssistantMsg.timestamp = timestamp;
        }
      }
    } else if (m.role === 'tool') {
      // Enrich the matching tool step with result details (never SQL / ids)
      const callId = (m as any).tool_call_id;
      const step = callId ? toolStepMap.get(callId) : null;
      if (step) {
        if ((m as any).error) {
          step.status = 'error';
          step.result = { success: false, summary: sanitizeToolSummary(String((m as any).error)) };
        } else {
          step.status = 'done';
          step.result = {
            success: true,
            summary:
              typeof m.content === 'string'
                ? sanitizeToolSummary(m.content.slice(0, 300))
                : '',
          };
        }
      }
    }
  }

  // Fallback: If msgs has no user turn at all, surface runState.message or payload prompt
  const hasUserMsg = msgs.some((m) => m.role === 'user');
  if (!hasUserMsg && (runState.message || (runState as any).request_payload?.message)) {
    const userPrompt = stripTemporalTag(runState.message || (runState as any).request_payload?.message);
    if (userPrompt) {
      msgs.unshift({
        id: `u-initial-${runState.id || 'fallback'}`,
        role: 'user',
        content: userPrompt,
        timestamp: runState.created_at,
      });
    }
  }

  // Ensure every user turn has a visible assistant outcome
  const lastMsg = msgs[msgs.length - 1];
  if (lastMsg && lastMsg.role === 'user') {
    if (runState.status === 'completed') {
      msgs.push({
        id: `a-${msgs.length}`,
        role: 'assistant',
        content: runState.completion_message || 'Dashboard generated and saved.',
        isStreaming: false,
        timestamp: runState.completed_at || runState.created_at,
      });
    } else if (runState.status === 'running') {
      msgs.push({
        id: `a-${msgs.length}`,
        role: 'assistant',
        content: '',
        isStreaming: true,
        timestamp: runState.created_at,
      });
    } else if (runState.status === 'failed') {
      msgs.push({
        id: `a-${msgs.length}`,
        role: 'assistant',
        content: `⚠️ ${runState.error || runState.completion_message || 'Dashboard generation failed.'}`,
        isStreaming: false,
        timestamp: runState.completed_at || runState.created_at,
      });
    }
  }

  // Ensure every assistant turn has non-empty, meaningful content
  for (let i = 0; i < msgs.length; i++) {
    const msg = msgs[i];
    if (msg.role === 'assistant' && !msg.content.trim()) {
      const isLast = i === msgs.length - 1;
      // 1. If it's the last message and completion_message is present, use it
      if (isLast && runState.completion_message?.trim()) {
        msg.content = sanitizeToolSummary(runState.completion_message.trim());
        continue;
      }
      // 2. If the assistant executed tools, synthesize a clear summary of what happened
      if (msg.toolSteps && msg.toolSteps.length > 0) {
        const querySteps = msg.toolSteps.filter(
          (s) => s.name === 'run_query' || s.name?.toLowerCase().includes('query')
        );
        const mutationStep = msg.toolSteps.find((s) =>
          ['edit_panel', 'add_panel', 'remove_panel', 'save_dashboard'].includes(s.name)
        );

        if (mutationStep) {
          msg.content = `Dashboard updated via ${mutationStep.name}.`;
        } else if (querySteps.length > 0) {
          const summaries = querySteps
            .map((s) => s.result?.summary)
            .filter((s): s is string => Boolean(s && s.trim()));
          if (summaries.length > 0) {
            const firstSummary = summaries[0];
            try {
              const parsed = JSON.parse(firstSummary);
              if (Array.isArray(parsed) && parsed.length > 0) {
                const keys = Object.keys(parsed[0]);
                const vals = Object.values(parsed[0]);
                msg.content = `Queried database: ${keys[0]} is **${vals[0]}**.`;
              } else if (parsed && typeof parsed === 'object' && parsed.rows && Array.isArray(parsed.rows) && parsed.rows.length > 0) {
                const row = parsed.rows[0];
                const vals = Object.entries(row)
                  .map(([k, v]) => `${k}: **${v}**`)
                  .join(', ');
                msg.content = `Query result: ${vals}`;
              } else {
                msg.content = `Query completed: ${firstSummary.slice(0, 150)}`;
              }
            } catch {
              msg.content = firstSummary.length > 150 ? `${firstSummary.slice(0, 150)}...` : firstSummary;
            }
          } else {
            msg.content = 'Queried database to inspect metrics.';
          }
        } else {
          msg.content = 'Action completed.';
        }
      } else if (isLast) {
        if (runState.status === 'completed') {
          msg.content = runState.completion_message || 'Dashboard generated and saved.';
        } else if (runState.status === 'failed') {
          msg.content = `⚠️ ${runState.error || runState.completion_message || 'Dashboard generation failed.'}`;
        }
      }
      // Never let synthesized text leak SQL / internal ids.
      msg.content = sanitizeToolSummary(msg.content);
    }
  }

  // NOTE: message.sql is intentionally never populated — SQL is hidden in the UI.

  return msgs;
}

export function ResonaAISidePanel({
  isOpen,
  onClose,
  onExpandFullScreen,
  connectionId,
  databaseName,
  isDashboardGenerating = false,
  dashboardGenerationProgress = null,
  activeRunId = null,
  pendingInquiry = null,
  onClearPendingInquiry,
}: ResonaAISidePanelProps) {
  const queryClient = useQueryClient();
  const [inputText, setInputText] = useState('');
  const [localMessages, setLocalMessages] = useState<SidePanelMessage[]>([]);
  const localMessagesRef = useRef<SidePanelMessage[]>([]);
  useEffect(() => {
    localMessagesRef.current = localMessages;
  }, [localMessages]);
  const [agentMode, setAgentModeState] = useState<AgentMode>(() => {
    if (typeof window === 'undefined') return 'deep';
    try {
      const saved = localStorage.getItem('sw-data-explorer:resona-ai-mode');
      return saved === 'flash' || saved === 'deep' ? saved : 'deep';
    } catch {
      return 'deep';
    }
  });

  const [thinking, setThinkingState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      const saved = localStorage.getItem('sw-data-explorer:resona-ai-thinking');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const setAgentMode = useCallback((mode: AgentMode) => {
    setAgentModeState(mode);
    try {
      localStorage.setItem('sw-data-explorer:resona-ai-mode', mode);
    } catch {}
  }, []);

  const setThinking = useCallback((val: boolean) => {
    setThinkingState(val);
    try {
      localStorage.setItem('sw-data-explorer:resona-ai-thinking', String(val));
    } catch {}
  }, []);

  // Panel width state with persistence
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_WIDTH;
    try {
      const saved = localStorage.getItem(STORAGE_WIDTH_KEY);
      const parsed = saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
      return isNaN(parsed) ? DEFAULT_WIDTH : Math.min(Math.max(parsed, MIN_WIDTH), MAX_WIDTH);
    } catch {
      return DEFAULT_WIDTH;
    }
  });

  const [isResizing, setIsResizing] = useState(false);
  const isResizingRef = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    isResizingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const newWidth = window.innerWidth - e.clientX;
      const clamped = Math.min(Math.max(newWidth, MIN_WIDTH), Math.min(window.innerWidth - 350, MAX_WIDTH));
      setPanelWidth(clamped);
    };

    const handleMouseUp = () => {
      if (!isResizingRef.current) return;
      isResizingRef.current = false;
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setPanelWidth((latest) => {
        try {
          localStorage.setItem(STORAGE_WIDTH_KEY, String(latest));
        } catch {}
        return latest;
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleResetWidth = useCallback(() => {
    setPanelWidth(DEFAULT_WIDTH);
    try {
      localStorage.setItem(STORAGE_WIDTH_KEY, String(DEFAULT_WIDTH));
    } catch {}
  }, []);

  // ── Dashboard durable sessions ──────────────────────────────────────────
  const {
    data: sessions = [],
    isLoading: isSessionsLoading,
    refetch: refetchSessions,
  } = useDashboardSessions(connectionId ?? null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const { data: runState, isFetching: isRunStateLoading } = useDashboardRunState(selectedRunId);
  const {
    generate: generateDashboard,
    cancel: cancelDashboard,
    isGenerating: isSidePanelGenerating,
  } = useDashboardGenerate(connectionId ?? null);

  // Per-session message cache so switching chats doesn't destroy unsaved turns
  const messagesBySessionRef = useRef<Record<string, SidePanelMessage[]>>({});

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
      isActive: s.run_id === selectedRunId || (currentSessionId && s.session_id === currentSessionId),
    }));
    // Optimistic entry: current session exists locally but not yet on server
    if (
      currentSessionId &&
      !sessions.some((s) => s.session_id === currentSessionId) &&
      (localMessages.length > 0 || isSidePanelGenerating)
    ) {
      const firstUser = localMessages.find((m) => m.role === 'user');
      items.unshift({
        id: selectedRunId || `pending-${currentSessionId}`,
        sessionId: currentSessionId,
        title: firstUser?.content?.slice(0, 80) || 'New chat',
        status: isSidePanelGenerating ? 'running' : 'pending',
        createdAt: localMessages[0]?.timestamp || new Date().toISOString(),
        turnCount: Math.max(1, Math.ceil(localMessages.length / 2)),
        isActive: true,
      });
    }
    return items;
  }, [sessions, selectedRunId, currentSessionId, localMessages, isSidePanelGenerating]);

  const deleteSessionMutation = useDeleteDashboardSession(connectionId ?? null);

  const handleDeleteSession = useCallback(async (runId: string) => {
    try {
      await deleteSessionMutation.mutateAsync(runId);
      toast.success('Session deleted from your history.');
      const targetSession = sessions.find((s) => s.run_id === runId || s.session_id === runId);
      if (selectedRunId === runId || (targetSession && currentSessionId === targetSession.session_id)) {
        setSelectedRunId(null);
        setCurrentSessionId(null);
        setLocalMessages([]);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete session');
    }
  }, [deleteSessionMutation, selectedRunId, currentSessionId, sessions]);

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
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'session', target.run_id] });
      // Restore stashed messages for the target session (server transcript
      // rehydration will overwrite once runState arrives).
      const stashed = messagesBySessionRef.current[target.session_id] ?? [];
      localMessagesRef.current = stashed;
      setLocalMessages(stashed);
    } else {
      setSelectedRunId(id);
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'session', id] });
      localMessagesRef.current = [];
      setLocalMessages([]);
    }
  }, [sessions, currentSessionId, queryClient]);

  const isResumingRef = useRef(false);
  const hasAutoSelectedRef = useRef(false);

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

  // Rehydrate local messages from a selected durable run's transcript
  useEffect(() => {
    if (isSidePanelGenerating || isDashboardGenerating) return; // don't clobber active turn
    if (!selectedRunId) {
      // New chat or pending run — preserve active messages, never clear them in a background effect
      return;
    }
    if (!runState) {
      return;
    }
    const mapped = _transcriptToMessages(runState, isResumingRef.current);
    if (mapped.length > 0) {
      setLocalMessages((prev) => {
        // If prev and mapped have identical length and contents, return prev to prevent re-renders
        if (prev.length === mapped.length) {
          const isIdentical = prev.every((p, i) => {
            const m = mapped[i];
            return (
              m &&
              p.role === m.role &&
              p.content === m.content &&
              p.isStreaming === m.isStreaming &&
              p.thinking === m.thinking
            );
          });
          if (isIdentical) return prev;
        }

        if (!prev.length) return mapped;
        // Merge mapped with prev: preserve existing assistant content, toolSteps (with latency) & thinking
        return mapped.map((m, idx) => {
          if (m.role === 'assistant') {
            const existing = prev[idx] || prev.find((p) => p.role === 'assistant' && p.content?.trim());
            if (existing) {
              return {
                ...m,
                content: existing.content?.trim() && (!m.content?.trim() || m.content.length < existing.content.length)
                  ? existing.content
                  : m.content,
                thinking: existing.thinking || m.thinking,
                toolSteps: existing.toolSteps && existing.toolSteps.length > 0 ? existing.toolSteps : m.toolSteps,
                latencyMs: (existing as any).latencyMs || (m as any).latencyMs,
              };
            }
          }
          return m;
        });
      });
      const targetSessionId = runState.session_id || currentSessionId;
      if (targetSessionId) {
        messagesBySessionRef.current[targetSessionId] = mapped;
      }
      if (isResumingRef.current) {
        isResumingRef.current = false;
      }
    }
  }, [runState, isSidePanelGenerating, isDashboardGenerating, selectedRunId, currentSessionId]);

  // ── Parent-driven generation live turn ─────────────────────────────────────
  // A generation started from the dashboard empty state / sidebar Regenerate
  // runs in DataExplorerLayout's hook. Mirror it as a live bubble here so the
  // side panel is never blank while (or after) a run is in progress.
  const parentLiveTurnRef = useRef<{ userMsgId: string; assistantMsgId: string } | null>(null);

  useEffect(() => {
    if (!isDashboardGenerating) return;
    if (parentLiveTurnRef.current) return;

    const userMsgId = `live-user-${Date.now()}`;
    const assistantMsgId = `live-assistant-${Date.now()}`;
    parentLiveTurnRef.current = { userMsgId, assistantMsgId };

    setLocalMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        role: 'user',
        content: databaseName
          ? `Generate analytics dashboard for ${databaseName}`
          : 'Generate analytics dashboard',
      },
      {
        id: assistantMsgId,
        role: 'assistant',
        content: dashboardGenerationProgress?.text || dashboardGenerationProgress?.message || '',
        isStreaming: true,
      },
    ]);

    hasAutoSelectedRef.current = true; // fresh run arriving; don't auto-jump to old session
  }, [isDashboardGenerating, dashboardGenerationProgress, databaseName]);

  // Stream progress messages into the live assistant bubble.
  useEffect(() => {
    const turn = parentLiveTurnRef.current;
    if (!turn || !isDashboardGenerating) return;
    const text = dashboardGenerationProgress?.text;
    const msg = dashboardGenerationProgress?.message;
    const toolSteps = dashboardGenerationProgress?.toolSteps;
    const warnings = dashboardGenerationProgress?.warnings;
    if (!text && !msg && !toolSteps) return;

    setLocalMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && last.id === turn.assistantMsgId) {
        updated[updated.length - 1] = {
          ...last,
          content: text || msg || last.content,
          toolSteps: toolSteps ? [...toolSteps] : last.toolSteps,
          warnings: warnings ? [...warnings] : last.warnings,
          isStreaming: true,
        };
      }
      return updated;
    });
  }, [isDashboardGenerating, dashboardGenerationProgress]);

  // Finalize the live turn when parent generation stops, then auto-select the
  // freshly created run so the full transcript loads.
  useEffect(() => {
    const turn = parentLiveTurnRef.current;
    if (!turn || isDashboardGenerating) return;

    const finalContent =
      dashboardGenerationProgress?.text?.trim() ||
      dashboardGenerationProgress?.message?.trim() ||
      (activeRunId ? '✔ Dashboard ready.' : '⚠️ Dashboard generation stopped.');

    parentLiveTurnRef.current = null;

    setLocalMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && last.id === turn.assistantMsgId) {
        updated[updated.length - 1] = {
          ...last,
          content: finalContent,
          isStreaming: false,
        };
      }
      return updated;
    });

    if (activeRunId) {
      hasAutoSelectedRef.current = true;
      setSelectedRunId(activeRunId);
      refetchSessions();
    }
  }, [isDashboardGenerating, activeRunId, refetchSessions, dashboardGenerationProgress]);

  // ── Continue / Mutate / Ask Handler ───────────────────────────────────────
  const handleContinueDashboard = async (message: string) => {
    if (!connectionId) return;
    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `assistant-${Date.now()}`;
    const clientTime = new Date().toISOString();
    const clientTimezone = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';

    const userMessage: SidePanelMessage = { id: userMsgId, role: 'user', content: message, timestamp: clientTime };
    const pendingAssistant: SidePanelMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      isStreaming: true,
      timestamp: clientTime,
    };
    const nextMessages = [...localMessagesRef.current, userMessage, pendingAssistant];
    localMessagesRef.current = nextMessages;
    setLocalMessages(nextMessages);
    setInputText('');

    const effectiveRunId = selectedRunId || sessions[0]?.run_id || undefined;
    const resumeOf = effectiveRunId;
    isResumingRef.current = true;
    let accumulatedText = '';
    let accumulatedThinking = '';
    let liveThinkingText = '';
    const toolSteps: AgentToolStep[] = [];
    const warnings: string[] = [];
    const isDeep = agentMode === 'deep';
    const effectiveThinking = isDeep || thinking;

    const finalizeThinkingStep = () => {
      for (let i = 0; i < toolSteps.length; i++) {
        if ((toolSteps[i].type === 'thinking' || toolSteps[i].name === 'thinking') && toolSteps[i].status === 'calling') {
          toolSteps[i] = {
            ...toolSteps[i],
            status: 'done',
            latencyMs: Date.now() - (toolSteps[i].startedAt ?? Date.now()),
          };
        }
      }
      liveThinkingText = '';
    };

    const effectiveSessionId = currentSessionId || sessions[0]?.session_id;
    const sessionIdToSend = effectiveSessionId || (resumeOf ? undefined : (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : undefined));
    if (!currentSessionId && sessionIdToSend) {
      setCurrentSessionId(sessionIdToSend);
    }
    if (!selectedRunId && effectiveRunId) {
      setSelectedRunId(effectiveRunId);
    }

    try {
      const result = await generateDashboard(
        {
          message,
          resumeOf,
          sessionId: sessionIdToSend,
          agentMode,
          thinking: effectiveThinking,
          clientTime,
          clientTimezone,
        },
        (event) => {
          if (event.eventType === 'run_started') {
            // Capture session id early so session history can associate it
            if (event.session_id) setCurrentSessionId(event.session_id);
            // DO NOT eagerly set selectedRunId here! That triggers a premature fetch
            // of /api/ai/runs/:id before generation finishes, caching an incomplete empty transcript.
          } else if (event.eventType === 'tool_call' || event.phase === 'tool_call') {
            finalizeThinkingStep(); // a tool call ends the live thinking phase
            const stepId = event.id || `step-${Date.now()}-${toolSteps.length}`;
            const toolName = event.name || 'tool';
            const existingIdx = toolSteps.findIndex((s) => s.id === stepId);
            const newStep: AgentToolStep = {
              id: stepId,
              name: toolName,
              input: sanitizeToolInput(toolName, event.input || {}),
              status: 'calling',
              startedAt: Date.now(),
            };
            if (existingIdx >= 0) {
              toolSteps[existingIdx] = newStep;
            } else {
              toolSteps.push(newStep);
            }
          } else if (event.eventType === 'tool_result' || event.phase === 'tool_result') {
            const stepId = event.id;
            const existingIdx = stepId ? toolSteps.findIndex((s) => s.id === stepId) : -1;
            const targetIdx = existingIdx >= 0 ? existingIdx : toolSteps.length - 1;
            if (targetIdx >= 0 && toolSteps[targetIdx]) {
              toolSteps[targetIdx] = {
                ...toolSteps[targetIdx],
                status: event.success ? 'done' : 'error',
                result: { success: !!event.success, summary: sanitizeToolSummary(event.summary || '') },
                latencyMs: event.latency_ms,
              };
            }
          } else if (event.eventType === 'warning' || event.eventType === 'budget_warning') {
            if (event.message && !warnings.includes(event.message)) {
              warnings.push(event.message);
            }
          } else if (event.eventType === 'budget_exhausted') {
            const msg = event.message || 'Run budget reached its ceiling.';
            if (!warnings.includes(msg)) warnings.push(msg);
          } else if (event.phase === 'delta' && (event.delta || event.text)) {
            finalizeThinkingStep(); // answer text ends the live thinking phase
            accumulatedText += event.delta || event.text || '';
          } else if (event.phase === 'thinking_clear' || event.eventType === 'thinking_clear') {
            // Live thinking phase finished — seal the thinking step
            finalizeThinkingStep();
          } else if (event.eventType === 'thinking') {
            // Full sealed thinking event — REPLACE accumulated (chunks already added;
            // appending would double the text).
            const fullThinking = event.text || event.delta || '';
            if (fullThinking) {
              accumulatedThinking = fullThinking;
              liveThinkingText = fullThinking;
              let activeThinkingIdx = -1;
              for (let i = toolSteps.length - 1; i >= 0; i--) {
                if ((toolSteps[i].type === 'thinking' || toolSteps[i].name === 'thinking') && toolSteps[i].status === 'calling') {
                  activeThinkingIdx = i;
                  break;
                }
              }

              if (activeThinkingIdx >= 0) {
                toolSteps[activeThinkingIdx] = {
                  ...toolSteps[activeThinkingIdx],
                  result: { success: true, summary: liveThinkingText },
                };
              } else {
                toolSteps.push({
                  id: `thinking-${toolSteps.length}-${Date.now()}`,
                  name: 'thinking',
                  type: 'thinking',
                  label: 'Thinking…',
                  input: {},
                  status: 'calling',
                  startedAt: Date.now(),
                  result: { success: true, summary: liveThinkingText },
                });
              }
            }
          } else if (event.eventType === 'thinking_chunk' || event.phase === 'thinking') {
            // Live thinking chunk — append to active calling step or start a new thinking step
            const chunk = event.delta || event.text || '';
            if (chunk) {
              accumulatedThinking += chunk;
              let activeThinkingIdx = -1;
              for (let i = toolSteps.length - 1; i >= 0; i--) {
                if ((toolSteps[i].type === 'thinking' || toolSteps[i].name === 'thinking') && toolSteps[i].status === 'calling') {
                  activeThinkingIdx = i;
                  break;
                }
              }

              if (activeThinkingIdx >= 0) {
                liveThinkingText += chunk;
                toolSteps[activeThinkingIdx] = {
                  ...toolSteps[activeThinkingIdx],
                  result: { success: true, summary: liveThinkingText },
                };
              } else {
                liveThinkingText = chunk;
                toolSteps.push({
                  id: `thinking-${toolSteps.length}-${Date.now()}`,
                  name: 'thinking',
                  type: 'thinking',
                  label: 'Thinking…',
                  input: {},
                  status: 'calling',
                  startedAt: Date.now(),
                  result: { success: true, summary: liveThinkingText },
                });
              }
            }
          }

          // Always sync real text, real thinking, toolSteps, and warnings to the active bubble
          setLocalMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.id === assistantMsgId) {
              updated[updated.length - 1] = {
                ...last,
                content: accumulatedText,
                thinking: accumulatedThinking || undefined,
                toolSteps: [...toolSteps],
                warnings: [...warnings],
                isStreaming: true,
              };
            } else {
              const idx = updated.findIndex((m) => m.id === assistantMsgId);
              if (idx >= 0) {
                updated[idx] = {
                  ...updated[idx],
                  content: accumulatedText,
                  thinking: accumulatedThinking || undefined,
                  toolSteps: [...toolSteps],
                  warnings: [...warnings],
                  isStreaming: true,
                };
              }
            }
            localMessagesRef.current = updated;
            return updated;
          });
        }
      );
      isResumingRef.current = false;

      // Mark the assistant bubble finished with the real answer
      let finalContent = accumulatedText.trim() || result?.text?.trim() || '';
      if (!finalContent && toolSteps.length > 0) {
        if (result?.mutation) {
          finalContent = `Updated dashboard (${result.mutation}).`;
        } else if (result?.title) {
          finalContent = `Dashboard ready: ${result.title}`;
        }
      }
      // Preserve all intermediate thinking steps in chronological order
      const finalizedToolSteps: AgentToolStep[] = toolSteps
        .filter((step) => {
          if (step.type === 'thinking' || step.name === 'thinking') {
            const summary = step.result?.summary;
            return typeof summary === 'string' && summary.trim().length > 0;
          }
          return true;
        })
        .map((step) => (step.status === 'calling' ? { ...step, status: 'done' as const } : step));

      const completedAssistant: SidePanelMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: finalContent,
        thinking: accumulatedThinking || undefined,
        toolSteps: finalizedToolSteps,
        warnings: [...warnings],
        isStreaming: false,
        timestamp: new Date().toISOString(),
      };

      let finalMessages: SidePanelMessage[] = [];
      setLocalMessages((prev) => {
        const hasUser = prev.some((m) => m.id === userMsgId || (m.role === 'user' && m.content === message));
        const hasAssistant = prev.some((m) => m.id === assistantMsgId);

        let next = [...prev];
        if (hasAssistant) {
          next = next.map((m) => (m.id === assistantMsgId ? completedAssistant : m));
        } else {
          next.push(completedAssistant);
        }

        if (!hasUser) {
          const astIdx = next.findIndex((m) => m.id === assistantMsgId);
          if (astIdx >= 0) {
            next.splice(astIdx, 0, userMessage);
          } else {
            next.unshift(userMessage);
          }
        }
        finalMessages = next;
        localMessagesRef.current = next;
        return next;
      });

      if (result?.run_id) {
        setSelectedRunId(result.run_id);
        await queryClient.invalidateQueries({ queryKey: ['dashboard', 'session', result.run_id] });
      }
      if (result?.session_id) {
        setCurrentSessionId(result.session_id);
      }
      // Stash final messages under the (possibly new) session id
      const finalSessionId = result?.session_id || currentSessionId;
      if (finalSessionId) {
        messagesBySessionRef.current[finalSessionId] = finalMessages.length > 0 ? finalMessages : localMessagesRef.current;
      }
      await refetchSessions();

      if (result?.html && result?.panelData) {
        queryClient.setQueryData(['dashboard', connectionId], (old: any) => ({
          ...old,
          dashboard: {
            ...(old?.dashboard || {}),
            id: result.dashboard_id || old?.dashboard?.id,
            title: result.title || old?.dashboard?.title,
            sections: (result as any).sections || old?.dashboard?.sections,
            panels: (result as any).panels || old?.dashboard?.panels,
            panelCount: (result as any).panelCount || old?.dashboard?.panelCount,
            refreshedAt: (result as any).refreshedAt || new Date().toISOString(),
          },
          html: result.html,
          panelData: result.panelData,
        }));
      } else {
        queryClient.invalidateQueries({ queryKey: ['dashboard', connectionId] });
      }
    } catch (err: any) {
      isResumingRef.current = false;
      console.error('[ResonaAISidePanel] Dashboard continue failed:', err);
      const updated = [...localMessagesRef.current];
      const last = updated[updated.length - 1];
      if (last && last.id === assistantMsgId) {
        updated[updated.length - 1] = {
          ...last,
          content: `⚠️ ${err?.message || 'Dashboard generation failed.'}`,
          isStreaming: false,
        };
      }
      localMessagesRef.current = updated;
      setLocalMessages(updated);
      // Failed runs may still be persisted server-side — surface them.
      await refetchSessions().catch(() => {});
    }
  };

  const handleSendMessage = async (customText?: string) => {
    const textToSend = (customText || inputText).trim();
    if (!textToSend || isSidePanelGenerating || isDashboardGenerating) return;
    await handleContinueDashboard(textToSend);
  };

  const consumedInquiryIdRef = useRef<string | null>(null);

  // Auto-send pending dashboard inquiry (e.g. from an insight card "Why?" button)
  useEffect(() => {
    if (!pendingInquiry || !pendingInquiry.message) return;
    if (pendingInquiry.id === consumedInquiryIdRef.current) return;
    if (isSidePanelGenerating || isDashboardGenerating) return;

    consumedInquiryIdRef.current = pendingInquiry.id;
    const msgToSend = pendingInquiry.message;
    onClearPendingInquiry?.();

    handleContinueDashboard(msgToSend);
  }, [pendingInquiry, isSidePanelGenerating, isDashboardGenerating, onClearPendingInquiry]);

  const handleNewChat = () => {
    hasAutoSelectedRef.current = true;
    cancelDashboard();
    // Stash current session's messages so switching back restores them
    if (currentSessionId && localMessagesRef.current.length > 0) {
      messagesBySessionRef.current[currentSessionId] = localMessagesRef.current;
    }
    const newSessionId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sess-${Date.now()}`;
    setCurrentSessionId(newSessionId);
    setSelectedRunId(null);
    localMessagesRef.current = [];
    setLocalMessages([]);
  };

  if (!isOpen) return null;

  const isWorking = isSidePanelGenerating || isDashboardGenerating;

  return (
    <>
      {/* Invisible full-screen blocker during drag to prevent iframes from capturing mouse events */}
      {isResizing && (
        <div className="fixed inset-0 z-[9999] cursor-col-resize select-none pointer-events-auto" />
      )}

      <div
        style={{ width: `${panelWidth}px` }}
        className="relative flex flex-col h-full shrink-0 z-30 transition-shadow duration-200"
      >
        {/* Drag Resize Handle on left border with hover indicator */}
        <div
          onMouseDown={handleMouseDown}
          onDoubleClick={handleResetWidth}
          className={cn(
            "group absolute -left-2 top-0 bottom-0 w-3 cursor-col-resize select-none z-40 flex items-center justify-center",
            isResizing && "cursor-col-resize"
          )}
          title="Drag to resize, double-click to reset (400px)"
        >
          {/* Subtle vertical hover line */}
          <div
            className={cn(
              "w-[2px] h-full transition-colors duration-150 rounded-full",
              isResizing ? "bg-primary" : "bg-transparent group-hover:bg-primary/50"
            )}
          />
          {/* Centered grip pill indicator */}
          <div
            className={cn(
              "absolute w-1 h-8 rounded-full transition-all duration-150",
              isResizing
                ? "bg-primary scale-y-125 opacity-100 shadow-sm"
                : "bg-muted-foreground/30 group-hover:bg-primary group-hover:scale-y-110 opacity-0 group-hover:opacity-100"
            )}
          />
        </div>

        {/* Full-height clean side drawer */}
        <aside
          className={cn(
            "w-full h-full border-l border-border bg-card flex flex-col overflow-hidden animate-in slide-in-from-right duration-200 select-text",
            isResizing && "select-none"
          )}
        >
          {/* Header with Gemini-style ⋮ menu and modal dialog */}
          <ResonaAIHeader
            databaseName={databaseName}
            onClose={onClose}
            onExpandFullScreen={onExpandFullScreen}
            onNewChat={handleNewChat}
            sessions={historyItems}
            onSelectSession={handleSelectSession}
            onDeleteSession={handleDeleteSession}
          />

          {/* Message List / Empty State */}
          <ResonaAIMessageList
            messages={localMessages}
            isLoading={
              localMessages.length === 0 &&
              ((isSessionsLoading && !hasAutoSelectedRef.current) ||
                (Boolean(selectedRunId) && isRunStateLoading))
            }
            isStreaming={isWorking}
            databaseName={databaseName}
            onSelectPrompt={(prompt) => handleSendMessage(prompt)}
            connectionId={connectionId}
          />

          {/* Input Box */}
          <ResonaAIInput
            value={inputText}
            onChange={setInputText}
            onSubmit={() => handleSendMessage()}
            onAbort={cancelDashboard}
            isStreaming={isWorking}
            databaseName={databaseName}
            placeholder="Ask Resona Dashboard AI about metrics or charts…"
            mode={agentMode}
            thinking={thinking}
            onModeChange={setAgentMode}
            onThinkingChange={setThinking}
          />
        </aside>
      </div>
    </>
  );
}
