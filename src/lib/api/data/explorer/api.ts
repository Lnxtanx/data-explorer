// =============================================================================
// Data Explorer API Functions
// =============================================================================

import { get, post, del, API_BASE_URL } from '../../client';
import type {
  SchemaListResponse,
  TableListResponse,
  TableRowsResponse,
  TableRowsParams,
  ColumnStatsResponse,
  TableSchema,
  ExportParams,
  SchemaExportStatus,
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
  if (response?.success === false) {
    const err = new Error((response as any).message || (response as any).error || 'Request failed');
    (err as any).status = 500;
    (err as any).code = (response as any).code || (response as any).error;
    (err as any).hint = (response as any).hint;
    throw err;
  }
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
 * Pass `column` to restrict computation to a single column (cheap for wide tables).
 * Pass `mode='pg_stats'` for a cheap whole-table profile (header distribution
 * bars) computed only from Postgres statistics.
 */
export async function fetchColumnStats(
  connectionId: string,
  tableName: string,
  schemaName: string = 'public',
  column?: string,
  mode?: 'pg_stats'
): Promise<ColumnStatsResponse> {
  const params = new URLSearchParams({ schemaName });
  if (column) params.set('column', column);
  if (mode) params.set('mode', mode);
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
 * Honors filters, sort and visible-column projection (server-side).
 */
export function getExportUrl(
  connectionId: string,
  tableName: string,
  schemaName: string = 'public',
  params: ExportParams = {}
): string {
  const qs = new URLSearchParams({
    schemaName,
    format: params.format || 'csv',
    maxRows: String(params.maxRows ?? 10000),
  });
  if (params.filters && params.filters.length > 0) {
    qs.set('filters', JSON.stringify(params.filters));
  }
  if (params.orderBy) qs.set('orderBy', params.orderBy);
  if (params.orderDirection) qs.set('orderDirection', params.orderDirection);
  if (params.columns && params.columns.length > 0) {
    qs.set('columns', params.columns.join(','));
  }
  return `${API_BASE_URL}/api/data/${connectionId}/tables/${encodeURIComponent(tableName)}/export?${qs}`;
}

/**
 * Fetch a table export as a blob (instead of anchor navigation) so we can
 * read response headers (row count / cap status) and detect failures.
 */
export async function fetchTableExport(
  connectionId: string,
  tableName: string,
  schemaName: string = 'public',
  params: ExportParams = {}
): Promise<{ blob: Blob; filename: string; rowCount: number; capped: boolean }> {
  const response = await fetch(getExportUrl(connectionId, tableName, schemaName, params), {
    credentials: 'include',
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `Export failed (${response.status})`);
  }

  const rowCount = Number(response.headers.get('X-Export-Row-Count') || 0);
  const capped = response.headers.get('X-Export-Capped') === 'true';
  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : `${tableName}.${params.format || 'csv'}`;
  const blob = await response.blob();
  return { blob, filename, rowCount, capped };
}

/**
 * Start a background database/schema export. `schemas` is the comma-separated
 * list of schema names to include; empty → all user schemas. Returns a job id
 * that is polled for progress and then used to download the streamed ZIP.
 */
export async function startSchemaExport(
  connectionId: string,
  schemas: string[],
  format: string = 'csv'
): Promise<{ jobId: string; tableCount: number }> {
  const params = new URLSearchParams({ format });
  if (schemas.length > 0) params.set('schemas', schemas.join(','));
  const response = await post<ApiResponse<{ jobId: string; tableCount: number }>>(
    `/api/data/${connectionId}/export-all?${params}`
  );
  return unwrapResponse(response);
}

/**
 * Poll progress of a schema/database export job.
 */
export async function getSchemaExportProgress(
  connectionId: string,
  jobId: string
): Promise<{ done: number; total: number; status: SchemaExportStatus }> {
  const response = await get<ApiResponse<{ done: number; total: number; status: SchemaExportStatus }>>(
    `/api/data/${connectionId}/export-all/${jobId}/progress`
  );
  return unwrapResponse(response);
}

/**
 * Cancel a running schema/database export job.
 */
export async function cancelSchemaExport(
  connectionId: string,
  jobId: string
): Promise<{ status: SchemaExportStatus }> {
  const response = await del<ApiResponse<{ status: SchemaExportStatus }>>(
    `/api/data/${connectionId}/export-all/${jobId}`
  );
  return unwrapResponse(response);
}
/**
 * URL that streams the finished ZIP for a schema export job.
 */
export function getSchemaExportDownloadUrl(connectionId: string, jobId: string): string {
  return `${API_BASE_URL}/api/data/${connectionId}/export-all/${jobId}/download`;
}

/**
 * Trigger a schema ZIP download via the browser (anchor navigation).
 */
export function downloadSchemaExport(
  connectionId: string,
  jobId: string
): void {
  const link = document.createElement('a');
  link.href = getSchemaExportDownloadUrl(connectionId, jobId);
  link.download = `schema_export_${new Date().toISOString().split('T')[0]}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Stream and fetch the generated ZIP blob for a schema export job.
 */
export async function fetchSchemaExportBlob(
  connectionId: string,
  jobId: string,
  signal?: AbortSignal
): Promise<{ blob: Blob; filename: string; tableCount: number }> {
  const url = getSchemaExportDownloadUrl(connectionId, jobId);
  const response = await fetch(url, {
    credentials: 'include',
    signal,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `Schema export failed (${response.status})`);
  }

  const tableCount = Number(response.headers.get('X-Export-Table-Count') || 0);
  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : `database_export_${new Date().toISOString().split('T')[0]}.zip`;
  const blob = await response.blob();
  return { blob, filename, tableCount };
}
