// =============================================================================
// Table Sidebar - Professional table list with search & count
// =============================================================================

import { memo, useState } from 'react';
import { Table2, AlertTriangle, Search, X, Key, Link2, RefreshCw } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TableInfo } from '@/lib/api/data/explorer';
import {
  getExplorerErrorMessage,
  getExplorerErrorHint,
} from '@/lib/api/data/explorer/errors';

interface TableSidebarProps {
  tables: TableInfo[];
  selectedTable: TableInfo | null;
  onTableSelect: (table: TableInfo) => void;
  onPrefetchTable?: (table: TableInfo) => void;
  onRetry?: () => void;
  isLoading: boolean;
  error: Error | null;
  hasConnection: boolean;
  onOpenAIForTable?: (tableName: string) => void;
}

export const TableSidebar = memo(function TableSidebar({
  tables,
  selectedTable,
  onTableSelect,
  onPrefetchTable,
  onRetry,
  isLoading,
  error,
  hasConnection,
  onOpenAIForTable,
}: TableSidebarProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredTables = tables.filter(t =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex-1 p-2 space-y-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2 px-2 py-1.5">
            <Skeleton className="h-3.5 w-3.5 rounded" />
            <Skeleton className="h-3.5 flex-1 rounded" />
            <Skeleton className="h-3 w-8 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    const errorHint = getExplorerErrorHint(error);
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 text-center space-y-2">
        <AlertTriangle className="w-6 h-6 text-destructive mb-1" />
        <div>
          <p className="text-sm text-foreground font-medium">Failed to load tables</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-[200px] leading-relaxed">
            {getExplorerErrorMessage(error)}
          </p>
        </div>
        {errorHint && (
          <p className="text-[11px] text-muted-foreground/70 mt-1 bg-muted/50 border border-border rounded-lg px-2.5 py-1.5 leading-normal">
            {errorHint}
          </p>
        )}
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="h-7 text-xs px-3 gap-1.5 mt-2 rounded-lg font-medium shadow-xs"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Try again</span>
          </Button>
        )}
      </div>
    );
  }

  if (!hasConnection) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
        <p className="text-sm text-muted-foreground">Select a connection</p>
      </div>
    );
  }

  if (tables.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
        <Table2 className="w-6 h-6 text-muted-foreground/30 mb-2" />
        <p className="text-sm text-muted-foreground">No tables found</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Search + inline count badge */}
      <div className="px-2 py-1.5 border-b border-border">
        <div className="relative flex items-center">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Filter tables..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-7 pr-16 h-7 text-xs bg-transparent border-0 shadow-none focus-visible:ring-0"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="text-muted-foreground hover:text-foreground mr-0.5"
                title="Clear filter"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <span className="text-[10px] text-muted-foreground/70 font-mono tabular-nums bg-muted/60 px-1.5 py-0.5 rounded border border-border/40 select-none">
              {searchTerm ? `${filteredTables.length}/${tables.length}` : tables.length}
            </span>
          </div>
        </div>
      </div>

      {filteredTables.length === 0 && searchTerm ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <Search className="w-5 h-5 text-muted-foreground/30 mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">No match for "{searchTerm}"</p>
          </div>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="py-0.5">
            {filteredTables.map((table) => {
              const isSelected = selectedTable?.name === table.name && selectedTable?.schema === table.schema;
              return (
                <button
                  key={`${table.schema}.${table.name}`}
                  onClick={() => onTableSelect(table)}
                  onMouseEnter={() => onPrefetchTable?.(table)}
                  onFocus={() => onPrefetchTable?.(table)}
                  title={`${table.name} · ${table.sizeFormatted || 'unknown size'} · ~${formatNumber(table.estimatedRows)} rows${table.hasPrimaryKey ? '' : ' · No PK'}`}
                  className={cn(
                    'w-full text-left px-3 py-1.5 flex items-center gap-2 text-[13px] transition-colors',
                    'hover:bg-accent/50 group overflow-hidden',
                    isSelected
                      ? 'bg-primary/10 text-primary font-medium border-l-2 border-primary'
                      : 'text-foreground border-l-2 border-transparent'
                  )}
                >
                  <Table2 className={cn('w-3.5 h-3.5 flex-shrink-0', isSelected ? 'text-primary' : 'text-muted-foreground/60')} />
                  
                  <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-hidden">
                    <span className="truncate">{table.name}</span>
                    {!table.hasPrimaryKey && (
                      <span title="No primary key" className="flex-shrink-0">
                        <AlertTriangle className="w-3 h-3 text-amber-500" />
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto pl-1">
                    {onOpenAIForTable && (
                      <span
                        onClick={(e) => { e.stopPropagation(); onOpenAIForTable(table.name); }}
                        className="opacity-0 group-hover:opacity-100 transition-all hover:scale-110 cursor-pointer"
                        title={`Ask AI about ${table.name}`}
                      >
                        <img src="/resona.png" alt="AI" className="w-3.5 h-3.5" />
                      </span>
                    )}
                    {table.estimatedRows >= 0 && (
                      <span className={cn(
                        'text-[11px] tabular-nums',
                        isSelected ? 'text-primary/70' : 'text-muted-foreground/50'
                      )}>
                        {formatNumber(table.estimatedRows)}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
});

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
}
