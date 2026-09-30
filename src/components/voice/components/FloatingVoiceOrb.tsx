// =============================================================================
// FloatingVoiceOrb — always-available voice presence, draggable anywhere.
//
// Rendered through a portal to document.body so it escapes the chat panel's
// overflow and stacking context, and so it survives the view switch (the
// session itself lives in VoiceSessionProvider).
//
// Interaction contract — the orb is one element doing three jobs, so they must
// not fight:
//   drag            -> move (pointermove past a small threshold)
//   click           -> toggle minimised / expanded
//   double-click    -> swap orb renderer (was the ONLY job the orb had before)
// A drag is distinguished from a click by movement distance, so a shaky click
// never re-parks the orb.
// =============================================================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Mic, MicOff, PhoneOff, Maximize2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IridescentFlow, PulseOrb } from '../orbs';
import { paletteFor } from '../orbs/orb-state';
import { useWebGLSupport } from '../orbs/use-webgl-support';
import { useOptionalVoiceSessionContext } from '../hooks/VoiceSessionProvider';
import {
    ORB_SIZE as SIZE,
    isDrag,
    loadPos,
    savePos,
    snap,
    defaultPos,
    type Pos,
} from '../orbs/orb-position';

export interface FloatingVoiceOrbProps {
    isOutsideChat?: boolean;
    onExpand?: () => void;
}

