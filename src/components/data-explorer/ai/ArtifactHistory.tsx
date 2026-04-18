import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ExternalLink, Database, Copy, Check, FileSpreadsheet, FileText as FileTextIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useArtifactHistory } from '@/hooks/useAIChats';
import { ArtifactView } from './artifacts/ArtifactView';
import { exportCsv, exportExcel } from './artifacts/exportUtils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

const TYPE_LABELS: Record<string, string> = {
    all: 'All',
    table: 'Table',
    chart: 'Chart',
    stats: 'Stats',
    anomalies: 'Anomalies',
    quality: 'Quality',
    joins: 'Joins',
    metrics: 'Metrics',
    slide_deck: 'Slides',
    report: 'Report',
    file: 'File',
    image: 'Image',
};

const ALL_TYPES = ['all', 'table', 'chart', 'stats', 'anomalies', 'quality', 'joins', 'metrics', 'slide_deck', 'report', 'file', 'image'] as const;

// ─── Sub-Components ─────────────────────────────────────────────────────────

function ArtifactHistoryCard({ item, onOpenChat, navigate }: { 
    item: any; 
    onOpenChat?: (chatId: string) => void;
    navigate: any;
}) {
    const [copied, setCopied] = useState(false);
    const artifact = item.artifact as any;

    const copySql = () => {
        if (!artifact.sql) return;
        navigator.clipboard.writeText(artifact.sql);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="flex flex-col gap-2.5 group break-inside-avoid mb-8">
            {/* Card Metadata Header */}
            <div className="flex items-center justify-between px-1.5">
                <div className="flex flex-col min-w-0 flex-1 pr-4">
                    <span className="text-[11px] font-bold tracking-tight text-muted-foreground/40 uppercase truncate group-hover:text-primary/40 transition-colors">
                        {item.chatTitle || "Untitled Session"}
                    </span>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground/30 tabular-nums">
                            {timeAgo(item.createdAt)}
                        </span>
                        {item.connectionId && (
                            <span className="flex items-center gap-1 text-[9px] text-muted-foreground/20 font-mono">
                                <Database className="w-2.5 h-2.5" />
                                {item.connectionId.split('-')[0]}
                            </span>
                        )}
                        {artifact.type && (
                            <span className="px-1.5 py-0.5 rounded bg-muted/40 text-[9px] font-bold text-muted-foreground/30 uppercase tracking-tighter">
                                {artifact.type}
                            </span>
                        )}
                    </div>
                </div>
                
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* Data Exports */}
                    {artifact.rows?.length > 0 && artifact.columns?.length > 0 && (
                        <>
                            <button
                                onClick={() => exportExcel(artifact.rows, artifact.columns, item.chatTitle)}
                                className="p-2 rounded-lg text-muted-foreground/30 hover:text-emerald-500 hover:bg-emerald-500/5 transition-all outline-none"
                                title="Download Excel"
                            >
                                <FileSpreadsheet className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={() => exportCsv(artifact.rows, artifact.columns, item.chatTitle)}
                                className="p-2 rounded-lg text-muted-foreground/30 hover:text-blue-500 hover:bg-blue-500/5 transition-all outline-none"
                                title="Download CSV"
                            >
                                <FileTextIcon className="w-3.5 h-3.5" />
                            </button>
                        </>
                    )}

                    {artifact.sql && (
                        <button
                            onClick={copySql}
                            className={cn(
                                "p-2 rounded-lg transition-all outline-none",
                                copied ? "text-emerald-500 bg-emerald-500/10" : "text-muted-foreground/30 hover:text-foreground hover:bg-muted"
                            )}
                            title="Copy SQL"
                        >
                            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                    )}
                    <button
                        onClick={() => onOpenChat ? onOpenChat(item.chatId) : navigate(`/chat/${item.chatId}`)}
                        className="p-2 rounded-lg text-muted-foreground/30 hover:text-primary hover:bg-primary/5 transition-all outline-none"
                        title="Open in Chat"
                    >
                        <ExternalLink className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Rich Artifact Render */}
            <div className="relative rounded-2xl border border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden shadow-sm group-hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] group-hover:border-primary/20 group-hover:-translate-y-0.5 transition-all duration-300">
                <ArtifactView
                    artifact={artifact}
                    connectionId={item.connectionId ?? undefined}
                    variant="card"
                />
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface ArtifactHistoryProps {
    connectionId?: string;
    onOpenChat?: (chatId: string) => void;
}

export function ArtifactHistory({ connectionId, onOpenChat }: ArtifactHistoryProps) {
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
    const navigate = useNavigate();

    const { data, isLoading } = useArtifactHistory({
        connectionId,
        type: typeFilter,
        search: search || undefined,
        limit: 50,
    });

    const artifacts = data?.artifacts ?? [];

    return (
        <main className="flex-1 flex flex-col h-full bg-background/50 overflow-hidden">
            {/* Header / Filters */}
            <div className="flex flex-col gap-4 p-6 border-b border-border/40 bg-background/80 backdrop-blur-md sticky top-0 z-20">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-semibold tracking-tight text-foreground line-clamp-1">Artifact History</h2>
                        <p className="text-sm text-muted-foreground/60 hidden sm:block">Browse and reuse analysis results from your sessions.</p>
                    </div>
                    <div className="text-xs text-muted-foreground/40 font-mono tracking-widest uppercase tabular-nums">
                        {data?.total ?? 0} ITEMS
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1 group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40 group-focus-within:text-primary transition-colors" />
                        <Input
                            placeholder="Search by title or query..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full bg-muted/30 border-border/40 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:bg-background transition-all"
                        />
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none items-center">
                        {ALL_TYPES.map((t) => (
                            <button
                                key={t}
                                onClick={() => setTypeFilter(t === 'all' ? undefined : t)}
                                className={cn(
                                    "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all border shrink-0",
                                    (typeFilter === t || (t === 'all' && typeFilter === undefined))
                                        ? "bg-primary/10 text-primary border-primary/20"
                                        : "bg-background/20 border-transparent text-muted-foreground/60 hover:text-foreground hover:bg-muted/30"
                                )}
                            >
                                {TYPE_LABELS[t]}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Masonry Grid */}
            <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
                {isLoading ? (
                    <div className="columns-1 lg:columns-2 2xl:columns-3 gap-8 space-y-8">
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                            <div key={i} className="h-64 rounded-2xl bg-muted/10 animate-pulse border border-border/20 break-inside-avoid shadow-inner" />
                        ))}
                    </div>
                ) : artifacts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-32 text-center">
                        <div className="relative mb-6">
                            <div className="absolute inset-0 bg-primary/5 blur-3xl rounded-full scale-150" />
                            <div className="relative w-20 h-20 rounded-[2.5rem] bg-gradient-to-br from-muted/20 to-muted/40 border border-border/40 flex items-center justify-center text-muted-foreground/20 shadow-xl">
                                <Database className="w-10 h-10" />
                            </div>
                        </div>
                        <h3 className="text-xl font-semibold text-foreground/80 mb-2">No artifacts yet</h3>
                        <p className="text-sm text-muted-foreground/50 max-w-xs mx-auto leading-relaxed">
                            Start a chat and generate reports, charts, or data tables to see them here.
                        </p>
                    </div>
                ) : (
                    <div className="columns-1 lg:columns-2 2xl:columns-3 gap-8 space-y-8">
                        {artifacts.map((item) => (
                            <ArtifactHistoryCard 
                                key={item.id} 
                                item={item} 
                                onOpenChat={onOpenChat}
                                navigate={navigate}
                            />
                        ))}
                    </div>
                )}
            </div>
        </main>
    );
}
