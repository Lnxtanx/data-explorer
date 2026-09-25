// =============================================================================
// src/components/voice/hooks/useVoiceAudioLevel.ts — Audio Level Polling Hook
// =============================================================================

import { useEffect, useRef } from 'react';
import type { VoiceAudioRecorder } from '../audio/voice-audio-recorder';

export function useVoiceAudioLevel(
    recorderRef: React.MutableRefObject<VoiceAudioRecorder | null>,
    isActive: boolean,
) {
    const audioLevelRef = useRef<number>(0);

    useEffect(() => {
        if (!isActive) {
            audioLevelRef.current = 0;
            return;
        }

        let animationFrameId: number;
        const updateLevel = () => {
            if (recorderRef.current) {
                audioLevelRef.current = recorderRef.current.getAudioLevel();
            } else {
                audioLevelRef.current = 0;
            }
            animationFrameId = requestAnimationFrame(updateLevel);
        };

        animationFrameId = requestAnimationFrame(updateLevel);

        return () => {
            cancelAnimationFrame(animationFrameId);
            audioLevelRef.current = 0;
        };
    }, [isActive, recorderRef]);

    return audioLevelRef;
}
