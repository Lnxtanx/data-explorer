// =============================================================================
// src/components/voice/types.ts — Native Gemini Live Voice Protocol & State Types
// =============================================================================

import type React from 'react';
import type { OrbState } from './orbs/orb-state';
import type { AgentToolStep, AgentArtifact } from '../ai/types';

export interface VoiceMessage {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    isInterim?: boolean;
    turnIndex?: number;
    sql?: string;
    toolSteps?: AgentToolStep[];
    artifacts?: AgentArtifact[];
    creditsUsed?: number;
    wasInterrupted?: boolean;
}

export interface GeminiEvent {
    server_content?: {
        model_turn?: { parts?: Array<{ inline_data?: { data?: string } }> } | null;
        input_transcription?: { text?: string; finished?: boolean } | null;
        output_transcription?: { text?: string; finished?: boolean } | null;
        interrupted?: boolean;
        turn_complete?: boolean;
    } | null;
    tool_call?: {
        function_calls?: Array<{
            id?: string;
            name?: string;
            args?: Record<string, any>;
        }>;
    } | null;
}

export type ServerFrame =
    | { type: 'session_ready'; model?: string; voice?: string }
    | { type: 'gemini_event'; data: GeminiEvent }
    | { type: 'tool_result'; id?: string; name?: string; sql?: string; payload?: any }
    | {
          type: 'turn_formatted';
          turn_index?: number;
          content?: string;
          artifacts?: any[];
          toolSteps?: AgentToolStep[];
          credits_charged?: number;
          was_interrupted?: boolean;
      }
    | { type: 'error'; code?: string; message?: string }
    | { type: 'session_ended'; reason?: string; message?: string };

export type ClientMessage =
    | { type: 'AUDIO_CHUNK'; data: string; mime: string }
    | { type: 'TEXT'; text: string }
    | { type: 'CLOSE' };

export interface ToolCallInfo {
    name?: string;
    args?: any;
}

export interface UseVoiceSessionReturn {
    /** Socket open / media starting, Gemini not ready yet (session_pending). */
    isConnecting: boolean;
    isConnected: boolean;
    isTalking: boolean;
    isThinking: boolean;
    toolCallInfo: ToolCallInfo | null;
    isMuted: boolean;
    toggleMute: () => void;
    orbState: OrbState;
    audioLevelRef: React.MutableRefObject<number>;
    messages: VoiceMessage[];
    error: string | null;
    startSession: () => Promise<void>;
    endSession: () => void;
}

