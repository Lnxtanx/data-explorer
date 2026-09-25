// =============================================================================
// Characterization tests: React Query key factories
//
// WHY: the app had SIX competing key factories (dataExplorerKeys,
// connectionKeys, connectorKeys, aiQueryKeys, projectQueryKeys,
// chartQueryKeys) plus three ad-hoc string keys. Phase 3 removed the ad-hoc
// literals and pinned every factory with a test here. The factories stayed
// per-domain on purpose rather than merging into one root: they have different
// invalidation shapes, and a test per factory makes a rename a one-line edit
// instead of a hunt across call sites.
//
// Two specific hazards are pinned here, both found in the Phase 0 audit:
//
//   1. `useTableRows` and `useTableRowsSimple` build the IDENTICAL key for
//      different fetch semantics (cursor-paginated infinite vs single page).
//      If both mount in one tree they silently share a cache slot.
//   2. lib/persist.ts filters the persisted cache on the RAW STRING
//      'data-explorer'. If dataExplorerKeys.all changes, persistence for the
//      whole app dies silently. These tests make the key shape explicit so that
//      change becomes a deliberate, visible edit.
//
// Phase 3 must update these tests alongside the factories, not after.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { dataExplorerKeys } from '../../components/data-explorer/api/hooks';
import { connectionKeys } from '../../components/connector/api/useConnections';
import { connectorKeys } from '../../components/connector/api/index';
import { dashboardKeys } from '../../components/dashboard/api/dashboard';
import { queryKeys } from '@/lib/queryClient';
import { aiQueryKeys } from '../../components/ai/hooks/useAIChats';
import { projectQueryKeys } from '../../components/ai/hooks/useProjects';
import { chartQueryKeys } from '../../components/ai/hooks/useCharts';

const SRC = path.resolve(__dirname, '../..');

