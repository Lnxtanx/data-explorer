// =============================================================================
// Export Button - Rich export popover with View / Table / Database scopes.
// Colorful format icons, active table display, multi-table picker, and live progress.
// =============================================================================

import {
  Download,
  Loader2,
  Database,
  Table2,
  Layers,
  Check,
  Filter,
  ArrowUpDown,
  Search,
  X,
  XCircle,
} from 'lucide-react';
import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  fetchTableExport,
  startSchemaExport,
  getSchemaExportProgress,
  fetchSchemaExportBlob,
  cancelSchemaExport,
  useSchemas,
  useTableList,
} from '@/lib/api/data/explorer';
import { toast } from 'sonner';
import type { ExportFormat, ExportScope, ExportGridContext } from '@/lib/api/data/explorer/types';
import { ExportFormatIcon } from './export/ExportFormatIcon';

const EXPORT_MAX_ROWS = 10000;
const ROW_PRESETS = [1000, 5000, 10000, 25000, 50000];

interface ExportButtonProps {
  connectionId: string | null;
  tableName: string;
  schemaName: string;
  /** Grid context — enables the "View" scope (WYSIWYG export). */
  gridContext?: ExportGridContext | null;
}

interface ExportOption {
  format: ExportFormat;
  label: string;
  ext: string;
  activeColorClass: string;
  activeRingClass: string;
}

const EXPORT_OPTIONS: ExportOption[] = [
  {
    format: 'csv',
    label: 'CSV',
    ext: '.csv',
    activeColorClass: 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    activeRingClass: 'ring-1 ring-emerald-500/30',
  },
  {
    format: 'excel',
    label: 'Excel',
    ext: '.xlsx',
    activeColorClass: 'border-emerald-600 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300',
    activeRingClass: 'ring-1 ring-emerald-600/30',
  },
  {
    format: 'json',
    label: 'JSON',
    ext: '.json',
    activeColorClass: 'border-amber-500 bg-amber-500/10 text-amber-800 dark:text-amber-300',
    activeRingClass: 'ring-1 ring-amber-500/30',
  },
  {
    format: 'ndjson',
    label: 'NDJSON',
    ext: '.ndjson',
    activeColorClass: 'border-purple-500 bg-purple-500/10 text-purple-800 dark:text-purple-300',
    activeRingClass: 'ring-1 ring-purple-500/30',
  },
  {
    format: 'sql',
    label: 'SQL',
    ext: '.sql',
    activeColorClass: 'border-blue-500 bg-blue-500/10 text-blue-800 dark:text-blue-300',
    activeRingClass: 'ring-1 ring-blue-500/30',
  },
];

