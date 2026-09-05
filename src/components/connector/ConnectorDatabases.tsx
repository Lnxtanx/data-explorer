// =============================================================================
// Connector Databases - Consolidated View of All Discovered Databases
// =============================================================================

import { useState, useMemo } from 'react';
import { Database, Search, RefreshCw, ArrowRight, Server, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useConnections } from '@/lib/api/data/connection';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ConnectorDatabasesProps {
    onSelectConnection?: (connectionId: string) => void;
}

export function ConnectorDatabases({ onSelectConnection }: ConnectorDatabasesProps) {
    const { data: connections = [], isLoading, isFetching, refetch } = useConnections();
    const [searchQuery, setSearchQuery] = useState('');

    const handleRefresh = async () => {
        try {
            await refetch();
            toast.success('Database list refreshed');
        } catch {
            toast.error('Failed to refresh database list');
        }
    };

    const filteredDatabases = useMemo(() => {
        if (!searchQuery.trim()) return connections;
        const q = searchQuery.toLowerCase();
        return connections.filter(
            (c) =>
                c.name.toLowerCase().includes(q) ||
                c.database.toLowerCase().includes(q) ||
                c.machine_label?.toLowerCase().includes(q) ||
                c.db_alias?.toLowerCase().includes(q)
        );
    }, [connections, searchQuery]);

    return (
        <div className="p-6 space-y-4 flex flex-col h-full overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b shrink-0 pr-8">
                <div>
                    <h3 className="text-xl font-semibold tracking-tight text-foreground">Databases</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        All PostgreSQL databases discovered across your active proxy connectors.
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRefresh}
                    disabled={isFetching}
                    className="h-8 gap-1.5 text-xs rounded-lg shadow-xs shrink-0"
                >
                    <RefreshCw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin text-primary')} />
                    <span>Refresh</span>
                </Button>
            </div>

            {/* Filter / Search Bar */}
            <div className="flex items-center justify-between gap-3 p-2 bg-muted/20 border rounded-xl shrink-0">
                <div className="relative flex-1 max-w-sm">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                    <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Filter databases by name, alias, or host machine..."
                        className="h-8 pl-7 text-xs rounded-lg bg-background pr-3"
                    />
                </div>
                <span className="text-[11px] font-mono text-muted-foreground pr-2 hidden sm:inline">
                    {filteredDatabases.length} {filteredDatabases.length === 1 ? 'database' : 'databases'} found
                </span>
            </div>

            {/* Dedicated Box for Databases */}
            <Card className="border rounded-xl shadow-none shrink-0 overflow-hidden flex-1 flex flex-col min-h-0">
                <CardHeader className="py-2.5 px-4 border-b bg-muted/10 shrink-0 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                        <Database className="w-3.5 h-3.5 text-primary" />
                        <span>Discovered PostgreSQL Databases</span>
                    </div>
                    <span className="text-[11px] font-mono text-muted-foreground">
                        {filteredDatabases.length} {filteredDatabases.length === 1 ? 'database' : 'databases'}
                    </span>
                </CardHeader>
                <CardContent className="p-0 flex-1 min-h-0">
                    {isLoading ? (
                        <div className="py-12 flex items-center justify-center text-xs text-muted-foreground gap-2">
                            <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                            <span>Discovering databases...</span>
                        </div>
                    ) : filteredDatabases.length > 0 ? (
                        <div className="divide-y max-h-[340px] overflow-y-auto">
                            {filteredDatabases.map((conn) => (
                                <div
                                    key={conn.id}
                                    className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors text-xs"
                                >
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <div
                                            className={cn(
                                                'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border',
                                                conn.is_online
                                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                                    : 'bg-muted text-muted-foreground border-border'
                                            )}
                                        >
                                            <Database className="w-4 h-4" />
                                        </div>
                                        <div className="min-w-0 flex-1 space-y-0.5">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-foreground truncate">
                                                    {conn.name}
                                                </span>
                                                {conn.db_alias && conn.db_alias !== conn.name && (
                                                    <span className="text-[10px] text-muted-foreground font-mono">
                                                        ({conn.db_alias})
                                                    </span>
                                                )}
                                                <Badge
                                                    variant="outline"
                                                    className={cn(
                                                        'text-[9px] uppercase px-1.5 py-0 font-medium shrink-0',
                                                        conn.is_online
                                                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                                            : 'bg-muted text-muted-foreground'
                                                    )}
                                                >
                                                    {conn.is_online ? 'Online' : 'Offline'}
                                                </Badge>
                                            </div>
                                            {conn.machine_label && (
                                                <p className="text-[11px] text-muted-foreground truncate">
                                                    Host: <span className="font-medium text-foreground">{conn.machine_label}</span>
                                                    {conn.agent_id && (
                                                        <span className="font-mono ml-1 text-muted-foreground/70">
                                                            ({conn.agent_id})
                                                        </span>
                                                    )}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        <Button
                                            variant="default"
                                            size="sm"
                                            onClick={() => {
                                                if (onSelectConnection) {
                                                    onSelectConnection(conn.id);
                                                    toast.success(`Switched to database "${conn.name}"`);
                                                }
                                            }}
                                            className="h-7 px-3 text-xs rounded-lg font-medium gap-1.5 shadow-xs"
                                        >
                                            <span>Explore</span>
                                            <ArrowRight className="w-3 h-3" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : connections.length > 0 ? (
                        <div className="text-center py-12 space-y-2">
                            <Database className="w-7 h-7 text-muted-foreground/30 mx-auto" />
                            <p className="text-xs text-muted-foreground">No databases match your search query.</p>
                        </div>
                    ) : (
                        <div className="p-8 text-center space-y-2">
                            <Database className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                            <p className="text-xs font-semibold text-foreground">No databases discovered</p>
                            <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
                                Start your PostgreSQL proxy on your host machine with <code className="px-1 py-0.5 bg-muted rounded font-mono text-[10px]">sw-agent start</code> to discover databases.
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