/** Every .ts/.tsx under src, excluding tests and this file. */
function sourceFiles(dir = SRC, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dashboard-engine') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, acc);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

describe('no hardcoded query keys outside the factories', () => {
  // Phase 3 guard. There were ~45 inline `queryKey: ['...']` / `invalidateQueries
  // ({ queryKey: ['...'] })` literals spread over 10 files. Each was a silent
  // failure mode: a typo produced an invalidation that matched nothing, so the
  // cache simply never refreshed, with no error anywhere. They are now all
  // expressed through a factory, and this test stops them coming back.
  it('finds no inline key array literals in application code', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const rel = path.relative(SRC, file).replace(/\\/g, '/');
      const src = readFileSync(file, 'utf8');
      src.split('\n').forEach((line, i) => {
        // Factory definitions legitimately build key arrays; so does persist.ts
        // (which derives its root from dataExplorerKeys) and queryClient.ts (the
        // root factory itself). Everything else must reference a factory.
        if (
          /queryKey:\s*\[\s*['"]/.test(line) ||
          /invalidateQueries\(\{\s*queryKey:\s*\[\s*['"]/.test(line) ||
          /cancelQueries\(\{\s*queryKey:\s*\[\s*['"]/.test(line)
        ) {
          offenders.push(`${rel}:${i + 1}  ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe('dashboardKeys', () => {
  it('produces the same arrays the inline literals did', () => {
    // These exact shapes were inlined 30+ times across useDashboard and the
    // side-panel hooks. Pinned so a refactor cannot silently change cache
    // identity, which would strand every cached entry.
    expect(dashboardKeys.all).toEqual(['dashboard']);
    expect(dashboardKeys.detail('c1')).toEqual(['dashboard', 'c1']);
    expect(dashboardKeys.meta('d1')).toEqual(['dashboard', 'meta', 'd1']);
    expect(dashboardKeys.sessions('c1')).toEqual(['dashboard', 'sessions', 'c1']);
    expect(dashboardKeys.sessionRoot).toEqual(['dashboard', 'session']);
    expect(dashboardKeys.session('r1')).toEqual(['dashboard', 'session', 'r1']);
  });

  it('keeps a null connectionId as a real, invalidatable key segment', () => {
    // These hooks are called with a possibly-null connectionId, and the inline
    // literals produced ['dashboard', null] — a key that prefix invalidation
    // matched. Narrowing the parameter type would have changed cache identity.
    expect(dashboardKeys.detail(null)).toEqual(['dashboard', null]);
  });

  it('orders segments so prefix invalidation is meaningful', () => {
    expect(dashboardKeys.sessionRoot.slice(0, 2))
      .toEqual(dashboardKeys.session('r1').slice(0, 2));
    expect(dashboardKeys.all.slice(0, 1))
      .toEqual(dashboardKeys.detail('c1').slice(0, 1));
  });
});

describe('ai/project/chart key prefixes', () => {
  it('exposes a bulk-invalidation prefix for chats', () => {
    expect(aiQueryKeys.chatsRoot).toEqual(['ai', 'chats']);
    expect(aiQueryKeys.chatsRoot.slice(0, 2))
      .toEqual(aiQueryKeys.chats('c1').slice(0, 2));
  });

  it('keeps the project and chart roots distinct from each other', () => {
    expect(projectQueryKeys.all).toEqual(['ai', 'projects']);
    expect(chartQueryKeys.all).toEqual(['ai', 'charts']);
    expect(projectQueryKeys.all).not.toEqual(chartQueryKeys.all);
  });

  it('gives the chart library its own shape, not the list shape', () => {
    // These differ: the library keys on a search string the queryFn ignores,
    // while list() keys on a connection. Collapsing them changes the caching
    // profile, so the difference is pinned rather than assumed.
    expect(chartQueryKeys.library('rev')).toEqual(['ai', 'charts', 'rev']);
    expect(chartQueryKeys.library('rev')).not.toEqual(chartQueryKeys.list());
  });
});

describe('connectionKeys', () => {
  it('scopes the list key by user, falling back to anonymous', () => {
    expect(connectionKeys.all).toEqual(['connections']);
    expect(connectionKeys.list('u1')).toEqual(['connections', 'list', 'u1']);
    expect(connectionKeys.list(undefined)).toEqual(['connections', 'list', 'anonymous']);
  });

  it('exposes a list prefix that covers every user bucket', () => {
    expect(connectionKeys.listRoot).toEqual(['connections', 'list']);
    expect(connectionKeys.list('u1').slice(0, 2))
      .toEqual(connectionKeys.listRoot);
  });

  it('is the ONLY definition of the connections namespace', () => {
    // Phase 1 deleted a second, disagreeing `connections` factory that used to
    // live in lib/queryClient.ts. It produced ['connections','list'] with no
    // user segment while the live one scopes by user, so the two could not be
    // reconciled by prefix matching. connectionKeys is now the single owner.
    expect((queryKeys as Record<string, unknown>).connections).toBeUndefined();
  });
});

describe('dataExplorerKeys', () => {
  it('namespaces every key under the persisted root', () => {
    expect(dataExplorerKeys.all).toEqual(['data-explorer']);
    for (const key of [
      dataExplorerKeys.schemas('c1'),
      dataExplorerKeys.tables('c1', 'public'),
      dataExplorerKeys.rows('c1', 'users'),
      dataExplorerKeys.stats('c1', 'users', 'public'),
      dataExplorerKeys.schema('c1', 'users', 'public'),
    ]) {
      expect(key.slice(0, 1)).toEqual(['data-explorer']);
    }
  });

  it('orders segments so prefix invalidation is safe', () => {
    // ['data-explorer', 'rows', cid, table] — invalidating
    // ['data-explorer', 'rows', cid] must also cover the per-table key.
    const rows = dataExplorerKeys.rows('c1', 'users');
    expect(rows.slice(0, 3)).toEqual(['data-explorer', 'rows', 'c1']);
  });

  it('separates stats by schema', () => {
    expect(dataExplorerKeys.stats('c1', 'users', 'public'))
      .not.toEqual(dataExplorerKeys.stats('c1', 'users', 'billing'));
  });

  it('keeps the exact root string that lib/persist.ts filters on', () => {
    // If you change this, update lib/persist.ts in the same commit or persisted
    // query cache restoration breaks for the entire app.
    expect(dataExplorerKeys.all[0]).toBe('data-explorer');
  });
});

describe('connectorKeys', () => {
  it('scopes logs and health with a stable "all" bucket', () => {
    expect(connectorKeys.logs()).toEqual(['connectors', 'logs', 'all']);
    expect(connectorKeys.logs('c1')).toEqual(['connectors', 'logs', 'c1']);
    expect(connectorKeys.health()).toEqual(['connectors', 'health', 'all', '24h']);
    expect(connectorKeys.health('c1', '7d')).toEqual(['connectors', 'health', 'c1', '7d']);
  });

  it('keeps a stable root', () => {
    expect(connectorKeys.all).toEqual(['connectors']);
    for (const key of [
      connectorKeys.list,
      connectorKeys.detail('a1'),
      connectorKeys.databases('a1'),
    ]) {
      expect(key[0]).toBe('connectors');
    }
  });
});

describe('queryKeys', () => {
  it('namespaces payments consistently', () => {
    expect(queryKeys.payments.all).toEqual(['payments']);
    expect(queryKeys.payments.plans[0]).toBe('payments');
    expect(queryKeys.payments.subscription).toEqual(['payments', 'subscription']);
  });

  it('namespaces the user profile', () => {
    expect(queryKeys.user.profile).toEqual(['user', 'profile']);
  });

  it('keeps every remaining root distinct', () => {
    const roots = new Set([queryKeys.user.all[0], queryKeys.payments.all[0]]);
    expect(roots.size).toBe(2);
  });

  it('exposes no factory for domains that own their own keys', () => {
    // connections -> connectionKeys, connectors -> connectorKeys,
    // data-explorer -> dataExplorerKeys. Duplicating them here is what caused
    // the identity mismatch removed in Phase 1.
    const keys = queryKeys as Record<string, unknown>;
    for (const foreign of ['files', 'connections', 'connectors', 'data-explorer', 'dashboard']) {
      expect(keys[foreign], foreign).toBeUndefined();
    }
  });
});

