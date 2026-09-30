// =============================================================================
// AttachmentChip — one attached-file pill above the chat composer.
// Images render a real thumbnail (the backend describes them for the model, but
// the user still needs to see WHICH image they attached); everything else keeps
// the document icon.
// =============================================================================
import { memo, useEffect, useState } from 'react';
import { FileText, X } from 'lucide-react';
import { isImageFile } from './utils/fileValidation';
import { cn } from '@/lib/utils';

interface AttachmentChipProps {
    file: File;
    onRemove: () => void;
    size?: 'sm' | 'md';
    removeClassName?: string;
}

function AttachmentChip({ file, onRemove, size = 'md', removeClassName }: AttachmentChipProps) {
    const isImg = isImageFile(file);
    const [thumb, setThumb] = useState<string | null>(null);

    // Object URLs are revoked on unmount; leaking one per attachment pins the
    // whole decoded bitmap in memory for the life of the tab.
    useEffect(() => {
        if (!isImg) return;
        const url = URL.createObjectURL(file);
        setThumb(url);
        return () => URL.revokeObjectURL(url);
    }, [file, isImg]);

    const pad = size === 'sm' ? 'pl-2 pr-1 py-0.5' : 'pl-2 pr-1 py-1';
    const label = size === 'sm' ? 'max-w-[120px] text-[11px]' : 'max-w-[120px]';

    return (
        <div className={cn('flex items-center gap-2 bg-muted/50 border border-border/50 rounded-lg text-xs', pad)}>
            {isImg && thumb ? (
                <img
                    src={thumb}
                    alt={file.name}
                    className={cn(
                        'shrink-0 rounded-[3px] object-cover bg-white',
                        size === 'sm' ? 'w-5 h-5' : 'w-6 h-6',
                    )}
                />
            ) : (
                <FileText className={cn('shrink-0 text-muted-foreground', size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5')} />
            )}
            <span className={cn('truncate font-medium', label)}>{file.name}</span>
            <button
                type="button"
                className={cn(
                    'flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground cursor-pointer',
                    size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4',
                    removeClassName,
                )}
                onClick={onRemove}
                aria-label={`Remove ${file.name}`}
            >
                <X className={size === 'sm' ? 'w-2.5 h-2.5' : 'w-2.5 h-2.5'} />
            </button>
        </div>
    );
}

export default memo(AttachmentChip);
