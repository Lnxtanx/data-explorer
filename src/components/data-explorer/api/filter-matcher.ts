// =============================================================================
// In-Memory Filter Matcher for Data Explorer
// Evaluates FilterCondition rules against row objects in O(1) per row.
// =============================================================================

import type { FilterCondition } from './types';

export function matchesFilter(row: any, filter: FilterCondition): boolean {
  if (!row || !filter.column) return true;
  const val = row[filter.column];
  const op = filter.operator;
  const target = filter.value;

  if (op === 'is_null') return val === null || val === undefined;
  if (op === 'not_null') return val !== null && val !== undefined;
  if (op === 'is_empty') return val === null || val === undefined || String(val).trim() === '';

  if (val === null || val === undefined) return false;

  const strVal = typeof val === 'object' ? JSON.stringify(val).toLowerCase() : String(val).toLowerCase();
  const strTarget = String(target ?? '').toLowerCase();

  switch (op) {
    case 'eq':
      if (typeof val === 'number') return val === Number(target);
      if (typeof val === 'boolean') return val === (target === true || target === 'true');
      return strVal === strTarget;
    case 'neq':
      if (typeof val === 'number') return val !== Number(target);
      if (typeof val === 'boolean') return val !== (target === true || target === 'true');
      return strVal !== strTarget;
    case 'like':
      return strVal.includes(strTarget);
    case 'not_like':
      return !strVal.includes(strTarget);
    case 'starts_with':
      return strVal.startsWith(strTarget);
    case 'ends_with':
      return strVal.endsWith(strTarget);
    case 'gt':
      return Number(val) > Number(target);
    case 'gte':
      return Number(val) >= Number(target);
    case 'lt':
      return Number(val) < Number(target);
    case 'lte':
      return Number(val) <= Number(target);
    case 'in':
      if (Array.isArray(target)) {
        return target.some((t) => String(t).trim().toLowerCase() === strVal);
      }
      return false;
    default:
      return true;
  }
}
