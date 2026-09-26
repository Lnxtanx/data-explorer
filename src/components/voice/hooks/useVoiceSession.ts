// =============================================================================
// src/components/voice/hooks/useVoiceSession.ts — Native Gemini Live Voice Session Hook
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VoiceAudioPlayer } from '../audio/voice-audio-player';
import { VoiceAudioRecorder } from '../audio/voice-audio-recorder';
import { VoiceSocketClient } from '../voice-socket-client';
import type { AgentArtifact } from '../../ai/types';
import { useVoiceAudioLevel } from './useVoiceAudioLevel';
import type {
    GeminiEvent,
      ToolCallInfo,
    UseVoiceSessionReturn,
    VoiceMessage,
} from '../types';
import type { OrbState } from '../orbs/orb-state';

const MAX_RECONNECT_ATTEMPTS = 2;
const RECONNECT_BASE_DELAY_MS = 500;
const VOICE_SESSION_LIMIT_MS = 60 * 60 * 1000 + 5000;
const FATAL_ERROR_CODES = new Set([
    'session_duration_exceeded',
    // P7 quota refusals — reconnecting would just re-refuse; surface the message.
    'quota_exhausted',
    'quota_unavailable',
    'model_not_allowed',
    'concurrent_limit',
]);

function newId(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useVoiceSession(
    connectionId: string,
    sessionId: string,
    userName?: string,
): UseVoiceSessionReturn {
    const [isConnecting, setIsConnecting] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [isTalking, setIsTalking] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [toolCallInfo, setToolCallInfo] = useState<ToolCallInfo | null>(null);
    const [messages, setMessages] = useState<VoiceMessage[]>([]);
    const [error, setError] = useState<string | null>(null);

    // Audio & Socket Controllers
    const socketClientRef = useRef<VoiceSocketClient | null>(null);
    const playerRef = useRef<VoiceAudioPlayer | null>(null);
    const recorderRef = useRef<VoiceAudioRecorder | null>(null);

    // Turn & Message Accumulators (Strictly isolated per turn)
    const pendingUserRef = useRef<VoiceMessage | null>(null);
    const pendingAssistantRef = useRef<VoiceMessage | null>(null);
    const turnCounterRef = useRef<number>(1);

    // Resilience State
    const errorRef = useRef<string | null>(null);
    const isMutedRef = useRef(false);
    const userEndedRef = useRef(false);
    const reconnectAttemptsRef = useRef(0);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const sessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const startSessionRef = useRef<(() => Promise<void>) | null>(null);

    // Audio level meter
    const audioLevelRef = useVoiceAudioLevel(recorderRef, isConnected);

    const showError = useCallback((msg: string | null) => {
        errorRef.current = msg;
        setError(msg);
    }, []);

    const clearSessionTimer = useCallback(() => {
        if (sessionTimerRef.current) {
            clearTimeout(sessionTimerRef.current);
            sessionTimerRef.current = null;
        }
    }, []);

    const finalizeMessages = useCallback(() => {
        const toCommit: VoiceMessage[] = [];
        if (pendingUserRef.current) {
            toCommit.push({ ...pendingUserRef.current, isInterim: false });
            pendingUserRef.current = null;
        }
        if (pendingAssistantRef.current) {
            toCommit.push({ ...pendingAssistantRef.current, isInterim: false });
            pendingAssistantRef.current = null;
        }
        if (toCommit.length > 0) {
            setMessages((prev) => {
                const map = new Map(prev.map((m) => [m.id, m]));
                for (const m of toCommit) map.set(m.id, m);
                return Array.from(map.values());
            });
        }
    }, []);

    const toggleMute = useCallback(() => {
        setIsMuted((prev) => {
            const next = !prev;
            isMutedRef.current = next;
            recorderRef.current?.setMuted(next);
            return next;
        });
    }, []);

    // Cleanup resources
    const teardownMedia = useCallback(() => {
        recorderRef.current?.dispose();
        recorderRef.current = null;
        playerRef.current?.dispose();
        playerRef.current = null;
    }, []);

    const endSession = useCallback(() => {
        userEndedRef.current = true;
        if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
        }
        clearSessionTimer();
        reconnectAttemptsRef.current = 0;

        socketClientRef.current?.close(1000, 'user ended session');
        socketClientRef.current = null;

        teardownMedia();
        finalizeMessages();

        setIsConnecting(false);
        setIsConnected(false);
        setIsTalking(false);
        setIsThinking(false);
        setToolCallInfo(null);
    }, [clearSessionTimer, finalizeMessages, teardownMedia]);

    // Reconnection Backoff
    const scheduleReconnect = useCallback(
        (closeCode?: number, closeReason?: string) => {
            const attempt = reconnectAttemptsRef.current;
            if (attempt >= MAX_RECONNECT_ATTEMPTS) {
                reconnectAttemptsRef.current = 0;
                showError(
                    errorRef.current ??
                        `Voice connection lost${closeCode ? ` (code ${closeCode})` : ''}${
                            closeReason ? `: ${closeReason}` : ''
                        }`,
                );
                setIsConnecting(false);
                return;
            }
            reconnectAttemptsRef.current = attempt + 1;
            const delay = RECONNECT_BASE_DELAY_MS * (attempt + 1);
            setIsConnecting(true);
            reconnectTimerRef.current = setTimeout(() => {
                reconnectTimerRef.current = null;
                if (userEndedRef.current) return;
                void startSessionRef.current?.();
            }, delay);
        },
        [showError],
    );

    // Event Handler for Gemini Live Events
    const handleGeminiEvent = useCallback(
        (event: GeminiEvent) => {
            const content = event.server_content;

            // 1. Barge-In / Interruption (Top Priority per Gemini Live API spec)
            const isInterrupted = Boolean(content?.interrupted || (content as any)?.wasInterrupted);
            if (isInterrupted) {
                playerRef.current?.stopAndClear();
                setIsTalking(false);
                setIsThinking(false);
                if (pendingAssistantRef.current) {
                    const finalInterrupted = { ...pendingAssistantRef.current, wasInterrupted: true, isInterim: false };
                    pendingAssistantRef.current = null;
                    turnCounterRef.current += 1;
                    setMessages((prev) =>
                        prev.map((m) => (m.id === finalInterrupted.id ? finalInterrupted : m)),
                    );
                }
                return;
            }

            // 2. Spoken Audio Playback
            if (content?.model_turn?.parts) {
                // If user was speaking, finalize user turn as model is now responding
                if (pendingUserRef.current) {
                    const finalUser = { ...pendingUserRef.current, isInterim: false };
                    pendingUserRef.current = null;
                    setMessages((prev) => prev.map((m) => (m.id === finalUser.id ? finalUser : m)));
                }

                for (const part of content.model_turn.parts) {
                    if (part.inline_data?.data) {
                        playerRef.current?.enqueueChunk(part.inline_data.data);
                        setIsTalking(true);
                    }
                }
            }

            // 3. User Input Transcription (Interim or Final)
            if (content?.input_transcription?.text) {
                const txt = content.input_transcription.text;
                const isFinished = Boolean(content.input_transcription.finished);

                // CRITICAL: Finalize any previous assistant turn so each turn has its own distinct bubble
                if (pendingAssistantRef.current) {
                    const finalAssistant = { ...pendingAssistantRef.current, isInterim: false };
                    pendingAssistantRef.current = null;
                    turnCounterRef.current += 1;
                    setMessages((prev) =>
                        prev.map((m) => (m.id === finalAssistant.id ? finalAssistant : m)),
                    );
                }

                if (!pendingUserRef.current) {
                    pendingUserRef.current = {
                        id: newId(),
                        role: 'user',
                        text: txt,
                        isInterim: !isFinished,
                        turnIndex: turnCounterRef.current,
                    };
                } else {
                    pendingUserRef.current = {
                        ...pendingUserRef.current,
                        text: pendingUserRef.current.text + txt,
                        isInterim: !isFinished,
                    };
                }

                const currentPending = pendingUserRef.current;
                setMessages((prev) => {
                    const idx = prev.findIndex((m) => m.id === currentPending.id);
                    if (idx !== -1) {
                        const copy = [...prev];
                        copy[idx] = currentPending;
                        return copy;
                    }
                    return [...prev, currentPending];
                });
            }

            // 4. Model Output Transcription
            if (content?.output_transcription?.text) {
                const token = content.output_transcription.text;
                setIsThinking(false);

                // Commit user turn now that model began responding
                if (pendingUserRef.current) {
                    const finalUser = { ...pendingUserRef.current, isInterim: false };
                    pendingUserRef.current = null;
                    setMessages((prev) => prev.map((m) => (m.id === finalUser.id ? finalUser : m)));
                }

                if (!pendingAssistantRef.current) {
                    pendingAssistantRef.current = {
                        id: newId(),
                        role: 'assistant',
                        text: token,
                        isInterim: false,
                        turnIndex: turnCounterRef.current,
                    };
                } else {
                    pendingAssistantRef.current = {
                        ...pendingAssistantRef.current,
                        text: pendingAssistantRef.current.text + token,
                    };
                }

                const currentAssistant = pendingAssistantRef.current;
                setMessages((prev) => {
                    const idx = prev.findIndex((m) => m.id === currentAssistant.id);
                    if (idx !== -1) {
                        const copy = [...prev];
                        copy[idx] = currentAssistant;
                        return copy;
                    }
                    return [...prev, currentAssistant];
                });
            }

            // 5. Turn Complete
            const isTurnComplete = Boolean(content?.turn_complete || (content as any)?.turnComplete);
            if (isTurnComplete) {
                setIsTalking(false);
                setIsThinking(false);
                setToolCallInfo(null);
                if (pendingAssistantRef.current) {
                    const finalTurn = { ...pendingAssistantRef.current, isInterim: false };
                    pendingAssistantRef.current = null;
                    turnCounterRef.current += 1;
                    setMessages((prev) =>
                        prev.map((m) => (m.id === finalTurn.id ? finalTurn : m)),
                    );
                }
            }

            // 6. Tool Calling
            if (event.tool_call?.function_calls && event.tool_call.function_calls.length > 0) {
                const calls = event.tool_call.function_calls;
                const firstCall = calls[0];
                setToolCallInfo({ name: firstCall.name, args: firstCall.args });
                setIsThinking(true);

                // Commit user turn now that model began responding / executing tool
                if (pendingUserRef.current) {
                    const finalUser = { ...pendingUserRef.current, isInterim: false };
                    pendingUserRef.current = null;
                    setMessages((prev) => prev.map((m) => (m.id === finalUser.id ? finalUser : m)));
                }

                if (!pendingAssistantRef.current) {
                    pendingAssistantRef.current = {
                        id: newId(),
                        role: 'assistant',
                        text: '',
                        isInterim: true,
                        turnIndex: turnCounterRef.current,
                        toolSteps: [],
                        artifacts: [],
                    };
                }

                const currentSteps = [...(pendingAssistantRef.current.toolSteps || [])];
                for (const call of calls) {
                    const callId = call.id || `call_${Date.now()}_${currentSteps.length}`;
                    const existingStepIdx = currentSteps.findIndex((s) => s.id === callId);
                    const sqlArg = typeof call.args?.sql === 'string' ? call.args.sql : undefined;
                    if (sqlArg) {
                        pendingAssistantRef.current.sql = sqlArg;
                    }
                    if (existingStepIdx === -1) {
                        currentSteps.push({
                            id: callId,
                            name: call.name || 'tool',
                            input: (call.args as Record<string, unknown>) || {},
                            status: 'calling',
                            startedAt: Date.now(),
                        });
                    }
                }
                pendingAssistantRef.current.toolSteps = currentSteps;

                const currentAssistant = pendingAssistantRef.current;
                setMessages((prev) => {
                    const idx = prev.findIndex((m) => m.id === currentAssistant.id);
                    if (idx !== -1) {
                        const copy = [...prev];
                        copy[idx] = { ...currentAssistant };
                        return copy;
                    }
                    return [...prev, { ...currentAssistant }];
                });
            }
        },
        [],
    );

    const startSession = useCallback(async () => {
        if (socketClientRef.current?.isConnected || socketClientRef.current?.isConnecting) return;

        userEndedRef.current = false;
        showError(null);
        setIsConnecting(true);

        try {
            // 1. Microphone Capture (requests user media and sets hardware endpoints first)
            const recorder = new VoiceAudioRecorder();
            recorder.setMuted(isMutedRef.current);
            await recorder.start((chunk) => {
                socketClientRef.current?.sendAudioChunk(chunk);
            });
            recorderRef.current = recorder;

            // 2. Playback Engine (created after hardware routing is established)
            const player = new VoiceAudioPlayer();
            await player.resume();
            playerRef.current = player;

            // 3. WebSocket Connection
            const client = new VoiceSocketClient();
            socketClientRef.current = client;

            client.connect(
                connectionId,
                sessionId,
                {
                    onSessionReady: () => {
                        reconnectAttemptsRef.current = 0;
                        clearSessionTimer();
                        sessionTimerRef.current = setTimeout(() => {
                            showError('Voice session reached the 60-minute limit');
                            endSession();
                        }, VOICE_SESSION_LIMIT_MS);
                        setIsConnecting(false);
                        setIsConnected(true);
                        showError(null);
                    },
                    onGeminiEvent: (event) => {
                        handleGeminiEvent(event);
                    },
                    onToolResult: (name, sql, payload, id) => {
                        setIsThinking(true);

                        if (!pendingAssistantRef.current) {
                            pendingAssistantRef.current = {
                                id: newId(),
                                role: 'assistant',
                                text: '',
                                isInterim: true,
                                turnIndex: turnCounterRef.current,
                                toolSteps: [],
                                artifacts: [],
                            };
                        }

                        const currentAssistant = pendingAssistantRef.current;
                        const toolSteps = [...(currentAssistant.toolSteps || [])];
                        const isSuccess = payload?.success !== false;
                        const rowCount =
                            payload?.rowCount ??
                            (Array.isArray(payload?.rows) ? payload.rows.length : undefined);
                        const summary =
                            payload?.error ||
                            (rowCount !== undefined
                                ? `${rowCount} row${rowCount === 1 ? '' : 's'}`
                                : 'Completed');

                        const targetStepIdx = id
                            ? toolSteps.findIndex((s) => s.id === id)
                            : toolSteps.findIndex((s) => s.name === name && s.status === 'calling');

                        if (targetStepIdx !== -1) {
                            const step = toolSteps[targetStepIdx];
                            toolSteps[targetStepIdx] = {
                                ...step,
                                status: isSuccess ? 'done' : 'error',
                                result: { success: isSuccess, summary },
                                latencyMs:
                                    payload?.executionMs ??
                                    (step.startedAt ? Math.max(1, Date.now() - step.startedAt) : undefined),
                            };
                        } else {
                            toolSteps.push({
                                id: id || `call_${Date.now()}`,
                                name: name || 'tool',
                                input: sql ? { sql } : {},
                                status: isSuccess ? 'done' : 'error',
                                result: { success: isSuccess, summary },
                                latencyMs: payload?.executionMs,
                            });
                        }
                        currentAssistant.toolSteps = toolSteps;

                        // If the tool returned table rows/columns, construct an AgentArtifact
                        if (
                            payload &&
                            (Array.isArray(payload.rows) || Array.isArray(payload.columns))
                        ) {
                            const currentArtifacts = [...(currentAssistant.artifacts || [])];
                            const effectiveSql = sql || currentAssistant.sql;
                            const newArtifact: AgentArtifact = {
                                id: `art_${id || Date.now()}`,
                                type: 'table',
                                sql: effectiveSql,
                                rows: Array.isArray(payload.rows) ? payload.rows : [],
                                columns: Array.isArray(payload.columns)
                                    ? payload.columns.map((c: any) =>
                                          typeof c === 'string' ? { name: c } : c,
                                      )
                                    : [],
                                totalRows: rowCount ?? (Array.isArray(payload.rows) ? payload.rows.length : 0),
                            };
                            const artIdx = currentArtifacts.findIndex(
                                (a) => (id && a.id === `art_${id}`) || (effectiveSql && a.sql === effectiveSql),
                            );
                            if (artIdx !== -1) {
                                currentArtifacts[artIdx] = newArtifact;
                            } else {
                                currentArtifacts.push(newArtifact);
                            }
                            currentAssistant.artifacts = currentArtifacts;
                            if (effectiveSql) {
                                currentAssistant.sql = effectiveSql;
                            }
                        }

                        setMessages((prev) => {
                            const idx = prev.findIndex((m) => m.id === currentAssistant.id);
                            if (idx !== -1) {
                                const copy = [...prev];
                                copy[idx] = { ...currentAssistant };
                                return copy;
                            }
                            return [...prev, { ...currentAssistant }];
                        });
                    },
                    onTurnFormatted: (frame) => {
                        setIsThinking(false);
                        const artifactsFromFrame: AgentArtifact[] = (frame.artifacts || []).map((art: any) => ({
                            ...art,
                            columns: Array.isArray(art.columns)
                                ? art.columns.map((c: any) => (typeof c === 'string' ? { name: c } : c))
                                : [],
                        }));
                        const toolStepsFromFrame = frame.toolSteps;

                        if (
                            pendingAssistantRef.current &&
                            (frame.turn_index == null || pendingAssistantRef.current.turnIndex === frame.turn_index)
                        ) {
                            const p = pendingAssistantRef.current;
                            const baseSteps = toolStepsFromFrame && toolStepsFromFrame.length > 0
                                ? toolStepsFromFrame
                                : (p.toolSteps || []);
                            const finalizedToolSteps = baseSteps.map((s) =>
                                s.status === 'calling' ? { ...s, status: 'done' as const } : s,
                            );
                            const mergedArtifacts = artifactsFromFrame.length > 0
                                ? artifactsFromFrame
                                : (p.artifacts || []);

                            const finalMsg: VoiceMessage = {
                                ...p,
                                text: frame.content || p.text,
                                isInterim: false,
                                turnIndex: frame.turn_index ?? p.turnIndex,
                                toolSteps: finalizedToolSteps.length > 0 ? finalizedToolSteps : undefined,
                                artifacts: mergedArtifacts.length > 0 ? mergedArtifacts : undefined,
                                creditsUsed: frame.credits_charged ?? p.creditsUsed,
                                wasInterrupted: frame.was_interrupted ?? p.wasInterrupted,
                            };
                            pendingAssistantRef.current = null;
                            turnCounterRef.current = Math.max(turnCounterRef.current, (frame.turn_index || 0) + 1);

                            setMessages((prev) => {
                                const idx = prev.findIndex((m) => m.id === finalMsg.id);
                                if (idx !== -1) {
                                    const copy = [...prev];
                                    copy[idx] = finalMsg;
                                    return copy;
                                }
                                return [...prev, finalMsg];
                            });
                            return;
                        }

                        if (frame.content || artifactsFromFrame.length > 0 || (toolStepsFromFrame && toolStepsFromFrame.length > 0)) {
                            setMessages((prev) => {
                                let targetIdx = -1;
                                if (frame.turn_index != null) {
                                    targetIdx = prev.findIndex(
                                        (m) => m.role === 'assistant' && m.turnIndex === frame.turn_index,
                                    );
                                }
                                if (targetIdx === -1) {
                                    targetIdx = prev.map((m) => m.role).lastIndexOf('assistant');
                                }

                                if (targetIdx !== -1) {
                                    return prev.map((m, idx) =>
                                        idx === targetIdx
                                            ? {
                                                  ...m,
                                                  text: frame.content || m.text,
                                                  isInterim: false,
                                                  turnIndex: frame.turn_index ?? m.turnIndex,
                                                  toolSteps: toolStepsFromFrame?.length
                                                      ? toolStepsFromFrame
                                                      : m.toolSteps?.map((s) => (s.status === 'calling' ? { ...s, status: 'done' as const } : s)),
                                                  artifacts: artifactsFromFrame.length > 0 ? artifactsFromFrame : m.artifacts,
                                                  creditsUsed: frame.credits_charged ?? m.creditsUsed,
                                                  wasInterrupted: frame.was_interrupted ?? m.wasInterrupted,
                                              }
                                            : m,
                                    );
                                }
                                return [
                                    ...prev,
                                    {
                                        id: newId(),
                                        role: 'assistant',
                                        text: frame.content || '',
                                        isInterim: false,
                                        turnIndex: frame.turn_index,
                                        toolSteps: toolStepsFromFrame,
                                        artifacts: artifactsFromFrame.length > 0 ? artifactsFromFrame : undefined,
                                        creditsUsed: frame.credits_charged,
                                        wasInterrupted: frame.was_interrupted,
                                    },
                                ];
                            });
                        }
                    },
                onSessionEnded: () => {
                    endSession();
                },
                onError: (msg, code) => {
                    setIsConnecting(false);
                    showError(msg);
                    if (code && FATAL_ERROR_CODES.has(code)) {
                        userEndedRef.current = true;
                    }
                },
                onClose: (code, reason) => {
                    teardownMedia();
                    finalizeMessages();
                    setIsConnecting(false);
                    setIsConnected(false);
                    setIsTalking(false);
                    setIsThinking(false);

                    if (userEndedRef.current || code === 1000 || code === 1001) return;
                    scheduleReconnect(code, reason);
                },
            }, userName);
        } catch (err) {
            teardownMedia();
            setIsConnecting(false);
            const message = err instanceof Error ? err.message : 'Could not start voice session';
            if (reconnectAttemptsRef.current > 0) {
                scheduleReconnect(undefined, message);
            } else {
                showError(message);
            }
        }
    }, [clearSessionTimer, connectionId, endSession, finalizeMessages, handleGeminiEvent, scheduleReconnect, sessionId, showError, teardownMedia, userName]);

    // Keep the reconnect timer calling the latest startSession
    useEffect(() => {
        startSessionRef.current = startSession;
    }, [startSession]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            userEndedRef.current = true;
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = null;
            }
            clearSessionTimer();
            socketClientRef.current?.close();
            socketClientRef.current = null;
            teardownMedia();
        };
    }, [clearSessionTimer, teardownMedia]);

    // Reactive Orb State
    const orbState: OrbState = useMemo(() => {
        if (error) return 'error';
        if (isConnecting) return 'connecting';
        if (isThinking) return 'thinking';
        if (isTalking) return 'speaking';
        if (isMuted) return 'disabled';
        if (isConnected) return 'listening';
        return 'idle';
    }, [error, isConnecting, isThinking, isTalking, isMuted, isConnected]);

    return {
        isConnecting,
        isConnected,
        isTalking,
        isThinking,
        toolCallInfo,
        isMuted,
        toggleMute,
        orbState,
        audioLevelRef,
        messages,
        error,
        startSession,
        endSession,
    };
}


