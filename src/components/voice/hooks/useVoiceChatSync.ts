// =============================================================================
// src/components/voice/hooks/useVoiceChatSync.ts — Voice Turn Message Reconciler
// =============================================================================

import { useEffect } from 'react';
import type { VoiceMessage } from '../types';

export function useVoiceChatSync(
    voiceMessages: VoiceMessage[],
    setLocalMessages: React.Dispatch<React.SetStateAction<any[]>>,
    agentMode?: boolean,
): void {
    useEffect(() => {
        if (!voiceMessages || voiceMessages.length === 0) return;

        for (const vm of voiceMessages) {
            if (!vm.isInterim && vm.text.trim()) {
                setLocalMessages((prev) => {
                    const existingIdx = prev.findIndex((m) => m.id === vm.id);
                    if (existingIdx !== -1) {
                        const existing = prev[existingIdx];
                        if (
                            existing.content !== vm.text ||
                            existing.creditsUsed !== vm.creditsUsed ||
                            (vm.artifacts && !existing.artifacts)
                        ) {
                            return prev.map((m, idx) =>
                                idx === existingIdx
                                    ? {
                                          ...m,
                                          content: vm.text,
                                          artifacts: vm.artifacts ?? m.artifacts,
                                          creditsUsed: vm.creditsUsed ?? m.creditsUsed,
                                      }
                                    : m,
                            );
                        }
                        return prev;
                    }
                    return [
                        ...prev,
                        {
                            id: vm.id,
                            role: vm.role,
                            content: vm.text,
                            isAgent: vm.role === 'assistant' ? agentMode : undefined,
                            artifacts: vm.artifacts,
                            creditsUsed: vm.creditsUsed,
                        },
                    ];
                });
            }
        }
    }, [voiceMessages, agentMode, setLocalMessages]);
}
