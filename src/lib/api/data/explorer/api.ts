// =============================================================================
// Data Explorer API Functions
// =============================================================================

import { get, API_BASE_URL } from '../../client';
import type {
  SchemaListResponse,
  TableListResponse,
  TableRowsResponse,
  TableRowsParams,
  ColumnStatsResponse,
  TableSchema,
} from './types';

/**
 * Response wrapper from backend sendSuccess()
 */
interface ApiResponse<T> {
  success: boolean;
  [key: string]: any;
}

/**
 * Unwrap sendSuccess response - backend returns { success: true, ...data }
 */
function unwrapResponse<T>(response: ApiResponse<T>): T {
  const { success, ...data } = response;
  return data as T;
}

/**
 * Get list of accessible schemas in the database.
 */
export async function fetchSchemas(connectionId: string): Promise<SchemaListResponse> {
  const response = await get<ApiResponse<SchemaListResponse>>(`/api/data/${connectionId}/schemas`);
  return unwrapResponse(response);
}

/**
 * Get list of tables with engineering metadata.
 */
export async function fetchTableList(
  connectionId: string,
  schemaName: string = 'public'
): Promise<TableListResponse> {
  const params = new URLSearchParams({ schemaName });
  const response = await get<ApiResponse<TableListResponse>>(`/api/data/${connectionId}/tables?${params}`);
  return unwrapResponse(response);
}

/**
 * Get paginated rows from a table.
 */
export async function fetchTableRows(
  connectionId: string,
  tableName: string,
  params: TableRowsParams = {}
): Promise<TableRowsResponse> {
  const searchParams = new URLSearchParams();

  if (params.schemaName) searchParams.set('schemaName', params.schemaName);
  if (params.limit) searchParams.set('limit', String(params.limit));
  if (params.cursor) searchParams.set('cursor', params.cursor);
  if (params.orderBy) searchParams.set('orderBy', params.orderBy);
  if (params.orderDirection) searchParams.set('orderDirection', params.orderDirection);
  if (params.filters && params.filters.length > 0) {
    searchParams.set('filters', JSON.stringify(params.filters));
  }

  const response = await get<ApiResponse<TableRowsResponse>>(
    `/api/data/${connectionId}/tables/${encodeURIComponent(tableName)}/rows?${searchParams}`
  );
  return unwrapResponse(response);
}

/**
 * Get column statistics for a table.
 */
export async function fetchColumnStats(
  connectionId: string,
  tableName: string,
  schemaName: string = 'public'
): Promise<ColumnStatsResponse> {
  const params = new URLSearchParams({ schemaName });
  const response = await get<ApiResponse<ColumnStatsResponse>>(
    `/api/data/${connectionId}/tables/${encodeURIComponent(tableName)}/stats?${params}`
  );
  return unwrapResponse(response);
}

/**
 * Get table schema (columns, PK, indexes, FKs).
 */
export async function fetchTableSchema(
  connectionId: string,
  tableName: string,
  schemaName: string = 'public'
): Promise<TableSchema> {
  const params = new URLSearchParams({ schemaName });
  const response = await get<ApiResponse<TableSchema>>(
    `/api/data/${connectionId}/tables/${encodeURIComponent(tableName)}/schema?${params}`
  );
  return unwrapResponse(response);
}

/**
 * Get data export URL for a table.
 * Returns URL for direct download.
 */
export function getExportUrl(
  connectionId: string,
  tableName: string,
  schemaName: string = 'public',
  maxRows: number = 10000,
  format: string = 'csv'
): string {
  const params = new URLSearchParams({
    schemaName,
    maxRows: String(maxRows),
    format,
  });
  return `${API_BASE_URL}/api/data/${connectionId}/tables/${encodeURIComponent(tableName)}/export?${params}`;
}

/**
 * Trigger data download for a table.
 */
export function downloadTableData(
  connectionId: string,
  tableName: string,
  schemaName: string = 'public',
  maxRows: number = 10000,
  format: string = 'csv'
): void {
  const url = getExportUrl(connectionId, tableName, schemaName, maxRows, format);

  // Create a temporary link and click it
  const link = document.createElement('a');
  link.href = url;

  // Set accurate extension
  const ext = format === 'excel' ? 'xlsx' : format;
  link.download = `${tableName}_${new Date().toISOString().split('T')[0]}.${ext}`;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Get data export URL for all tables in a schema.
 * Returns URL for direct download of ZIP archive.
 */
export function getExportAllUrl(
  connectionId: string,
  schemaName: string = 'public',
  format: string = 'csv'
): string {
  const params = new URLSearchParams({ schemaName, format });
  return `${API_BASE_URL}/api/data/${connectionId}/export-all?${params}`;
}

/**
 * Trigger data download for all tables in a schema as a ZIP archive.
 */
export function downloadAllTablesData(
  connectionId: string,
  schemaName: string = 'public',
  format: string = 'csv'
): void {
  const url = getExportAllUrl(connectionId, schemaName, format);

  // Create a temporary link and click it
  const link = document.createElement('a');
  link.href = url;
  
  // Set ZIP extension
  link.download = `schema_export_${new Date().toISOString().split('T')[0]}.zip`;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
