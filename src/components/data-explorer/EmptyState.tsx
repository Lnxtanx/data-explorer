// =============================================================================
// Empty State - Professional placeholder with helpful guidance
// =============================================================================

import { Database, Table2, ArrowLeft } from 'lucide-react';

interface EmptyStateProps {
  hasConnection: boolean;
}

export function EmptyState({ hasConnection }: EmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-xs">
        {!hasConnection ? (
          <>
            <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
              <Database className="w-7 h-7 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">No connection selected</p>
            <p className="text-xs text-muted-foreground">Choose a database connection from the top bar to start exploring your data.</p>
          </>
        ) : (
          <>
            <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
              <Table2 className="w-7 h-7 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">Select a table</p>
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <ArrowLeft className="w-3 h-3" />
              Pick a table from the sidebar to view its data
            </p>
          </>
        )}
      </div>
    </div>
  );
}
