// =============================================================================
// src/components/voice/components/VoiceSessionOverlay.tsx
// Unified Voice Session Visualizer & Control Bar Container
// =============================================================================

import React, { useEffect } from 'react';
import { VoiceOrbStage } from './VoiceOrbStage';
import { VoiceControlBar } from './VoiceControlBar';
import type { OrbState } from '../orbs/orb-state';
import { useOptionalVoiceSessionContext } from '../hooks/VoiceSessionProvider';

export interface VoiceSessionOverlayProps {
    isActive: boolean;
    orbState: OrbState;
    audioLevelRef: React.MutableRefObject<number>;
    isMuted: boolean;
    isConnecting: boolean;
    isTalking: boolean;
    isTypeOpen: boolean;
    onToggleType: () => void;
    onToggleMute: () => void;
    onEndSession: () => void;
    onMinimize?: () => void;
    variant?: 'hero' | 'docked';
    /** When 'minimized', the overlay renders nothing and FloatingVoiceOrb takes over. */
    presence?: 'expanded' | 'minimized';
    children?: React.ReactNode;
    className?: string;
}

export const VoiceSessionOverlay: React.FC<VoiceSessionOverlayProps> = ({
    isActive,
    orbState,
    audioLevelRef,
    isMuted,
    isConnecting,
    isTalking,
    isTypeOpen,
    onToggleType,
    onToggleMute,
    onEndSession,
    onMinimize,
    variant = 'docked',
    presence = 'expanded',
    children,
    className = '',
}) => {
    const voiceContext = useOptionalVoiceSessionContext();

    useEffect(() => {
        if (!isActive || presence === 'minimized') {
            voiceContext?.setIsOverlayMounted(false);
            return;
        }
        voiceContext?.setIsOverlayMounted(true);
        return () => {
            voiceContext?.setIsOverlayMounted(false);
        };
    }, [isActive, presence, voiceContext]);

    if (!isActive) return null;

    // Minimised means ONE orb: the floating one. Rendering the docked orb here
    // as well would leave two on screen, and the user only asked for the orb.
    if (presence === 'minimized') return null;

    if (variant === 'hero') {
        return (
            <div className={`flex-1 overflow-y-auto flex flex-col items-center justify-center px-4 py-8 select-none animate-in fade-in zoom-in-95 duration-300 ${className}`}>
                <div className="w-full max-w-xl flex flex-col items-center text-center">
                    <VoiceOrbStage
                        orbState={orbState}
                        audioLevelRef={audioLevelRef}
                        isCompact={isTypeOpen}
                        size="hero"
                    />
                    <div className="w-full mt-6">
                        <VoiceControlBar
                            orbState={orbState}
                            isMuted={isMuted}
                            isConnecting={isConnecting}
                            isTalking={isTalking}
                            isTypeOpen={isTypeOpen}
                            onToggleType={onToggleType}
                            onToggleMute={onToggleMute}
                            onEndSession={onEndSession}
                            onMinimize={onMinimize}
                        />
                        {children}
                    </div>
                </div>
            </div>
        );
    }

    // Default: 'docked' bottom overlay during ongoing chat stream
    return (
        <div className={`absolute bottom-0 left-0 right-0 z-30 p-4 pointer-events-none flex flex-col items-center animate-in fade-in slide-in-from-bottom-2 duration-300 ${className}`}>
            <VoiceOrbStage
                orbState={orbState}
                audioLevelRef={audioLevelRef}
                isCompact={isTypeOpen}
                size="docked"
                className="pointer-events-auto"
            />
            <div className="w-full max-w-3xl mx-auto flex flex-col gap-2 pointer-events-auto">
                <VoiceControlBar
                    orbState={orbState}
                    isMuted={isMuted}
                    isConnecting={isConnecting}
                    isTalking={isTalking}
                    isTypeOpen={isTypeOpen}
                    onToggleType={onToggleType}
                    onToggleMute={onToggleMute}
                    onEndSession={onEndSession}
                    onMinimize={onMinimize}
                />
                {children}
            </div>
        </div>
    );
};
