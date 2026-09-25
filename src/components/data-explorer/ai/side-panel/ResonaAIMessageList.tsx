// =============================================================================
// Resona AI Side Panel — Message List
// Scrollable conversation stream with auto-scroll and empty state fallback.
// Dedicated exclusively to Dashboard AI.
// =============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowDown } from 'lucide-react';
import { ResonaAIMessageItem, type SidePanelMessage } from './ResonaAIMessageItem';
import { ResonaAIEmptyState } from './ResonaAIEmptyState';

interface ResonaAIMessageListProps {
  messages: SidePanelMessage[];
  isLoading?: boolean;
  isStreaming?: boolean;
  databaseName?: string;
  onSelectPrompt: (prompt: string) => void;
  connectionId?: string;
}

export function ResonaAIMessageList({
  messages,
  isLoading = false,
  isStreaming = false,
  databaseName,
  onSelectPrompt,
  connectionId,
}: ResonaAIMessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScrollRef = useRef(false);
  const programmaticScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    setIsUserScrolledUp(false);
    const el = containerRef.current;
    if (!el) return;
    if (programmaticScrollTimerRef.current) {
      clearTimeout(programmaticScrollTimerRef.current);
    }
    isProgrammaticScrollRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior });
    programmaticScrollTimerRef.current = setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 350);
  }, []);

  const handleScroll = useCallback(() => {
    // If the scroll was triggered programmatically by auto-scroll, don't interpret as user scroll
    if (isProgrammaticScrollRef.current) return;
    const el = containerRef.current;
    if (!el) return;

    // If the container content does not overflow, the user cannot be scrolled up
    const isOverflowing = el.scrollHeight > el.clientHeight + 60;
    if (!isOverflowing) {
      setIsUserScrolledUp(false);
      return;
    }

    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // User is considered scrolled up ONLY if container has real overflow AND is > 100px from bottom
    setIsUserScrolledUp(distanceToBottom > 100);
  }, []);

  // When starting a fresh chat or when messages are few, reset isUserScrolledUp to false
  useEffect(() => {
    if (messages.length <= 2) {
      setIsUserScrolledUp(false);
    }
  }, [messages.length]);

  // Auto-scroll to bottom when messages update or during active streaming,
  // UNLESS the user has actively scrolled up to inspect previous output.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const isOverflowing = el.scrollHeight > el.clientHeight + 60;
    if (!isOverflowing) {
      setIsUserScrolledUp(false);
      return;
    }

    if (!isUserScrolledUp) {
      scrollToBottom(isStreaming ? 'auto' : 'smooth');
    }
  }, [messages, isStreaming, isUserScrolledUp, scrollToBottom]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (programmaticScrollTimerRef.current) {
        clearTimeout(programmaticScrollTimerRef.current);
      }
    };
  }, []);

  if (isLoading && messages.length === 0) {
    return (
      <div className="flex-1 p-4 space-y-4 animate-pulse">
        <div className="w-full h-11 rounded-2xl bg-muted/60" />
        <div className="space-y-2 w-full pt-1">
          <div className="h-4 w-5/6 rounded bg-muted/50" />
          <div className="h-4 w-3/4 rounded bg-muted/50" />
          <div className="h-4 w-1/2 rounded bg-muted/50" />
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <ResonaAIEmptyState
        databaseName={databaseName}
        onSelectPrompt={onSelectPrompt}
      />
    );
  }

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
      >
        {messages.map((message) => (
          <ResonaAIMessageItem
            key={message.id}
            message={message}
            connectionId={connectionId}
          />
        ))}
      </div>

      {/* Floating Scroll to Bottom pill */}
      {isUserScrolledUp && (
        <button
          type="button"
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background/95 hover:bg-accent border border-border shadow-md backdrop-blur-md text-xs font-medium text-muted-foreground hover:text-foreground transition-all cursor-pointer select-none animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          <ArrowDown className="w-3.5 h-3.5 text-primary" />
          <span>Scroll to bottom</span>
        </button>
      )}
    </div>
  );
}
