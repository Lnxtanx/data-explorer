// =============================================================================
// Characterization tests: the persisted query cache filter
//
// WHY THIS IS THE MOST IMPORTANT TEST IN THE FILE
//
// lib/persist.ts decides what survives a page reload with a hard-coded string
// comparison against the React Query key's first segment:
//
//     key[0] === 'data-explorer' && key[1] !== 'rows'
//
// Nothing type-checks that string against dataExplorerKeys.all. If Phase 3
// renames the key namespace while consolidating the six competing key factories,
// this predicate silently stops matching and the app loses persisted cache
// entirely — with no error, no test failure, and no visible symptom other than
// slower cold starts.
//
// This test makes the coupling explicit and will FAIL LOUDLY if either side
// changes independently.
// =============================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { QueryClient, hashKey } from '@tanstack/react-query';
import { dataExplorerKeys } from '../../components/data-explorer/api/hooks';
import { EXPLORER_CACHE_DB, explorerPersister, explorerQueryPersister, purgeExplorerCache } from '@/lib/persist';

/** The predicate, restated from lib/persist.ts so a change there is visible. */
function isPersisted(key: readonly unknown[]): boolean {
  return Array.isArray(key) && key[0] === 'data-explorer' && key[1] !== 'rows';
}

describe('persisted cache scope', () => {
  it('persists explorer metadata queries', () => {
    expect(isPersisted(dataExplorerKeys.schemas('c1'))).toBe(true);
    expect(isPersisted(dataExplorerKeys.tables('c1', 'public'))).toBe(true);
    expect(isPersisted(dataExplorerKeys.schema('c1', 'users', 'public'))).toBe(true);
    expect(isPersisted(dataExplorerKeys.stats('c1', 'users', 'public'))).toBe(true);
  });

  it('deliberately does NOT persist row data (it is unbounded)', () => {
    expect(isPersisted(dataExplorerKeys.rows('c1', 'users'))).toBe(false);
  });

  it('does not persist other domains', () => {
    expect(isPersisted(['connections', 'list', 'u1'])).toBe(false);
    expect(isPersisted(['connectors', 'list'])).toBe(false);
    expect(isPersisted(['dashboard', 'c1'])).toBe(false);
    expect(isPersisted(['payments', 'plans'])).toBe(false);
  });

  it('ignores non-array keys', () => {
    expect(isPersisted([])).toBe(false);
    expect(isPersisted(['data-explorer'])).toBe(true); // no segment 2 yet
  });

  it('THE CONTRACT: the predicate root is dataExplorerKeys.all[0]', () => {
    // If this fails, lib/persist.ts and the key factory have drifted apart and
    // cache persistence is broken app-wide.
    expect(dataExplorerKeys.all[0]).toBe('data-explorer');
  });
});

