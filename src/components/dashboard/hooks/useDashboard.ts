// =============================================================================
// Dashboard Hooks
// React Query hooks for AI-generated analytical dashboards.
// =============================================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dashboardKeys,
  getDashboard,
  getDashboardVersion,
  refreshDashboard,
  refreshPanel,
  deleteDashboard,
  deletePanel,
  reorderPanels,
  resizePanel,
  setPanelVisibility,
  generateDashboard,
  getDashboardSessions,
  getDashboardRunState,
  deleteDashboardSession,
  DashboardProgressEvent,
  GetDashboardResponse,
  DashboardRunSummary,
  DashboardRunState,
  GenerateDashboardOptions,
  PanelData,
} from '../api/dashboard';
import type { AgentToolStep } from '../../ai/hooks/useAIAgent';
import { sanitizeToolInput, sanitizeToolSummary } from '../../ai/tools/toolSanitize';

export interface GenerationProgress {
  phase: string;
  message: string;
  percent: number;
  text?: string;
  toolSteps?: AgentToolStep[];
  warnings?: string[];
}

const PHASE_PROGRESS: Record<string, number> = {
  introspect: 20,
  plan: 45,
  mutate: 60,
  validate: 70,
  persist: 85,
  render: 95,
  done: 100,
};

export function useDashboard(connectionId: string | null, theme?: string) {
  return useQuery<GetDashboardResponse>({
    queryKey: dashboardKeys.detail(connectionId),
    queryFn: () => getDashboard(connectionId!, theme),
    enabled: Boolean(connectionId),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

/**
 * Live-freshness poller for shared dashboards. Polls ONLY the cheap /meta
 * endpoint every 60s; when the owner regenerates the shared dashboard the
 * version bumps and the full dashboard query is invalidated so the member's
 * open view picks up the update automatically.
 */
export function useDashboardLiveVersion(
  connectionId: string | null,
  dashboardId?: string | null,
  isShared?: boolean
) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: dashboardKeys.meta(dashboardId),
    queryFn: () => getDashboardVersion(dashboardId!),
    enabled: Boolean(connectionId && dashboardId && isShared),
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: true,
    staleTime: Infinity,
  });

  const meta = query.data;
  useEffect(() => {
    if (!meta || meta.version == null) return;
    const key = dashboardKeys.detail(connectionId);
    const cached = queryClient.getQueryData<GetDashboardResponse>(key);
    const cachedDashboard = cached?.dashboard;
    if (
      cachedDashboard &&
      cachedDashboard.id === dashboardId &&
      cachedDashboard.version != null &&
      meta.version !== cachedDashboard.version
    ) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  }, [meta, connectionId, dashboardId, queryClient]);

  return query;
}

export function useGenerateDashboard(connectionId: string | null) {
  const queryClient = useQueryClient();
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [latestRunId, setLatestRunId] = useState<string | null>(null);
  const [latestSessionId, setLatestSessionId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const startGeneration = useCallback(async (opts?: GenerateDashboardOptions) => {
    if (!connectionId) return;

    setIsGenerating(true);
    setError(null);
    setProgress({ phase: 'introspect', message: 'Starting dashboard generation...', percent: 10 });

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const toolSteps: AgentToolStep[] = [];
    const warnings: string[] = [];
    let accumulatedText = '';

    try {
      const result = await generateDashboard(
        connectionId,
        (event: DashboardProgressEvent) => {
          if (event.eventType === 'tool_call' || event.phase === 'tool_call') {
            const stepId = event.id || `step-${Date.now()}-${toolSteps.length}`;
            const toolName = event.name || 'tool';
            const existingIdx = toolSteps.findIndex(s => s.id === stepId);
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
            const existingIdx = stepId ? toolSteps.findIndex(s => s.id === stepId) : -1;
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
          }

          if (event.phase === 'delta' && (event.delta || event.text)) {
            accumulatedText += event.delta || event.text || '';
            setProgress((prev) => ({
              phase: 'delta',
              message: prev?.message || 'Synthesizing analysis…',
              percent: 98,
              text: accumulatedText,
              toolSteps: [...toolSteps],
              warnings: [...warnings],
            }));
          } else if (event.phase && event.phase !== 'delta') {
            const percent = PHASE_PROGRESS[event.phase] || 50;
            setProgress({
              phase: event.phase,
              message: event.message || 'Processing...',
              percent,
              text: accumulatedText || undefined,
              toolSteps: [...toolSteps],
              warnings: [...warnings],
            });
          } else if (toolSteps.length > 0) {
            setProgress((prev) => ({
              phase: prev?.phase || 'plan',
              message: prev?.message || 'Executing tools…',
              percent: prev?.percent || 50,
              text: accumulatedText || undefined,
              toolSteps: [...toolSteps],
              warnings: [...warnings],
            }));
          }
          if (event.run_id) {
            setLatestRunId(event.run_id);
          }
          if (event.session_id) {
            setLatestSessionId(event.session_id);
          }
        },
        controller.signal,
        {
          agentMode: 'deep',
          thinking: true,
          ...opts,
        }
      );

      const completionText = accumulatedText.trim() || result.text?.trim() || (result.title ? `Dashboard ready: ${result.title}` : 'Dashboard ready!');
      setProgress({ phase: 'done', message: completionText, text: completionText, percent: 100, toolSteps: [...toolSteps], warnings: [...warnings] });
      if (result.run_id) setLatestRunId(result.run_id);
      if (result.session_id) setLatestSessionId(result.session_id);

      // Invalidate and pre-populate query data across all theme variants
      queryClient.setQueriesData<GetDashboardResponse>(
        { queryKey: dashboardKeys.detail(connectionId) },
        (prev) => ({
          dashboard: {
            id: result.dashboard_id || prev?.dashboard?.id || '',
            title: result.title || prev?.dashboard?.title || 'Analytics Dashboard',
            description: prev?.dashboard?.description || '',
            sections: prev?.dashboard?.sections || [],
            panelCount: typeof result.html === 'string' ? 5 : (prev?.dashboard?.panelCount || 0),
            refreshedAt: new Date().toISOString(),
          },
          html: result.html || prev?.html || '',
          panelData: result.panelData || prev?.panelData || {},
        })
      );

      await queryClient.invalidateQueries({ queryKey: dashboardKeys.detail(connectionId) });
      await queryClient.invalidateQueries({ queryKey: dashboardKeys.sessions(connectionId) });
      return result;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setProgress(null);
        return null;
      }
      const msg = err.message || 'Generation failed';
      setError(msg);
      throw err;
    } finally {
      setIsGenerating(false);
      setProgress(null);
      abortControllerRef.current = null;
    }
  }, [connectionId, queryClient]);

  const cancelGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
    setProgress(null);
  }, []);

  return {
    startGeneration,
    cancelGeneration,
    isGenerating,
    progress,
    error,
    latestRunId,
    latestSessionId,
  };
}

