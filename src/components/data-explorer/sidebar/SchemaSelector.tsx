// =============================================================================
// Schema Selector - Dropdown to select database schema
// =============================================================================

import { Layers } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SchemaInfo } from '../api/index';

interface SchemaSelectorProps {
  schemas: SchemaInfo[];
  value: string;
  onChange: (schema: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
}

export function SchemaSelector({
  schemas,
  value,
  onChange,
  isLoading,
  disabled,
}: SchemaSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <Layers className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      <Select value={value} onValueChange={onChange} disabled={disabled || isLoading}>
        <SelectTrigger className="h-7 text-xs flex-1">
          <SelectValue placeholder="Select schema" />
        </SelectTrigger>
        <SelectContent>
          {schemas.map((schema) => (
            <SelectItem key={schema.name} value={schema.name} className="text-xs">
              {schema.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
