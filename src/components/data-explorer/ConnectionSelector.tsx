// =============================================================================
// Connection Selector - Clean Discovered Database Switcher for Data Explorer
// =============================================================================

import { ChevronDown, Check, Plus, LayoutDashboard, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useConnections } from '../connector/api/useConnections';
import { DatabaseEngineIcon, PostgresIcon } from '../connector/DatabaseEngineIcon';

interface ConnectionSelectorProps {
  selectedConnectionId: string | null;
  onConnectionChange: (connectionId: string | null) => void;
  onOpenConnectWizard?: () => void;
  onOpenOverview?: () => void;
}

export function ConnectionSelector({
  selectedConnectionId,
  onConnectionChange,
  onOpenConnectWizard,
  onOpenOverview,
}: ConnectionSelectorProps) {
  const { data: connections, isLoading, isFetching, refetch } = useConnections();

  const selectedConnection = connections?.find(c => c.id === selectedConnectionId);

  return (
    <div className="inline-flex items-center h-8 rounded-lg border border-border bg-card shadow-sm">
      {/* Left Icon Button: Direct 1-Click to Connector Manager */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onOpenOverview?.();
        }}
        className={cn(
          "h-full px-2.5 flex items-center justify-center rounded-l-lg hover:bg-muted/60 transition-colors shrink-0 group border-r border-border/50",
          onOpenOverview && "cursor-pointer"
        )}
        title={selectedConnection ? `Connected to ${selectedConnection.name}` : 'Open Connector Dashboard'}
      >
        <DatabaseEngineIcon
          connection={selectedConnection}
          className="w-4 h-4"
          isOnline={selectedConnection?.is_online}
          showStatusDot={true}
        />
      </button>

      {/* Right Dropdown Trigger: Opens Discovered Databases Switcher */}
      <DropdownMenu onOpenChange={(isOpen) => { if (isOpen) refetch(); }}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center justify-between gap-1.5 px-2.5 h-full text-xs font-medium rounded-r-lg hover:bg-muted/40 transition-colors min-w-0 max-w-[190px] focus:outline-none"
          >
            <span className="truncate font-medium text-foreground text-left">
              {selectedConnection?.name || 'Select Database'}
            </span>
            <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground ml-1" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-68 p-1">
          {/* Header with scan & refresh button */}
          <div className="flex items-center justify-between px-2 py-1.5 border-b border-border/40 mb-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Discovered Databases
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                refetch();
              }}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Check and refresh discovered databases"
            >
              <RefreshCw className={cn("w-3 h-3", isFetching && "animate-spin text-primary")} />
            </button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-4 gap-2 text-xs text-muted-foreground">
              <RefreshCw className="w-3 h-3 animate-spin text-primary" />
              <span>Scanning databases...</span>
            </div>
          ) : connections && connections.length > 0 ? (
            <div className="max-h-64 overflow-y-auto space-y-0.5">
              {connections.map((connection) => (
                <DropdownMenuItem
                  key={connection.id}
                  onClick={() => onConnectionChange(connection.id)}
                  className="flex items-center justify-between group cursor-pointer py-1.5 px-2 rounded-md"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <DatabaseEngineIcon
                      connection={connection}
                      className="w-4 h-4"
                      isOnline={connection.is_online}
                      showStatusDot={true}
                    />
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-xs truncate text-foreground">
                          {connection.name}
                        </span>
                        {connection.access_type === 'team' && (
                          <span className="text-[8px] uppercase font-black tracking-wide text-primary bg-primary/10 rounded px-1 py-px align-middle">
                            Team
                          </span>
                        )}
                      </div>
                        {connection.machine_label && (
                          <span className="text-[10px] text-muted-foreground truncate">
                            via {connection.machine_label}
                            {connection.access_type === 'team' && connection.shared_by_name
                              ? ` · shared by ${connection.shared_by_name}`
                              : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      {selectedConnectionId === connection.id && (
                        <Check className="w-3.5 h-3.5 text-primary" />
                      )}
                    </div>
                  </DropdownMenuItem>
                ))}
            </div>
          ) : (
            <div className="px-3 py-4 text-center space-y-2">
              <PostgresIcon className="w-6 h-6 mx-auto opacity-30 grayscale" />
              <div>
                <p className="text-xs text-muted-foreground font-medium">No active databases</p>
                <p className="text-[10px] text-muted-foreground/70 mt-0.5 leading-relaxed">
                  Start your connector agent in terminal (<code className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">sw-agent start</code>)
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[11px] px-2.5 gap-1.5 mt-1"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  refetch();
                }}
              >
                <RefreshCw className={cn("w-2.5 h-2.5", isFetching && "animate-spin text-primary")} />
                <span>Scan again</span>
              </Button>
            </div>
          )}

          <DropdownMenuSeparator className="my-1" />
          
          {onOpenOverview && (
            <DropdownMenuItem
              onClick={onOpenOverview}
              className="flex items-center gap-2 text-xs font-medium cursor-pointer py-1.5"
            >
              <LayoutDashboard className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="truncate">Connector Dashboard</span>
            </DropdownMenuItem>
          )}

          {onOpenConnectWizard && (
            <DropdownMenuItem
              onClick={onOpenConnectWizard}
              className="flex items-center gap-2 text-xs font-medium cursor-pointer py-1.5"
            >
              <Plus className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="truncate">Connect database</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}



