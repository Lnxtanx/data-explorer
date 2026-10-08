// =============================================================================
// FilePreviewView — Rich in-app preview for exported files (HTML, CSV, Excel, PDF, JSON)
// Opened in the right-side ArtifactPanel when a user clicks [Preview/View] on a file artifact.
// =============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    FileSpreadsheet, FileText, FileCode, Download, Search, Copy, Check,
    RefreshCw, AlertCircle, Loader2, ChevronLeft, ChevronRight,
    ArrowUpDown, ArrowUp, ArrowDown, ExternalLink, Table as TableIcon,
    X, Layers, Share2, Code
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { API_BASE_URL, resolveAiApiUrl } from '@/lib/api';
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
        <svg viewBox="0 0 512 512" className={cn("w-4 h-4", className)} fill="currentColor">
            <path fill="#E34F26" d="M71 460L30 0h452l-41 460-185 52z" />
            <path fill="#EF652A" d="M256 472l149-41 35-391H256v432z" />
            <path fill="#EBEBEB" d="M256 208H181l-5-57h80V95H115l15 170h126zm0 148l-83-22-6-62H111l10 119 135 37z" />
            <path fill="#FFFFFF" d="M256 208h75l-7 78-68 19v58l122-34 17-191H256zm0-113v56h141l5-56z" />
        </svg>
    );
}

interface ParsedSheet {
    name: string;
    headers: string[];
    rows: (string | number | boolean | null)[][];
}

interface FilePreviewViewProps {
    artifact: AgentArtifact;
    onClose?: () => void;
}

