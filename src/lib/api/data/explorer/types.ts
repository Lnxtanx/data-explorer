// =============================================================================
// Data Explorer API Types
// =============================================================================

// ─── Schema List ────────────────────────────────────────────────────────────

export interface SchemaListResponse {
  schemas: string[];
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

export interface FilterCondition {
  column: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'is_null' | 'not_null' | 'in';
  value?: any; // Optional for is_null/not_null
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

export interface ColumnStats {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isIndexed: boolean;
  nullCount: number;
  nullPercent: number;
  distinctCount: number;
  minValue: any;
  maxValue: any;
  avgValue: number | null;
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

export interface ExportParams {
  schemaName?: string;
  maxRows?: number;
}
