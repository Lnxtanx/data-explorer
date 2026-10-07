import { useState } from 'react';
import {
    ChevronDown, ChevronRight,
    Trash2, ShieldOff, RefreshCw, Radio, Loader2
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    useConnectors,
    useConnectorDatabases,
    useRevokeConnector,
    useRemoveConnector,
} from './api/index';
import type { DatabaseConnector } from './api/index';
import { useConnections } from './api/useConnections';
import { DatabaseEngineIcon, PostgresIcon } from './DatabaseEngineIcon';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ConnectorListProps {
    onSelectConnection?: (connectionId: string) => void;
}

export function ConnectorList({ onSelectConnection }: ConnectorListProps) {
    const { data: connectors = [], isLoading, isFetching, refetch } = useConnectors();
    const [expandedConnector, setExpandedConnector] = useState<string | null>(null);

    const handleManualRefresh = async () => {
        try {
            await refetch();
            toast.success('Connectors list refreshed');
        } catch {
            toast.error('Failed to refresh connectors');
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-16">
                <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground font-sans">Loading connectors...</span>
            </div>
        );
    }

    if (connectors.length === 0) {
        return (
            <div className="text-center py-16 space-y-3 font-sans">
                <div className="w-12 h-12 mx-auto rounded-full bg-muted flex items-center justify-center">
                    <PostgresIcon className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-foreground">No PostgreSQL connectors registered</p>
                <p className="text-xs text-muted-foreground">
                    Install the connector CLI on your host, run <code className="px-1 py-0.5 bg-muted rounded text-[11px]">init</code>, then paste the connection key here.
                </p>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-4 flex flex-col h-full overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b shrink-0 pr-8">
                <div>
                    <h3 className="text-xl font-semibold tracking-tight text-foreground">Registered Connectors</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Active PostgreSQL connector instances and discovered databases.
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleManualRefresh}
                    disabled={isFetching}
                    className="h-8 gap-1.5 text-xs rounded-lg shadow-sm shrink-0"
                >
                    <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin text-primary")} />
                    <span>Refresh</span>
                </Button>
            </div>

            <div className="space-y-3">
                {connectors.map((connector) => (
                    <ConnectorCard
                        key={connector.id}
                        connector={connector}
                        isExpanded={expandedConnector === connector.id}
                        onToggle={() =>
                            setExpandedConnector(expandedConnector === connector.id ? null : connector.id)
                        }
                        onSelectConnection={onSelectConnection}
                    />
                ))}
            </div>
        </div>
    );
}

