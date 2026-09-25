// =============================================================================
// Migration tests: legacy on-disk payloads must survive the store refactor.
//
// Phase 3 moved explorer-preferences, chatDrafts and grid-storage onto
// @/shared/storage/store, which changes the stored ENVELOPE. Deploying that
// would silently reset every user's saved column widths, last-viewed table and
// unsent chat draft — a real, permanent loss of state that no type checker and no
// behavioural test would catch.
//
// So each store declares a `migrate`, and these tests assert the legacy formats
// still read back correctly. The fixtures below are byte-for-byte the shapes the
// previous implementations wrote.
// =============================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveLastViewedTable,
  loadLastViewedTable,
  setExplorerPageSize,
  getExplorerPageSize,
  DEFAULT_PAGE_SIZE,
} from '../../components/data-explorer/storage/explorer-preferences';
import { saveDraft, getDraft } from '../../components/ai/storage/chatDrafts';
import { saveColumnWidths, loadColumnWidths, saveHiddenColumns, loadHiddenColumns } from '../../components/data-explorer/storage/grid-storage';

const CID = 'agent1:db1';
const OLD = 30 * 24 * 60 * 60 * 1000; // inside every TTL

beforeEach(() => {
  localStorage.clear();
});

describe('explorer-preferences migration', () => {
  it('reads a legacy flat last-viewed-table record', () => {
    // legacy: { v, connectionId, schemaName, tableName, ts } at top level
    localStorage.setItem('sw-explorer-last-table', JSON.stringify({
      v: 1, connectionId: CID, schemaName: 'public', tableName: 'orders', ts: Date.now(),
    }));
    expect(loadLastViewedTable()).toEqual({
      connectionId: CID, schemaName: 'public', tableName: 'orders',
    });
  });

  it('reads a legacy bare-string page size', () => {
    localStorage.setItem('sw-explorer-page-size', '1000');
    expect(getExplorerPageSize()).toBe(1000);
  });

  it('discards a legacy page size outside the whitelist', () => {
    localStorage.setItem('sw-explorer-page-size', '9999');
    expect(getExplorerPageSize()).toBe(DEFAULT_PAGE_SIZE);
  });

  it('discards a legacy last-viewed-table past its TTL', () => {
    localStorage.setItem('sw-explorer-last-table', JSON.stringify({
      v: 1, connectionId: CID, schemaName: 'public', tableName: 'orders',
      ts: Date.now() - OLD - 1000,
    }));
    expect(loadLastViewedTable()).toBeNull();
  });

  it('writes the new envelope after a migrated read', () => {
    localStorage.setItem('sw-explorer-last-table', JSON.stringify({
      v: 1, connectionId: CID, schemaName: 'public', tableName: 'orders', ts: Date.now(),
    }));
    loadLastViewedTable();
    saveLastViewedTable(CID, 'public', 'orders');
    const raw = JSON.parse(localStorage.getItem('sw-explorer-last-table')!);
    expect(raw.v).toBe(1);
    expect(raw.data).toEqual({ connectionId: CID, schemaName: 'public', tableName: 'orders' });
  });

  it('rejects a non-whitelisted page size on write, keeping the old value', () => {
    setExplorerPageSize(1000);
    setExplorerPageSize(7 as unknown as number);
    expect(getExplorerPageSize()).toBe(1000);
  });
});

describe('chatDrafts migration', () => {
  it('reads a legacy { text, updatedAt } draft', () => {
    localStorage.setItem('sw_draft:chat:c1', JSON.stringify({
      text: 'half written thought', updatedAt: Date.now(),
    }));
    expect(getDraft('c1')).toBe('half written thought');
  });

  it('reads a legacy bare-string draft', () => {
    localStorage.setItem('sw_draft:chat:c1', JSON.stringify('plain text'));
    expect(getDraft('c1')).toBe('plain text');
  });

  it('honours the legacy updatedAt rather than granting a fresh TTL', () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    localStorage.setItem('sw_draft:chat:c1', JSON.stringify({
      text: 'stale', updatedAt: eightDaysAgo,
    }));
    expect(getDraft('c1')).toBe('');
  });

  it('keeps drafts independent and round-trips new writes', () => {
    saveDraft('c1', null, 'first');
    saveDraft('c2', null, 'second');
    expect(getDraft('c1')).toBe('first');
    expect(getDraft('c2')).toBe('second');
  });

  it('writes the new envelope', () => {
    saveDraft('c1', null, 'x');
    const raw = JSON.parse(localStorage.getItem('sw_draft:chat:c1')!);
    expect(raw.v).toBe(1);
    expect(raw.data).toEqual({ text: 'x' });
  });
});

describe('grid-storage migration', () => {
  it('reads a legacy { v, ts, cols } width record', () => {
    localStorage.setItem(`sw-data-explorer-cols-${CID}-public-users`, JSON.stringify({
      v: 1,
      ts: Date.now(),
      cols: { id: { w: 120, r: 0.1 }, email: { w: 240, r: 0.2 } },
    }));
    const out = loadColumnWidths(CID, 'public', 'users');
    expect(out.id).toBe(120);
    expect(out.email).toBe(240);
  });

  it('discards a legacy width record past its TTL', () => {
    localStorage.setItem(`sw-data-explorer-cols-${CID}-public-users`, JSON.stringify({
      v: 1, ts: Date.now() - OLD - 1000, cols: { id: { w: 120, r: 0.1 } },
    }));
    expect(loadColumnWidths(CID, 'public', 'users')).toEqual({});
  });

  it('skips malformed column entries but keeps the good ones', () => {
    localStorage.setItem(`sw-data-explorer-cols-${CID}-public-users`, JSON.stringify({
      v: 1, ts: Date.now(), cols: { id: { w: 120, r: 0.1 }, bad: { r: 0.3 } },
    }));
    const out = loadColumnWidths(CID, 'public', 'users');
    expect(out).toEqual({ id: 120 });
  });

  it('reads a legacy bare-array hidden-columns record', () => {
    localStorage.setItem(`sw-data-explorer-hidden-cols-${CID}-public-users`,
      JSON.stringify(['internal_note', 'etag']));
    const out = loadHiddenColumns(CID, 'public', 'users');
    expect(out.has('internal_note')).toBe(true);
    expect(out.has('etag')).toBe(true);
  });

  it('clamps restored widths to the viewport on a migrated read', () => {
    localStorage.setItem(`sw-data-explorer-cols-${CID}-public-users`, JSON.stringify({
      v: 1, ts: Date.now(), cols: { wide: { w: 999999, r: 8 } },
    }));
    const out = loadColumnWidths(CID, 'public', 'users');
    expect(out.wide).toBeLessThanOrEqual(window.innerWidth * 0.85);
  });

  it('round-trips a new write', () => {
    saveColumnWidths(CID, 'public', 'users', { id: 150 });
    expect(loadColumnWidths(CID, 'public', 'users')).toEqual({ id: 150 });
  });

  it('round-trips hidden columns and empties on an empty set', () => {
    saveHiddenColumns(CID, 'public', 'users', new Set(['a', 'b']));
    expect(loadHiddenColumns(CID, 'public', 'users').size).toBe(2);
    saveHiddenColumns(CID, 'public', 'users', new Set());
    expect(loadHiddenColumns(CID, 'public', 'users').size).toBe(0);
  });
});
