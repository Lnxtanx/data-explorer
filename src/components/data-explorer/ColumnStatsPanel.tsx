// =============================================================================
// Column Stats Panel - Slide-over panel for column statistics
// =============================================================================

import { X, Type, BarChart3, Hash, Percent } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useColumnStats } from '@/lib/api/data/explorer';

interface ColumnStatsPanelProps {
  connectionId: string;
  tableName: string;
  schemaName: string;
  columnName: string;
  onClose: () => void;
}

export function ColumnStatsPanel({
  connectionId,
  tableName,
  schemaName,
  columnName,
  onClose,
}: ColumnStatsPanelProps) {
  const { data, isLoading, error } = useColumnStats(connectionId, tableName, schemaName);
  const columnStats = data?.columns.find(c => c.name === columnName);

  return (
    <div className="h-full w-80 bg-card border-l border-border shadow-xl z-30 flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <BarChart3 className="w-4 h-4 text-primary flex-shrink-0" />
          <h3 className="font-semibold text-sm truncate">{columnName}</h3>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {isLoading ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-32" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <p className="text-sm text-destructive">Failed to load statistics</p>
            <p className="text-xs text-muted-foreground mt-1">{error.message}</p>
          </div>
        ) : columnStats ? (
          <>
            {/* Overview Section */}
            <div className="space-y-4">
              {/* Type info */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Type className="w-3.5 h-3.5" />
                <span className="font-mono text-xs">{columnStats.type}</span>
                {columnStats.nullable && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">nullable</span>}
              </div>

              {/* Flags */}
              <div className="flex flex-wrap gap-1.5">
                {columnStats.isPrimaryKey && (
                  <span className="text-[11px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded-full">
                    Primary Key
                  </span>
                )}
                {columnStats.isIndexed && !columnStats.isPrimaryKey && (
                  <span className="text-[11px] font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full">
                    Indexed
                  </span>
                )}
              </div>

              {/* Stats cards */}
              <div className="grid grid-cols-2 gap-2">
                <StatCard
                  icon={<Percent className="w-3.5 h-3.5" />}
                  label="Null %"
                  value={`${columnStats.nullPercent.toFixed(1)}%`}
                  color={columnStats.nullPercent > 50 ? 'text-amber-600 dark:text-amber-400' : undefined}
                />
                <StatCard
                  icon={<Hash className="w-3.5 h-3.5" />}
                  label="Distinct"
                  value={formatNumber(columnStats.distinctCount)}
                />
                {columnStats.minValue !== null && columnStats.minValue !== undefined && (
                  <StatCard label="Min" value={formatValue(columnStats.minValue)} />
                )}
                {columnStats.maxValue !== null && columnStats.maxValue !== undefined && (
                  <StatCard label="Max" value={formatValue(columnStats.maxValue)} />
                )}
              </div>

              {/* Data completeness bar */}
              <div>
                <div className="flex justify-between text-[11px] text-muted-foreground mb-1.5">
                  <span>Data completeness</span>
                  <span>{(100 - columnStats.nullPercent).toFixed(1)}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${100 - columnStats.nullPercent}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Top Values Section (New!) */}
            {columnStats.topValues && columnStats.topValues.length > 0 && (
              <div className="space-y-3">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Top Values</div>
                <div className="space-y-2.5">
                  {columnStats.topValues.map((item, i) => (
                    <div key={i} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-mono truncate max-w-[180px]" title={String(item.value)}>
                          {item.value === null ? 'NULL' : String(item.value) || '(empty)'}
                        </span>
                        <span className="text-muted-foreground">{item.percent.toFixed(1)}%</span>
                      </div>
                      <div className="h-1 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary/40 rounded-full transition-all"
                          style={{ width: `${item.percent}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sample values list */}
            {columnStats.sampleValues && columnStats.sampleValues.length > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Sample Preview</div>
                <div className="flex flex-wrap gap-1.5">
                  {columnStats.sampleValues.map((val, i) => (
                    <div
                      key={i}
                      className="text-[11px] bg-muted px-2 py-0.5 rounded font-mono truncate max-w-full"
                      title={String(val)}
                    >
                      {String(val) || '(empty)'}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <BarChart3 className="w-8 h-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No statistics available</p>
          </div>
        )}
      </div>
    </div>
  );
}

function formatValue(val: any): string {
  if (val === null) return 'NULL';
  if (typeof val === 'number') return val.toLocaleString();
  if (typeof val === 'string' && (val.includes('T') || val.includes('-'))) {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toLocaleDateString();
  }
  return String(val);
}

// =============================================================================
// Stat Card
// =============================================================================

function StatCard({ icon, label, value, color, className }: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  color?: string;
  className?: string;
}) {
  return (
    <div className={cn('bg-muted/50 rounded-lg px-3 py-2', className)}>
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground mb-0.5">
        {icon}
        {label}
      </div>
      <div className={cn('font-semibold text-sm truncate', color)} title={value}>{value}</div>
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
}
