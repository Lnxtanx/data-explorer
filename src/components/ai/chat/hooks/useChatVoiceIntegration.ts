// =============================================================================
// src/components/ai/chat/hooks/useChatVoiceIntegration.ts
// Chat-side glue for the Gemini Live voice session.
//
// The SOCKET itself is owned by VoiceSessionProvider (mounted above the view
// switch). This hook used to call useVoiceSession directly, which meant a
// second socket whenever the provider was present — and, more importantly,
// meant the call died with AIChatMain on every tab change. It now reads the
// shared session and only owns what is chat-specific: binding the live call to
// the chat being viewed, and committing finished voice turns into the
// transcript.
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useVoiceChatSync } from '@/components/voice';
import { useOptionalVoiceSessionContext } from '@/components/voice/hooks/VoiceSessionProvider';
import type { LocalMessage } from '../types';

interface UseChatVoiceIntegrationOptions {
    chatId?: string | null;
    userName?: string;
    agentMode: boolean;
    setLocalMessages: React.Dispatch<React.SetStateAction<LocalMessage[]>>;
    onChatCreated?: (chatId: string) => void;
    justCreatedChatRef: React.MutableRefObject<boolean>;
}

export function useChatVoiceIntegration({
    chatId,
    userName,
    agentMode,
    setLocalMessages,
    onChatCreated,
    justCreatedChatRef,
}: UseChatVoiceIntegrationOptions) {
    const [isTypeOpen, setIsTypeOpen] = useState(false);
    const shared = useOptionalVoiceSessionContext();
    const dummyAudioLevelRef = useRef<number>(0);

    // Destructure the setters: they are stable useState identities. Depending on
    // the whole context object instead would re-run these effects on every
    // context change, and the greeting depends on userName reaching the socket.
    const setSessionChatId = shared?.setSessionChatId;
    const setSessionUserName = shared?.setSessionUserName;

    // Bind the live call to the chat the user is looking at. A chat switch while
    // a call is live re-points the session rather than tearing it down.
    useEffect(() => {
        if (chatId && setSessionChatId) setSessionChatId(chatId);
    }, [chatId, setSessionChatId]);

    // The gateway greets by name ("Hey Vivek!"). If this lands late the greeting
    // degrades to "Hey there", so set it as soon as the chat view mounts.
    useEffect(() => {
        if (userName && setSessionUserName) setSessionUserName(userName);
    }, [userName, setSessionUserName]);

    const isVoiceActive = shared?.isActive ?? false;
    const isVoiceConnecting = shared?.isConnecting ?? false;
    const isVoiceConnected = shared?.isConnected ?? false;
    const isVoiceTalking = shared?.isTalking ?? false;
    const isVoiceMuted = shared?.isMuted ?? false;
    const toggleVoiceMute = shared?.toggleMute ?? (() => {});
    const voiceOrbState = shared?.orbState ?? 'idle';
    const voiceAudioLevelRef = shared?.audioLevelRef ?? dummyAudioLevelRef;
    const voiceMessages = shared?.messages ?? [];
    const startVoiceSession = shared?.startSession ?? (async () => {});
    const endVoiceSession = shared?.endSession ?? (() => {});
    const voiceSessionId = shared?.sessionChatId ?? null;

    const handleToggleVoice = useCallback(async () => {
        if (isVoiceActive) {
            endVoiceSession();
            return;
        }
        if (!chatId && voiceSessionId) {
            justCreatedChatRef.current = true;
            onChatCreated?.(voiceSessionId);
        }
        await startVoiceSession();
    }, [isVoiceActive, endVoiceSession, startVoiceSession, chatId, voiceSessionId, onChatCreated, justCreatedChatRef]);

    // Commit finalized voice turns to localMessages
    useVoiceChatSync(voiceMessages, setLocalMessages, agentMode);

    // Merge active interim voice transcription into display messages
    const getFinalDisplayMessages = useCallback((displayMessages: LocalMessage[]): LocalMessage[] => {
        const activeInterimVoiceMessage = isVoiceActive
            ? voiceMessages.find(m => m.isInterim && (m.text.trim() || (m.toolSteps && m.toolSteps.length > 0)))
            : null;

        const finalMessages = displayMessages.map(m => {
            if (activeInterimVoiceMessage && m.id === activeInterimVoiceMessage.id) {
                return {
                    ...m,
                    content: activeInterimVoiceMessage.text,
                    isStreaming: true,
                    isAgent: activeInterimVoiceMessage.role === 'assistant' ? agentMode : undefined,
                    sql: activeInterimVoiceMessage.sql ?? m.sql,
                    toolSteps: activeInterimVoiceMessage.toolSteps ?? m.toolSteps,
                    artifacts: activeInterimVoiceMessage.artifacts ?? m.artifacts,
                };
            }
            return m;
        });

        if (activeInterimVoiceMessage && !finalMessages.some(m => m.id === activeInterimVoiceMessage.id)) {
            finalMessages.push({
                id: activeInterimVoiceMessage.id,
                role: activeInterimVoiceMessage.role,
                content: activeInterimVoiceMessage.text,
                isStreaming: true,
                isAgent: activeInterimVoiceMessage.role === 'assistant' ? agentMode : undefined,
                sql: activeInterimVoiceMessage.sql,
                toolSteps: activeInterimVoiceMessage.toolSteps,
                artifacts: activeInterimVoiceMessage.artifacts,
            });
        }
        return finalMessages;
    }, [isVoiceActive, voiceMessages, agentMode]);

    return {
        isVoiceActive,
        isVoiceConnecting,
        isVoiceConnected,
        isVoiceTalking,
        isVoiceMuted,
        toggleVoiceMute,
        voiceOrbState,
        voiceAudioLevelRef,
        voiceMessages,
        startVoiceSession,
        endVoiceSession,
        handleToggleVoice,
        isTypeOpen,
        setIsTypeOpen,
        getFinalDisplayMessages,
        presence: shared?.presence ?? 'expanded',
        setPresence: shared?.setPresence ?? (() => {}),
    };
}
