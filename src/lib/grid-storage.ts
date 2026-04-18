export interface ColumnWidthCache {
  v: number; // version
  ts: number; // timestamp
  cols: Record<string, { w: number, r: number }>;
}

const CACHE_VERSION = 1;
const MAX_CACHE_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_TABLES_CACHED = 50;
const REGISTRY_KEY = 'sw-grid-cache-index';
const CACHE_PREFIX = 'sw-data-explorer-cols-';

function getCacheKey(connectionId: string, schemaName: string, tableName: string) {
  return `${CACHE_PREFIX}${connectionId}-${schemaName}-${tableName}`;
}

/**
 * Validates, normalizes, and hydrates column widths from localStorage.
 */
export function loadColumnWidths(connectionId: string, schemaName: string, tableName: string): Record<string, number> {
  if (typeof window === 'undefined') return {};
  
  const key = getCacheKey(connectionId, schemaName, tableName);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    
    const parsed = JSON.parse(raw) as ColumnWidthCache;
    
    // Schema Validator
    if (parsed.v !== CACHE_VERSION || typeof parsed.ts !== 'number' || typeof parsed.cols !== 'object') {
      localStorage.removeItem(key);
      return {};
    }
    
    // TTL Check
    if (Date.now() - parsed.ts > MAX_CACHE_AGE_MS) {
      localStorage.removeItem(key);
      return {};
    }
    
    const screenWidth = window.innerWidth;
    const finalWidths: Record<string, number> = {};
    
    // Viewport relative normalization
    for (const [colName, data] of Object.entries(parsed.cols)) {
      if (typeof data.w !== 'number') continue;
      // Ensure restored width never exceeds 85% of active viewport width, or shrinks below 50px
      finalWidths[colName] = Math.max(50, Math.min(data.w, screenWidth * 0.85));
    }
    
    return finalWidths;
  } catch {
    // Defensive parsing failure: purge poisoned key to auto-recover without WSOD
    try { localStorage.removeItem(key); } catch {}
    return {};
  }
}

/**
 * Commits visual widths to local storage cache utilizing LRU eviction.
 */
export function saveColumnWidths(connectionId: string, schemaName: string, tableName: string, widths: Record<string, number>) {
  if (typeof window === 'undefined') return;
  
  const key = getCacheKey(connectionId, schemaName, tableName);
  const screenWidth = window.innerWidth;
  
  const cacheObj: ColumnWidthCache = {
    v: CACHE_VERSION,
    ts: Date.now(),
    cols: {}
  };
  
  for (const [colName, width] of Object.entries(widths)) {
    cacheObj.cols[colName] = { w: width, r: width / screenWidth };
  }
  
  try {
    manageLRUCache(key);
    localStorage.setItem(key, JSON.stringify(cacheObj));
  } catch (e) {
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
  } catch {}
}
