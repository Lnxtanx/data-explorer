// =============================================================================
// Explorer UI Preferences (localStorage)
// Small, validated, self-healing preference keys — mirrors grid-storage.ts
// conventions (version stamp, TTL, defensive parse). NEVER store row data here.
// =============================================================================

export interface LastViewedTable {
  v: number;
  connectionId: string;
  schemaName: string;
  tableName: string;
  ts: number;
}

const PREF_VERSION = 1;
const MAX_PREF_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const LAST_TABLE_KEY = 'sw-explorer-last-table';

export function saveLastViewedTable(connectionId: string, schemaName: string, tableName: string) {
  if (typeof window === 'undefined') return;
  try {
    const value: LastViewedTable = {
      v: PREF_VERSION,
      connectionId,
      schemaName,
      tableName,
      ts: Date.now(),
    };
    localStorage.setItem(LAST_TABLE_KEY, JSON.stringify(value));
  } catch {
    // Quota/security errors: degrade gracefully, never crash the explorer
  }
}

export function loadLastViewedTable(): LastViewedTable | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LAST_TABLE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as LastViewedTable;

    if (
      parsed.v !== PREF_VERSION ||
      typeof parsed.connectionId !== 'string' ||
      typeof parsed.schemaName !== 'string' ||
      typeof parsed.tableName !== 'string' ||
      typeof parsed.ts !== 'number'
    ) {
      localStorage.removeItem(LAST_TABLE_KEY);
      return null;
    }

    if (Date.now() - parsed.ts > MAX_PREF_AGE_MS) {
      localStorage.removeItem(LAST_TABLE_KEY);
      return null;
    }

    return parsed;
  } catch {
    try {
      localStorage.removeItem(LAST_TABLE_KEY);
    } catch {
      // best-effort purge of poisoned key
    }
    return null;
  }
}

export function clearLastViewedTable() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(LAST_TABLE_KEY);
  } catch {
    // best-effort
  }
}

// =============================================================================
// Page size preference (rows per page)
// =============================================================================

export const EXPLORER_PAGE_SIZES = [100, 250, 500, 1000, 2000] as const;
export const DEFAULT_PAGE_SIZE = 500;
const PAGE_SIZE_KEY = 'sw-explorer-page-size';

export function getExplorerPageSize(): number {
  if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE;
  try {
    const raw = localStorage.getItem(PAGE_SIZE_KEY);
    if (!raw) return DEFAULT_PAGE_SIZE;
    const parsed = parseInt(raw, 10);
    if (!EXPLORER_PAGE_SIZES.includes(parsed as (typeof EXPLORER_PAGE_SIZES)[number])) {
      localStorage.removeItem(PAGE_SIZE_KEY);
      return DEFAULT_PAGE_SIZE;
    }
    return parsed;
  } catch {
    return DEFAULT_PAGE_SIZE;
  }
}

export function setExplorerPageSize(size: number) {
  if (typeof window === 'undefined') return;
  if (!EXPLORER_PAGE_SIZES.includes(size as (typeof EXPLORER_PAGE_SIZES)[number])) return;
  try {
    localStorage.setItem(PAGE_SIZE_KEY, String(size));
  } catch {
    // best-effort
  }
}

export function clearExplorerPageSize() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(PAGE_SIZE_KEY);
  } catch {
    // best-effort
  }
}
