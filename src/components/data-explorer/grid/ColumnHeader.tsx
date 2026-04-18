// =============================================================================
// Column Header - Professional column header with type badges & FK indicator
// =============================================================================

import { ArrowUp, ArrowDown, ArrowUpDown, Key, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ColumnInfo } from '@/lib/api/data/explorer';

interface ColumnHeaderProps {
  column: ColumnInfo;
  sortColumn: string | null;
  sortDirection: 'asc' | 'desc';
  onSort: (column: string | null, direction: 'asc' | 'desc') => void;
  onColumnClick?: (column: ColumnInfo) => void;
  width?: number;
  onResize?: (width: number) => void;
  onResetWidth?: () => void;
}

export function ColumnHeader({
  column,
  sortColumn,
  sortDirection,
  onSort,
  onColumnClick,
  width,
  onResize,
  onResetWidth
}: ColumnHeaderProps) {
  const isActive = sortColumn === column.name;

  const handleSortClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isActive) onSort(column.name, 'asc');
    else if (sortDirection === 'asc') onSort(column.name, 'desc');
    else onSort(null, 'asc');
  };

  const handleHeaderClick = () => {
    if (onColumnClick) onColumnClick(column);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const startX = e.pageX;
    const startWidth = width || 200;
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (onResize) {
        onResize(Math.max(50, startWidth + (moveEvent.pageX - startX)));
      }
    };
    
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onResetWidth) onResetWidth();
  };

  return (
    <th
      className={cn(
        'text-left px-3 py-1.5 text-[12px] font-medium border-b border-border border-r border-r-border/50',
        'cursor-pointer hover:bg-muted/80 transition-colors group whitespace-nowrap select-none bg-muted',
        isActive && 'bg-primary/5',
        'relative'
      )}
      style={{ width, minWidth: width, maxWidth: width }}
      onClick={handleHeaderClick}
    >
      <div className="flex items-center gap-1.5 w-full overflow-hidden">
        {/* PK/FK icon */}
        {column.isPrimaryKey && (
          <Key className="w-3 h-3 text-amber-500 dark:text-amber-400 flex-shrink-0" />
        )}
        {column.isForeignKey && !column.isPrimaryKey && (
          <Link2 className="w-3 h-3 text-blue-500 dark:text-blue-400 flex-shrink-0" />
        )}

        {/* Column name */}
        <span className={cn(
          'truncate min-w-0',
          column.isPrimaryKey && 'text-primary font-semibold',
          column.isForeignKey && !column.isPrimaryKey && 'text-blue-600 dark:text-blue-400'
        )}>
          {column.name}
        </span>

        {/* Type badge */}
        <span 
          className="text-[10px] text-muted-foreground/50 font-normal font-mono truncate min-w-0"
          style={{ flexShrink: 9999 }}
        >
          {column.type}{column.nullable ? '?' : ''}
        </span>

        {/* FK reference tooltip-style hint */}
        {column.isForeignKey && column.fkReference && (
          <span className="text-[9px] text-blue-500/60 dark:text-blue-400/60 hidden group-hover:inline-block">
            → {column.fkReference.table}
          </span>
        )}

        {/* Sort button */}
        <button
          onClick={handleSortClick}
          className={cn(
            'flex-shrink-0 p-0.5 rounded transition-colors ml-auto',
            isActive ? 'text-primary' : 'text-muted-foreground/30 opacity-0 group-hover:opacity-100'
          )}
          title={isActive ? (sortDirection === 'asc' ? 'Sorted ascending' : 'Sorted descending') : 'Click to sort'}
        >
          {isActive ? (
            sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
          ) : (
            <ArrowUpDown className="w-3 h-3" />
          )}
        </button>
      </div>

      {/* Resizer */}
      <div
        className="absolute right-0 top-0 w-1.5 h-full cursor-col-resize hover:bg-primary z-10 transition-colors"
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        onClick={(e) => e.stopPropagation()}
        style={{ right: '-3px' }}
      />
    </th>
  );
}
