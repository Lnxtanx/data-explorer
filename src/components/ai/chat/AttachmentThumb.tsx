// =============================================================================
// AttachmentThumb — image thumbnail for a SENT message's attachment card.
//
// Distinct from AttachmentChip (composer, still holds a live browser File with
// an object URL). By the time a message is sent, the File is gone, so the
// thumbnail has to be fetched — the backend streams the original bytes from S3
// at /ai/files/{id}/raw. The text endpoints return the extracted content (for
// an image that is the vision description), which an <img> cannot decode.
//
// If the bytes are gone the <img> errors; onError falls back to the document
// icon rather than leaving a broken-image glyph in the chat.
// =============================================================================
import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { imagePreviewUrl, isImageName } from './utils/fileValidation';
import { cn } from '@/lib/utils';

interface AttachmentThumbProps {
    name?: string | null;
    artifact?: Record<string, unknown> | null;
    className?: string;
    iconClassName?: string;
}

export default function AttachmentThumb({ name, artifact, className, iconClassName }: AttachmentThumbProps) {
    const [src, setSrc] = useState<string | null>(null);

    useEffect(() => {
        if (!isImageName(name)) { setSrc(null); return; }
        setSrc(imagePreviewUrl(artifact ?? {}) ?? null);
    }, [name, artifact]);

    if (src) {
        return (
            <img
                src={src}
                alt={name || 'attachment'}
                loading="lazy"
                onError={() => setSrc(null)}
                className={cn('shrink-0 rounded-[3px] object-cover bg-background', className)}
            />
        );
    }
    return <FileText className={cn('shrink-0 text-primary', iconClassName || className)} />;
}
