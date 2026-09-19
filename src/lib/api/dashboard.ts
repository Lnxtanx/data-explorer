// =============================================================================
// Dashboard API Client
// Typed client functions for AI-generated analytics dashboards.
// =============================================================================

import { API_BASE_URL, apiRequest, getCsrfToken } from './client';
import type { InsightEvidence, PanelData } from '@/dashboard-engine/contract';

export type { InsightEvidence, PanelData };

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
  section_id: string;
  title: string;
  chart_type: 'kpi' | 'line' | 'bar' | 'donut' | 'area' | 'table' | 'insight';
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
  agentMode?: 'flash' | 'deep';
  thinking?: boolean;
  clientTime?: string;
  clientTimezone?: string;
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
  const csrfToken = getCsrfToken();
  const res = await fetch(`${API_BASE_URL}/api/de/dashboards/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    credentials: 'include',
    body: JSON.stringify({
      connectionId,
      ...(opts?.message ? { message: opts.message } : {}),
      ...(opts?.resumeOf ? { resumeOf: opts.resumeOf } : {}),
      ...(opts?.sessionId ? { sessionId: opts.sessionId } : {}),
      ...(opts?.agentMode ? { agentMode: opts.agentMode } : {}),
      ...(opts?.thinking !== undefined ? { thinking: opts.thinking } : {}),
      clientTime: opts?.clientTime || new Date().toISOString(),
      clientTimezone: opts?.clientTimezone || (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC'),
    }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text();
    let errMessage = text;
    try {
      const parsed = JSON.parse(text);
      errMessage = parsed.error || parsed.message || text;
    } catch { /* ignore */ }
    throw new Error(errMessage || `Generation request failed with status ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('Response body is not readable');

  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult: DashboardProgressEvent | null = null;

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
        const parsed = JSON.parse(dataStr);
        if (eventType === 'phase') {
          onProgress?.({ eventType, phase: parsed.phase, message: parsed.message });
        } else if (eventType === 'delta') {
          onProgress?.({ eventType, phase: 'delta', delta: parsed.text || parsed.delta, text: parsed.text });
        } else if (eventType === 'thinking_chunk' || eventType === 'thinking') {
          onProgress?.({ eventType, phase: 'thinking', delta: parsed.text, text: parsed.text });
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
        console.warn('[Dashboard SSE] Failed to parse message data:', dataStr);
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
    }
  }

  // Flush any remaining trailing block in buffer
  if (buffer.trim()) {
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
