// =============================================================================
// Grid layout persistence (column widths + hidden columns) with LRU eviction.
//
// Phase 3: the version/TTL/parse-and-purge logic now goes through
// @/shared/storage/store. The LRU index stays here because it is a policy over
// the whole `sw-data-explorer-cols-` namespace rather than a property of one
// value, and it has to tolerate both the legacy flat record and the new
// envelope while a namespace is mid-migration.
//
// Migration is lossless: the legacy `{ v, ts, cols }` record is mapped onto the
// envelope, so nobody loses their column layout by deploying this.
// =============================================================================

import { createStore } from '@/shared/storage/store';
import { registerKey } from '@/shared/storage/registry';

const CACHE_VERSION = 1;
const MAX_CACHE_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_TABLES_CACHED = 50;
const REGISTRY_KEY = 'sw-grid-cache-index';
const CACHE_PREFIX = 'sw-data-explorer-cols-';
const HIDDEN_COLS_PREFIX = 'sw-data-explorer-hidden-cols-';

/** One column's persisted geometry. `r` is the viewport-relative width. */
export interface ColumnEntry {
  w: number;
  r: number;
}

export interface ColumnWidthCache {
  cols: Record<string, ColumnEntry>;
}

function getCacheKey(connectionId: string, schemaName: string, tableName: string) {
  return `${CACHE_PREFIX}${connectionId}-${schemaName}-${tableName}`;
}

function getHiddenColsKey(connectionId: string, schemaName: string, tableName: string) {
  return `${HIDDEN_COLS_PREFIX}${connectionId}-${schemaName}-${tableName}`;
}

const isColumnWidthCache = (value: unknown): value is ColumnWidthCache =>
  !!value
  && typeof value === 'object'
  && typeof (value as ColumnWidthCache).cols === 'object'
  && (value as ColumnWidthCache).cols !== null;

const widthStore = (key: string) =>
  createStore<ColumnWidthCache>({
    key,
    version: CACHE_VERSION,
    ttlMs: MAX_CACHE_AGE_MS,
    fallback: { cols: {} },
    validate: isColumnWidthCache,
    // Legacy: { v, ts, cols } at the top level — already the right shape, just
    // not wrapped in an envelope. `ts` carries across so migration does not
    // reset the 30-day TTL.
    migrate: (raw) => {
      if (!raw || typeof raw !== 'object') return undefined;
      const r = raw as Record<string, unknown>;
      const ts = typeof r.ts === 'number' ? r.ts : Date.now();
      if (isColumnWidthCache(r)) return { data: r, ts };
      return undefined;
    },
  });

/**
 * Validates, normalizes, and hydrates column widths from localStorage.
 */
export function loadColumnWidths(
  connectionId: string,
  schemaName: string,
  tableName: string,
): Record<string, number> {
  if (typeof window === 'undefined') return {};

  const key = getCacheKey(connectionId, schemaName, tableName);
  const parsed = widthStore(key).read();

  const screenWidth = window.innerWidth;
  const finalWidths: Record<string, number> = {};

  // Viewport relative normalization. A restored width never exceeds 85% of the
  // active viewport, nor shrinks below 50px.
  for (const [colName, data] of Object.entries(parsed.cols)) {
    if (typeof data?.w !== 'number') continue;
    finalWidths[colName] = Math.max(50, Math.min(data.w, screenWidth * 0.85));
  }

  return finalWidths;
}

/**
 * Commits visual widths to local storage cache utilizing LRU eviction.
 */
export function saveColumnWidths(
  connectionId: string,
  schemaName: string,
  tableName: string,
  widths: Record<string, number>,
) {
  if (typeof window === 'undefined') return;

  const key = getCacheKey(connectionId, schemaName, tableName);
  const screenWidth = window.innerWidth;
  registerKey(key, 'data-explorer');

  const cols: Record<string, ColumnEntry> = {};
  for (const [colName, width] of Object.entries(widths)) {
    cols[colName] = { w: width, r: width / screenWidth };
  }

  try {
    manageLRUCache(key);
    widthStore(key).write({ cols });
  } catch {
    // Graceful degradation if QuotaExceededError is thrown by Safari/iOS
  }
}

/**
 * Actively purges oldest cached grids from localStorage if cache size exceeds strict limit.
 */
function manageLRUCache(newKey: string) {
  try {
    const rawRegistry = localStorage.getItem(REGISTRY_KEY);
    let registry: string[] = [];
    if (rawRegistry) {
      registry = JSON.parse(rawRegistry);
      if (!Array.isArray(registry)) registry = [];
    }

    // Move to end (most recently used)
    registry = registry.filter((k: string) => k !== newKey);
    registry.push(newKey);

    // Evict oldest if exceeding cache boundaries
    while (registry.length > MAX_TABLES_CACHED) {
      const oldestKey = registry.shift();
      if (oldestKey) localStorage.removeItem(oldestKey);
    }

    localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
  } catch {
    /* registry is a cache too; losing it only costs eviction accuracy */
  }
}

const hiddenColsStore = (key: string) =>
  createStore<string[]>({
    key,
    version: CACHE_VERSION,
    fallback: [],
    // Legacy: a bare JSON array of strings.
    migrate: (raw) => (Array.isArray(raw) ? raw : undefined),
  });

export function loadHiddenColumns(
  connectionId: string,
  schemaName: string,
  tableName: string,
): Set<string> {
  if (typeof window === 'undefined' || !connectionId || !tableName) return new Set();
  const parsed = hiddenColsStore(getHiddenColsKey(connectionId, schemaName, tableName)).read();
  return new Set(parsed.filter((x): x is string => typeof x === 'string'));
}

export function saveHiddenColumns(
  connectionId: string,
  schemaName: string,
  tableName: string,
  hiddenColumns: Set<string>,
): void {
  if (typeof window === 'undefined' || !connectionId || !tableName) return;
  const key = getHiddenColsKey(connectionId, schemaName, tableName);
  registerKey(key, 'data-explorer');
  if (hiddenColumns.size === 0) {
    localStorage.removeItem(key);
  } else {
    hiddenColsStore(key).write(Array.from(hiddenColumns));
  }
}
