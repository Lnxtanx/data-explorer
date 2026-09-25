// =============================================================================
// Explorer UI Preferences (localStorage)
//
// Phase 3: this file used to hand-roll the version-stamp / TTL / defensive-parse
// pattern for `sw-explorer-last-table` while storing `sw-explorer-page-size` as
// a BARE STRING in the same file — two conventions side by side, which is
// exactly the drift @/shared/storage/store exists to prevent.
//
// It now delegates to createStore. `version` is kept at 1 and `migrate` maps the
// old flat payload onto the new envelope, so existing users keep their
// last-viewed table. The bare page-size string is migrated the same way.
// =============================================================================

import { createStore } from '@/shared/storage/store';
import { registerKey } from '@/shared/storage/registry';

const PREF_VERSION = 1;
const MAX_PREF_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const LAST_TABLE_KEY = 'sw-explorer-last-table';
const PAGE_SIZE_KEY = 'sw-explorer-page-size';

/** Shape returned to callers. `v`/`ts` were part of the old public type. */
export interface LastViewedTable {
  connectionId: string;
  schemaName: string;
  tableName: string;
}

const isLastViewedTable = (value: unknown): value is LastViewedTable =>
  !!value
  && typeof (value as LastViewedTable).connectionId === 'string'
  && typeof (value as LastViewedTable).schemaName === 'string'
  && typeof (value as LastViewedTable).tableName === 'string';

const lastTableStore = createStore<LastViewedTable | null>({
  key: LAST_TABLE_KEY,
  version: PREF_VERSION,
  ttlMs: MAX_PREF_AGE_MS,
  fallback: null,
  validate: (v): v is LastViewedTable => v === null || isLastViewedTable(v),
  // Legacy: the record was already { v, connectionId, schemaName, tableName, ts }
  // at the top level rather than nested under `data`, and carried no envelope.
  // The `ts` is carried across so migration does not reset the 30-day TTL.
  migrate: (raw) => {
    if (raw === null) return { data: null, ts: Date.now() };
    if (typeof raw !== 'object') return undefined;
    const r = raw as Record<string, unknown>;
    const ts = typeof r.ts === 'number' ? r.ts : Date.now();
    if (isLastViewedTable(r)) {
      // Narrow: the legacy record also carried v/ts, which are not part of the
      // value callers see.
      return {
        data: {
          connectionId: r.connectionId as string,
          schemaName: r.schemaName as string,
          tableName: r.tableName as string,
        },
        ts,
      };
    }
    return undefined;
  },
});

registerKey(LAST_TABLE_KEY, 'data-explorer');

export function saveLastViewedTable(
  connectionId: string,
  schemaName: string,
  tableName: string,
) {
  if (typeof window === 'undefined') return;
  lastTableStore.write({ connectionId, schemaName, tableName });
}

export function loadLastViewedTable(): LastViewedTable | null {
  if (typeof window === 'undefined') return null;
  return lastTableStore.read();
}

export const EXPLORER_PAGE_SIZES = [100, 250, 500, 1000, 2000] as const;
export const DEFAULT_PAGE_SIZE = 500;

const isAllowedPageSize = (value: unknown): value is number =>
  EXPLORER_PAGE_SIZES.includes(value as (typeof EXPLORER_PAGE_SIZES)[number]);

const pageSizeStore = createStore<number>({
  key: PAGE_SIZE_KEY,
  version: PREF_VERSION,
  fallback: DEFAULT_PAGE_SIZE,
  validate: isAllowedPageSize,
  // Legacy: stored as a bare decimal string, e.g. "1000".
  migrate: (raw) => {
    if (typeof raw === 'string' || typeof raw === 'number') {
      const parsed = parseInt(String(raw), 10);
      return isAllowedPageSize(parsed) ? parsed : undefined;
    }
    if (raw && typeof raw === 'object' && 'data' in raw) {
      return (raw as { data: unknown }).data;
    }
    return undefined;
  },
});

registerKey(PAGE_SIZE_KEY, 'data-explorer');

export function getExplorerPageSize(): number {
  if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE;
  // An unrecognised stored value is discarded by the store, which is why the
  // old "remove the poisoned key then return the default" dance is gone.
  return pageSizeStore.read();
}

export function setExplorerPageSize(size: number) {
  if (typeof window === 'undefined') return;
  // Rejected before writing, so an invalid value leaves the previous
  // preference intact — matching the previous behaviour.
  if (!isAllowedPageSize(size)) return;
  pageSizeStore.write(size);
}
