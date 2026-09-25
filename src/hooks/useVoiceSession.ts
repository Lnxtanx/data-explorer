// =============================================================================
// useVoiceSession — voice-to-voice session hook (native Gemini Live audio)
//
// Owns the browser side of the Option A transport:
//   Browser ──WS──► Node /api/voice/session ──WS──► backend-ai → Gemini Live
//   • open/close the WebSocket (session_id cookie rides along same-origin)
//   • stream mic chunks from the voice-recorder-worklet (100ms / 16kHz PCM)
//   • handle incoming frames: model audio → VoiceAudioPlayer,
//     input/output transcriptions → message state, interrupted → barge-in stop
//
// Transcription semantics (verified against the Live API 2026-09-25):
//   fragments are INCREMENTAL (append until the turn ends) and `finished` is
//   not reliably set — the user message finalizes when the model starts
//   replying (first output fragment), the assistant message on turn_complete.
//
// NOTE: this is the native voice-to-voice path — NOT useSpeechToText
// (legacy Web Speech API STT-to-text). The two are independent.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { VoiceAudioPlayer } from '@/lib/voice/voice-audio-player';
import type { OrbState } from '@/components/data-explorer/ai/voice/orbs';

export interface VoiceMessage {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    isInterim?: boolean;
}

export interface UseVoiceSessionReturn {
    /** Socket open / media starting, Gemini not ready yet (session_pending). */
    isConnecting: boolean;
    isConnected: boolean;
    isTalking: boolean;
    isMuted: boolean;
    toggleMute: () => void;
    orbState: OrbState;
    audioLevelRef: React.MutableRefObject<number>;
    messages: VoiceMessage[];
    error: string | null;
    startSession: () => Promise<void>;
    endSession: () => void;
}

interface GeminiEvent {
    server_content?: {
        model_turn?: { parts?: Array<{ inline_data?: { data?: string } }> } | null;
        input_transcription?: { text?: string; finished?: boolean } | null;
        output_transcription?: { text?: string; finished?: boolean } | null;
        interrupted?: boolean;
        turn_complete?: boolean;
    } | null;
}

type ServerFrame =
    | { type: 'session_ready'; model?: string; voice?: string }
    | { type: 'gemini_event'; data: GeminiEvent }
    | { type: 'error'; code?: string; message?: string };

const AUDIO_MIME = 'audio/pcm;rate=16000';
const MAX_PREOPEN_QUEUE = 50; // ~5s of audio captured before the socket opens

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const CHUNK = 0x4000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
}

