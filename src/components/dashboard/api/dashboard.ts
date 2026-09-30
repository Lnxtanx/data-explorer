// =============================================================================
// Dashboard API Client
// Typed client functions for AI-generated analytics dashboards.
// =============================================================================

import { apiRequest, apiRequestRaw } from '@/lib/api/client';
import { logger } from '@/lib/logger';
import type { AgentMode } from '@/lib/modes';
import { SseChunkAssembler } from '@/lib/api/sseChunks';
import type { InsightEvidence, PanelData } from '@/dashboard-engine/contract';

export type { InsightEvidence, PanelData };

// =============================================================================
// Query keys
//
// Phase 3: these 30-odd keys were inline array literals spread across
// components/dashboard/hooks/useDashboard.ts, side-panel/useSidePanelChat.ts and
// side-panel/useSidePanelSessions.ts. A rename meant finding every site by
// hand, and a typo produced a silently non-matching invalidation — the cache
// just never refreshed, with no error anywhere.
//
// Segment order is chosen so prefix invalidation is meaningful:
//   ['dashboard']                                  invalidates everything
//   ['dashboard', connectionId]                    one connection's dashboard
//   ['dashboard', 'sessions', connectionId]        that connection's runs
//   ['dashboard', 'session']                       every run, any connection
//   ['dashboard', 'session', runId]                one run
//   ['dashboard', 'meta', dashboardId]             freshness poll
//
// The id parameters are deliberately `string | null | undefined` rather than
// `string`. These hooks are called with a possibly-null connectionId, and the
// inline literals it replaced produced a real ['dashboard', null] key that
// invalidation matched on. Narrowing the type would have changed cache identity
// at runtime, so the looseness is preserved and made explicit.
// =============================================================================
export const dashboardKeys = {
  all: ['dashboard'] as const,
  /** The dashboard document for a connection. */
  detail: (connectionId: string | null | undefined) => ['dashboard', connectionId] as const,
  /** Lightweight freshness/version poll backing shared-dashboard updates. */
  meta: (dashboardId: string | null | undefined) => ['dashboard', 'meta', dashboardId] as const,
  /** Durable generation sessions for a connection. */
  sessions: (connectionId: string | null | undefined) => ['dashboard', 'sessions', connectionId] as const,
  /** Prefix for every run regardless of connection. */
  sessionRoot: ['dashboard', 'session'] as const,
  /** One durable generation run. */
  session: (runId: string | null | undefined) => ['dashboard', 'session', runId] as const,
};


export interface DashboardSection {
  id: string;
  title: string;
  icon?: string;
  is_pulse?: boolean;
  summary?: string;
}

export interface DashboardPanel {
  id: string;
  panel_key: string;
  key?: string;
  section_id: string;
  title: string;
  chart_type: 'kpi' | 'line' | 'bar' | 'donut' | 'area' | 'table' | 'insight' | 'cohort' | 'funnel' | 'geo';
  sql: string;
  config: Record<string, unknown>;
  sort_order: number;
}

export interface Dashboard {
  id: string;
  title: string;
  description: string;
  sections: DashboardSection[];
  panelCount: number;
  panels?: DashboardPanel[];
  version?: number;
  refreshedAt?: string;
  createdAt?: string;
  /** True when this is the auto-shared team dashboard for its connection. */
  isShared?: boolean;
  /** User whose generation first created the shared dashboard. */
  sharedBy?: string | null;
}

export interface GetDashboardResponse {
  dashboard: Dashboard | null;
  html: string;
  panelData: Record<string, PanelData>;
}

export interface RefreshResult {
  html: string;
  panelData: Record<string, PanelData>;
  refreshedAt: string;
}

export interface PanelRefreshResult {
  panelKey: string;
  data: PanelData;
  refreshedAt: string;
}

export interface DashboardProgressEvent {
  phase?: string;
  message?: string;
  dashboard_id?: string;
  title?: string;
  html?: string;
  panelData?: Record<string, PanelData>;
  error?: string;
  run_id?: string;
  session_id?: string;
  type?: string;
  text?: string;
  mutation?: string;
  version?: number;
  delta?: string;
  // Tool execution fields
  id?: string;
  name?: string;
  input?: Record<string, any>;
  success?: boolean;
  summary?: string;
  latency_ms?: number;
  // Warnings and budget fields
  dimension?: string;
  pct?: number;
  reason?: string;
  eventType?: string;
}

