// =============================================================================
// GridFilterChips - Inline active filter chips display with remove/clear actions
// =============================================================================

import { X } from 'lucide-react';
import type { FilterCondition } from '../api/types';

interface GridFilterChipsProps {
  filters: FilterCondition[];
  onRemoveFilter: (index: number) => void;
  onClearAll: () => void;
}

export function GridFilterChips({ filters, onRemoveFilter, onClearAll }: GridFilterChipsProps) {
  if (filters.length === 0) return null;

  return (
    <>
      <div className="w-px h-4 bg-border mx-1" />
      <div className="flex items-center gap-1 overflow-x-auto">
        {filters.map((filter, index) => {
          const opLabel =
            filter.operator === 'eq' ? '=' :
            filter.operator === 'neq' ? '≠' :
            filter.operator === 'gt' ? '>' :
            filter.operator === 'gte' ? '≥' :
            filter.operator === 'lt' ? '<' :
            filter.operator === 'lte' ? '≤' :
            filter.operator === 'like' ? '~' :
            filter.operator === 'not_like' ? '!~' :
            filter.operator === 'starts_with' ? '^=' :
            filter.operator === 'ends_with' ? '$=' :
            filter.operator === 'is_empty' ? 'empty' :
            filter.operator === 'is_null' ? 'null' :
            filter.operator === 'not_null' ? 'not null' :
            filter.operator;

          return (
            <span
              key={index}
              className="inline-flex items-center gap-1 bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap"
            >
              <span className="font-medium">{filter.column}</span>
              <span className="opacity-60">{opLabel}</span>
              {filter.value !== undefined && filter.value !== null && (
                <span>
                  {Array.isArray(filter.value) ? `(${filter.value.join(', ')})` : String(filter.value)}
                </span>
              )}
              <button
                onClick={() => onRemoveFilter(index)}
                className="hover:text-foreground cursor-pointer"
                title="Remove filter"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          );
        })}
        <button
          onClick={onClearAll}
          className="text-muted-foreground hover:text-foreground text-[10px] cursor-pointer ml-1"
        >
          Clear
        </button>
      </div>
    </>
  );
}
