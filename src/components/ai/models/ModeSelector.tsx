import { useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ActionTooltip } from '@/components/ui/tooltip';

// AgentMode now has a single canonical declaration in @/lib/modes (Phase 2).
// Re-exported so the 4 existing `from './ModeSelector'` importers and the
// API modules stay unchanged.
export type { AgentMode } from '@/lib/modes';
import type { AgentMode } from '@/lib/modes';

interface ModeSelectorProps {
    mode: AgentMode;
    thinking: boolean;
    disabled?: boolean;
    onModeChange: (mode: AgentMode) => void;
    onThinkingChange: (thinking: boolean) => void;
}

/**
 * Compact, minimalist Mode & Thinking Selector for Data Explorer AI.
 * - Deep mode defaults thinking to ON (toggleable).
 * - Flash mode defaults thinking to OFF (toggleable).
 * - Trigger button displays a minimal dot when thinking is enabled to save space.
 */
export function ModeSelector({
    mode,
    thinking,
    disabled,
    onModeChange,
    onThinkingChange,
}: ModeSelectorProps) {
    const [open, setOpen] = useState(false);

    const isFlash = mode === 'flash';
    const isDeep = mode === 'deep';

    const handleSelectMode = (newMode: AgentMode) => {
        onModeChange(newMode);
        if (newMode === 'deep') {
            onThinkingChange(true);
        } else {
            onThinkingChange(false);
        }
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <ActionTooltip
                disabled={open}
                label={isFlash ? 'Flash mode' : 'Deep mode'}
                side="top"
            >
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        disabled={disabled}
                        className={cn(
                            'h-7 inline-flex items-center gap-1.5 px-2.5 rounded-lg text-xs font-medium select-none transition-colors cursor-pointer',
                            'bg-muted/50 hover:bg-muted text-foreground/80 hover:text-foreground border border-border/50',
                            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                            open && 'bg-muted border-border',
                            disabled && 'opacity-40 cursor-not-allowed',
                        )}
                        aria-label={`Select model mode: current is ${mode}`}
                    >
                        <span className="capitalize">{mode}</span>
                        {thinking && (
                            <span
                                className="w-1.5 h-1.5 rounded-full bg-primary shrink-0"
                                aria-label="Thinking active"
                            />
                        )}
                        <ChevronDown
                            className={cn(
                                'w-3 h-3 text-muted-foreground/60 transition-transform duration-150',
                                open && 'rotate-180',
                            )}
                        />
                    </button>
                </PopoverTrigger>
            </ActionTooltip>

            <PopoverContent
                side="top"
                align="end"
                sideOffset={6}
                className="w-44 p-1 rounded-lg bg-popover/98 backdrop-blur-sm border border-border/80 shadow-lg z-[120]"
            >
                {/* Model options */}
                <div className="space-y-0.5">
                    <button
                        type="button"
                        onClick={() => handleSelectMode('flash')}
                        className={cn(
                            'w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors text-left',
                            isFlash
                                ? 'bg-accent text-accent-foreground'
                                : 'text-foreground/80 hover:bg-muted/70 hover:text-foreground',
                        )}
                    >
                        <span>Flash</span>
                        {isFlash && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                    </button>

                    <button
                        type="button"
                        onClick={() => handleSelectMode('deep')}
                        className={cn(
                            'w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors text-left',
                            isDeep
                                ? 'bg-accent text-accent-foreground'
                                : 'text-foreground/80 hover:bg-muted/70 hover:text-foreground',
                        )}
                    >
                        <span>Deep</span>
                        {isDeep && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                    </button>
                </div>

                {/* Divider */}
                <div className="my-1 h-px bg-border/50" />

                {/* Thinking switch row (interactive for both Flash & Deep) */}
                <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onThinkingChange(!thinking)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onThinkingChange(!thinking);
                        }
                    }}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs cursor-pointer hover:bg-muted/70 transition-colors select-none"
                >
                    <span className="font-medium text-foreground/90">Thinking</span>
                    <div
                        className={cn(
                            'w-7 h-4 rounded-full p-0.5 transition-colors duration-150 flex items-center shrink-0',
                            thinking ? 'bg-primary' : 'bg-muted-foreground/30',
                        )}
                    >
                        <div
                            className={cn(
                                'w-3 h-3 rounded-full bg-background shadow-sm transition-transform duration-150',
                                thinking ? 'translate-x-3' : 'translate-x-0',
                            )}
                        />
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}