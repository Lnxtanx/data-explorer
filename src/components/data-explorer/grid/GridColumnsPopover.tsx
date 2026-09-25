// =============================================================================
// GridColumnsPopover - Modular Column Visibility & Search Popover
// Isolated search state prevents keystroke re-renders across the main TableGrid.
// =============================================================================

import { Eye, EyeOff, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { ColumnInfo } from '../api/types';
import { useState } from 'react';

interface GridColumnsPopoverProps {
  columns: ColumnInfo[];
  hiddenColumns: Set<string>;
  onToggleColumn: (columnName: string) => void;
  onShowAll: () => void;
  onHideAllExceptPK: () => void;
}

export function GridColumnsPopover({
  columns,
  hiddenColumns,
  onToggleColumn,
  onShowAll,
  onHideAllExceptPK,
}: GridColumnsPopoverProps) {
  const [searchTerm, setSearchTerm] = useState('');

  if (columns.length === 0) return null;

  const filteredColumns = columns.filter((c) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return c.name.toLowerCase().includes(term) || c.type.toLowerCase().includes(term);
  });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px] gap-1">
          <Eye className="w-3 h-3" />
          Columns
          {hiddenColumns.size > 0 && (
            <span className="text-[10px] text-muted-foreground">
              ({columns.length - hiddenColumns.size}/{columns.length})
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-2.5" align="start">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-xs font-semibold text-foreground">Columns</span>
          <span className="text-[10px] text-muted-foreground">
            {columns.length - hiddenColumns.size} / {columns.length} visible
          </span>
        </div>
        {columns.length > 5 && (
          <div className="relative mb-2">
            <Search className="w-3 h-3 absolute left-2 top-2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search columns…"
              className="h-7 text-xs pl-7 bg-background/50"
            />
          </div>
        )}
        <div className="max-h-60 overflow-y-auto space-y-0.5 pr-0.5">
          {filteredColumns.map((col) => (
            <button
              key={col.name}
              onClick={() => onToggleColumn(col.name)}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1 rounded text-xs hover:bg-muted transition-colors text-left',
                hiddenColumns.has(col.name) && 'opacity-50'
              )}
            >
              {hiddenColumns.has(col.name) ? (
                <EyeOff className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              ) : (
                <Eye className="w-3 h-3 text-foreground flex-shrink-0" />
              )}
              <span className={cn('truncate', col.isPrimaryKey && 'text-primary font-medium')}>
                {col.name}
              </span>
              <span className="ml-auto text-[10px] text-muted-foreground">{col.type}</span>
            </button>
          ))}
        </div>
        <div className="pt-2 mt-2 border-t border-border flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onShowAll}
            className="h-6 text-[11px] px-2 text-primary hover:text-primary font-medium"
            disabled={hiddenColumns.size === 0}
          >
            Show all
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onHideAllExceptPK}
            className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground"
            disabled={hiddenColumns.size >= columns.length - 1}
          >
            Hide except PK
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
