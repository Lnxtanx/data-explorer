// =============================================================================
// useAIAgent — Composition root.
//
// Wires together:
//   useAgentStream   — durable SSE (create run → stream → reconnect/replay)
//   useAgentArtifacts — artifact_start / artifact / artifact_rows reducers
//   useAgentPlan      — plan / plan_update reducers
//
// All public types are re-exported from ../types for backward compat.
// =============================================================================

export type {
    AgentToolStep, AgentArtifact, AgentState, AgentRequest, UseAIAgentResult,
    AgentStatus, AgentPhase, PlanStep, ContextMeta,
    ColumnStat, AnomalyEntry, QualityIssue, JoinPath,
    CorrelationPair, FunnelStage, SeasonalityPeriod,
    StatBlockKind, ColumnStatistic, CardinalityColumn,
    RegressionCoefficient, TableDiffResult, TextAnalysis,
    ReportSection, AnalysisSuggestion,
} from '../types';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
    AgentState, AgentRequest, UseAIAgentResult,
    ThinkingEvent, ThinkingChunkEvent, ToolCallEvent, ToolResultEvent,
    DeltaEvent, DoneEvent, ErrorEvent, ChatIdEvent, StatusEvent,
    ArtifactStartEvent, ArtifactEvent, ArtifactRowsEvent,
    PlanEvent, PlanUpdateEvent, ContextMetaEvent, ContextCompactedEvent,
    QuotaExceededEvent, QuotaUpdateEvent,
    WarningEvent, BudgetWarningEvent, BudgetExhaustedEvent,
    CancelledEvent, AgentTimeoutEvent, DecisionEvent,
    TimelineItem, TimelineItemInput, AgentWarning,
} from '../types';
import { apiRequestFetch } from '@/lib/api/client';
import { startAgentStream, connectDurableRunStream } from './useAgentStream';
import { applyArtifactStart, applyArtifact, applyArtifactRows } from './useAgentArtifacts';
import { applyPlan, applyPlanUpdate } from './useAgentPlan';
import {
    sanitizeToolInput,
    sanitizeToolSummary,
} from '../tools/toolSanitize';

// ─── Initial state ─────────────────────────────────────────────────────────────

const INITIAL_STATE: AgentState = {
    status:      'idle',
    phase:       'idle',
    phaseDetail: '',
    thinkingText: '',
    planSteps:   [],
    toolSteps:   [],
    artifacts:   [],
    streamedText: '',
    chatId:      null,
    error:       null,
    tokenCount:  null,
    creditsUsed: null,
    model:       null,
    iterations:  0,
    contextMeta: null,
    runId:       null,
    isReconnecting: false,
    warnings:    [],
    timeline:    [],
};

/** Append an entry to the unified timeline. Timeline is rebuilt on reconnect
 * replay (resetForReplay clears it first), so appends are idempotent. */
function tl(prev: AgentState, item: TimelineItemInput): TimelineItem[] {
    return [...(prev.timeline ?? []), { ...item, at: item.at ?? Date.now() } as TimelineItem];
}

