// =============================================================================
// FileView — Clean, authentic deliverable file card (HTML5, Excel, PDF, CSV)
// =============================================================================

import { useState } from 'react';
import {
    FileText, Download, ImageIcon, Loader2, Eye, FileSpreadsheet,
    Share2, Check, ChevronDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { API_BASE_URL } from '@/lib/api/client';
import type { AgentArtifact } from '../../hooks/useAIAgent';

function humanSize(bytes?: number): string {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ── Authentic HTML5 Shield Icon ───────────────────────────────────────────────
function Html5Icon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 512 512" className={cn("w-5 h-5", className)} fill="currentColor">
            <path fill="#E34F26" d="M71 460L30 0h452l-41 460-185 52z" />
            <path fill="#EF652A" d="M256 472l149-41 35-391H256v432z" />
            <path fill="#EBEBEB" d="M256 208H181l-5-57h80V95H115l15 170h126zm0 148l-83-22-6-62H111l10 119 135 37z" />
            <path fill="#FFFFFF" d="M256 208h75l-7 78-68 19v58l122-34 17-191H256zm0-113v56h141l5-56z" />
        </svg>
    );
}

// ── Authentic Excel Icon ──────────────────────────────────────────────────────
function ExcelIcon({ className }: { className?: string }) {
    return (
        <div className={cn("w-5 h-5 rounded bg-[#107C41] flex items-center justify-center text-white font-bold text-xs shadow-sm", className)}>
            X
        </div>
    );
}

// ── Authentic PDF Icon ────────────────────────────────────────────────────────
function PdfIcon({ className }: { className?: string }) {
    return (
        <div className={cn("w-5 h-5 rounded bg-[#EA4335] flex items-center justify-center text-white font-bold text-[9px] tracking-tight shadow-sm", className)}>
            PDF
        </div>
    );
}

interface FileViewProps {
    artifact: AgentArtifact;
    onView?: (artifact: AgentArtifact) => void;
    isOpen?: boolean;
}

