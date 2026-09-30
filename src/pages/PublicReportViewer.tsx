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
                const res = await fetch(`/ai-api/ai/exports/shared/${shareId}`);
                if (!res.ok) {
                    if (res.status === 404) {
                        throw new Error("This shared report does not exist or has expired.");
                    }
                    throw new Error(`Failed to load shared report (${res.status})`);
                }
                const data = await res.json();
                if (!isCancelled) {
                    setMeta(data);
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
    // Chrome's built-in PDF viewer is an EXTENSION-provided plugin. A sandboxed
    // frame cannot host an extension plugin, so sandboxing a PDF iframe aborts the
    // request (net::ERR_ABORTED) and Chrome renders "This page has been blocked by
    // Chrome". HTML reports are genuinely untrusted model output, so those keep the
    // sandbox — minus allow-same-origin, which would let the framed document reach
    // back into this same-origin page and strip its own sandbox.
    const isPdf = format === 'pdf';
    const frameSrc = isPdf ? `${meta.rawUrl}#toolbar=0&navpanes=0&view=FitH` : meta.rawUrl;

    return (
        <div className="flex flex-col min-h-screen md:h-[100dvh] bg-white text-slate-900">
            {/* Top Brand & Actions Navigation Bar — stacks on narrow screens */}
            <header className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2.5 bg-white border-b border-slate-200/80 shrink-0 shadow-sm">
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
                <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                    {/* Copy Share Link */}
                    <button
                        type="button"
                        onClick={handleCopyLink}
                        className={cn(
                            "flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer",
                            copied
                                ? "bg-emerald-50 text-emerald-700 border-emerald-300 font-semibold"
                                : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-sm hover:border-slate-300"
                        )}
                        title="Copy public share link"
                    >
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5 text-slate-500" />}
                        <span className="hidden sm:inline">{copied ? "Link Copied!" : "Share Link"}</span>
                    </button>

                    {/* Open in a new tab — the reliable path for PDFs, where the
                        iframe viewer can be finicky on mobile browsers. */}
                    {isPdf && (
                        <a
                            href={meta.rawUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors shadow-sm cursor-pointer"
                            title="Open report in a new tab"
                        >
                            <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                            <span className="hidden sm:inline">Open</span>
                        </a>
                    )}

                    {/* Direct Download */}
                    <a
                        href={meta.downloadUrl}
                        download={meta.filename}
                        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm cursor-pointer"
                        title="Download report file"
                    >
                        <Download className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Download</span>
                    </a>
                </div>
            </header>

            {/* Embedded High-Fidelity Report Content. main is a COLUMN flex box and
                the frame is flex-1/min-h-0: `h-full` does not resolve against a
                flex-sized parent, which left the iframe at its default 150px on
                narrow screens. */}
            <main className="flex-1 min-h-[70vh] md:min-h-0 w-full bg-white overflow-hidden flex flex-col">
                {isPdf ? (
                    <iframe
                        src={frameSrc}
                        className="w-full flex-1 min-h-0 border-0 bg-white"
                        title={meta.title || meta.filename}
                    />
                ) : (
                    <iframe
                        src={frameSrc}
                        className="w-full flex-1 min-h-0 border-0 bg-white"
                        title={meta.title || meta.filename}
                        sandbox="allow-scripts allow-popups allow-modals"
                    />
                )}
            </main>
        </div>
    );
}
