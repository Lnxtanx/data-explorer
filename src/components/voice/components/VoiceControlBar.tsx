// =============================================================================
// VoiceControlBar — In-Stream Bottom Voice Action Bar (ChatGPT / Claude Style)
//
// Replaces or docks alongside the standard textarea when Resona Voice is active.
// Provides:
// • '+ Type' toggle: allows user to type text / attach files without closing voice
// • Live voice status with animated waveform equalizer bars
// • Microphone mute / unmute toggle
// • End Voice button ('✕')
// =============================================================================

import React from 'react';
import { Mic, MicOff, X, Keyboard, Loader2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionTooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { OrbState } from '../orbs/orb-state';

interface VoiceControlBarProps {
    orbState: OrbState;
    isMuted: boolean;
    isConnecting: boolean;
    isTalking: boolean;
    isTypeOpen: boolean;
    onToggleType: () => void;
    onToggleMute: () => void;
    onEndSession: () => void;
    onMinimize?: () => void;
    className?: string;
}

export const VoiceControlBar: React.FC<VoiceControlBarProps> = ({
    orbState,
    isMuted,
    isConnecting,
    isTalking,
    isTypeOpen,
    onToggleType,
    onToggleMute,
    onEndSession,
    onMinimize,
    className,
}) => {
    // Dynamic indicator dot and equalizer color reflecting active state
    const getIndicatorStyle = () => {
        if (isConnecting) {
            return {
                dot: 'bg-amber-500 animate-pulse shadow-sm shadow-amber-500/50',
                bar: 'bg-amber-500/60',
            };
        }
        if (isMuted) {
            return {
                dot: 'bg-rose-500 shadow-sm shadow-rose-500/40',
                bar: 'bg-rose-500/40',
            };
        }
        if (orbState === 'thinking') {
            return {
                dot: 'bg-amber-500 animate-ping shadow-sm shadow-amber-500/50',
                bar: 'bg-amber-500',
            };
        }
        if (isTalking || orbState === 'speaking') {
            return {
                dot: 'bg-sky-500 animate-pulse shadow-sm shadow-sky-500/50',
                bar: 'bg-sky-500',
            };
        }
        return {
            dot: 'bg-emerald-500 animate-pulse shadow-sm shadow-emerald-500/50',
            bar: 'bg-emerald-500',
        };
    };

    const indicator = getIndicatorStyle();

    return (
        <div
            className={cn(
                'w-full max-w-3xl mx-auto rounded-2xl border border-border/80 bg-background/95 dark:bg-card/95',
                'backdrop-blur-xl shadow-lg px-4 py-2.5 flex items-center justify-between gap-4 transition-all duration-200 select-none',
                className
            )}
        >
            {/* Left: '+ Type' toggle */}
            <div className="flex items-center gap-2">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onToggleType}
                    className={cn(
                        'h-9 px-3 text-xs font-medium rounded-xl gap-2 transition-colors',
                        isTypeOpen
                            ? 'bg-primary/10 text-primary hover:bg-primary/15'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/80'
                    )}
                >
                    <Keyboard className="w-4 h-4" />
                    <span>{isTypeOpen ? 'Hide Input' : '+ Type'}</span>
                </Button>
            </div>

            {/* Middle: Visual state & status indicator */}
            <div className="flex items-center gap-2.5">
                <span className={cn('w-2 h-2 rounded-full transition-colors duration-300 shrink-0', indicator.dot)} />

                {isConnecting && (
                    <span className="text-xs font-medium text-amber-600 dark:text-amber-400 tracking-wide animate-pulse select-none">
                        Connecting...
                    </span>
                )}

                {/* Animated soundbar equalizer */}
                <div className="flex items-center gap-0.5 h-4">
                    <span className={cn('w-0.5 h-2 rounded-full transition-all duration-300', indicator.bar, !isMuted && !isConnecting && 'animate-[soundbar_0.8s_ease-in-out_infinite]')} />
                    <span className={cn('w-0.5 h-3.5 rounded-full transition-all duration-300', indicator.bar, !isMuted && !isConnecting && 'animate-[soundbar_0.6s_ease-in-out_infinite_0.1s]')} />
                    <span className={cn('w-0.5 h-1.5 rounded-full transition-all duration-300', indicator.bar, !isMuted && !isConnecting && 'animate-[soundbar_0.9s_ease-in-out_infinite_0.2s]')} />
                    <span className={cn('w-0.5 h-3 rounded-full transition-all duration-300', indicator.bar, !isMuted && !isConnecting && 'animate-[soundbar_0.7s_ease-in-out_infinite_0.15s]')} />
                    <span className={cn('w-0.5 h-2 rounded-full transition-all duration-300', indicator.bar, !isMuted && !isConnecting && 'animate-[soundbar_0.85s_ease-in-out_infinite_0.25s]')} />
                </div>
            </div>

            {/* Right: Mute toggle, Minimize & End session button */}
            <div className="flex items-center gap-1.5 sm:gap-2">
                <ActionTooltip label={isMuted ? 'Unmute microphone' : 'Mute microphone'} side="top">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={onToggleMute}
                        disabled={isConnecting}
                        className={cn(
                            'w-9 h-9 rounded-xl transition-all cursor-pointer',
                            isMuted
                                ? 'bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 dark:hover:bg-rose-500/30'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/80'
                        )}
                    >
                        {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </Button>
                </ActionTooltip>

                {onMinimize && (
                    <ActionTooltip label="Minimize voice" side="top">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={onMinimize}
                            disabled={isConnecting}
                            className="w-9 h-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all cursor-pointer"
                        >
                            <Minimize2 className="w-4 h-4" />
                        </Button>
                    </ActionTooltip>
                )}

                <ActionTooltip label={isConnecting ? "Cancel connection" : "End Resona Voice"} side="top">
                    <Button
                        type="button"
                        variant="default"
                        size="icon"
                        onClick={onEndSession}
                        className="w-9 h-9 rounded-xl bg-foreground text-background hover:bg-foreground/90 transition-all shadow-sm cursor-pointer"
                    >
                        {isConnecting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <X className="w-4 h-4 stroke-[2.5]" />
                        )}
                    </Button>
                </ActionTooltip>
            </div>
        </div>
    );
};
