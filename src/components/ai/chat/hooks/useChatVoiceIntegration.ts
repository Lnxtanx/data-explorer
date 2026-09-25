// =============================================================================
// src/components/ai/chat/hooks/useChatVoiceIntegration.ts
// Encapsulates Gemini Live voice session, sync, toggling, and interim bubble merging
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useVoiceSession, useVoiceChatSync } from '@/components/voice';
import type { LocalMessage } from '../types';

interface UseChatVoiceIntegrationOptions {
    connectionId?: string;
    chatId?: string | null;
    userName?: string;
    agentMode: boolean;
    setLocalMessages: React.Dispatch<React.SetStateAction<LocalMessage[]>>;
    onChatCreated?: (chatId: string) => void;
    justCreatedChatRef: React.MutableRefObject<boolean>;
}

export function useChatVoiceIntegration({
    connectionId,
    chatId,
    userName,
    agentMode,
    setLocalMessages,
    onChatCreated,
    justCreatedChatRef,
}: UseChatVoiceIntegrationOptions) {
    const [isTypeOpen, setIsTypeOpen] = useState(false);
    const [voiceSessionId, setVoiceSessionId] = useState<string>(() => (
        chatId || (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`)
    ));

    useEffect(() => {
        if (chatId) setVoiceSessionId(chatId);
    }, [chatId]);

    const {
        isConnecting: isVoiceConnecting,
        isConnected: isVoiceConnected,
        isTalking: isVoiceTalking,
        isMuted: isVoiceMuted,
        toggleMute: toggleVoiceMute,
        orbState: voiceOrbState,
        audioLevelRef: voiceAudioLevelRef,
        messages: voiceMessages,
        startSession: startVoiceSession,
        endSession: endVoiceSession,
    } = useVoiceSession(connectionId || '', voiceSessionId, userName);

    const isVoiceActive = isVoiceConnected || isVoiceConnecting;

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
            ? voiceMessages.find(m => m.isInterim && m.text.trim())
            : null;

        const finalMessages = [...displayMessages];
        if (activeInterimVoiceMessage && !finalMessages.some(m => m.id === activeInterimVoiceMessage.id)) {
            finalMessages.push({
                id: activeInterimVoiceMessage.id,
                role: activeInterimVoiceMessage.role,
                content: activeInterimVoiceMessage.text,
                isStreaming: true,
                isAgent: activeInterimVoiceMessage.role === 'assistant' ? agentMode : undefined,
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
    };
}