export interface DashboardRunSummary {
  run_id: string;
  status: string;
  session_id: string;
  message: string;
  created_at?: number | string;
  completed_at?: number | string | null;
  completion_reason?: string;
  completion_message?: string;
  context?: Record<string, any>;
  turn_count?: number;
}

export interface DashboardRunState {
  id: string;
  status: string;
  session_id: string;
  message: string;
  completion_reason?: string;
  completion_message?: string;
  error?: string;
  transcript?: Array<{ role: string; content?: string; tool_calls?: unknown }>;
  conversation?: Array<{ role: string; content?: string }>;
  created_at?: number | string;
  completed_at?: number | string | null;
}

export interface GenerateDashboardOptions {
  message?: string;
  resumeOf?: string;
  sessionId?: string;
  agentMode?: AgentMode;
  thinking?: boolean;
  clientTime?: string;
  clientTimezone?: string;
  fileIds?: string[];
}

/**
 * Fetch the dashboard for a connection (with live HTML and data).
 * `theme` ('light' | 'dark') is passed through to compose so the engine can
 * pre-paint the correct palette; live theme changes use THEME_SYNC instead.
 */
export async function getDashboard(connectionId: string, theme?: string): Promise<GetDashboardResponse> {
  return apiRequest<GetDashboardResponse>(
    `/api/de/dashboards?connectionId=${encodeURIComponent(connectionId)}` +
      (theme ? `&theme=${encodeURIComponent(theme)}` : '')
  );
}

/**
 * Fetch a specific dashboard by ID.
 */
export async function getDashboardById(id: string, theme?: string): Promise<GetDashboardResponse> {
  return apiRequest<GetDashboardResponse>(
    `/api/de/dashboards/${encodeURIComponent(id)}` + (theme ? `?theme=${encodeURIComponent(theme)}` : '')
  );
}

/**
 * Cheapest possible freshness check: version + updated_at only (no SQL
 * composition). Lets team members detect that the owner regenerated the shared
 * dashboard so their open view can auto-refresh.
 */
export async function getDashboardVersion(
  id: string
): Promise<{ id: string; version?: number; updated_at?: string | null; is_shared?: boolean; shared_by?: string | null }> {
  return apiRequest<{ id: string; version?: number; updated_at?: string | null; is_shared?: boolean; shared_by?: string | null }>(
    `/api/de/dashboards/${encodeURIComponent(id)}/meta`
  );
}

/**
 * Global refresh: re-runs all panel queries in parallel and returns updated HTML & data.
 */
export async function refreshDashboard(id: string): Promise<RefreshResult> {
  return apiRequest<RefreshResult>(`/api/de/dashboards/${encodeURIComponent(id)}/refresh`, {
    method: 'POST',
  });
}

/**
 * Single panel refresh: re-runs query for a single card.
 */
export async function refreshPanel(id: string, panelKey: string): Promise<PanelRefreshResult> {
  return apiRequest<PanelRefreshResult>(
    `/api/de/dashboards/${encodeURIComponent(id)}/panels/${encodeURIComponent(panelKey)}/refresh`,
    { method: 'POST' }
  );
}

/**
 * Delete a dashboard and its panels.
 */