export function FileView({ artifact, onView, isOpen = false }: FileViewProps) {
    const [preparing, setPreparing] = useState(false);
    const [sharing, setSharing] = useState(false);
    const [copiedShare, setCopiedShare] = useState(false);
    const [selectedArtifact, setSelectedArtifact] = useState<AgentArtifact>(artifact);
    const [versionMenuOpen, setVersionMenuOpen] = useState(false);

    const active = selectedArtifact;
    const fileName = active.fileName ?? (active as any).filename ?? active.title ?? 'document';
    const ext = (active.fileType || (active as any).format || fileName.split('.').pop() || '').toLowerCase();

    const isSpreadsheet = ['xlsx', 'xls', 'xlsm'].includes(ext) || active.fileType === 'xlsx';
    const isCsv = ['csv', 'tsv'].includes(ext) || active.fileType === 'csv';
    const isPdf = ext === 'pdf';
    const isHtml = ['html', 'htm'].includes(ext) || (active as any).format === 'html';
    const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext) || active.type === 'image';

    const previousVersions: AgentArtifact[] = (artifact as any).previousVersions || [];
    const allVersions: AgentArtifact[] = [artifact, ...previousVersions];
    const totalVersions = allVersions.length;
    const currentVersionNum = active.version || (active as any).reportVersion || (totalVersions > 1 ? totalVersions : null);

    let customIcon = <FileText className="w-5 h-5 text-blue-400" />;
    let badgeBg = 'bg-blue-500/15 text-blue-400 border-blue-500/30';
    let cardHover = 'hover:border-blue-500/40';
    let typeLabel = 'Document';

    if (isHtml) {
        customIcon = <Html5Icon className="w-5 h-5 drop-shadow-sm" />;
        badgeBg = 'bg-orange-500/15 text-orange-500 border-orange-500/30';
        cardHover = 'hover:border-orange-500/40 hover:shadow-orange-500/5';
        typeLabel = 'HTML5 Report';
    } else if (isSpreadsheet) {
        customIcon = <ExcelIcon />;
        badgeBg = 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30';
        cardHover = 'hover:border-emerald-500/40 hover:shadow-emerald-500/5';
        typeLabel = 'Excel Sheet';
    } else if (isCsv) {
        customIcon = <FileSpreadsheet className="w-5 h-5 text-sky-400" />;
        badgeBg = 'bg-sky-500/15 text-sky-400 border-sky-500/30';
        cardHover = 'hover:border-sky-500/40';
        typeLabel = 'CSV Table';
    } else if (isPdf) {
        customIcon = <PdfIcon />;
        badgeBg = 'bg-rose-500/15 text-rose-500 border-rose-500/30';
        cardHover = 'hover:border-rose-500/40 hover:shadow-rose-500/5';
        typeLabel = 'PDF Doc';
    } else if (isImage) {
        customIcon = <ImageIcon className="w-5 h-5 text-purple-400" />;
        badgeBg = 'bg-purple-500/15 text-purple-400 border-purple-500/30';
        cardHover = 'hover:border-purple-500/40';
        typeLabel = 'Image';
    }

    const sizeStr = active.sizeBytes ? humanSize(active.sizeBytes) : null;

    async function handleDownload(e?: React.MouseEvent) {
        e?.stopPropagation();
        setPreparing(true);
        try {
            let url = active.downloadUrl;
            if (active.key) {
                try {
                    const res = await fetch(
                        `${API_BASE_URL}/api/ai/exports/download-url?key=${encodeURIComponent(active.key)}`,
                        { credentials: 'include' }
                    );
                    if (res.ok) {
                        const data = await res.json();
                        if (data?.success && data.url) url = data.url;
                    }
                } catch {
                    // Fall back to stored URL
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

    async function handleShare(e: React.MouseEvent) {
        e.stopPropagation();
        setSharing(true);
        try {
            if (active.key) {
                const query = new URLSearchParams({
                    key: active.key,
                    filename: fileName,
                    title: active.title || fileName,
                });
                const res = await fetch(`/ai-api/ai/exports/share?${query.toString()}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.shareId) {
                        const fullUrl = `${window.location.origin}/share/r/${data.shareId}`;
                        await navigator.clipboard.writeText(fullUrl);
                        setCopiedShare(true);
                        setTimeout(() => setCopiedShare(false), 2500);
                        return;
                    }
                }
            }
            // fallback: copy download url
            if (active.downloadUrl) {
                await navigator.clipboard.writeText(active.downloadUrl);
                setCopiedShare(true);
                setTimeout(() => setCopiedShare(false), 2500);
            }
        } catch {
            if (active.downloadUrl) {
                await navigator.clipboard.writeText(active.downloadUrl);
                setCopiedShare(true);
                setTimeout(() => setCopiedShare(false), 2500);
            }
        } finally {
            setSharing(false);
        }
    }

    return (
        <div
            className={cn(
                'group relative flex items-center gap-3 rounded-xl border px-3.5 py-2.5 transition-all w-full max-w-[420px] select-none',
                isOpen
                    ? 'border-primary/60 bg-primary/[0.04] shadow-sm'
                    : 'border-border/60 bg-card/95 shadow-sm hover:shadow-sm',
                cardHover,
                onView && 'cursor-pointer hover:bg-muted/15'
            )}
            onClick={() => onView?.(active)}
        >
            {/* File Icon */}
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border border-border/40 bg-background shadow-sm">
                {customIcon}
            </div>

            {/* File Info */}
            <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-semibold text-foreground truncate" title={fileName}>
                        {fileName}
                    </span>

                    {/* Version Tag */}
                    {currentVersionNum != null && (
                        <div className="relative shrink-0">
                            <button
                                type="button"
                                onClick={(e) => {
                                    if (totalVersions > 1) {
                                        e.stopPropagation();
                                        setVersionMenuOpen(prev => !prev);
                                    }
                                }}
                                className={cn(
                                    "flex items-center gap-0.5 text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border transition-colors",
                                    badgeBg,
                                    totalVersions > 1 ? "cursor-pointer hover:opacity-80" : "cursor-default"
                                )}
                                title={totalVersions > 1 ? "Click to view other versions" : `Version ${currentVersionNum}`}
                            >
                                <span>v{currentVersionNum}</span>
                                {totalVersions > 1 && <ChevronDown className="w-2 h-2 ml-0.5" />}
                            </button>

                            {versionMenuOpen && totalVersions > 1 && (
                                <div
                                    className="absolute left-0 top-full mt-1 w-28 bg-popover border border-border/70 rounded-lg shadow-md py-1 z-30 flex flex-col text-xs"
                                    onClick={e => e.stopPropagation()}
                                >
                                    {allVersions.map((v, idx) => {
                                        const vNum = v.version || (v as any).reportVersion || (totalVersions - idx);
                                        const isSelected = v === active;
                                        return (
                                            <button
                                                key={idx}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedArtifact(v);
                                                    setVersionMenuOpen(false);
                                                }}
                                                className={cn(
                                                    "flex items-center justify-between px-2.5 py-1 text-left hover:bg-muted transition-colors cursor-pointer",
                                                    isSelected && "font-semibold text-primary bg-primary/5"
                                                )}
                                            >
                                                <span>v{vNum} {idx === 0 ? '(latest)' : ''}</span>
                                                {isSelected && <Check className="w-3 h-3 text-primary" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Subtitle: Clean, short, non-truncating */}
                <span className="text-[11px] text-muted-foreground/75 truncate mt-0.5">
                    {typeLabel} {sizeStr ? `· ${sizeStr}` : ''}
                </span>
            </div>

            {/* Actions: Eye Icon Only, Share & Download */}
            <div className="flex items-center gap-1 shrink-0 ml-1" onClick={e => e.stopPropagation()}>
                {/* Share Button */}
                {(active.key || active.downloadUrl) && (
                    <button
                        type="button"
                        onClick={handleShare}
                        disabled={sharing}
                        className={cn(
                            "p-2 rounded-lg border transition-all cursor-pointer",
                            copiedShare
                                ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                                : "border-transparent text-muted-foreground/70 hover:text-foreground hover:bg-muted"
                        )}
                        title={copiedShare ? "Share link copied to clipboard!" : "Copy shareable link"}
                    >
                        {copiedShare ? (
                            <Check className="w-4 h-4 text-emerald-500" />
                        ) : sharing ? (
                            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        ) : (
                            <Share2 className="w-4 h-4" />
                        )}
                    </button>
                )}

                {/* Eye Icon Button (Preview) — Highlights ON when preview is active */}
                {onView && (
                    <button
                        type="button"
                        onClick={() => onView(active)}
                        className={cn(
                            "p-2 rounded-lg transition-all cursor-pointer active:scale-95 shadow-sm",
                            isOpen
                                ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/30 border border-primary font-semibold"
                                : "text-muted-foreground/70 hover:text-foreground hover:bg-muted border border-transparent hover:border-border/60"
                        )}
                        title={isOpen ? "Preview is active (click to close)" : "Preview report"}
                    >
                        <Eye className="w-4 h-4" />
                    </button>
                )}

                {/* Download Icon Button */}
                {(active.downloadUrl || active.key) && (
                    <button
                        type="button"
                        onClick={handleDownload}
                        disabled={preparing}
                        className="p-2 rounded-lg text-muted-foreground/70 hover:text-foreground hover:bg-muted border border-transparent hover:border-border/60 transition-all cursor-pointer active:scale-95"
                        title="Download file"
                    >
                        {preparing ? (
                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        ) : (
                            <Download className="w-4 h-4" />
                        )}
                    </button>
                )}
            </div>
        </div>
    );
}