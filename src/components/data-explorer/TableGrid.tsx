// =============================================================================
// Table Grid - Infinite Scrolling Data Grid with Sticky Headers & Keyset Streaming
// Modularized for ultra-smooth 120+ FPS scrolling, zero dead code, and fast filtering.
// =============================================================================

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  RotateCw, 
  Check, 
  Table2, 
  RotateCcw, 
  Loader2, 
  Copy 
} from 'lucide-react';
import { cn, measureTextWidth, formatShortType } from '@/lib/utils';
import { formatCount } from '@/shared/lib/format';
import { loadColumnWidths, saveColumnWidths, loadHiddenColumns, saveHiddenColumns } from './storage/grid-storage';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EXPLORER_PAGE_SIZES, getExplorerPageSize, setExplorerPageSize } from './storage/explorer-preferences';
import { useTableRows, useColumnHeaderProfiles } from './api/index';
import {
  getExplorerErrorMessage,
  getExplorerErrorHint,
  getExplorerErrorTitle,
} from './api/errors';
import { useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { dataExplorerKeys } from './api/hooks';
import { toast } from 'sonner';
import { ColumnStatsPanel } from './ColumnStatsPanel';
import { ColumnHeader } from './grid/ColumnHeader';
import { GridRow } from './grid/GridRow';
import { GridFilterPopover } from './grid/GridFilterPopover';
import { GridColumnsPopover } from './grid/GridColumnsPopover';
import { GridFilterChips } from './grid/GridFilterChips';
import { CellHoverPreview, type CellHoverData } from './grid/CellHoverPreview';
import { CellInspectorModal, type CellInspectorData } from './grid/CellInspectorModal';
import { matchesFilter } from './api/filter-matcher';
import type { TableInfo, ColumnInfo, FilterCondition, ColumnStats, ExportGridContext } from './api/types';
import { logger } from '@/lib/logger';

// Row height: compact single-line (33px)
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

export function TableGrid({
  connectionId,
  tableName,
  schemaName,
  tableInfo,
  onViewReferencedTable,
  onGridContextChange,
}: TableGridProps) {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [filters, setFilters] = useState<FilterCondition[]>([]);
  const [filterScope, setFilterScope] = useState<'auto' | 'database' | 'loaded'>('auto');
  const [selectedColumn, setSelectedColumn] = useState<ColumnInfo | null>(null);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => {
    return loadHiddenColumns(connectionId, schemaName, tableName);
  });
  const [copiedDataset, setCopiedDataset] = useState(false);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    return loadColumnWidths(connectionId, schemaName, tableName);
  });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const queryClient = useQueryClient();

  // Cell quick peek card & full cell inspector modal states
  const [hoveredCell, setHoveredCell] = useState<CellHoverData | null>(null);
  const hoveredCellRef = useRef<CellHoverData | null>(null);
  hoveredCellRef.current = hoveredCell;
  const [inspectorData, setInspectorData] = useState<CellInspectorData | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isScrollingRef = useRef(false);
  const scrollStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scroll freeze: disable all hover previews while scrolling and dismiss active card
  useEffect(() => {
    const handleScroll = () => {
      isScrollingRef.current = true;
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      if (hoveredCellRef.current !== null) {
        setHoveredCell(null);
      }

      if (scrollStopTimerRef.current) clearTimeout(scrollStopTimerRef.current);
      scrollStopTimerRef.current = setTimeout(() => {
        isScrollingRef.current = false;
      }, 150);
    };

    const el = scrollRef.current;
    if (el) el.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      if (el) el.removeEventListener('scroll', handleScroll);
      window.removeEventListener('scroll', handleScroll);
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      if (scrollStopTimerRef.current) clearTimeout(scrollStopTimerRef.current);
    };
  }, []);

  // Column header profiles for distribution bars (single cheap query)
  const { data: profilesData } = useColumnHeaderProfiles(connectionId, tableName, schemaName);
  const profilesByName = useMemo(() => {
    if (!profilesData?.columns) return new Map<string, ColumnStats>();
    return new Map(profilesData.columns.map((c) => [c.name, c]));
  }, [profilesData]);

  // Find portal targets on mount
  useEffect(() => {
    setPortalTarget(document.getElementById('table-actions-portal'));
  }, []);

  // Reset per-table state when active table changes
  useEffect(() => {
    setSortColumn(null);
    setSortDirection('asc');
    setFilters([]);
    setHiddenColumns(loadHiddenColumns(connectionId, schemaName, tableName));
    setSelectedColumn(null);
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
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
    refetch,
  } = useTableRows(
    connectionId,
    tableName,
    {
      schemaName,
      orderBy: sortColumn || undefined,
      orderDirection: sortDirection,
      filters: filterScope === 'loaded' ? [] : filters,
      limit,
    }
  );

  // Flatten all streamed pages into continuous array of rows
  const allRows = useMemo(() => {
    return data?.pages.flatMap((page) => page.rows) || [];
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

  // Check if entire table is already loaded in memory
  const isFullTableInMemory = useMemo(() => {
    return !hasNextPage && (estimatedTotal <= allRows.length || estimatedTotal === 0);
  }, [hasNextPage, estimatedTotal, allRows.length]);

  const isFilteringInMemory = filterScope === 'loaded' || (filterScope === 'auto' && isFullTableInMemory);

  // Filter rows: instant in-memory if loaded, or server-filtered from API
  const displayedRows = useMemo(() => {
    if (isFilteringInMemory && filters.length > 0) {
      return allRows.filter((row) => filters.every((f) => matchesFilter(row, f)));
    }
    return allRows;
  }, [allRows, isFilteringInMemory, filters]);

  // Status flags
  const isApplyingFilter = isFetching && !isFetchingNextPage && filters.length > 0 && !isFilteringInMemory;

  const columns = useMemo(() => {
    return data?.pages[0]?.columns || [];
  }, [data]);

  const visibleColumns = useMemo(() => {
    return columns.filter((c) => !hiddenColumns.has(c.name));
  }, [columns, hiddenColumns]);

  // Navigate rows in cell inspector dialog
  const handleNavigateInspectorRow = useCallback(
    (direction: 'prev' | 'next') => {
      if (!inspectorData) return;
      const newIndex = direction === 'prev' ? inspectorData.rowIndex - 1 : inspectorData.rowIndex + 1;
      if (newIndex < 0 || newIndex >= displayedRows.length) return;
      const targetRow = displayedRows[newIndex];
      if (!targetRow) return;

      setInspectorData({
        ...inspectorData,
        rowIndex: newIndex,
        rowNumber: newIndex + 1,
        value: targetRow[inspectorData.columnName],
      });
    },
    [inspectorData, displayedRows]
  );

  // Push active export context
  const gridExportContext = useMemo<ExportGridContext>(() => ({
    filters,
    orderBy: sortColumn,
    orderDirection: sortDirection,
    visibleColumns: visibleColumns.map((c) => c.name),
    allColumnsCount: columns.length,
    estimatedTotal: displayedRows.length,
  }), [filters, sortColumn, sortDirection, visibleColumns, columns, displayedRows.length]);

  useEffect(() => {
    onGridContextChange?.(gridExportContext);
  }, [gridExportContext, onGridContextChange]);

  // High-performance virtualizer
  const virtualizer = useVirtualizer({
    count: displayedRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });
  const virtualItems = virtualizer.getVirtualItems();

  // Fetch next page as user nears bottom
  const lastVirtualIndex = virtualItems.length > 0 ? virtualItems[virtualItems.length - 1].index : -1;
  useEffect(() => {
    if (lastVirtualIndex < 0) return;
    if (hasNextPage && !isFetchingNextPage && lastVirtualIndex >= displayedRows.length - 15) {
      fetchNextPage();
    }
  }, [lastVirtualIndex, hasNextPage, isFetchingNextPage, fetchNextPage, displayedRows.length]);

  // Keep scroll position stable if row count trims
  const prevRowCountRef = useRef(displayedRows.length);
  useEffect(() => {
    const prev = prevRowCountRef.current;
    if (displayedRows.length < prev && prevRowCountRef.current > 0) {
      const el = scrollRef.current;
      if (el && el.scrollTop > displayedRows.length * ROW_HEIGHT) {
        el.scrollTop = 0;
      }
    }
    prevRowCountRef.current = displayedRows.length;
  }, [displayedRows.length]);

  const handleColumnClick = useCallback((column: ColumnInfo) => {
    setSelectedColumn((prev) => (prev?.name === column.name ? null : column));
  }, []);

  const handleSort = useCallback((column: string | null, direction: 'asc' | 'desc') => {
    setSortColumn(column);
    setSortDirection(direction);
  }, []);

  const handleFiltersChange = useCallback((newFilters: FilterCondition[]) => {
    setFilters(newFilters);
    scrollRef.current?.scrollTo({ top: 0, left: 0 });
  }, []);

  const handleAddFilter = useCallback((filter: FilterCondition) => {
    setFilters((prev) => [...prev, filter]);
    scrollRef.current?.scrollTo({ top: 0, left: 0 });
  }, []);

  const handleRemoveFilter = useCallback((index: number) => {
    setFilters((prev) => {
      const next = [...prev];
      next.splice(index, 1);
      return next;
    });
    scrollRef.current?.scrollTo({ top: 0, left: 0 });
  }, []);

  const handleFilterFromStats = useCallback((column: string, value: any) => {
    setFilters((prev) => {
      if (prev.some((f) => f.column === column && f.operator === 'eq' && f.value === value)) {
        return prev;
      }
      return [...prev, { column, operator: 'eq', value }];
    });
    scrollRef.current?.scrollTo({ top: 0, left: 0 });
  }, []);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      saveTimeoutRef.current = setTimeout(() => {
        saveColumnWidths(connectionId, schemaName, tableName, next);
      }, 400);

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

  const handleCopyCell = useCallback(async (value: any) => {
    const text = value === null ? 'NULL' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback
    }
  }, []);

  const handleCopyFetchedData = useCallback(async () => {
    if (displayedRows.length === 0) {
      toast.error('No data available to copy');
      return;
    }

    const headerRow = visibleColumns.map((c) => c.name).join('\t');
    const bodyRows = displayedRows.map((row) =>
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
      toast.success(`Copied ${displayedRows.length.toLocaleString()} rows to clipboard`);
      setTimeout(() => setCopiedDataset(false), 2000);
    } catch (err) {
      logger.error('Failed to copy rows:', err);
      toast.error('Failed to copy to clipboard');
    }
  }, [displayedRows, visibleColumns]);

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

  // Smart column width calculation from initial sample rows (evaluated once when initial rows load)
  const firstPageRows = data?.pages[0]?.rows;
  const defaultWidths = useMemo(() => {
    const widths: Record<string, number> = {};
    if (columns.length === 0) return widths;

    const sampleRows = (firstPageRows || []).slice(0, 8);

    columns.forEach((col) => {
      const colNameWidth = measureTextWidth(col.name, '500 12px Inter, sans-serif') || (col.name.length * 8.5);
      const shortType = formatShortType(col.type) + (col.nullable ? '?' : '');
      const shortTypeWidth = shortType ? (shortType.length * 6.5) + 6 : 0;
      const extraHeaderPadding = (col.isPrimaryKey || col.isForeignKey ? 20 : 0) + 42;
      const minHeaderWidth = Math.max(Math.ceil(colNameWidth + shortTypeWidth + extraHeaderPadding), 100);

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

      const finalWidth = Math.max(minHeaderWidth, clampedContentWidth);
      widths[col.name] = Math.round(finalWidth);
    });
    return widths;
  }, [columns, firstPageRows]);

  const getWidthForColumn = useCallback((colName: string) => {
    const userW = columnWidths[colName];
    const defW = defaultWidths[colName];

    if (userW && defW && defW > userW * 2.5) {
      return defW;
    }
    return userW || defW || 200;
  }, [columnWidths, defaultWidths]);

  // Precompute width lookup dictionary to eliminate repeated inline lookups
  const resolvedWidths = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of visibleColumns) {
      map[c.name] = getWidthForColumn(c.name);
    }
    return map;
  }, [visibleColumns, getWidthForColumn]);

  // Stable cell interaction handlers
  const handleCellDoubleClick = useCallback((value: any, column: ColumnInfo, rowIndex: number) => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (value !== null && value !== undefined) {
      setInspectorData({
        value,
        columnName: column.name,
        columnType: column.type,
        rowIndex,
        rowNumber: rowIndex + 1,
        tableName,
        schemaName,
      });
      setHoveredCell(null);
    }
  }, [tableName, schemaName]);

  const handleCellMouseEnter = useCallback((
    e: React.MouseEvent<HTMLElement>,
    value: any,
    column: ColumnInfo,
    rowIndex: number,
    hasExpandable: boolean
  ) => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (isScrollingRef.current) return;
    if (hasExpandable) {
      const target = e.currentTarget;
      hoverTimerRef.current = setTimeout(() => {
        if (isScrollingRef.current) return;
        const rect = target.getBoundingClientRect();
        setHoveredCell({
          value,
          columnName: column.name,
          columnType: column.type,
          rowIndex,
          rowNumber: rowIndex + 1,
          rect,
        });
      }, 450);
    }
  }, []);

  const handleCellMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    closeTimerRef.current = setTimeout(() => {
      setHoveredCell(null);
    }, 200);
  }, []);

  // Loading skeleton for initial fetch
  if (isLoading && allRows.length === 0) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="flex border-b border-border bg-muted px-3 py-2 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-24 rounded" />
          ))}
        </div>
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
      {/* Top Indeterminate Loading Progress Bar for Database Filter Query */}
      {isApplyingFilter && (
        <div className="absolute top-0 left-0 right-0 z-30 h-[2px] bg-primary/20 overflow-hidden pointer-events-none">
          <div className="h-full bg-primary animate-pulse w-full" />
        </div>
      )}

      {/* Action bar portaled into header */}
      {portalTarget && createPortal(
        <>
          <div className="w-px h-4 bg-border mx-1" />

          {/* Filter Popover */}
          <GridFilterPopover
            columns={columns}
            activeFilterCount={filters.length}
            isFilteringInMemory={isFilteringInMemory}
            isFullTableInMemory={isFullTableInMemory}
            filterScope={filterScope}
            onFilterScopeChange={setFilterScope}
            onAddFilter={handleAddFilter}
          />

          {/* Column Visibility Popover */}
          <GridColumnsPopover
            columns={columns}
            hiddenColumns={hiddenColumns}
            onToggleColumn={toggleColumnVisibility}
            onShowAll={handleShowAllColumns}
            onHideAllExceptPK={handleHideAllExceptPK}
          />

          {/* Copy Fetched Data as Text */}
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-6 px-2 text-[11px] gap-1 transition-colors",
              copiedDataset ? "text-emerald-500 font-medium bg-emerald-500/10" : "text-muted-foreground hover:text-foreground"
            )}
            onClick={handleCopyFetchedData}
            disabled={displayedRows.length === 0}
            title="Copy displayed rows as tab-separated text"
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
          <GridFilterChips
            filters={filters}
            onRemoveFilter={handleRemoveFilter}
            onClearAll={() => handleFiltersChange([])}
          />

          {/* Row count & live fetch indicator */}
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            {isApplyingFilter && (
              <span className="flex items-center gap-1 text-[10px] text-primary animate-pulse font-medium">
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                <span>Applying filter...</span>
              </span>
            )}
            {isFetchingNextPage && (
              <span className="flex items-center gap-1 text-[10px] text-primary animate-pulse">
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                <span>Loading...</span>
              </span>
            )}
            <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
              {filters.length > 0 ? (
                `Showing ${displayedRows.length.toLocaleString()} of ${allRows.length.toLocaleString()} rows`
              ) : estimatedTotal > 0 ? (
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

      {/* Main content area (Grid + Sidebar) */}
      <div className="flex-1 flex overflow-hidden relative">
        <div
          ref={scrollRef}
          className={cn(
            "flex-1 overflow-auto scrollbar-thin transition-opacity duration-150",
            isApplyingFilter && "opacity-60 pointer-events-none"
          )}
        >
          {displayedRows.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              {filters.length > 0 ? (
                <div className="text-center space-y-2">
                  <Table2 className="w-8 h-8 text-muted-foreground/30 mx-auto" />
                  <p className="text-sm text-muted-foreground">No rows match your filters</p>
                  <Button variant="link" className="text-xs h-auto p-0" onClick={() => handleFiltersChange([])}>Clear filters</Button>
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
                      width={resolvedWidths[column.name] || 200}
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
                  const row = displayedRows[virtualRow.index];
                  const rowNum = virtualRow.index + 1;
                  const rowIndex = virtualRow.index;
                  return (
                    <GridRow
                      key={virtualRow.key}
                      row={row}
                      rowIndex={rowIndex}
                      rowNum={rowNum}
                      virtualRow={virtualRow}
                      visibleColumns={visibleColumns}
                      resolvedWidths={resolvedWidths}
                      onCellDoubleClick={handleCellDoubleClick}
                      onCellMouseEnter={handleCellMouseEnter}
                      onCellMouseLeave={handleCellMouseLeave}
                      onCopyCell={handleCopyCell}
                    />
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

      {/* Floating Cell Quick Peek Card */}
      <CellHoverPreview
        data={hoveredCell}
        onClose={() => setHoveredCell(null)}
        onKeepOpen={() => {
          if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
          }
        }}
        onOpenInspector={(data) => {
          setInspectorData({
            ...data,
            tableName,
            schemaName,
          });
          setHoveredCell(null);
        }}
      />

      {/* Full Cell Inspector Modal */}
      <CellInspectorModal
        data={inspectorData}
        isOpen={!!inspectorData}
        onClose={() => setInspectorData(null)}
        hasPrevRow={inspectorData ? inspectorData.rowIndex > 0 : false}
        hasNextRow={inspectorData ? inspectorData.rowIndex < displayedRows.length - 1 : false}
        onNavigateRow={handleNavigateInspectorRow}
      />
    </div>
  );
}