export function useRefreshDashboard(
  connectionId: string | null,
  onRefreshed?: (data: { html: string; panelData: Record<string, PanelData>; refreshedAt: string }) => void,
  onRefreshError?: (err: unknown) => void
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dashboardId: string) => refreshDashboard(dashboardId),
    onSuccess: (data) => {
      queryClient.setQueryData<GetDashboardResponse>(dashboardKeys.detail(connectionId), (prev) => {
        if (!prev || !prev.dashboard) return prev;
        return {
          ...prev,
          // Preserve existing html when available so iframe avoids full white-flash remount
          html: prev.html || data.html,
          panelData: data.panelData,
          dashboard: {
            ...prev.dashboard,
            refreshedAt: data.refreshedAt,
          },
        };
      });
      onRefreshed?.(data);
    },
    onError: (err) => {
      onRefreshError?.(err);
    },
  });
}

export function useRefreshPanel(connectionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ dashboardId, panelKey }: { dashboardId: string; panelKey: string }) =>
      refreshPanel(dashboardId, panelKey),
    onSuccess: (data) => {
      queryClient.setQueryData<GetDashboardResponse>(dashboardKeys.detail(connectionId), (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          panelData: {
            ...prev.panelData,
            [data.panelKey]: data.data,
          },
        };
      });
    },
  });
}

export function useDeleteDashboard(connectionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dashboardId: string) => deleteDashboard(dashboardId),
    onSuccess: () => {
      queryClient.setQueryData(dashboardKeys.detail(connectionId), {
        dashboard: null,
        html: '',
        panelData: {},
      });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.detail(connectionId) });
    },
  });
}

// ── Durable dashboard sessions (opencode/Claude Code style) ──────────────────

/**
 * Recent durable dashboard-generation runs for a connection — the "history"
 * list shown in the AI side panel for dashboard mode.
 */
