// =============================================================================
// Data Explorer API - Barrel Export
// =============================================================================

// Types
export type {
  SchemaInfo,
  SchemaListResponse,
  TableInfo,
  TableListResponse,
  ColumnInfo,
  PaginationInfo,
  TableRowsResponse,
  TableRowsParams,
  ColumnStats,
  ColumnStatsResponse,
  Quantiles,
  HistogramBin,
  TableSchema,
  ExportParams,
  ExportGridContext,
  ExportScope,
  ExportFormat,
  SchemaExportStatus,
} from './types';

// API Functions
export {
  fetchSchemas,
  fetchTableList,
  fetchTableRows,
  fetchColumnStats,
  fetchTableSchema,
  getExportUrl,
  fetchTableExport,
  startSchemaExport,
  getSchemaExportProgress,
  getSchemaExportDownloadUrl,
  downloadSchemaExport,
  fetchSchemaExportBlob,
  cancelSchemaExport,
} from './api';

// Hooks
export {
  dataExplorerKeys,
  useSchemas,
  useTableList,
  useTableRows,
  useTableRowsSimple,
  useColumnStats,
  useColumnHeaderProfiles,
  useTableSchema,
  usePrefetchTableRows,
  usePrefetchColumnStats,
} from './hooks';

// Error helpers
export {
  getExplorerErrorMessage,
  getExplorerErrorHint,
  getExplorerErrorTitle,
  EXPLORER_ERROR_CATALOG,
} from './errors';
