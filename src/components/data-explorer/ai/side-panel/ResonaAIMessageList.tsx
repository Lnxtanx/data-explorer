// =============================================================================
// Resona AI Side Panel — Message List
// Scrollable conversation stream with auto-scroll and empty state fallback.
// Dedicated exclusively to Dashboard AI.
// =============================================================================

import React, { useEffect, useRef } from 'react';
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
  const scrollBottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages update or during active streaming
  useEffect(() => {
    if (scrollBottomRef.current) {
      scrollBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isStreaming]);

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
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
    >
      {messages.map((message) => (
        <ResonaAIMessageItem
          key={message.id}
          message={message}
          connectionId={connectionId}
        />
      ))}
      <div ref={scrollBottomRef} className="h-px" />
    </div>
  );
}

