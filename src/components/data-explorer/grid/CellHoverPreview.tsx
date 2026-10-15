import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Check, Maximize2, X, FileText, Braces } from 'lucide-react';
import { cn, formatShortType } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface CellHoverData {
  value: any;
  columnName: string;
  columnType: string;
  rowIndex: number;
  rowNumber: number;
  rect: DOMRect;
}

interface CellHoverPreviewProps {
  data: CellHoverData | null;
  onClose: () => void;
  onOpenInspector: (data: CellHoverData) => void;
  onKeepOpen?: () => void;
}

export function CellHoverPreview({ data, onClose, onOpenInspector, onKeepOpen }: CellHoverPreviewProps) {
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when pressing Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Close when clicking outside the card
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Format value and detect JSON
  const { textValue, isJson, formattedJson, charCount, lineCount } = useMemo(() => {
    if (!data || data.value === null || data.value === undefined) {
      return { textValue: '', isJson: false, formattedJson: '', charCount: 0, lineCount: 0 };
    }

    let raw = '';
    let formattedJson = '';
    let validJson = false;

    if (typeof data.value === 'object') {
      try {
        formattedJson = JSON.stringify(data.value, null, 2);
        raw = JSON.stringify(data.value);
        validJson = true;
      } catch {
        raw = String(data.value);
      }
    } else {
      raw = String(data.value);
      // Test if string is valid JSON
      if (
        (raw.startsWith('{') && raw.endsWith('}')) ||
        (raw.startsWith('[') && raw.endsWith(']'))
      ) {
        try {
          const parsed = JSON.parse(raw);
          formattedJson = JSON.stringify(parsed, null, 2);
          validJson = true;
        } catch {
          // not valid JSON
        }
      }
    }

    const lines = (validJson ? formattedJson : raw).split('\n').length;
    return {
      textValue: raw,
      isJson: validJson,
      formattedJson,
      charCount: raw.length,
      lineCount: lines,
    };
  }, [data]);

  if (!data) return null;

  // Calculate floating position with viewport boundary clamping.
  // Keep the card inside the viewport on narrow screens.
  const cardWidth = Math.min(380, window.innerWidth - 24);
  const estimatedHeight = 260;
  const padding = 12;

  let left = data.rect.left;
  if (left + cardWidth > window.innerWidth - padding) {
    left = window.innerWidth - cardWidth - padding;
  }
  left = Math.max(padding, left);

  // Position above if not enough room below
  const spaceBelow = window.innerHeight - data.rect.bottom;
  const showAbove = spaceBelow < estimatedHeight + 20 && data.rect.top > estimatedHeight;
  const top = showAbove
    ? Math.max(padding, data.rect.top - estimatedHeight - 8)
    : Math.min(window.innerHeight - estimatedHeight - padding, data.rect.bottom + 6);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(isJson ? formattedJson : textValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenInspector(data);
    onClose();
  };

  return createPortal(
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        width: `${cardWidth}px`,
      }}
      className={cn(
        'z-[9999] rounded-xl border border-border/80 bg-popover/95 backdrop-blur-md shadow-2xl',
        'text-popover-foreground transition-all animate-in fade-in zoom-in-95 duration-150 select-text overflow-hidden',
        'ring-1 ring-black/5 dark:ring-white/10',
        // Hover preview is a pointer-only affordance; hide it on touch devices
        // where it would otherwise float awkwardly over the grid.
        '[@media(hover:none)]:hidden'
      )}
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={() => onKeepOpen?.()}
      onMouseLeave={onClose}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/60 bg-muted/40 text-xs gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {isJson ? (
            <Braces className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          ) : (
            <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
          )}
          <span className="font-semibold text-foreground truncate" title={data.columnName}>
            {data.columnName}
          </span>
          <span
            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/50 shrink-0"
            title={data.columnType}
          >
            {formatShortType(data.columnType)}
          </span>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10.5px] text-muted-foreground font-mono mr-1">
            Row #{data.rowNumber}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={handleCopy}
            title={copied ? 'Copied to clipboard' : 'Copy cell text'}
          >
            {copied ? (
              <Check className="w-3 h-3 text-emerald-500" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-primary hover:text-primary hover:bg-primary/10"
            onClick={handleExpand}
            title="Inspect in modal (Double-click)"
          >
            <Maximize2 className="w-3 h-3" />
          </Button>
          <button
            onClick={onClose}
            className="text-muted-foreground/70 hover:text-foreground p-0.5 rounded transition-colors ml-0.5"
            title="Close preview"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        className={cn(
          'p-3.5 max-h-[230px] overflow-y-auto scrollbar-thin leading-relaxed break-words whitespace-pre-wrap text-foreground select-text',
          isJson ? 'font-mono text-xs bg-muted/20 rounded-md p-2.5 my-1' : 'font-sans text-[13px]'
        )}
      >
        {data.value === null ? (
          <span className="text-muted-foreground/40 italic">NULL</span>
        ) : isJson ? (
          formattedJson
        ) : (
          textValue
        )}
      </div>

      {/* Footer info & action hint */}
      <div className="flex items-center justify-between px-3.5 py-1.5 border-t border-border/50 bg-muted/20 text-[11px] text-muted-foreground font-sans">
        <span>
          {charCount.toLocaleString()} chars {lineCount > 1 ? `· ${lineCount} lines` : ''}
        </span>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70 font-sans">
          <span>Esc to close</span>
          <span>·</span>
          <button
            type="button"
            onClick={handleExpand}
            className="text-primary hover:underline font-medium inline-flex items-center gap-0.5 cursor-pointer"
          >
            Full inspector
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
