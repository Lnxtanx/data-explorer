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
  type GenerationProgress,
} from '@/hooks/de-useDashboard';
import { type DashboardRunState } from '@/lib/api/dashboard';
import { type AgentMode } from '@/components/data-explorer/ai/models/ModeSelector';
import type { AgentToolStep } from '@/hooks/useAIAgent';
import { cn } from '@/lib/utils';

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
}

const DEFAULT_WIDTH = 400;
const MIN_WIDTH = 340;
const MAX_WIDTH = 750;
const STORAGE_WIDTH_KEY = 'sw-data-explorer:resona-ai-panel-width';

/**
 * Map a durable run's transcript (user/assistant/tool messages) into side-panel
 * bubbles. Assistant content + tool SQL are surfaced; tool/system scaffolding is
 * skipped so history reads like a conversation, not an LLM wire transcript.
 */
function _transcriptToMessages(runState: DashboardRunState, _isResuming: boolean): SidePanelMessage[] {
  const msgs: SidePanelMessage[] = [];
  const transcript = (runState.transcript || runState.conversation || []).filter(
    (m) => m && typeof m.role === 'string'
  );

  let currentAssistantMsg: SidePanelMessage | null = null;
  const toolStepMap = new Map<string, AgentToolStep>();

  for (const m of transcript) {
    if (m.role === 'user') {
      const content = (m.content || '').trim();
      const timestamp = (m as any).timestamp || (m as any).created_at || runState.created_at;
      if (content) {
        currentAssistantMsg = null;
        msgs.push({ id: `u-${msgs.length}`, role: 'user', content, timestamp });
      }
    } else if (m.role === 'assistant') {
      const content = (m.content || '').trim();
      const rawToolCalls = (m as any).tool_calls;
      const timestamp = (m as any).timestamp || (m as any).created_at || runState.completed_at || runState.created_at;

      const newToolSteps: AgentToolStep[] = [];
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
          const step: AgentToolStep = {
            id: stepId,
            name: tc.name || tc.function?.name || 'tool',
            input: typeof input === 'object' && input !== null ? input : {},
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
          id: `a-${msgs.length}`,
          role: 'assistant',
          content: content,
          toolSteps: newToolSteps.length > 0 ? newToolSteps : undefined,
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
      // Enrich the matching tool step with SQL or result details
      const callId = (m as any).tool_call_id;
      const step = callId ? toolStepMap.get(callId) : null;
      if (step) {
        const sql = (m as any).sql || (m as any).query;
        if (sql && typeof step.input === 'object' && step.input !== null && !(step.input as any).sql) {
          (step.input as any).sql = sql;
        }
        if ((m as any).error) {
          step.status = 'error';
          step.result = { success: false, summary: String((m as any).error) };
        } else {
          step.status = 'done';
          step.result = {
            success: true,
            summary: typeof m.content === 'string' ? m.content.slice(0, 150) : '',
          };
        }
      }
    }
  }

  // Fallback: If transcript had no user messages, surface runState.message
  if (msgs.length === 0 && runState.message) {
    msgs.push({ id: 'u-initial', role: 'user', content: runState.message, timestamp: runState.created_at });
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
        content: 'Analyzing database and generating dashboard analytics…',
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
  } else if (currentAssistantMsg && !currentAssistantMsg.content.trim()) {
    // If the assistant executed tools (e.g. save_dashboard) but produced no trailing text
    if (runState.status === 'completed') {
      currentAssistantMsg.content = runState.completion_message || 'Dashboard generated and saved.';
    } else if (runState.status === 'failed') {
      currentAssistantMsg.content = `⚠️ ${runState.error || runState.completion_message || 'Dashboard generation failed.'}`;
    }
  }

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
}: ResonaAISidePanelProps) {
  const queryClient = useQueryClient();
  const [inputText, setInputText] = useState('');
  const [localMessages, setLocalMessages] = useState<SidePanelMessage[]>([]);
  const [agentMode, setAgentMode] = useState<AgentMode>('deep');
  const [thinking, setThinking] = useState(true);

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
    refetch: refetchSessions,
  } = useDashboardSessions(connectionId ?? null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const { data: runState, isFetching: isRunStateLoading } = useDashboardRunState(selectedRunId);
  const {
    generate: generateDashboard,
    cancel: cancelDashboard,
    isGenerating: isSidePanelGenerating,
  } = useDashboardGenerate(connectionId ?? null);

  // History items for the header dropdown menu
  const historyItems = useMemo(() => {
    return sessions.map((s) => ({
      id: s.run_id,
      title: s.message || 'Dashboard Session',
      status: s.status,
      createdAt: s.created_at,
      isActive: s.run_id === selectedRunId,
    }));
  }, [sessions, selectedRunId]);

  const handleSelectSession = useCallback((id: string) => {
    hasAutoSelectedRef.current = true;
    setSelectedRunId(id);
    setLocalMessages([]);
  }, []);

  const isResumingRef = useRef(false);
  const hasAutoSelectedRef = useRef(false);

  // Auto-select the most recent dashboard run ONCE on initial mount if runs exist
  useEffect(() => {
    if (hasAutoSelectedRef.current) return;
    if (selectedRunId) {
      hasAutoSelectedRef.current = true;
      return;
    }
    const first = sessions[0];
    if (first?.run_id) {
      hasAutoSelectedRef.current = true;
      setSelectedRunId(first.run_id);
    }
  }, [sessions, selectedRunId]);

  // Rehydrate local messages from a selected durable run's transcript
  useEffect(() => {
    if (isSidePanelGenerating || isDashboardGenerating) return; // don't clobber active turn
    if (!selectedRunId) {
      setLocalMessages([]);
      return;
    }
    if (!runState) {
      setLocalMessages([]);
      return;
    }
    const mapped = _transcriptToMessages(runState, isResumingRef.current);
    if (mapped.length || runState.status !== 'running') {
      setLocalMessages(mapped);
      if (isResumingRef.current) {
        isResumingRef.current = false;
      }
    }
  }, [runState, isSidePanelGenerating, isDashboardGenerating, selectedRunId]);

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
        content: dashboardGenerationProgress?.message || 'Starting dashboard generation…',
        isStreaming: true,
      },
    ]);

    hasAutoSelectedRef.current = true; // fresh run arriving; don't auto-jump to old session
  }, [isDashboardGenerating, dashboardGenerationProgress, databaseName]);

  // Stream progress messages into the live assistant bubble.
  useEffect(() => {
    const turn = parentLiveTurnRef.current;
    if (!turn || !isDashboardGenerating) return;
    const msg = dashboardGenerationProgress?.message;
    const toolSteps = dashboardGenerationProgress?.toolSteps;
    const warnings = dashboardGenerationProgress?.warnings;
    if (!msg && !toolSteps) return;

    setLocalMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && last.id === turn.assistantMsgId) {
        updated[updated.length - 1] = {
          ...last,
          content: msg || last.content,
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

    parentLiveTurnRef.current = null;

    setLocalMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && last.id === turn.assistantMsgId) {
        updated[updated.length - 1] = {
          ...last,
          content: activeRunId ? '✔ Dashboard ready.' : '⚠️ Dashboard generation stopped.',
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
  }, [isDashboardGenerating, activeRunId, refetchSessions]);

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
      content: 'Planning dashboard changes…',
      isStreaming: true,
      timestamp: clientTime,
    };
    setLocalMessages((prev) => [...prev, userMessage, pendingAssistant]);
    setInputText('');

    const resumeOf = selectedRunId ?? undefined;
    isResumingRef.current = true;
    let accumulatedText = '';
    const toolSteps: AgentToolStep[] = [];
    const warnings: string[] = [];
    const isDeep = agentMode === 'deep';
    const effectiveThinking = isDeep || thinking;

    try {
      const result = await generateDashboard(
        {
          message,
          resumeOf,
          sessionId: undefined,
          agentMode,
          thinking: effectiveThinking,
          clientTime,
          clientTimezone,
        },
        (event) => {
          if (event.eventType === 'tool_call' || event.phase === 'tool_call') {
            const stepId = event.id || `step-${Date.now()}-${toolSteps.length}`;
            const existingIdx = toolSteps.findIndex((s) => s.id === stepId);
            const newStep: AgentToolStep = {
              id: stepId,
              name: event.name || 'tool',
              input: event.input || {},
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
                result: { success: !!event.success, summary: event.summary },
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
            accumulatedText += event.delta || event.text || '';
          } else if (event.phase === 'thinking') {
            setLocalMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.id === assistantMsgId && !accumulatedText) {
                updated[updated.length - 1] = {
                  ...last,
                  content: 'Thinking deeply about dashboard metrics…',
                  toolSteps: [...toolSteps],
                  warnings: [...warnings],
                  isStreaming: true,
                };
              }
              return updated;
            });
          } else if (event.phase && event.phase !== 'done') {
            const phaseMessages: Record<string, string> = {
              introspect: 'Analyzing database schema and relationships…',
              plan: 'Querying data to inspect metrics…',
              mutate: event.message || 'Applying dashboard updates…',
              validate: 'Validating SQL safety and UI layout…',
              persist: 'Saving dashboard and query definitions…',
              render: 'Executing queries and rendering live charts…',
            };
            setLocalMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.id === assistantMsgId && !accumulatedText) {
                updated[updated.length - 1] = {
                  ...last,
                  content: phaseMessages[event.phase!] || event.message || last.content,
                  toolSteps: [...toolSteps],
                  warnings: [...warnings],
                };
              }
              return updated;
            });
          }

          // Always sync toolSteps and warnings to the active bubble
          setLocalMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.id === assistantMsgId) {
              updated[updated.length - 1] = {
                ...last,
                content: accumulatedText || last.content,
                toolSteps: [...toolSteps],
                warnings: [...warnings],
                isStreaming: true,
              };
            }
            return updated;
          });

          if (event.run_id) {
            setSelectedRunId(event.run_id);
          }
        }
      );
      isResumingRef.current = false;

      // Mark the assistant bubble finished with the saved dashboard summary or answer
      setLocalMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.id === assistantMsgId) {
          let finalContent = accumulatedText.trim() || result?.text?.trim();
          if (!finalContent) {
            if (result?.mutation) {
              finalContent = `Updated dashboard (${result.mutation}).`;
            } else if (result?.title) {
              finalContent = `Dashboard ready: ${result.title}`;
            } else {
              finalContent = 'Done.';
            }
          }
          updated[updated.length - 1] = {
            ...last,
            content: finalContent,
            toolSteps: (last.toolSteps || []).map((s) => (s.status === 'calling' ? { ...s, status: 'done' as const } : s)),
            isStreaming: false,
          };
        }
        return updated;
      });
      if (result?.run_id) {
        setSelectedRunId(result.run_id);
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
      setLocalMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.id === assistantMsgId) {
          updated[updated.length - 1] = {
            ...last,
            content: `⚠️ ${err?.message || 'Dashboard generation failed.'}`,
            isStreaming: false,
          };
        }
        return updated;
      });
    }
  };

  const handleSendMessage = async (customText?: string) => {
    const textToSend = (customText || inputText).trim();
    if (!textToSend || isSidePanelGenerating || isDashboardGenerating) return;
    await handleContinueDashboard(textToSend);
  };

  const handleNewChat = () => {
    hasAutoSelectedRef.current = true;
    cancelDashboard();
    setSelectedRunId(null);
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
          />

          {/* Message List / Empty State */}
          <ResonaAIMessageList
            messages={localMessages}
            isLoading={Boolean(selectedRunId) && isRunStateLoading}
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
            placeholder="Ask about metrics, or request chart changes…"
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
