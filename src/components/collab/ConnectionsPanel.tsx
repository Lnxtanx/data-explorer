import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Database, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SharedConn } from './types';

interface ConnectionsPanelProps {
    sharedConnections: SharedConn[];
    isRefreshingDbs: boolean;
    handleRefreshSharedDbs: () => void;
}

export function ConnectionsPanel({ sharedConnections, isRefreshingDbs, handleRefreshSharedDbs }: ConnectionsPanelProps) {
    return (
        <div className="rounded-xl border bg-card/40 overflow-hidden">
            <div className="px-4 py-3 bg-muted/30 border-b flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <Database className="w-3.5 h-3.5 text-primary" />
                    <span>Shared Databases</span>
                    <Badge variant="secondary" className="font-mono text-[10px] px-1.5 py-0">
                        {sharedConnections.length}
                    </Badge>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRefreshSharedDbs}
                    disabled={isRefreshingDbs}
                    className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1"
                    title="Refresh shared databases"
                >
                    <RefreshCw className={cn("h-3 w-3", isRefreshingDbs && "animate-spin text-primary")} />
                    <span>{isRefreshingDbs ? 'Refreshing...' : 'Refresh'}</span>
                </Button>
            </div>
            <div className="p-4 bg-background/50">
                {sharedConnections.length === 0 ? (
                    <div className="text-center py-12 space-y-2">
                        <Database className="w-8 h-8 mx-auto text-muted-foreground/30" />
                        <p className="text-xs font-semibold text-foreground">No databases shared yet</p>
                        <p className="text-xs text-muted-foreground max-w-[280px] mx-auto leading-relaxed">
                            Databases become shared when you link an AI project in the <b className="font-medium text-foreground">Share Projects</b> tab
                            or when an admin shares an SW-Agent in the <b className="font-medium text-foreground">SW-Agents</b> tab.
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-2.5 sm:grid-cols-2">
                        {sharedConnections.map(conn => (
                            <div key={conn.id} className="p-3 rounded-xl border bg-card/60 flex items-center gap-3 group hover:border-primary/30 transition-colors">
                                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                    <Database className="w-4 h-4" />
                                </div>
                                <div className="min-w-0 flex-1 space-y-0.5">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-xs font-semibold text-foreground truncate">{conn.name}</span>
                                        {conn.isOnline !== undefined && (
                                            <span
                                                className={cn(
                                                    "w-1.5 h-1.5 rounded-full shrink-0",
                                                    conn.isOnline ? "bg-emerald-500" : "bg-muted-foreground/40"
                                                )}
                                                title={conn.isOnline ? "Online" : "Offline"}
                                            />
                                        )}
                                    </div>
                                    <div className="text-[11px] text-muted-foreground truncate font-mono">
                                        {conn.database}
                                        {conn.machineLabel && <span className="font-sans font-normal text-muted-foreground/80"> · {conn.machineLabel}</span>}
                                    </div>
                                </div>
                                <Badge variant="outline" className="text-[10px] font-medium uppercase px-1.5 py-0.5 shrink-0 bg-muted/40">
                                    {conn.source === 'agent' ? 'Agent' : 'Project'}
                                </Badge>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
