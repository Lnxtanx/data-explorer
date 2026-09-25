// =============================================================================
// VoicePanel — Audio-Reactive Voice-to-Voice AI Session Control (Gemini Live)
//
// Integrates open-source audio-reactive voice orbs (VoiceOrbs: Iridescent Flow
// and Pulse Orb), wired directly to Gemini Live real-time bidirectional audio.
//
// Supports:
// • Audio-reactive amplitude driving both user mic and assistant output audio
// • Full state cycle: idle -> connecting -> listening -> speaking -> thinking -> error
// • Barge-in / interruption handling
// • Pinnable floating glassmorphism overlay with live subtitles & controls
// • Orb style switcher (Iridescent Flow WebGL Shader vs Pulse Orb CSS)
// =============================================================================

import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    Loader2,
    Mic,
    MicOff,
    PhoneOff,
    Pin,
    PinOff,
    Minimize2,
    Maximize2,
    Sparkles,
    Volume2,
    X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVoiceSession } from '@/hooks/useVoiceSession';
import { IridescentFlow, PulseOrb, type OrbState } from './orbs';
import { VoiceWaveformIcon } from './VoiceWaveformIcon';
import { Button } from '@/components/ui/button';
import { ActionTooltip } from '@/components/ui/tooltip';

interface VoicePanelProps {
    /** Correlation id for logs (and SQL scoping). Optional. */
    connectionId?: string;
    className?: string;
}

const STORAGE_VOICE_THEME_KEY = 'sw-data-explorer:voice-orb-theme';
const STORAGE_VOICE_PINNED_KEY = 'sw-data-explorer:voice-orb-pinned';

