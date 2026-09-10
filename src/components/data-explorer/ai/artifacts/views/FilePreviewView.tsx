// =============================================================================
// FilePreviewView — Rich in-app preview for exported files (CSV, Excel, TSV, JSON)
// Opened in the right-side ArtifactPanel when a user clicks [View] on a file artifact.
// =============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    FileSpreadsheet, FileText, FileCode, Download, Search, Copy, Check,
    RefreshCw, AlertCircle, Loader2, ChevronLeft, ChevronRight,
    ArrowUpDown, ArrowUp, ArrowDown, ExternalLink, Table as TableIcon,
    Code, X, Layers, Eye
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '@/lib/utils';
import { API_BASE_URL } from '@/lib/api/client';
import type { AgentArtifact } from '@/hooks/useAIAgent';

function humanSize(bytes?: number): string {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface ParsedSheet {
    name: string;
    headers: string[];
    rows: (string | number | boolean | null)[][];
}

interface FilePreviewViewProps {
    artifact: AgentArtifact;
}

export function FilePreviewView({ artifact }: FilePreviewViewProps) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [downloading, setDownloading] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);

    // Parsed tabular data
    const [sheets, setSheets] = useState<ParsedSheet[]>([]);
    const [activeSheetIdx, setActiveSheetIdx] = useState(0);

    // Non-tabular content
    const [jsonRaw, setJsonRaw] = useState<string | null>(null);
    const [textRaw, setTextRaw] = useState<string | null>(null);
    const [imageUrl, setImageUrl] = useState<string | null>(null);

    // View toggles
    const [viewMode, setViewMode] = useState<'table' | 'raw'>('table');

    // Table interactive state
    const [searchQuery, setSearchQuery] = useState('');
    const [sortCol, setSortCol] = useState<number | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [selectedRow, setSelectedRow] = useState<{ index: number; data: (string | number | boolean | null)[] } | null>(null);

    const fileName = artifact.fileName || 'export';
    const ext = (fileName.split('.').pop() || artifact.fileType || '').toLowerCase();

    const isExcel = ['xlsx', 'xls', 'xlsm'].includes(ext) || artifact.fileType === 'xlsx';
    const isCsv = ['csv', 'tsv'].includes(ext) || artifact.fileType === 'csv';
    const isJson = ext === 'json' || artifact.fileType === 'json';
    const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext) || artifact.type === 'image';
    const isText = ['txt', 'log', 'md', 'sql', 'html'].includes(ext);

    // ── Re-sign or resolve download URL ─────────────────────────────────────────
    const fetchValidUrl = useCallback(async (): Promise<string> => {
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
                // fall back to stored URL
            }
        }
        if (!url) {
            throw new Error('File download URL is not available.');
        }
        return url;
    }, [artifact.downloadUrl, artifact.key]);

    // ── Load & parse file ────────────────────────────────────────────────────────
    const loadFile = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // Check if rows and columns were already provided directly on artifact
            if (artifact.rows && artifact.rows.length > 0 && artifact.columns && artifact.columns.length > 0) {
                const headers = artifact.columns.map(c => c.name);
                const rows = artifact.rows.map(r => headers.map(h => r[h] ?? null));
                setSheets([{ name: 'Data', headers, rows }]);
                setLoading(false);
                return;
            }

            const url = await fetchValidUrl();

            if (isImage) {
                setImageUrl(url);
                setLoading(false);
                return;
            }

            const res = await fetch(url);
            if (!res.ok) {
                throw new Error(`Failed to fetch file (${res.status} ${res.statusText})`);
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
            console.error('[FilePreviewView] load error:', err);
            setError(err?.message || 'Failed to load file preview. The file may be private or the link expired.');
        } finally {
            setLoading(false);
        }
    }, [artifact, fetchValidUrl, isImage, isJson, isText]);

    useEffect(() => {
        loadFile();
    }, [loadFile]);

    // ── Active sheet data ────────────────────────────────────────────────────────
    const activeSheet = sheets[activeSheetIdx] || { name: 'Sheet1', headers: [], rows: [] };

    // ── Filtered & Sorted rows ───────────────────────────────────────────────────
    const filteredRows = useMemo(() => {
        let result = activeSheet.rows;

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim();
            result = result.filter(row =>
                row.some(cell => (cell !== null && cell !== undefined ? String(cell).toLowerCase().includes(query) : false))
            );
        }

        if (sortCol !== null) {
            const colIdx = sortCol;
            result = [...result].sort((a, b) => {
                const va = a[colIdx];
                const vb = b[colIdx];
                if (va === vb) return 0;
                if (va === null || va === undefined) return 1;
                if (vb === null || vb === undefined) return -1;

                const numA = Number(va);
                const numB = Number(vb);
                if (!isNaN(numA) && !isNaN(numB)) {
                    return sortDir === 'asc' ? numA - numB : numB - numA;
                }
                const cmp = String(va).localeCompare(String(vb));
                return sortDir === 'asc' ? cmp : -cmp;
            });
        }

        return result;
    }, [activeSheet.rows, searchQuery, sortCol, sortDir]);

    // ── Pagination ───────────────────────────────────────────────────────────────
    const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
    const paginatedRows = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredRows.slice(start, start + pageSize);
    }, [filteredRows, page, pageSize]);

    // Reset pagination when sheet or search changes
    useEffect(() => {
        setPage(1);
    }, [activeSheetIdx, searchQuery]);

    // ── Handlers ─────────────────────────────────────────────────────────────────
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

    async function handleDownload() {
        setDownloading(true);
        try {
            const url = await fetchValidUrl();
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (err: any) {
            alert('Failed to download: ' + (err?.message || 'Unknown error'));
        } finally {
            setDownloading(false);
        }
    }

    function handleCopyTsv() {
        if (activeSheet.headers.length === 0) return;
        const headerLine = activeSheet.headers.join('\t');
        const bodyLines = filteredRows.map(r => r.map(c => (c === null || c === undefined ? '' : String(c))).join('\t'));
        const tsv = [headerLine, ...bodyLines].join('\n');
        navigator.clipboard.writeText(tsv);
        setCopied('tsv');
        setTimeout(() => setCopied(null), 2000);
    }

    function handleCopyCsv() {
        if (activeSheet.headers.length === 0) return;
        const escape = (v: any) => {
            if (v === null || v === undefined) return '';
            const s = String(v);
            return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const headerLine = activeSheet.headers.map(escape).join(',');
        const bodyLines = filteredRows.map(r => r.map(escape).join(','));
        const csv = [headerLine, ...bodyLines].join('\n');
        navigator.clipboard.writeText(csv);
        setCopied('csv');
        setTimeout(() => setCopied(null), 2000);
    }

    const FileIcon = isExcel ? FileSpreadsheet : isJson || isText ? FileCode : FileText;

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
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Retry
                    </button>
                    {(artifact.downloadUrl || artifact.key) && (
                        <button
                            onClick={handleDownload}
                            disabled={downloading}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-md hover:bg-muted transition-colors disabled:opacity-50"
                        >
                            <Download className="w-3.5 h-3.5" />
                            Direct Download
                        </button>
                    )}
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
                    <button
                        onClick={handleDownload}
                        disabled={downloading}
                        className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                        <Download className="w-3.5 h-3.5" />
                        Download
                    </button>
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
                                onClick={() => setViewMode('table')}
                                className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md border border-border hover:bg-muted transition-colors"
                            >
                                <TableIcon className="w-3.5 h-3.5" />
                                Table View
                            </button>
                        )}
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(textRaw || jsonRaw || '');
                                setCopied('raw');
                                setTimeout(() => setCopied(null), 2000);
                            }}
                            className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md border border-border hover:bg-muted transition-colors"
                        >
                            {copied === 'raw' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                            {copied === 'raw' ? 'Copied' : 'Copy'}
                        </button>
                        <button
                            onClick={handleDownload}
                            disabled={downloading}
                            className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                        >
                            <Download className="w-3.5 h-3.5" />
                            Download
                        </button>
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
            {/* Top Toolbar */}
            <div className="flex flex-col gap-2.5 px-4 py-3 border-b border-border/40 bg-muted/10 shrink-0">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    {/* File Meta */}
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                            <FileIcon className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-foreground truncate max-w-[200px]" title={fileName}>
                                    {fileName}
                                </span>
                                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 shrink-0">
                                    {ext || 'DATA'}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
                                <span>{totalRows.toLocaleString()} rows</span>
                                <span>·</span>
                                <span>{colCount} cols</span>
                                {artifact.sizeBytes && (
                                    <>
                                        <span>·</span>
                                        <span>{humanSize(artifact.sizeBytes)}</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                        {isJson && (
                            <button
                                onClick={() => setViewMode('raw')}
                                className="flex items-center gap-1 text-[11px] font-medium px-2 py-1.5 rounded-md border border-border/60 hover:bg-muted/60 transition-colors"
                                title="View Raw JSON"
                            >
                                <Code className="w-3.5 h-3.5 text-muted-foreground" />
                                JSON
                            </button>
                        )}
                        <button
                            onClick={handleCopyCsv}
                            className="flex items-center gap-1 text-[11px] font-medium px-2 py-1.5 rounded-md border border-border/60 hover:bg-muted/60 transition-colors"
                            title="Copy table as CSV"
                        >
                            {copied === 'csv' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                            {copied === 'csv' ? 'Copied' : 'CSV'}
                        </button>
                        <button
                            onClick={handleCopyTsv}
                            className="flex items-center gap-1 text-[11px] font-medium px-2 py-1.5 rounded-md border border-border/60 hover:bg-muted/60 transition-colors"
                            title="Copy TSV (Paste to Excel)"
                        >
                            {copied === 'tsv' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                            {copied === 'tsv' ? 'Copied' : 'TSV'}
                        </button>
                        <button
                            onClick={handleDownload}
                            disabled={downloading}
                            className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs disabled:opacity-60"
                        >
                            {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                            Download
                        </button>
                    </div>
                </div>

                {/* Second row: Excel Sheet Switcher & Search Bar */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    {/* Sheets tabs (if multi-sheet) */}
                    {sheets.length > 1 ? (
                        <div className="flex items-center gap-1 overflow-x-auto py-0.5 max-w-md [&::-webkit-scrollbar]:h-1">
                            <Layers className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0 mr-1" />
                            {sheets.map((s, idx) => (
                                <button
                                    key={s.name}
                                    onClick={() => setActiveSheetIdx(idx)}
                                    className={cn(
                                        'text-xs px-2.5 py-1 rounded-md font-medium whitespace-nowrap transition-colors',
                                        activeSheetIdx === idx
                                            ? 'bg-primary/15 text-primary font-semibold'
                                            : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted/40'
                                    )}
                                >
                                    {s.name} ({s.rows.length})
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div />
                    )}

                    {/* Filter / Search input */}
                    <div className="relative flex-1 sm:max-w-xs ml-auto">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Filter rows..."
                            className="w-full pl-8 pr-7 py-1 text-xs bg-background border border-border/60 rounded-md focus:outline-none focus:ring-1 focus:ring-primary/40 text-foreground placeholder:text-muted-foreground/40"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground transition-colors"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                </div>
            </div>

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
                            onClick={() => setSearchQuery('')}
                            className="text-xs text-primary underline mt-1"
                        >
                            Clear search filter
                        </button>
                    </div>
                ) : (
                    <table className="w-full text-left border-collapse text-xs">
                        <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur-xs shadow-2xs">
                            <tr className="border-b border-border/60 bg-muted/40">
                                {/* Row Index # */}
                                <th className="w-12 px-2.5 py-2 font-mono text-[10px] text-muted-foreground/50 text-right border-r border-border/20 select-none">
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
                        <tbody className="divide-y divide-border/20">
                            {paginatedRows.map((row, rowIdx) => {
                                const globalRowIndex = (page - 1) * pageSize + rowIdx + 1;
                                const isSelected = selectedRow?.index === globalRowIndex;
                                return (
                                    <tr
                                        key={rowIdx}
                                        onClick={() => setSelectedRow(isSelected ? null : { index: globalRowIndex, data: row })}
                                        className={cn(
                                            'hover:bg-muted/30 cursor-pointer transition-colors',
                                            isSelected && 'bg-primary/10 hover:bg-primary/15'
                                        )}
                                    >
                                        <td className="w-12 px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground/40 text-right border-r border-border/20 select-none">
                                            {globalRowIndex}
                                        </td>
                                        {activeSheet.headers.map((_, colIdx) => {
                                            const val = row[colIdx];
                                            const isNull = val === null || val === undefined || val === '';
                                            const str = isNull ? '' : String(val);
                                            return (
                                                <td
                                                    key={colIdx}
                                                    className="px-3 py-1.5 text-foreground/80 max-w-[240px] truncate border-r border-border/10 last:border-r-0 font-mono text-[11px]"
                                                    title={str}
                                                >
                                                    {isNull ? (
                                                        <span className="text-muted-foreground/30 italic text-[10px]">null</span>
                                                    ) : (
                                                        str
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

            {/* Row Detail Drawer (if row clicked) */}
            {selectedRow && (
                <div className="border-t border-border/60 bg-muted/20 px-4 py-3 shrink-0 max-h-48 overflow-y-auto">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/30">
                        <span className="text-xs font-semibold text-foreground">
                            Row #{selectedRow.index} Details
                        </span>
                        <button
                            onClick={() => setSelectedRow(null)}
                            className="text-xs text-muted-foreground/60 hover:text-foreground transition-colors"
                        >
                            ✕ Close
                        </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {activeSheet.headers.map((col, idx) => {
                            const val = selectedRow.data[idx];
                            return (
                                <div key={idx} className="flex flex-col bg-background/60 border border-border/30 rounded p-2">
                                    <span className="text-[10px] font-mono text-muted-foreground/60 truncate">{col}</span>
                                    <span className="text-xs font-mono text-foreground mt-0.5 break-all select-all">
                                        {val === null || val === undefined || val === '' ? (
                                            <span className="italic text-muted-foreground/30 text-[10px]">null</span>
                                        ) : (
                                            String(val)
                                        )}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Pagination Footer */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-border/40 bg-muted/10 text-xs shrink-0 select-none">
                <div className="text-muted-foreground/70 text-[11px]">
                    Showing <span className="font-semibold text-foreground">{(page - 1) * pageSize + 1}</span>–
                    <span className="font-semibold text-foreground">{Math.min(page * pageSize, filteredRows.length)}</span> of{' '}
                    <span className="font-semibold text-foreground">{filteredRows.length.toLocaleString()}</span> rows
                    {searchQuery && (
                        <span className="text-muted-foreground/50 ml-1">
                            (filtered from {totalRows.toLocaleString()})
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
                        <span>Per page:</span>
                        <select
                            value={pageSize}
                            onChange={e => {
                                setPageSize(Number(e.target.value));
                                setPage(1);
                            }}
                            className="bg-background border border-border/60 rounded px-1.5 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                        >
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                            <option value={500}>500</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page <= 1}
                            className="p-1 rounded border border-border/60 hover:bg-muted/60 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                            title="Previous Page"
                        >
                            <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-[11px] text-muted-foreground/80 px-1">
                            {page} / {totalPages}
                        </span>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page >= totalPages}
                            className="p-1 rounded border border-border/60 hover:bg-muted/60 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                            title="Next Page"
                        >
                            <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