/** Build + return a new warnings array (cap to avoid unbounded growth, deduplicate identical warnings). */
function pushWarning(prev: AgentState, w: Omit<AgentWarning, 'id' | 'at'>): AgentWarning[] {
    const existingList = prev.warnings ?? [];
    const idx = existingList.findIndex(x => x.message === w.message && x.kind === w.kind);
    if (idx >= 0) {
        const updated = [...existingList];
        updated[idx] = { ...updated[idx], ...w, at: Date.now() };
        return updated;
    }
    const entry: AgentWarning = { ...w, id: `${w.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, at: Date.now() };
    return [...existingList, entry].slice(-6);
}

// Session-scoped record of the in-flight durable run so a refresh can resume
// the same run (backend replays buffered events → UI re-syncs, no lost turn).
const PENDING_RUN_KEY    = 'sw_durable_pending_run';
const PENDING_RUN_TTL_MS = 15 * 60_000; // don't auto-resume a run 15+ min old

import { DeltaBuffer } from '@/lib/api/deltaBuffer';

/** Minimum interval between streamed-text renders. ~16 fps is smooth for typing
 *  and cuts the per-chunk render cost by ~10x on a fast model connection. */
const DELTA_FLUSH_MS = 60;

// =============================================================================
// Hook
// =============================================================================

export function useAIAgent(): UseAIAgentResult {
    const [state, setState] = useState<AgentState>(INITIAL_STATE);
    const abortRef = useRef<AbortController | null>(null);
    const runIdRef = useRef<string | null>(null);
    const resumedRef = useRef(false);
    // Clarification pause bookkeeping: pausedRef is true while the run is in
    // AWAITING_CLARIFICATION (keeps PENDING_RUN alive so a refresh during the
    // pause can reconnect); pauseEventIndexRef is the paused done frame's
    // event_index — the buffer offset the resume stream starts replaying from.
    const pausedRef = useRef(false);
    const pauseEventIndexRef = useRef<number>(0);
    // Mirror the paused run id in state so components can resume via the
    // session-persisted record even if the live agent state was reset between
    // the pause and the user's answer (chat navigation, remount, etc.).
    const [pausedRunId, setPausedRunId] = useState<string | null>(null);
    // Stable UUID for this hook instance — used as session_id on every request
    const sessionIdRef = useRef<string>(crypto.randomUUID());

    // ── Delta coalescing ──────────────────────────────────────────────────
    // The backend streams one `delta` frame per model chunk (often 10-30/s).
    // Applying each one directly meant one React render per chunk, and the
    // streaming bubble re-parses the WHOLE accumulated answer each time
    // (MarkdownText splits and walks all of `text`) — quadratic in answer
    // length, and it saturated the main thread on long answers.
    //
    // DeltaBuffer coalesces chunks into at most one flush per DELTA_FLUSH_MS, so
    // a 150-chunk answer costs ~12 renders instead of 150. It is flushed
    // synchronously before any terminal event so trailing text is never lost.
    // Held in a ref so re-renders never rebuild it.
    const deltaBufferRef = useRef<DeltaBuffer | null>(null);
    if (deltaBufferRef.current === null) {
        deltaBufferRef.current = new DeltaBuffer(
            (text) => setState(prev => ({ ...prev, streamedText: prev.streamedText + text })),
            DELTA_FLUSH_MS,
        );
    }
    const bufferDelta = useCallback((text: string) => deltaBufferRef.current?.push(text), []);
    const flushDelta = useCallback(() => deltaBufferRef.current?.flush(), []);

    // Never leave a trailing timer behind on unmount.
    useEffect(() => () => {
        deltaBufferRef.current?.dispose();
    }, []);

    const clearPending = useCallback(() => {
        try {
            sessionStorage.removeItem(PENDING_RUN_KEY);
        } catch { /* storage unavailable */ }
    }, []);

    /** Session-persisted record of the in-flight durable run. */
    const readPending = useCallback((): {
        runId: string;
        eventIndex?: number;
        request?: AgentRequest;
        at?: number;
    } | null => {
        try {
            const raw = sessionStorage.getItem(PENDING_RUN_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return typeof parsed?.runId === 'string' ? parsed : null;
        } catch { /* corrupt or unavailable */ }
        return null;
    }, []);

    /** Stamp the durable-run record with the pause anchor so `resume()` can
     * find the run + event_index even after the live hook state was reset.
     * Refreshes `at` so the record stays fresh for the whole pause. */
    const stampPendingPause = useCallback((eventIndex: number) => {
        try {
            const existing = readPending();
            if (existing) {
                sessionStorage.setItem(PENDING_RUN_KEY, JSON.stringify({
                    ...existing,
                    eventIndex,
                    at: Date.now(),
                }));
            }
        } catch { /* storage unavailable */ }
    }, [readPending]);

    /** Reset the accumulated UI state so a buffered replay can rebuild it. */
    const resetForReplay = useCallback(() => {
        setState(prev => ({
            ...INITIAL_STATE,
            status: 'running',
            chatId: prev.chatId,
            runId: prev.runId,
            isReconnecting: true,
        }));
    }, []);

    const dispatchEvent = useCallback((event: string, data: unknown): boolean => {
        switch (event) {
            case 'chat_id': {
                const evt = data as ChatIdEvent;
                setState(prev => ({ ...prev, chatId: evt.chat_id, isReconnecting: false }));
                break;
            }
            case 'plan': {
                const evt = data as PlanEvent;
                setState(prev => ({ ...prev, planSteps: applyPlan(evt), timeline: tl(prev, { kind: 'plan' }), isReconnecting: false }));
                break;
            }
            case 'plan_update': {
                const evt = data as PlanUpdateEvent;
                setState(prev => ({ ...prev, planSteps: applyPlanUpdate(prev.planSteps, evt), timeline: tl(prev, { kind: 'plan_update', id: evt.id, status: evt.status }), isReconnecting: false }));
                break;
            }
            case 'status': {
                const evt = data as StatusEvent;
                setState(prev => ({ ...prev, phase: evt.phase, phaseDetail: evt.detail, iterations: evt.iteration, timeline: prev.phase === evt.phase ? prev.timeline : tl(prev, { kind: 'status', phase: evt.phase, detail: evt.detail, iteration: evt.iteration }), isReconnecting: false }));
                break;
            }
            case 'thinking_chunk': {
                const evt = data as ThinkingChunkEvent;
                setState(prev => ({ ...prev, liveThinking: (prev.liveThinking || '') + evt.text, isReconnecting: false }));
                break;
            }
            case 'thinking': {
                const evt = data as ThinkingEvent;
                const cleanText = evt.text.replace(/<\/?thinking>/g, '').trim();
                if (cleanText) {
                    setState(prev => ({
                        ...prev,
                        toolSteps: [...prev.toolSteps, {
                            id: `thinking-${prev.toolSteps.length}`,
                            name: 'thinking',
                            type: 'thinking',
                            label: 'Thinking...',
                            input: {},
                            result: { success: true, summary: cleanText },
                            status: 'done',
                        }],
                        timeline: tl(prev, { kind: 'thinking', text: cleanText }),
                        liveThinking: '',
                        isReconnecting: false,
                    }));
                } else {
                    setState(prev => ({ ...prev, liveThinking: '', isReconnecting: false }));
                }
                break;
            }
            case 'thinking_clear': {
                setState(prev => ({ ...prev, liveThinking: '', isReconnecting: false }));
                break;
            }
            case 'tool_call': {
                const evt = data as ToolCallEvent;
                setState(prev => ({
                    ...prev,
                    toolSteps: [...prev.toolSteps, { id: evt.id, name: evt.name, input: sanitizeToolInput(evt.name, evt.input ?? {}), status: 'calling', startedAt: evt.startedAt ?? Date.now() }],
                    timeline: tl(prev, { kind: 'tool_call', id: evt.id, name: evt.name }),
                    isReconnecting: false,
                }));
                break;
            }
            case 'tool_result': {
                const evt = data as ToolResultEvent;
                setState(prev => ({
                    ...prev,
                    toolSteps: prev.toolSteps.map(s =>
                        s.id === evt.id
                            ? {
                                ...s,
                                result: { success: evt.success, summary: sanitizeToolSummary(evt.summary || '') },
                                status: evt.success ? 'done' as const : 'error' as const,
                                latencyMs: evt.latency_ms !== undefined
                                    ? evt.latency_ms
                                    : (Date.now() - (s.startedAt ?? Date.now())),
                                downloadUrl: evt.downloadUrl,
                                filename: evt.filename,
                            }
                            : s
                    ),
                    timeline: tl(prev, { kind: 'tool_result', id: evt.id, name: evt.name, success: evt.success, summary: evt.summary, latencyMs: evt.latency_ms }),
                    isReconnecting: false,
                }));
                // No auto-download: `export` renders a FileView card with a
                // Download button. Cross-origin S3 presigned URLs ignore the
                // anchor `download` attribute and would navigate the tab away.
                break;
            }
            case 'artifact_start': {
                const evt = data as ArtifactStartEvent;
                setState(prev => ({ ...prev, artifacts: applyArtifactStart(prev.artifacts, evt), timeline: tl(prev, { kind: 'artifact', type: evt.type, title: evt.title }), isReconnecting: false }));
                break;
            }
            case 'artifact': {
                const evt = data as ArtifactEvent;
                setState(prev => ({ ...prev, artifacts: applyArtifact(prev.artifacts, evt), timeline: tl(prev, { kind: 'artifact', type: evt.type, title: evt.title }), isReconnecting: false }));
                break;
            }
            case 'artifact_rows': {
                const evt = data as ArtifactRowsEvent;
                setState(prev => ({ ...prev, artifacts: applyArtifactRows(prev.artifacts, evt), isReconnecting: false }));
                break;
            }
            case 'decision': {
                const evt = data as DecisionEvent;
                setState(prev => ({
                    ...prev,
                    timeline: tl(prev, { kind: 'decision', iteration: evt.iteration, tools: evt.tools_chosen ?? [], reasoning: evt.reasoning }),
                    isReconnecting: false,
                }));
                break;
            }
            case 'warning': {
                const evt = data as WarningEvent;
                setState(prev => ({
                    ...prev,
                    warnings: pushWarning(prev, { kind: 'warning', message: evt.message, code: evt.code }),
                    timeline: tl(prev, { kind: 'warning', message: evt.message, code: evt.code }),
                    isReconnecting: false,
                }));
                break;
            }
            case 'budget_warning': {
                const evt = data as BudgetWarningEvent;
                setState(prev => ({
                    ...prev,
                    warnings: pushWarning(prev, { kind: 'budget_warning', dimension: evt.dimension, pct: evt.pct, message: evt.message }),
                    timeline: tl(prev, { kind: 'budget_warning', dimension: evt.dimension, pct: evt.pct, message: evt.message }),
                    isReconnecting: false,
                }));
                break;
            }
            case 'budget_exhausted': {
                const evt = data as BudgetExhaustedEvent;
                setState(prev => ({
                    ...prev,
                    warnings: pushWarning(prev, { kind: 'budget_exhausted', message: evt.message }),
                    // Non-terminal: the loop gracefully wraps up and still
                    // emits a final answer, so keep status running here.
                    isReconnecting: false,
                }));
                break;
            }
            case 'cancelled': {
                flushDelta(); // never drop trailing text
                const evt = data as CancelledEvent;
                setState(prev => ({
                    ...prev,
                    status: 'aborted',
                    phase: 'idle',
                    phaseDetail: '',
                    error: null,
                    warnings: pushWarning(prev, { kind: 'cancelled', message: evt.message ?? 'Run cancelled' }),
                    toolSteps: prev.toolSteps.map(s => s.status === 'calling' ? { ...s, status: 'error' as const, result: { success: false, summary: evt.message ?? 'Stopped' } } : s),
                    planSteps: prev.planSteps.map(p => p.status === 'running' ? { ...p, status: 'error' as const } : p),
                    artifacts: prev.artifacts.filter(a => !a.loading),
                    isReconnecting: false,
                }));
                clearPending();
                return true; // stream ends after cancel
            }
            case 'agent_timeout': {
                flushDelta(); // never drop trailing text
                const evt = data as AgentTimeoutEvent;
                setState(prev => ({
                    ...prev,
                    status: 'error',
                    phase: 'idle',
                    phaseDetail: '',
                    error: evt.message || `The agent ran out of time (${Math.round(evt.duration_secs / 60)} min).`,
                    warnings: pushWarning(prev, { kind: 'timeout', message: evt.message }),
                    toolSteps: prev.toolSteps.map(s => s.status === 'calling' ? { ...s, status: 'error' as const, result: { success: false, summary: evt.message } } : s),
                    planSteps: prev.planSteps.map(p => p.status === 'running' ? { ...p, status: 'error' as const } : p),
                    artifacts: prev.artifacts.filter(a => !a.loading),
                    isReconnecting: false,
                }));
                clearPending();
                return true; // terminal
            }
            case 'delta': {
                const evt = data as DeltaEvent;
                bufferDelta(evt.text ?? '');
                // Capture before the closure so the narrowed type is preserved.
                const chatId: string | null = evt.chat_id ?? null;
                if (chatId) {
                    setState(prev => ({ ...prev, chatId, isReconnecting: false }));
                }
                break;
            }
            case 'done': {
                flushDelta(); // never drop trailing text
                const evt = data as DoneEvent;

                // ── Clarification pause ─────────────────────────────────────
                // The agent asked a question. The run is NOT done — it paused
                // (AWAITING_CLARIFICATION) and the same conversation resumes
                // when the user answers (via `resume()`). Keep PENDING_RUN so a
                // refresh during the pause still reconnects to this run.
                if (evt.completionReason === 'clarification') {
                    pausedRef.current = true;
                    pauseEventIndexRef.current = evt.event_index ?? 0;
                    stampPendingPause(evt.event_index ?? 0);
                    const pausedId = evt.run_id ?? runIdRef.current ?? state.runId ?? readPending()?.runId ?? null;
                    if (pausedId) {
                        runIdRef.current = pausedId;
                        setPausedRunId(pausedId);
                    }
                    setState(prev => ({
                        ...prev,
                        status: 'awaiting_clarification',
                        phase: 'idle',
                        phaseDetail: '',
                        tokenCount: (evt.usage?.outputTokens ?? evt.usage?.output_tokens) ?? prev.tokenCount,
                        creditsUsed: (evt.usage?.creditsUsed ?? evt.usage?.credits_used) ?? prev.creditsUsed,
                        iterations: evt.iterations ?? prev.iterations,
                        chatId: evt.chat_id ?? prev.chatId,
                        model: evt.usage?.synthesisModel ?? prev.model ?? null,
                        isReconnecting: false,
                    }));
                    return true; // stop the stream — resume() opens a new one
                }

                setState(prev => ({
                    ...prev,
                    status:      'done',
                    phase:       'done',
                    phaseDetail: '',
                    tokenCount:  (evt.usage?.outputTokens ?? evt.usage?.output_tokens) ?? prev.tokenCount,
                    creditsUsed: (evt.usage?.creditsUsed ?? evt.usage?.credits_used) ?? prev.creditsUsed,
                    iterations:  evt.iterations ?? prev.iterations,
                    chatId:      evt.chat_id ?? prev.chatId,
                    model:       evt.usage?.synthesisModel ?? prev.model ?? null,
                    isReconnecting: false,
                    toolSteps:   prev.toolSteps.map(s => s.status === 'calling' ? { ...s, status: 'done' } : s),
                    planSteps:   prev.planSteps.map(p => p.status === 'running' ? { ...p, status: 'done' } : p),
                    // Drop any artifact_start placeholders that never got a
                    // matching artifact event (tool failed / ran out of iterations).
                    artifacts:   prev.artifacts.filter(a => !a.loading),
                    // Granular usage data
                    granularUsage: evt.usage ? {
                        cacheCreationTokens: evt.usage.cacheCreationTokens,
                        cacheReadTokens: evt.usage.cacheReadTokens,
                        cacheHitRate: evt.usage.cacheReadTokens && evt.usage.outputTokens
                            ? (evt.usage.cacheReadTokens / (evt.usage.outputTokens + evt.usage.cacheReadTokens)) * 100
                            : undefined,
                        ...(evt.usage.contextComponents || {}),
                    } : prev.granularUsage,
                }));
                pausedRef.current = false;
                // Clear the paused-run mirror too. A nested clarification leaves
                // pausedRunId set; once this leg completes normally that id is
                // finished, and leaving it would make the NEXT message try to
                // resume a completed run (409) instead of starting a new one.
                setPausedRunId(null);
                pauseEventIndexRef.current = 0;
                clearPending();
                return true; // stop stream
            }
            case 'context_compacted': {
                const evt = data as ContextCompactedEvent;
                setState(prev => ({
                    ...prev,
                    tokenCount: evt.after_tokens,
                    contextMeta: {
                        ...(prev.contextMeta || { messages_in_window: 0, session_id: '', has_history: false }),
                        tokens_estimated: evt.after_tokens,
                        before_tokens: evt.before_tokens,
                        after_tokens: evt.after_tokens,
                        saved_tokens: evt.saved_tokens,
                        context_limit: evt.context_limit ?? prev.contextMeta?.context_limit,
                        compacted: true,
                    },
                }));
                break;
            }
            case 'context_meta': {
                const evt = data as ContextMetaEvent;
                setState(prev => ({ ...prev, contextMeta: evt }));
                break;
            }
            case 'error': {
                flushDelta(); // never drop trailing text
                const evt = data as ErrorEvent;
                setState(prev => ({
                    ...prev,
                    status: 'error',
                    phase: 'idle',
                    phaseDetail: '',
                    error: evt.message ?? 'Unknown AI error',
                    isReconnecting: false,
                    toolSteps: prev.toolSteps.map(s => s.status === 'calling' ? { ...s, status: 'error', result: { success: false, summary: evt.message ?? 'Tool execution interrupted by error' } } : s),
                    planSteps: prev.planSteps.map(p => p.status === 'running' ? { ...p, status: 'error' } : p),
                    artifacts: prev.artifacts.filter(a => !a.loading),
                }));
                clearPending();
                return true; // stop stream
            }
            case 'quota_exceeded': {
                flushDelta(); // never drop trailing text
                const evt = data as QuotaExceededEvent;
                const msg = evt.reason === 'monthly_limit'
                    ? 'Monthly credit limit reached. Upgrade your plan to continue.'
                    : evt.reason === 'daily_limit'
                    ? 'Daily credit limit reached. Try again tomorrow or upgrade your plan.'
                    : (evt.message ?? 'Credit limit reached.');
                setState(prev => ({
                    ...prev,
                    status: 'error',
                    phase: 'idle',
                    phaseDetail: '',
                    error: msg,
                    toolSteps: prev.toolSteps.map(s => s.status === 'calling' ? { ...s, status: 'error', result: { success: false, summary: msg } } : s),
                    planSteps: prev.planSteps.map(p => p.status === 'running' ? { ...p, status: 'error' } : p),
                    artifacts: prev.artifacts.filter(a => !a.loading),
                }));
                clearPending();
                return true; // stop stream
            }
            case 'quota_update': {
                const evt = data as QuotaUpdateEvent;
                setState(prev => ({ ...prev, creditsUsed: evt.credits_used }));
                break;
            }
        }
        return false;
    }, [bufferDelta, clearPending, flushDelta, stampPendingPause, state.runId]);

    const reset = useCallback(() => {
        abortRef.current?.abort();
        abortRef.current = null;
        runIdRef.current = null;
        pausedRef.current = false;
        pauseEventIndexRef.current = 0;
        clearPending();
        setPausedRunId(null);
        setState(INITIAL_STATE);
    }, [clearPending]);

    const abort = useCallback(() => {
        abortRef.current?.abort();
        abortRef.current = null;
        // Tell the backend to cancel the durable run (it will also stop the in-
        // process agent loop, not just drop the browser connection).
        const runId = runIdRef.current;
        if (runId) {
            apiRequestFetch(`/api/ai/runs/${encodeURIComponent(runId)}/cancel`, {
                method: 'POST',
            }).catch(() => { /* non-fatal: the abort already stopped the UI */ });
        }
        clearPending();
        setPausedRunId(null);
        setState(prev => ({
            ...prev,
            status: 'aborted',
            phase: 'idle',
            phaseDetail: '',
            isReconnecting: false,
            toolSteps: prev.toolSteps.map(s => s.status === 'calling' ? { ...s, status: 'error', result: { success: false, summary: 'Stopped by user' } } : s),
            planSteps: prev.planSteps.map(p => p.status === 'running' ? { ...p, status: 'error' } : p),
            artifacts: prev.artifacts.filter(a => !a.loading),
        }));
    }, [clearPending]);

    const send = useCallback(async (request: AgentRequest) => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        runIdRef.current = null;
        pausedRef.current = false;
        pauseEventIndexRef.current = 0;
        setPausedRunId(null);

        setState({ ...INITIAL_STATE, status: 'running', chatId: request.chatId ?? null });

        try {
            await startAgentStream(
                { ...request, sessionId: request.chatId ?? request.sessionId ?? sessionIdRef.current },
                dispatchEvent,
                controller.signal,
                {
                    onRunId: (runId) => {
                        runIdRef.current = runId;
                        setState(prev => ({ ...prev, runId }));
                        try {
                            sessionStorage.setItem(PENDING_RUN_KEY, JSON.stringify({ runId, request, at: Date.now() }));
                        } catch { /* storage unavailable */ }
                    },
                    onReconnect: resetForReplay,
                },
            );

            setState(prev => prev.status === 'running' ? {
                ...prev,
                status: 'done',
                phase: 'done',
                phaseDetail: '',
                toolSteps: prev.toolSteps.map(s => s.status === 'calling' ? { ...s, status: 'done' } : s),
                planSteps: prev.planSteps.map(p => p.status === 'running' ? { ...p, status: 'done' } : p),
                artifacts: prev.artifacts.filter(a => !a.loading),
            } : prev);

        } catch (err: unknown) {
            if (err instanceof Error && err.name === 'AbortError') {
                setState(prev => ({
                    ...prev,
                    status: 'aborted',
                    phase: 'idle',
                    phaseDetail: '',
                    toolSteps: prev.toolSteps.map(s => s.status === 'calling' ? { ...s, status: 'error', result: { success: false, summary: 'Stopped' } } : s),
                    planSteps: prev.planSteps.map(p => p.status === 'running' ? { ...p, status: 'error' } : p),
                    artifacts: prev.artifacts.filter(a => !a.loading),
                }));
            } else {
                const message = err instanceof Error ? err.message : 'AI request failed';
                setState(prev => ({
                    ...prev,
                    status: 'error',
                    phase: 'idle',
                    phaseDetail: '',
                    error: message,
                    toolSteps: prev.toolSteps.map(s => s.status === 'calling' ? { ...s, status: 'error', result: { success: false, summary: message } } : s),
                    planSteps: prev.planSteps.map(p => p.status === 'running' ? { ...p, status: 'error' } : p),
                    artifacts: prev.artifacts.filter(a => !a.loading),
                }));
            }
        } finally {
            if (abortRef.current === controller) abortRef.current = null;
            // A clarification pause must NOT clear PENDING_RUN — a refresh
            // during the pause reconnects to the same run.
            if (!pausedRef.current) clearPending();
        }
    }, [dispatchEvent, resetForReplay, clearPending]);

    // ── Clarification resume ────────────────────────────────────────────────
    // Answer a paused run: POST the answer, then stream the run's NEW frames
    // from the paused done frame's event_index (the pre-pause leg — including
    // the stale done — is skipped entirely). The backend continues the SAME
    // conversation with the answer appended.
    const resume = useCallback(async (answer: string): Promise<boolean> => {
        // Only a run that actually PAUSED can be resumed.
        //
        // `runIdRef.current` / `state.runId` are populated for EVERY run, so
        // keying the lookup off them made every follow-up message fire a doomed
        // resume against the previous, already-completed run — the backend
        // correctly answered 409 RUN_ALREADY_COMPLETED, the client swallowed
        // nothing, and only then fell through to starting a fresh run. One
        // wasted request and a spurious error per message.
        //
        // A run is resumable when any of these says it is paused:
        //   1. pausedRunId          — live pause, mirrored into state
        //   2. pausedRef            — live pause, survives a reset() (no remount)
        //   3. a session-persisted  — survives a remount between the pause and
        //      pause record           the answer (stampPendingPause writes it,
        //                               and a normal completion clearPending()s it)
        const pending = readPending();
        const runId =
            pausedRunId
            ?? (pausedRef.current ? (runIdRef.current ?? state.runId ?? pending?.runId ?? null) : null)
            ?? (pending?.eventIndex !== undefined ? pending.runId : null);

        if (!runId) return false;
        const since = pauseEventIndexRef.current || pending?.eventIndex || 0;

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        pausedRef.current = false;

        try {
            let response: Response;
            try {
                response = await apiRequestFetch(`/api/ai/runs/${encodeURIComponent(runId)}/resume`, {
                    method: 'POST',
                    signal: controller.signal,
                    body: JSON.stringify({
                        answer,
                        clientTime: new Date().toISOString(),
                        clientTimezone: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC',
                    }),
                });
            } catch (err) {
                if (controller.signal.aborted) return false;
                setState(prev => ({
                    ...prev,
                    status: 'error',
                    error: err instanceof Error ? err.message : 'Could not reach the AI service.',
                    isReconnecting: false,
                }));
                return false;
            }

            if (!response.ok) {
                let message = `Failed to resume the run (${response.status}).`;
                try {
                    const body = await response.json();
                    if (body?.detail?.message) message = body.detail.message;
                } catch { /* non-json */ }
                setState(prev => ({ ...prev, status: 'error', error: message, isReconnecting: false }));
                pauseEventIndexRef.current = 0;
                return false;
            }

            setState(prev => ({
                ...prev,
                status: 'running',
                phase: 'executing',
                phaseDetail: '',
                isReconnecting: false,
            }));

            // Stream the resumed leg from where the paused done frame ended.
            await connectDurableRunStream(runId, dispatchEvent, controller.signal, {
                onRunId: (rid) => {
                    runIdRef.current = rid;
                    setState(prev => ({ ...prev, runId: rid }));
                },
                onReconnect: resetForReplay,
            }, since);

            // Stream ended without a terminal event (e.g. reconnect ceiling).
            // Mirror `send`'s post-stream patch only if still running.
            setState(prev => prev.status === 'running' ? {
                ...prev,
                status: 'done',
                phase: 'done',
                phaseDetail: '',
                toolSteps: prev.toolSteps.map(s => s.status === 'calling' ? { ...s, status: 'done' } : s),
                planSteps: prev.planSteps.map(p => p.status === 'running' ? { ...p, status: 'done' } : p),
                artifacts: prev.artifacts.filter(a => !a.loading),
            } : prev);
            return true;
        } finally {
            if (abortRef.current === controller) abortRef.current = null;
            if (!pausedRef.current) clearPending();
            if (!pausedRef.current) setPausedRunId(null);
        }
    }, [dispatchEvent, resetForReplay, clearPending, state.runId, pausedRunId, readPending]);

    // Resume an in-flight durable run after a page refresh: reconnect to the
    // run's SSE stream and rebuild the UI from the buffered replay.
    useEffect(() => {
        if (resumedRef.current) return;
        resumedRef.current = true;

        let raw: string | null = null;
        try {
            raw = sessionStorage.getItem(PENDING_RUN_KEY);
        } catch { /* storage unavailable */ }
        if (!raw) return;

        let parsed: { runId: string; request: AgentRequest; at: number } | null = null;
        try {
            parsed = JSON.parse(raw);
        } catch { /* corrupt */ }
        if (!parsed || typeof parsed.runId !== 'string') {
            clearPending();
            return;
        }
        if (!parsed.request || Date.now() - parsed.at > PENDING_RUN_TTL_MS) {
            clearPending();
            return;
        }

        const controller = new AbortController();
        abortRef.current = controller;
        setState({ ...INITIAL_STATE, status: 'running', chatId: parsed.request.chatId ?? null });

        connectDurableRunStream(parsed.runId, dispatchEvent, controller.signal, {
            onRunId: (runId) => {
                runIdRef.current = runId;
                setState(prev => ({ ...prev, runId }));
            },
            onReconnect: resetForReplay,
        }).catch(() => {
            // Non-fatal: dispatchEvent already surfaces terminal states.
        }).finally(() => {
            if (abortRef.current === controller) abortRef.current = null;
            // A refresh that lands on a clarification pause keeps PENDING_RUN
            // alive (same guard as `send`/`resume`).
            if (!pausedRef.current) clearPending();
        });
    }, [dispatchEvent, resetForReplay, clearPending]);

    return {
        ...state,
        runId: state.runId,
        pausedRunId,
        send, abort, reset, resume,
    };
}

export type { AgentWarning };

