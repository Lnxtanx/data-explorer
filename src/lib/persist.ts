// =============================================================================
// Explorer Query Cache Persistence (IndexedDB)
// Persists schema/table lists + column stats/schema so a reload renders them
// instantly. Row data is deliberately excluded (in-memory only) — see
// TABLE_SWITCH_CACHING_PLAN.md for the freshness & cleanup guarantees.
// =============================================================================

import { openDB, deleteDB } from 'idb';
import { experimental_createQueryPersister } from '@tanstack/react-query-persist-client';
import type { QueryClient } from '@tanstack/react-query';

export const EXPLORER_CACHE_DB = 'sw-explorer-query-cache';
const EXPLORER_CACHE_STORE = 'queries';
const EXPLORER_CACHE_BUSTER = 'v1';
const EXPLORER_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const dbPromise = openDB(EXPLORER_CACHE_DB, 1, {
  upgrade(db) {
    if (!db.objectStoreNames.contains(EXPLORER_CACHE_STORE)) {
      db.createObjectStore(EXPLORER_CACHE_STORE);
    }
  },
});

export const explorerPersister = experimental_createQueryPersister({
  buster: EXPLORER_CACHE_BUSTER,
  maxAge: EXPLORER_CACHE_MAX_AGE_MS,
  prefix: 'sw-explorer-query',
  refetchOnRestore: true,
  storage: {
    getItem: async (key) => {
      const value = await (await dbPromise).get(EXPLORER_CACHE_STORE, key);
      return typeof value === 'string' ? value : undefined;
    },
    setItem: async (key, value) => {
      await (await dbPromise).put(EXPLORER_CACHE_STORE, value, key);
    },
    removeItem: async (key) => {
      await (await dbPromise).delete(EXPLORER_CACHE_STORE, key);
    },
    entries: async () => {
      const db = await dbPromise;
      const keys = await db.getAllKeys(EXPLORER_CACHE_STORE);
      const values = await db.getAll(EXPLORER_CACHE_STORE);
      return keys.map((key, i) => [String(key), values[i]]);
    },
  },
  filters: {
    predicate: (query) => {
      const key = query.queryKey as readonly unknown[];
      return Array.isArray(key) && key[0] === 'data-explorer' && key[1] !== 'rows';
    },
  },
});

export const explorerQueryPersister = explorerPersister.persisterFn;

export async function restoreExplorerCache(queryClient: QueryClient) {
  await explorerPersister.restoreQueries(queryClient);
  await explorerPersister.persisterGc();
}

export async function purgeExplorerCache() {
  await explorerPersister.removeQueries();
}

export async function purgeExplorerCacheDb() {
  await purgeExplorerCache();
  try {
    const db = await dbPromise;
    db.close();
    await deleteDB(EXPLORER_CACHE_DB);
  } catch {
    // Other tabs may hold the DB open; the entry-level purge above already ran
  }
}