function ConnectorCard({
    connector,
    isExpanded,
    onToggle,
    onSelectConnection,
}: {
    connector: DatabaseConnector;
    isExpanded: boolean;
    onToggle: () => void;
    onSelectConnection?: (connectionId: string) => void;
}) {
    const { data: databases = [], isLoading: dbsLoading } = useConnectorDatabases(
        isExpanded && connector.is_online ? connector.agent_id : null
    );
    const { data: allConnections = [] } = useConnections();
    const revokeMutation = useRevokeConnector();
    const removeMutation = useRemoveConnector();

    // Team-shared connectors are read-only here: they belong to another user,
    // so management actions (revoke/remove) are not available.
    const isShared = connector.access_type === 'team';

    const handleRevoke = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await revokeMutation.mutateAsync(connector.id);
            toast.success(`Connector "${connector.machine_label}" revoked`);
        } catch (err: any) {
            toast.error(err?.message || 'Failed to revoke connector');
        }
    };

    const handleRemove = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await removeMutation.mutateAsync(connector.id);
            toast.success(`Connector "${connector.machine_label}" removed permanently`);
        } catch (err: any) {
            toast.error(err?.message || 'Failed to remove connector');
        }
    };

    const isRevoked = connector.status === 'revoked';

    return (
        <div className={cn(
            'rounded-xl border bg-background transition-colors overflow-hidden',
            isExpanded && 'ring-1 ring-primary/20'
        )}>
            {/* Connector Header */}
            <button
                onClick={onToggle}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
            >
                <div className="flex items-center gap-3 min-w-0">
                    {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                    <div className={cn(
                        'w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border',
                        connector.is_online
                            ? 'bg-emerald-500/10 border-emerald-500/20'
                            : isRevoked
                            ? 'bg-destructive/10 border-destructive/20'
                            : 'bg-muted border-border'
                    )}>
                        <DatabaseEngineIcon
                            engine="postgres"
                            className="w-5 h-5"
                            isOnline={connector.is_online}
                            showStatusDot={true}
                        />
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                            {connector.machine_label}
                        </p>
                        <p className="text-[11px] text-muted-foreground font-mono truncate">
                            {connector.agent_id}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {isShared && (
                        <Badge
                            variant="outline"
                            className="text-xs font-medium px-2.5 py-0.5 bg-primary/10 text-primary border-primary/20"
                        >
                            Team{connector.shared_by_name ? ` · ${connector.shared_by_name}` : ''}
                        </Badge>
                    )}
                    <Badge
                        variant="outline"
                        className={cn(
                            'text-xs font-medium px-2.5 py-0.5',
                            connector.is_online
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                : isRevoked
                                ? 'bg-destructive/10 text-destructive border-destructive/20'
                                : ''
                        )}
                    >
                        {connector.is_online ? (
                            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                                <Radio className="w-3 h-3 text-emerald-500 animate-pulse" />
                                Online
                            </span>
                        ) : isRevoked ? (
                            'Revoked'
                        ) : (
                            'Offline'
                        )}
                    </Badge>
                </div>
            </button>

            {/* Expanded Details */}
            {isExpanded && (
                <div className="px-4 pb-4 pt-1 border-t bg-muted/10 space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-xs">
                        <DetailItem label="Connector ID" value={connector.agent_id} mono />
                        <DetailItem label="Host Machine" value={connector.machine_label} />
                        <DetailItem label="Status" value={connector.status} />
                        <DetailItem
                            label="Last Active"
                            value={
                                connector.last_seen_at
                                    ? new Date(connector.last_seen_at).toLocaleString()
                                    : 'Never'
                            }
                        />
                    </div>

                    {/* Discovered Databases */}
                    {connector.is_online && (
                        <div className="space-y-2 pt-1 border-t">
                            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                <PostgresIcon className="w-3 h-3" />
                                <span>Discovered PostgreSQL Databases</span>
                            </div>
                            {databases.length > 0 ? (
                                <div className="space-y-1.5">
                                    {databases.map((db) => {
                                        const matchingConn = allConnections.find(
                                            (c) => c.agent_id === connector.agent_id && (c.db_alias === db.db_alias || c.database === db.database || c.name === db.database)
                                        );
                                        const resolvedConnId = matchingConn?.id || `${connector.agent_id}:${db.db_alias || db.database}`;

                                        return (
                                            <div
                                                key={db.db_alias}
                                                onClick={() => {
                                                    if (onSelectConnection) {
                                                        onSelectConnection(resolvedConnId);
                                                        toast.success(`Selected database "${db.database}"`);
                                                    }
                                                }}
                                                className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/40 hover:bg-primary/10 transition-colors border border-transparent hover:border-primary/20 text-xs cursor-pointer group"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <DatabaseEngineIcon
                                                        engine="postgres"
                                                        className="w-3.5 h-3.5"
                                                        isOnline={connector.is_online}
                                                        showStatusDot={true}
                                                    />
                                                    <span className="font-semibold text-foreground group-hover:text-primary">
                                                        {db.database}
                                                    </span>
                                                    <span className="text-muted-foreground font-mono text-[10px]">
                                                        ({db.db_alias})
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {db.version && (
                                                        <span className="text-muted-foreground text-[10px] hidden sm:inline">
                                                            {db.version}
                                                        </span>
                                                    )}
                                                    <span className="text-[11px] text-primary opacity-0 group-hover:opacity-100 font-medium transition-opacity">
                                                        Explore →
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : dbsLoading ? (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground italic px-3 py-1">
                                    <Loader2 className="w-3 h-3 animate-spin text-primary" />
                                    <span>Checking available databases...</span>
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground italic px-3">
                                    No discovered databases reported for this connector.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-2 border-t">
                        {isShared ? (
                            <p className="text-xs text-muted-foreground">
                                Shared by {connector.shared_by_name || 'a teammate'} — this connector is managed by its owner.
                            </p>
                        ) : (
                            <>
                                {!isRevoked && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 text-xs text-amber-600 hover:text-amber-700 rounded-lg"
                                        onClick={handleRevoke}
                                        disabled={revokeMutation.isPending}
                                    >
                                        <ShieldOff className="w-3.5 h-3.5 mr-1" />
                                        {revokeMutation.isPending ? 'Revoking...' : 'Revoke'}
                                    </Button>
                                )}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs text-destructive hover:text-destructive rounded-lg"
                                    onClick={handleRemove}
                                    disabled={removeMutation.isPending}
                                >
                                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                                    {removeMutation.isPending ? 'Removing...' : 'Remove'}
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function DetailItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="space-y-0.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {label}
            </p>
            <p className={cn('text-xs text-foreground truncate', mono && 'font-mono')}>
                {value}
            </p>
        </div>
    );
}

