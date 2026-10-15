// =============================================================================
// Column Stats Panel - Slide-over panel for column statistics
// =============================================================================

import { useState } from 'react';
import { X, Type, BarChart3, Hash, Percent, Copy, Filter, Check, Sigma, ExternalLink, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatCompactNumber } from '@/shared/lib/format';
import { useColumnStats } from './api/index';
import { getExplorerErrorMessage, getExplorerErrorHint } from './api/errors';
import { detectSemanticType } from './api/data-profiling';
import type { TopValue, ColumnInfo } from './api/types';

interface ColumnStatsPanelProps {
  connectionId: string;
  tableName: string;
  schemaName: string;
  column: ColumnInfo;
  onClose: () => void;
  onFilterFromStats?: (column: string, value: any) => void;
  /** Drills into a referenced (FK target) table. */
  onViewReferencedTable?: (schemaName: string, tableName: string) => void;
}

export function ColumnStatsPanel({
  connectionId,
  tableName,
  schemaName,
  column,
  onClose,
  onFilterFromStats,
  onViewReferencedTable,
}: ColumnStatsPanelProps) {
  const columnName = column.name;
  const { data, isLoading, error } = useColumnStats(connectionId, tableName, schemaName, columnName);
  const columnStats = data?.columns.find(c => c.name === columnName);
  const [copied, setCopied] = useState(false);

  const semanticType = columnStats
    ? detectSemanticType(columnStats.name, columnStats.type, columnStats.sampleValues)
    : detectSemanticType(column.name, column.type, []);
  const fkReference = column.fkReference;

  const handleCopyStats = async () => {
    if (!columnStats) return;
    const lines = [
      `Column: ${columnStats.name} (${columnStats.type}${columnStats.nullable ? ', nullable' : ''})`,
      `Null: ${columnStats.nullPercent ?? '?'}% (${columnStats.nullCount ?? '?'})`,
      `Distinct: ${formatCompactNumber(columnStats.distinctCount ?? 0)}`,
      `Min: ${formatValue(columnStats.minValue)}`,
      `Max: ${formatValue(columnStats.maxValue)}`,
      `Avg: ${columnStats.avgValue ?? '—'}`,
      `Std dev: ${columnStats.stdDevValue ?? '—'}`,
    ];
    if (columnStats.quantiles) {
      lines.push(`q25/q50/q75: ${fmtVal(columnStats.quantiles.q25)} / ${fmtVal(columnStats.quantiles.q50)} / ${fmtVal(columnStats.quantiles.q75)}`);
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable — no-op
    }
  };

  const handleFilterValue = (value: any) => {
    onFilterFromStats?.(columnName, value);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 w-full bg-card border-l border-border shadow-xl flex flex-col animate-in slide-in-from-right duration-200 md:relative md:inset-auto md:z-30 md:h-full md:w-80">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <BarChart3 className="w-4 h-4 text-primary flex-shrink-0" />
          <h3 className="font-semibold text-sm truncate">{columnName}</h3>
          {semanticType && (
            <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0', semanticType.tone)}>
              {semanticType.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {columnStats && (
            <Button variant="ghost" size="icon" className="h-6 w-6" title="Copy statistics" onClick={handleCopyStats}>
              {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
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
            <p className="text-xs text-muted-foreground mt-1">{getExplorerErrorMessage(error)}</p>
            {getExplorerErrorHint(error) && (
              <p className="text-[11px] text-muted-foreground/70 mt-2 bg-muted/50 border border-border rounded-lg px-3 py-2">
                {getExplorerErrorHint(error)}
              </p>
            )}
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
                {columnStats.approx && (
                  <span
                    className="text-[11px] font-medium bg-muted text-muted-foreground px-2 py-0.5 rounded-full"
                    title="Values are approximate, computed from Postgres statistics (pg_stats), not a full scan."
                  >
                    approximate
                  </span>
                )}
              </div>

              {/* Stats cards */}
              <div className="grid grid-cols-2 gap-2">
                <StatCard
                  icon={<Percent className="w-3.5 h-3.5" />}
                  label="Null %"
                  value={`${columnStats.nullPercent?.toFixed(1) ?? '?'}%`}
                  color={columnStats.nullPercent != null && columnStats.nullPercent > 50 ? 'text-amber-600 dark:text-amber-400' : undefined}
                />
                <StatCard
                  icon={<Hash className="w-3.5 h-3.5" />}
                  label="Distinct"
                  value={columnStats.distinctCount != null ? formatCompactNumber(columnStats.distinctCount) : '—'}
                />
                {columnStats.minValue !== null && columnStats.minValue !== undefined && (
                  <StatCard label="Min" value={formatValue(columnStats.minValue)} approx={columnStats.approx} />
                )}
                {columnStats.maxValue !== null && columnStats.maxValue !== undefined && (
                  <StatCard label="Max" value={formatValue(columnStats.maxValue)} approx={columnStats.approx} />
                )}
                {columnStats.avgValue !== null && columnStats.avgValue !== undefined && (
                  <StatCard icon={<Sigma className="w-3.5 h-3.5" />} label="Avg" value={formatCompactNumber(columnStats.avgValue)} />
                )}
                {columnStats.stdDevValue !== null && columnStats.stdDevValue !== undefined && (
                  <StatCard label="Std dev" value={formatCompactNumber(columnStats.stdDevValue)} />
                )}
              </div>

              {/* Quantiles */}
              {columnStats.quantiles && (
                <div>
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground mb-1.5">
                    <span>Quantiles</span>
                    {columnStats.approx && <span className="text-[10px] text-muted-foreground/60">(approx)</span>}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <StatCard compact label="q25" value={fmtVal(columnStats.quantiles.q25)} />
                    <StatCard compact label="q50" value={fmtVal(columnStats.quantiles.q50)} />
                    <StatCard compact label="q75" value={fmtVal(columnStats.quantiles.q75)} />
                  </div>
                </div>
              )}

              {/* Data completeness bar */}
              <div>
                <div className="flex justify-between text-[11px] text-muted-foreground mb-1.5">
                  <span>Data completeness</span>
                  <span>{columnStats.nullPercent != null ? (100 - columnStats.nullPercent).toFixed(1) : '?'}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${columnStats.nullPercent != null ? 100 - columnStats.nullPercent : 0}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Foreign key reference */}
            {fkReference && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <Link2 className="w-3 h-3" />
                  References
                </div>
                <div className="flex items-center justify-between gap-2 bg-muted/50 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{fkReference.table}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {fkReference.columns.join(', ')}
                    </div>
                  </div>
                  {onViewReferencedTable && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs flex-shrink-0"
                      onClick={() => onViewReferencedTable(schemaName, fkReference.table)}
                      title={`Open table ${fkReference.table}`}
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      View
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Histogram */}
            {columnStats.histogram && columnStats.histogram.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Distribution</span>
                  {columnStats.approx && (
                    <span className="text-[10px] text-muted-foreground/60 font-normal normal-case">(approx)</span>
                  )}
                </div>
                <div className="space-y-2">
                  {columnStats.histogram.map((bin, i) => (
                    <div key={i} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-mono truncate max-w-[180px]" title={bin.label}>
                          {bin.label ?? `${bin.bucket}`}
                        </span>
                        <span className="text-muted-foreground">{bin.percent.toFixed(1)}%</span>
                      </div>
                      <div className="h-1 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary/40 rounded-full transition-all"
                          style={{ width: `${bin.percent}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top Values Section */}
            {columnStats.topValues && columnStats.topValues.length > 0 && (
              <div className="space-y-3">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Top Values</div>
                <div className="space-y-2.5">
                  {columnStats.topValues.map((item, i) => (
                    <TopValueRow key={i} item={item} onFilter={onFilterFromStats ? handleFilterValue : undefined} />
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

function TopValueRow({ item, onFilter }: { item: TopValue; onFilter?: (value: any) => void }) {
  return (
    <div className="space-y-1 group">
      <div className="flex justify-between text-xs gap-2">
        <span className="font-mono truncate max-w-[180px]" title={String(item.value)}>
          {item.value === null ? 'NULL' : String(item.value) || '(empty)'}
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground flex-shrink-0">
          {item.percent.toFixed(1)}%
          {onFilter && item.value !== null && (
            <button
              onClick={() => onFilter(item.value)}
              className="opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity text-primary hover:text-primary/70"
              title={`Filter rows where value = ${item.value}`}
            >
              <Filter className="w-3 h-3" />
            </button>
          )}
        </span>
      </div>
      <div className="h-1 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary/40 rounded-full transition-all"
          style={{ width: `${item.percent}%` }}
        />
      </div>
    </div>
  );
}

function formatValue(val: any): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'number') return val.toLocaleString();
  if (typeof val === 'string' && (val.includes('T') || val.includes('-'))) {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toLocaleDateString();
  }
  return String(val);
}

const fmtVal = (val: any): string => (val === null || val === undefined ? '—' : String(val));

// =============================================================================
// Stat Card
// =============================================================================

function StatCard({ icon, label, value, color, approx, compact, className }: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  color?: string;
  approx?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('bg-muted/50 rounded-lg px-3 py-2', compact && 'px-2 py-1.5', className)}>
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground mb-0.5">
        {icon}
        {label}
        {approx && <span className="text-[10px] text-muted-foreground/60" title="Approximate, from Postgres statistics">~</span>}
      </div>
      <div className={cn('font-semibold text-sm truncate', color)} title={value}>{value}</div>
    </div>
  );
}


