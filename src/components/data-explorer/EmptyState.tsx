// =============================================================================
// Empty State - Professional placeholder with helpful guidance
// =============================================================================

import { Database, Table2, ArrowLeft, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  hasConnection: boolean;
  onOpenConnectWizard?: () => void;
}

export function EmptyState({ hasConnection, onOpenConnectWizard }: EmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="text-center max-w-sm space-y-4">
        {!hasConnection ? (
          <>
            <div className="w-14 h-14 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mx-auto text-orange-500 shadow-xs">
              <Database className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">No connection selected</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Choose a database from the top bar or connect your PostgreSQL instance to start exploring.
              </p>
            </div>

            {onOpenConnectWizard && (
              <div className="flex items-center justify-center gap-2 pt-1">
                <Button
                  onClick={onOpenConnectWizard}
                  size="sm"
                  className="h-8 text-xs rounded-xl gap-1.5 bg-orange-600 hover:bg-orange-700 text-white font-medium shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Connection</span>
                </Button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto text-muted-foreground/50">
              <Table2 className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">Select a table</p>
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <ArrowLeft className="w-3 h-3" />
                Pick a table from the sidebar to view its data
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