export function ExportButton({
  connectionId,
  tableName,
  schemaName,
  gridContext,
}: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ done: number; total: number } | null>(null);
  const [scope, setScope] = useState<ExportScope>('view');
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [maxRows, setMaxRows] = useState(EXPORT_MAX_ROWS);
  /** null = all schemas; array = explicit selection. */
  const [selectedSchemas, setSelectedSchemas] = useState<string[] | null>(null);
  
  /** Multi-select table state for Table scope */
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [tableSearchTerm, setTableSearchTerm] = useState('');
  
  const mountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeJobIdRef = useRef<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  // Synchronize default table selection when active table prop changes
  useEffect(() => {
    if (tableName) {
      setSelectedTables([tableName]);
    }
  }, [tableName]);

  const hasTable = !!connectionId && !!tableName;
  const hasGrid = !!gridContext && hasTable;
  
  const { data: schemasData } = useSchemas(connectionId);
  const schemas = useMemo(() => (schemasData?.schemas || []).filter((s) => s.tableCount > 0), [schemasData]);

  // Fetch tables list for the current schema so user can select single or multiple tables
  const { data: tableListData, isLoading: tablesLoading } = useTableList(connectionId, schemaName);
  const tableList = useMemo(() => tableListData?.tables || [], [tableListData]);

  const filteredTableList = useMemo(() => {
    if (!tableSearchTerm.trim()) return tableList;
    const term = tableSearchTerm.toLowerCase();
    return tableList.filter((t) => t.name.toLowerCase().includes(term));
  }, [tableList, tableSearchTerm]);

  const effectiveScope: ExportScope = !hasTable ? 'database' : scope;

  const effectiveSchemas = useMemo(() => {
    if (selectedSchemas === null) return schemas;
    return schemas.filter((s) => selectedSchemas.includes(s.name));
  }, [selectedSchemas, schemas]);
  const totalTables = effectiveSchemas.reduce((sum, s) => sum + s.tableCount, 0);

  const toggleTableSelection = (targetName: string) => {
    setSelectedTables((prev) => {
      if (prev.includes(targetName)) {
        return prev.filter((name) => name !== targetName);
      }
      return [...prev, targetName];
    });
  };

  const handleSelectAllTables = () => {
    if (selectedTables.length === tableList.length) {
      setSelectedTables([]);
    } else {
      setSelectedTables(tableList.map((t) => t.name));
    }
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const handleCancelExport = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (activeJobIdRef.current && connectionId) {
      cancelSchemaExport(connectionId, activeJobIdRef.current).catch(() => undefined);
      activeJobIdRef.current = null;
    }
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setIsExporting(false);
    setExportProgress(null);
  }, [connectionId]);

  const handleExport = async () => {
    if (!connectionId) {
      toast.error('Select a connection to export data');
      return;
    }

    setIsExporting(true);
    setExportProgress(null);

    try {
      // 1. DATABASE SCOPE (LIVE PROGRESS + STREAMED ZIP BLOB)
      if (effectiveScope === 'database') {
        if (effectiveSchemas.length === 0) {
          toast.error('No tables found in the selected schemas');
          setIsExporting(false);
          return;
        }

        const toastId = toast.loading(`Preparing ZIP archive for ${totalTables.toLocaleString()} tables…`, {
          duration: Infinity,
        });

        try {
          // Register the export job on the backend
          const jobRes = await startSchemaExport(
            connectionId,
            selectedSchemas === null ? [] : selectedSchemas,
            format
          );
          const jobId = jobRes.jobId;
          activeJobIdRef.current = jobId;
          const targetTotal = jobRes.tableCount || totalTables;
          setExportProgress({ done: 0, total: targetTotal });

          const abortController = new AbortController();
          abortControllerRef.current = abortController;

          // Set up live progress polling while download streams
          pollTimerRef.current = setInterval(async () => {
            if (!activeJobIdRef.current || !mountedRef.current) return;
            try {
              const progress = await getSchemaExportProgress(connectionId, jobId);
              if (progress.status === 'running') {
                const currentDone = progress.done;
                setExportProgress({ done: currentDone, total: progress.total });
                toast.loading(`Exporting (${currentDone} / ${progress.total}) tables into ZIP…`, {
                  id: toastId,
                  action: {
                    label: 'Cancel',
                    onClick: () => {
                      handleCancelExport();
                      toast.info('Export cancelled', { id: toastId });
                    },
                  },
                });
              }
            } catch {
              // Ignore background polling glitches
            }
          }, 500);

          // Stream the generated ZIP
          const { blob, filename } = await fetchSchemaExportBlob(
            connectionId,
            jobId,
            abortController.signal
          );

          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          setExportProgress({ done: targetTotal, total: targetTotal });
          triggerDownload(blob, filename);

          toast.success(`Successfully exported ${targetTotal.toLocaleString()} tables as ZIP`, {
            id: toastId,
            duration: 3500,
            action: undefined,
          });
          setOpen(false);
          return;
        } catch (err: unknown) {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          if (err instanceof Error && err.name === 'AbortError') {
            toast.info('Export cancelled', { id: toastId, duration: 3000 });
            return;
          }
          toast.error('Export failed', {
            id: toastId,
            duration: 4000,
            description: err instanceof Error ? err.message : 'Could not complete the database export.',
          });
          return;
        } finally {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          activeJobIdRef.current = null;
          abortControllerRef.current = null;
        }
      }

      // 2. VIEW SCOPE
      if (effectiveScope === 'view') {
        if (!tableName) {
          toast.error('Please select a table to export', { duration: 3000 });
          setIsExporting(false);
          return;
        }
        toast.info(`Exporting view of ${tableName}…`, { duration: 2500 });

        const result = await fetchTableExport(connectionId, tableName, schemaName, {
          format,
          maxRows,
          filters: gridContext && gridContext.filters.length > 0 ? gridContext.filters : undefined,
          orderBy: gridContext ? gridContext.orderBy || undefined : undefined,
          orderDirection: gridContext ? gridContext.orderDirection : undefined,
          columns: gridContext && gridContext.visibleColumns.length > 0 ? gridContext.visibleColumns : undefined,
        });

        triggerDownload(result.blob, result.filename);
        toast.success(
          result.rowCount > 0 ? `${result.rowCount.toLocaleString()} rows exported from ${tableName}` : `Export of ${tableName} complete`,
          {
            duration: 3500,
            description: result.capped ? `Capped at ${maxRows.toLocaleString()} rows.` : undefined,
          }
        );
        setOpen(false);
        return;
      }

      // 3. TABLE SCOPE (SINGLE OR MULTI-TABLE EXPORT)
      if (selectedTables.length === 0) {
        toast.error('Please select at least one table to export', { duration: 3000 });
        setIsExporting(false);
        return;
      }

      if (selectedTables.length === 1) {
        const targetTable = selectedTables[0];
        toast.info(`Exporting ${targetTable}…`, { duration: 2500 });

        const result = await fetchTableExport(connectionId, targetTable, schemaName, {
          format,
          maxRows,
        });

        triggerDownload(result.blob, result.filename);
        toast.success(
          result.rowCount > 0 ? `${result.rowCount.toLocaleString()} rows exported from ${targetTable}` : `Export of ${targetTable} complete`,
          {
            duration: 3500,
            description: result.capped ? `Capped at ${maxRows.toLocaleString()} rows.` : undefined,
          }
        );
        setOpen(false);
        return;
      }

      // Multiple tables export sequentially with live progress
      setExportProgress({ done: 0, total: selectedTables.length });
      const toastId = toast.loading(`Exporting (1 / ${selectedTables.length}): ${selectedTables[0]}…`, {
        duration: Infinity,
        action: {
          label: 'Cancel',
          onClick: () => {
            handleCancelExport();
            toast.info('Export cancelled', { id: toastId, duration: 3000 });
          },
        },
      });

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      let exportedCount = 0;
      for (let i = 0; i < selectedTables.length; i++) {
        if (abortController.signal.aborted) break;

        const targetTable = selectedTables[i];
        setExportProgress({ done: i, total: selectedTables.length });
        toast.loading(`Exporting (${i + 1} / ${selectedTables.length}): ${targetTable}…`, {
          id: toastId,
          action: {
            label: 'Cancel',
            onClick: () => {
              handleCancelExport();
              toast.info('Export cancelled', { id: toastId, duration: 3000 });
            },
          },
        });

        try {
          const result = await fetchTableExport(connectionId, targetTable, schemaName, {
            format,
            maxRows,
          });
          triggerDownload(result.blob, result.filename);
          exportedCount += 1;
        } catch (tableErr) {
          console.error(`Failed to export table ${targetTable}:`, tableErr);
        }

        // Brief delay between downloads so the browser handles each file reliably
        if (i < selectedTables.length - 1 && !abortController.signal.aborted) {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }

      if (!abortController.signal.aborted) {
        setExportProgress({ done: selectedTables.length, total: selectedTables.length });
        toast.success(`Successfully exported ${exportedCount} of ${selectedTables.length} tables`, {
          id: toastId,
          duration: 3500,
          action: undefined,
        });
        setOpen(false);
      }
    } catch (err) {
      toast.error('Export failed', {
        duration: 4000,
        description: err instanceof Error ? err.message : 'Something went wrong while exporting.',
      });
    } finally {
      setIsExporting(false);
      setExportProgress(null);
      abortControllerRef.current = null;
    }
  };

  const selectedFormatOption = useMemo(
    () => EXPORT_OPTIONS.find((opt) => opt.format === format) || EXPORT_OPTIONS[0],
    [format]
  );

  // Dynamic button label
  const exportButtonText = useMemo(() => {
    if (isExporting) {
      if (exportProgress && exportProgress.total > 1) {
        return `Exporting (${exportProgress.done} / ${exportProgress.total})…`;
      }
      return 'Exporting…';
    }
    if (effectiveScope === 'database') {
      return `Export Database as ZIP (${selectedFormatOption.label})`;
    }
    if (effectiveScope === 'view') {
      return `Export View (${selectedFormatOption.label})`;
    }
    if (selectedTables.length === 0) {
      return 'Select a table';
    }
    if (selectedTables.length === 1) {
      return `Export ${selectedTables[0]} (${selectedFormatOption.label})`;
    }
    return `Export ${selectedTables.length} Tables (${selectedFormatOption.label})`;
  }, [isExporting, exportProgress, effectiveScope, selectedTables, selectedFormatOption]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={!connectionId}
          className="gap-1.5 h-7 px-2.5 text-xs font-medium bg-card hover:bg-muted/80 border-border text-foreground transition-all duration-150 shadow-none select-none"
        >
          {isExporting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
          ) : (
            <Download className="w-3.5 h-3.5 text-muted-foreground" />
          )}
          <span>{isExporting && exportProgress ? `${exportProgress.done}/${exportProgress.total}` : 'Export'}</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0 shadow-xl border border-border/80 rounded-xl overflow-hidden bg-popover">
        <div className="p-3.5 space-y-3">
          {/* Scope Selector Tabs */}
          <div className="grid grid-cols-3 gap-1 bg-muted/60 p-1 rounded-lg">
            <ScopeTab
              active={effectiveScope === 'view'}
              disabled={!hasGrid || isExporting}
              icon={<Layers className="w-3.5 h-3.5" />}
              label="View"
              title={hasGrid ? 'Filtered rows & visible columns on current table' : 'Select a table first'}
              onClick={() => setScope('view')}
            />
            <ScopeTab
              active={effectiveScope === 'table'}
              disabled={(!hasTable && tableList.length === 0) || isExporting}
              icon={<Table2 className="w-3.5 h-3.5" />}
              label="Table"
              title="Full table data (select one or multiple tables)"
              onClick={() => setScope('table')}
            />
            <ScopeTab
              active={effectiveScope === 'database'}
              disabled={!connectionId || isExporting}
              icon={<Database className="w-3.5 h-3.5" />}
              label="Database"
              title="All schemas & tables bundled as a ZIP archive"
              onClick={() => setScope('database')}
            />
          </div>

          {/* ============================================================= */}
          {/* SCOPE 1: VIEW SCOPE CONTENT */}
          {/* ============================================================= */}
          {effectiveScope === 'view' && (
            <div className="p-2.5 rounded-lg bg-muted/40 border border-border/60 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Table2 className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-xs font-semibold text-foreground truncate">
                    {schemaName}.<span className="text-primary">{tableName}</span>
                  </span>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium border border-primary/20 shrink-0">
                  Active View
                </span>
              </div>

              {/* View stats badge */}
              <div className="grid grid-cols-2 gap-1.5 pt-0.5 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-1">
                  <span className="font-medium text-foreground">
                    {gridContext ? `~${gridContext.estimatedTotal.toLocaleString()}` : '0'}
                  </span>
                  <span>rows</span>
                </div>
                <div className="flex items-center gap-1 text-right justify-end">
                  <span className="font-medium text-foreground">
                    {gridContext ? `${gridContext.visibleColumns.length}/${gridContext.allColumnsCount}` : '0'}
                  </span>
                  <span>columns</span>
                </div>
              </div>

              {/* Filter / Sort indicators if present */}
              {gridContext && (gridContext.filters.length > 0 || gridContext.orderBy) && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/40 text-[10px] text-muted-foreground">
                  {gridContext.filters.length > 0 && (
                    <span className="inline-flex items-center gap-1 bg-background/80 px-1.5 py-0.5 rounded border border-border/50">
                      <Filter className="w-2.5 h-2.5 text-primary" />
                      <span>{gridContext.filters.length} filter{gridContext.filters.length > 1 ? 's' : ''}</span>
                    </span>
                  )}
                  {gridContext.orderBy && (
                    <span className="inline-flex items-center gap-1 bg-background/80 px-1.5 py-0.5 rounded border border-border/50">
                      <ArrowUpDown className="w-2.5 h-2.5 text-primary" />
                      <span className="truncate max-w-[100px]">{gridContext.orderBy} ({gridContext.orderDirection})</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ============================================================= */}
          {/* SCOPE 2: TABLE SCOPE CONTENT (MULTI-TABLE SELECTOR) */}
          {/* ============================================================= */}
          {effectiveScope === 'table' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <Table2 className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>Select Tables</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-primary/10 text-primary font-semibold border border-primary/20 tabular-nums">
                    {selectedTables.length}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={handleSelectAllTables}
                  className="text-[11px] text-primary hover:underline font-medium cursor-pointer disabled:opacity-50"
                >
                  {selectedTables.length === tableList.length && tableList.length > 0
                    ? 'Deselect all'
                    : 'Select all'}
                </button>
              </div>

              {/* Table search filter */}
              {tableList.length > 6 && (
                <div className="relative flex items-center">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                  <Input
                    disabled={isExporting}
                    placeholder="Filter tables..."
                    value={tableSearchTerm}
                    onChange={(e) => setTableSearchTerm(e.target.value)}
                    className="pl-6 pr-6 h-6.5 text-[11px] bg-background border-border/80"
                  />
                  {tableSearchTerm && (
                    <button
                      onClick={() => setTableSearchTerm('')}
                      className="absolute right-1.5 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}

              {/* Scrollable table multi-select list */}
              <div className="max-h-32 overflow-y-auto space-y-0.5 pr-1 border border-border/60 rounded-lg p-1 bg-muted/20">
                {tablesLoading ? (
                  <div className="p-3 text-center text-xs text-muted-foreground">Loading tables…</div>
                ) : filteredTableList.length === 0 ? (
                  <div className="p-3 text-center text-xs text-muted-foreground">
                    {tableSearchTerm ? 'No matching tables' : 'No tables available'}
                  </div>
                ) : (
                  filteredTableList.map((t) => {
                    const isChecked = selectedTables.includes(t.name);
                    return (
                      <label
                        key={t.name}
                        className={cn(
                          'flex items-center gap-2 text-xs cursor-pointer select-none py-1 px-1.5 rounded transition-colors',
                          isChecked ? 'bg-primary/10 text-foreground font-medium' : 'hover:bg-muted/60 text-muted-foreground',
                          isExporting && 'opacity-60 pointer-events-none'
                        )}
                      >
                        <input
                          type="checkbox"
                          disabled={isExporting}
                          checked={isChecked}
                          onChange={() => toggleTableSelection(t.name)}
                          className="accent-primary rounded"
                        />
                        <span className="truncate flex-1">{t.name}</span>
                        {t.estimatedRows >= 0 && (
                          <span className="text-[10px] text-muted-foreground font-mono tabular-nums shrink-0">
                            ~{t.estimatedRows.toLocaleString()}
                          </span>
                        )}
                      </label>
                    );
                  })
                )}
              </div>

              {/* Selection summary */}
              <div className="flex items-center justify-between text-[10.5px] text-muted-foreground px-0.5">
                <span>
                  {selectedTables.length === 0
                    ? 'No tables selected'
                    : selectedTables.length === 1
                    ? `1 table selected (${selectedTables[0]})`
                    : `${selectedTables.length} tables selected`}
                </span>
                <span className="text-muted-foreground/80">Schema: {schemaName}</span>
              </div>
            </div>
          )}

          {/* ============================================================= */}
          {/* SCOPE 3: DATABASE SCOPE CONTENT */}
          {/* ============================================================= */}
          {effectiveScope === 'database' && (
            <div className="space-y-2">
              {/* Schema Checkboxes */}
              {schemas.length > 0 && (
                <div className="space-y-1">
                  <label className="flex items-center gap-2 text-xs cursor-pointer select-none py-0.5">
                    <input
                      type="checkbox"
                      disabled={isExporting}
                      checked={selectedSchemas === null}
                      onChange={() => setSelectedSchemas(null)}
                      className="accent-primary rounded"
                    />
                    <span className="font-semibold text-foreground">All schemas</span>
                    <span className="text-muted-foreground ml-auto tabular-nums font-mono text-[11px]">
                      {schemas.reduce((s, x) => s + x.tableCount, 0).toLocaleString()} tables
                    </span>
                  </label>

                  <div className="max-h-28 overflow-y-auto space-y-0.5 pr-1 border-t border-border/40 pt-1">
                    {schemas.map((schema) => {
                      const checked = selectedSchemas !== null && selectedSchemas.includes(schema.name);
                      return (
                        <label
                          key={schema.name}
                          className={cn(
                            'flex items-center gap-2 text-xs cursor-pointer select-none py-0.5 hover:bg-muted/50 rounded px-1',
                            isExporting && 'opacity-60 pointer-events-none'
                          )}
                        >
                          <input
                            type="checkbox"
                            disabled={isExporting}
                            checked={selectedSchemas === null || checked}
                            onChange={() => {
                              setSelectedSchemas((prev) => {
                                if (prev === null) {
                                  return schemas.filter((s) => s.name !== schema.name).map((s) => s.name);
                                }
                                return prev.includes(schema.name)
                                  ? prev.filter((n) => n !== schema.name)
                                  : [...prev, schema.name];
                              });
                            }}
                            className="accent-primary rounded"
                          />
                          <span className="truncate">{schema.name}</span>
                          <span className="text-muted-foreground ml-auto tabular-nums font-mono text-[10px] shrink-0">
                            {schema.tableCount.toLocaleString()}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================= */}
          {/* FORMAT SELECTION (COLORFUL ICON GRID) */}
          {/* ============================================================= */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">Format</span>
              <span className="text-[11px] text-muted-foreground font-mono">
                {selectedFormatOption.ext}
              </span>
            </div>

            <div className="grid grid-cols-5 gap-1.5">
              {EXPORT_OPTIONS.map((opt) => {
                const isSelected = format === opt.format;
                return (
                  <button
                    key={opt.format}
                    disabled={isExporting}
                    onClick={() => setFormat(opt.format)}
                    title={`${opt.label} (${opt.ext})`}
                    className={cn(
                      'flex flex-col items-center justify-center py-2 px-1 rounded-lg border transition-all select-none gap-1 group',
                      isSelected
                        ? cn(opt.activeColorClass, opt.activeRingClass, 'font-semibold')
                        : 'border-border/60 bg-card hover:bg-muted/60 text-muted-foreground hover:text-foreground',
                      isExporting && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <div className="transition-transform group-hover:scale-105">
                      <ExportFormatIcon format={opt.format} size={22} />
                    </div>
                    <span className="text-[10px] tracking-tight truncate font-medium">
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ============================================================= */}
          {/* ROW LIMIT SELECTOR (Hidden for Database scope) */}
          {/* ============================================================= */}
          {effectiveScope !== 'database' && (
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <span>Row Limit</span>
              </span>
              <Select
                disabled={isExporting}
                value={String(maxRows)}
                onValueChange={(v) => setMaxRows(Number(v))}
              >
                <SelectTrigger className="h-7 w-28 text-xs font-mono tabular-nums bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROW_PRESETS.map((preset) => (
                    <SelectItem key={preset} value={String(preset)} className="text-xs font-mono">
                      {preset >= 1000 ? `${(preset / 1000).toLocaleString()}k rows` : `${preset} rows`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* ============================================================= */}
        {/* FOOTER & ACTION BUTTON */}
        {/* ============================================================= */}
        <div className="px-3.5 pb-3.5 pt-1.5 space-y-2 border-t border-border/50 bg-muted/20">
          {isExporting ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono flex-1 min-w-0">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
                <span className="truncate">
                  {exportProgress ? `${exportProgress.done}/${exportProgress.total} tables` : 'Streaming…'}
                </span>
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-xs px-2.5 gap-1 font-medium shadow-xs shrink-0"
                onClick={handleCancelExport}
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </Button>
            </div>
          ) : (
            <Button
              className="w-full h-8 text-xs font-medium gap-1.5 shadow-sm"
              disabled={
                !connectionId ||
                (effectiveScope === 'database' && effectiveSchemas.length === 0) ||
                (effectiveScope === 'table' && selectedTables.length === 0)
              }
              onClick={handleExport}
            >
              <Download className="w-3.5 h-3.5" />
              <span className="truncate">{exportButtonText}</span>
              <Check className="w-3 h-3 text-primary-foreground/70 ml-auto shrink-0" />
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ScopeTab({
  active,
  disabled,
  icon,
  label,
  title,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-[11px] font-medium transition-all select-none',
        active
          ? 'bg-background shadow-xs text-foreground font-semibold border border-border/50'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
        disabled && 'opacity-35 cursor-not-allowed hover:bg-transparent'
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}