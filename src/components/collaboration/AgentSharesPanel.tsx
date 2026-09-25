import { Loader2, Database, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { connectorKeys } from '../connector/api/index';
import { SectionLabel } from './primitives';
import type { QueryClient } from '@tanstack/react-query';
import type { AgentEntry } from './types';

interface AgentSharesPanelProps {
    allAgentEntries: AgentEntry[];
    agentSharesLoading: boolean;
    canManage: boolean;
    shareAgentMutation: { mutate: (agentId: string) => void; isPending: boolean };
    unshareAgentMutation: { mutate: (shareId: string) => void; isPending: boolean };
    queryClient: QueryClient;
    queryKeys: { agentShares: (teamId: string) => unknown[] };
    selectedTeamId: string;
}

export function AgentSharesPanel({
    allAgentEntries,
    agentSharesLoading,
    canManage,
    shareAgentMutation,
    unshareAgentMutation,
    queryClient,
    queryKeys,
    selectedTeamId,
}: AgentSharesPanelProps) {
    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            <div className="space-y-2">
                <div className="flex items-center justify-between px-0.5">
                    <SectionLabel>Connectors ({allAgentEntries.length})</SectionLabel>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            queryClient.invalidateQueries({ queryKey: queryKeys.agentShares(selectedTeamId) });
                            queryClient.invalidateQueries({ queryKey: connectorKeys.list });
                        }}
                        className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1"
                        title="Refresh connectors list"
                        aria-label="Refresh connectors list"
                    >
                        <RefreshCw className="h-3 w-3" />
                        <span>Refresh</span>
                    </Button>
                </div>

                <div className="rounded-xl border bg-card/40 overflow-hidden divide-y divide-border/60">
                    {agentSharesLoading ? (
                        Array.from({ length: 2 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-3 p-3.5">
                                <Skeleton className="h-8 w-8 rounded-lg" />
                                <div className="space-y-1.5 flex-1">
                                    <Skeleton className="h-3 w-28" />
                                    <Skeleton className="h-2.5 w-40" />
                                </div>
                            </div>
                        ))
                    ) : allAgentEntries.length === 0 ? (
                        <div className="py-12 flex flex-col items-center text-center space-y-1.5 text-muted-foreground">
                            <Database className="w-8 h-8 text-muted-foreground/30" />
                            <p className="text-xs font-semibold text-foreground">No connectors found</p>
                            <p className="text-[11px] text-muted-foreground/70 max-w-[260px]">
                                Connect a connector to share local databases with your team.
                            </p>
                        </div>
                    ) : (
                        allAgentEntries.map(agent => (
                            <div key={agent.agent_id} className="flex items-center justify-between p-3.5 hover:bg-muted/20 transition-colors">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className={cn(
                                        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                                        agent.is_shared ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                                    )}>
                                        <Database className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0 space-y-0.5">
                                        <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                            <span className="truncate">{agent.machine_label}</span>
                                            {agent.is_shared && (
                                                <Badge className="bg-primary/10 text-primary border-none text-[9.5px] font-medium uppercase px-1.5 py-0 shrink-0">Shared</Badge>
                                            )}
                                            {agent.is_online !== undefined && (
                                                <span
                                                    className={cn(
                                                        "w-1.5 h-1.5 rounded-full shrink-0",
                                                        agent.is_online ? "bg-emerald-500" : "bg-muted-foreground/40"
                                                    )}
                                                    title={agent.is_online ? "Online" : "Offline"}
                                                />
                                            )}
                                        </div>
                                        <div className="text-[11px] text-muted-foreground font-mono truncate">
                                            <span>{agent.agent_id}</span>
                                            {agent.shared_by_name && !agent.is_own && (
                                                <span className="font-sans font-normal text-muted-foreground/80"> · shared by {agent.shared_by_name}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                {canManage && (
                                    <Button
                                        variant={agent.is_shared ? "outline" : "default"}
                                        size="sm"
                                        disabled={shareAgentMutation.isPending || unshareAgentMutation.isPending}
                                        onClick={() => {
                                            if (agent.is_shared && agent.share_id) {
                                                unshareAgentMutation.mutate(agent.share_id);
                                            } else {
                                                shareAgentMutation.mutate(agent.agent_id);
                                            }
                                        }}
                                        className={cn(
                                            "h-7 px-3 rounded-lg text-xs font-medium shrink-0 ml-3",
                                            agent.is_shared && "text-muted-foreground hover:text-destructive hover:border-destructive/30"
                                        )}
                                        aria-label={agent.is_shared ? `Unshare ${agent.machine_label}` : `Share ${agent.machine_label} with team`}
                                    >
                                        {agent.is_shared
                                            ? (unshareAgentMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Unshare')
                                            : (shareAgentMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Share with Team')}
                                    </Button>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
