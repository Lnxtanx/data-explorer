// =============================================================================
// Characterization tests: client-side persistence stores
//
// WHY: three independent hand-rolled localStorage stores (grid column widths,
// explorer preferences, chat drafts) are all moving in Phase 4, and Phase 3
// then consolidates them behind one `shared/storage/localStore` primitive.
//
// Locking their current behaviour matters for two reasons:
//   1. The stores are read on first paint, so a subtle change silently resets
//      a user's column layout / last-viewed table / unsent chat draft.
//   2. clearAllClientData() wipes these keys on logout, so the read paths must
//      tolerate missing and corrupt values.
//
// jsdom provides localStorage. Each test starts from a clean store.
// =============================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadColumnWidths,
  saveColumnWidths,
  loadHiddenColumns,
  saveHiddenColumns,
} from '../../components/data-explorer/storage/grid-storage';
import {
  saveLastViewedTable,
  loadLastViewedTable,
  getExplorerPageSize,
  setExplorerPageSize,
  EXPLORER_PAGE_SIZES,
  DEFAULT_PAGE_SIZE,
} from '../../components/data-explorer/storage/explorer-preferences';
import {
  getDraftKey,
  getDraft,
  saveDraft,
  clearDraft,
  clearAllDrafts,
} from '../../components/ai/storage/chatDrafts';

const CID = 'agent1:db1';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('grid column widths', () => {
  it('round-trips widths per connection/schema/table', () => {
    saveColumnWidths(CID, 'public', 'users', { id: 120, email: 240 });
    expect(loadColumnWidths(CID, 'public', 'users')).toEqual({ id: 120, email: 240 });
  });

  it('isolates tables from one another', () => {
    saveColumnWidths(CID, 'public', 'users', { id: 120 });
    saveColumnWidths(CID, 'public', 'orders', { id: 300 });
    expect(loadColumnWidths(CID, 'public', 'users')).toEqual({ id: 120 });
    expect(loadColumnWidths(CID, 'public', 'orders')).toEqual({ id: 300 });
  });

  it('returns {} for an unknown table', () => {
    expect(loadColumnWidths(CID, 'public', 'nope')).toEqual({});
  });

  it('returns {} when the stored payload is corrupt', () => {
    localStorage.setItem(`sw-data-explorer-cols-${CID}-public-users`, 'not json');
    expect(loadColumnWidths(CID, 'public', 'users')).toEqual({});
  });

  it('clamps absurd widths to the viewport', () => {
    saveColumnWidths(CID, 'public', 'users', { wide: 999999 });
    const out = loadColumnWidths(CID, 'public', 'users');
    expect(out.wide).toBeLessThanOrEqual(Math.max(50, window.innerWidth * 0.85));
  });

  it('does not let one saved width leak into an unrelated column', () => {
    saveColumnWidths(CID, 'public', 'users', { a: 100 });
    expect(loadColumnWidths(CID, 'public', 'users')).not.toHaveProperty('b');
  });
});

describe('grid hidden columns', () => {
  it('round-trips a hidden-column set', () => {
    saveHiddenColumns(CID, 'public', 'users', new Set(['internal_note', 'etag']));
    const out = loadHiddenColumns(CID, 'public', 'users');
    expect(out.has('internal_note')).toBe(true);
    expect(out.has('etag')).toBe(true);
    expect(out.size).toBe(2);
  });

  it('returns an empty set for an unknown table', () => {
    expect(loadHiddenColumns(CID, 'public', 'nope').size).toBe(0);
  });

  it('empties the store when given an empty set', () => {
    saveHiddenColumns(CID, 'public', 'users', new Set(['a']));
    saveHiddenColumns(CID, 'public', 'users', new Set());
    expect(loadHiddenColumns(CID, 'public', 'users').size).toBe(0);
  });
});

describe('explorer preferences', () => {
  it('round-trips the last viewed table', () => {
    saveLastViewedTable(CID, 'public', 'orders');
    expect(loadLastViewedTable()).toMatchObject({
      connectionId: CID,
      schemaName: 'public',
      tableName: 'orders',
    });
  });

  it('returns null when nothing was saved', () => {
    expect(loadLastViewedTable()).toBeNull();
  });

  it('self-heals from a corrupt payload', () => {
    localStorage.setItem('sw-explorer-last-table', '{{{');
    expect(loadLastViewedTable()).toBeNull();
  });

  it('defaults the page size when unset', () => {
    expect(getExplorerPageSize()).toBe(DEFAULT_PAGE_SIZE);
  });

  it('rejects a non-whitelisted page size on write, keeping the previous value', () => {
    setExplorerPageSize(1000);
    setExplorerPageSize(7 as unknown as number);
    // setExplorerPageSize early-returns on a value outside EXPLORER_PAGE_SIZES,
    // so the previously stored preference survives.
    expect(getExplorerPageSize()).toBe(1000);
  });

  it('ignores a non-whitelisted page size when nothing is stored yet', () => {
    setExplorerPageSize(7 as unknown as number);
    expect(getExplorerPageSize()).toBe(DEFAULT_PAGE_SIZE);
  });

  it('self-heals by purging a hand-edited page size', () => {
    localStorage.setItem('sw-explorer-page-size', '9999');
    expect(getExplorerPageSize()).toBe(DEFAULT_PAGE_SIZE);
    // the poisoned key is removed, not merely ignored
    expect(localStorage.getItem('sw-explorer-page-size')).toBeNull();
  });

  it('exposes the whitelist', () => {
    expect([...EXPLORER_PAGE_SIZES]).toContain(DEFAULT_PAGE_SIZE);
  });
});

describe('chat drafts', () => {
  it('keys drafts by chat id', () => {
    expect(getDraftKey('chat-1')).toBe('sw_draft:chat:chat-1');
  });

  it('keys an unsaved draft by connection', () => {
    expect(getDraftKey(null, CID)).toBe(`sw_draft:new:${CID}`);
    expect(getDraftKey(null, null)).toBe('sw_draft:new:default');
  });

  it('round-trips a draft', () => {
    saveDraft('chat-1', null, 'half written thought');
    expect(getDraft('chat-1')).toBe('half written thought');
  });

  it('keeps drafts for different chats independent', () => {
    saveDraft('chat-1', null, 'first');
    saveDraft('chat-2', null, 'second');
    expect(getDraft('chat-1')).toBe('first');
    expect(getDraft('chat-2')).toBe('second');
  });

  it('returns an empty string when nothing is stored', () => {
    expect(getDraft('never-saved')).toBe('');
  });

  it('clears a single draft', () => {
    saveDraft('chat-1', null, 'x');
    clearDraft('chat-1');
    expect(getDraft('chat-1')).toBe('');
  });

  it('clears every draft at once', () => {
    saveDraft('chat-1', null, 'a');
    saveDraft('chat-2', null, 'b');
    saveDraft(null, CID, 'c');
    clearAllDrafts();
    expect(getDraft('chat-1')).toBe('');
    expect(getDraft('chat-2')).toBe('');
    expect(getDraft(null, CID)).toBe('');
  });

  it('ignores an empty draft rather than persisting it', () => {
    saveDraft('chat-1', null, 'x');
    saveDraft('chat-1', null, '');
    expect(getDraft('chat-1')).toBe('');
  });
});

