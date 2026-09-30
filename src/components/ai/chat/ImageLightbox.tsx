// =============================================================================
// ImageLightbox — full-size preview for an attached image.
//
// Clicking an image attachment in a chat message opens this instead of routing
// through the generic artifact panel: an <img> in an iframe cannot be zoomed or
// dismissed the way a user expects, and the artifact panel treats images as
// generic files.
//
// Click the backdrop, the close button, or press Escape to dismiss.
// =============================================================================
import { useEffect } from 'react';
import { X, Download, ExternalLink } from 'lucide-react';

interface ImageLightboxProps {
    src: string;
    filename?: string | null;
    downloadUrl?: string | null;
    onClose: () => void;
}

export default function ImageLightbox({ src, filename, downloadUrl, onClose }: ImageLightboxProps) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        // Stop the page behind the overlay from scrolling while it is open.
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = prev;
        };
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-[10000] flex flex-col bg-black/80 backdrop-blur-sm"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label={filename ? `Preview of ${filename}` : 'Image preview'}
        >
            <div className="flex items-center justify-between gap-3 px-4 py-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                <span className="text-xs font-medium text-white/90 truncate">{filename || 'Image'}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                    {downloadUrl && (
                        <a
                            href={downloadUrl}
                            download={filename || undefined}
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                            title="Download original"
                        >
                            <Download className="w-4 h-4" />
                        </a>
                    )}
                    {downloadUrl && (
                        <a
                            href={downloadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                            title="Open original in a new tab"
                        >
                            <ExternalLink className="w-4 h-4" />
                        </a>
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                        title="Close preview (Esc)"
                        aria-label="Close preview"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div
                className="flex-1 min-h-0 flex items-center justify-center px-4 pb-4"
                onClick={(e) => e.stopPropagation()}
            >
                <img
                    src={src}
                    alt={filename || 'Image preview'}
                    className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
            </div>
        </div>
    );
}
