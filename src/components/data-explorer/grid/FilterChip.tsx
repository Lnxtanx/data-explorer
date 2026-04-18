// =============================================================================
// Filter Chip - Displays a single filter condition with remove button
// =============================================================================

import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { FilterCondition } from '@/lib/api/data/explorer/types';

interface FilterChipProps {
  filter: FilterCondition;
  onRemove: () => void;
}

export function FilterChip({ filter, onRemove }: FilterChipProps) {
  const getOperatorLabel = (operator: string) => {
    switch (operator) {
      case 'eq': return '=';
      case 'neq': return '≠';
      case 'gt': return '>';
      case 'gte': return '≥';
      case 'lt': return '<';
      case 'lte': return '≤';
      case 'like': return '~';
      case 'is_null': return 'IS NULL';
      case 'not_null': return 'NOT NULL';
      case 'in': return 'IN';
      default: return operator;
    }
  };

  const formatValue = (value: any) => {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return `(${value.join(', ')})`;
    if (typeof value === 'string') return `"${value}"`;
    return String(value);
  };

  return (
    <Badge variant="secondary" className="rounded-md px-2 py-1 text-xs font-normal">
      <span className="font-medium">{filter.column}</span>
      <span className="mx-1">{getOperatorLabel(filter.operator)}</span>
      {filter.value !== undefined && filter.value !== null && (
        <span>{formatValue(filter.value)}</span>
      )}
      <button
        onClick={onRemove}
        className="ml-1.5 rounded-full hover:bg-secondary/80 p-0.5 -mr-1"
        aria-label={`Remove filter on ${filter.column}`}
      >
        <X className="w-3 h-3" />
      </button>
    </Badge>
  );
}