export async function deleteDashboard(id: string): Promise<{ deleted: boolean }> {
  return apiRequest<{ deleted: boolean }>(`/api/de/dashboards/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

/**
 * Delete a single panel from a dashboard.
 */
export async function deletePanel(
  id: string,
  panelKey: string,
  explanation?: string
): Promise<{ dashboard_id: string; panelKey: string; deleted: boolean; version?: number; html?: string }> {
  return apiRequest<{ dashboard_id: string; panelKey: string; deleted: boolean; version?: number; html?: string }>(
    `/api/de/dashboards/${encodeURIComponent(id)}/panels/${encodeURIComponent(panelKey)}`,
    {
      method: 'DELETE',
      body: JSON.stringify({ explanation }),
    }
  );
}

/**
 * Reorder panels in a dashboard (move up/left or down/right).
 */
export async function reorderPanels(
  id: string,
  panelKey: string,
  direction: 'up' | 'down'
): Promise<{ dashboard_id: string; panelKey: string; panels: DashboardPanel[]; version: number; html?: string }> {
  return apiRequest<{ dashboard_id: string; panelKey: string; panels: DashboardPanel[]; version: number; html?: string }>(
    `/api/de/dashboards/${encodeURIComponent(id)}/panels/reorder`,
    {
      method: 'POST',
      body: JSON.stringify({ panelKey, direction }),
    }
  );
}

/**
 * Resize a panel column span (1, 2, or 3) and/or height in a dashboard.
 */
export async function resizePanel(
  id: string,
  panelKey: string,
  colSpan?: 1 | 2 | 3,
  height?: number
): Promise<{ dashboard_id: string; panelKey: string; col_span?: number; height?: number; panels: DashboardPanel[]; version: number }> {
  return apiRequest<{ dashboard_id: string; panelKey: string; col_span?: number; height?: number; panels: DashboardPanel[]; version: number }>(
    `/api/de/dashboards/${encodeURIComponent(id)}/panels/resize`,
    {
      method: 'POST',
      body: JSON.stringify({ panelKey, colSpan, height }),
    }
  );
}

/**
 * Hide or unhide a panel in a dashboard.
 */
export async function setPanelVisibility(
  id: string,
  panelKey: string,
  isHidden: boolean
): Promise<{ dashboard_id: string; panelKey: string; is_hidden: boolean; panels: DashboardPanel[]; version: number }> {
  return apiRequest<{ dashboard_id: string; panelKey: string; is_hidden: boolean; panels: DashboardPanel[]; version: number }>(
    `/api/de/dashboards/${encodeURIComponent(id)}/panels/visibility`,
    {
      method: 'POST',
      body: JSON.stringify({ panelKey, isHidden }),
    }
  );
}

/**
 * Generate a new dashboard via backend-ai SSE stream.
 * `opts.message` / `opts.resumeOf` continue a durable dashboard session
 * (opencode/Claude Code style), keeping the same conversation for follow-ups.
 */
export async function generateDashboard(
  connectionId: string,
  onProgress?: (event: DashboardProgressEvent) => void,
  signal?: AbortSignal,
  opts?: GenerateDashboardOptions
): Promise<DashboardProgressEvent> {
  // Phase 3: was a bare fetch that threw a plain `Error`, so a 429 or 5xx here
  // lost `code`, `hint` and the `isRateLimited` / `isServerError` predicates,
  // and no 401 sign-out event fired. `apiRequestRaw` keeps the SSE body
  // readable while restoring standard ApiError behaviour.
  const res = await apiRequestRaw('/api/de/dashboards/generate', {
    method: 'POST',
    body: JSON.stringify({
      connectionId,
      ...(opts?.message ? { message: opts.message } : {}),
      ...(opts?.resumeOf ? { resumeOf: opts.resumeOf } : {}),
      ...(opts?.sessionId ? { sessionId: opts.sessionId } : {}),
      ...(opts?.agentMode ? { agentMode: opts.agentMode } : {}),
      ...(opts?.thinking !== undefined ? { thinking: opts.thinking } : {}),
      ...(opts?.fileIds && opts.fileIds.length > 0 ? { fileIds: opts.fileIds } : {}),
      clientTime: opts?.clientTime || new Date().toISOString(),
      clientTimezone: opts?.clientTimezone || (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC'),
    }),
    signal,
  });

  const reader = res.body?.getReader();
  if (!reader) throw new Error('Response body is not readable');

  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult: DashboardProgressEvent | null = null;

  // Reassembles payloads the backend split at the 64 KB SSE limit. Without it,
  // the `done` frame (html + panelData + sections) is always oversized and would
  // be dispatched as a chunk wrapper — the dashboard then never renders.
  const chunks = new SseChunkAssembler();

  const processBlock = (block: string) => {
    if (!block.trim()) return;

    let eventType = 'message';
    let dataStr = '';

    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        dataStr = line.slice(6).trim();
      }
    }

    if (dataStr) {
      try {
        const assembled = chunks.push(eventType, JSON.parse(dataStr));
        // undefined = chunk fragment still waiting for its siblings.
        if (assembled === undefined) return;
        const parsed = assembled as Record<string, any>;
        if (eventType === 'phase') {
          onProgress?.({ eventType, phase: parsed.phase, message: parsed.message });
        } else if (eventType === 'delta') {
          onProgress?.({ eventType, phase: 'delta', delta: parsed.text || parsed.delta, text: parsed.text });
        } else if (eventType === 'thinking_chunk' || eventType === 'thinking') {
          onProgress?.({ eventType, phase: 'thinking', delta: parsed.text, text: parsed.text });
        } else if (eventType === 'thinking_clear') {
          onProgress?.({ eventType: 'thinking_clear', phase: 'thinking_clear' });
        } else if (eventType === 'tool_call') {
          onProgress?.({
            eventType,
            phase: 'tool_call',
            id: parsed.id,
            name: parsed.name,
            input: parsed.input ?? parsed.arguments ?? {},
            ...parsed,
          });
        } else if (eventType === 'tool_result') {
          onProgress?.({
            eventType,
            phase: 'tool_result',
            id: parsed.id,
            name: parsed.name,
            success: parsed.success,
            summary: parsed.summary,
            latency_ms: parsed.latency_ms,
            ...parsed,
          });
        } else if (eventType === 'tool_retry') {
          onProgress?.({ eventType, phase: 'tool_retry', id: parsed.id, name: parsed.name, ...parsed });
        } else if (eventType === 'status') {
          onProgress?.({ eventType, phase: parsed.phase || 'status', message: parsed.detail || parsed.message });
        } else if (eventType === 'warning' || eventType === 'budget_warning') {
          onProgress?.({ eventType, phase: 'warning', message: parsed.message, dimension: parsed.dimension, pct: parsed.pct });
        } else if (eventType === 'budget_exhausted') {
          onProgress?.({ eventType, phase: 'budget_exhausted', message: parsed.message, reason: parsed.reason });
        } else if (eventType === 'context_compacted') {
          onProgress?.({ eventType, phase: 'status', message: 'Context window compacted — continuing generation…' });
        } else if (eventType === 'run_started') {
          onProgress?.({ eventType, run_id: parsed.run_id, session_id: parsed.session_id });
        } else if (eventType === 'done') {
          finalResult = parsed;
          onProgress?.({ eventType, ...parsed });
        } else if (eventType === 'error') {
          throw new Error(parsed.message || 'Generation failed');
        }
      } catch (e: any) {
        if (eventType === 'error' || e.message?.includes('Generation failed')) {
          throw e;
        }
        logger.warn('[Dashboard SSE] Failed to parse message data:', dataStr);
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const normalized = buffer.replace(/\r\n/g, '\n');
    const blocks = normalized.split('\n\n');
    buffer = blocks.pop() || '';

    for (const block of blocks) {
      processBlock(block);
      if (finalResult) break;
    }

    if (finalResult) {
      try {
        await reader.cancel();
      } catch {
        /* ignore cancel error on closed stream */
      }
      break;
    }
  }

  // Flush any remaining trailing block in buffer if not finished yet
  if (!finalResult && buffer.trim()) {
    processBlock(buffer.trim());
  }

  if (!finalResult) {
    throw new Error('Dashboard generation stream ended without completion event');
  }

  return finalResult;
}


/**
 * Fetch recent durable dashboard-generation sessions for a connection.
 * Powers the AI side panel session list.
 */
export async function getDashboardSessions(connectionId: string): Promise<{ runs: DashboardRunSummary[] }> {
  return apiRequest<{ runs: DashboardRunSummary[] }>(
    `/api/de/dashboards/generate/sessions?connectionId=${encodeURIComponent(connectionId)}`
  );
}

/**
 * Fetch a durable dashboard run's full state (incl. durable transcript).
 */
export async function getDashboardRunState(runId: string): Promise<DashboardRunState> {
  return apiRequest<DashboardRunState>(`/api/ai/runs/${encodeURIComponent(runId)}`);
}

/**
 * Soft-delete a durable dashboard-generation session from the user's history.
 */
export async function deleteDashboardSession(runId: string): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>(
    `/api/de/dashboards/generate/sessions/${encodeURIComponent(runId)}`,
    { method: 'DELETE' }
  );
}



