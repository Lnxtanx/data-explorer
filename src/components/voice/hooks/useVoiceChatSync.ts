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

        setLocalMessages((prev) => {
            let next = [...prev];
            let modified = false;

            for (const vm of voiceMessages) {
                if (!vm.isInterim && vm.text.trim()) {
                    const existingIdx = next.findIndex((m) => m.id === vm.id);
                    if (existingIdx !== -1) {
                        const existing = next[existingIdx];
                        if (
                            existing.content !== vm.text ||
                            existing.creditsUsed !== vm.creditsUsed ||
                            (vm.artifacts && !existing.artifacts) ||
                            (vm.wasInterrupted && !existing.wasInterrupted)
                        ) {
                            next[existingIdx] = {
                                ...existing,
                                content: vm.text,
                                artifacts: vm.artifacts ?? existing.artifacts,
                                creditsUsed: vm.creditsUsed ?? existing.creditsUsed,
                                wasInterrupted: vm.wasInterrupted ?? existing.wasInterrupted,
                            };
                            modified = true;
                        }
                    } else {
                        next.push({
                            id: vm.id,
                            role: vm.role,
                            content: vm.text,
                            isAgent: vm.role === 'assistant' ? agentMode : undefined,
                            artifacts: vm.artifacts,
                            creditsUsed: vm.creditsUsed,
                            wasInterrupted: vm.wasInterrupted,
                        });
                        modified = true;
                    }
                }
            }

            return modified ? next : prev;
        });
    }, [voiceMessages, agentMode, setLocalMessages]);
}
