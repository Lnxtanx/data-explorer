// =============================================================================
// Resona AI Side Panel — Input
// Clean chat input with ModeSelector, send action, and multi-file attachments.
// =============================================================================

import React, { useRef, useEffect, useState } from 'react';
import { ArrowUp, Square, Plus, Loader2, AlertTriangle, WifiOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModeSelector, type AgentMode } from '../../ai/models/ModeSelector';
import AttachmentChip from '../../ai/chat/AttachmentChip';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Format detection for large pasted text (auto-converts into attached virtual file)
function detectPastedFormat(text: string): { filename: string; mimeType: string } {
  const trimmed = text.trim();
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 12);

  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed);
      return { filename: `pasted_data_${timestamp}.json`, mimeType: 'application/json' };
    } catch (_) {}
  }

  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH|EXPLAIN)\b/i.test(trimmed)) {
    return { filename: `pasted_query_${timestamp}.sql`, mimeType: 'application/sql' };
  }

  const firstLines = trimmed.split('\n').slice(0, 5).filter((l) => l.trim().length > 0);
  if (firstLines.length >= 2) {
    const commaCount = (firstLines[0].match(/,/g) || []).length;
    if (commaCount >= 2 && firstLines.every((l) => (l.match(/,/g) || []).length === commaCount)) {
      return { filename: `pasted_table_${timestamp}.csv`, mimeType: 'text/csv' };
    }
    const tabCount = (firstLines[0].match(/\t/g) || []).length;
    if (tabCount >= 2 && firstLines.every((l) => (l.match(/\t/g) || []).length === tabCount)) {
      return { filename: `pasted_table_${timestamp}.tsv`, mimeType: 'text/tab-separated-values' };
    }
  }

  if (/^\s*<!DOCTYPE html|^\s*<html|^\s*<\?xml/i.test(trimmed)) {
    return { filename: `pasted_document_${timestamp}.html`, mimeType: 'text/html' };
  }

  if (/^\s*(def |class |import |from \w+ import |@\w+)/m.test(trimmed)) {
    return { filename: `pasted_script_${timestamp}.py`, mimeType: 'text/x-python' };
  }

  if (/^\s*(interface |type |const |let |function |export |import |return <)/m.test(trimmed)) {
    return { filename: `pasted_code_${timestamp}.ts`, mimeType: 'text/typescript' };
  }

  if (/^#+\s|\*\*|```/m.test(trimmed)) {
    return { filename: `pasted_doc_${timestamp}.md`, mimeType: 'text/markdown' };
  }

  return { filename: `pasted_text_${timestamp}.txt`, mimeType: 'text/plain' };
}

