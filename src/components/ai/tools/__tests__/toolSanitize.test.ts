// =============================================================================
// Characterization tests: toolSanitize
//
// WHY: toolSanitize is a SECURITY primitive (it strips connection ids, raw SQL,
// tokens and UUIDs before anything reaches the UI or client state) that today
// lives in components/data-explorer/ai/tools/ and is imported by two hooks and
// one dashboard component. Refactor Phase 2 moves it to a non-UI layer.
//
// These tests are the safety net for that move: they must keep passing after
// the module changes location. They characterize CURRENT behaviour, including
// the edge cases, so a move that accidentally changes semantics is caught.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  sanitizeToolInput,
  sanitizeToolSummary,
  humanizeParamKey,
} from '../toolSanitize';

describe('sanitizeToolInput', () => {
  it('returns {} for null/undefined/non-object input', () => {
    expect(sanitizeToolInput('run_query', null)).toEqual({});
    expect(sanitizeToolInput('run_query', undefined)).toEqual({});
    expect(sanitizeToolInput('run_query', 'nope' as unknown as Record<string, unknown>)).toEqual({});
  });

  it('always strips internal ids and secrets, for known and unknown tools', () => {
    const input = {
      connection_id: 'c1',
      connectionId: 'c1',
      user_id: 'u1',
      sessionId: 's1',
      runId: 'r1',
      dashboard_id: 'd1',
      api_key: 'sk-live-123',
      secret: 'hunter2',
      token: 'tok_1',
      label: 'Revenue',
    };
    const out = sanitizeToolInput('some_unknown_tool', input);
    expect(out).toEqual({ label: 'Revenue' });
  });

  it('strips sql/query/config for a tool with an empty allowlist', () => {
    const out = sanitizeToolInput('run_query', {
      sql: 'SELECT * FROM users',
      query: 'SELECT 1',
      config: { a: 1 },
      anything: 'x',
    });
    // run_query has an explicit (empty) allowlist, so nothing survives.
    expect(out).toEqual({});
  });

  it('honours a per-tool allowlist', () => {
    const out = sanitizeToolInput('add_panel', {
      panel_key: 'revenue_trend',
      title: 'Revenue',
      chart_type: 'line',
      section_id: 's1',
      section_title: 'Trends',
      explanation: 'why',
      secret_stuff: 'should not appear',
    });
    expect(out).toEqual({
      panel_key: 'revenue_trend',
      title: 'Revenue',
      chart_type: 'line',
      section_id: 's1',
      section_title: 'Trends',
      explanation: 'why',
    });
  });

  it('strips id-suffixed keys only on the denylist path (no allowlist)', () => {
    const out = sanitizeToolInput('unknown_tool', {
      customer_id: 1,
      external_uuid: 'x',
      region_key: 'emea',
      name: 'EMEA',
    });
    expect(out).toEqual({ name: 'EMEA' });
  });

  it('never mutates the input object', () => {
    const input = { connection_id: 'c1', label: 'x' };
    const snapshot = { ...input };
    sanitizeToolInput('unknown_tool', input);
    expect(input).toEqual(snapshot);
  });

  it('returns a new object reference even when nothing is stripped', () => {
    const input = { label: 'x' };
    expect(sanitizeToolInput('unknown_tool', input)).not.toBe(input);
  });
});

describe('sanitizeToolSummary', () => {
  it('returns empty string for null/undefined', () => {
    expect(sanitizeToolSummary(null)).toBe('');
    expect(sanitizeToolSummary(undefined)).toBe('');
  });

  it('redacts UUIDs', () => {
    const out = sanitizeToolSummary('row 550e8400-e29b-41d4-a716-446655440000 done');
    expect(out).not.toContain('550e8400');
    expect(out).toContain('…');
  });

  it('replaces SQL statements with a placeholder', () => {
    const out = sanitizeToolSummary('executed: SELECT * FROM users WHERE id = 3');
    expect(out).toContain('[query]');
    expect(out).not.toContain('FROM users');
  });

  it('redacts JSON-style id fields', () => {
    const out = sanitizeToolSummary('{"dashboard_id":"d-99","rows":12}');
    expect(out).not.toContain('d-99');
    expect(out).toContain('[redacted]');
    expect(out).toContain('12');
  });

  it('coerces non-string input', () => {
    expect(sanitizeToolSummary(42)).toBe('42');
  });
});

describe('humanizeParamKey', () => {
  it('uses the special-case table', () => {
    expect(humanizeParamKey('chart_type')).toBe('Chart type');
    expect(humanizeParamKey('panel_key')).toBe('Panel');
    expect(humanizeParamKey('section_title')).toBe('Section title');
  });

  it('falls back to title-casing snake_case', () => {
    expect(humanizeParamKey('revenue_bucket')).toBe('Revenue Bucket');
  });

  it('splits camelCase', () => {
    expect(humanizeParamKey('panelKey')).toBe('Panel Key');
  });

  it('capitalizes a single lowercase word', () => {
    expect(humanizeParamKey('limit')).toBe('Limit');
  });
});

