// =============================================================================
// src/components/ai/chat/hooks/usePinnedArtifacts.ts
// Handles pinned artifacts persistence in localStorage and expansion toggling
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import type { AgentArtifact } from '../../hooks/useAIAgent';
import { logger } from '@/lib/logger';

export function usePinnedArtifacts(chatId?: string | null, onOpenDashboard?: () => void) {
    const [expandedArtifact, setExpandedArtifact] = useState<AgentArtifact | null>(null);

    const handleToggleExpand = useCallback((artifact: AgentArtifact) => {
        setExpandedArtifact(prev => {
            if (!prev) return artifact;
            const isSame =
                prev === artifact ||
                (artifact.key && prev.key === artifact.key) ||
                (artifact.downloadUrl && prev.downloadUrl === artifact.downloadUrl) ||
                (artifact.id && prev.id === artifact.id) ||
                (artifact.fileName && prev.fileName === artifact.fileName);
            return isSame ? null : artifact;
        });
    }, []);

    const [dashboardArtifacts, setDashboardArtifacts] = useState<AgentArtifact[]>(() => {
        if (!chatId) return [];
        try {
            const raw = localStorage.getItem(`sw_pinned_${chatId}`);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    });

    useEffect(() => {
        if (!chatId) {
            setDashboardArtifacts([]);
            return;
        }
        try {
            const raw = localStorage.getItem(`sw_pinned_${chatId}`);
            setDashboardArtifacts(raw ? JSON.parse(raw) : []);
        } catch {
            setDashboardArtifacts([]);
        }
    }, [chatId]);

    const updateDashboardArtifacts = useCallback(
        (updater: AgentArtifact[] | ((prev: AgentArtifact[]) => AgentArtifact[])) => {
            setDashboardArtifacts(prev => {
                const next = typeof updater === 'function' ? updater(prev) : updater;
                if (chatId) {
                    try {
                        localStorage.setItem(`sw_pinned_${chatId}`, JSON.stringify(next));
                    } catch (e) {
                        logger.warn('[usePinnedArtifacts] Failed to save pinned artifacts:', e);
                    }
                }
                return next;
            });
        },
        [chatId]
    );

    const handlePinArtifact = useCallback(
        (a: AgentArtifact) => {
            updateDashboardArtifacts(prev => {
                const isPinned = prev.some(
                    p =>
                        (p.title && p.title === a.title) ||
                        (p.sql && p.sql === a.sql) ||
                        (p.downloadUrl && p.downloadUrl === a.downloadUrl)
                );
                if (isPinned) {
                    return prev.filter(
                        p =>
                            !(
                                (p.title && p.title === a.title) ||
                                (p.sql && p.sql === a.sql) ||
                                (p.downloadUrl && p.downloadUrl === a.downloadUrl)
                            )
                    );
                }
                return [...prev, a];
            });
            onOpenDashboard?.();
            setExpandedArtifact(null);
        },
        [updateDashboardArtifacts, onOpenDashboard]
    );

    const isPinnedArtifact = useCallback(
        (a: AgentArtifact) => {
            return dashboardArtifacts.some(
                p =>
                    (p.title && p.title === a.title) ||
                    (p.sql && p.sql === a.sql) ||
                    (p.downloadUrl && p.downloadUrl === a.downloadUrl)
            );
        },
        [dashboardArtifacts]
    );

    return {
        expandedArtifact,
        setExpandedArtifact,
        handleToggleExpand,
        dashboardArtifacts,
        updateDashboardArtifacts,
        handlePinArtifact,
        isPinnedArtifact,
    };
}
