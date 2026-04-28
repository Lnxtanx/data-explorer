// =============================================================================
// useAgentStream.ts — SSE connection layer for the AI agent.
//
// Handles: fetch, ReadableStream reading, SSE line parsing, raw event dispatch.
// Pure async function — no React state, no hooks.
// =============================================================================

import { getCsrfToken, API_BASE_URL } from '../lib/api/client';
import type { AgentRequest } from './agentTypes';

/**
 * Called for each parsed SSE event.
 * Return `true` to stop reading the stream (e.g. on "done" or "error").
 */
export type StreamEventCallback = (event: string, data: unknown) => boolean | void;

// P2-8: retry configuration for transient network errors
const MAX_RETRIES   = 3;
const RETRY_BASE_MS = 1_000;

/** Tagged error that carries the HTTP status code for retry decisions. */
class HttpError extends Error {
    constructor(message: string, public readonly status: number) {
        super(message);
    }
}

/**
 * Open an SSE stream to the agent endpoint, parse events, and dispatch them
 * via `onEvent`. Resolves when the stream ends (either naturally or via abort).
 *
 * P2-8: retries up to MAX_RETRIES times with exponential backoff on transient
 * network errors. HTTP 4xx errors are not retried (client errors). Aborts are
 * never retried. The same chatId is reused on each attempt so memory and
 * history are preserved across retries.
 */
export async function startAgentStream(
    request: AgentRequest,
    onEvent: StreamEventCallback,
    signal: AbortSignal,
): Promise<void> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        if (signal.aborted) return;

        if (attempt > 0) {
            // Exponential backoff: 1 s, 2 s, 4 s …
            const delayMs = RETRY_BASE_MS * 2 ** (attempt - 1);
            await new Promise<void>(resolve => setTimeout(resolve, delayMs));
            if (signal.aborted) return;
        }

        try {
            await _streamOnce(request, onEvent, signal);
            return; // success — done
        } catch (err) {
            if (signal.aborted) return;
            lastError = err instanceof Error ? err : new Error(String(err));
            // Do not retry client errors (4xx) — they won't succeed on retry
            if (lastError instanceof HttpError && lastError.status >= 400 && lastError.status < 500) {
                throw lastError;
            }
        }
    }

    throw lastError ?? new Error('Agent stream failed after retries');
}

/**
 * Single attempt: open the fetch, read the SSE stream, dispatch events.
 * Throws HttpError on non-OK responses, plain Error on network/stream failures.
 */
async function _streamOnce(
    request: AgentRequest,
    onEvent: StreamEventCallback,
    signal: AbortSignal,
): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/ai/agent`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(getCsrfToken() ? { 'X-CSRF-Token': getCsrfToken()! } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
            connectionId:    request.connectionId,
            message:         request.message,
            chatId:          request.chatId,
            session_id:      request.sessionId,
            mentionedTables: request.mentionedTables ?? [],
            schemaName:      request.schemaName ?? 'public',
            databaseName:    request.databaseName,
            history:         request.history ?? [],
            synthesisModel:  request.synthesisModel,
        }),
        signal,
    });

    if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new HttpError(body.error ?? `Request failed: ${response.status}`, response.status);
    }

    if (!response.body) throw new Error('No response body');

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer       = '';
    let currentEvent: string | null = null;

    outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
            if (line.startsWith('event: ')) {
                currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ') && currentEvent) {
                try {
                    const data = JSON.parse(line.slice(6));
                    const stop = onEvent(currentEvent, data);
                    if (stop) break outer;
                } catch {
                    // Malformed SSE data — skip
                }
                currentEvent = null;
            }
        }
    }
}
