// =============================================================================
// GridRow - High-Performance Memoized Virtual Table Row
// Optimized for smooth scrolling with localized copy feedback.
// =============================================================================

import React, { memo, useState, useCallback } from 'react';
import { Check, Copy, ChevronRight, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ColumnInfo } from '@/lib/api/data/explorer/types';

export function formatCellValue(value: any): string {
  if (value === null) return 'NULL';
  if (value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '[Object]';
    }
  }
  return String(value);
}

export interface GridRowProps {
  row: any;
  rowIndex: number;
  rowNum: number;
  virtualRow: {
    key: any;
    size: number;
    start: number;
  };
  visibleColumns: ColumnInfo[];
  resolvedWidths: Record<string, number>;
  onCellDoubleClick: (value: any, column: ColumnInfo, rowIndex: number) => void;
  onCellMouseEnter: (e: React.MouseEvent<HTMLElement>, value: any, column: ColumnInfo, rowIndex: number, hasExpandable: boolean) => void;
  onCellMouseLeave: () => void;
  onCopyCell: (value: any, cellKey: string) => void;
}

export const GridRow = memo(function GridRow({
  row,
  rowIndex,
  rowNum,
  virtualRow,
  visibleColumns,
  resolvedWidths,
  onCellDoubleClick,
  onCellMouseEnter,
  onCellMouseLeave,
  onCopyCell,
}: GridRowProps) {
  if (!row) return null;

  // Localized copied cell state - prevents parent TableGrid from re-rendering
  const [localCopiedCell, setLocalCopiedCell] = useState<string | null>(null);

  const handleCopy = useCallback(async (value: any, cellKey: string) => {
    await onCopyCell(value, cellKey);
    setLocalCopiedCell(cellKey);
    setTimeout(() => {
      setLocalCopiedCell((prev) => (prev === cellKey ? null : prev));
    }, 1500);
  }, [onCopyCell]);

  return (
    <tr
      key={virtualRow.key}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: `${virtualRow.size}px`,
        transform: `translateY(${virtualRow.start}px)`,
      }}
      className={cn(
        'group',
        rowIndex % 2 === 0 ? 'bg-background' : 'bg-muted/20',
        'hover:bg-accent/50'
      )}
    >
      <td
        className="w-10 min-w-[40px] max-w-[40px] px-2 py-[6px] text-[11px] text-muted-foreground/50 border-r border-border border-b border-b-border/40 text-center tabular-nums select-none"
        style={{ width: 40 }}
      >
        {rowNum}
      </td>
      {visibleColumns.map((column) => {
        const cellKey = `${rowIndex}-${column.name}`;
        const value = row[column.name];
        const isCopied = localCopiedCell === cellKey;
        const formattedText = formatCellValue(value);
        const hasExpandableContent =
          value !== null &&
          value !== undefined &&
          (formattedText.length > 18 || formattedText.includes('\n'));
        const colWidth = resolvedWidths[column.name] || 200;

        return (
          <td
            key={column.name}
            className="group/cell px-3 py-[6px] border-r border-border/40 border-b border-b-border/40 last:border-r-0 relative cursor-default overflow-hidden select-text"
            style={{
              width: colWidth,
              minWidth: colWidth,
              maxWidth: colWidth,
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onCellDoubleClick(value, column, rowIndex);
            }}
            onMouseEnter={(e) => {
              onCellMouseEnter(e, value, column, rowIndex, hasExpandableContent);
            }}
            onMouseLeave={onCellMouseLeave}
          >
            {value === null ? (
              <span className="text-muted-foreground/30 italic text-[12px]">NULL</span>
            ) : typeof value === 'boolean' ? (
              <span
                className={cn(
                  'inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium',
                  value ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'
                )}
              >
                {String(value)}
              </span>
            ) : (
              <div className="flex items-center gap-1 min-w-0 w-full h-full">
                <span className="flex-1 text-[12px] truncate">
                  {formattedText}
                </span>
                {column.isForeignKey && column.fkReference && (
                  <ChevronRight className="w-3 h-3 text-blue-400/60 flex-shrink-0" />
                )}
                {value !== null && value !== undefined && (
                  <button
                    type="button"
                    className="opacity-0 group-hover/cell:opacity-100 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-opacity shrink-0 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopy(value, cellKey);
                    }}
                    title="Copy cell value"
                  >
                    {isCopied ? (
                      <Check className="w-2.5 h-2.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-2.5 h-2.5" />
                    )}
                  </button>
                )}
                {hasExpandableContent && (
                  <button
                    type="button"
                    className="opacity-0 group-hover/cell:opacity-100 p-0.5 rounded text-muted-foreground hover:text-primary hover:bg-muted/80 transition-opacity shrink-0 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCellDoubleClick(value, column, rowIndex);
                    }}
                    title="Inspect in full modal (Double-click)"
                  >
                    <Maximize2 className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            )}
            {isCopied && (
              <span className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 text-[10px] text-green-600 bg-green-50 dark:bg-green-900/40 dark:text-green-400 px-1.5 py-0.5 rounded shadow-sm">
                <Check className="w-2.5 h-2.5" />
                Copied
              </span>
            )}
          </td>
        );
      })}
      {/* Fill remaining space */}
      <td className="min-w-0 border-b border-b-border/40 pointer-events-none"></td>
    </tr>
  );
}, (prev, next) => {
  return (
    prev.virtualRow.key === next.virtualRow.key &&
    prev.virtualRow.start === next.virtualRow.start &&
    prev.virtualRow.size === next.virtualRow.size &&
    prev.row === next.row &&
    prev.rowIndex === next.rowIndex &&
    prev.visibleColumns === next.visibleColumns &&
    prev.resolvedWidths === next.resolvedWidths
  );
});
