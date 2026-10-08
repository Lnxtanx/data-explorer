// =============================================================================
// PublicReportViewer — Clean, branded standalone viewer for shared reports.
// Accessible by anyone with a compact share link (e.g. /share/r/:shareId).
// No authentication required.
// =============================================================================

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
    Download, Share2, Check, AlertCircle, ExternalLink, FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveAiApiUrl } from '@/lib/api';

// ── Authentic HTML5 Shield Icon ───────────────────────────────────────────────
function Html5Icon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 512 512" className={cn("w-4 h-4", className)} fill="currentColor">
            <path fill="#E34F26" d="M71 460L30 0h452l-41 460-185 52z" />
            <path fill="#EF652A" d="M256 472l149-41 35-391H256v432z" />
            <path fill="#EBEBEB" d="M256 208H181l-5-57h80V95H115l15 170h126zm0 148l-83-22-6-62H111l10 119 135 37z" />
            <path fill="#FFFFFF" d="M256 208h75l-7 78-68 19v58l122-34 17-191H256zm0-113v56h141l5-56z" />
        </svg>
    );
}

interface SharedReportMeta {
    shareId: string;
    title: string;
    filename: string;
    format: string;
    createdAt?: number;
    rawUrl: string;
    downloadUrl: string;
}

export default function PublicReportViewer() {
    const { shareId } = useParams<{ shareId: string }>();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [meta, setMeta] = useState<SharedReportMeta | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!shareId) {
            setError("Invalid report link");
            setLoading(false);
            return;
        }

        let isCancelled = false;
        async function fetchShared() {
            try {
                setLoading(true);
                setError(null);
                // DELIBERATE raw fetch — do not route through lib/api/client.
                //
                // This is the unauthenticated /share/r/:shareId route. The
                // shared client unconditionally sends `credentials: 'include'`
                // and fires the global `auth:unauthorized` event on 401, both
                // of which are wrong for a public share link: it would attach
                // the viewer's session cookie to an unauthenticated endpoint
                // and could sign them out for opening a link.
                //
                // The endpoint also lives on the AI backend's `/ai-api` base
                // path (proxied separately in vite.config.ts), which the client
                // has no concept of. Phase 3 audited all 12 hand-rolled fetch
                // sites and converted 10; this one and the two third-party
                // calls are the intentional remainder.
                const res = await fetch(resolveAiApiUrl(`/ai-api/ai/exports/shared/${shareId}`));
                if (!res.ok) {
                    if (res.status === 404) {
                        throw new Error("This shared report does not exist or has expired.");
                    }
                    throw new Error(`Failed to load shared report (${res.status})`);
                }
                const data = await res.json();
                if (!isCancelled) {
                    setMeta({
                        ...data,
                        rawUrl: resolveAiApiUrl(data.rawUrl),
                        downloadUrl: resolveAiApiUrl(data.downloadUrl),
                    });
                    if (data.title || data.filename) {
                        document.title = `${data.title || data.filename} · Schema Weaver Data Explorer`;
                    }
                }
            } catch (err: any) {
                if (!isCancelled) {
                    setError(err.message || "Failed to load report");
                }
            } finally {
                if (!isCancelled) {
                    setLoading(false);
                }
            }
        }

        fetchShared();
        return () => { isCancelled = true; };
    }, [shareId]);

    const handleCopyLink = () => {
        navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 text-slate-900 p-6">
                <div className="flex flex-col items-center gap-3">
                    <img src="/resona.png" alt="Schema Weaver" className="w-9 h-9 object-contain animate-pulse" />
                    <p className="text-sm font-medium text-slate-700">Loading shared report…</p>
                    <p className="text-xs text-slate-400 font-mono">ID: {shareId}</p>
                </div>
            </div>
        );
    }

    if (error || !meta) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 text-slate-900 p-6">
                <div className="max-w-md w-full text-center flex flex-col items-center gap-4 bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
                    <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center">
                        <AlertCircle className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900">Report Unavailable</h2>
                        <p className="text-xs text-slate-500 mt-2 leading-relaxed">{error || "The requested report could not be found."}</p>
                    </div>
                    <Link
                        to="/"
                        className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition-colors"
                    >
                        Go to Schema Weaver
                    </Link>
                </div>
            </div>
        );
    }

    const format = (meta.format || '').toLowerCase();
    const isPdf = format === 'pdf';
    const frameSrc = isPdf ? `${meta.rawUrl}#toolbar=0&navpanes=0&view=FitH` : meta.rawUrl;

    const isMobileDevice = typeof window !== 'undefined'
        ? (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth < 768)
        : false;

    return (
        <div className="flex flex-col h-[100dvh] min-h-[100dvh] max-h-[100dvh] bg-white text-slate-900 overflow-hidden overscroll-none">
            {/* Top Brand & Actions Navigation Bar — responsive on narrow mobile screens */}
            <header className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-white border-b border-slate-200/80 shrink-0 shadow-sm z-10">
                {/* Brand & Title */}
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 overflow-hidden">
                    {/* Schema Weaver Data Explorer Brand */}
                    <div className="flex items-center gap-2 shrink-0">
                        <img src="/resona.png" alt="Schema Weaver" className="w-5 h-5 object-contain shrink-0" />
                        <div className="flex items-center gap-1.5 text-xs tracking-tight">
                            <span className="font-bold text-slate-900">Schema Weaver</span>
                            <span className="hidden sm:inline text-slate-300 font-normal">/</span>
                            <span className="hidden sm:inline font-semibold text-slate-600">Data Explorer</span>
                        </div>
                    </div>

                    <div className="hidden sm:block h-4 w-px bg-slate-200 shrink-0 mx-0.5" />

                    {/* Report File Info */}
                    <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                        {isPdf
                            ? <FileText className="w-4 h-4 shrink-0 text-rose-500" />
                            : <Html5Icon className="w-4 h-4 shrink-0" />}
                        <h1 className="text-xs sm:text-sm font-semibold text-slate-800 truncate" title={meta.title || meta.filename}>
                            {meta.title || meta.filename}
                        </h1>
                        <span className="hidden sm:inline text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-600 border border-orange-500/20 shrink-0">
                            Report
                        </span>
                    </div>
                </div>

                {/* Right Action Controls */}
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 justify-end">
                    {/* Copy Share Link */}
                    <button
                        type="button"
                        onClick={handleCopyLink}
                        className={cn(
                            "flex items-center gap-1.5 text-xs font-medium px-2 sm:px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer",
                            copied
                                ? "bg-emerald-50 text-emerald-700 border-emerald-300 font-semibold"
                                : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-sm hover:border-slate-300"
                        )}
                        title="Copy public share link"
                    >
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5 text-slate-500" />}
                        <span className="hidden sm:inline">{copied ? "Link Copied!" : "Share Link"}</span>
                    </button>

                    {/* Open in a new tab / Native Viewer — reliable path on mobile phones */}
                    <a
                        href={meta.rawUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs font-medium px-2 sm:px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors shadow-sm cursor-pointer"
                        title={isPdf ? "Open in native PDF reader" : "Open report in a new tab"}
                    >
                        <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                        <span className="hidden xs:inline">{isPdf ? "Open PDF" : "Open"}</span>
                    </a>

                    {/* Direct Download */}
                    <a
                        href={meta.downloadUrl}
                        download={meta.filename}
                        className="flex items-center gap-1.5 text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm cursor-pointer"
                        title="Download report file"
                    >
                        <Download className="w-3.5 h-3.5" />
                        <span className="hidden xs:inline">Download</span>
                    </a>
                </div>
            </header>

            {/* Mobile PDF Native Reader Notice Bar */}
            {isPdf && isMobileDevice && (
                <div className="bg-slate-900 text-white px-3 sm:px-4 py-2 text-xs flex items-center justify-between gap-2 shrink-0 border-b border-slate-800">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0 animate-pulse" />
                        <span className="truncate text-slate-200 text-[11px] sm:text-xs">
                            Mobile device: Open in native reader for smooth pinch-zoom and all pages.
                        </span>
                    </div>
                    <a
                        href={meta.rawUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 font-semibold px-2.5 py-1 bg-white text-slate-900 rounded-md hover:bg-slate-100 transition-colors shadow-sm text-[11px]"
                    >
                        Open Reader
                    </a>
                </div>
            )}

            {/* Embedded High-Fidelity Report Content with iOS/WebKit safe overflow scrolling */}
            <main className="flex-1 w-full min-h-0 bg-white overflow-auto [-webkit-overflow-scrolling:touch] flex flex-col relative">
                {isPdf ? (
                    <iframe
                        src={frameSrc}
                        className="w-full flex-1 min-h-0 border-0 bg-white"
                        style={{ width: '100%', minWidth: '100%', maxWidth: '100%', height: '100%' }}
                        title={meta.title || meta.filename}
                    />
                ) : (
                    <iframe
                        src={frameSrc}
                        className="w-full flex-1 min-h-0 border-0 bg-white"
                        style={{ width: '100%', minWidth: '100%', maxWidth: '100%', height: '100%' }}
                        title={meta.title || meta.filename}
                        sandbox="allow-scripts allow-popups allow-modals"
                    />
                )}
            </main>
        </div>
    );
}
