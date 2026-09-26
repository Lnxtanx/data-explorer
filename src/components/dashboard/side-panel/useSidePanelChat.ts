// =============================================================================
// useSidePanelChat.ts — Side Panel Execution, SSE Streaming & Transcript Sync
// Orchestrates user interaction, live thinking steps, SSE event dispatching,
// tool call progress, mode/thinking toggles, and transcript rehydration.
// =============================================================================

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDashboardGenerate } from '../hooks/useDashboard';
import { type SidePanelMessage } from './ResonaAIMessageItem';
import { type AgentMode } from '../../ai/models/ModeSelector';
import type { AgentToolStep } from '../../ai/hooks/useAIAgent';
import { sanitizeToolInput, sanitizeToolSummary } from '../../ai/tools/toolSanitize';
import { transcriptToMessages } from './transcriptMapper';
import { dashboardKeys, type DashboardRunState } from '../api/dashboard';
import { uploadFilesForAI } from '../../ai/api/index';
import { toast } from 'sonner';

interface UseSidePanelChatOptions {
  connectionId?: string | null;
  databaseName?: string;
  selectedRunId: string | null;
  setSelectedRunId: (runId: string | null) => void;
  currentSessionId: string | null;
  setCurrentSessionId: (sessionId: string | null) => void;
  runState?: DashboardRunState | null;
  messagesBySessionRef: React.MutableRefObject<Record<string, SidePanelMessage[]>>;
  refetchSessions: () => Promise<any>;
  isDashboardGenerating?: boolean;
  pendingInquiry?: { id: string; message: string } | null;
  onClearPendingInquiry?: () => void;
  localMessages: SidePanelMessage[];
  setLocalMessages: React.Dispatch<React.SetStateAction<SidePanelMessage[]>>;
  localMessagesRef: React.MutableRefObject<SidePanelMessage[]>;
}

