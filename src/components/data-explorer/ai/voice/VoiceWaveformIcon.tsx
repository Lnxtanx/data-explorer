import React from 'react';
import { cn } from '@/lib/utils';

export interface VoiceWaveformIconProps {
    className?: string;
    isAnimated?: boolean;
    barColor?: string;
    variant?: 'bars-4' | 'bars-5';
}

/**
 * VoiceWaveformIcon — Modern audio waveform bars representing Live Voice-to-Voice AI.
 *
 * Designed to align with the cognitive mental models established by:
 * - ChatGPT Voice Mode (4 vertical rounded waveform bars)
 * - Claude AI Voice Mode (5 vertical audio spectrum bars)
 *
 * Completely replaces misleading radio/broadcast antenna icons (`((o))`)
 * and differentiates interactive voice conversations from simple mic dictation.
 */
export function VoiceWaveformIcon({
    className,
    isAnimated = false,
    barColor,
    variant = 'bars-4',
}: VoiceWaveformIconProps) {
    if (variant === 'bars-5') {
        // Claude AI style: 5 symmetric audio frequency bars (6, 11, 16, 11, 6)
        return (
            <svg
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className={cn('w-4 h-4 shrink-0 transition-transform duration-200 select-none', className)}
                aria-hidden="true"
            >
                <rect
                    x="2"
                    y="7"
                    width="2"
                    height="6"
                    rx="1"
                    fill={barColor || 'currentColor'}
                    className={cn(
                        'transition-all duration-200 [transform-box:fill-box] origin-center',
                        isAnimated && 'animate-[soundbar_0.8s_ease-in-out_infinite]'
                    )}
                />
                <rect
                    x="5.5"
                    y="4.5"
                    width="2"
                    height="11"
                    rx="1"
                    fill={barColor || 'currentColor'}
                    className={cn(
                        'transition-all duration-200 [transform-box:fill-box] origin-center',
                        isAnimated && 'animate-[soundbar_1.1s_ease-in-out_infinite_0.15s]'
                    )}
                />
                <rect
                    x="9"
                    y="2"
                    width="2"
                    height="16"
                    rx="1"
                    fill={barColor || 'currentColor'}
                    className={cn(
                        'transition-all duration-200 [transform-box:fill-box] origin-center',
                        isAnimated && 'animate-[soundbar_0.9s_ease-in-out_infinite_0.3s]'
                    )}
                />
                <rect
                    x="12.5"
                    y="4.5"
                    width="2"
                    height="11"
                    rx="1"
                    fill={barColor || 'currentColor'}
                    className={cn(
                        'transition-all duration-200 [transform-box:fill-box] origin-center',
                        isAnimated && 'animate-[soundbar_1.0s_ease-in-out_infinite_0.2s]'
                    )}
                />
                <rect
                    x="16"
                    y="7"
                    width="2"
                    height="6"
                    rx="1"
                    fill={barColor || 'currentColor'}
                    className={cn(
                        'transition-all duration-200 [transform-box:fill-box] origin-center',
                        isAnimated && 'animate-[soundbar_0.75s_ease-in-out_infinite_0.4s]'
                    )}
                />
            </svg>
        );
    }

    // ChatGPT style: 4 vertical soundwave bars (7, 15, 11, 6)
    return (
        <svg
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={cn('w-4 h-4 shrink-0 transition-transform duration-200 select-none', className)}
            aria-hidden="true"
        >
            <rect
                x="2.5"
                y="6.5"
                width="2.25"
                height="7"
                rx="1.125"
                fill={barColor || 'currentColor'}
                className={cn(
                    'transition-all duration-200 [transform-box:fill-box] origin-center',
                    isAnimated && 'animate-[soundbar_0.8s_ease-in-out_infinite]'
                )}
            />
            <rect
                x="6.75"
                y="2.5"
                width="2.25"
                height="15"
                rx="1.125"
                fill={barColor || 'currentColor'}
                className={cn(
                    'transition-all duration-200 [transform-box:fill-box] origin-center',
                    isAnimated && 'animate-[soundbar_1.1s_ease-in-out_infinite_0.15s]'
                )}
            />
            <rect
                x="11"
                y="4.5"
                width="2.25"
                height="11"
                rx="1.125"
                fill={barColor || 'currentColor'}
                className={cn(
                    'transition-all duration-200 [transform-box:fill-box] origin-center',
                    isAnimated && 'animate-[soundbar_0.9s_ease-in-out_infinite_0.3s]'
                )}
            />
            <rect
                x="15.25"
                y="7"
                width="2.25"
                height="6"
                rx="1.125"
                fill={barColor || 'currentColor'}
                className={cn(
                    'transition-all duration-200 [transform-box:fill-box] origin-center',
                    isAnimated && 'animate-[soundbar_1.0s_ease-in-out_infinite_0.1s]'
                )}
            />
        </svg>
    );
}
