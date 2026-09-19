import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ArrowDown, ArrowUp, X, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LocalMessage } from './types';

export interface UserTurn {
    id: string;
    index: number;
    content: string;
    timestamp?: string | number;
}

interface TurnNavigatorProps {
    messages: LocalMessage[];
    activeTurnId?: string | null;
    isAtBottom: boolean;
    hasNewMessages?: boolean;
    onSelectTurn: (turnId: string) => void;
    onScrollToBottom: () => void;
    onScrollToTop: () => void;
}

export function TurnNavigator({
    messages,
    activeTurnId,
    isAtBottom,
    hasNewMessages = false,
    onSelectTurn,
    onScrollToBottom,
    onScrollToTop,
}: TurnNavigatorProps) {
    const [popoverOpen, setPopoverOpen] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);
    const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Extract user prompts / turns in chronological order
    const userTurns: UserTurn[] = useMemo(() => {
        const turns: UserTurn[] = [];
        let count = 0;
        for (const m of messages) {
            if (m.role === 'user') {
                count += 1;
                turns.push({
                    id: m.id,
                    index: count,
                    content: m.content || '',
                    timestamp: m.createdAt,
                });
            }
        }
        return turns;
    }, [messages]);

    // Handle mouse enter over rail or popover (ChatGPT behavior: opens on hover)
    const handleMouseEnter = () => {
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
        }
        setPopoverOpen(true);
    };

    // Handle mouse leave with graceful delay
    const handleMouseLeave = () => {
        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = setTimeout(() => {
            setPopoverOpen(false);
        }, 250);
    };

    // Close popover on outside click
    useEffect(() => {
        if (!popoverOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                setPopoverOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [popoverOpen]);

    // Close popover on Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && popoverOpen) {
                setPopoverOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [popoverOpen]);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        };
    }, []);

    const handleTurnClick = (id: string) => {
        onSelectTurn(id);
        setPopoverOpen(false);
    };

    // If less than 2 user turns, do not show the timeline rail to keep UI uncluttered
    const showTimelineRail = userTurns.length >= 2;

    return (
        <>
            {/* ── Timeline Rail & Hover Popover (ChatGPT Style) ────────────────── */}
            {showTimelineRail && (
                <div
                    ref={popoverRef}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                    className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 z-20 flex flex-col items-end"
                >
                    {/* Vertical Dash Rail (hover or click opens popover; no extra icon button) */}
                    <div
                        onClick={() => setPopoverOpen(prev => !prev)}
                        className="flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-full bg-background/70 hover:bg-background/95 backdrop-blur-md border border-border/30 hover:border-border/60 transition-all shadow-xs cursor-pointer group"
                        title="Conversation turns (hover to preview)"
                        role="button"
                        tabIndex={0}
                        aria-label="Conversation turn navigation"
                    >
                        <div className="flex flex-col items-center gap-1 px-0.5">
                            {userTurns.map(turn => {
                                const isActive = activeTurnId === turn.id;
                                const promptPreview = turn.content.replace(/\s+/g, ' ').trim();

                                return (
                                    <div key={turn.id} className="relative flex items-center justify-end">
                                        {/* Dash line */}
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleTurnClick(turn.id);
                                            }}
                                            className={cn(
                                                "h-[3px] rounded-full transition-all duration-200 cursor-pointer block",
                                                isActive
                                                    ? "w-4 bg-primary shadow-xs"
                                                    : "w-2 bg-muted-foreground/30 hover:w-3.5 hover:bg-muted-foreground/80 group-hover:bg-muted-foreground/60"
                                            )}
                                            aria-label={`Jump to turn ${turn.index}: ${promptPreview}`}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Floating Popover Turn Menu (Opens on hover or click) */}
                    {popoverOpen && (
                        <div className="absolute right-7 top-1/2 -translate-y-1/2 w-72 sm:w-80 rounded-2xl bg-popover/95 backdrop-blur-lg border border-border/80 shadow-2xl overflow-hidden flex flex-col z-30 animate-in fade-in-0 zoom-in-95 duration-150">
                            {/* Popover Header */}
                            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border/40 bg-muted/20">
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                                    <MessageSquare className="w-3.5 h-3.5 text-primary" />
                                    <span>Conversation Turns</span>
                                    <span className="text-[11px] text-muted-foreground font-normal">
                                        ({userTurns.length})
                                    </span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onScrollToTop();
                                            setPopoverOpen(false);
                                        }}
                                        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
                                        title="Jump to beginning"
                                        aria-label="Jump to top"
                                    >
                                        <ArrowUp className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onScrollToBottom();
                                            setPopoverOpen(false);
                                        }}
                                        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
                                        title="Jump to latest"
                                        aria-label="Jump to latest"
                                    >
                                        <ArrowDown className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPopoverOpen(false)}
                                        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors ml-1 cursor-pointer"
                                        title="Close"
                                        aria-label="Close"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>

                            {/* Scrollable Turn List */}
                            <div className="max-h-72 overflow-y-auto p-1.5 space-y-0.5 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full">
                                {userTurns.map(turn => {
                                    const isActive = activeTurnId === turn.id;
                                    const promptText = turn.content.replace(/\s+/g, ' ').trim() || 'Prompt';

                                    return (
                                        <button
                                            key={turn.id}
                                            type="button"
                                            onClick={() => handleTurnClick(turn.id)}
                                            className={cn(
                                                "w-full text-left px-2.5 py-1.5 rounded-xl text-xs flex items-start gap-2.5 transition-colors cursor-pointer group",
                                                isActive
                                                    ? "bg-primary/10 text-primary font-medium"
                                                    : "hover:bg-muted/60 text-foreground/85"
                                            )}
                                        >
                                            <span
                                                className={cn(
                                                    "text-[10px] font-mono px-1.5 py-0.5 rounded-md shrink-0 mt-0.5",
                                                    isActive
                                                        ? "bg-primary text-primary-foreground font-semibold"
                                                        : "bg-muted text-muted-foreground group-hover:text-foreground"
                                                )}
                                            >
                                                #{turn.index}
                                            </span>
                                            <span className="truncate flex-1 leading-relaxed" title={promptText}>
                                                {promptText}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Icon-Only Floating Scroll-to-Bottom Button ────────────────── */}
            {!isAtBottom && (
                <div className="absolute bottom-24 right-4 sm:right-6 z-20 animate-in fade-in-0 slide-in-from-bottom-2 duration-200">
                    <button
                        type="button"
                        onClick={onScrollToBottom}
                        className={cn(
                            "relative w-8 h-8 rounded-full shadow-lg border flex items-center justify-center transition-all duration-150 cursor-pointer backdrop-blur-md",
                            hasNewMessages
                                ? "bg-primary text-primary-foreground border-primary/40 hover:bg-primary/90 shadow-primary/25"
                                : "bg-background/90 text-muted-foreground hover:text-foreground border-border/60 hover:border-border hover:bg-muted/60"
                        )}
                        title={hasNewMessages ? "New response — Scroll to bottom" : "Scroll to bottom"}
                        aria-label="Scroll to bottom"
                    >
                        <ArrowDown className="w-4 h-4 shrink-0" />
                        {hasNewMessages && (
                            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary ring-2 ring-background animate-pulse" />
                        )}
                    </button>
                </div>
            )}
        </>
    );
}
