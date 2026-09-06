// =============================================================================
// GridFilterPopover - High-Performance Modular Filter Creator Popover
// Isolated state prevents typing re-renders across the main TableGrid.
// =============================================================================

import React, { useState, useRef } from 'react';
import { Filter, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ColumnInfo, FilterCondition } from '@/lib/api/data/explorer/types';

export function getColumnType(col: ColumnInfo): string {
  const t = col.type.toLowerCase();
  if (t.includes('varchar') || t.includes('text') || t.includes('char')) return 'text';
  if (t.includes('int') || t.includes('numeric') || t.includes('decimal') || t.includes('float') || t.includes('double') || t.includes('serial')) return 'number';
  if (t.includes('bool')) return 'boolean';
  if (t.includes('date') || t.includes('time') || t.includes('timestamp')) return 'date';
  return 'general';
}

const operatorsByType: Record<string, string[]> = {
  text: ['like', 'not_like', 'starts_with', 'ends_with', 'eq', 'neq', 'is_empty', 'is_null', 'not_null'],
  number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is_null', 'not_null'],
  boolean: ['eq', 'neq', 'is_null', 'not_null'],
  date: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is_null', 'not_null'],
  general: ['eq', 'neq', 'like', 'in', 'is_null', 'not_null'],
};

interface GridFilterPopoverProps {
  columns: ColumnInfo[];
  activeFilterCount: number;
  isFilteringInMemory: boolean;
  isFullTableInMemory: boolean;
  filterScope: 'auto' | 'database' | 'loaded';
  onFilterScopeChange: (scope: 'auto' | 'database' | 'loaded') => void;
  onAddFilter: (filter: FilterCondition) => void;
}

