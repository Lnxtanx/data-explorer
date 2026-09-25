import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Copy,
  Check,
  Search,
  ChevronLeft,
  ChevronRight,
  FileText,
  Braces,
  WrapText,
  AlignLeft,
} from 'lucide-react';
import { cn, formatShortType } from '@/lib/utils';
import { toast } from 'sonner';
import { useEffect, useMemo, useRef, useState } from 'react';

export interface CellInspectorData {
  value: any;
  columnName: string;
  columnType: string;
  rowIndex: number;
  rowNumber: number;
  tableName: string;
  schemaName: string;
}

interface CellInspectorModalProps {
  data: CellInspectorData | null;
  isOpen: boolean;
  onClose: () => void;
  onNavigateRow?: (direction: 'prev' | 'next') => void;
  hasPrevRow?: boolean;
  hasNextRow?: boolean;
}

export function CellInspectorModal({
  data,
  isOpen,
  onClose,
  onNavigateRow,
  hasPrevRow = false,
  hasNextRow = false,
}: CellInspectorModalProps) {
  const [copied, setCopied] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'formatted' | 'raw'>('formatted');
  const [wrapLines, setWrapLines] = useState(true);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcuts (ArrowLeft/ArrowRight to navigate rows when not in input)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      if (e.key === 'ArrowLeft' && hasPrevRow) {
        onNavigateRow?.('prev');
      } else if (e.key === 'ArrowRight' && hasNextRow) {
        onNavigateRow?.('next');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, hasPrevRow, hasNextRow, onNavigateRow]);

  // Format value and detect JSON
  const { rawText, isJson, formattedJson, charCount, wordCount, lineCount, byteSize } = useMemo(() => {
    if (!data || data.value === null || data.value === undefined) {
      return {
        rawText: '',
        isJson: false,
        formattedJson: '',
        charCount: 0,
        wordCount: 0,
        lineCount: 0,
        byteSize: 0,
      };
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
      if (
        (raw.startsWith('{') && raw.endsWith('}')) ||
        (raw.startsWith('[') && raw.endsWith(']'))
      ) {
        try {
          const parsed = JSON.parse(raw);
          formattedJson = JSON.stringify(parsed, null, 2);
          validJson = true;
        } catch {
          // not JSON
        }
      }
    }

    const activeText = validJson && viewMode === 'formatted' ? formattedJson : raw;
    const lines = activeText.split('\n');
    const words = raw.trim() ? raw.trim().split(/\s+/).length : 0;
    const bytes = new Blob([activeText]).size;

    return {
      rawText: raw,
      isJson: validJson,
      formattedJson,
      charCount: raw.length,
      wordCount: words,
      lineCount: lines.length,
      byteSize: bytes,
    };
  }, [data, viewMode]);

  const activeContent = isJson && viewMode === 'formatted' ? formattedJson : rawText;

  // Split lines for line number gutter
  const contentLines = useMemo(() => activeContent.split('\n'), [activeContent]);

  // Search match count
  const matchCount = useMemo(() => {
    if (!searchTerm.trim()) return 0;
    const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return (activeContent.match(regex) || []).length;
  }, [activeContent, searchTerm]);

  if (!data) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(activeContent);
    setCopied(true);
    toast.success('Cell content copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl w-[92vw] h-[600px] max-h-[88vh] flex flex-col p-0 gap-0 overflow-hidden border border-border shadow-2xl rounded-2xl bg-card">
        {/* Header */}
        <DialogHeader className="px-4 py-3 border-b border-border/80 bg-muted/30 flex flex-row items-center justify-between shrink-0 space-y-0">
          <div className="flex items-center gap-2 min-w-0">
            {isJson ? (
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <Braces className="w-4 h-4" />
              </div>
            ) : (
              <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-sm font-semibold text-foreground truncate">
                  {data.columnName}
                </DialogTitle>
                <span
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/50 shrink-0"
                  title={data.columnType}
                >
                  {formatShortType(data.columnType)}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground truncate">
                {data.schemaName}.{data.tableName} · Row #{data.rowNumber}
              </div>
            </div>
          </div>

          {/* Row navigation buttons */}
          <div className="flex items-center gap-1 mr-6">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2 gap-1"
              onClick={() => onNavigateRow?.('prev')}
              disabled={!hasPrevRow}
              title="Previous Row (Left Arrow)"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev Row</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2 gap-1"
              onClick={() => onNavigateRow?.('next')}
              disabled={!hasNextRow}
              title="Next Row (Right Arrow)"
            >
              <span>Next Row</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </DialogHeader>

        {/* Toolbar */}
        <div className="px-4 py-2 border-b border-border/60 bg-muted/15 flex items-center justify-between gap-2 flex-wrap shrink-0">
          <div className="flex items-center gap-2">
            {/* Formatted vs Raw toggle (for JSON) */}
            {isJson && (
              <div className="flex items-center rounded-lg border border-border/60 bg-muted/40 p-0.5 text-xs">
                <button
                  onClick={() => setViewMode('formatted')}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[11px] font-medium transition-all',
                    viewMode === 'formatted'
                      ? 'bg-background shadow-sm text-foreground font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Formatted JSON
                </button>
                <button
                  onClick={() => setViewMode('raw')}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[11px] font-medium transition-all',
                    viewMode === 'raw'
                      ? 'bg-background shadow-sm text-foreground font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Raw Text
                </button>
              </div>
            )}

            {/* Word wrap toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setWrapLines((prev) => !prev)}
              className={cn(
                'h-7 text-xs px-2.5 gap-1.5 text-muted-foreground hover:text-foreground',
                wrapLines && 'bg-muted text-foreground'
              )}
              title={wrapLines ? 'Disable word wrap' : 'Enable word wrap'}
            >
              {wrapLines ? <WrapText className="w-3.5 h-3.5 text-primary" /> : <AlignLeft className="w-3.5 h-3.5" />}
              <span>{wrapLines ? 'Wrap On' : 'Wrap Off'}</span>
            </Button>

            {/* Search filter */}
            <div className="relative w-44 sm:w-56">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                ref={searchInputRef}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Find in cell…"
                className="h-7 pl-8 pr-7 text-xs bg-background/60"
              />
              {searchTerm && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-mono">
                  {matchCount}
                </span>
              )}
            </div>
          </div>

          {/* Quick Action buttons */}
          <div className="flex items-center gap-1.5 ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="h-7 text-xs px-2.5 gap-1.5 shadow-sm"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </Button>
          </div>
        </div>

        {/* Content Viewer with Line Numbers */}
        <div
          className={cn(
            'flex-1 overflow-auto bg-background/50 select-text',
            isJson && viewMode === 'formatted' ? 'font-mono text-xs' : 'font-sans text-[13.5px]'
          )}
        >
          {data.value === null ? (
            <div className="p-4 text-muted-foreground/40 italic">NULL</div>
          ) : (
            <div className="py-2 min-w-full inline-block">
              {contentLines.map((line, i) => (
                <div key={i} className="flex hover:bg-muted/30 group/line min-h-[24px]">
                  <span className="py-0.5 px-3 select-none text-muted-foreground/35 text-right text-[11px] font-mono w-12 shrink-0 border-r border-border/40 bg-muted/10 tabular-nums">
                    {i + 1}
                  </span>
                  <div
                    className={cn(
                      'py-0.5 px-4 flex-1 text-foreground leading-relaxed',
                      wrapLines ? 'whitespace-pre-wrap break-words' : 'whitespace-pre overflow-x-auto'
                    )}
                  >
                    {searchTerm.trim() ? (
                      <HighlightedLine line={line} search={searchTerm} />
                    ) : (
                      line || '\u00A0'
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer info stats */}
        <DialogFooter className="px-4 py-2 border-t border-border/60 bg-muted/30 flex items-center justify-between text-xs text-muted-foreground font-sans shrink-0">
          <div className="flex items-center gap-3 text-[11px]">
            <span>{charCount.toLocaleString()} characters</span>
            <span>·</span>
            <span>{wordCount.toLocaleString()} words</span>
            <span>·</span>
            <span>{lineCount.toLocaleString()} lines</span>
            <span>·</span>
            <span>{(byteSize / 1024).toFixed(1)} KB</span>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-6 text-xs px-2 text-muted-foreground hover:text-foreground">
            Close (Esc)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HighlightedLine({ line, search }: { line: string; search: string }) {
  if (!search.trim() || !line) return <span>{line || '\u00A0'}</span>;
  const regex = new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = line.split(regex);
  return (
    <span>
      {parts.map((part, index) =>
        part.toLowerCase() === search.toLowerCase() ? (
          <mark key={index} className="bg-amber-400/30 text-foreground font-semibold rounded px-0.5">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </span>
  );
}