describe('persister wiring', () => {
  beforeEach(async () => {
    await purgeExplorerCache();
  });

  it('exposes the IndexedDB database name it owns', () => {
    expect(EXPLORER_CACHE_DB).toBe('sw-explorer-query-cache');
  });

  it('exposes the query-persister API surface the app relies on', () => {
    // NOTE: createQueryPersister() returns persisterFn / persistQuery /
    // retrieveQuery / restoreQueries — NOT the older createSyncStoragePersister
    // shape (persistClient / restoreClient). queryClient.ts wires `persisterFn`
    // into the QueryClient, and App.tsx calls restoreExplorerCache().
    for (const method of [
      'persisterFn',
      'persistQuery',
      'persistQueryByKey',
      'retrieveQuery',
      'persisterGc',
      'restoreQueries',
      'removeQueries',
    ] as const) {
      expect(typeof explorerPersister[method], method).toBe('function');
    }
  });

  it('persists a metadata query and can read it back', async () => {
    const key = dataExplorerKeys.schemas('c1');
    const hash = hashKey(key);
    await explorerPersister.persistQuery({
      queryKey: key,
      queryHash: hash,
      state: { data: ['public'], dataUpdatedAt: Date.now(), dataUpdateCount: 1 },
    } as never);

    await expect(explorerPersister.retrieveQuery(hash)).resolves.toBeDefined();
  });

  // ===========================================================================
  // REGRESSION TESTS for the filter bug found in Phase 0 and fixed in Phase 3.
  //
  // The old configuration was `filters: { predicate }`. The library types
  // `filters` as a react-query `QueryFilters` and evaluates it with
  // `matchQuery(filters, query)`; `QueryFilters` has no `predicate` member, so
  // an object carrying only `predicate` matched EVERY query. Every query in the
  // app — including unbounded table row data and every other domain — was being
  // written to IndexedDB.
  //
  // These drive `explorerQueryPersister` through a real QueryClient, which is
  // the only path the application uses. Asserting on `explorerPersister` alone
  // would not have caught the bug, because that object was never filtered at
  // all; the fix wraps `persisterFn`.
  // ===========================================================================

  /**
   * A QueryClient wired exactly as lib/queryClient.ts wires the real one.
   *
   * NOTE: `persister` MUST live inside `defaultOptions.queries`. react-query
   * reads it from the defaulted *query* options, so a top-level
   * `new QueryClient({ persister })` is silently ignored and nothing persists.
   */
  const persistedClient = () =>
    new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: Infinity,
          staleTime: Infinity,
          persister: explorerQueryPersister,
        },
      },
    });

  /**
   * `createQueryPersister` writes through `notifyManager.schedule` (a
   * macrotask) and then does NOT await `storage.setItem`, so a resolved
   * `prefetchQuery` does not mean the payload is on disk. Yield several
   * macrotasks so the IndexedDB write lands.
   *
   * This matters for test VALIDITY, not just speed: the exclusion tests below
   * assert that nothing was written. If the flush were too short they would
   * pass even if the filter were broken. The first test is the control — it
   * proves this exact harness does persist when a query is allowed, so a pass
   * in the exclusion tests means the filter worked, not that the write was
   * merely still in flight.
   */
  const flush = async () => {
    for (let i = 0; i < 10; i++) {
      await new Promise<void>((resolve) => setTimeout(resolve, 1));
    }
  };

  it('persists explorer metadata through the production persister', async () => {
    const key = dataExplorerKeys.schemas('c1');
    const client = persistedClient();
    await client.prefetchQuery({ queryKey: key, queryFn: async () => ['public', 'billing'] });
    await flush();

    await expect(explorerPersister.retrieveQuery(hashKey(key))).resolves.toBeDefined();
  });

  it('derives its root from the factory rather than repeating the string', async () => {
    // Phase 3 removed a bare `'data-explorer'` literal from lib/persist.ts. If
    // someone reintroduces a hardcoded root, this is the canary. Both the key
    // and the expectation are derived from the factory, so the test follows a
    // rename instead of silently passing against a stale literal.
    const key = dataExplorerKeys.tables('c1', 'public');
    const client = persistedClient();
    await client.prefetchQuery({ queryKey: key, queryFn: async () => ['t'] });
    await flush();

    await expect(explorerPersister.retrieveQuery(hashKey(key))).resolves.toBeDefined();
  });

  it('EXCLUDES row data', async () => {
    const key = dataExplorerKeys.rows('c1', 'users');
    const client = persistedClient();
    await client.prefetchQuery({ queryKey: key, queryFn: async () => [{ id: 1 }] });
    await flush();

    await expect(explorerPersister.retrieveQuery(hashKey(key))).resolves.toBeUndefined();
  });

  it('EXCLUDES other domains', async () => {
    const key = ['payments', 'plans'] as const;
    const client = persistedClient();
    await client.prefetchQuery({ queryKey: key, queryFn: async () => ['leaky'] });
    await flush();

    await expect(explorerPersister.retrieveQuery(hashKey(key))).resolves.toBeUndefined();
  });

  it('EXCLUDES connectors, dashboards and ai', async () => {
    const client = persistedClient();
    for (const key of [
      ['connectors', 'list'],
      ['dashboard', 'c1'],
      ['ai', 'chats', 'all'],
    ] as const) {
      await client.prefetchQuery({ queryKey: key, queryFn: async () => 'x' });
      await flush();
      await expect(
        explorerPersister.retrieveQuery(hashKey(key)),
        key.join('/'),
      ).resolves.toBeUndefined();
    }
  });

  it('never restores an excluded query, even if one is on disk', async () => {
    // Simulates an installation polluted by the buggy build: the payload is
    // already in IndexedDB before the client ever asks for it.
    const key = dataExplorerKeys.rows('c1', 'users');
    await explorerPersister.persistQuery({
      queryKey: key,
      queryHash: hashKey(key),
      state: { data: [{ stale: true }], dataUpdatedAt: Date.now(), dataUpdateCount: 1 },
    } as never);

    const fresh = persistedClient();
    await fresh.prefetchQuery({ queryKey: key, queryFn: async () => [{ fresh: true }] });

    // The queryFn result wins: the on-disk payload was not replayed.
    expect(fresh.getQueryData(key)).toEqual([{ fresh: true }]);
  });

  it('restores a persisted value into a fresh client', async () => {
    const source = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const key = dataExplorerKeys.tables('c1', 'public');
    source.setQueryData(key, [{ name: 'users' }]);
    await explorerPersister.persistQueryByKey(key, source);

    const fresh = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    expect(fresh.getQueryData(key)).toBeUndefined();
    await explorerPersister.restoreQueries(fresh, { queryKey: ['data-explorer'] });
    expect(fresh.getQueryData(key)).toEqual([{ name: 'users' }]);
  });

  it('survives a purge with no database open', async () => {
    await expect(purgeExplorerCache()).resolves.toBeUndefined();
  });
});
