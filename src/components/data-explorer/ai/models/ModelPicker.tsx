import { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAIModels } from '@/hooks/useAIModels';
import { TIER_STYLE, DEFAULT_MODEL_ID } from './modelConfig';
import type { ModelMeta } from './modelConfig';

interface ModelPickerProps {
    value: string;
    onChange: (id: string) => void;
}

export function ModelPicker({ value, onChange }: ModelPickerProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const { data: models = [], isLoading } = useAIModels();

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    // If saved model isn't in the list (plan changed), fall back to first available
    const selected: ModelMeta = models.find(m => m.id === value)
        ?? models[0]
        ?? { id: DEFAULT_MODEL_ID, name: 'GPT-4o mini', provider: 'OpenAI', color: '#10a37f', tier: 'Fast', multiplier: '1x', creditRate: 4 };

    // Group models by provider for the dropdown
    const providers = [...new Set(models.map(m => m.provider))];

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen(o => !o)}
                disabled={isLoading}
                className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/60 hover:text-foreground transition-colors rounded-md px-2 py-1 hover:bg-muted/50 disabled:opacity-40"
                title="Select AI model"
            >
                {isLoading && (
                    <Loader2 className="w-3 h-3 animate-spin" />
                )}
                <span>{selected.name}</span>
                <ChevronDown className="w-3 h-3 opacity-50" />
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="absolute bottom-[calc(100%+6px)] right-0 z-50 w-64 bg-popover border border-border rounded-xl shadow-xl overflow-hidden">
                        <div className="px-3 py-2 border-b border-border/40 bg-muted/20">
                            <p className="text-[10px] font-semibold tracking-widest text-muted-foreground/50 uppercase">MODEL</p>
                        </div>
                        <div className="py-1 max-h-80 overflow-y-auto">
                            {providers.map(provider => (
                                <div key={provider}>
                                    <p className="px-3 pt-2.5 pb-0.5 text-[9px] font-bold tracking-widest text-muted-foreground/40 uppercase">
                                        {provider}
                                    </p>
                                    {models.filter(m => m.provider === provider).map(model => (
                                        <button
                                            key={model.id}
                                            onClick={() => { onChange(model.id); setOpen(false); }}
                                            className={cn(
                                                'w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-muted',
                                                value === model.id ? 'bg-muted/60' : '',
                                            )}
                                        >
                                            <span className={cn('flex-1 font-medium text-left', value === model.id ? 'text-foreground' : 'text-muted-foreground')}>
                                                {model.name}
                                            </span>
                                            {value === model.id && <Check className="w-3 h-3 text-primary shrink-0" />}
                                        </button>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
