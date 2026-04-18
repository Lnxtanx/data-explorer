// =============================================================================
// FileView — render a "file artifact" download card
// Triggered by: generate_ppt, generate_pdf
// =============================================================================

import { FileText, Presentation, Download, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentArtifact } from '@/hooks/useAIAgent';

function humanSize(bytes?: number): string {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface FileViewProps {
    artifact: AgentArtifact;
}

export function FileView({ artifact }: FileViewProps) {
    const isPptx = artifact.fileType === 'pptx' || artifact.fileType === 'slide_deck';
    const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(artifact.fileType?.toLowerCase() || '') || artifact.type === 'image';
    
    const Icon = isPptx ? Presentation : isImage ? ImageIcon : FileText;
    const iconColor = isPptx ? 'text-orange-400' : isImage ? 'text-emerald-400' : 'text-blue-400';
    const bgColor = isPptx ? 'bg-orange-400/10' : isImage ? 'bg-emerald-400/10' : 'bg-blue-400/10';

    return (
        <div className="flex items-center gap-3 rounded-lg border border-border/60 p-3">
            {/* Icon */}
            <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', bgColor)}>
                <Icon className={cn('w-5 h-5', iconColor)} />
            </div>

            {/* Meta */}
            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <span className="text-sm font-medium text-foreground truncate">
                    {artifact.fileName ?? (isPptx ? 'presentation.pptx' : isImage ? 'image' : 'document')}
                </span>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground/50">
                    {artifact.fileType && (
                        <span className="uppercase font-semibold">{artifact.fileType}</span>
                    )}
                    {artifact.sizeBytes && <span>{humanSize(artifact.sizeBytes)}</span>}
                    {artifact.slideCount && <span>{artifact.slideCount} slides</span>}
                </div>
            </div>

            {/* Download button */}
            {artifact.downloadUrl ? (
                <a
                    href={artifact.downloadUrl}
                    download={artifact.fileName}
                    className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors shrink-0"
                >
                    <Download className="w-3.5 h-3.5" />
                    Download
                </a>
            ) : (
                <span className="text-[11px] text-muted-foreground/40 shrink-0">Generating…</span>
            )}
        </div>
    );
}
