// =============================================================================
// Resona AI Side Panel — Message Item
// Clean, minimal message bubble with official brand avatar, Markdown, and SQL copy.
// =============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { MarkdownText } from '../messages/MarkdownText';
import { LiveToolSteps } from '../tools/LiveToolSteps';
import type { AgentToolStep } from '@/hooks/useAIAgent';
import { cn, stripTemporalTag } from '@/lib/utils';

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
  connectionId?: string | null;
  onTableClick?: (tableName: string) => void;
  onInsightWhy?: (panelKey: string) => void;
}

function formatMessageTime(ts?: string | number) {
  if (!ts) return null;
  try {
    let d: Date;
    if (typeof ts === 'number') {
      // Python time.time() returns epoch seconds; JS Date expects milliseconds.
      // If the value is less than 1e12 it's almost certainly seconds.
      d = new Date(ts < 1e12 ? ts * 1000 : ts);
    } else {
      d = new Date(ts);
    }
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
  const [isExpanded, setIsExpanded] = useState(false);
  const [isThinkingExpanded, setIsThinkingExpanded] = useState(Boolean(message.isStreaming && message.thinking));
  const wasStreamingThinkingRef = useRef(message.isStreaming);
  const thinkingScrollRef = useRef<HTMLDivElement>(null);
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set());
  const visibleWarnings = (message.warnings || []).filter((w) => !dismissedWarnings.has(w));
  const timeStr = formatMessageTime(message.timestamp);

  useEffect(() => {
    if (message.isStreaming && message.thinking) {
      setIsThinkingExpanded(true);
    } else if (wasStreamingThinkingRef.current && !message.isStreaming) {
      setIsThinkingExpanded(false);
    }
    wasStreamingThinkingRef.current = message.isStreaming;
  }, [message.isStreaming, message.thinking]);

  useEffect(() => {
    if (message.isStreaming && isThinkingExpanded && thinkingScrollRef.current) {
      thinkingScrollRef.current.scrollTop = thinkingScrollRef.current.scrollHeight;
    }
  }, [message.thinking, message.isStreaming, isThinkingExpanded]);

  const rawContent = message.content || '';
  const displayContent = isUser ? stripTemporalTag(rawContent) : rawContent;
  const lineCount = displayContent.split('\n').length;
  const isLong = displayContent.length > 240 || lineCount > 4;
  // Thinking already rendered inside the step-wise container — don't show it twice.
  const hasThinkingStep = (message.toolSteps || []).some(
    (s) => s.type === 'thinking' || s.name === 'thinking'
  );

  if (isUser) {
    return (
      <div className="flex flex-col items-end w-full">
        <div
          className={cn(
            "max-w-[90%] sm:max-w-[85%] rounded-2xl bg-muted/60 text-foreground px-4 py-2.5 text-[15px] leading-relaxed break-words [overflow-wrap:anywhere] relative transition-all duration-200",
            !isExpanded && isLong && "max-h-28 overflow-hidden select-none cursor-pointer hover:bg-muted/70"
          )}
          onClick={() => {
            if (!isExpanded && isLong) setIsExpanded(true);
          }}
          title={!isExpanded && isLong ? "Click to expand message" : undefined}
        >
          <div className={cn(!isExpanded && isLong ? "line-clamp-3" : "max-h-[380px] overflow-y-auto pr-1")}>
            <MarkdownText text={displayContent} onTableClick={onTableClick} connectionId={connectionId ?? undefined} />
          </div>

          {/* Fade gradient when collapsed */}
          {!isExpanded && isLong && (
            <div className="pointer-events-none absolute bottom-0 inset-x-0 h-10 bg-gradient-to-t from-muted/90 via-muted/60 to-transparent rounded-b-2xl" />
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
                <span>Show more ({lineCount > 1 ? `${lineCount} lines` : `${displayContent.length} chars`})</span>
              </>
            )}
          </button>
        )}

        {timeStr && (
          <div className="text-[11px] text-muted-foreground/60 text-right px-1 pt-0.5 font-mono">
            {timeStr}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full space-y-2 text-[15px] text-foreground leading-relaxed px-0.5">
      {/* Assistant Content Body (No logo, full space utilized) */}
      <div className="w-full min-w-0 space-y-2">
        {/* Live Tool Execution Steps (opencode / Claude Code style) */}
        {message.toolSteps && message.toolSteps.length > 0 && (
          <div className="my-1.5">
            <LiveToolSteps steps={message.toolSteps} isLive={!!message.isStreaming} />
          </div>
        )}

        {/* Warnings & Budget Notices */}
        {visibleWarnings.length > 0 && (
          <div className="space-y-1.5 my-1.5">
            {visibleWarnings.map((w, idx) => (
              <div
                key={idx}
                className="flex items-start justify-between gap-1.5 text-xs text-amber-500 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5 leading-snug animate-in fade-in duration-150"
              >
                <div className="flex items-start gap-1.5 flex-1 min-w-0">
                  <span className="shrink-0 select-none">⚠️</span>
                  <span className="flex-1 select-text">{w}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setDismissedWarnings((prev) => new Set([...prev, w]))}
                  className="shrink-0 p-0.5 rounded text-amber-500/60 hover:text-amber-500 hover:bg-amber-500/20 transition-colors ml-1"
                  title="Dismiss warning"
                  aria-label="Dismiss warning"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Live / Persisted Model Thinking (clean pulse style matching AgentStatusBar)
            Skipped when a thinking step already renders it inside LiveToolSteps. */}
        {message.thinking && !hasThinkingStep && (
          <div className="rounded-lg border border-border/60 bg-muted/30 my-1.5 overflow-hidden transition-all duration-200">
            <button
              type="button"
              onClick={() => setIsThinkingExpanded((prev) => !prev)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-muted/50 transition-colors cursor-pointer select-none"
            >
              <div className="flex items-center gap-2 min-w-0">
                {message.isStreaming ? (
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse shrink-0" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/40 shrink-0" />
                )}
                <span className="text-xs font-medium text-foreground/80">
                  {message.isStreaming ? 'Thinking…' : 'Thought process'}
                </span>
                {!message.isStreaming && message.thinking && (
                  <span className="text-[11px] text-muted-foreground/50 font-mono">
                    {message.thinking.split('\n').length} lines
                  </span>
                )}
              </div>
              {isThinkingExpanded ? (
                <ChevronUp className="w-3 h-3 text-muted-foreground/50 shrink-0" />
              ) : (
                <ChevronDown className="w-3 h-3 text-muted-foreground/50 shrink-0" />
              )}
            </button>
            {isThinkingExpanded && (
              <div
                ref={thinkingScrollRef}
                className="px-3 pb-3 pt-1 border-t border-border/40 text-[12px] font-mono text-muted-foreground leading-relaxed whitespace-pre-wrap max-h-52 overflow-y-auto pr-2 break-words select-text"
              >
                {message.thinking}
              </div>
            )}
          </div>
        )}

        {message.content ? (
          <div className="relative">
            <MarkdownText
              text={message.content}
              connectionId={connectionId ?? undefined}
              onTableClick={onTableClick}
              className="text-[15px] text-foreground leading-relaxed space-y-2 break-words"
            />
            {message.isStreaming && (
              <span className="inline-block w-1.5 h-3.5 bg-primary align-middle ml-1 animate-pulse" />
            )}
          </div>
        ) : message.isStreaming && !message.thinking && (!message.toolSteps || message.toolSteps.length === 0) ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-pulse" />
            <span>Thinking…</span>
          </div>
        ) : null}

        {timeStr && !message.isStreaming && (
          <div className="text-[11px] text-muted-foreground/50 px-1 pt-0.5 font-mono">
            {timeStr}
          </div>
        )}
      </div>
    </div>
  );
}
