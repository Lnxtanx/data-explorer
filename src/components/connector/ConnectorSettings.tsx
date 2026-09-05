import { Database, ShieldOff, Trash2, Wifi, WifiOff, RefreshCw, Info, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConnectors, useRevokeConnector, useRemoveConnector } from '@/lib/api/connector';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export function ConnectorSettings() {
    const { data: connectors = [], isLoading, isFetching, refetch } = useConnectors();
    const revokeMutation = useRevokeConnector();
    const removeMutation = useRemoveConnector();

    const handleManualRefresh = async () => {
        try {
            await refetch();
            toast.success('Connector configurations refreshed');
        } catch {
            toast.error('Failed to refresh configurations');
        }
    };

    const handleRevoke = async (connectorId: string, label: string) => {
        try {
            await revokeMutation.mutateAsync(connectorId);
            toast.success(`Connector "${label}" revoked`);
        } catch (err: any) {
            toast.error(err?.message || 'Failed to revoke connector');
        }
    };

    const handleRemove = async (connectorId: string, label: string) => {
        try {
            await removeMutation.mutateAsync(connectorId);
            toast.success(`Connector "${label}" removed permanently`);
        } catch (err: any) {
            toast.error(err?.message || 'Failed to remove connector');
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-16 font-sans">
                <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Loading configurations...</span>
            </div>
        );
    }

    if (connectors.length === 0) {
        return (
            <div className="text-center py-16 space-y-3 font-sans">
                <Database className="w-10 h-10 mx-auto text-muted-foreground/50" />
                <p className="text-sm font-semibold text-foreground">No PostgreSQL connectors registered</p>
                <p className="text-xs text-muted-foreground">
                    Add a connector to manage its credentials and proxy settings here.
                </p>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between pb-2 border-b">
                <div>
                    <h3 className="text-xl font-semibold tracking-tight">Proxy Settings</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Manage security credentials and connection status for proxy daemons.
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={handleManualRefresh} disabled={isFetching} className="h-8 text-xs rounded-xl font-medium">
                    <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", isFetching && "animate-spin")} />
                    Refresh
                </Button>
            </div>

            <div className="space-y-3">
                {connectors.map((connector) => {
                    const isRevoked = connector.status === 'revoked';
                    const isShared = connector.access_type === 'team';

                    const formattedRegisteredDate = connector.created_at && !isNaN(new Date(connector.created_at).getTime())
                        ? new Date(connector.created_at).toLocaleDateString()
                        : 'Active';

                    const formattedLastActive = connector.last_seen_at && !isNaN(new Date(connector.last_seen_at).getTime())
                        ? new Date(connector.last_seen_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
                        : null;

                    return (
                        <div
                            key={connector.id}
                            className={cn(
                                'rounded-xl border bg-background p-4 space-y-3',
                                isRevoked && 'opacity-60'
                            )}
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className={cn(
                                        'w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border',
                                        connector.is_online
                                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                            : 'bg-muted text-muted-foreground'
                                    )}>
                                        <Database className="w-4.5 h-4.5" />
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
                                <div className="flex items-center gap-2">
                                    {isShared && (
                                        <Badge
                                            variant="outline"
                                            className="text-[9.5px] uppercase px-1.5 py-0 font-medium shrink-0 bg-primary/10 text-primary border-primary/20"
                                        >
                                            <Users className="w-2.5 h-2.5 mr-1" />
                                            Team Shared
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
                                                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                                        )}
                                    >
                                        {connector.is_online ? (
                                            <><Wifi className="w-3 h-3 mr-1" /> Online</>
                                        ) : isRevoked ? (
                                            'Revoked'
                                        ) : (
                                            <><WifiOff className="w-3 h-3 mr-1" /> Offline</>
                                        )}
                                    </Badge>
                                </div>
                            </div>

                            {/* Details Grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                <div className="space-y-0.5">
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                        Status
                                    </p>
                                    <p className="text-foreground font-medium capitalize">{connector.status}</p>
                                </div>
                                <div className="space-y-0.5">
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                        Access
                                    </p>
                                    <p className="text-foreground font-medium">
                                        {isShared ? (connector.team_name ? `Team: ${connector.team_name}` : 'Shared with Team') : 'Owner (You)'}
                                    </p>
                                </div>
                                <div className="space-y-0.5">
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                        {isShared ? 'Shared By' : 'Registered'}
                                    </p>
                                    <p className="text-foreground truncate">
                                        {isShared
                                            ? (connector.shared_by_name || connector.shared_by_email || 'Team Member')
                                            : formattedRegisteredDate}
                                    </p>
                                </div>
                                {formattedLastActive && (
                                    <div className="space-y-0.5">
                                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                            Last Active
                                        </p>
                                        <p className="text-foreground">
                                            {formattedLastActive}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Actions Section */}
                            <div className="pt-2 border-t text-xs">
                                {isShared ? (
                                    <div className="flex items-center gap-2 text-muted-foreground py-0.5">
                                        <Info className="w-3.5 h-3.5 text-primary shrink-0" />
                                        <span>
                                            Managed by {connector.shared_by_name || 'the team owner'}. Credentials and connector daemon can only be modified by the owner.
                                        </span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        {!isRevoked && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 text-xs text-amber-600 hover:text-amber-700 rounded-lg"
                                                onClick={() => handleRevoke(connector.id, connector.machine_label)}
                                                disabled={revokeMutation.isPending}
                                            >
                                                <ShieldOff className="w-3.5 h-3.5 mr-1" />
                                                Revoke Credentials
                                            </Button>
                                        )}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8 text-xs text-destructive hover:text-destructive rounded-lg"
                                            onClick={() => handleRemove(connector.id, connector.machine_label)}
                                            disabled={removeMutation.isPending}
                                        >
                                            <Trash2 className="w-3.5 h-3.5 mr-1" />
                                            Remove Connector
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
