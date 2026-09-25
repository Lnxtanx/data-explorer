// =============================================================================
// Explorer Query Cache Persistence (IndexedDB)
// Persists schema/table lists + column stats/schema so a reload renders them
// instantly. Row data is deliberately excluded (in-memory only) — see
// TABLE_SWITCH_CACHING_PLAN.md for the freshness & cleanup guarantees.
// =============================================================================

import { openDB, deleteDB } from 'idb';
import { experimental_createQueryPersister } from '@tanstack/react-query-persist-client';
import type { QueryClient } from '@tanstack/react-query';
import { DATA_EXPLORER_QUERY_ROOT } from '@/shared/lib/queryRoots';

export const EXPLORER_CACHE_DB = 'sw-explorer-query-cache';
const EXPLORER_CACHE_STORE = 'queries';
const EXPLORER_CACHE_BUSTER = 'v1';
const EXPLORER_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Key root for everything this module is allowed to persist.
 *
 * Phase 3: this used to be the bare string literal `'data-explorer'`, duplicated
 * from the key factory. Nothing type-checked the two against each other, so
 * renaming the key namespace would have silently disabled persistence for the
 * whole app — no error, no test failure, just permanently cold cache restores.
 * It was then DERIVED from dataExplorerKeys so the two could not drift.
 *
 * Phase 4: the factory moved to components/data-explorer/api/, and a lib/ module
 * may not import from components/. The root therefore lives one layer lower, in
 * @/shared/lib/queryRoots, which both sides import — same single-source guarantee,
 * without the inversion. See that file for the full reasoning.
 */
const PERSISTED_ROOT = DATA_EXPLORER_QUERY_ROOT;

/**
 * Row data is deliberately excluded: table rows are unbounded, and caching them
 * in IndexedDB is exactly the growth this module exists to avoid.
 *
 * REGRESSION NOTE (fixed in Phase 3): this predicate used to be configured as
 * `filters: { predicate }` on the persister. That was a silent no-op. The
 * library types `filters` as a react-query `QueryFilters` and evaluates it with
 * `matchQuery(filters, query)`, which matches on queryKey prefix / exact / type
 * and has no `predicate` member — so an object carrying only `predicate`
 * matched EVERY query. Every query in the app, including unbounded row data and
 * every other domain, was being written to IndexedDB. The two `it.fails` tests
 * that caught this are now real regression tests.
 */
function shouldPersistQuery(queryKey: readonly unknown[]): boolean {
  return Array.isArray(queryKey)
    && queryKey[0] === PERSISTED_ROOT
    && queryKey[1] !== 'rows';
}

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
  // Coarse filter the library CAN express: everything under the explorer root.
  // The finer "not rows" exclusion is applied in explorerQueryPersister below,
  // because QueryFilters has no negation.
  filters: {
    queryKey: [PERSISTED_ROOT],
  },
});

const innerPersister = explorerPersister.persisterFn;

/**
 * The persister handed to the QueryClient.
 *
 * `createQueryPersister` only consults its own `filters` inside `persisterFn`,
 * and that filter cannot express "everything under `data-explorer` except
 * `rows`". This wrapper is the single choke point every read and write passes
 * through, so applying the fine-grained predicate here is both sufficient and
 * cheap — no JSON parsing of the payload, which matters precisely because the
 * excluded queries are the large ones.
 *
 * Excluded queries neither persist nor restore, so a stale row payload can
 * never reappear from a previous session.
 */
export const explorerQueryPersister: typeof innerPersister = (queryFn, ctx, query) => {
  if (!shouldPersistQuery(query.queryKey as readonly unknown[])) {
    // The persister contract is always-Promise; Promise.resolve keeps the
    // excluded branch type-identical to the delegated one.
    return Promise.resolve(queryFn(ctx));
  }
  return innerPersister(queryFn, ctx, query);
};

/**
 * Rehydrate persisted explorer metadata.
 *
 * The restore is scoped to the explorer root on purpose. The predicate bug
 * described above meant earlier builds could have written other domains
 * (payments, connectors, dashboards, AI chats) into this same database, and an
 * unscoped restore would replay them. Existing installations therefore get
 * cleaned up on first load rather than needing a manual purge.
 */
export async function restoreExplorerCache(queryClient: QueryClient) {
  await explorerPersister.restoreQueries(queryClient, { queryKey: [PERSISTED_ROOT] });
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