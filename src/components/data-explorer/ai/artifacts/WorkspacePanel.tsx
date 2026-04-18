// =============================================================================
// WorkspacePanel — Lists persisted workspace files, renders them inline.
// Appears as a side panel in AIChatMain when the user clicks "Workspace".
// =============================================================================

import { useState, useEffect } from 'react';
import { X, RefreshCw, Download, FileText, Code, BarChart3, Table2, File, ChevronDown, ChevronRight, FolderOpen, Presentation } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/api/client';
import { SlidePreviewView } from './views/SlidePreviewView';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkspaceFile {
    id: string;
    name: string;
    content_type: string;
    title: string | null;
    description: string | null;
    tags: string[];
    version: number;
    content_size: number;
    connection_id: string | null;
    created_at: string;
    updated_at: string;
    // Loaded on demand
    content?: string;
}

interface WorkspacePanelProps {
    connectionId?: string;
    sessionId?: string | null;
    onClose?: () => void;
    /** Increment this to trigger a re-fetch (e.g. after an agent run completes). */
    refreshTrigger?: number;
}

// ─── Content-type icons ───────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, typeof FileText> = {
    slide_deck: BarChart3,
    html_report: Code,
    markdown: FileText,
    csv: Table2,
    json: Code,
    sql: Code,
    text: File,
    pptx: Presentation,
    pdf: FileText,
};

