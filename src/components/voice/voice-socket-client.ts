// =============================================================================
// src/components/voice/voice-socket-client.ts — Voice Session WebSocket Client
// =============================================================================

import { API_BASE_URL } from '@/lib/api/client';
import type { ClientMessage, GeminiEvent, ServerFrame } from './types';

const AUDIO_MIME = 'audio/pcm;rate=16000';
const MAX_PREOPEN_QUEUE = 50;

/**
 * Resolve the voice-session WebSocket authority.
 *
 * In production the app origin and the API origin differ
 * (data-explorer.schemaweaver.dev -> api.schemaweaver.dev), so the socket has to
 * target the API host explicitly or it hits the static frontend host and never
 * upgrades. When API_BASE_URL is empty (dev) we fall back to the page origin,
 * where the Vite proxy forwards /api with `ws: true`.
 */
function resolveVoiceWsUrl(path: string): string {
    if (API_BASE_URL) {
        const base = new URL(API_BASE_URL, window.location.origin);
        const scheme = base.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${scheme}//${base.host}${path}`;
    }
    const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${scheme}//${window.location.host}${path}`;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const CHUNK = 0x4000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
}

export interface VoiceSocketEvents {
    onSessionReady?: (model?: string, voice?: string) => void;
    onGeminiEvent?: (event: GeminiEvent) => void;
    onToolResult?: (name?: string, sql?: string, payload?: any, id?: string) => void;
    onTurnFormatted?: (frame: Extract<ServerFrame, { type: 'turn_formatted' }>) => void;
    onSessionEnded?: (reason?: string, message?: string) => void;
    onError?: (message: string, code?: string) => void;
    onClose?: (code: number, reason: string) => void;
}

export class VoiceSocketClient {
    private ws: WebSocket | null = null;
    private preopenQueue: ArrayBuffer[] = [];
    private events: VoiceSocketEvents = {};

    public connect(
        connectionId: string,
        sessionId: string,
        events: VoiceSocketEvents,
        userName?: string,
    ): void {
        this.close();
        this.events = events;
        this.preopenQueue = [];

        const query = new URLSearchParams();
        if (connectionId) query.set('connection_id', connectionId);
        if (sessionId) query.set('session_id', sessionId);
        if (userName) query.set('user_name', userName);
        const wsUrl = `${resolveVoiceWsUrl('/api/voice/session')}?${query.toString()}`;

        const socket = new WebSocket(wsUrl);
        this.ws = socket;

        socket.onopen = () => {
            // Drain pre-open queued audio chunks
            while (this.preopenQueue.length > 0) {
                const chunk = this.preopenQueue.shift();
                if (chunk) {
                    this.sendAudioChunk(chunk);
                }
            }
        };

        socket.onmessage = (event: MessageEvent<string>) => {
            try {
                const frame = JSON.parse(event.data) as ServerFrame;
                this.dispatchFrame(frame);
            } catch (err) {
                this.events.onError?.(
                    err instanceof Error ? err.message : 'Invalid frame received from server',
                );
            }
        };

        socket.onerror = () => {
            this.events.onError?.('Voice WebSocket connection error');
        };

        socket.onclose = (event: CloseEvent) => {
            this.ws = null;
            this.events.onClose?.(event.code, event.reason || '');
        };
    }

    public sendAudioChunk(chunk: ArrayBuffer): void {
        const socket = this.ws;
        if (!socket) return;

        if (socket.readyState === WebSocket.OPEN) {
            const base64 = arrayBufferToBase64(chunk);
            socket.send(
                JSON.stringify({
                    type: 'AUDIO_CHUNK',
                    data: base64,
                    mime: AUDIO_MIME,
                } satisfies ClientMessage),
            );
        } else if (
            socket.readyState === WebSocket.CONNECTING &&
            this.preopenQueue.length < MAX_PREOPEN_QUEUE
        ) {
            this.preopenQueue.push(chunk);
        }
    }

    public sendText(text: string): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'TEXT', text } satisfies ClientMessage));
        }
    }

    public close(code = 1000, reason = 'user ended session'): void {
        const socket = this.ws;
        this.ws = null;
        this.preopenQueue = [];
        if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
            try {
                socket.send(JSON.stringify({ type: 'CLOSE' } satisfies ClientMessage));
            } catch {
                /* already closing */
            }
            try {
                socket.close(code, reason);
            } catch {
                /* ignore */
            }
        }
    }

    public get isConnected(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }

    public get isConnecting(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.CONNECTING;
    }

    private dispatchFrame(frame: ServerFrame): void {
        switch (frame.type) {
            case 'session_ready':
                this.events.onSessionReady?.(frame.model, frame.voice);
                break;
            case 'gemini_event':
                this.events.onGeminiEvent?.(frame.data);
                break;
            case 'tool_result':
                this.events.onToolResult?.(frame.name, frame.sql, frame.payload, frame.id);
                break;
            case 'turn_formatted':
                this.events.onTurnFormatted?.(frame);
                break;
            case 'session_ended':
                this.events.onSessionEnded?.(frame.reason, frame.message);
                break;
            case 'error':
                this.events.onError?.(frame.message || frame.code || 'Voice error', frame.code);
                break;
        }
    }
}
