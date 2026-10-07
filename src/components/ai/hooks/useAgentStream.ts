// =============================================================================
// useAgentStream.ts — SSE connection layer for the AI agent.
//
// Durable-run flow:
//   1. POST /api/ai/runs            → creates a durable run, returns { run_id }
//   2. GET  /api/ai/runs/:id/stream → SSE stream (buffered replay + live)
//
// On a transient network drop we RECONNECT to the stream — the backend replays
// every buffered event, so no turn is lost and the UI state is rebuilt from the
// full history (handlers.onReconnect resets the UI before the replay).
//
// Handles: fetch, ReadableStream reading, SSE line parsing, raw event dispatch.
// Pure async functions — no React state, no hooks.
// =============================================================================

import { apiRequestFetch } from '@/lib/api/client';
import { SseChunkAssembler } from '@/lib/api/sseChunks';
import type { AgentRequest, DurableRunCreated } from '../types';

/**
 * Called for each parsed SSE event.
 * Return `true` to stop reading the stream (e.g. on "done" or "error").
 */
export type StreamEventCallback = (event: string, data: unknown) => boolean | void;

/** Extra lifecycle hooks for the durable run flow. */
export interface DurableStreamHandlers {
    /** Fired when the durable run is created / resumed with its stable id. */
    onRunId?: (runId: string) => void;
    /** Fired right before a reconnect replays buffered events (reset UI first). */
    onReconnect?: () => void;
}

// P2-8: retry configuration for transient network errors
const RETRY_BASE_MS      = 1_000;
const RECONNECT_CAP_MS   = 10_000; // SSE auto-reconnect backoff cap
const MAX_RECONNECTS     = 8;      // give up after sustained disconnects

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise<void>(resolve => {
        const t = setTimeout(resolve, ms);
        signal.addEventListener('abort', () => {
            clearTimeout(t);
            resolve();
        }, { once: true });
    });
}

async function readJson<T>(response: Response): Promise<T | null> {
    try {
        return await response.json() as T;
    } catch {
        return null;
    }
}

/**
 * Start a durable agent run: create it, then stream its events, reconnecting
 * (with buffered replay) on transient failures while the run is still active.
 * Resolves when the run reaches a terminal event, the abort signal fires, or
 * reconnection is given up.
 */
export async function startAgentStream(
    request: AgentRequest,
    onEvent: StreamEventCallback,
    signal: AbortSignal,
    handlers: DurableStreamHandlers = {},
): Promise<void> {
    const created = await _createDurableRun(request, onEvent, signal);
    if (created === null) return; // a terminal event (quota/error) was dispatched
    handlers.onRunId?.(created.run_id);
    await connectDurableRunStream(created.run_id, onEvent, signal, handlers);
}

/**
 * Stream (or reconnect to) a durable run that already exists.
 *
 * `since` skips the buffered replay before that event index — answering a
 * clarification passes the paused done frame's `event_index`, so ONLY the
 * resumed leg's frames replay (the stale pre-pause `done` is skipped).
 */
export async function connectDurableRunStream(
    runId: string,
    onEvent: StreamEventCallback,
    signal: AbortSignal,
    handlers: DurableStreamHandlers = {},
    since = 0,
): Promise<void> {
    handlers.onRunId?.(runId);

    for (let attempt = 0; ; attempt++) {
        if (signal.aborted) return;

        if (attempt > 0) {
            handlers.onReconnect?.();
            const delayMs = Math.min(RECONNECT_CAP_MS, RETRY_BASE_MS * 2 ** Math.min(attempt - 1, 4));
            await abortableSleep(delayMs, signal);
            if (signal.aborted) return;
        }

        const outcome = await _streamRunOnce(runId, onEvent, signal, since);
        if (outcome === 'terminal' || outcome === 'aborted') return;

        if (attempt + 1 >= MAX_RECONNECTS) {
            onEvent('error', {
                message: 'Connection lost — could not reconnect to the run.',
                code: 'reconnect_failed',
            });
            return;
        }
    }
}

// ── Private: durable create ────────────────────────────────────────────────────

/** POST /api/ai/runs. Returns the created run, or null after dispatching a
 * terminal event for failures the UI must surface (quota, validation). */