export const FloatingVoiceOrb: React.FC<FloatingVoiceOrbProps> = ({
    isOutsideChat = false,
    onExpand,
}) => {
    const voice = useOptionalVoiceSessionContext();
    const webgl = useWebGLSupport();
    const [useShader, setUseShader] = useState(true);
    const [pos, setPos] = useState<Pos | null>(null);
    const [dragging, setDragging] = useState(false);
    const [hovered, setHovered] = useState(false);

    // null until measured, so we never flash at 0,0 on mount.
    const posRef = useRef<Pos | null>(null);
    const originRef = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
    const movedRef = useRef(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    // Restore, then snap — a position saved on a wider monitor must not strand
    // the orb off-screen here.
    useEffect(() => {
        const saved = loadPos();
        const p = saved
            ? snap(saved, window.innerWidth, window.innerHeight)
            : defaultPos(window.innerWidth, window.innerHeight);
        setPos(p); posRef.current = p;
    }, []);

    // Re-clamp on resize/orientation change.
    useEffect(() => {
        const onResize = () => {
            if (!posRef.current) return;
            const p = snap(posRef.current, window.innerWidth, window.innerHeight);
            posRef.current = p; setPos(p);
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const onPointerDown = useCallback((e: React.PointerEvent) => {
        if (!pos) return;
        (e.target as Element).setPointerCapture?.(e.pointerId);
        originRef.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y };
        movedRef.current = false;
        setDragging(true);
    }, [pos]);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        const o = originRef.current;
        if (!o) return;
        if (!movedRef.current && !isDrag(o.px, o.py, e.clientX, e.clientY)) return;
        movedRef.current = true;
        const p = { x: o.x + (e.clientX - o.px), y: o.y + (e.clientY - o.py) };
        posRef.current = p; setPos(p);
    }, []);

    const onPointerUp = useCallback(() => {
        if (!posRef.current) { setDragging(false); return; }
        // Snap + persist only on release, so the orb does not fight the cursor
        // mid-drag and the stored position is the final one.
        const p = snap(posRef.current, window.innerWidth, window.innerHeight);
        posRef.current = p; setPos(p);
        savePos(p);
        setDragging(false);
        originRef.current = null;
    }, []);

    if (!mounted || !voice) return null;
    // Nothing to show until a call is live — the orb is a session affordance,
    // not decoration. The mic button in the composer still starts a call.
    if (!voice.isActive) return null;

    // The floating orb is ONLY visible when minimized or when the user is outside
    // the chat view (e.g. browsing the explorer or dashboard). If the expanded
    // in-stream overlay is actively mounted, the floating orb must NOT show.
    const isMinimized = voice.presence === 'minimized';
    const shouldShowFloating = isMinimized || isOutsideChat || !voice.isOverlayMounted;
    if (!shouldShowFloating) return null;

    const palette = paletteFor(voice.orbState);
    const isWebGL = webgl && useShader;

    const handleExpand = () => {
        voice.setPresence('expanded');
        onExpand?.();
    };

    const onClick = () => {
        // A drag that ends over the orb must not also toggle presence.
        if (movedRef.current) { movedRef.current = false; return; }
        handleExpand();
    };

    return createPortal(
        <div
            className="fixed z-[9998] select-none animate-in fade-in zoom-in-95 duration-200"
            style={{ left: pos?.x, top: pos?.y, width: SIZE, height: SIZE }}
        >
            <div
                role="button"
                tabIndex={0}
                aria-label={voice?.isConnecting ? "Connecting to Resona Voice..." : "Voice chat minimised — click to expand, drag to move"}
                title={voice?.isConnecting ? "Connecting to Resona Voice..." : "Click to expand · Drag to move"}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onClick={onClick}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
                    // Arrows nudge, so the orb is reachable without a pointer.
                    const step = e.shiftKey ? 40 : 12;
                    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        e.preventDefault();
                        if (!pos) return;
                        const p = snap({
                            x: pos.x + (e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0),
                            y: pos.y + (e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0),
                        }, window.innerWidth, window.innerHeight);
                        posRef.current = p; setPos(p);
                        savePos(p);
                    }
                }}
                onDoubleClick={() => setUseShader((v) => !v)}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                className={cn(
                    'relative w-full h-full rounded-full flex items-center justify-center cursor-grab',
                    dragging && 'cursor-grabbing',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/70',
                )}
                style={{ touchAction: 'none' }}
            >
                {/* State halo, from the same palette as the orb */}
                <div
                    className="absolute inset-0 rounded-full blur-xl -z-10 transition-colors duration-500"
                    style={{ background: palette.glow }}
                />

                {isWebGL ? (
                    <IridescentFlow
                        state={voice.orbState}
                        levelRef={voice.audioLevelRef}
                        size={SIZE}
                        className="w-full h-full drop-shadow-2xl"
                    />
                ) : (
                    <PulseOrb
                        state={voice.orbState}
                        levelRef={voice.audioLevelRef}
                        size={SIZE}
                        className="w-full h-full drop-shadow-2xl"
                    />
                )}

                {/* Microphone / Connecting state */}
                {voice?.isConnecting ? (
                    <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-xs">
                        <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
                    </span>
                ) : voice.isMuted ? (
                    <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/35">
                        <MicOff className="w-4 h-4 text-white" />
                    </span>
                ) : null}

                {/* Controls appear on hover/focus so the orb stays clean. */}
                <div
                    className={cn(
                        'absolute -right-1 -top-1 flex gap-1 transition-opacity duration-200',
                        hovered ? 'opacity-100' : 'opacity-0 focus-within:opacity-100',
                    )}
                >
                    <button
                        type="button"
                        aria-label={voice.isMuted ? 'Unmute microphone' : 'Mute microphone'}
                        onClick={(e) => { e.stopPropagation(); voice.toggleMute(); }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="w-6 h-6 rounded-full bg-background border border-border shadow flex items-center justify-center hover:bg-muted cursor-pointer"
                    >
                        {voice.isMuted ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                    </button>
                    <button
                        type="button"
                        aria-label="End voice call"
                        onClick={(e) => { e.stopPropagation(); voice.endSession(); }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="w-6 h-6 rounded-full bg-destructive text-destructive-foreground border border-border shadow flex items-center justify-center hover:opacity-90 cursor-pointer"
                    >
                        <PhoneOff className="w-3 h-3" />
                    </button>
                </div>

                {/* Expand affordance — always available on the floating orb */}
                <button
                    type="button"
                    aria-label="Expand voice chat"
                    title="Expand voice chat"
                    onClick={(e) => {
                        e.stopPropagation();
                        handleExpand();
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="absolute -bottom-1 -left-1 w-6 h-6 rounded-full bg-background border border-border shadow flex items-center justify-center hover:bg-muted cursor-pointer transition-transform hover:scale-110 active:scale-95"
                >
                    <Maximize2 className="w-3 h-3 text-foreground" />
                </button>
            </div>
        </div>,
        document.body,
    );
};
