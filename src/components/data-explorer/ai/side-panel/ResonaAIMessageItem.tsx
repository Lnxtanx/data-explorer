// =============================================================================
// Resona AI Side Panel — Message Item
// Clean, minimal message bubble with official brand avatar, Markdown, and SQL copy.
// =============================================================================

import React, { useState } from 'react';
import { Copy, Check, Terminal, ChevronDown, ChevronUp } from 'lucide-react';
import { MarkdownText } from '../messages/MarkdownText';
import { LiveToolSteps } from '../tools/LiveToolSteps';
import type { AgentToolStep } from '@/hooks/useAIAgent';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface SidePanelMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sql?: string;
  isStreaming?: boolean;
  toolSteps?: AgentToolStep[];
  thinking?: string;
  warnings?: string[];
  timestamp?: string | number;
}

interface ResonaAIMessageItemProps {
  message: SidePanelMessage;
  onTableClick?: (tableName: string) => void;
  connectionId?: string;
}

function formatMessageTime(ts?: string | number) {
  if (!ts) return null;
  try {
    const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return null;
  }
}

export function ResonaAIMessageItem({
  message,
  onTableClick,
  connectionId,
}: ResonaAIMessageItemProps) {
  const isUser = message.role === 'user';
  const [copiedSql, setCopiedSql] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const timeStr = formatMessageTime(message.timestamp);

  const rawContent = message.content || '';
  const lineCount = rawContent.split('\n').length;
  const isLong = rawContent.length > 240 || lineCount > 4;

  const handleCopySql = () => {
    if (!message.sql) return;
    navigator.clipboard.writeText(message.sql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  if (isUser) {
    return (
      <div className="flex flex-col items-end w-full">
        <div
          className={cn(
            "max-w-[90%] sm:max-w-[85%] rounded-2xl bg-muted/70 dark:bg-muted/50 border border-border/50 text-foreground px-4 py-2.5 text-xs sm:text-sm font-normal leading-relaxed shadow-2xs break-words [overflow-wrap:anywhere] relative transition-all duration-200",
            !isExpanded && isLong && "max-h-24 overflow-hidden select-none cursor-pointer hover:border-border/80"
          )}
          onClick={() => {
            if (!isExpanded && isLong) setIsExpanded(true);
          }}
          title={!isExpanded && isLong ? "Click to expand message" : undefined}
        >
          <div className={cn(!isExpanded && isLong ? "line-clamp-3" : "whitespace-pre-wrap max-h-[360px] overflow-y-auto pr-1")}>
            {rawContent}
          </div>

          {/* Fade gradient when collapsed */}
          {!isExpanded && isLong && (
            <div className="pointer-events-none absolute bottom-0 inset-x-0 h-10 bg-gradient-to-t from-muted via-muted/80 to-transparent rounded-b-2xl" />
          )}
        </div>

        {/* Expand / Collapse toggle button */}
        {isLong && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded((prev) => !prev);
            }}
            className="inline-flex items-center gap-1 mt-1 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors px-1 py-0.5 rounded cursor-pointer"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-3 h-3" />
                <span>Show less</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" />
                <span>Show more ({lineCount > 1 ? `${lineCount} lines` : `${rawContent.length} chars`})</span>
              </>
            )}
          </button>
        )}

        {timeStr && (
          <div className="text-[10px] text-muted-foreground/60 text-right px-1 pt-0.5 font-mono">
            {timeStr}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full space-y-2 text-xs sm:text-sm text-foreground leading-relaxed px-0.5">
      {/* Assistant Content Body (No logo, full space utilized) */}
      <div className="w-full min-w-0 space-y-2">
        {/* Live Tool Execution Steps (opencode / Claude Code style) */}
        {message.toolSteps && message.toolSteps.length > 0 && (
          <div className="my-1.5">
            <LiveToolSteps steps={message.toolSteps} isLive={!!message.isStreaming} />
          </div>
        )}

        {/* Warnings & Budget Notices */}
        {message.warnings && message.warnings.length > 0 && (
          <div className="space-y-1.5 my-1.5">
            {message.warnings.map((w, idx) => (
              <div key={idx} className="flex items-start gap-1.5 text-[11px] text-amber-500 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5 leading-snug">
                <span>⚠️</span>
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

        {message.content ? (
          <MarkdownText
            text={message.content}
            connectionId={connectionId}
            onTableClick={onTableClick}
            className="text-xs sm:text-sm text-foreground/90 space-y-2 break-words"
          />
        ) : message.isStreaming && (!message.toolSteps || message.toolSteps.length === 0) ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-ping" />
            <span>Thinking...</span>
          </div>
        ) : null}

        {/* Optional Code / SQL Block */}
        {message.sql && (
          <div className="rounded-xl border border-border bg-card/80 overflow-hidden shadow-2xs my-1.5">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/60 bg-muted/30">
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground">
                <Terminal className="w-3 h-3" />
                <span>SQL</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopySql}
                className="h-5 px-1.5 text-[10px] gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                {copiedSql ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-500" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </>
                )}
              </Button>
            </div>
            <pre className="p-3 text-[11px] font-mono text-foreground overflow-x-auto whitespace-pre leading-normal">
              <code>{message.sql}</code>
            </pre>
          </div>
        )}

        {timeStr && !message.isStreaming && (
          <div className="text-[10px] text-muted-foreground/50 px-1 pt-0.5 font-mono">
            {timeStr}
          </div>
        )}
      </div>
    </div>
  );
}