export function FilePreviewView({ artifact, onClose }: FilePreviewViewProps) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [downloading, setDownloading] = useState(false);
    const [sharing, setSharing] = useState(false);
    const [copiedShare, setCopiedShare] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);

    // Parsed tabular data
    const [sheets, setSheets] = useState<ParsedSheet[]>([]);
    const [activeSheetIdx, setActiveSheetIdx] = useState(0);

    // Non-tabular content
    const [jsonRaw, setJsonRaw] = useState<string | null>(null);
    const [textRaw, setTextRaw] = useState<string | null>(null);
    const [htmlRaw, setHtmlRaw] = useState<string | null>(null);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);

    // View toggles
    const [viewMode, setViewMode] = useState<'table' | 'raw'>('table');

    // Table interactive state
    const [searchQuery, setSearchQuery] = useState('');
    const [sortCol, setSortCol] = useState<number | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [selectedRow, setSelectedRow] = useState<{ index: number; data: (string | number | boolean | null)[] } | null>(null);

    const fileName = artifact.fileName || (artifact as any).filename || artifact.title || 'export';
    const ext = (fileName.split('.').pop() || artifact.fileType || (artifact as any).format || '').toLowerCase();

    const isExcel = ['xlsx', 'xls', 'xlsm'].includes(ext) || artifact.fileType === 'xlsx';
    const isCsv = ['csv', 'tsv'].includes(ext) || artifact.fileType === 'csv';
    const isJson = ext === 'json' || artifact.fileType === 'json';
    const isHtml = ['html', 'htm'].includes(ext) || (artifact as any).format === 'html';
    const isPdf = ext === 'pdf';
    const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext) || artifact.type === 'image';
    const isText = ['txt', 'log', 'md', 'sql'].includes(ext);

    // ── Re-sign or resolve download/content URL ─────────────────────────────────
    const fetchValidUrl = useCallback(async (): Promise<string> => {
        const fileId = artifact.fileId || (artifact as any).file_id
            || (artifact.type === 'attachment' && artifact.id ? artifact.id : null);

        // Images must render as <img>, which needs REAL image bytes. The
        // text/JSON endpoints return the extracted content (for an image that
        // is the vision description), so pointing an <img> at them yields a
        // broken-image icon. /raw streams the original binary from S3.
        if (isImage) {
            if (artifact.key) {
                return resolveAiApiUrl(`/ai-api/ai/exports/content?key=${encodeURIComponent(artifact.key)}`);
            }
            if (fileId) {
                return resolveAiApiUrl(`/ai-api/ai/files/${fileId}/raw`);
            }
        }

        // If we have an S3 key, use our same-origin content streaming endpoint to completely avoid S3 CORS
        if (artifact.key) {
            return resolveAiApiUrl(`/ai-api/ai/exports/content?key=${encodeURIComponent(artifact.key)}`);
        }
        if (fileId && (!artifact.downloadUrl || !artifact.downloadUrl.startsWith('/'))) {
            return `${API_BASE_URL}/api/ai/files/${fileId}/content`;
        }
        const url = artifact.downloadUrl || (artifact as any).url;
        if (!url && fileId) {
            return `/api/ai/files/${fileId}/content`;
        }
        if (!url) {
            throw new Error('File download URL is not available.');
        }
        return url;
    }, [artifact, isImage]);

    // ── Load & parse file ────────────────────────────────────────────────────────
    const loadFile = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // 1. Check if rows and columns were already provided directly on artifact
            if (artifact.rows && artifact.rows.length > 0 && artifact.columns && artifact.columns.length > 0) {
                const headers = artifact.columns.map(c => c.name);
                const rows = artifact.rows.map(r => headers.map(h => (r[h] ?? null) as string | number | boolean | null));
                setSheets([{ name: 'Data', headers, rows }]);
                setLoading(false);
                return;
            }

            // 2. Check if text/csv content is already available locally (e.g. from file upload)
            const localContent = artifact.rawContent || (artifact as any).text_content || (artifact as any).textContent;
            if (localContent && typeof localContent === 'string' && localContent.trim().length > 0) {
                if (isCsv || isExcel) {
                    try {
                        const workbook = XLSX.read(localContent, { type: 'string' });
                        const parsedSheets: ParsedSheet[] = workbook.SheetNames.map(name => {
                            const sheet = workbook.Sheets[name];
                            if (!sheet) return { name, headers: [], rows: [] };
                            const rawData = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
                                header: 1,
                                defval: '',
                                blankrows: false,
                            });
                            if (rawData.length === 0) return { name, headers: [], rows: [] };
                            const rawHeaders = (rawData[0] || []) as any[];
                            const headers = rawHeaders.map((h, i) => String(h ?? '').trim() || `Column ${i + 1}`);
                            const rows = rawData.slice(1);
                            return { name, headers, rows };
                        });
                        setSheets(parsedSheets);
                        setActiveSheetIdx(0);
                        setLoading(false);
                        return;
                    } catch (csvErr) {
                        logger.warn('[FilePreviewView] Failed to parse localContent as spreadsheet:', csvErr);
                    }
                } else if (isText) {
                    setTextRaw(localContent);
                    setLoading(false);
                    return;
                } else if (isHtml) {
                    setHtmlRaw(localContent);
                    setLoading(false);
                    return;
                } else if (isJson) {
                    setTextRaw(localContent);
                    try {
                        const parsed = JSON.parse(localContent);
                        setJsonRaw(JSON.stringify(parsed, null, 2));
                        if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
                            const allKeys = Array.from(new Set(parsed.flatMap(obj => (typeof obj === 'object' && obj !== null ? Object.keys(obj) : []))));
                            const rows = parsed.map(obj => allKeys.map(k => (obj && typeof obj === 'object' ? obj[k] : null)));
                            setSheets([{ name: 'JSON Records', headers: allKeys, rows }]);
                        } else if (typeof parsed === 'object' && parsed !== null) {
                            const headers = ['Key', 'Value'];
                            const rows = Object.entries(parsed).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]);
                            setSheets([{ name: 'Properties', headers, rows }]);
                        }
                    } catch {
                        setSheets([]);
                    }
                    setLoading(false);
                    return;
                }
            }

            const url = await fetchValidUrl();

            if (isImage) {
                setImageUrl(url);
                setLoading(false);
                return;
            }

            if (isPdf) {
                setPdfUrl(url);
                setLoading(false);
                return;
            }

            // Include credentials for backend APIs so user session is authenticated.
            // Omit credentials only on external pre-signed URLs (e.g. S3 direct) to prevent CORS credential errors.
            const isBackendApi = url.startsWith('/')
                || (API_BASE_URL ? url.startsWith(API_BASE_URL) : false)
                || url.includes('schemaweaver.dev')
                || (typeof window !== 'undefined' && url.startsWith(window.location.origin));
            const res = await fetch(url, isBackendApi ? { credentials: 'include' } : {});
            if (!res.ok) {
                throw new Error(`Failed to fetch file (${res.status} ${res.statusText})`);
            }

            if (isHtml) {
                const text = await res.text();
                setHtmlRaw(text);
                setLoading(false);
                return;
            }

            if (isJson) {
                const text = await res.text();
                setTextRaw(text);
                try {
                    const parsed = JSON.parse(text);
                    setJsonRaw(JSON.stringify(parsed, null, 2));

                    // Check if JSON is array of objects -> render as table!
                    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
                        const allKeys = Array.from(
                            new Set(parsed.flatMap(obj => (typeof obj === 'object' && obj !== null ? Object.keys(obj) : [])))
                        );
                        const rows = parsed.map(obj => allKeys.map(k => (obj && typeof obj === 'object' ? obj[k] : null)));
                        setSheets([{ name: 'JSON Records', headers: allKeys, rows }]);
                    } else if (typeof parsed === 'object' && parsed !== null) {
                        // Single object -> key-value table
                        const headers = ['Key', 'Value'];
                        const rows = Object.entries(parsed).map(([k, v]) => [
                            k,
                            typeof v === 'object' ? JSON.stringify(v) : String(v),
                        ]);
                        setSheets([{ name: 'Properties', headers, rows }]);
                    }
                } catch {
                    setSheets([]);
                }
                setLoading(false);
                return;
            }

            if (isText) {
                const text = await res.text();
                setTextRaw(text);
                setLoading(false);
                return;
            }

            // Tabular: Excel / CSV / TSV
            const buffer = await res.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array' });

            const parsedSheets: ParsedSheet[] = workbook.SheetNames.map(name => {
                const sheet = workbook.Sheets[name];
                if (!sheet) return { name, headers: [], rows: [] };

                const rawData = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
                    header: 1,
                    defval: '',
                    blankrows: false,
                });

                if (rawData.length === 0) {
                    return { name, headers: [], rows: [] };
                }

                const rawHeaders = (rawData[0] || []) as any[];
                // Generate clean header labels, ensuring no empty headers
                const headers = rawHeaders.map((h, i) => {
                    const str = String(h ?? '').trim();
                    return str || `Column ${i + 1}`;
                });

                const rows = rawData.slice(1);
                return { name, headers, rows };
            });

            setSheets(parsedSheets);
            setActiveSheetIdx(0);
        } catch (err: any) {
            logger.error('[FilePreviewView] load error:', err);
            setError(err?.message || 'Failed to load file preview. The file may be private or the link expired.');
        } finally {
            setLoading(false);
        }
    }, [artifact, fetchValidUrl, isHtml, isImage, isJson, isPdf, isText, isCsv, isExcel]);

    useEffect(() => {
        loadFile();
    }, [loadFile]);

    // ── Active sheet data ────────────────────────────────────────────────────────
    const activeSheet = useMemo<ParsedSheet>(() => {
        return sheets[activeSheetIdx] || { name: 'Empty', headers: [], rows: [] };
    }, [sheets, activeSheetIdx]);

    // ── Filter rows by search ───────────────────────────────────────────────────
    const filteredRows = useMemo(() => {
        if (!searchQuery.trim()) return activeSheet.rows;
        const q = searchQuery.toLowerCase();
        return activeSheet.rows.filter(row =>
            row.some(val => val !== null && String(val).toLowerCase().includes(q))
        );
    }, [activeSheet.rows, searchQuery]);

    // ── Sort rows ───────────────────────────────────────────────────────────────
    const sortedRows = useMemo(() => {
        if (sortCol === null) return filteredRows;
        return [...filteredRows].sort((a, b) => {
            const valA = a[sortCol];
            const valB = b[sortCol];

            if (valA === null || valA === undefined) return 1;
            if (valB === null || valB === undefined) return -1;

            const numA = Number(valA);
            const numB = Number(valB);
            if (!isNaN(numA) && !isNaN(numB)) {
                return sortDir === 'asc' ? numA - numB : numB - numA;
            }

            const strA = String(valA).toLowerCase();
            const strB = String(valB).toLowerCase();
            if (strA < strB) return sortDir === 'asc' ? -1 : 1;
            if (strA > strB) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filteredRows, sortCol, sortDir]);

    // ── Paginate rows ───────────────────────────────────────────────────────────
    const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
    const paginatedRows = useMemo(() => {
        const start = (page - 1) * pageSize;
        return sortedRows.slice(start, start + pageSize);
    }, [sortedRows, page, pageSize]);

    // Reset pagination on filter or sheet switch
    useEffect(() => {
        setPage(1);
        setSelectedRow(null);
    }, [searchQuery, activeSheetIdx, sortCol, sortDir]);

    // ── Sort toggle ─────────────────────────────────────────────────────────────
    function handleSort(colIdx: number) {
        if (sortCol === colIdx) {
            if (sortDir === 'asc') setSortDir('desc');
            else {
                setSortCol(null);
                setSortDir('asc');
            }
        } else {
            setSortCol(colIdx);
            setSortDir('asc');
        }
    }

    // ── Direct Download Action ──────────────────────────────────────────────────
    async function handleDownload() {
        setDownloading(true);
        try {
            let url = artifact.downloadUrl;
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
            setDownloading(false);
        }
    }

    // ── Public Share Action (Compact branded link) ───────────────────────────
    async function handleShare() {
        setSharing(true);
        try {
            if (artifact.key) {
                const query = new URLSearchParams({
                    key: artifact.key,
                    filename: fileName,
                    title: artifact.title || fileName,
                });
                const res = await fetch(resolveAiApiUrl(`/ai-api/ai/exports/share?${query.toString()}`));
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
            if (artifact.downloadUrl) {
                await navigator.clipboard.writeText(artifact.downloadUrl);
                setCopiedShare(true);
                setTimeout(() => setCopiedShare(false), 2500);
            }
        } catch {
            if (artifact.downloadUrl) {
                await navigator.clipboard.writeText(artifact.downloadUrl);
                setCopiedShare(true);
                setTimeout(() => setCopiedShare(false), 2500);
            }
        } finally {
            setSharing(false);
        }
    }

    // ── Copy as CSV / TSV ───────────────────────────────────────────────────────
    function handleCopyCsv() {
        const lines = [
            activeSheet.headers.join(','),
            ...activeSheet.rows.map(r =>
                r.map(v => {
                    const s = String(v ?? '');
                    return s.includes(',') || s.includes('"') || s.includes('\n')
                        ? `"${s.replace(/"/g, '""')}"`
                        : s;
                }).join(',')
            ),
        ];
        navigator.clipboard.writeText(lines.join('\n'));
        setCopied('csv');
        setTimeout(() => setCopied(null), 2000);
    }

    function handleCopyTsv() {
        const lines = [
            activeSheet.headers.join('\t'),
            ...activeSheet.rows.map(r => r.map(v => String(v ?? '').replace(/\t/g, ' ')).join('\t')),
        ];
        navigator.clipboard.writeText(lines.join('\n'));
        setCopied('tsv');
        setTimeout(() => setCopied(null), 2000);
    }

    const FileIcon = isHtml ? Html5Icon : isExcel ? FileSpreadsheet : isJson || isText ? FileCode : FileText;

    // ── Loading state ────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full min-h-[350px] p-8 text-center gap-3">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <div>
                    <h4 className="text-sm font-medium text-foreground">Loading file preview…</h4>
                    <p className="text-xs text-muted-foreground mt-1">Fetching and parsing {fileName}</p>
                </div>
            </div>
        );
    }

    // ── Error state ──────────────────────────────────────────────────────────────
    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-full min-h-[350px] p-8 text-center gap-4">
                <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center">
                    <AlertCircle className="w-6 h-6" />
                </div>
                <div className="max-w-md">
                    <h4 className="text-sm font-semibold text-foreground">Could not preview file</h4>
                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{error}</p>
                </div>
                <div className="flex items-center gap-2 mt-2">
                    <button
                        onClick={loadFile}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors cursor-pointer"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Retry
                    </button>
                    {(artifact.downloadUrl || artifact.key) && (
                        <button
                            onClick={handleDownload}
                            disabled={downloading}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-md hover:bg-muted transition-colors disabled:opacity-50 cursor-pointer"
                        >
                            <Download className="w-3.5 h-3.5" />
                            Direct Download
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // ── Interactive HTML Report Preview ──────────────────────────────────────────
    if (isHtml) {
        return (
            <div className="flex flex-col h-full bg-background overflow-hidden">
                {/* Unified Single Header Toolbar */}
                <div className="flex items-center justify-between px-3.5 py-2 border-b border-border/40 bg-muted/10 shrink-0 gap-2">
                    {/* Left side: Always clean, properly truncated, never wraps or leaks */}
                    <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                        <Html5Icon className="w-4 h-4 shrink-0" />
                        <span className="text-xs sm:text-sm font-semibold text-foreground truncate shrink min-w-0" title={fileName}>
                            {fileName}
                        </span>
                        <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/25 shrink-0">
                            HTML
                        </span>
                        {artifact.sizeBytes ? (
                            <span className="text-[11px] text-muted-foreground/60 shrink-0 whitespace-nowrap">
                                {humanSize(artifact.sizeBytes)}
                            </span>
                        ) : null}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                        {/* Copy HTML source */}
                        <button
                            type="button"
                            onClick={() => {
                                navigator.clipboard.writeText(htmlRaw || '');
                                setCopied('html');
                                setTimeout(() => setCopied(null), 2000);
                            }}
                            className={cn(
                                "p-1.5 rounded-lg border transition-all cursor-pointer",
                                copied === 'html'
                                    ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                                    : "border-border/60 hover:bg-muted text-foreground/80"
                            )}
                            title={copied === 'html' ? "HTML code copied to clipboard!" : "Copy raw HTML source code"}
                        >
                            {copied === 'html' ? (
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                                <Copy className="w-3.5 h-3.5" />
                            )}
                        </button>

                        {/* Share Button (Compact Link) */}
                        <button
                            type="button"
                            onClick={handleShare}
                            disabled={sharing}
                            className={cn(
                                "p-1.5 rounded-lg border transition-all cursor-pointer",
                                copiedShare
                                    ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                                    : "border-border/60 hover:bg-muted text-foreground/80"
                            )}
                            title={copiedShare ? "Link copied to clipboard!" : "Share report (compact public link)"}
                        >
                            {copiedShare ? (
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : sharing ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                            ) : (
                                <Share2 className="w-3.5 h-3.5" />
                            )}
                        </button>

                        {/* Open in new tab */}
                        <button
                            type="button"
                            onClick={() => {
                                if (!htmlRaw) return;
                                const blob = new Blob([htmlRaw], { type: 'text/html;charset=utf-8' });
                                const blobUrl = URL.createObjectURL(blob);
                                window.open(blobUrl, '_blank');
                            }}
                            className="p-1.5 rounded-lg border border-border/60 hover:bg-muted transition-colors cursor-pointer text-foreground/80"
                            title="Open interactive report in full browser tab"
                        >
                            <ExternalLink className="w-3.5 h-3.5" />
                        </button>

                        {/* Download */}
                        <button
                            type="button"
                            onClick={handleDownload}
                            disabled={downloading}
                            className="p-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-60 cursor-pointer"
                            title="Download HTML file"
                        >
                            {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                        </button>

                        {/* Close button */}
                        {onClose && (
                            <button
                                type="button"
                                onClick={onClose}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ml-0.5 cursor-pointer"
                                title="Close preview"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Content Area — High fidelity interactive HTML report rendered directly */}
                <div className="flex-1 w-full h-full overflow-hidden bg-white">
                    <iframe
                        srcDoc={htmlRaw || ''}
                        className="w-full h-full border-0 bg-white"
                        sandbox="allow-scripts allow-popups allow-modals"
                        title={fileName}
                    />
                </div>
            </div>
        );
    }

    // ── PDF preview (standalone viewer with compact controls) ─────────────────────
    if (isPdf && pdfUrl) {
        return (
            <div className="flex flex-col h-full bg-background overflow-hidden">
                <div className="flex items-center justify-between px-3.5 py-2 border-b border-border/40 bg-muted/10 shrink-0 gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                        <FileText className="w-4 h-4 text-rose-500 shrink-0" />
                        <span className="text-xs sm:text-sm font-semibold text-foreground truncate shrink min-w-0" title={fileName}>
                            {fileName}
                        </span>
                        <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-500 shrink-0">
                            PDF
                        </span>
                        {artifact.sizeBytes ? (
                            <span className="text-[11px] text-muted-foreground/60 shrink-0 whitespace-nowrap">
                                {humanSize(artifact.sizeBytes)}
                            </span>
                        ) : null}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <button
                            type="button"
                            onClick={handleShare}
                            disabled={sharing}
                            className={cn(
                                "p-1.5 rounded-lg border transition-all cursor-pointer",
                                copiedShare
                                    ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                                    : "border-border/60 hover:bg-muted text-foreground/80"
                            )}
                            title={copiedShare ? "Link copied to clipboard!" : "Share PDF"}
                        >
                            {copiedShare ? (
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : sharing ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                            ) : (
                                <Share2 className="w-3.5 h-3.5" />
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => window.open(pdfUrl, '_blank')}
                            className="p-1.5 rounded-lg border border-border hover:bg-muted transition-colors cursor-pointer text-foreground/80"
                            title="Open PDF in new tab"
                        >
                            <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={handleDownload}
                            disabled={downloading}
                            className="p-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-60 cursor-pointer"
                            title="Download PDF"
                        >
                            {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                        </button>
                        {onClose && (
                            <button
                                type="button"
                                onClick={onClose}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ml-0.5 cursor-pointer"
                                title="Close preview"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
                <div className="flex-1 w-full h-full overflow-hidden bg-muted/10 p-2">
                    {/* #toolbar=0 / #navpanes=0 ask Chrome's built-in PDF viewer to
                        drop its own chrome (the page counter, zoom, rotate, draw and
                        download strip). It is a fragment on the native plugin, so no
                        CSS from us can do this. New-tab and Download still get the
                        full viewer chrome. */}
                    <iframe
                        src={`${pdfUrl}#toolbar=0&navpanes=0&view=FitH`}
                        className="w-full h-full border-0 rounded-lg"
                        title={fileName}
                    />
                </div>
            </div>
        );
    }


    // ── Image preview ────────────────────────────────────────────────────────────
    if (imageUrl) {
        return (
            <div className="flex flex-col h-full gap-4 p-4">
                <div className="flex items-center justify-between border-b border-border/40 pb-3">
                    <div className="flex items-center gap-2">
                        <FileIcon className="w-4 h-4 text-emerald-500" />
                        <span className="text-sm font-semibold text-foreground">{fileName}</span>
                        {artifact.sizeBytes && (
                            <span className="text-xs text-muted-foreground/60">{humanSize(artifact.sizeBytes)}</span>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            onClick={handleDownload}
                            disabled={downloading}
                            className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
                        >
                            <Download className="w-3.5 h-3.5" />
                            Download
                        </button>
                        {onClose && (
                            <button
                                type="button"
                                onClick={onClose}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ml-1 cursor-pointer"
                                title="Close preview"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
                <div className="flex-1 flex items-center justify-center overflow-auto p-4 bg-muted/10 rounded-lg border border-border/40">
                    <img src={imageUrl} alt={fileName} className="max-w-full max-h-[500px] object-contain rounded-md shadow-sm" />
                </div>
            </div>
        );
    }

    // ── Text / Raw View ──────────────────────────────────────────────────────────
    if (isText || (isJson && viewMode === 'raw')) {
        return (
            <div className="flex flex-col h-full gap-3 p-4">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border/40 pb-3">
                    <div className="flex items-center gap-2">
                        <FileIcon className="w-4 h-4 text-blue-500" />
                        <span className="text-sm font-semibold text-foreground">{fileName}</span>
                        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500">
                            {ext}
                        </span>
                        {artifact.sizeBytes && (
                            <span className="text-xs text-muted-foreground/60">{humanSize(artifact.sizeBytes)}</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {isJson && sheets.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setViewMode('table')}
                                className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md border border-border hover:bg-muted transition-colors cursor-pointer"
                            >
                                <TableIcon className="w-3.5 h-3.5" />
                                Table View
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => {
                                navigator.clipboard.writeText(textRaw || jsonRaw || '');
                                setCopied('raw');
                                setTimeout(() => setCopied(null), 2000);
                            }}
                            className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md border border-border hover:bg-muted transition-colors cursor-pointer"
                        >
                            {copied === 'raw' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                            {copied === 'raw' ? 'Copied' : 'Copy'}
                        </button>
                        <button
                            type="button"
                            onClick={handleDownload}
                            disabled={downloading}
                            className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
                        >
                            <Download className="w-3.5 h-3.5" />
                            Download
                        </button>
                        {onClose && (
                            <button
                                type="button"
                                onClick={onClose}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ml-1 cursor-pointer"
                                title="Close preview"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto bg-muted/20 border border-border/40 rounded-lg p-3 font-mono text-xs text-foreground/90 whitespace-pre leading-relaxed">
                    {jsonRaw || textRaw}
                </div>
            </div>
        );
    }

    // ── Tabular View (CSV / Excel / JSON array) ──────────────────────────────────
    const totalRows = activeSheet.rows.length;
    const colCount = activeSheet.headers.length;

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Unified Single Header Toolbar */}
            <div className="flex items-center justify-between px-3.5 py-2 border-b border-border/40 bg-card/60 backdrop-blur-sm shrink-0 gap-2">
                {/* File Meta */}
                <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                        <FileIcon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs sm:text-sm font-semibold text-foreground truncate" title={fileName}>
                            {fileName}
                        </span>
                        <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 shrink-0">
                            {ext || 'DATA'}
                        </span>
                        <span className="hidden sm:inline-flex items-center text-[11px] text-muted-foreground/60 whitespace-nowrap">
                            {totalRows.toLocaleString()} rows · {colCount} cols {artifact.sizeBytes ? `· ${humanSize(artifact.sizeBytes)}` : ''}
                        </span>
                    </div>
                </div>

                {/* Actions & Integrated Search */}
                <div className="flex items-center gap-1.5 shrink-0">
                    {/* Compact Integrated Search Filter */}
                    <div className="relative w-28 sm:w-36 md:w-44 transition-all">
                        <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Filter rows..."
                            className="w-full h-7 pl-6 pr-5 text-[11px] bg-muted/20 hover:bg-muted/30 focus:bg-background border border-border/50 rounded-md focus:outline-none focus:ring-1 focus:ring-primary/40 text-foreground placeholder:text-muted-foreground/40 transition-colors"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground transition-colors cursor-pointer"
                                title="Clear filter"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        )}
                    </div>

                    {isJson && (
                        <button
                            type="button"
                            onClick={() => setViewMode('raw')}
                            className="h-7 flex items-center gap-1 text-[11px] font-medium px-2 rounded-md border border-border/60 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                            title="View Raw JSON"
                        >
                            <Code className="w-3 h-3" />
                            <span className="hidden sm:inline">JSON</span>
                        </button>
                    )}

                    {/* Quick copy buttons */}
                    <div className="hidden sm:flex items-center border border-border/60 rounded-md overflow-hidden h-7 bg-background/50">
                        <button
                            type="button"
                            onClick={handleCopyCsv}
                            className="h-full px-2 text-[11px] font-medium hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors border-r border-border/40 cursor-pointer flex items-center gap-1"
                            title="Copy table as CSV"
                        >
                            {copied === 'csv' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-muted-foreground/60" />}
                            <span>CSV</span>
                        </button>
                        <button
                            type="button"
                            onClick={handleCopyTsv}
                            className="h-full px-2 text-[11px] font-medium hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center gap-1"
                            title="Copy TSV (Paste to Excel)"
                        >
                            {copied === 'tsv' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-muted-foreground/60" />}
                            <span>TSV</span>
                        </button>
                    </div>

                    {/* Share Button */}
                    <button
                        type="button"
                        onClick={handleShare}
                        disabled={sharing}
                        className={cn(
                            "h-7 flex items-center gap-1 text-[11px] font-medium px-2 rounded-md border transition-all cursor-pointer",
                            copiedShare
                                ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                                : "border-border/60 hover:bg-muted/60 text-muted-foreground hover:text-foreground"
                        )}
                        title={copiedShare ? "Link copied!" : "Share link"}
                    >
                        {copiedShare ? (
                            <Check className="w-3 h-3 text-emerald-500" />
                        ) : sharing ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                            <Share2 className="w-3 h-3" />
                        )}
                        <span className="hidden md:inline">{copiedShare ? 'Copied' : 'Share'}</span>
                    </button>

                    {/* Primary Download Button */}
                    <button
                        type="button"
                        onClick={handleDownload}
                        disabled={downloading}
                        className="h-7 flex items-center gap-1.5 text-[11px] font-medium px-2.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-60 cursor-pointer"
                        title="Download file"
                    >
                        {downloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                        <span className="hidden xs:inline">Download</span>
                    </button>

                    {/* Close button */}
                    {onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ml-0.5 cursor-pointer"
                            title="Close preview"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Excel Sheet Switcher Sub-Bar (only displayed when multi-sheet) */}
            {sheets.length > 1 && (
                <div className="flex items-center gap-1.5 px-3.5 py-1.5 border-b border-border/30 bg-muted/15 overflow-x-auto text-xs shrink-0 [&::-webkit-scrollbar]:h-1">
                    <Layers className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0 mr-1" />
                    {sheets.map((s, idx) => (
                        <button
                            key={s.name}
                            type="button"
                            onClick={() => setActiveSheetIdx(idx)}
                            className={cn(
                                'text-[11px] px-2.5 py-0.5 rounded-md font-medium whitespace-nowrap transition-colors cursor-pointer',
                                activeSheetIdx === idx
                                    ? 'bg-primary/15 text-primary font-semibold shadow-sm'
                                    : 'text-muted-foreground/70 hover:text-foreground hover:bg-muted/40'
                            )}
                        >
                            {s.name} <span className="opacity-60 text-[10px]">({s.rows.length})</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Table Area */}
            <div className="flex-1 overflow-auto relative [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full">
                {colCount === 0 || totalRows === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full p-8 text-center text-muted-foreground/60">
                        <FileSpreadsheet className="w-10 h-10 stroke-[1.5] mb-2 opacity-40" />
                        <p className="text-sm">No data found in this sheet.</p>
                    </div>
                ) : filteredRows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full p-8 text-center text-muted-foreground/60">
                        <Search className="w-8 h-8 stroke-[1.5] mb-2 opacity-40" />
                        <p className="text-sm">No rows matching "{searchQuery}"</p>
                        <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            className="text-xs text-primary underline mt-1 cursor-pointer"
                        >
                            Clear search filter
                        </button>
                    </div>
                ) : (
                    <table className="w-full text-left border-collapse text-xs">
                        <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm shadow-sm">
                            <tr className="border-b border-border/50 bg-muted/30">
                                {/* Row Index # */}
                                <th className="w-12 px-2.5 py-2 font-mono text-[10px] text-muted-foreground/50 text-right border-r border-border/20 select-none bg-muted/40">
                                    #
                                </th>
                                {activeSheet.headers.map((col, idx) => {
                                    const isSorted = sortCol === idx;
                                    return (
                                        <th
                                            key={idx}
                                            onClick={() => handleSort(idx)}
                                            className={cn(
                                                'px-3 py-2 font-semibold text-foreground/80 select-none cursor-pointer hover:bg-muted/60 transition-colors whitespace-nowrap border-r border-border/10 last:border-r-0',
                                                isSorted && 'bg-primary/5 text-primary'
                                            )}
                                        >
                                            <div className="flex items-center justify-between gap-1.5">
                                                <span className="truncate" title={col}>
                                                    {col}
                                                </span>
                                                <span className="text-muted-foreground/40 shrink-0">
                                                    {isSorted ? (
                                                        sortDir === 'asc' ? (
                                                            <ArrowUp className="w-3 h-3 text-primary" />
                                                        ) : (
                                                            <ArrowDown className="w-3 h-3 text-primary" />
                                                        )
                                                    ) : (
                                                        <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-100" />
                                                    )}
                                                </span>
                                            </div>
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/15">
                            {paginatedRows.map((row, rowIdx) => {
                                const globalRowIndex = (page - 1) * pageSize + rowIdx + 1;
                                const isSelected = selectedRow?.index === globalRowIndex;
                                return (
                                    <tr
                                        key={rowIdx}
                                        onClick={() => setSelectedRow(isSelected ? null : { index: globalRowIndex, data: row })}
                                        className={cn(
                                            'h-9 transition-colors cursor-pointer group',
                                            isSelected
                                                ? 'bg-primary/10 hover:bg-primary/15'
                                                : 'odd:bg-background even:bg-muted/10 hover:bg-muted/30'
                                        )}
                                    >
                                        <td className="px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground/40 text-right border-r border-border/10 select-none group-hover:text-muted-foreground/70">
                                            {globalRowIndex}
                                        </td>
                                        {activeSheet.headers.map((_, cIdx) => {
                                            const cellVal = row[cIdx];
                                            const isNull = cellVal === null || cellVal === undefined || cellVal === '';
                                            const isNum = !isNull && !isNaN(Number(cellVal));
                                            return (
                                                <td
                                                    key={cIdx}
                                                    className={cn(
                                                        'px-3 py-1.5 border-r border-border/10 last:border-r-0 max-w-xs truncate',
                                                        isNum ? 'text-right font-mono text-[11px] tabular-nums text-foreground/90' : 'text-foreground/90'
                                                    )}
                                                >
                                                    {isNull ? (
                                                        <span className="text-muted-foreground/30 italic text-[11px]">null</span>
                                                    ) : (
                                                        String(cellVal)
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Bottom Status / Pagination Bar */}
            <div className="flex items-center justify-between px-3.5 py-1.5 border-t border-border/40 bg-muted/10 shrink-0 text-xs text-muted-foreground flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <span className="text-[11px]">
                        Showing {sortedRows.length === 0 ? 0 : (page - 1) * pageSize + 1}–
                        {Math.min(page * pageSize, sortedRows.length)} of {sortedRows.length} rows
                    </span>
                    {filteredRows.length !== activeSheet.rows.length && (
                        <span className="text-muted-foreground/50 text-[10px]">
                            (filtered from {activeSheet.rows.length})
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-3 ml-auto">
                    {/* Page size picker */}
                    <div className="flex items-center gap-1">
                        <span className="text-[11px]">Rows:</span>
                        <select
                            value={pageSize}
                            onChange={e => setPageSize(Number(e.target.value))}
                            className="bg-background border border-border/60 rounded px-1.5 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer"
                        >
                            {[25, 50, 100, 200].map(s => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>

                    {/* Pagination controls */}
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="p-1 rounded border border-border/60 hover:bg-muted disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                        >
                            <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-[11px] px-1 font-mono">
                            {page} / {totalPages}
                        </span>
                        <button
                            type="button"
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="p-1 rounded border border-border/60 hover:bg-muted disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                        >
                            <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Selected Row Drawer / Inspection (if row selected) */}
            {selectedRow && (
                <div className="border-t border-border/40 bg-card p-3 max-h-48 overflow-auto shrink-0 shadow-lg">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-foreground">
                                Row #{selectedRow.index} Details
                            </span>
                            <span className="text-[10px] text-muted-foreground/60">
                                ({activeSheet.headers.length} columns)
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setSelectedRow(null)}
                            className="p-1 rounded text-muted-foreground/50 hover:text-foreground transition-colors cursor-pointer"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-xs">
                        {activeSheet.headers.map((col, cIdx) => (
                            <div key={cIdx} className="bg-muted/30 rounded p-1.5 border border-border/20">
                                <div className="text-[10px] font-medium text-muted-foreground/70 truncate" title={col}>
                                    {col}
                                </div>
                                <div className="font-mono text-[11px] text-foreground truncate mt-0.5 select-all" title={String(selectedRow.data[cIdx] ?? '')}>
                                    {selectedRow.data[cIdx] !== null && selectedRow.data[cIdx] !== undefined
                                        ? String(selectedRow.data[cIdx])
                                        : <span className="text-muted-foreground/30 italic">null</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