export function useDashboardSessions(connectionId: string | null) {
  return useQuery<DashboardRunSummary[]>({
    queryKey: dashboardKeys.sessions(connectionId),
    queryFn: async () => {
      const res = await getDashboardSessions(connectionId!);
      return res.runs || [];
    },
    enabled: Boolean(connectionId),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Full state (incl. durable transcript) of a single dashboard run.
 */
export function useDashboardRunState(runId: string | null) {
  return useQuery<DashboardRunState>({
    queryKey: dashboardKeys.session(runId),
    queryFn: () => getDashboardRunState(runId!),
    enabled: Boolean(runId),
    staleTime: 5 * 1000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Soft-delete a dashboard-generation session run from the user's history.
 */
export function useDeleteDashboardSession(connectionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (runId: string) => deleteDashboardSession(runId),
    onMutate: async (runId: string) => {
      await queryClient.cancelQueries({ queryKey: dashboardKeys.sessions(connectionId) });
      const previous = queryClient.getQueryData<DashboardRunSummary[]>(dashboardKeys.sessions(connectionId));
      if (previous) {
        queryClient.setQueryData<DashboardRunSummary[]>(
          dashboardKeys.sessions(connectionId),
          previous.filter((s) => s.run_id !== runId)
        );
      }
      return { previous };
    },
    onError: (_err, _runId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(dashboardKeys.sessions(connectionId), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: dashboardKeys.sessions(connectionId) });
    },
  });
}

/**
 * Continue/regenerate a dashboard with an opencode-style follow-up message.
 *
 * `resumeOf` keeps the SAME conversation (schema evidence + prior decisions) so
 * the agent can add panels / refine the existing dashboard. Streams phases to
 * `onProgress` and persists the new run + transcript via backend-ai.
 */
export function useDashboardGenerate(connectionId: string | null) {
  const queryClient = useQueryClient();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const generate = useCallback(
    async (
      options: GenerateDashboardOptions = {},
      onProgress?: (event: DashboardProgressEvent) => void
    ) => {
      if (!connectionId) return null;
      setIsGenerating(true);
      setError(null);

      const controller = new AbortController();
      abortControllerRef.current = controller;
      try {
        const result = await generateDashboard(
          connectionId,
          onProgress,
          controller.signal,
          options
        );
        if (result?.run_id) {
          await queryClient.invalidateQueries({ queryKey: dashboardKeys.session(result.run_id) });
        }
        await queryClient.invalidateQueries({ queryKey: dashboardKeys.sessionRoot });
        await queryClient.invalidateQueries({ queryKey: dashboardKeys.sessions(connectionId) });
        await queryClient.invalidateQueries({ queryKey: dashboardKeys.detail(connectionId) });
        return result;
      } catch (err: any) {
        if (err.name === 'AbortError') return null;
        const msg = err.message || 'Generation failed';
        setError(msg);
        throw err;
      } finally {
        setIsGenerating(false);
        abortControllerRef.current = null;
        // Run settled (success OR failure) — always resync history so a failed
        // first run still surfaces its session in the list.
        await queryClient.invalidateQueries({ queryKey: dashboardKeys.sessions(connectionId) });
        await queryClient.invalidateQueries({ queryKey: dashboardKeys.sessionRoot });
      }
    },
    [connectionId, queryClient]
  );

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsGenerating(false);
  }, []);

  return { generate, cancel, isGenerating, error };
}

export function useDeletePanel(connectionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ dashboardId, panelKey, explanation }: { dashboardId: string; panelKey: string; explanation?: string }) =>
      deletePanel(dashboardId, panelKey, explanation),
    onSuccess: (data) => {
      // Optimistically update panel count and version without reloading iframe srcDoc
      queryClient.setQueriesData<GetDashboardResponse>(
        { queryKey: dashboardKeys.detail(connectionId) },
        (prev) => {
          if (!prev || !prev.dashboard) return prev;
          return {
            ...prev,
            dashboard: {
              ...prev.dashboard,
              panelCount: Math.max(0, (prev.dashboard.panelCount || 1) - 1),
              version: data.version ?? prev.dashboard.version,
            },
          };
        }
      );
    },
  });
}

export function useReorderPanels(connectionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ dashboardId, panelKey, direction }: { dashboardId: string; panelKey: string; direction: 'up' | 'down' }) =>
      reorderPanels(dashboardId, panelKey, direction),
    onSuccess: (data) => {
      // Update in-memory panels & version without reloading iframe srcDoc (DOM was moved in-place)
      queryClient.setQueriesData<GetDashboardResponse>(
        { queryKey: dashboardKeys.detail(connectionId) },
        (prev) => {
          if (!prev || !prev.dashboard) return prev;
          return {
            ...prev,
            dashboard: {
              ...prev.dashboard,
              panels: data.panels ?? prev.dashboard.panels,
              version: data.version ?? prev.dashboard.version,
            },
          };
        }
      );
    },
  });
}

export function useResizePanel(connectionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ dashboardId, panelKey, colSpan, height }: { dashboardId: string; panelKey: string; colSpan?: 1 | 2 | 3; height?: number }) =>
      resizePanel(dashboardId, panelKey, colSpan, height),
    onSuccess: (data) => {
      queryClient.setQueriesData<GetDashboardResponse>(
        { queryKey: dashboardKeys.detail(connectionId) },
        (prev) => {
          if (!prev || !prev.dashboard) return prev;
          return {
            ...prev,
            dashboard: {
              ...prev.dashboard,
              panels: data.panels ?? prev.dashboard.panels,
              version: data.version ?? prev.dashboard.version,
            },
          };
        }
      );
    },
  });
}

export function useSetPanelVisibility(connectionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ dashboardId, panelKey, isHidden }: { dashboardId: string; panelKey: string; isHidden: boolean }) =>
      setPanelVisibility(dashboardId, panelKey, isHidden),
    onSuccess: (data) => {
      queryClient.setQueriesData<GetDashboardResponse>(
        { queryKey: dashboardKeys.detail(connectionId) },
        (prev) => {
          if (!prev || !prev.dashboard) return prev;
          return {
            ...prev,
            dashboard: {
              ...prev.dashboard,
              panels: data.panels ?? prev.dashboard.panels,
              version: data.version ?? prev.dashboard.version,
            },
          };
        }
      );
    },
  });
}