export default function VoicePanel({ connectionId, className }: VoicePanelProps) {
    const sessionIdRef = useRef<string>('');
    if (!sessionIdRef.current) {
        sessionIdRef.current =
            typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`;
    }

    const {
        isConnecting,
        isConnected,
        isTalking,
        isMuted,
        toggleMute,
        orbState,
        audioLevelRef,
        messages,
        error,
        startSession,
        endSession,
    } = useVoiceSession(connectionId || '', sessionIdRef.current);

    const [isStarting, setIsStarting] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [isPinned, setIsPinned] = useState<boolean>(() => {
        if (typeof window === 'undefined') return true;
        return localStorage.getItem(STORAGE_VOICE_PINNED_KEY) !== 'false';
    });
    const [orbTheme, setOrbTheme] = useState<'iridescent' | 'pulse'>(() => {
        if (typeof window === 'undefined') return 'iridescent';
        return (localStorage.getItem(STORAGE_VOICE_THEME_KEY) as 'iridescent' | 'pulse') || 'iridescent';
    });

    const busy = isConnecting || isStarting;

    const toggleSession = async () => {
        if (isConnected || busy) {
            endSession();
            return;
        }
        setIsStarting(true);
        try {
            await startSession();
        } finally {
            setIsStarting(false);
        }
    };

    const handleTogglePin = () => {
        setIsPinned((prev) => {
            const next = !prev;
            try {
                localStorage.setItem(STORAGE_VOICE_PINNED_KEY, String(next));
            } catch {}
            return next;
        });
    };

    const handleSwitchTheme = (theme: 'iridescent' | 'pulse') => {
        setOrbTheme(theme);
        try {
            localStorage.setItem(STORAGE_VOICE_THEME_KEY, theme);
        } catch {}
    };

    // Latest active transcript message for live subtitle
    const latestMessage = messages.length > 0 ? messages[messages.length - 1] : null;

    // Status description
    const statusLabel = error
        ? 'Voice Error'
        : busy
        ? 'Connecting to Resona Live…'
        : isTalking
        ? 'Resona Speaking'
        : isMuted
        ? 'Microphone Muted'
        : 'Listening to you…';

    return (
        <>
            {/* Toolbar Entry Point Button */}
            <div className="relative flex items-center">
                <ActionTooltip
                    label={
                        error
                            ? 'Voice Error'
                            : isConnected
                            ? 'End Resona Voice'
                            : busy
                            ? 'Connecting Voice…'
                            : 'Start Resona Voice'
                    }
                    side="top"
                >
                    <button
                        type="button"
                        onClick={() => void toggleSession()}
                        aria-label={isConnected ? 'End Resona Voice' : 'Start Resona Voice'}
                        className={cn(
                            'h-8 w-8 flex items-center justify-center rounded-full transition-all duration-200 select-none cursor-pointer border',
                            isConnected
                                ? 'bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/30 ring-2 ring-primary/20 scale-105'
                                : error
                                ? 'text-rose-500 border-rose-500/30 bg-rose-500/10'
                                : 'text-muted-foreground/80 hover:text-foreground border-transparent hover:bg-muted/80 hover:scale-105 active:scale-95',
                            className,
                        )}
                    >
                        {busy ? (
                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        ) : (
                            <VoiceWaveformIcon
                                isAnimated={isTalking}
                                className={cn(
                                    'w-4 h-4',
                                    isConnected ? 'text-primary-foreground' : 'text-current',
                                )}
                            />
                        )}
                    </button>
                </ActionTooltip>
            </div>

            {/* Floating / Pinned Voice AI Orb Overlay */}
            {(isConnected || busy) &&
                typeof document !== 'undefined' &&
                createPortal(
                    <aside
                        aria-label="Voice conversation session"
                        className={cn(
                            'fixed z-50 transition-all duration-300 ease-out select-none',
                            isPinned
                                ? 'bottom-5 right-5'
                                : 'bottom-6 left-1/2 -translate-x-1/2',
                        )}
                    >
                        <div
                            className={cn(
                                'backdrop-blur-2xl bg-card/95 border border-border shadow-2xl rounded-2xl overflow-hidden transition-all duration-300',
                                isMinimized ? 'w-72 p-3' : 'w-88 sm:w-96 p-5',
                            )}
                        >
                            {/* Header: Title, Status, Window Controls */}
                            <div className="flex items-center justify-between gap-2 mb-3">
                                <div className="flex items-center gap-2 min-w-0">
                                    <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                        <Sparkles className="w-3.5 h-3.5 text-primary" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-xs font-semibold text-foreground tracking-tight flex items-center gap-1.5">
                                            <span>Resona Live Voice</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1">
                                    {/* Theme switcher */}
                                    <ActionTooltip label="Orb Style" sublabel="Switch between 3D WebGL Shader and Pulse CSS" side="top">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                handleSwitchTheme(
                                                    orbTheme === 'iridescent' ? 'pulse' : 'iridescent',
                                                )
                                            }
                                            className="h-6 px-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground bg-muted/60 hover:bg-muted rounded-md border border-border/50 transition-colors"
                                        >
                                            {orbTheme === 'iridescent' ? '3D Shader' : 'Pulse CSS'}
                                        </button>
                                    </ActionTooltip>

                                    {/* Pin toggle */}
                                    <ActionTooltip label={isPinned ? 'Unpin Window' : 'Pin to Corner'} sublabel={isPinned ? 'Float in center' : 'Keep docked to bottom corner'} side="top">
                                        <button
                                            type="button"
                                            onClick={handleTogglePin}
                                            className={cn(
                                                'h-6 w-6 flex items-center justify-center rounded-md transition-colors',
                                                isPinned
                                                    ? 'text-primary bg-primary/15'
                                                    : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                                            )}
                                        >
                                            {isPinned ? <Pin className="w-3 h-3" /> : <PinOff className="w-3 h-3" />}
                                        </button>
                                    </ActionTooltip>

                                    {/* Minimize / Maximize */}
                                    <ActionTooltip label={isMinimized ? 'Expand Orb' : 'Minimize View'} side="top">
                                        <button
                                            type="button"
                                            onClick={() => setIsMinimized(!isMinimized)}
                                            className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                        >
                                            {isMinimized ? (
                                                <Maximize2 className="w-3 h-3" />
                                            ) : (
                                                <Minimize2 className="w-3 h-3" />
                                            )}
                                        </button>
                                    </ActionTooltip>

                                    {/* End Session */}
                                    <ActionTooltip label="End Session" sublabel="Disconnect live voice call" side="top">
                                        <button
                                            type="button"
                                            onClick={endSession}
                                            className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors ml-0.5"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </ActionTooltip>
                                </div>
                            </div>

                            {/* Status Indicator Pill */}
                            <div className="flex items-center justify-between px-2.5 py-1 mb-4 rounded-full bg-muted/50 border border-border/50 text-[11px]">
                                <div className="flex items-center gap-1.5">
                                    <span className="relative flex h-2 w-2">
                                        {busy ? (
                                            <span className="animate-spin inline-flex h-full w-full rounded-full border border-sky-400 border-t-transparent" />
                                        ) : isTalking ? (
                                            <>
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                                            </>
                                        ) : isMuted ? (
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                                        ) : (
                                            <>
                                                <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                                            </>
                                        )}
                                    </span>
                                    <span className="font-medium text-foreground">{statusLabel}</span>
                                </div>

                                {isTalking && (
                                    <span className="text-[10px] text-primary/80 font-mono">
                                        24kHz audio
                                    </span>
                                )}
                            </div>

                            {/* Central Audio-Reactive Voice Orb */}
                            <div
                                className={cn(
                                    'flex flex-col items-center justify-center transition-all duration-300',
                                    isMinimized ? 'my-1' : 'my-4',
                                )}
                            >
                                {orbTheme === 'iridescent' ? (
                                    <IridescentFlow
                                        state={orbState}
                                        size={isMinimized ? 72 : 160}
                                        speed={1.1}
                                        colorFrom="#38bdf8"
                                        colorTo="#a855f7"
                                        levelRef={audioLevelRef}
                                    />
                                ) : (
                                    <PulseOrb
                                        state={orbState}
                                        size={isMinimized ? 72 : 160}
                                        speed={1.0}
                                        colorFrom="#38bdf8"
                                        colorTo="#22d3ee"
                                        levelRef={audioLevelRef}
                                    />
                                )}
                            </div>

                            {/* Live Subtitle Transcript (Expanded view only) */}
                            {!isMinimized && (
                                <div className="mt-3 mb-4 min-h-[44px] max-h-24 overflow-y-auto px-3 py-2 rounded-xl bg-background/80 border border-border/60 text-xs shadow-inner">
                                    {latestMessage ? (
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                                <span>{latestMessage.role === 'user' ? 'You' : 'Resona'}</span>
                                                {latestMessage.isInterim && (
                                                    <span className="text-primary font-normal animate-pulse">
                                                        (speaking…)
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-foreground/90 leading-relaxed font-sans">
                                                {latestMessage.text}
                                            </p>
                                        </div>
                                    ) : (
                                        <p className="text-muted-foreground text-center italic py-2">
                                            Speak to ask Resona questions about your data…
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Bottom Controls Bar */}
                            <div className="flex items-center justify-center gap-2 pt-2 border-t border-border/40">
                                {/* Mic Mute Toggle */}
                                <ActionTooltip label={isMuted ? 'Unmute Microphone' : 'Mute Microphone'} side="top">
                                    <Button
                                        type="button"
                                        variant={isMuted ? 'destructive' : 'secondary'}
                                        size="sm"
                                        onClick={toggleMute}
                                        className="h-8 px-3 gap-1.5 rounded-full text-xs"
                                    >
                                        {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                                        <span>{isMuted ? 'Unmute' : 'Mute'}</span>
                                    </Button>
                                </ActionTooltip>

                                {/* End Voice Call Button */}
                                <ActionTooltip label="End Voice Call" sublabel="Disconnect live session" side="top">
                                    <Button
                                        type="button"
                                        variant="destructive"
                                        size="sm"
                                        onClick={endSession}
                                        className="h-8 px-3.5 gap-1.5 rounded-full text-xs bg-rose-600 hover:bg-rose-700 text-white shadow-xs"
                                    >
                                        <PhoneOff className="w-3.5 h-3.5" />
                                        <span>End Session</span>
                                    </Button>
                                </ActionTooltip>
                            </div>
                        </div>
                    </aside>,
                    document.body,
                )}
        </>
    );
}
