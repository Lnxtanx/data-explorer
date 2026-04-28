// =============================================================================
// useAIStream
// React hook for streaming AI responses via SSE.
//
// Manages the full lifecycle of a single AI chat turn:
//   1. Sends POST /api/ai/chat with user message + context
//   2. Reads the SSE stream: delta | sql | done | error events
//   3. Accumulates streamed text and SQL artifacts incrementally
//   4. Exposes status, content, and artifacts to the component
//
// Usage:
//   const { send, status, streamedText, sqlArtifacts, error, abort } = useAIStream();
//   await send({ connectionId, message, tableContext, history });
// =============================================================================

import { useCallback, useRef, useState } from 'react';
import type { ChatRequest, SqlArtifact, HistoryMessage } from '../lib/api/ai';
import { getCsrfToken, API_BASE_URL } from '../lib/api/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type StreamStatus = 'idle' | 'streaming' | 'done' | 'error' | 'aborted';

export interface StreamState {
    status: StreamStatus;
    streamedText: string;
    sqlArtifacts: SqlArtifact[];
    chatId: string | null;
    error: string | null;
    tokenCount: number | null;
}

export interface UseAIStreamResult extends StreamState {
    send: (request: ChatRequest) => Promise<void>;
    abort: () => void;
    reset: () => void;
}

// ─── SSE Event payloads from Python/Node ─────────────────────────────────────

// Python sends camelCase; Node persistence layer may re-format. Handle both.
interface DeltaEvent   { text: string; chat_id?: string; chatId?: string }
interface SqlEvent     { sql: string; confidence?: number; explanation?: string }
interface DoneEvent    {
    usage?: {
        input_tokens?: number;
        output_tokens?: number;
        inputTokens?: number;   // Python camelCase variant
        outputTokens?: number;
    };
    chat_id?: string;
    chatId?: string;  // Python camelCase variant
}
interface ErrorEvent   { message: string; code?: string }

// ─── Initial state ────────────────────────────────────────────────────────────

const INITIAL_STATE: StreamState = {
    status: 'idle',
    streamedText: '',
    sqlArtifacts: [],
    chatId: null,
    error: null,
    tokenCount: null,
};

// =============================================================================
// Hook
// =============================================================================

export function useAIStream(): UseAIStreamResult {
    const [state, setState] = useState<StreamState>(INITIAL_STATE);
    const abortRef = useRef<AbortController | null>(null);

    // ── reset ────────────────────────────────────────────────────────────────
    const reset = useCallback(() => {
        setState(INITIAL_STATE);
    }, []);

    // ── abort ────────────────────────────────────────────────────────────────
    const abort = useCallback(() => {
        if (abortRef.current) {
            abortRef.current.abort();
            abortRef.current = null;
        }
        setState(prev => ({ ...prev, status: 'aborted' }));
    }, []);

    // ── send ─────────────────────────────────────────────────────────────────
    const send = useCallback(async (request: ChatRequest) => {
        // Cancel any in-flight request
        if (abortRef.current) {
            abortRef.current.abort();
        }

        const controller = new AbortController();
        abortRef.current = controller;

        // Reset to streaming state
        setState({
            status: 'streaming',
            streamedText: '',
            sqlArtifacts: [],
            chatId: request.chatId ?? null,
            error: null,
            tokenCount: null,
        });

        try {
            const response = await fetch(`${API_BASE_URL}/api/ai/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(getCsrfToken() ? { 'X-CSRF-Token': getCsrfToken()! } : {}),
                },
                credentials: 'include',
                body: JSON.stringify(request),
                signal: controller.signal,
            });

            if (!response.ok) {
                const body = await response.json().catch(() => ({})) as { error?: string };
                throw new Error(body.error ?? `Request failed: ${response.status}`);
            }

            if (!response.body) {
                throw new Error('No response body');
            }

            // ── Read SSE stream ──────────────────────────────────────────────
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            let currentEvent: string | null = null;

            outer: while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split('\n');
                // Keep the last potentially-incomplete line in the buffer
                buffer = lines.pop() ?? '';

                for (const line of lines) {
                    if (line.startsWith('event: ')) {
                        currentEvent = line.slice(7).trim();
                    } else if (line.startsWith('data: ') && currentEvent) {
                        const rawData = line.slice(6);

                        try {
                            const data = JSON.parse(rawData) as Record<string, unknown>;

                            switch (currentEvent) {
                                case 'delta': {
                                    const evt = data as unknown as DeltaEvent;
                                    setState(prev => ({
                                        ...prev,
                                        streamedText: prev.streamedText + (evt.text ?? ''),
                                        // handle both snake_case (Node) and camelCase (Python)
                                        chatId: evt.chat_id ?? evt.chatId ?? prev.chatId,
                                    }));
                                    break;
                                }

                                case 'sql': {
                                    const evt = data as unknown as SqlEvent;
                                    if (evt.sql) {
                                        setState(prev => ({
                                            ...prev,
                                            sqlArtifacts: [
                                                ...prev.sqlArtifacts,
                                                { sql: evt.sql, confidence: evt.confidence },
                                            ],
                                        }));
                                    }
                                    break;
                                }

                                case 'done': {
                                    const evt = data as unknown as DoneEvent;
                                    // handle both output_tokens (Node) and outputTokens (Python)
                                    const outputTokens = evt.usage?.output_tokens
                                        ?? evt.usage?.outputTokens
                                        ?? null;
                                    setState(prev => ({
                                        ...prev,
                                        status: 'done',
                                        tokenCount: outputTokens ?? prev.tokenCount,
                                        chatId: evt.chat_id ?? evt.chatId ?? prev.chatId,
                                    }));
                                    break outer;
                                }

                                case 'error': {
                                    const evt = data as unknown as ErrorEvent;
                                    setState(prev => ({
                                        ...prev,
                                        status: 'error',
                                        error: evt.message ?? 'Unknown AI error',
                                    }));
                                    break outer;
                                }
                            }
                        } catch {
                            // Malformed JSON in SSE data — skip
                        }

                        currentEvent = null;
                    }
                }
            }

            // Ensure we reach 'done' if stream ends without a done event
            setState(prev => {
                if (prev.status === 'streaming') {
                    return { ...prev, status: 'done' };
                }
                return prev;
            });

        } catch (err: unknown) {
            if (err instanceof Error && err.name === 'AbortError') {
                // User-initiated abort — already handled by abort()
                setState(prev => ({ ...prev, status: 'aborted' }));
            } else {
                const message = err instanceof Error ? err.message : 'AI request failed';
                setState(prev => ({ ...prev, status: 'error', error: message }));
            }
        } finally {
            if (abortRef.current === controller) {
                abortRef.current = null;
            }
        }
    }, []);

    return { ...state, send, abort, reset };
}
