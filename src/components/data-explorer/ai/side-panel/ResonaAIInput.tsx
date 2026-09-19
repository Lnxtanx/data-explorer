// =============================================================================
// Resona AI Side Panel — Input
// Clean chat input with Schema Weaver's real ModeSelector and send action.
// =============================================================================

import React, { useRef, useEffect } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModeSelector, type AgentMode } from '@/components/data-explorer/ai/models/ModeSelector';
import { cn } from '@/lib/utils';

interface ResonaAIInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onAbort?: () => void;
  isStreaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
  databaseName?: string;
  mode?: AgentMode;
  thinking?: boolean;
  onModeChange?: (mode: AgentMode) => void;
  onThinkingChange?: (thinking: boolean) => void;
}

export function ResonaAIInput({
  value,
  onChange,
  onSubmit,
  onAbort,
  isStreaming = false,
  disabled = false,
  placeholder,
  databaseName,
  mode = 'flash',
  thinking = false,
  onModeChange,
  onThinkingChange,
}: ResonaAIInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea height on text change
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming && value.trim() && !disabled) {
        onSubmit();
      }
    }
  };

  const handleActionClick = () => {
    if (isStreaming && onAbort) {
      onAbort();
    } else if (value.trim() && !disabled) {
      onSubmit();
    }
  };

  const effectivePlaceholder =
    placeholder ||
    (databaseName
      ? `Ask Resona AI about ${databaseName}...`
      : 'Ask Resona AI...');

  return (
    <div className="p-3 bg-transparent shrink-0 relative select-none">
      {/* Clean Input Box Card */}
      <div className="relative rounded-xl border border-border/80 bg-card p-2.5 shadow-2xs focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all select-text">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={effectivePlaceholder}
          disabled={disabled && !isStreaming}
          rows={1}
          className="w-full resize-none bg-transparent px-1.5 py-1 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground/70 outline-none max-h-32 leading-relaxed overflow-y-auto"
        />

        {/* Footer controls: Real ModeSelector on left, Send/Stop button on right */}
        <div className="flex items-center justify-between pt-2 px-1 select-none">
          {/* Real ModeSelector (Flash / Deep + Thinking) */}
          {onModeChange && onThinkingChange ? (
            <ModeSelector
              mode={mode}
              thinking={thinking}
              disabled={isStreaming}
              onModeChange={onModeChange}
              onThinkingChange={onThinkingChange}
            />
          ) : (
            <div />
          )}

          {/* Action Button: Send when text entered, Square when streaming */}
          <Button
            type="button"
            size="icon"
            onClick={handleActionClick}
            disabled={(!value.trim() && !isStreaming) || (disabled && !isStreaming)}
            className={cn(
              'h-7 w-7 rounded-full transition-all shrink-0 cursor-pointer',
              isStreaming
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed'
            )}
            title={isStreaming ? 'Stop Generating' : 'Send Message'}
          >
            {isStreaming ? (
              <Square className="w-3 h-3 fill-current" />
            ) : (
              <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