interface ResonaAIInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onAbort?: () => void;
  isStreaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
  databaseName?: string;
  isConnectorOnline?: boolean;
  quotaError?: string | null;
  quotaWarning?: { level: 'warning' | 'critical'; message: string } | null;
  onOpenPlans?: () => void;
  mode?: AgentMode;
  thinking?: boolean;
  onModeChange?: (mode: AgentMode) => void;
  onThinkingChange?: (thinking: boolean) => void;
  attachedFiles?: File[];
  onFileSelect?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFilesAdd?: (files: File[]) => void;
  onRemoveFile?: (index: number) => void;
  isUploading?: boolean;
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
  isConnectorOnline = true,
  quotaError,
  quotaWarning,
  onOpenPlans,
  mode = 'flash',
  thinking = false,
  onModeChange,
  onThinkingChange,
  attachedFiles = [],
  onFileSelect,
  onFilesAdd,
  onRemoveFile,
  isUploading = false,
}: ResonaAIInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [warningDismissed, setWarningDismissed] = useState(false);
  const warningKey = quotaWarning ? `${quotaWarning.level}-${quotaWarning.message.slice(0, 20)}` : null;
  const [lastWarningKey, setLastWarningKey] = useState<string | null>(null);
  if (warningKey !== lastWarningKey) {
    setLastWarningKey(warningKey);
    if (warningKey) setWarningDismissed(false);
  }

  // Auto-resize textarea height on text change
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [value]);

  const isInputBlocked = Boolean(quotaError || !isConnectorOnline);
  const hasContent = Boolean(value.trim() || attachedFiles.length > 0);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming && !isUploading && hasContent && !disabled && !isInputBlocked) {
        onSubmit();
      }
    }
  };

  const handleActionClick = () => {
    if (isStreaming && onAbort) {
      onAbort();
    } else if (hasContent && !disabled && !isInputBlocked && !isUploading) {
      onSubmit();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (isInputBlocked) return;
    const files = e.clipboardData?.files ? Array.from(e.clipboardData.files) : [];
    if (files.length > 0 && onFilesAdd) {
      e.preventDefault();
      onFilesAdd(files);
      toast.success(`Attached ${files.length} file${files.length > 1 ? 's' : ''} from clipboard`);
      return;
    }

    const text = e.clipboardData?.getData('text') || '';
    const lineCount = text.split('\n').length;
    const isLargeText = text.length >= 2000 || lineCount >= 35;

    if (isLargeText && onFilesAdd) {
      e.preventDefault();
      const { filename, mimeType } = detectPastedFormat(text);
      const blob = new Blob([text], { type: mimeType });
      const file = new File([blob], filename, { type: mimeType, lastModified: Date.now() });
      onFilesAdd([file]);
      toast.success(`Pasted text converted to attachment (${filename})`);
    }
  };

  const effectivePlaceholder = quotaError
    ? 'Credit limit reached — upgrade to continue'
    : !isConnectorOnline
    ? 'Database offline — start connector daemon to continue'
    : placeholder ||
      (databaseName
        ? `Ask Resona Dashboard AI about ${databaseName}...`
        : 'Ask Resona Dashboard AI about metrics or charts...');

  return (
    <div className="p-3 bg-transparent shrink-0 relative select-none">
      {/* 1. Quota Exhaustion Banner — amber, blocks input */}
      {quotaError && (
        <div className="flex items-start gap-2 mb-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
          <span className="flex-1 leading-relaxed">{quotaError}</span>
          {onOpenPlans && (
            <button
              onClick={onOpenPlans}
              className="shrink-0 font-medium underline underline-offset-2 hover:text-amber-600 dark:hover:text-amber-100 transition-colors whitespace-nowrap cursor-pointer"
            >
              View plans
            </button>
          )}
        </div>
      )}

      {/* 2. Connector Offline Banner — rose/amber, blocks input */}
      {!isConnectorOnline && (
        <div className="flex items-start gap-2 mb-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-xl px-3 py-2 text-xs text-rose-800 dark:text-rose-200">
          <WifiOff className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-500" />
          <span className="flex-1 leading-relaxed">
            Database connector is offline. Start your local connector daemon (<code>npx @schema-weaver/pg-connector start</code>) to query or generate analytics.
          </span>
        </div>
      )}

      {/* 3. Quota Warning Banner — dismissible */}
      {!quotaError && isConnectorOnline && quotaWarning && !warningDismissed && (
        <div
          className={cn(
            'flex items-start gap-2 mb-2 rounded-xl px-3 py-2 text-xs border',
            quotaWarning.level === 'critical'
              ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/50 text-orange-800 dark:text-orange-200'
              : 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800/40 text-yellow-800 dark:text-yellow-200'
          )}
        >
          <AlertTriangle
            className={cn(
              'w-3.5 h-3.5 shrink-0 mt-0.5',
              quotaWarning.level === 'critical' ? 'text-orange-500' : 'text-yellow-500'
            )}
          />
          <span className="flex-1 leading-relaxed">{quotaWarning.message}</span>
          {onOpenPlans && (
            <button
              onClick={onOpenPlans}
              className="shrink-0 font-medium underline underline-offset-2 opacity-70 hover:opacity-100 transition-opacity whitespace-nowrap cursor-pointer"
            >
              Upgrade
            </button>
          )}
          <button
            onClick={() => setWarningDismissed(true)}
            className="shrink-0 ml-0.5 opacity-40 hover:opacity-80 transition-opacity cursor-pointer"
            aria-label="Dismiss warning"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={onFileSelect}
        className="hidden"
        multiple
        accept=".pdf,.docx,.xlsx,.xls,.csv,.tsv,.pptx,.txt,.md,.json,.sql,.py,.ts,.js,.tsx,.jsx,.yaml,.yml,.xml,.html,.css,.sh,.env,.log,.toml,.rs,.go,.java,.png,.jpg,.jpeg,.webp,.svg,.gif"
      />

      {/* Clean Input Box Card */}
      <div className="relative rounded-xl border border-border/80 bg-card p-2.5 shadow-sm focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all select-text">
        {/* Attached Files Chips — images get a real thumbnail, same as Data Explorer */}
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-1 pb-2">
            {attachedFiles.map((file, i) => (
              <AttachmentChip
                key={`${file.name}-${i}`}
                file={file}
                size="sm"
                onRemove={onRemoveFile ? () => onRemoveFile(i) : () => { }}
              />
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={effectivePlaceholder}
          disabled={(disabled || isInputBlocked) && !isStreaming}
          rows={1}
          className="w-full resize-none bg-transparent px-1.5 py-1 text-[14px] sm:text-[14.5px] leading-[22px] font-sans antialiased text-foreground placeholder:text-muted-foreground/70 outline-none max-h-32 overflow-y-auto"
        />

        {/* Footer controls: ModeSelector & Attach button on left, Send/Stop button on right */}
        <div className="flex items-center justify-between pt-2 px-1 select-none">
          <div className="flex items-center gap-1.5">
            {/* Real ModeSelector (Flash / Deep + Thinking) */}
            {onModeChange && onThinkingChange && (
              <ModeSelector
                mode={mode}
                thinking={thinking}
                disabled={isStreaming || isInputBlocked}
                onModeChange={onModeChange}
                onThinkingChange={onThinkingChange}
              />
            )}

            {/* Attach File Button */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={isStreaming || isUploading || isInputBlocked}
              className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Attach files (PDF, CSV, Excel, SQL, code, images, docs)"
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* Action Button: Send when content entered, Square when streaming, Loader when uploading */}
          <Button
            type="button"
            size="icon"
            onClick={handleActionClick}
            disabled={(!hasContent && !isStreaming) || ((disabled || isInputBlocked) && !isStreaming) || isUploading}
            className={cn(
              'h-7 w-7 rounded-full transition-all shrink-0 cursor-pointer',
              isStreaming
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed'
            )}
            title={isStreaming ? 'Stop Generating' : isUploading ? 'Uploading files…' : 'Send Message'}
          >
            {isStreaming ? (
              <Square className="w-3 h-3 fill-current" />
            ) : isUploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
