// =============================================================================
// VoiceSessionProvider — owns the Gemini Live socket ABOVE the view switch.
//
// Why this exists: `useVoiceSession` closes the socket and tears down the
// microphone on unmount, and `DataExplorerLayout` unmounts `AIChatMain` whenever
// the view leaves 'ai'. So before this, switching to Data Explorer or the
// Dashboard killed a live voice call. Minimising the chat is impossible while
// the session is owned by a component that unmounts.
//
// The provider is mounted once, above the view ternary, so the socket survives
// tab switches. Only the VOICE state lives here — the chat view still mounts
// and unmounts normally. Transcript merging stays in the chat view, which
// consumes `voiceMessages` from context rather than owning the session.
// =============================================================================
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useVoiceSession } from './useVoiceSession';
import type { OrbState } from '../orbs/orb-state';

export interface VoiceSessionContextValue {
    isActive: boolean;
    isConnecting: boolean;
    isConnected: boolean;
    isTalking: boolean;
    isMuted: boolean;
    orbState: OrbState;
    audioLevelRef: React.MutableRefObject<number>;
    messages: ReturnType<typeof useVoiceSession>['messages'];
    startSession: () => Promise<void>;
    endSession: () => void;
    toggleMute: () => void;
    /** 'expanded' = orb + full control bar; 'minimized' = orb only. */
    presence: 'expanded' | 'minimized';
    setPresence: (p: 'expanded' | 'minimized') => void;
    /** Tracks whether the expanded voice overlay is currently active and rendered in the DOM. */
    isOverlayMounted: boolean;
    setIsOverlayMounted: (mounted: boolean) => void;
    /** Chats a voice turn is bound to, so a minimised call still has a home. */
    sessionChatId: string | null;
    setSessionChatId: (id: string | null) => void;
    sessionUserName: string | null;
    setSessionUserName: (name: string | null) => void;
}

const VoiceSessionContext = createContext<VoiceSessionContextValue | null>(null);

export interface VoiceSessionProviderProps {
    connectionId?: string;
    children: React.ReactNode;
}

const newSessionId = () => (
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `voice_${Date.now()}`
);

export function VoiceSessionProvider({ connectionId, children }: VoiceSessionProviderProps) {
    // Bound to whichever chat the caller hands us; the provider itself does not
    // create a chat, so starting a call from a minimised orb is the caller's job.
    const [voiceSessionId, setVoiceSessionId] = useState<string>(newSessionId);
    const [sessionChatId, setSessionChatId] = useState<string | null>(null);
    const [sessionUserName, setSessionUserName] = useState<string | null>(null);
    const [presence, setPresence] = useState<'expanded' | 'minimized'>('expanded');
    const [isOverlayMounted, setIsOverlayMounted] = useState<boolean>(false);

    useEffect(() => {
        if (sessionChatId) setVoiceSessionId(sessionChatId);
    }, [sessionChatId]);

    const session = useVoiceSession(connectionId || '', voiceSessionId, sessionUserName ?? undefined);

    const value = useMemo<VoiceSessionContextValue>(() => ({
        isActive: session.isConnected || session.isConnecting,
        isConnecting: session.isConnecting,
        isConnected: session.isConnected,
        isTalking: session.isTalking,
        isMuted: session.isMuted,
        orbState: session.orbState,
        audioLevelRef: session.audioLevelRef,
        messages: session.messages,
        startSession: session.startSession,
        endSession: session.endSession,
        toggleMute: session.toggleMute,
        presence,
        setPresence,
        isOverlayMounted,
        setIsOverlayMounted,
        sessionChatId,
        setSessionChatId,
        sessionUserName,
        setSessionUserName,
    }), [
        session.isConnected, session.isConnecting, session.isTalking, session.isMuted,
        session.orbState, session.audioLevelRef, session.messages,
        session.startSession, session.endSession, session.toggleMute,
        presence, isOverlayMounted, sessionChatId, sessionUserName,
    ]);

    return <VoiceSessionContext.Provider value={value}>{children}</VoiceSessionContext.Provider>;
}

/** Throws outside the provider — a missing provider means the orb would read a
 *  dead session, so fail loudly rather than silently showing a disabled orb. */
export function useVoiceSessionContext(): VoiceSessionContextValue {
    const ctx = useContext(VoiceSessionContext);
    if (!ctx) throw new Error('useVoiceSessionContext must be used inside <VoiceSessionProvider>');
    return ctx;
}

/** Non-throwing variant for components that render regardless (e.g. the orb
 *  shell itself, which must not crash a view that has no provider yet). */
export function useOptionalVoiceSessionContext(): VoiceSessionContextValue | null {
    return useContext(VoiceSessionContext);
}
