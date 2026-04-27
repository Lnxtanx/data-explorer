// =============================================================================
// Connection Selector - Dropdown to pick a database connection
// =============================================================================

import { useState } from 'react';
import { ChevronDown, Database, Check, Users, Plus, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useConnections } from '@/lib/api/data/connection';
import type { Connection } from '@/lib/api/data/connection';
import { ConnectionFormModal } from './ConnectionFormModal';
import { useAuth } from '@/components/auth/AuthProvider';
import { toast } from 'sonner';

interface ConnectionSelectorProps {
  selectedConnectionId: string | null;
  onConnectionChange: (connectionId: string | null) => void;
}

export function ConnectionSelector({
  selectedConnectionId,
  onConnectionChange,
}: ConnectionSelectorProps) {
  const { user } = useAuth();
  const { data: connections, isLoading } = useConnections();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const selectedConnection = connections?.find(c => c.id === selectedConnectionId);

  const handleAddConnection = () => {
    if (!user) {
      toast.error('Authentication Required', {
        description: 'Please sign in to add your own database connections.',
      });
      return;
    }
    setEditingId(null);
    setIsAddModalOpen(true);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-between text-left h-8 px-2.5 text-xs font-medium"
          >
            <div className="flex items-center gap-1.5 truncate">
              <Database className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
              <span className="truncate">
                {selectedConnection?.name || 'Connections'}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 ml-2 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuItem
            onClick={handleAddConnection}
            className="flex items-center gap-2 py-2 text-blue-600 dark:text-blue-400 font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Connection
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />

          {isLoading ? (
            <DropdownMenuItem disabled>Loading...</DropdownMenuItem>
          ) : connections && connections.length > 0 ? (
            connections.map((connection) => (
              <DropdownMenuItem
                key={connection.id}
                onClick={() => onConnectionChange(connection.id)}
                className="flex items-center justify-between group"
              >
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{connection.name}</span>
                      {connection.isShared && (
                        <div className="flex items-center gap-0.5 px-1 py-0 rounded bg-primary/10 text-[9px] text-primary font-bold uppercase">
                          <Users className="w-2.5 h-2.5" />
                          Shared
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {connection.database}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(connection.id);
                      setIsAddModalOpen(true);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-muted rounded-md transition-opacity"
                  >
                    <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  {selectedConnectionId === connection.id && (
                    <Check className="w-4 h-4 text-primary" />
                  )}
                </div>
              </DropdownMenuItem>
            ))
          ) : (
            <div className="px-2 py-6 text-center space-y-2">
              <Database className="w-8 h-8 mx-auto text-muted-foreground/20" />
              <p className="text-xs text-muted-foreground font-medium">No connections found</p>
              {!user && (
                <p className="text-[10px] text-muted-foreground/60 px-2 leading-relaxed text-balance">
                  Sign in to see your databases or add a new one.
                </p>
              )}
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConnectionFormModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingId(null);
        }}
        editingId={editingId}
      />
    </>
  );
}
