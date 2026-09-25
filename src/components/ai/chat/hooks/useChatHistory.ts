// =============================================================================
// src/components/ai/chat/hooks/useChatHistory.ts
// Handles chat switching, message history rehydration, and pagination
// =============================================================================

import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { getChatMessages } from '../../api/index';
import type { LocalMessage } from '../types';
import { mapDbMessageToLocal } from '../utils/messageMapper';

interface UseChatHistoryOptions {
    chatId?: string | null;
    chatHistory: any;
    isChatError: boolean;
    isVoiceActive?: boolean;
    onNewChat?: () => void;
    onResetStreamAndAgent: () => void;
}

export function useChatHistory({
    chatId,
    chatHistory,
    isChatError,
    isVoiceActive = false,
    onNewChat,
    onResetStreamAndAgent,
}: UseChatHistoryOptions) {
    const [localMessages, setLocalMessages] = useState<LocalMessage[]>([]);
    const [hasMoreOlder, setHasMoreOlder] = useState(false);
    const [oldestCursor, setOldestCursor] = useState<string | null>(null);
    const [isLoadingOlder, setIsLoadingOlder] = useState(false);

    const prevChatIdRef = useRef<string | null | undefined>(undefined);
    const justCreatedChatRef = useRef(false);

    // Synchronize local messages when chatId or chatHistory changes
    useEffect(() => {
        if (!chatId) {
            prevChatIdRef.current = null;
            setLocalMessages([]);
            setHasMoreOlder(false);
            setOldestCursor(null);
            onResetStreamAndAgent();
            return;
        }

        const isNavigating = chatId !== prevChatIdRef.current && !justCreatedChatRef.current;
        if (isNavigating && chatHistory?.messages && chatHistory.chat?.id === chatId) {
            const chatUseCase = (chatHistory.chat as any)?.use_case || (chatHistory.chat as any)?.useCase;
            if (chatUseCase && chatUseCase !== 'data_explorer' && chatUseCase !== 'general') {
                toast.error('This conversation belongs to Dashboard AI and cannot be viewed in Resona AI Explorer.');
                onNewChat?.();
                return;
            }

            prevChatIdRef.current = chatId;
            setLocalMessages(
                chatHistory.messages
                    .filter((m: any) => m.role !== 'system')
                    .map((m: any, idx: number, arr: any[]) => mapDbMessageToLocal(m, idx, arr))
            );
            setHasMoreOlder(Boolean(chatHistory.hasMore));
            setOldestCursor(chatHistory.oldestCursor ?? null);
            onResetStreamAndAgent();
        } else if (justCreatedChatRef.current && chatId) {
            prevChatIdRef.current = chatId;
            justCreatedChatRef.current = false;
        }
    }, [chatId, chatHistory, onNewChat, onResetStreamAndAgent]);

    // Handle error loading chat conversation
    useEffect(() => {
        if (isChatError && chatId && !justCreatedChatRef.current && !isVoiceActive) {
            if (localMessages.length === 0) return;
            toast.error('Unable to load chat conversation.');
            onNewChat?.();
        }
    }, [isChatError, chatId, onNewChat, isVoiceActive, localMessages.length]);

    // Load older messages for infinite scroll / pagination
    const handleLoadOlderMessages = useCallback(async () => {
        if (!chatId || !oldestCursor || isLoadingOlder) return;
        setIsLoadingOlder(true);
        try {
            const olderRes = await getChatMessages(chatId, { before: oldestCursor, limit: 30 });
            if (olderRes && olderRes.messages && olderRes.messages.length > 0) {
                const olderLocal = olderRes.messages
                    .filter(m => m.role !== 'system')
                    .map((m, idx, arr) => mapDbMessageToLocal(m, idx, arr));
                setLocalMessages(prev => [...olderLocal, ...prev]);
                setHasMoreOlder(Boolean(olderRes.hasMore));
                setOldestCursor(olderRes.oldestCursor ?? null);
            } else {
                setHasMoreOlder(false);
            }
        } catch (err) {
            logger.warn('[useChatHistory] Failed to load older messages:', err);
        } finally {
            setIsLoadingOlder(false);
        }
    }, [chatId, oldestCursor, isLoadingOlder]);

    const isChatReady = Boolean(chatId && chatHistory && chatHistory.chat?.id === chatId);
    const isSwitchingChat = Boolean(chatId && chatId !== prevChatIdRef.current && !justCreatedChatRef.current && !isChatReady);

    return {
        localMessages,
        setLocalMessages,
        hasMoreOlder,
        isLoadingOlder,
        handleLoadOlderMessages,
        justCreatedChatRef,
        isSwitchingChat,
    };
}

