// =============================================================================
// FileView — render a "file artifact" download card
// Triggered by: export (csv/xlsx/pdf/html), generate_ppt, generate_pdf
//
// Private S3 keys carry a 5-minute pre-signed URL. When the stored URL has
// expired we re-sign from the persisted `key` via GET /api/ai/exports/download-url,
// then start the download with the fresh URL.
// =============================================================================

import { useState } from 'react';
import { FileText, Download, ImageIcon, Loader2, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { API_BASE_URL } from '@/lib/api/client';
import type { AgentArtifact } from '@/hooks/useAIAgent';

function humanSize(bytes?: number): string {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface FileViewProps {
    artifact: AgentArtifact;
    onView?: (artifact: AgentArtifact) => void;
}

export function FileView({ artifact, onView }: FileViewProps) {
    const [preparing, setPreparing] = useState(false);

    const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(artifact.fileType?.toLowerCase() || '') || artifact.type === 'image';

    const Icon = isImage ? ImageIcon : FileText;
    const iconColor = isImage ? 'text-emerald-400' : 'text-blue-400';
    const bgColor = isImage ? 'bg-emerald-400/10' : 'bg-blue-400/10';

    const fileName = artifact.fileName ?? (isImage ? 'image' : 'document');

    async function handleDownload() {
        setPreparing(true);
        try {
            let url = artifact.downloadUrl;
            // Stored pre-signed URLs expire after 5 min — re-sign from the S3 key.
            if (artifact.key) {
                try {
                    const res = await fetch(
                        `${API_BASE_URL}/api/ai/exports/download-url?key=${encodeURIComponent(artifact.key)}`,
                        { credentials: 'include' }
                    );
                    if (res.ok) {
                        const data = await res.json();
                        if (data?.success && data.url) url = data.url;
                    }
                } catch {
                    // Fall back to the stored URL; it may still be valid.
                }
            }
            if (!url) return;
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();
        } finally {
            setPreparing(false);
        }
    }

    return (
        <div
            className={cn(
                'flex items-center gap-3 rounded-lg border border-border/60 p-3 transition-colors',
                onView && 'cursor-pointer hover:border-primary/40 hover:bg-muted/10'
            )}
            onClick={() => onView?.(artifact)}
        >
            {/* Icon */}
            <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', bgColor)}>
                <Icon className={cn('w-5 h-5', iconColor)} />
            </div>

            {/* Meta */}
            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <span className="text-sm font-medium text-foreground truncate" title={fileName}>
                    {fileName}
                </span>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground/50">
                    {artifact.fileType && (
                        <span className="uppercase font-semibold">{artifact.fileType}</span>
                    )}
                    {artifact.sizeBytes && <span>{humanSize(artifact.sizeBytes)}</span>}
                    {artifact.rowCount != null && <span>{artifact.rowCount} rows</span>}
                </div>
            </div>

            {/* Buttons: View & Download */}
            <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                {onView && (
                    <button
                        type="button"
                        onClick={() => onView(artifact)}
                        className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors shadow-2xs"
                        title="View file data in side panel"
                    >
                        <Eye className="w-3.5 h-3.5" />
                        View
                    </button>
                )}

                {artifact.downloadUrl || artifact.key ? (
                    <button
                        type="button"
                        onClick={handleDownload}
                        disabled={preparing}
                        className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors shrink-0 disabled:opacity-60"
                    >
                        {preparing ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                            <Download className="w-3.5 h-3.5" />
                        )}
                        {preparing ? 'Preparing…' : 'Download'}
                    </button>
                ) : (
                    <span className="text-[11px] text-muted-foreground/40 shrink-0">Generating…</span>
                )}
            </div>
        </div>
    );
}