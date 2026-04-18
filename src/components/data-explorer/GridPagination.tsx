// =============================================================================
// Grid Pagination - Professional bottom bar with page info & navigation
// =============================================================================

import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface GridPaginationProps {
  hasMore: boolean;
  hasPrev: boolean;
  onNext: () => void;
  onPrev: () => void;
  isLoading: boolean;
  rowCount?: number;
  estimatedTotal?: number;
  page?: number;
  pageSize?: number;
}

export function GridPagination({ hasMore, hasPrev, onNext, onPrev, isLoading, rowCount, estimatedTotal, page = 0, pageSize = 50 }: GridPaginationProps) {
  const rangeStart = page * pageSize + 1;
  const rangeEnd = page * pageSize + (rowCount || 0);

  return (
    <div className="flex items-center justify-between px-3 py-1.5 border-t border-border bg-card text-xs text-muted-foreground shrink-0">
      {/* Left: Row range info */}
      <div className="flex items-center gap-2">
        {rowCount !== undefined && rowCount > 0 ? (
          <span className="tabular-nums">
            <span className="text-foreground font-medium">{rangeStart}–{rangeEnd}</span>
            {estimatedTotal !== undefined && estimatedTotal >= 0 && (
              <span> of ~{formatCount(estimatedTotal)}</span>
            )}
          </span>
        ) : (
          <span>No rows</span>
        )}
        {isLoading && <Loader2 className="w-3 h-3 animate-spin" />}
      </div>

      {/* Right: Navigation */}
      <div className="flex items-center gap-1">
        {page > 0 && (
          <span className="text-[11px] text-muted-foreground tabular-nums mr-2">
            Page {page + 1}
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onPrev}
          disabled={!hasPrev || isLoading}
          className="h-6 px-2 text-xs"
        >
          <ChevronLeft className="w-3.5 h-3.5 mr-0.5" />
          Prev
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onNext}
          disabled={!hasMore || isLoading}
          className="h-6 px-2 text-xs"
        >
          Next
          <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
        </Button>
      </div>
    </div>
  );
}

function formatCount(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
}
