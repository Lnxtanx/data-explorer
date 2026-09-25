// =============================================================================
// VoicePanel — Audio-Reactive Voice-to-Voice AI Session Trigger
//
// Clean entry button for Resona Live Voice (Gemini Live).
// Integrates directly into ChatInput; activates in-stream voice mode in AIChatMain
// without any detached floating windows or outdated popups.
// =============================================================================

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VoiceWaveformIcon } from './VoiceWaveformIcon';
import { ActionTooltip } from '@/components/ui/tooltip';

export interface VoicePanelProps {
    connectionId?: string;
    isActive?: boolean;
    isConnecting?: boolean;
    isTalking?: boolean;
    onToggle?: () => void;
    className?: string;
}

export default function VoicePanel({
    isActive = false,
    isConnecting = false,
    isTalking = false,
    onToggle,
    className,
}: VoicePanelProps) {
    const label = isConnecting
        ? 'Connecting to Resona Voice…'
        : isActive
        ? 'End Resona Voice'
        : 'Start Resona Voice';

    return (
        <div className="flex items-center">
            <ActionTooltip label={label} side="top">
                <button
                    type="button"
                    onClick={onToggle}
                    aria-label={label}
                    className={cn(
                        'h-8 w-8 flex items-center justify-center rounded-full transition-all duration-200 select-none cursor-pointer border',
                        isActive
                            ? 'bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/30 ring-2 ring-primary/20 scale-105'
                            : 'text-muted-foreground/80 hover:text-foreground border-transparent hover:bg-muted/80 hover:scale-105 active:scale-95',
                        className,
                    )}
                >
                    {isConnecting ? (
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    ) : (
                        <VoiceWaveformIcon
                            isAnimated={isTalking}
                            className={cn(
                                'w-4 h-4',
                                isActive ? 'text-primary-foreground' : 'text-current',
                            )}
                        />
                    )}
                </button>
            </ActionTooltip>
        </div>
    );
}
