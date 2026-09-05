// =============================================================================
// Data Explorer API Types
// =============================================================================

// ─── Schema List ────────────────────────────────────────────────────────────

export interface SchemaInfo {
  name: string;
  tableCount: number;
}

export interface SchemaListResponse {
  schemas: SchemaInfo[];
}

// ─── Table List ─────────────────────────────────────────────────────────────

export interface TableInfo {
  name: string;
  schema: string;
  estimatedRows: number;
  sizeBytes: number;
  sizeFormatted: string;
  hasIndexes: boolean;
  indexCount: number;
  lastVacuum: string | null;
  deadTuples: number;
  liveTuples: number;
  deadTuplePercent: number;
  hasPrimaryKey: boolean;
}

export interface TableListResponse {
  tables: TableInfo[];
  schemaName: string;
}

// ─── Table Rows ──────────────────────────────────────────────────────────────

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isIndexed: boolean;
  fkReference?: {
    table: string;
    columns: string[];  // Array to support composite foreign keys
  };
}

export interface PaginationInfo {
  hasMore: boolean;
  nextCursor: string | null;
  prevCursor: string | null;
  estimatedTotal: number;
}

export interface TableRowsResponse {
  rows: Record<string, any>[];
  columns: ColumnInfo[];
  pagination: PaginationInfo;
  orderColumns: string[];
  orderDirection: 'asc' | 'desc';
}

export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'like'
  | 'not_like'
  | 'starts_with'
  | 'ends_with'
  | 'is_empty'
  | 'is_null'
  | 'not_null'
  | 'in';

export interface FilterCondition {
  column: string;
  operator: FilterOperator;
  value?: any; // Optional for is_null/not_null/is_empty
}

export interface TableRowsParams {
  schemaName?: string;
  limit?: number;
  cursor?: string;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
  filters?: FilterCondition[];
}

// ─── Column Stats ────────────────────────────────────────────────────────────

export interface TopValue {
  value: any;
  count: number;
  percent: number;
}

export interface Quantiles {
  q25: any;
  q50: any;
  q75: any;
}

export interface HistogramBin {
  bucket: number;
  count: number;
  percent: number;
  label?: string;
}

export interface ColumnStats {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isIndexed: boolean;
  nullCount: number | null;
  nullPercent: number | null;
  distinctCount: number | null;
  minValue: any;
  maxValue: any;
  avgValue: number | null;
  stdDevValue: number | null;
  quantiles: Quantiles | null;
  histogram?: HistogramBin[];
  /** True when min/max/quantiles/histogram derive from pg_stats (approximate). */
  approx: boolean;
  sampleValues: any[];
  topValues?: TopValue[];
}

export interface ColumnStatsResponse {
  columns: ColumnStats[];
  totalRows: number;
  sizeBytes: number;
  statsCollectedAt: string;
}

// ─── Table Schema ────────────────────────────────────────────────────────────

export interface TableSchema {
  columns: Array<{
    name: string;
    type: string;
    nullable: boolean;
    position: number;
    is_pk: boolean;
    is_indexed: boolean;
    is_fk: boolean;
    fk_ref?: { table: string; columns: string[] };
  }>;
  primaryKey: string[];
  indexes: Array<{
    name: string;
    columns: string[];
    isUnique: boolean;
  }>;
  estimatedRows: number;
}

// ─── Export ──────────────────────────────────────────────────────────────────

export type ExportScope = 'view' | 'table' | 'database';
export type ExportFormat = 'csv' | 'excel' | 'json' | 'ndjson' | 'sql';
export type SchemaExportStatus = 'running' | 'done' | 'error' | 'cancelled';

export interface ExportParams {
  schemaName?: string;
  maxRows?: number;
  format?: ExportFormat;
  filters?: FilterCondition[];
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
  columns?: string[];
}

/** Snapshot of the grid's active state, used by the View-scope export. */
export interface ExportGridContext {
  filters: FilterCondition[];
  orderBy: string | null;
  orderDirection: 'asc' | 'desc';
  visibleColumns: string[];
  allColumnsCount: number;
  estimatedTotal: number;
  tableCount?: number;
}