function newId(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useVoiceSession(connectionId: string, sessionId: string): UseVoiceSessionReturn {
    const [isConnecting, setIsConnecting] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [isTalking, setIsTalking] = useState(false);
    const [messages, setMessages] = useState<VoiceMessage[]>([]);
    const [error, setError] = useState<string | null>(null);

    const wsRef = useRef<WebSocket | null>(null);
    const playerRef = useRef<VoiceAudioPlayer | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const micAnalyserRef = useRef<AnalyserNode | null>(null);
    const workletNodeRef = useRef<AudioWorkletNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const preopenQueueRef = useRef<ArrayBuffer[]>([]);
    const pendingUserRef = useRef<VoiceMessage | null>(null);
    const pendingAssistantRef = useRef<VoiceMessage | null>(null);

    const [isMuted, setIsMuted] = useState(false);
    const audioLevelRef = useRef<number>(0);
    const rafRef = useRef<number>(0);

    const toggleMute = useCallback(() => {
        setIsMuted((prev) => {
            const next = !prev;
            if (streamRef.current) {
                streamRef.current.getAudioTracks().forEach((track) => {
                    track.enabled = !next;
                });
            }
            return next;
        });
    }, []);

    // Real-time audio amplitude polling for the Voice Orb
    useEffect(() => {
        if (!isConnected && !isConnecting) {
            audioLevelRef.current = 0;
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = 0;
            }
            return;
        }

        const pollAudio = () => {
            if (isTalking && playerRef.current) {
                audioLevelRef.current = playerRef.current.getAudioLevel();
            } else if (micAnalyserRef.current && !isMuted) {
                const data = new Uint8Array(micAnalyserRef.current.frequencyBinCount);
                micAnalyserRef.current.getByteFrequencyData(data);
                let sum = 0;
                for (let i = 0; i < data.length; i++) sum += data[i];
                const avg = sum / data.length;
                audioLevelRef.current = Math.min(1, Math.max(0, (avg / 128) * 1.8));
            } else {
                audioLevelRef.current = 0;
            }
            rafRef.current = requestAnimationFrame(pollAudio);
        };

        rafRef.current = requestAnimationFrame(pollAudio);
        return () => {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = 0;
            }
        };
    }, [isConnected, isConnecting, isTalking, isMuted]);

    const orbState: OrbState = error
        ? 'error'
        : isConnecting
        ? 'connecting'
        : !isConnected
        ? 'idle'
        : isTalking
        ? 'speaking'
        : 'listening';

    // ── transcript helpers (refs → functional state updates) ─────────────────
    const upsertFragment = useCallback(
        (role: 'user' | 'assistant', fragment: string) => {
            const pendingRef = role === 'user' ? pendingUserRef : pendingAssistantRef;
            if (!fragment) return;
            if (!pendingRef.current) {
                const message: VoiceMessage = { id: newId(), role, text: fragment, isInterim: true };
                pendingRef.current = message;
                setMessages((prev) => [...prev, message]);
            } else {
                const id = pendingRef.current.id;
                pendingRef.current.text += fragment;
                const text = pendingRef.current.text;
                setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text } : m)));
            }
        },
        [],
    );

    const finalizeMessages = useCallback(() => {
        for (const pendingRef of [pendingUserRef, pendingAssistantRef]) {
            if (pendingRef.current) {
                const id = pendingRef.current.id;
                pendingRef.current = null;
                setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, isInterim: false } : m)));
            }
        }
    }, []);

    const handleGeminiEvent = useCallback(
        (event: GeminiEvent) => {
            const content = event.server_content;
            if (!content) return;

            if (content.interrupted) {
                finalizeMessages();
                playerRef.current?.stopAndClear();
                setIsTalking(false);
                return;
            }

            if (content.model_turn?.parts) {
                for (const part of content.model_turn.parts) {
                    const data = part.inline_data?.data;
                    if (data) {
                        playerRef.current?.enqueueChunk(data);
                        setIsTalking(true);
                    }
                }
            }

            if (content.input_transcription?.text) {
                upsertFragment('user', content.input_transcription.text);
            }

            if (content.output_transcription?.text) {
                // The model speaking ends the user's turn.
                finalizeMessages();
                upsertFragment('assistant', content.output_transcription.text);
                setIsTalking(true);
            }

            if (content.turn_complete) {
                finalizeMessages();
                setIsTalking(false);
            }
        },
        [finalizeMessages, upsertFragment],
    );

    const teardownMedia = useCallback(() => {
        workletNodeRef.current?.port.close();
        workletNodeRef.current?.disconnect();
        workletNodeRef.current = null;
        micAnalyserRef.current?.disconnect();
        micAnalyserRef.current = null;
        sourceNodeRef.current?.disconnect();
        sourceNodeRef.current = null;
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        void audioCtxRef.current?.close();
        audioCtxRef.current = null;
        preopenQueueRef.current = [];
        audioLevelRef.current = 0;
    }, []);

    const endSession = useCallback(() => {
        const ws = wsRef.current;
        wsRef.current = null;
        if (ws && ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify({ type: 'CLOSE' }));
            } catch {
                /* closing anyway */
            }
            ws.close(1000, 'user ended session');
        }
        teardownMedia();
        playerRef.current?.dispose();
        playerRef.current = null;
        finalizeMessages();
        setIsConnecting(false);
        setIsConnected(false);
        setIsTalking(false);
    }, [finalizeMessages, teardownMedia]);

    const handleFrame = useCallback(
        (frame: ServerFrame) => {
            switch (frame.type) {
                case 'session_ready':
                    setIsConnecting(false);
                    setIsConnected(true);
                    setError(null);
                    break;
                case 'error':
                    setIsConnecting(false);
                    setError(frame.message || frame.code || 'Voice session error');
                    break;
                case 'gemini_event':
                    handleGeminiEvent(frame.data);
                    break;
            }
        },
        [handleGeminiEvent],
    );

    const startSession = useCallback(async () => {
        if (wsRef.current) return;
        setError(null);
        setIsConnecting(true);
        try {
            // 1. playback (user gesture already happened — click)
            const player = new VoiceAudioPlayer();
            await player.resume();
            playerRef.current = player;

            // 2. microphone → 16kHz PCM worklet
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            });
            streamRef.current = stream;

            const AudioCtx =
                window.AudioContext ||
                (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            const ctx = new AudioCtx();
            audioCtxRef.current = ctx;
            await ctx.audioWorklet.addModule('/worklets/voice-recorder-worklet.js');

            const source = ctx.createMediaStreamSource(stream);
            sourceNodeRef.current = source;

            const micAnalyser = ctx.createAnalyser();
            micAnalyser.fftSize = 256;
            micAnalyser.smoothingTimeConstant = 0.4;
            source.connect(micAnalyser);
            micAnalyserRef.current = micAnalyser;

            const worklet = new AudioWorkletNode(ctx, 'voice-recorder-worklet');
            workletNodeRef.current = worklet;
            source.connect(worklet);
            // Connect to destination: guarantees the graph is pulled/processed.
            // The worklet never writes output, so this plays silence (no feedback).
            worklet.connect(ctx.destination);

            // 3. WebSocket → Node proxy (session cookie rides same-origin)
            const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
            const params = new URLSearchParams({
                connection_id: connectionId || 'voice-local',
                session_id: sessionId,
            });
            const ws = new WebSocket(`${scheme}://${window.location.host}/api/voice/session?${params}`);
            wsRef.current = ws;

            ws.onopen = () => {
                const queued = preopenQueueRef.current.splice(0);
                for (const buffer of queued) {
                    ws.send(JSON.stringify({ type: 'AUDIO_CHUNK', data: arrayBufferToBase64(buffer), mime: AUDIO_MIME }));
                }
            };
            ws.onmessage = (event) => {
                try {
                    handleFrame(JSON.parse(event.data) as ServerFrame);
                } catch (err) {
                    console.warn('[VoiceSession] bad frame:', err);
                }
            };
            ws.onerror = () => setError((prev) => prev ?? 'Voice connection error');
            ws.onclose = () => {
                if (wsRef.current === ws) {
                    wsRef.current = null;
                    teardownMedia();
                    playerRef.current?.dispose();
                    playerRef.current = null;
                    finalizeMessages();
                    setIsConnecting(false);
                    setIsConnected(false);
                    setIsTalking(false);
                }
            };

            // 4. mic chunks → socket (buffered until open)
            worklet.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
                const buffer = event.data;
                const socket = wsRef.current;
                if (!socket) return;
                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({ type: 'AUDIO_CHUNK', data: arrayBufferToBase64(buffer), mime: AUDIO_MIME }));
                } else if (socket.readyState === WebSocket.CONNECTING && preopenQueueRef.current.length < MAX_PREOPEN_QUEUE) {
                    preopenQueueRef.current.push(buffer);
                }
            };
        } catch (err) {
            teardownMedia();
            playerRef.current?.dispose();
            playerRef.current = null;
            setIsConnecting(false);
            setError(err instanceof Error ? err.message : 'Could not start voice session');
        }
    }, [connectionId, finalizeMessages, handleFrame, sessionId, teardownMedia]);

    // Close everything if the component unmounts mid-session.
    useEffect(() => {
        return () => {
            if (wsRef.current) {
                endSession();
            }
        };
        // endSession identity is stable enough for teardown; run once on unmount.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return {
        isConnecting,
        isConnected,
        isTalking,
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
