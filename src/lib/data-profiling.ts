// =============================================================================
// Semantic type detection for columns (name + declared type + sample values).
// Used to render value-type badges in the column stats panel.
// =============================================================================

export interface SemanticType {
  label: string;
  tone: string;
}

const TONES = {
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  sky: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400',
  violet: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400',
  emerald: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  rose: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400',
  teal: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400',
  indigo: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
} as const;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

/**
 * Detect a semantic (business) type for a column from its name, declared SQL
 * type, and a few sample values. Returns null when nothing confident matches.
 */
export function detectSemanticType(
  name: string,
  type: string,
  samples: unknown[] = []
): SemanticType | null {
  const n = name.toLowerCase().trim();
  const t = type.toLowerCase();
  const firstSample = String(samples[0] ?? '').toLowerCase();

  if (t === 'boolean') return { label: 'Boolean', tone: TONES.violet };

  if (t === 'uuid' || t.includes('uuid')) return { label: 'UUID', tone: TONES.indigo };

  if (n === 'id' || /(^|_)(id|uid|key)$/.test(n)) return { label: 'ID', tone: TONES.amber };

  if (n.includes('email') || EMAIL_RE.test(firstSample)) return { label: 'Email', tone: TONES.sky };

  if (/url|website|web_site|href|link/i.test(n)) return { label: 'URL', tone: TONES.sky };

  if (/phone|mobile|cell|contact_no/.test(n)) return { label: 'Phone', tone: TONES.rose };

  if (
    /(^|_)at$/.test(n) || n.endsWith('_date') || n === 'date' ||
    /timestamp|datetime|date\b|time\b/.test(t)
  ) {
    return { label: 'Date/Time', tone: TONES.teal };
  }

  if (
    /price|amount|cost|total|fee|salary|budget|balance|revenue/.test(n) &&
    /(numeric|money|real|double|int)/.test(t)
  ) {
    return { label: 'Currency', tone: TONES.emerald };
  }

  if (n.includes('status') || n.includes('state')) return { label: 'Status', tone: TONES.indigo };

  if (n.includes('name') || n.includes('title') || n.includes('label')) {
    return { label: 'Name', tone: TONES.teal };
  }

  if (n.includes('address') || n.includes('city') || n.includes('country') || n.includes('zip')) {
    return { label: 'Location', tone: TONES.sky };
  }

  return null;
}