async function _createDurableRun(
    request: AgentRequest,
    onEvent: StreamEventCallback,
    signal: AbortSignal,
): Promise<{ run_id: string } | null> {
    let response: Response;
    try {
        // Phase 3: shared preamble (base URL, credentials, CSRF, JSON type).
        // `apiRequestFetch` deliberately does no status handling, because this
        // function maps 429 -> quota_exceeded and other failures -> an error
        // SSE frame itself.
        response = await apiRequestFetch('/api/ai/runs', {
            method: 'POST',
            signal,
            // Support both snake_case (FastAPI AgentRequest) and camelCase (Node durable runs relay)
            body: JSON.stringify({
                message:          request.message,
                connection_id:    request.connectionId ?? null,
                connectionId:     request.connectionId ?? null,
                schema_name:      request.schemaName ?? 'public',
                schemaName:       request.schemaName ?? 'public',
                database_name:    request.databaseName ?? null,
                databaseName:     request.databaseName ?? null,
                history:          request.history ?? [],
                chat_id:          request.chatId ?? null,
                chatId:           request.chatId ?? null,
                synthesis_model:  request.synthesisModel,
                synthesisModel:   request.synthesisModel,
                session_id:       request.sessionId,
                sessionId:        request.sessionId,
                agent_mode:       request.agentMode ?? '',
                agentMode:        request.agentMode ?? '',
                thinking_enabled: request.thinking,
                thinkingEnabled:  request.thinking,
                file_ids:         request.fileIds ?? [],
                fileIds:          request.fileIds ?? [],
                project_id:       request.projectId ?? null,
                projectId:        request.projectId ?? null,
                mentioned_tables: request.mentionedTables ?? [],
                mentionedTables:  request.mentionedTables ?? [],
                client_time:      request.client_time || request.clientTime || new Date().toISOString(),
                clientTime:       request.clientTime || request.client_time || new Date().toISOString(),
                client_timezone:  request.client_timezone || request.clientTimezone || (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC'),
                clientTimezone:   request.clientTimezone || request.client_timezone || (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC'),
            }),
        });
    } catch (err) {
        if (signal.aborted) return null;
        onEvent('error', { message: err instanceof Error ? err.message : 'Could not reach the AI service.', code: 'create_failed' });
        return null;
    }

    if (!response.ok) {
        const body = await readJson<{
            detail?: { reason?: string; message?: string; credits_used?: number; code?: string };
            reason?: string;
            message?: string;
            error?: string;
            code?: string;
            credits_used?: number;
        }>(response);
        const detail = body?.detail ?? {};
        if (response.status === 429) {
            onEvent('quota_exceeded', {
                reason: detail.reason ?? body?.reason ?? 'quota_exceeded',
                message: detail.message ?? body?.message ?? 'Credit limit reached.',
                credits_used: detail.credits_used ?? body?.credits_used ?? 0,
            });
        } else {
            onEvent('error', {
                message: detail.message ?? body?.error ?? `Failed to start the run (${response.status}).`,
                code: detail.code ?? body?.code ?? 'create_failed',
            });
        }
        return null;
    }

    const body = await readJson<DurableRunCreated>(response);
    if (!body?.run_id) {
        onEvent('error', { message: 'The AI service did not return a run id.', code: 'create_failed' });
        return null;
    }
    if (body.chat_id) {
        onEvent('chat_id', { chat_id: body.chat_id });
    }
    return { run_id: body.run_id };
}

// ── Private: single stream attempt ────────────────────────────────────────────

type StreamOutcome = 'terminal' | 'aborted' | 'retryable-error';

/**
 * One connect to GET /api/ai/runs/:id/stream. Returns
 *  - 'terminal'  when a terminal SSE event was dispatched or a client error hit,
 *  - 'aborted'   when the caller aborted,
 *  - 'retryable-error' when the connection dropped but the run may live on.
 */
async function _streamRunOnce(
    runId: string,
    onEvent: StreamEventCallback,
    signal: AbortSignal,
    since = 0,
): Promise<StreamOutcome> {
    let response: Response;
    try {
        const sinceParam = since > 0 ? `?since=${since}` : '';
        response = await apiRequestFetch(
            `/api/ai/runs/${encodeURIComponent(runId)}/stream${sinceParam}`,
            {
                method: 'GET',
                signal,
            },
        );
    } catch (err) {
        return signal.aborted ? 'aborted' : 'retryable-error';
    }

    if (!response.ok) {
        // 4xx (run gone/unauthorized) will not succeed on retry.
        return response.status >= 400 && response.status < 500 ? 'terminal' : 'retryable-error';
    }
    if (!response.body) return 'retryable-error';

    try {
        const terminal = await _readStream(response.body, onEvent, signal);
        if (terminal) return 'terminal';
    } catch {
        return signal.aborted ? 'aborted' : 'retryable-error';
    }
    return signal.aborted ? 'aborted' : 'retryable-error';
}

/** Read + parse the SSE body, dispatching every event. True when a callback
 * returned `true` (terminal event) or the caller aborted. */
async function _readStream(
    body: ReadableStream<Uint8Array>,
    onEvent: StreamEventCallback,
    signal: AbortSignal,
): Promise<boolean> {
    const reader  = body.getReader();
    const decoder = new TextDecoder();
    // Reassembles payloads the backend split at the 64 KB SSE limit. Without
    // this a large `done` (dashboard html + panelData) or a wide
    // `artifact_rows` batch would be dispatched as a chunk wrapper and lost.
    const chunks  = new SseChunkAssembler();
    let buffer       = '';
    let currentEvent: string | null = null;

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (signal.aborted) return true;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
                if (line.startsWith('event: ')) {
                    currentEvent = line.slice(7).trim();
                } else if (line.startsWith('data: ') && currentEvent) {
                    const name = currentEvent;
                    currentEvent = null;
                    try {
                        const assembled = chunks.push(name, JSON.parse(line.slice(6)));
                        // undefined = a chunk fragment still waiting for siblings.
                        if (assembled === undefined) continue;
                        const stop = onEvent(name, assembled);
                        if (stop) return true;
                    } catch {
                        // Malformed SSE data — skip
                    }
                }
            }
        }
    } finally {
        chunks.reset();
        try { reader.releaseLock(); } catch { /* stream already released */ }
    }
    return false;
}
