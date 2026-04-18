import { Mic, MicOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSpeechToText } from '@/hooks/useSpeechToText';

interface MicButtonProps {
    onTranscript: (text: string, isFinal: boolean) => void;
    disabled?: boolean;
    className?: string;
}

export function MicButton({ onTranscript, disabled, className }: MicButtonProps) {
    const { status, isListening, isSupported, errorMessage, toggle } = useSpeechToText({
        onTranscript,
    });

    if (!isSupported) return null;

    const isProcessing = status === 'processing';
    const isError = status === 'error';

    return (
        <div className="relative flex items-center">
            <button
                type="button"
                onClick={toggle}
                disabled={disabled || isProcessing}
                title={
                    isListening
                        ? 'Stop recording'
                        : isError
                        ? errorMessage ?? 'Error'
                        : 'Start voice input'
                }
                className={cn(
                    'h-8 w-8 flex items-center justify-center rounded-lg transition-all duration-150',
                    isListening
                        ? 'text-red-500 bg-red-50 dark:bg-red-950/40'
                        : isError
                        ? 'text-amber-500'
                        : 'text-muted-foreground/50 hover:text-muted-foreground',
                    className,
                )}
            >
                {isProcessing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                ) : isListening ? (
                    /* pulsing ring + mic icon */
                    <span className="relative flex items-center justify-center">
                        <span className="absolute w-6 h-6 rounded-full bg-red-500/20 animate-ping" />
                        <Mic className="w-4 h-4 relative" />
                    </span>
                ) : isError ? (
                    <MicOff className="w-4 h-4" />
                ) : (
                    <Mic className="w-4 h-4" />
                )}
            </button>

            {/* Error tooltip */}
            {isError && errorMessage && (
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap bg-popover border border-border rounded-lg px-2.5 py-1.5 text-[11px] text-muted-foreground shadow-md pointer-events-none">
                    {errorMessage}
                </div>
            )}

            {/* Live indicator bar */}
            {isListening && (
                <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                    {[0, 1, 2, 3].map(i => (
                        <span
                            key={i}
                            className="w-0.5 rounded-full bg-red-500 animate-[soundbar_0.8s_ease-in-out_infinite]"
                            style={{
                                height: `${6 + (i % 3) * 3}px`,
                                animationDelay: `${i * 0.15}s`,
                            }}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
