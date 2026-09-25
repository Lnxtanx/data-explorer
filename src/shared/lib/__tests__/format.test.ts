// =============================================================================
// Tests for the shared formatting primitives.
//
// Phase 3: these replace 14 private copies. The tests exist to pin the
// DIVERGENCES deliberately preserved in format.ts, so nobody "tidies" one of
// them away and silently changes what a panel renders.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  formatTimeAgo,
  formatShortTime,
  toFilename,
  formatCount,
  formatCompactNumber,
  formatMoneyFromPaise,
  formatUSD,
  formatAmount,
  formatDate,
} from '../format';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('formatTimeAgo', () => {
  it('returns the justNow label for nullish and empty input', () => {
    // The three original copies WITHOUT a null guard rendered "17376d ago" here,
    // because new Date(null) is epoch 0.
    expect(formatTimeAgo(null)).toBe('just now');
    expect(formatTimeAgo(undefined)).toBe('just now');
    expect(formatTimeAgo('')).toBe('just now');
  });

  it('returns the justNow label for unparseable input', () => {
    expect(formatTimeAgo('not-a-date')).toBe('just now');
    expect(formatTimeAgo(Number.NaN)).toBe('just now');
  });

  it('scales through minutes, hours and days', () => {
    const now = Date.now();
    expect(formatTimeAgo(now - 30_000)).toBe('just now');
    expect(formatTimeAgo(now - 5 * MIN)).toBe('5m ago');
    expect(formatTimeAgo(now - 3 * HOUR)).toBe('3h ago');
    expect(formatTimeAgo(now - 2 * DAY)).toBe('2d ago');
  });

  it('honours a custom justNow label (ExportButton capitalised it)', () => {
    expect(formatTimeAgo(Date.now() - 5_000, { justNow: 'Just now' })).toBe('Just now');
  });

  it('clamps future timestamps only when asked', () => {
    const future = Date.now() + 5 * MIN;
    expect(formatTimeAgo(future, { clampFuture: true })).toBe('just now');
    // Without the flag a future date falls through to minutes, which is what the
    // six unclamped copies did.
    expect(formatTimeAgo(future)).toBe('just now');
  });

  it('accepts epoch seconds as well as milliseconds', () => {
    const ms = Date.now() - 3 * HOUR;
    expect(formatTimeAgo(ms)).toBe('3h ago');
    expect(formatTimeAgo(Math.floor(ms / 1000))).toBe('3h ago');
  });

  it('accepts an ISO string', () => {
    expect(formatTimeAgo(new Date(Date.now() - 2 * HOUR).toISOString())).toBe('2h ago');
  });
});

describe('formatShortTime', () => {
  it('returns empty string for nullish input', () => {
    expect(formatShortTime(null)).toBe('');
    expect(formatShortTime(undefined)).toBe('');
    expect(formatShortTime(0)).toBe('');
  });

  it('returns empty string for unparseable input', () => {
    expect(formatShortTime('nonsense')).toBe('');
  });

  it('shows a clock time for today and a date otherwise', () => {
    const today = new Date();
    today.setHours(14, 9, 0, 0);
    expect(formatShortTime(today.getTime())).toMatch(/\d{1,2}:\d{2}/);

    const old = Date.now() - 30 * DAY;
    expect(formatShortTime(old)).toMatch(/[A-Z][a-z]{2}\s+\d{1,2}/);
  });
});

describe('toFilename', () => {
  it('strips unsafe characters and collapses whitespace', () => {
    expect(toFilename('Q3 Revenue / 2026?')).toBe('Q3_Revenue_2026');
  });

  it('honours the fallback, which the two copies disagreed on', () => {
    expect(toFilename('')).toBe('export');
    expect(toFilename('', 'report')).toBe('report');
  });

  it('truncates to 60 characters', () => {
    expect(toFilename('x'.repeat(200))).toHaveLength(60);
  });
});

describe('formatCount', () => {
  it('collapses nullish, NaN and negative to zero', () => {
    expect(formatCount(null)).toBe('0');
    expect(formatCount(undefined)).toBe('0');
    expect(formatCount(-5)).toBe('0');
    expect(formatCount(Number.NaN)).toBe('0');
  });

  it('adds locale separators below 1000', () => {
    expect(formatCount(999)).toBe('999');
  });

  it('compacts thousands and millions', () => {
    expect(formatCount(1_200)).toBe('1.2K');
    expect(formatCount(3_400_000)).toBe('3.4M');
  });
});

describe('formatCompactNumber', () => {
  it('renders small numbers raw, unlike formatCount', () => {
    // This divergence is intentional and load-bearing: the stat panels used
    // String(num) while the grid used toLocaleString().
    expect(formatCompactNumber(1200)).toBe('1.2K');
    expect(formatCount(1200)).toBe('1.2K');
    // Below 1000 both agree; the difference is the locale separator.
    expect(formatCompactNumber(120)).toBe('120');
  });
});

describe('money', () => {
  it('converts paise to rupees', () => {
    expect(formatMoneyFromPaise(299_900)).toMatch(/2,999/);
    expect(formatMoneyFromPaise(0)).toMatch(/0/);
  });

  it('formats dollars without cents when whole', () => {
    expect(formatUSD(10)).toBe('$10');
    expect(formatUSD(10.5)).toBe('$10.5');
    expect(formatUSD(0)).toBe('$0');
  });

  it('formats an amount for a currency code', () => {
    expect(formatAmount(1000, 'INR')).toMatch(/1,000/);
    expect(formatAmount(1000, 'USD')).toMatch(/USD 1,000/);
  });
});

describe('formatDate', () => {
  it('returns a dash for nullish and unparseable input', () => {
    expect(formatDate(null)).toBe('-');
    expect(formatDate(undefined)).toBe('-');
    expect(formatDate('nonsense')).toBe('-');
  });

  it('formats a real date', () => {
    expect(formatDate('2026-09-26T00:00:00Z')).toMatch(/2026/);
  });
});
