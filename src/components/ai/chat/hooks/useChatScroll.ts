// =============================================================================
// src/components/ai/chat/hooks/useChatScroll.ts
// Handles scroll positioning, auto-scrolling, bottom detection, and turn observer
// =============================================================================

import { useState, useRef, useEffect, useCallback } from 'react';
import type { LocalMessage } from '../types';

interface UseChatScrollOptions {
    chatId?: string | null;
    localMessages: LocalMessage[];
    isStreaming: boolean;
    displayMessages: LocalMessage[];
    showWorkspace: boolean;
    showDashboard: boolean;
    hasExpandedArtifact: boolean;
}

export function useChatScroll({
    chatId,
    localMessages,
    isStreaming,
    displayMessages,
    showWorkspace,
    showDashboard,
    hasExpandedArtifact,
}: UseChatScrollOptions) {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const [isAtBottom, setIsAtBottom] = useState(true);
    const [hasNewMessages, setHasNewMessages] = useState(false);
    const [activeTurnId, setActiveTurnId] = useState<string | null>(null);

    const lastScrollTopRef = useRef<number>(0);
    const wasAtBottomRef = useRef<boolean>(true);

    // Scroll handling and bottom detection
    const handleScroll = useCallback(() => {
        const el = scrollContainerRef.current;
        if (!el) return;
        lastScrollTopRef.current = el.scrollTop;
        const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        const atBottom = distanceToBottom < 120;
        setIsAtBottom(atBottom);
        wasAtBottomRef.current = atBottom;
        if (atBottom) {
            setHasNewMessages(false);
        }
    }, []);

    // When new messages arrive or streaming updates
    useEffect(() => {
        if (wasAtBottomRef.current) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        } else {
            setHasNewMessages(true);
        }
    }, [localMessages, isStreaming]);

    // When switching chats, reset to bottom
    useEffect(() => {
        wasAtBottomRef.current = true;
        setHasNewMessages(false);
        const t = setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
        }, 60);
        return () => clearTimeout(t);
    }, [chatId]);

    // When side panels toggle (Workspace, Dashboard, Artifact), preserve scroll position
    useEffect(() => {
        const el = scrollContainerRef.current;
        if (!el) return;
        const wasAtBottom = wasAtBottomRef.current;
        const savedTop = lastScrollTopRef.current;

        const t = setTimeout(() => {
            if (wasAtBottom) {
                messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
            } else if (el) {
                el.scrollTop = savedTop;
            }
        }, 50);
        return () => clearTimeout(t);
    }, [showWorkspace, showDashboard, hasExpandedArtifact]);

    // Turn navigation handlers
    const handleSelectTurn = useCallback((turnId: string) => {
        const el = document.getElementById(`turn-${turnId}`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setActiveTurnId(turnId);
        }
    }, []);

    const handleScrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        setIsAtBottom(true);
        wasAtBottomRef.current = true;
        setHasNewMessages(false);
    }, []);

    const handleScrollToTop = useCallback(() => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, []);

    // IntersectionObserver to track and highlight the currently visible user turn.
    const turnIdKey = displayMessages.map(m => m.id).join('|');
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const turnElements = container.querySelectorAll<HTMLElement>('[data-turn-id]');
        if (turnElements.length === 0) return;

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        const id = entry.target.getAttribute('data-turn-id');
                        if (id) {
                            setActiveTurnId(id);
                        }
                    }
                }
            },
            {
                root: container,
                rootMargin: '0px 0px -60% 0px',
                threshold: 0.1,
            }
        );

        turnElements.forEach(el => observer.observe(el));
        return () => observer.disconnect();
    }, [turnIdKey]);

    return {
        scrollContainerRef,
        messagesEndRef,
        isAtBottom,
        hasNewMessages,
        activeTurnId,
        handleScroll,
        handleScrollToBottom,
        handleScrollToTop,
        handleSelectTurn,
    };
}
