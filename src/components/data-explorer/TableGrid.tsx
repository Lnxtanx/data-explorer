// =============================================================================
// Table Grid - Infinite Scrolling Data Grid with Sticky Headers & Keyset Streaming
// =============================================================================

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Plus, 
  Filter, 
  RotateCw, 
  Check, 
  Eye, 
  EyeOff, 
  ChevronRight, 
  Table2, 
  RotateCcw, 
  Loader2, 
  Copy,
  Search
} from 'lucide-react';
import { cn, measureTextWidth, formatShortType } from '@/lib/utils';
import { loadColumnWidths, saveColumnWidths, loadHiddenColumns, saveHiddenColumns } from '@/lib/grid-storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EXPLORER_PAGE_SIZES, getExplorerPageSize, setExplorerPageSize } from '@/lib/explorer-preferences';
import { useTableRows, useColumnHeaderProfiles } from '@/lib/api/data/explorer';
import {
  getExplorerErrorMessage,
  getExplorerErrorHint,
  getExplorerErrorTitle,
} from '@/lib/api/data/explorer/errors';
import { useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { dataExplorerKeys } from '@/lib/api/data/explorer/hooks';
import { toast } from 'sonner';
import { ColumnStatsPanel } from './ColumnStatsPanel';
import { ColumnHeader } from './grid/ColumnHeader';
import type { TableInfo, ColumnInfo, FilterCondition, ColumnStats, ExportGridContext } from '@/lib/api/data/explorer/types';
import { logger } from '@/lib/logger';

// Single-line cells (truncated) → uniform fixed row height for virtualization
const ROW_HEIGHT = 33;

interface TableGridProps {
  connectionId: string;
  tableName: string;
  schemaName: string;
  tableInfo: TableInfo;
  /** Called when the user drills into a referenced table from the stats panel. */
  onViewReferencedTable?: (schemaName: string, tableName: string) => void;
  /** Pushes the grid's active export context up (filters/sort/columns). */
  onGridContextChange?: (context: ExportGridContext) => void;
}

export function TableGrid({ connectionId, tableName, schemaName, tableInfo, onViewReferencedTable, onGridContextChange }: TableGridProps) {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [filters, setFilters] = useState<FilterCondition[]>([]);
  const [selectedColumn, setSelectedColumn] = useState<ColumnInfo | null>(null);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => {
    return loadHiddenColumns(connectionId, schemaName, tableName);
  });
  const [columnSearchTerm, setColumnSearchTerm] = useState('');
  const [copiedCell, setCopiedCell] = useState<string | null>(null);
  const [copiedDataset, setCopiedDataset] = useState(false);
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    return loadColumnWidths(connectionId, schemaName, tableName);
  });
  const [tempFilter, setTempFilter] = useState<{ column: string; operator: FilterCondition['operator']; value: string }>({ column: '', operator: 'like', value: '' });
  const filterInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const queryClient = useQueryClient();

  // Cheap pg_stats-only distribution profiles for the header bars (one relay query).
  const { data: profilesData } = useColumnHeaderProfiles(connectionId, tableName, schemaName);
  const profilesByName = useMemo(() => {
    if (!profilesData?.columns) return new Map<string, ColumnStats>();
    return new Map(profilesData.columns.map((c) => [c.name, c]));
  }, [profilesData]);

  // Find portal targets on mount
  useEffect(() => {
    setPortalTarget(document.getElementById('table-actions-portal'));
  }, []);

  // The grid stays mounted across table switches (DataExplorerLayout no longer
  // keys it), so reset every piece of per-table UI state when the active table
  // changes. Column widths and hidden columns are re-hydrated from localStorage.
  useEffect(() => {
    setSortColumn(null);
    setSortDirection('asc');
    setFilters([]);
    setHiddenColumns(loadHiddenColumns(connectionId, schemaName, tableName));
    setColumnSearchTerm('');
    setSelectedColumn(null);
    setTempFilter({ column: '', operator: 'like', value: '' });
    setFilterPopoverOpen(false);
    setCopiedCell(null);
    setCopiedDataset(false);
    setColumnWidths(loadColumnWidths(connectionId, schemaName, tableName));
    scrollRef.current?.scrollTo({ top: 0, left: 0 });
  }, [connectionId, schemaName, tableName]);

  const [limit, setLimit] = useState<number>(() => getExplorerPageSize());

  const handlePageSizeChange = useCallback((next: number) => {
    setLimit(next);
    setExplorerPageSize(next);
    scrollRef.current?.scrollTo({ top: 0, left: 0 });
  }, []);

  // Infinite query for continuous smooth scrolling
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
    isError,
    refetch,
  } = useTableRows(
    connectionId,
    tableName,
    {
      schemaName,
      orderBy: sortColumn || undefined,
      orderDirection: sortDirection,
      filters,
      limit,
    }
  );

  // Flatten all streamed pages into continuous array of rows
  const allRows = useMemo(() => {
    return data?.pages.flatMap((page) => page.rows) || [];
  }, [data]);

  const columns = useMemo(() => {
    return data?.pages[0]?.columns || [];
  }, [data]);

  const estimatedTotal = useMemo(() => {
    const rawTotal = data?.pages[0]?.pagination?.estimatedTotal ?? tableInfo.estimatedRows;
    if (typeof rawTotal === 'number' && rawTotal >= 0) return rawTotal;
    if (typeof rawTotal === 'string') {
      const parsed = parseInt(rawTotal, 10);
      if (!isNaN(parsed) && parsed >= 0) return parsed;
    }
    return allRows.length;
  }, [data, tableInfo.estimatedRows, allRows.length]);

  const visibleColumns = useMemo(() => {
    return columns.filter((c) => !hiddenColumns.has(c.name));
  }, [columns, hiddenColumns]);

  // Push the active export context (filters/sort/visible columns) up to the
  // header ExportButton so "View" scope always exports what's on screen.
  const gridExportContext = useMemo<ExportGridContext>(() => ({
    filters,
    orderBy: sortColumn,
    orderDirection: sortDirection,
    visibleColumns: visibleColumns.map((c) => c.name),
    allColumnsCount: columns.length,
    estimatedTotal,
  }), [filters, sortColumn, sortDirection, visibleColumns, columns, estimatedTotal]);

  useEffect(() => {
    onGridContextChange?.(gridExportContext);
  }, [gridExportContext, onGridContextChange]);

  const virtualizer = useVirtualizer({
    count: allRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });
  const virtualItems = virtualizer.getVirtualItems();

  // Fetch the next page when the user approaches the end of the loaded rows
  // (virtualized rows have no sentinel element to observe).
  useEffect(() => {
    if (!virtualItems.length) return;
    const lastIndex = virtualItems[virtualItems.length - 1].index;
    if (hasNextPage && !isFetchingNextPage && lastIndex >= allRows.length - 15) {
      fetchNextPage();
    }
  }, [virtualItems, hasNextPage, isFetchingNextPage, fetchNextPage, allRows.length]);

  // When `maxPages` trims pages from the start of the dataset, the rows above
  // the viewport disappear; shift the scroll position to keep the view stable.
  const prevRowCountRef = useRef(allRows.length);
  useEffect(() => {
    const prev = prevRowCountRef.current;
    if (allRows.length < prev) {
      const el = scrollRef.current;
      if (el) {
        el.scrollTop = Math.max(0, el.scrollTop - (prev - allRows.length) * ROW_HEIGHT);
      }
    }
    prevRowCountRef.current = allRows.length;
  }, [allRows.length]);

  const handleColumnClick = useCallback((column: ColumnInfo) => {
    setSelectedColumn((prev) => (prev?.name === column.name ? null : column));
  }, []);

  const handleSort = useCallback((column: string | null, direction: 'asc' | 'desc') => {
    setSortColumn(column);
    setSortDirection(direction);
  }, []);

  const handleFiltersChange = useCallback((newFilters: FilterCondition[]) => {
    setFilters(newFilters);
  }, []);

  const handleFilterFromStats = useCallback((column: string, value: any) => {
    setFilters((prev) => {
      if (prev.some((f) => f.column === column && f.operator === 'eq' && f.value === value)) {
        return prev;
      }
      return [...prev, { column, operator: 'eq', value }];
    });
  }, []);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleColumnResize = useCallback((columnName: string, newWidth: number) => {
    setColumnWidths((prev) => {
      const next = {
        ...prev,
        [columnName]: Math.max(50, newWidth),
      };

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        saveColumnWidths(connectionId, schemaName, tableName, next);
      }, 400);

      return next;
    });
  }, [connectionId, schemaName, tableName]);

  const handleResetColumnWidth = useCallback((columnName: string) => {
    setColumnWidths((prev) => {
      const next = { ...prev };
      delete next[columnName];

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveColumnWidths(connectionId, schemaName, tableName, next);

      return next;
    });
  }, [connectionId, schemaName, tableName]);

  const handleRefresh = useCallback(async () => {
    setIsManualRefreshing(true);
    try {
      await Promise.all([
        refetch(),
        queryClient.invalidateQueries({
          queryKey: dataExplorerKeys.tables(connectionId, schemaName),
        }),
        queryClient.invalidateQueries({
          queryKey: dataExplorerKeys.schemas(connectionId),
        }),
        queryClient.invalidateQueries({
          queryKey: dataExplorerKeys.rows(connectionId, tableName),
        }),
        queryClient.invalidateQueries({
          queryKey: dataExplorerKeys.stats(connectionId, tableName, schemaName),
        }),
      ]);
    } catch {
      // Handled by React Query state
    } finally {
      setTimeout(() => {
        setIsManualRefreshing(false);
      }, 600);
    }
  }, [refetch, queryClient, connectionId, tableName, schemaName]);

  const handleCopyCell = useCallback(async (value: any, cellKey: string) => {
    const text = value === null ? 'NULL' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCell(cellKey);
      setTimeout(() => setCopiedCell(null), 1500);
    } catch {
      // Fallback
    }
  }, []);

  const handleCopyFetchedData = useCallback(async () => {
    if (allRows.length === 0) {
      toast.error('No data available to copy');
      return;
    }

    const headerRow = visibleColumns.map((c) => c.name).join('\t');
    const bodyRows = allRows.map((row) =>
      visibleColumns
        .map((c) => {
          const val = row[c.name];
          if (val === null || val === undefined) return 'NULL';
          if (typeof val === 'object') {
            try { return JSON.stringify(val); } catch { return String(val); }
          }
          return String(val);
        })
        .join('\t')
    ).join('\n');
    const text = `${headerRow}\n${bodyRows}`;

    try {
      await navigator.clipboard.writeText(text);
      setCopiedDataset(true);
      toast.success(`Copied ${allRows.length.toLocaleString()} rows to clipboard`);
      setTimeout(() => setCopiedDataset(false), 2000);
    } catch (err) {
      logger.error('Failed to copy rows:', err);
      toast.error('Failed to copy to clipboard');
    }
  }, [allRows, visibleColumns]);

  const toggleColumnVisibility = useCallback((columnName: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(columnName)) next.delete(columnName);
      else next.add(columnName);
      saveHiddenColumns(connectionId, schemaName, tableName, next);
      return next;
    });
  }, [connectionId, schemaName, tableName]);

  const handleShowAllColumns = useCallback(() => {
    const next = new Set<string>();
    setHiddenColumns(next);
    saveHiddenColumns(connectionId, schemaName, tableName, next);
  }, [connectionId, schemaName, tableName]);

  const handleHideAllExceptPK = useCallback(() => {
    const next = new Set<string>();
    for (const c of columns) {
      if (!c.isPrimaryKey) next.add(c.name);
    }
    setHiddenColumns(next);
    saveHiddenColumns(connectionId, schemaName, tableName, next);
  }, [columns, connectionId, schemaName, tableName]);

  const getColumnType = (col: ColumnInfo) => {
    const t = col.type.toLowerCase();
    if (t.includes('varchar') || t.includes('text') || t.includes('char')) return 'text';
    if (t.includes('int') || t.includes('numeric') || t.includes('decimal') || t.includes('float') || t.includes('double') || t.includes('serial')) return 'number';
    if (t.includes('bool')) return 'boolean';
    if (t.includes('date') || t.includes('time') || t.includes('timestamp')) return 'date';
    return 'general';
  };

  const operatorsByType: Record<string, string[]> = {
    text: ['like', 'not_like', 'starts_with', 'ends_with', 'eq', 'neq', 'is_empty', 'is_null', 'not_null'],
    number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is_null', 'not_null'],
    boolean: ['eq', 'neq', 'is_null', 'not_null'],
    date: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is_null', 'not_null'],
    general: ['eq', 'neq', 'like', 'in', 'is_null', 'not_null'],
  };

  const getFilteredOperators = () => {
    if (!tempFilter.column) return operatorsByType.general;
    const col = columns.find((c) => c.name === tempFilter.column);
    if (!col) return operatorsByType.general;
    return [...operatorsByType[getColumnType(col)], ...operatorsByType.general].filter((op, i, arr) => arr.indexOf(op) === i);
  };

  const handleAddFilter = () => {
    if (!tempFilter.column || !tempFilter.operator) return;
    const col = columns.find((c) => c.name === tempFilter.column);
    const colType = col ? getColumnType(col) : 'general';

    let value: any = tempFilter.value;
    if (tempFilter.operator === 'in') {
      value = tempFilter.value.split(',').map((v) => v.trim()).filter((v) => v.length > 0);
    } else if (tempFilter.operator === 'is_null' || tempFilter.operator === 'not_null' || tempFilter.operator === 'is_empty') {
      value = undefined;
    } else if (colType === 'boolean') {
      value = tempFilter.value === 'true';
    } else if (colType === 'number') {
      const n = Number(tempFilter.value);
      if (!isNaN(n) && String(tempFilter.value).trim() !== '') value = n;
    }

    handleFiltersChange([...filters, { column: tempFilter.column, operator: tempFilter.operator as FilterCondition['operator'], value }]);
    setTempFilter({ column: '', operator: 'like', value: '' });
    setFilterPopoverOpen(false);
  };

  // Smart column width calculation from initial sample rows (optimized sampling)
  const defaultWidths = useMemo(() => {
    const widths: Record<string, number> = {};
    if (columns.length === 0) return widths;

    // Fast sampling: take up to 8 representative rows
    const sampleRows = allRows.slice(0, 8);

    columns.forEach((col) => {
      // 1. Measure Exact Header Length Required (column name + short type label + icons)
      const colNameWidth = measureTextWidth(col.name, '500 12px Inter, sans-serif') || (col.name.length * 8.5);
      const shortType = formatShortType(col.type) + (col.nullable ? '?' : '');
      const shortTypeWidth = shortType ? (shortType.length * 6.5) + 6 : 0;
      const extraHeaderPadding = (col.isPrimaryKey || col.isForeignKey ? 20 : 0) + 42;
      const minHeaderWidth = Math.max(Math.ceil(colNameWidth + shortTypeWidth + extraHeaderPadding), 100);

      // 2. Measure Content Length (fast heuristic with canvas fallback for long text)
      const type = col.type.toLowerCase();
      let maxContentWidth = 0;

      for (let i = 0; i < sampleRows.length; i++) {
        const val = sampleRows[i]?.[col.name];
        if (val !== null && val !== undefined) {
          const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
          const estimated = str.length > 35 ? measureTextWidth(str.slice(0, 50), '400 13px Inter, sans-serif') : str.length * 7.8;
          if (estimated > maxContentWidth) {
            maxContentWidth = estimated;
          }
        }
      }

      const contentWidth = Math.ceil(maxContentWidth + 28);

      // Apply type-specific content bounds
      let clampedContentWidth = contentWidth;
      if (type.includes('bool')) {
        clampedContentWidth = Math.min(contentWidth, 110);
      } else if (type.includes('int') || type.includes('serial') || type.includes('numeric') || type.includes('double') || type.includes('float')) {
        clampedContentWidth = Math.min(contentWidth, 160);
      } else if (type.includes('timestamp') || type.includes('date') || type.includes('time')) {
        clampedContentWidth = Math.min(contentWidth, 200);
      } else if (type.includes('uuid')) {
        clampedContentWidth = Math.min(contentWidth, 280);
      } else {
        clampedContentWidth = Math.min(contentWidth, 450);
      }

      // Column width MUST ALWAYS be at least minHeaderWidth so the column name is NEVER truncated, even when all cells are NULL
      const finalWidth = Math.max(minHeaderWidth, clampedContentWidth);

      widths[col.name] = Math.round(finalWidth);
    });
    return widths;
  }, [columns, allRows.length > 0 ? allRows.length : 0]);

  const getWidthForColumn = useCallback((colName: string) => {
    const userW = columnWidths[colName];
    const defW = defaultWidths[colName];

    if (userW && defW && defW > userW * 2.5) {
      return defW;
    }
    return userW || defW || 200;
  }, [columnWidths, defaultWidths]);

  // Loading skeleton for initial fetch
  if (isLoading && allRows.length === 0) {
    return (
      <div className="flex-1 flex flex-col">
        {/* Header skeleton */}
        <div className="flex border-b border-border bg-muted px-3 py-2 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-24 rounded" />
          ))}
        </div>
        {/* Row skeletons */}
        <div className="flex-1 p-0">
          {Array.from({ length: 14 }).map((_, i) => (
            <div key={i} className="flex px-3 py-2 gap-4 border-b border-border/40">
              <Skeleton className="h-4 w-8 rounded" />
              {Array.from({ length: 5 }).map((_, j) => (
                <Skeleton key={j} className="h-4 w-24 rounded" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error state with retry
  if (error && allRows.length === 0) {
    const errorHint = getExplorerErrorHint(error);
    return (
      <div className="flex-1 flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3 max-w-md px-4">
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
              <X className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{getExplorerErrorTitle(error)}</p>
              <p className="text-xs text-muted-foreground mt-1">{getExplorerErrorMessage(error)}</p>
              {errorHint && (
                <p className="text-[11px] text-muted-foreground/70 mt-2 bg-muted/50 border border-border rounded-lg px-3 py-2">
                  {errorHint}
                </p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5 rounded-xl font-medium">
              <RotateCcw className="w-3.5 h-3.5" />
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative font-sans">
      {/* Action bar portaled into header */}
      {portalTarget && createPortal(
        <>
          <div className="w-px h-4 bg-border mx-1" />
          {/* Filter */}
          <Popover open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant={filters.length > 0 ? 'default' : 'ghost'}
                size="sm"
                className={cn('h-6 px-2 text-[11px] gap-1', filters.length > 0 && 'bg-primary text-primary-foreground')}
              >
                <Filter className="w-3 h-3" />
                Filter
                {filters.length > 0 && (
                  <span className="bg-primary-foreground/20 text-primary-foreground px-1 rounded-full text-[10px] min-w-[14px] text-center">
                    {filters.length}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3" align="start">
              <div className="space-y-2.5">
                <h4 className="text-xs font-semibold">Add Filter</h4>
                <Select value={tempFilter.column} onValueChange={(v) => {
                  const col = columns.find((c) => c.name === v);
                  const isBool = col && getColumnType(col) === 'boolean';
                  setTempFilter({
                    column: v,
                    operator: isBool ? 'eq' : 'like',
                    value: isBool ? 'true' : ''
                  });
                }}>
                  <SelectTrigger className="h-7 text-xs bg-background">
                    <SelectValue placeholder="Column" />
                  </SelectTrigger>
                  <SelectContent>
                    {columns.map((c) => (
                      <SelectItem key={c.name} value={c.name} className="text-xs">
                        {c.name} <span className="text-muted-foreground">({c.type})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={tempFilter.operator} onValueChange={(v) => setTempFilter({ ...tempFilter, operator: v as FilterCondition['operator'] })}>
                  <SelectTrigger className="h-7 text-xs bg-background">
                    <SelectValue placeholder="Operator" />
                  </SelectTrigger>
                  <SelectContent>
                    {getFilteredOperators().map((op) => (
                      <SelectItem key={op} value={op} className="text-xs">
                        {op === 'eq' && '= Equals'}
                        {op === 'neq' && '≠ Not equals'}
                        {op === 'gt' && '> Greater than'}
                        {op === 'gte' && '≥ Greater or equal'}
                        {op === 'lt' && '< Less than'}
                        {op === 'lte' && '≤ Less or equal'}
                        {op === 'like' && '~ Contains'}
                        {op === 'not_like' && '!~ Does not contain'}
                        {op === 'starts_with' && '^ Starts with'}
                        {op === 'ends_with' && '$ Ends with'}
                        {op === 'is_empty' && 'Is empty (blank or NULL)'}
                        {op === 'is_null' && 'IS NULL'}
                        {op === 'not_null' && 'NOT NULL'}
                        {op === 'in' && 'IN (list)'}
                        {!['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'not_like', 'starts_with', 'ends_with', 'is_empty', 'is_null', 'not_null', 'in'].includes(op) && op}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {tempFilter.operator !== 'is_null' && tempFilter.operator !== 'not_null' && tempFilter.operator !== 'is_empty' && (
                  (() => {
                    const activeCol = columns.find((c) => c.name === tempFilter.column);
                    const isBool = activeCol && getColumnType(activeCol) === 'boolean';
                    if (isBool) {
                      return (
                        <Select value={tempFilter.value || 'true'} onValueChange={(v) => setTempFilter({ ...tempFilter, value: v })}>
                          <SelectTrigger className="h-7 text-xs bg-background">
                            <SelectValue placeholder="Value" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true" className="text-xs">true (TRUE)</SelectItem>
                            <SelectItem value="false" className="text-xs">false (FALSE)</SelectItem>
                          </SelectContent>
                        </Select>
                      );
                    }
                    return (
                      <Input
                        ref={filterInputRef}
                        value={tempFilter.value}
                        onChange={(e) => setTempFilter({ ...tempFilter, value: e.target.value })}
                        placeholder={
                          tempFilter.operator === 'in' ? 'val1, val2, val3...' :
                          tempFilter.operator === 'starts_with' ? 'Starts with...' :
                          tempFilter.operator === 'ends_with' ? 'Ends with...' :
                          tempFilter.operator === 'like' ? 'Contains text...' :
                          tempFilter.operator === 'not_like' ? 'Does not contain...' :
                          'Value...'
                        }
                        className="h-7 text-xs bg-background"
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddFilter(); }}
                      />
                    );
                  })()
                )}
                <Button onClick={handleAddFilter} disabled={!tempFilter.column || !tempFilter.operator} size="sm" className="w-full h-7 text-xs rounded-lg">
                  <Plus className="w-3 h-3 mr-1" /> Add Filter
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          {/* Column visibility */}
          {columns.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px] gap-1">
                  <Eye className="w-3 h-3" />
                  Columns
                  {hiddenColumns.size > 0 && (
                    <span className="text-[10px] text-muted-foreground">({columns.length - hiddenColumns.size}/{columns.length})</span>
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
                      value={columnSearchTerm}
                      onChange={(e) => setColumnSearchTerm(e.target.value)}
                      placeholder="Search columns…"
                      className="h-7 text-xs pl-7 bg-background/50"
                    />
                  </div>
                )}
                <div className="max-h-60 overflow-y-auto space-y-0.5 pr-0.5">
                  {columns
                    .filter((c) => {
                      if (!columnSearchTerm.trim()) return true;
                      const term = columnSearchTerm.toLowerCase();
                      return c.name.toLowerCase().includes(term) || c.type.toLowerCase().includes(term);
                    })
                    .map((col) => (
                      <button
                        key={col.name}
                        onClick={() => toggleColumnVisibility(col.name)}
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
                        <span className={cn('truncate', col.isPrimaryKey && 'text-primary font-medium')}>{col.name}</span>
                        <span className="ml-auto text-[10px] text-muted-foreground">{col.type}</span>
                      </button>
                    ))}
                </div>
                <div className="pt-2 mt-2 border-t border-border flex items-center justify-between gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleShowAllColumns}
                    className="h-6 text-[11px] px-2 text-primary hover:text-primary font-medium"
                    disabled={hiddenColumns.size === 0}
                  >
                    Show all
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleHideAllExceptPK}
                    className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground"
                    disabled={hiddenColumns.size >= columns.length - 1}
                  >
                    Hide except PK
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Copy Fetched Data as Text */}
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-6 px-2 text-[11px] gap-1 transition-colors",
              copiedDataset ? "text-emerald-500 font-medium bg-emerald-500/10" : "text-muted-foreground hover:text-foreground"
            )}
            onClick={handleCopyFetchedData}
            disabled={allRows.length === 0}
            title="Copy data as text"
          >
            {copiedDataset ? (
              <>
                <Check className="w-3 h-3 text-emerald-500" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>Copy</span>
              </>
            )}
          </Button>

          {/* Page size */}
          <Select value={String(limit)} onValueChange={(v) => handlePageSizeChange(parseInt(v, 10))}>
            <SelectTrigger className="h-6 w-auto min-w-[64px] px-1.5 text-[11px] gap-1 text-muted-foreground hover:text-foreground bg-transparent border-0 shadow-none rounded-md" title="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPLORER_PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)} className="text-xs">{size} / page</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Refresh */}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 hover:bg-muted/80 rounded-md transition-colors"
            onClick={handleRefresh}
            title="Refresh data from database"
            disabled={isManualRefreshing}
          >
            <RotateCw
              className={cn(
                'w-3.5 h-3.5 text-muted-foreground transition-all duration-300',
                isManualRefreshing && 'animate-spin text-primary'
              )}
            />
          </Button>

          {/* Inline filter chips */}
          {filters.length > 0 && (
            <>
              <div className="w-px h-4 bg-border mx-1" />
              <div className="flex items-center gap-1 overflow-x-auto">
                {filters.map((filter, index) => {
                  const opLabel = 
                    filter.operator === 'eq' ? '=' :
                    filter.operator === 'neq' ? '≠' :
                    filter.operator === 'gt' ? '>' :
                    filter.operator === 'gte' ? '≥' :
                    filter.operator === 'lt' ? '<' :
                    filter.operator === 'lte' ? '≤' :
                    filter.operator === 'like' ? '~' :
                    filter.operator === 'not_like' ? '!~' :
                    filter.operator === 'starts_with' ? '^=' :
                    filter.operator === 'ends_with' ? '$=' :
                    filter.operator === 'is_empty' ? 'empty' :
                    filter.operator === 'is_null' ? 'null' :
                    filter.operator === 'not_null' ? 'not null' :
                    filter.operator;

                  return (
                    <span key={index} className="inline-flex items-center gap-1 bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap">
                      <span className="font-medium">{filter.column}</span>
                      <span className="opacity-60">{opLabel}</span>
                      {filter.value !== undefined && filter.value !== null && <span>{Array.isArray(filter.value) ? `(${filter.value.join(', ')})` : String(filter.value)}</span>}
                      <button onClick={() => { const f = [...filters]; f.splice(index, 1); handleFiltersChange(f); }} className="hover:text-foreground">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  );
                })}
                <button onClick={() => handleFiltersChange([])} className="text-muted-foreground hover:text-foreground text-[10px]">Clear</button>
              </div>
            </>
          )}

          {/* Row count & live fetch indicator */}
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            {isFetchingNextPage && (
              <span className="flex items-center gap-1 text-[10px] text-primary animate-pulse">
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                <span>Loading...</span>
              </span>
            )}
            <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
              {estimatedTotal > 0 ? (
                allRows.length >= estimatedTotal ? (
                  `${allRows.length.toLocaleString()} rows`
                ) : (
                  `Showing ${allRows.length.toLocaleString()} of ~${formatCount(estimatedTotal)} rows`
                )
              ) : (
                `${allRows.length.toLocaleString()} rows`
              )}
            </span>
          </div>
        </>,
        portalTarget
      )}

      {/* Export button is rendered by DataExplorerLayout into the header portal */}

      {/* Main content area (Grid + Sidebar) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Data grid with Sticky Headers */}
        <div ref={scrollRef} className="flex-1 overflow-auto scrollbar-thin">
          {allRows.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              {filters.length > 0 ? (
                <div className="text-center space-y-2">
                  <Filter className="w-8 h-8 text-muted-foreground/30 mx-auto" />
                  <p className="text-sm text-muted-foreground">No rows match your filters</p>
                  <Button variant="link" className="text-xs h-auto p-0" onClick={() => setFilters([])}>Clear filters</Button>
                </div>
              ) : (
                <div className="text-center space-y-2">
                  <Table2 className="w-8 h-8 text-muted-foreground/30 mx-auto" />
                  <p className="text-sm text-muted-foreground">This table is empty</p>
                </div>
              )}
            </div>
          ) : (
            <table className="border-collapse text-[13px]" style={{ tableLayout: 'fixed', width: '100%', minWidth: 'max-content' }}>
              <thead className="sticky top-0 z-20 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                <tr className="bg-muted border-b border-border">
                  <th className="w-10 min-w-[40px] max-w-[40px] px-2 py-1.5 text-[11px] text-muted-foreground font-normal border-r border-border text-center bg-muted" style={{ width: 40 }}>#</th>
                  {visibleColumns.map((column) => (
                    <ColumnHeader
                      key={column.name}
                      column={column}
                      sortColumn={sortColumn}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                      onColumnClick={handleColumnClick}
                      width={getWidthForColumn(column.name)}
                      onResize={(width) => handleColumnResize(column.name, width)}
                      onResetWidth={() => handleResetColumnWidth(column.name)}
                      profile={profilesByName.get(column.name)}
                    />
                  ))}
                  {/* Fill remaining space */}
                  <th className="min-w-0 border-b border-border bg-muted"></th>
                </tr>
              </thead>
              <tbody style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
                {virtualItems.map((virtualRow) => {
                  const row = allRows[virtualRow.index];
                  const rowNum = virtualRow.index + 1;
                  const rowIndex = virtualRow.index;
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
                        'group transition-colors',
                        rowIndex % 2 === 0 ? 'bg-background' : 'bg-muted/20',
                        'hover:bg-accent/50'
                      )}
                    >
                      <td className="w-10 min-w-[40px] max-w-[40px] px-2 py-[6px] text-[11px] text-muted-foreground/50 border-r border-border border-b border-b-border/40 text-center tabular-nums select-none" style={{ width: 40 }}>
                        {rowNum}
                      </td>
                      {visibleColumns.map((column) => {
                        const cellKey = `${rowIndex}-${column.name}`;
                        const value = row[column.name];
                        const isCopied = copiedCell === cellKey;
                        return (
                          <td
                            key={column.name}
                            className="px-3 py-[6px] border-r border-border/40 border-b border-b-border/40 last:border-r-0 relative cursor-default overflow-hidden"
                            style={{
                              width: getWidthForColumn(column.name),
                              minWidth: getWidthForColumn(column.name),
                              maxWidth: getWidthForColumn(column.name),
                            }}
                            onClick={() => handleCopyCell(value, cellKey)}
                            title="Click to copy"
                          >
                            {value === null ? (
                              <span className="text-muted-foreground/30 italic text-[12px]">NULL</span>
                            ) : typeof value === 'boolean' ? (
                              <span className={cn(
                                'inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium',
                                value ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'
                              )}>
                                {String(value)}
                              </span>
                            ) : (
                              <div className="flex items-center gap-1 min-w-0 w-full">
                                <span className="truncate flex-1">
                                  {formatCellValue(value)}
                                </span>
                                {column.isForeignKey && column.fkReference && (
                                  <ChevronRight className="w-3 h-3 text-blue-400/60 flex-shrink-0" />
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
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Column Stats Panel */}
        {selectedColumn && (
          <ColumnStatsPanel
            connectionId={connectionId}
            tableName={tableName}
            schemaName={schemaName}
            column={selectedColumn}
            onClose={() => setSelectedColumn(null)}
            onFilterFromStats={handleFilterFromStats}
            onViewReferencedTable={onViewReferencedTable}
          />
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function formatCellValue(value: any): string {
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

function formatCount(num: number | null | undefined): string {
  if (num === null || num === undefined || num < 0) return '0';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}