export function GridFilterPopover({
  columns,
  activeFilterCount,
  isFilteringInMemory,
  isFullTableInMemory,
  filterScope,
  onFilterScopeChange,
  onAddFilter,
}: GridFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const [tempFilter, setTempFilter] = useState<{
    column: string;
    operator: FilterCondition['operator'];
    value: string;
  }>({ column: '', operator: 'like', value: '' });

  const filterInputRef = useRef<HTMLInputElement>(null);

  const getFilteredOperators = () => {
    if (!tempFilter.column) return operatorsByType.general;
    const col = columns.find((c) => c.name === tempFilter.column);
    if (!col) return operatorsByType.general;
    return [...operatorsByType[getColumnType(col)], ...operatorsByType.general].filter(
      (op, i, arr) => arr.indexOf(op) === i
    );
  };

  const isValueRequired = !['is_null', 'not_null', 'is_empty'].includes(tempFilter.operator);
  const isAddFilterDisabled =
    !tempFilter.column || !tempFilter.operator || (isValueRequired && !String(tempFilter.value).trim());

  const handleAdd = () => {
    if (isAddFilterDisabled) return;
    const col = columns.find((c) => c.name === tempFilter.column);
    const colType = col ? getColumnType(col) : 'general';

    let value: any = tempFilter.value;
    if (tempFilter.operator === 'in') {
      value = tempFilter.value.split(',').map((v) => v.trim()).filter((v) => v.length > 0);
    } else if (
      tempFilter.operator === 'is_null' ||
      tempFilter.operator === 'not_null' ||
      tempFilter.operator === 'is_empty'
    ) {
      value = undefined;
    } else if (colType === 'boolean') {
      value = tempFilter.value === 'true';
    } else if (colType === 'number') {
      const n = Number(tempFilter.value);
      if (!isNaN(n) && String(tempFilter.value).trim() !== '') value = n;
    }

    onAddFilter({
      column: tempFilter.column,
      operator: tempFilter.operator as FilterCondition['operator'],
      value,
    });
    setTempFilter({ column: '', operator: 'like', value: '' });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={activeFilterCount > 0 ? 'default' : 'ghost'}
          size="sm"
          className={cn(
            'h-6 px-2 text-[11px] gap-1 transition-colors',
            activeFilterCount > 0 && 'bg-primary text-primary-foreground'
          )}
        >
          <Filter className="w-3 h-3" />
          Filter
          {activeFilterCount > 0 && (
            <span className="bg-primary-foreground/20 text-primary-foreground px-1 rounded-full text-[10px] min-w-[14px] text-center">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold">Add Filter</h4>
            <span className="text-[10px] text-muted-foreground">
              {isFilteringInMemory ? (
                <span className="text-emerald-500 font-medium">Instant In-Memory</span>
              ) : (
                <span className="text-primary font-medium">Database Query</span>
              )}
            </span>
          </div>

          {/* Column Selector */}
          <Select
            value={tempFilter.column}
            onValueChange={(v) => {
              const col = columns.find((c) => c.name === v);
              const isBool = col && getColumnType(col) === 'boolean';
              setTempFilter({
                column: v,
                operator: isBool ? 'eq' : 'like',
                value: isBool ? 'true' : '',
              });
            }}
          >
            <SelectTrigger className="h-7 text-xs bg-background">
              <SelectValue placeholder="Column" />
            </SelectTrigger>
            <SelectContent>
              {columns.map((c) => (
                <SelectItem key={c.name} value={c.name} className="text-xs">
                  {c.name} <span className="text-muted-foreground">({c.type})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Operator Selector */}
          <Select
            value={tempFilter.operator}
            onValueChange={(v) => setTempFilter({ ...tempFilter, operator: v as FilterCondition['operator'] })}
          >
            <SelectTrigger className="h-7 text-xs bg-background">
              <SelectValue placeholder="Operator" />
            </SelectTrigger>
            <SelectContent>
              {getFilteredOperators().map((op) => (
                <SelectItem key={op} value={op} className="text-xs">
                  {op === 'eq' && '= Equals'}
                  {op === 'neq' && '≠ Not equals'}
                  {op === 'gt' && '> Greater than'}
                  {op === 'gte' && '≥ Greater or equal'}
                  {op === 'lt' && '< Less than'}
                  {op === 'lte' && '≤ Less or equal'}
                  {op === 'like' && '~ Contains'}
                  {op === 'not_like' && '!~ Does not contain'}
                  {op === 'starts_with' && '^ Starts with'}
                  {op === 'ends_with' && '$ Ends with'}
                  {op === 'is_empty' && 'Is empty (blank or NULL)'}
                  {op === 'is_null' && 'IS NULL'}
                  {op === 'not_null' && 'NOT NULL'}
                  {op === 'in' && 'IN (list)'}
                  {!['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'not_like', 'starts_with', 'ends_with', 'is_empty', 'is_null', 'not_null', 'in'].includes(op) && op}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Value Input */}
          {tempFilter.operator !== 'is_null' && tempFilter.operator !== 'not_null' && tempFilter.operator !== 'is_empty' && (
            (() => {
              const activeCol = columns.find((c) => c.name === tempFilter.column);
              const isBool = activeCol && getColumnType(activeCol) === 'boolean';
              if (isBool) {
                return (
                  <Select value={tempFilter.value || 'true'} onValueChange={(v) => setTempFilter({ ...tempFilter, value: v })}>
                    <SelectTrigger className="h-7 text-xs bg-background">
                      <SelectValue placeholder="Value" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true" className="text-xs">true (TRUE)</SelectItem>
                      <SelectItem value="false" className="text-xs">false (FALSE)</SelectItem>
                    </SelectContent>
                  </Select>
                );
              }
              return (
                <Input
                  ref={filterInputRef}
                  value={tempFilter.value}
                  onChange={(e) => setTempFilter({ ...tempFilter, value: e.target.value })}
                  placeholder={
                    tempFilter.operator === 'in' ? 'val1, val2, val3...' :
                    tempFilter.operator === 'starts_with' ? 'Starts with...' :
                    tempFilter.operator === 'ends_with' ? 'Ends with...' :
                    tempFilter.operator === 'like' ? 'Contains text...' :
                    tempFilter.operator === 'not_like' ? 'Does not contain...' :
                    'Value...'
                  }
                  className="h-7 text-xs bg-background"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAdd();
                  }}
                />
              );
            })()
          )}

          {/* Scope selector for large tables */}
          {!isFullTableInMemory && (
            <div className="pt-1 flex items-center justify-between border-t border-border/50">
              <label className="text-[11px] text-muted-foreground flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterScope !== 'loaded'}
                  onChange={(e) => onFilterScopeChange(e.target.checked ? 'database' : 'loaded')}
                  className="rounded text-primary focus:ring-0 w-3 h-3"
                />
                <span>Query entire database</span>
              </label>
            </div>
          )}

          <Button onClick={handleAdd} disabled={isAddFilterDisabled} size="sm" className="w-full h-7 text-xs rounded-lg">
            <Plus className="w-3 h-3 mr-1" /> Add Filter
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