export function useSidePanelChat({
  connectionId,
  selectedRunId,
  setSelectedRunId,
  currentSessionId,
  setCurrentSessionId,
  runState,
  messagesBySessionRef,
  refetchSessions,
  isDashboardGenerating = false,
  pendingInquiry = null,
  onClearPendingInquiry,
  localMessages,
  setLocalMessages,
  localMessagesRef,
}: UseSidePanelChatOptions) {
  const queryClient = useQueryClient();

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

  const {
    generate: generateDashboard,
    cancel: cancelDashboard,
    isGenerating: isSidePanelGenerating,
  } = useDashboardGenerate(connectionId ?? null);

  const isResumingRef = useRef(false);

  // Attached files state & actions
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setAttachedFiles((prev) => [...prev, ...newFiles]);
      e.target.value = '';
    }
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleFilesAdd = useCallback((newFiles: File[]) => {
    setAttachedFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const clearAttachedFiles = useCallback(() => {
    setAttachedFiles([]);
  }, []);

  // Rehydrate local messages from a selected durable run's transcript
  useEffect(() => {
    if (isSidePanelGenerating || isDashboardGenerating) return; // don't clobber active turn
    if (!selectedRunId) return;
    if (!runState) return;

    const mapped = transcriptToMessages(runState, isResumingRef.current);
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
        const merged = mapped.map((m, idx) => {
          if (m.role === 'assistant') {
            // Only merge with an existing assistant turn if it corresponds to the exact same turn index
            // or the final turn of both mapped and prev. Never use a greedy prev.find() that clones
            // one turn across multiple turns.
            const existing = prev[idx]?.role === 'assistant'
              ? prev[idx]
              : (idx === mapped.length - 1 && prev[prev.length - 1]?.role === 'assistant' ? prev[prev.length - 1] : null);
            if (existing) {
              return {
                ...m,
                content: m.content?.trim() ? m.content : (existing.content || m.content),
                thinking: existing.thinking || m.thinking,
                toolSteps: existing.isStreaming && existing.toolSteps && existing.toolSteps.length > 0
                  ? existing.toolSteps
                  : (m.toolSteps && m.toolSteps.length > 0 ? m.toolSteps : existing.toolSteps),
                latencyMs: (existing as any).latencyMs || (m as any).latencyMs,
              };
            }
          }
          return m;
        });

        // Deduplicate any consecutive duplicate messages
        const deduped: SidePanelMessage[] = [];
        for (const msg of merged) {
          const last = deduped[deduped.length - 1];
          if (last && last.role === msg.role && (last.content.trim() === msg.content.trim() || !msg.content.trim())) {
            if (msg.toolSteps && msg.toolSteps.length > 0 && (!last.toolSteps || last.toolSteps.length === 0)) {
              last.toolSteps = msg.toolSteps;
            }
            if (msg.thinking && !last.thinking) {
              last.thinking = msg.thinking;
            }
            continue;
          }
          deduped.push(msg);
        }
        localMessagesRef.current = deduped;
        return deduped;
      });
      const targetSessionId = runState.session_id || currentSessionId;
      if (targetSessionId) {
        messagesBySessionRef.current[targetSessionId] = mapped;
      }
      if (isResumingRef.current) {
        isResumingRef.current = false;
      }
    }
  }, [runState, isSidePanelGenerating, isDashboardGenerating, selectedRunId, currentSessionId, messagesBySessionRef]);

  // Continue / Mutate / Ask Handler
  const handleContinueDashboard = useCallback(async (messageText?: string, filesOverride?: File[]) => {
    if (!connectionId) return;
    const msg = (messageText ?? '').trim();
    const filesToUpload = filesOverride ?? [...attachedFiles];
    if (!msg && filesToUpload.length === 0) return;

    // Reset attached files in input
    setAttachedFiles([]);

    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `assistant-${Date.now()}`;
    const clientTime = new Date().toISOString();
    const clientTimezone = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';

    const userMessage: SidePanelMessage = {
      id: userMsgId,
      role: 'user',
      content: msg,
      timestamp: clientTime,
      files: filesToUpload.length > 0 ? filesToUpload.map((f) => f.name) : undefined,
    };
    const pendingAssistant: SidePanelMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      isStreaming: true,
      timestamp: clientTime,
    };
    const cleanPrev = localMessagesRef.current.filter((m) => m.content.trim() || (m.toolSteps && m.toolSteps.length > 0));
    const nextMessages = [...cleanPrev, userMessage, pendingAssistant];
    localMessagesRef.current = nextMessages;
    setLocalMessages(nextMessages);

    // In a new chat, selectedRunId is null.
    // resumeOf must ONLY be set if selectedRunId is non-null (i.e. explicitly continuing an existing thread).
    const resumeOf = selectedRunId || undefined;
    isResumingRef.current = Boolean(resumeOf);
    let accumulatedText = '';
    let accumulatedThinking = '';
    let liveThinkingText = '';
    const toolSteps: AgentToolStep[] = [];
    const warnings: string[] = [];
    const isDeep = agentMode === 'deep';
    const effectiveThinking = isDeep || thinking;

    const findCurrentThinkingStepIndex = (): number => {
      for (let i = toolSteps.length - 1; i >= 0; i--) {
        const step = toolSteps[i];
        if (step.type === 'thinking' || step.name === 'thinking') {
          return i;
        }
        // If the latest step is a real tool call, stop searching backwards
        break;
      }
      return -1;
    };

    const finalizeThinkingStep = () => {
      for (let i = 0; i < toolSteps.length; i++) {
        if ((toolSteps[i].type === 'thinking' || toolSteps[i].name === 'thinking') && toolSteps[i].status === 'calling') {
          toolSteps[i] = {
            ...toolSteps[i],
            status: 'done',
            latencyMs: toolSteps[i].latencyMs || Math.max(1, Date.now() - (toolSteps[i].startedAt ?? Date.now())),
          };
        }
      }
      liveThinkingText = '';
    };

    const effectiveSessionId = currentSessionId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : undefined);
    const sessionIdToSend = effectiveSessionId;
    if (!currentSessionId && sessionIdToSend) {
      setCurrentSessionId(sessionIdToSend);
    }

    // Upload attached files if present
    let fileIds: string[] = [];
    if (filesToUpload.length > 0) {
      setIsUploading(true);
      try {
        const uploadRes = await uploadFilesForAI(filesToUpload, { sessionId: sessionIdToSend });
        if (uploadRes.ok && uploadRes.files) {
          fileIds = uploadRes.files.map((f) => f.file_id);
        }
      } catch (err) {
        console.error('[ResonaAISidePanel] Failed to upload files:', err);
        toast.error('File upload failed. Proceeding without file context.');
      } finally {
        setIsUploading(false);
      }
    }

    try {
      const promptToSend = msg || (filesToUpload.length > 0 ? `I've attached ${filesToUpload.length === 1 ? filesToUpload[0].name : `${filesToUpload.length} files`}. Please analyze the attached file content and incorporate it into the dashboard.` : '');
      const result = await generateDashboard(
        {
          message: promptToSend,
          resumeOf,
          sessionId: sessionIdToSend,
          agentMode,
          thinking: effectiveThinking,
          fileIds: fileIds.length > 0 ? fileIds : undefined,
          clientTime,
          clientTimezone,
        },
        (event) => {
          if (event.eventType === 'run_started') {
            if (event.session_id) setCurrentSessionId(event.session_id);
          } else if (event.eventType === 'tool_call' || event.phase === 'tool_call') {
            finalizeThinkingStep();
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
            finalizeThinkingStep();
            accumulatedText += event.delta || event.text || '';
          } else if (event.phase === 'thinking_clear' || event.eventType === 'thinking_clear') {
            finalizeThinkingStep();
          } else if (event.eventType === 'thinking') {
            const fullThinking = (event.text || event.delta || '').trim();
            if (fullThinking) {
              accumulatedThinking = fullThinking;
              liveThinkingText = fullThinking;
              const thinkingIdx = findCurrentThinkingStepIndex();
              if (thinkingIdx >= 0) {
                // Update existing thinking step with full summary instead of creating a second container
                toolSteps[thinkingIdx] = {
                  ...toolSteps[thinkingIdx],
                  status: 'done',
                  result: { success: true, summary: fullThinking },
                  latencyMs: toolSteps[thinkingIdx].latencyMs || Math.max(1, Date.now() - (toolSteps[thinkingIdx].startedAt ?? Date.now())),
                };
              } else {
                toolSteps.push({
                  id: `thinking-${toolSteps.length}-${Date.now()}`,
                  name: 'thinking',
                  type: 'thinking',
                  label: 'Thinking…',
                  input: {},
                  status: 'done',
                  startedAt: Date.now(),
                  result: { success: true, summary: fullThinking },
                });
              }
            }
          } else if (event.eventType === 'thinking_chunk' || event.phase === 'thinking') {
            const chunk = event.delta || event.text || '';
            if (chunk) {
              accumulatedThinking += chunk;
              liveThinkingText += chunk;
              const thinkingIdx = findCurrentThinkingStepIndex();
              if (thinkingIdx >= 0) {
                toolSteps[thinkingIdx] = {
                  ...toolSteps[thinkingIdx],
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
          }

          // Sync real text, real thinking, toolSteps, and warnings to the active bubble
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

      // Clean up and deduplicate any thinking steps before sealing the message
      const finalizedToolSteps: AgentToolStep[] = [];
      for (const step of toolSteps) {
        const isThinking = step.type === 'thinking' || step.name === 'thinking';
        if (isThinking) {
          const summary = step.result?.summary;
          if (!summary || typeof summary !== 'string' || !summary.trim()) {
            continue; // drop empty thinking
          }
          const prev = finalizedToolSteps[finalizedToolSteps.length - 1];
          if (prev && (prev.type === 'thinking' || prev.name === 'thinking')) {
            // Merge adjacent thinking step into the previous one
            finalizedToolSteps[finalizedToolSteps.length - 1] = {
              ...prev,
              status: 'done',
              result: {
                success: true,
                summary: summary.length >= (prev.result?.summary?.length || 0) ? summary : (prev.result?.summary ?? ''),
              },
              latencyMs: prev.latencyMs || step.latencyMs,
            };
            continue;
          }
        }
        finalizedToolSteps.push(step.status === 'calling' ? { ...step, status: 'done' as const } : step);
      }

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
        const userIdx = prev.findIndex((m) => m.id === userMsgId || (m.role === 'user' && m.content === msg));
        const assistantIdx = prev.findIndex(
          (m, i) =>
            m.id === assistantMsgId ||
            (m.role === 'assistant' && (
              (userIdx >= 0 && i === userIdx + 1) ||
              (m.content && finalContent && m.content.trim() === finalContent.trim())
            ))
        );

        let next = [...prev];
        if (assistantIdx >= 0) {
          next[assistantIdx] = completedAssistant;
        } else {
          // If the last message is already an assistant message, update it instead of pushing a duplicate
          const lastIdx = next.length - 1;
          if (lastIdx >= 0 && next[lastIdx].role === 'assistant') {
            next[lastIdx] = completedAssistant;
          } else {
            next.push(completedAssistant);
          }
        }

        if (userIdx < 0) {
          const astIdx = next.findIndex((m) => m.id === completedAssistant.id);
          if (astIdx >= 0) {
            next.splice(astIdx, 0, userMessage);
          } else {
            next.unshift(userMessage);
          }
        }

        // Deduplicate any consecutive duplicate assistant messages
        const deduped: SidePanelMessage[] = [];
        for (let i = 0; i < next.length; i++) {
          const current = next[i];
          if (current.role === 'assistant' && deduped.length > 0) {
            const prevMsg = deduped[deduped.length - 1];
            if (prevMsg.role === 'assistant') {
              if (
                !prevMsg.content.trim() ||
                !current.content.trim() ||
                prevMsg.content.trim() === current.content.trim()
              ) {
                deduped[deduped.length - 1] = {
                  ...prevMsg,
                  content: prevMsg.content.trim() ? prevMsg.content : current.content,
                  thinking: prevMsg.thinking || current.thinking,
                  toolSteps: (prevMsg.toolSteps && prevMsg.toolSteps.length > 0) ? prevMsg.toolSteps : current.toolSteps,
                  warnings: (prevMsg.warnings && prevMsg.warnings.length > 0) ? prevMsg.warnings : current.warnings,
                  isStreaming: false,
                };
                continue;
              }
            }
          }
          deduped.push(current);
        }

        finalMessages = deduped;
        localMessagesRef.current = deduped;
        return deduped;
      });

      if (result?.run_id) {
        setSelectedRunId(result.run_id);
        await queryClient.invalidateQueries({ queryKey: dashboardKeys.session(result.run_id) });
      }
      if (result?.session_id) {
        setCurrentSessionId(result.session_id);
      }
      const finalSessionId = result?.session_id || currentSessionId;
      if (finalSessionId) {
        messagesBySessionRef.current[finalSessionId] = finalMessages.length > 0 ? finalMessages : localMessagesRef.current;
      }
      await refetchSessions();

      if (result?.html && result?.panelData) {
        queryClient.setQueryData(dashboardKeys.detail(connectionId), (old: any) => ({
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
        queryClient.invalidateQueries({ queryKey: dashboardKeys.detail(connectionId) });
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
      await refetchSessions().catch(() => {});
    }
  }, [
    connectionId,
    selectedRunId,
    currentSessionId,
    agentMode,
    thinking,
    generateDashboard,
    queryClient,
    refetchSessions,
    setCurrentSessionId,
    setSelectedRunId,
    messagesBySessionRef,
    attachedFiles,
  ]);

  // Handle auto-dispatch of pending inquiry (from metric card "Why did this change?" clicks)
  useEffect(() => {
    if (!pendingInquiry || isSidePanelGenerating || isDashboardGenerating) return;
    const msgToSend = pendingInquiry.message;
    onClearPendingInquiry?.();
    handleContinueDashboard(msgToSend);
  }, [pendingInquiry, isSidePanelGenerating, isDashboardGenerating, onClearPendingInquiry, handleContinueDashboard]);

  return {
    localMessages,
    setLocalMessages,
    localMessagesRef,
    agentMode,
    setAgentMode,
    thinking,
    setThinking,
    isSidePanelGenerating,
    cancelDashboard,
    handleContinueDashboard,
    attachedFiles,
    setAttachedFiles,
    handleFileSelect,
    handleRemoveFile,
    handleFilesAdd,
    clearAttachedFiles,
    isUploading,
  };
}



