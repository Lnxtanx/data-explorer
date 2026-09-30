// =============================================================================
// VoiceOrbStage — Floating Midway Audio-Reactive Voice Orb (ChatGPT / Claude Style)
//
// Positioned in the lower-middle viewport above the voice action bar.
// Displays the fluid 3D WebGL IridescentFlow orb (or PulseOrb fallback)
// reactive to user speech mic energy and Gemini Live 24kHz audio output.
// =============================================================================

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { IridescentFlow, PulseOrb } from '../orbs';
import type { OrbState } from '../orbs/orb-state';
import { paletteFor } from '../orbs/orb-state';
import { useWebGLSupport } from '../orbs/use-webgl-support';

interface VoiceOrbStageProps {
    orbState: OrbState;
    audioLevelRef: React.MutableRefObject<number>;
    isCompact?: boolean;
    size?: 'hero' | 'docked';
    className?: string;
}

export const VoiceOrbStage: React.FC<VoiceOrbStageProps> = ({
    orbState,
    audioLevelRef,
    isCompact = false,
    size = 'hero',
    className,
}) => {
    const webglSupported = useWebGLSupport();
    const [useShaderOrb, setUseShaderOrb] = useState<boolean>(true);

    const isWebGL = webglSupported && useShaderOrb;
    const isDocked = size === 'docked';

    // Orb dimension based on display variant and whether "+ Type" input is expanded
    const orbSize = isCompact ? 68 : isDocked ? 112 : 160;

    return (
        <div
            className={cn(
                'relative flex flex-col items-center justify-center transition-all duration-300 pointer-events-none select-none',
                isDocked ? 'my-1' : 'my-3',
                className
            )}
        >
            {/* Ambient glow, tinted from the SAME palette as the orb. It used to
                be hard-coded per state (emerald/amber/sky) while the orb stayed
                purple, so the halo contradicted the orb instead of supporting
                it. Deriving both from `paletteFor` keeps them in agreement. */}
            <div
                className={cn(
                    'absolute rounded-full blur-3xl pointer-events-none transition-all duration-700 -z-10',
                    isCompact ? 'w-24 h-24' : isDocked ? 'w-36 h-36' : 'w-56 h-56',
                )}
                style={{ background: paletteFor(orbState).glow }}
            />

            {/* Centered Audio-Reactive Orb Container */}
            <div
                className={cn(
                    'relative rounded-full flex items-center justify-center cursor-pointer pointer-events-auto transition-transform duration-300 hover:scale-105 active:scale-95',
                    isCompact ? 'w-[68px] h-[68px]' : isDocked ? 'w-28 h-28' : 'w-40 h-40'
                )}
                title="Click to toggle Orb renderer style"
                onClick={() => setUseShaderOrb((prev) => !prev)}
            >
                {isWebGL ? (
                    <IridescentFlow
                        state={orbState}
                        levelRef={audioLevelRef}
                        size={orbSize}
                        className="w-full h-full drop-shadow-2xl"
                    />
                ) : (
                    <PulseOrb
                        state={orbState}
                        levelRef={audioLevelRef}
                        size={orbSize}
                        className="w-full h-full drop-shadow-2xl"
                    />
                )}
            </div>
        </div>
    );
};
