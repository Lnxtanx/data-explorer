// =============================================================================
// src/components/voice/components/VoiceSessionOverlay.tsx
// Unified Voice Session Visualizer & Control Bar Container
// =============================================================================

import React from 'react';
import { VoiceOrbStage } from './VoiceOrbStage';
import { VoiceControlBar } from './VoiceControlBar';
import type { OrbState } from '../orbs/orb-state';

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
    variant?: 'hero' | 'docked';
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
    variant = 'docked',
    children,
    className = '',
}) => {
    if (!isActive) return null;

    if (variant === 'hero') {
        return (
            <div className={`flex-1 overflow-y-auto flex flex-col items-center justify-center px-4 py-8 select-none ${className}`}>
                <div className="w-full max-w-xl flex flex-col items-center text-center">
                    <VoiceOrbStage
                        orbState={orbState}
                        audioLevelRef={audioLevelRef}
                        isCompact={isTypeOpen}
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
                        />
                        {children}
                    </div>
                </div>
            </div>
        );
    }

    // Default: 'docked' bottom overlay during ongoing chat stream
    return (
        <div className={`fixed bottom-0 left-0 right-0 z-30 p-4 pointer-events-none flex flex-col items-center ${className}`}>
            <VoiceOrbStage
                orbState={orbState}
                audioLevelRef={audioLevelRef}
                isCompact={isTypeOpen}
                className="pointer-events-auto"
            />
            <div className="w-full max-w-3xl flex flex-col gap-2 pointer-events-auto">
                <VoiceControlBar
                    orbState={orbState}
                    isMuted={isMuted}
                    isConnecting={isConnecting}
                    isTalking={isTalking}
                    isTypeOpen={isTypeOpen}
                    onToggleType={onToggleType}
                    onToggleMute={onToggleMute}
                    onEndSession={onEndSession}
                />
                {children}
            </div>
        </div>
    );
};
