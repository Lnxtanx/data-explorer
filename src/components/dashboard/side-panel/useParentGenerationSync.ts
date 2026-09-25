// =============================================================================
// useParentGenerationSync.ts — Mirror Parent-Driven Dashboard Generations
// Synchronizes generation started outside the side panel (e.g. dashboard empty state)
// as live streaming bubbles so the side panel reflects the progress.
// =============================================================================

import { useEffect, useRef } from 'react';
import { type SidePanelMessage } from './ResonaAIMessageItem';
import { type GenerationProgress } from '../hooks/useDashboard';

interface UseParentGenerationSyncOptions {
  isDashboardGenerating?: boolean;
  dashboardGenerationProgress?: GenerationProgress | null;
  activeRunId?: string | null;
  databaseName?: string;
  setLocalMessages: React.Dispatch<React.SetStateAction<SidePanelMessage[]>>;
  setSelectedRunId: (runId: string | null) => void;
  refetchSessions: () => Promise<any>;
  hasAutoSelectedRef: React.MutableRefObject<boolean>;
}

export function useParentGenerationSync({
  isDashboardGenerating = false,
  dashboardGenerationProgress = null,
  activeRunId = null,
  databaseName,
  setLocalMessages,
  setSelectedRunId,
  refetchSessions,
  hasAutoSelectedRef,
}: UseParentGenerationSyncOptions) {
  const parentLiveTurnRef = useRef<{ userMsgId: string; assistantMsgId: string } | null>(null);

  // 1. Mount initial live turn when parent generation starts
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
  }, [isDashboardGenerating, dashboardGenerationProgress, databaseName, setLocalMessages, hasAutoSelectedRef]);

  // 2. Stream progress messages into the live assistant bubble
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
  }, [isDashboardGenerating, dashboardGenerationProgress, setLocalMessages]);

  // 3. Finalize the live turn when parent generation stops
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
  }, [isDashboardGenerating, activeRunId, refetchSessions, dashboardGenerationProgress, setLocalMessages, setSelectedRunId, hasAutoSelectedRef]);
}
