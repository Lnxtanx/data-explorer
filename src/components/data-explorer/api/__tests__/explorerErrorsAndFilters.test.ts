// =============================================================================
// Characterization tests: Data Explorer pure data-access modules
//
// WHY: these lived under src/lib/api/data/explorer/. Phase 4 moved them to
// components/data-explorer/api/, beside the hooks that call them. These are the
// pure, transport-free parts:
//
//   errors.ts         -> the backend error-code -> user-copy catalog
//   filter-matcher.ts -> the in-memory row predicate (UI concern misfiled
//                        under lib/api/, moving to data-explorer/grid/)
//
// Both are pure functions, so they are cheap to pin down and cheap to re-run
// after the move.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  EXPLORER_ERROR_CATALOG,
  getExplorerErrorMessage,
  getExplorerErrorHint,
  getExplorerErrorTitle,
} from '../errors';
import { matchesFilter } from '../filter-matcher';
import type { FilterCondition } from '../types';

const f = (
  operator: FilterCondition['operator'],
  value: unknown,
  column = 'name',
): FilterCondition => ({ column, operator, value });

describe('EXPLORER_ERROR_CATALOG', () => {
  it('gives every entry a title and a message', () => {
    for (const [code, entry] of Object.entries(EXPLORER_ERROR_CATALOG)) {
      expect(entry.title, `${code}.title`).toBeTruthy();
      expect(entry.message, `${code}.message`).toBeTruthy();
    }
  });

  it('contains the codes the UI branches on', () => {
    for (const code of [
      'agent_offline', 'rate_limited', 'query_timeout', 'db_auth_failed',
      'permission_denied', 'unauthorized', 'not_found', 'bad_request',
    ]) {
      expect(EXPLORER_ERROR_CATALOG, code).toHaveProperty(code);
    }
  });
});

describe('getExplorerErrorMessage', () => {
  it('prefers the catalog entry for a known code', () => {
    expect(getExplorerErrorMessage({ code: 'agent_offline' }))
      .toBe(EXPLORER_ERROR_CATALOG.agent_offline.message);
  });

  it('maps a bare 401 to the unauthorized copy', () => {
    expect(getExplorerErrorMessage({ status: 401 }))
      .toBe(EXPLORER_ERROR_CATALOG.unauthorized.message);
  });

  it('falls back to the error message, then to generic text', () => {
    expect(getExplorerErrorMessage({ message: 'socket hang up' })).toBe('socket hang up');
    expect(getExplorerErrorMessage({})).toBe(
      'Something went wrong while talking to the SW Agent.',
    );
    expect(getExplorerErrorMessage(null)).toBe(
      'Something went wrong while talking to the SW Agent.',
    );
  });
});

describe('getExplorerErrorHint / getExplorerErrorTitle', () => {
  it('prefers a backend-supplied hint over the catalog hint', () => {
    expect(getExplorerErrorHint({ code: 'agent_offline', hint: 'from backend' }))
      .toBe('from backend');
    expect(getExplorerErrorHint({ code: 'agent_offline' }))
      .toBe(EXPLORER_ERROR_CATALOG.agent_offline.hint);
  });

  it('returns undefined when there is nothing to say', () => {
    expect(getExplorerErrorHint({})).toBeUndefined();
    expect(getExplorerErrorHint({ code: 'not_found' })).toBeUndefined();
  });

  it('returns the catalog title, defaulting to Request failed', () => {
    expect(getExplorerErrorTitle({ code: 'not_found' }))
      .toBe(EXPLORER_ERROR_CATALOG.not_found.title);
    expect(getExplorerErrorTitle({})).toBe('Request failed');
  });
});

describe('matchesFilter', () => {
  const row = { name: 'Alice', age: 30, active: true, meta: null, blank: '   ' };

  it('passes everything when there is no column', () => {
    expect(matchesFilter(row, { column: '', operator: 'eq', value: 'x' })).toBe(true);
  });

  it('handles null operators before the null-value guard', () => {
    // 'Alice' is not null, so is_null must be false and not_null true.
    expect(matchesFilter(row, f('is_null', null))).toBe(false);
    expect(matchesFilter(row, f('not_null', null))).toBe(true);
    // A genuinely null cell.
    expect(matchesFilter({ name: null }, f('is_null', null))).toBe(true);
    expect(matchesFilter({ name: null }, f('not_null', null))).toBe(false);
  });

  it('treats whitespace-only strings as empty', () => {
    expect(matchesFilter(row, f('is_empty', null))).toBe(false);
    expect(matchesFilter({ ...row, name: '   ' }, f('is_empty', null))).toBe(true);
  });

  it('rejects null values for value comparisons', () => {
    expect(matchesFilter({ name: null }, f('eq', 'Alice'))).toBe(false);
  });

  it('compares strings case-insensitively', () => {
    expect(matchesFilter(row, f('eq', 'alice'))).toBe(true);
    expect(matchesFilter(row, f('neq', 'alice'))).toBe(false);
  });

  it('compares numbers numerically, not lexically', () => {
    expect(matchesFilter(row, f('eq', 30, 'age'))).toBe(true);
    // '3' would be > 30 as a string; numerically it is not.
    expect(matchesFilter(row, f('gt', 9, 'age'))).toBe(true);
    expect(matchesFilter(row, f('gt', 300, 'age'))).toBe(false);
    expect(matchesFilter(row, f('lte', 30, 'age'))).toBe(true);
  });

  it('handles booleans, including the string "true"', () => {
    expect(matchesFilter(row, f('eq', true, 'active'))).toBe(true);
    expect(matchesFilter(row, f('eq', 'true', 'active'))).toBe(true);
    expect(matchesFilter(row, f('eq', false, 'active'))).toBe(false);
  });

  it('serializes object values for substring matching', () => {
    const r = { name: { a: 'Hello' } };
    expect(matchesFilter(r, f('like', 'hello'))).toBe(true);
  });

  it('supports substring and affix operators', () => {
    expect(matchesFilter(row, f('like', 'lic'))).toBe(true);
    expect(matchesFilter(row, f('not_like', 'lic'))).toBe(false);
    expect(matchesFilter(row, f('starts_with', 'al'))).toBe(true);
    expect(matchesFilter(row, f('ends_with', 'ice'))).toBe(true);
  });

  it('matches `in` only for array targets', () => {
    expect(matchesFilter(row, f('in', ['alice', 'bob']))).toBe(true);
    expect(matchesFilter(row, f('in', ['bob']))).toBe(false);
    expect(matchesFilter(row, f('in', 'alice'))).toBe(false);
  });

  it('passes unknown operators through', () => {
    expect(matchesFilter(row, f('nope' as FilterCondition['operator'], 'x'))).toBe(true);
  });
});
