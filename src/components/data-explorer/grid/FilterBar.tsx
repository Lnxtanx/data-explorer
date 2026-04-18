// =============================================================================
// Filter Bar - Horizontal strip of filter chips with add filter button
// =============================================================================

import { useState, useRef } from 'react';
import { Plus, X, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { FilterChip } from './FilterChip';
import type { ColumnInfo, FilterCondition } from '@/lib/api/data/explorer/types';

interface FilterBarProps {
  columns: ColumnInfo[];
  filters: FilterCondition[];
  onFiltersChange: (filters: FilterCondition[]) => void;
}

export function FilterBar({ columns, filters, onFiltersChange }: FilterBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tempFilter, setTempFilter] = useState<Omit<FilterCondition, 'value'> & { value: string }>({
    column: '',
    operator: 'eq',
    value: '',
  });
  const inputRef = useRef<HTMLInputElement>(null);

  const availableOperators = {
    text: ['eq', 'neq', 'like'],
    number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'],
    boolean: ['eq', 'neq'],
    date: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'],
    general: ['eq', 'neq', 'in', 'is_null', 'not_null'],
  };

  const getColumnType = (column: ColumnInfo) => {
    const type = column.type.toLowerCase();
    if (type.includes('varchar') || type.includes('text')) return 'text';
    if (type.includes('int') || type.includes('numeric') || type.includes('decimal') || type.includes('float') || type.includes('double')) return 'number';
    if (type.includes('bool')) return 'boolean';
    if (type.includes('date') || type.includes('time')) return 'date';
    return 'general';
  };

  const handleAddFilter = () => {
    if (!tempFilter.column || !tempFilter.operator) return;

    let value: any = tempFilter.value;
    // Convert value based on operator and column type
    if (tempFilter.operator === 'in') {
      // Split by comma for IN operator
      value = tempFilter.value.split(',').map(v => v.trim()).filter(v => v);
    } else if (tempFilter.operator === 'is_null' || tempFilter.operator === 'not_null') {
      value = undefined; // These operators don't need a value
    } else {
      // For number operators, try to convert to number
      const column = columns.find(c => c.name === tempFilter.column);
      if (column && getColumnType(column) === 'number' && tempFilter.value) {
        const numValue = Number(tempFilter.value);
        if (!isNaN(numValue)) {
          value = numValue;
        }
      }
    }

    const newFilter: FilterCondition = {
      column: tempFilter.column,
      operator: tempFilter.operator,
      value: value,
    };

    onFiltersChange([...filters, newFilter]);
    setTempFilter({
      column: '',
      operator: 'eq',
      value: '',
    });
    setIsOpen(false);
  };

  const handleRemoveFilter = (index: number) => {
    const newFilters = [...filters];
    newFilters.splice(index, 1);
    onFiltersChange(newFilters);
  };

  const handleClearAll = () => {
    onFiltersChange([]);
  };

  const getFilteredOperators = () => {
    if (!tempFilter.column) return availableOperators.general;
    const column = columns.find(c => c.name === tempFilter.column);
    if (!column) return availableOperators.general;
    
    const columnType = getColumnType(column);
    return [...availableOperators[columnType], ...availableOperators.general].filter(
      (op, i, arr) => arr.indexOf(op) === i // Remove duplicates
    );
  };

  return (
    <div className="flex items-center flex-wrap gap-2 px-4 py-2 border-b border-border bg-card">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium text-muted-foreground">Filters:</h3>
        {filters.length === 0 ? (
          <span className="text-sm text-muted-foreground italic">None applied</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {filters.map((filter, index) => (
              <FilterChip
                key={index}
                filter={filter}
                onRemove={() => handleRemoveFilter(index)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {filters.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearAll}
            className="text-xs"
          >
            Clear All
          </Button>
        )}

        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 text-xs">
              <Plus className="w-4 h-4" />
              Add Filter
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-4">
            <div className="space-y-3">
              <h4 className="font-medium">Add Filter</h4>

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Column</label>
                <Select
                  value={tempFilter.column}
                  onValueChange={(value) => setTempFilter({ ...tempFilter, column: value, value: '' })}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent>
                    {columns.map((column) => (
                      <SelectItem key={column.name} value={column.name} className="text-sm">
                        {column.name} ({column.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Operator</label>
                <Select
                  value={tempFilter.operator}
                  onValueChange={(value) => setTempFilter({ ...tempFilter, operator: value as any })}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Select operator" />
                  </SelectTrigger>
                  <SelectContent>
                    {getFilteredOperators().map((op) => (
                      <SelectItem key={op} value={op} className="text-sm">
                        {op === 'eq' && '='}
                        {op === 'neq' && '≠'}
                        {op === 'gt' && '>'}
                        {op === 'gte' && '≥'}
                        {op === 'lt' && '<'}
                        {op === 'lte' && '≤'}
                        {op === 'like' && '~ (Contains)'}
                        {op === 'is_null' && 'IS NULL'}
                        {op === 'not_null' && 'NOT NULL'}
                        {op === 'in' && 'IN (Comma separated)'}
                        {!['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'is_null', 'not_null', 'in'].includes(op) && op}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(tempFilter.operator !== 'is_null' && tempFilter.operator !== 'not_null') && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Value {tempFilter.operator === 'in' && '(comma separated)'}
                  </label>
                  <Input
                    ref={inputRef}
                    value={tempFilter.value}
                    onChange={(e) => setTempFilter({ ...tempFilter, value: e.target.value })}
                    placeholder={
                      tempFilter.operator === 'in' 
                        ? 'Enter values separated by commas' 
                        : 'Enter value...'
                    }
                    className="h-8 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleAddFilter();
                      }
                    }}
                  />
                </div>
              )}

              <Button
                onClick={handleAddFilter}
                disabled={!tempFilter.column || !tempFilter.operator}
                className="w-full"
              >
                Add Filter
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