const TYPE_LABELS: Record<string, string> = {
    slide_deck: 'Slide Deck',
    html_report: 'HTML Report',
    markdown: 'Markdown',
    csv: 'CSV',
    json: 'JSON',
    sql: 'SQL',
    text: 'Text',
    pptx: 'PowerPoint',
    pdf: 'PDF',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function WorkspacePanel({ connectionId, sessionId, onClose, refreshTrigger }: WorkspacePanelProps) {
    const [files, setFiles] = useState<WorkspaceFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [loadedContents, setLoadedContents] = useState<Record<string, string>>({});
    const [loadingFile, setLoadingFile] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'session' | 'all'>(sessionId ? 'session' : 'all');

    // ── Fetch file list ──────────────────────────────────────────────────────

    const fetchFiles = async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (connectionId) params.set('connection_id', connectionId);
            if (activeTab === 'session' && sessionId) {
                params.set('session_id', sessionId);
            }
            const url = `/api/workspace${params.toString() ? `?${params}` : ''}`;
            const data = await apiRequest<{ files: WorkspaceFile[]; count: number }>(url);
            setFiles(data.files || []);
        } catch (err: any) {
            setError(err.message || 'Failed to load workspace files');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchFiles(); }, [connectionId, sessionId, activeTab, refreshTrigger]);

    // ── Load file content ────────────────────────────────────────────────────

    const loadContent = async (file: WorkspaceFile) => {
        if (loadedContents[file.id]) return; // Already loaded
        setLoadingFile(file.id);
        try {
            const data = await apiRequest<WorkspaceFile & { content: string }>(`/api/workspace/${file.id}`);
            setLoadedContents(prev => ({ ...prev, [file.id]: data.content }));
        } catch (err: any) {
            console.error('Failed to load workspace file:', err);
        } finally {
            setLoadingFile(null);
        }
    };

    const handleToggle = async (file: WorkspaceFile) => {
        if (expandedId === file.id) {
            setExpandedId(null);
            return;
        }
        setExpandedId(file.id);
        await loadContent(file);
    };

    // ── Download ─────────────────────────────────────────────────────────────

    const handleDownload = (file: WorkspaceFile) => {
        // For binary files or if we want a clean download, use the direct endpoint
        const downloadUrl = `/api/workspace/download/${file.id}`;
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    // ── Render content ───────────────────────────────────────────────────────

    const renderContent = (file: WorkspaceFile) => {
        const content = loadedContents[file.id];
        const Icon = TYPE_ICONS[file.content_type] || File;

        if (!content) {
            return loadingFile === file.id ? (
                <div className="flex items-center gap-2 py-4">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                    <span className="text-xs text-muted-foreground/50">Loading...</span>
                </div>
            ) : null;
        }

        switch (file.content_type) {
            case 'slide_deck':
                return <SlidePreviewView content={content} height={320} />;
            case 'html_report':
                return (
                    <iframe
                        srcDoc={content}
                        className="w-full border border-border/30 rounded bg-white"
                        style={{ height: 400 }}
                        sandbox="allow-scripts"
                        title={file.title || file.name}
                    />
                );
            case 'markdown':
                return (
                    <pre className="text-xs text-foreground/80 whitespace-pre-wrap font-mono bg-muted/10 rounded p-3 max-h-96 overflow-auto">
                        {content}
                    </pre>
                );
            case 'pptx':
            case 'pdf':
                return (
                    <div className="flex flex-col items-center justify-center py-8 bg-muted/5 rounded-lg border border-dashed border-border/40">
                        <Icon className="w-10 h-10 text-muted-foreground/20 mb-3" />
                        <p className="text-xs text-muted-foreground/60 mb-4">Binary file available for download</p>
                        <button
                            onClick={() => handleDownload(file)}
                            className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-lg text-xs font-medium hover:bg-primary/20 transition-colors"
                        >
                            <Download className="w-3.5 h-3.5" />
                            Download {file.content_type.toUpperCase()}
                        </button>
                    </div>
                );
            default:
                return (
                    <pre className="text-xs text-foreground/70 whitespace-pre-wrap font-mono bg-muted/10 rounded p-3 max-h-96 overflow-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full">
                        {content.length > 5000 ? content.slice(0, 5000) + '\n\n... (truncated)' : content}
                    </pre>
                );
        }
    };

    // ── Group files by type ──────────────────────────────────────────────────

    const groupedFiles: Record<string, WorkspaceFile[]> = {};
    for (const f of files) {
        const key = f.content_type || 'text';
        if (!groupedFiles[key]) groupedFiles[key] = [];
        groupedFiles[key].push(f);
    }

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="flex flex-col h-full bg-background border-l border-border/40">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 shrink-0">
                <div className="flex items-center gap-2">
                    <FolderOpen className="w-4 h-4 text-primary/70" />
                    <span className="text-sm font-semibold text-foreground">Workspace</span>
                    <span className="text-[10px] text-muted-foreground/50 tabular-nums">{files.length}</span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={fetchFiles}
                        className="p-1.5 rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
                    </button>
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Tabs */}
            {sessionId && (
                <div className="flex border-b border-border/40 shrink-0 bg-muted/5">
                    <button
                        onClick={() => setActiveTab('session')}
                        className={cn(
                            "flex-1 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider transition-colors border-b-2",
                            activeTab === 'session' 
                                ? "text-primary border-primary bg-primary/5" 
                                : "text-muted-foreground/50 border-transparent hover:text-muted-foreground"
                        )}
                    >
                        Current Chat
                    </button>
                    <button
                        onClick={() => setActiveTab('all')}
                        className={cn(
                            "flex-1 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider transition-colors border-b-2",
                            activeTab === 'all' 
                                ? "text-primary border-primary bg-primary/5" 
                                : "text-muted-foreground/50 border-transparent hover:text-muted-foreground"
                        )}
                    >
                        All History
                    </button>
                </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full">
                {loading && files.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-2">
                        <RefreshCw className="w-5 h-5 text-muted-foreground/30 animate-spin" />
                        <span className="text-xs text-muted-foreground/40">Loading workspace...</span>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-2 px-4">
                        <span className="text-xs text-red-500/70">{error}</span>
                        <button onClick={fetchFiles} className="text-xs text-primary/70 hover:text-primary transition-colors">
                            Retry
                        </button>
                    </div>
                ) : files.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3 px-6 text-center">
                        <FolderOpen className="w-10 h-10 text-muted-foreground/20" />
                        <div>
                            <p className="text-sm font-medium text-muted-foreground/60">Your workspace is empty</p>
                            <p className="text-xs text-muted-foreground/40 mt-1 max-w-[200px]">
                                Ask the agent to build a report or slide deck and it will appear here automatically.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col">
                        {Object.entries(groupedFiles).map(([type, typeFiles]) => {
                            const Icon = TYPE_ICONS[type] || File;
                            return (
                                <div key={type}>
                                    {/* Group header */}
                                    <div className="px-4 py-2 bg-muted/10 border-b border-border/20">
                                        <div className="flex items-center gap-1.5">
                                            <Icon className="w-3 h-3 text-muted-foreground/40" />
                                            <span className="text-[10px] font-semibold tracking-wider text-muted-foreground/50 uppercase">
                                                {TYPE_LABELS[type] || type}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground/30 tabular-nums">{typeFiles.length}</span>
                                        </div>
                                    </div>
                                    {/* Files */}
                                    {typeFiles.map(file => (
                                        <div key={file.id} className="border-b border-border/20 last:border-0">
                                            {/* File row */}
                                            <button
                                                onClick={() => handleToggle(file)}
                                                className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-muted/20 transition-colors text-left"
                                            >
                                                {expandedId === file.id ? (
                                                    <ChevronDown className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                                                ) : (
                                                    <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-xs font-medium text-foreground truncate">
                                                        {file.title || file.name}
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="text-[10px] text-muted-foreground/40 font-mono">{file.name}</span>
                                                        <span className="text-[10px] text-muted-foreground/30">v{file.version}</span>
                                                        {file.content_size != null && (
                                                            <span className="text-[10px] text-muted-foreground/30 tabular-nums">
                                                                {file.content_size > 1024 ? `${(file.content_size / 1024).toFixed(1)}KB` : `${file.content_size}B`}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <span className="text-[10px] text-muted-foreground/30 shrink-0">
                                                    {new Date(file.updated_at).toLocaleDateString()}
                                                </span>
                                            </button>

                                            {/* Expanded content */}
                                            {expandedId === file.id && (
                                                <div className="px-4 pb-3">
                                                    {file.description && (
                                                        <p className="text-xs text-muted-foreground/50 mb-2">{file.description}</p>
                                                    )}
                                                    {file.tags?.length > 0 && (
                                                        <div className="flex gap-1 mb-2">
                                                            {file.tags.map(t => (
                                                                <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary/70">{t}</span>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {renderContent(file)}
                                                    {loadedContents[file.id] && (
                                                        <div className="flex justify-end mt-2">
                                                            <button
                                                                onClick={() => handleDownload(file)}
                                                                className="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                                                            >
                                                                <Download className="w-3 h-3" />
                                                                Download
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
