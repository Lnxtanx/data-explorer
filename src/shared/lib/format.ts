// =============================================================================
// Formatting primitives.
//
// Phase 3. These existed as 14 private copies across 10 files, and they had
// already drifted:
//
//   timeAgo        7 copies, 3 shapes. Some accepted null and returned
//                  'just now'; some did not, so a null timestamp produced
//                  "17376d ago" (new Date(null) is epoch 0). One capitalised
//                  the label. One clamped future timestamps to zero.
//   toFilename     3 copies differing only in the fallback word
//                  ('export' vs 'report').
//   formatCount    3 copies: two used toLocaleString() for small numbers and
//                  one used String(num), so the same value rendered as
//                  "1200" in one panel and "1,200" in another.
//
// The divergences are preserved deliberately rather than silently unified —
// see the notes on each function. What is unified is the *implementation*, so
// the next person has one place to change behaviour and one place to read what
// the intended behaviour is.
// =============================================================================

// ─── Relative time ───────────────────────────────────────────────────────────

export interface TimeAgoOptions {
  /** Label for anything under a minute. Default 'just now'. */
  justNow?: string;
  /**
   * Treat timestamps in the future as "now" instead of rendering a negative age.
   * The inline copy in ExportButton did this; the others did not.
   */
  clampFuture?: boolean;
}

/**
 * Compact relative age: 'just now', '5m ago', '3h ago', '12d ago'.
 *
 * Accepts anything Date can parse, plus epoch seconds or milliseconds (values
 * below 1e11 are treated as seconds, matching the previous session-history
 * helper). Nullish and unparseable input both yield the `justNow` label rather
 * than a nonsense age.
 */
export function formatTimeAgo(
  input: string | number | null | undefined,
  options: TimeAgoOptions = {},
): string {
  const { justNow = 'just now', clampFuture = false } = options;
  if (input === null || input === undefined || input === '') return justNow;

  let ms: number;
  if (typeof input === 'number') {
    ms = input > 1e11 ? input : input * 1000;
  } else {
    ms = new Date(input).getTime();
  }
  if (!Number.isFinite(ms)) return justNow;

  const diff = Date.now() - ms;
  if (clampFuture && diff < 0) return justNow;

  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return justNow;
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/**
 * Compact single-line clock: "2:09 PM" for today, "Sep 22" otherwise.
 * Returns '' for nullish or unparseable input.
 */
export function formatShortTime(ts?: number | string | null): string {
  if (!ts) return '';
  try {
    const ms = typeof ts === 'number' ? (ts > 1e11 ? ts : ts * 1000) : new Date(ts).getTime();
    if (!Number.isFinite(ms)) return '';
    const d = new Date(ms);
    if (d.toDateString() === new Date().toDateString()) {
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

// ─── Filenames ───────────────────────────────────────────────────────────────

/**
 * Sanitize a title into a safe filename stem.
 *
 * `fallback` exists because the two previous copies disagreed: the artifact
 * exporters used 'export', the PDF report used 'report'.
 */
export function toFilename(title: string, fallback = 'export'): string {
  return (title || fallback)
    .replace(/[^a-zA-Z0-9_\- ]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 60);
}

// ─── Numbers ─────────────────────────────────────────────────────────────────

/**
 * Row counts and similar: nullish/negative collapse to '0', thousands get
 * locale separators, and >= 1k / >= 1M compact to '1.2K' / '3.4M'.
 *
 * The negative guard is deliberate: the grid used to render "-5" for a bad
 * count.
 */
export function formatCount(num: number | null | undefined): string {
  if (num === null || num === undefined || Number.isNaN(num) || num < 0) return '0';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}

/**
 * Stat values: same K/M compaction, but small numbers are rendered raw.
 *
 * This is deliberately NOT `formatCount`. ColumnStatsPanel and TableSidebar used
 * `String(num)` while TableGrid used `toLocaleString()`, so 1200 showed as
 * "1200" in one place and "1,200" in another. Unifying them is a visible change
 * and belongs in a commit of its own; until then both behaviours are available
 * and named for what they do.
 */
export function formatCompactNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
}

/** Paise -> rupee string, e.g. 299900 -> "₹2,999". */
export function formatMoneyFromPaise(amountPaise: number): string {
  if (amountPaise <= 0) return '₹0';
  return `₹${(amountPaise / 100).toLocaleString('en-IN')}`;
}

/** Dollars with at most 2 decimals, no cents when whole. */
export function formatUSD(amount: number): string {
  if (amount <= 0) return '$0';
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** Localised amount for a currency code. */
export function formatAmount(amount: number, currency: string): string {
  if (currency === 'INR') return `₹${amount.toLocaleString('en-IN')}`;
  return `${currency} ${amount.toLocaleString('en-IN')}`;
}

/** Compact count with a looser digit budget once past 10k/10M. */
export function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  return value.toLocaleString('en-IN');
}

/** '9 Sep 2026', or '-' for nullish/unparseable. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}
