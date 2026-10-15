import { useState, useCallback, useEffect } from 'react';
import { Plus, Send, LayoutDashboard, FolderOpen, AtSign, X, Square, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ActionTooltip } from '@/components/ui/tooltip';
import { TablePreviewHoverCard } from '../messages/TablePreviewHoverCard';
import { MentionPicker } from '../input/MentionPicker';
import { MicButton, VoicePanel } from '@/components/voice';
import { ModeSelector } from '../models/ModeSelector';
import type { AgentMode } from '../models/ModeSelector';
import type { AgentWarning, ContextMeta } from '../types';

import { ContextWindowBar } from './ContextWindowBar';
import AttachmentChip from './AttachmentChip';

// ─── Mention Overlay ──────────────────────────────────────────────────────────

function MentionOverlay({
    text, interimSpeech, availableTables, className, style, scrollTop, connectionId,
}: {
    text: string;
    interimSpeech?: string;
    availableTables: string[];
    className?: string;
    style?: React.CSSProperties;
    scrollTop: number;
    connectionId: string | null;
    isCompact?: boolean;
}) {
    const parts = text.split(/(@\w+)/g);
    return (
        <div className="absolute inset-0 pointer-events-none select-none overflow-hidden z-[5]">
            <div
                className={cn(
                    'w-full min-h-full px-3.5 pt-2.5 pb-1 font-sans antialiased whitespace-pre-wrap break-words text-foreground text-[14px] sm:text-[14.5px] leading-[22px]',
                    className,
                )}
                style={{ ...style, transform: `translateY(-${scrollTop}px)` }}
            >
                {parts.map((part, i) => {
                    const tableName = part.startsWith('@') ? part.slice(1) : null;
                    if (tableName && availableTables.includes(tableName)) {
                        return (
                            <TablePreviewHoverCard
                                key={i}
                                tableName={tableName}
                                connectionId={connectionId}
                                align="start"
                                side="top"
                                sideOffset={12}
                                trigger={
                                    <span className="inline relative pointer-events-auto bg-blue-500/15 text-blue-600 dark:text-blue-400 font-normal rounded-sm ring-[1px] ring-blue-500/20 cursor-help transition-all duration-200">
                                        {part}
                                    </span>
                                }
                            />
                        );
                    }
                    return <span key={i}>{part}</span>;
                })}
                {interimSpeech && (
                    <span className="text-muted-foreground/50 animate-pulse">
                        {text && !text.endsWith(' ') && !text.endsWith('\n') ? ' ' : ''}
                        {interimSpeech}
                    </span>
                )}
            </div>
        </div>
    );
}

// ─── Format detection for large pasted text ──────────────────────────────────

function detectPastedFormat(text: string): { filename: string; mimeType: string } {
    const trimmed = text.trim();
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 12);

    // 1. JSON
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
            JSON.parse(trimmed);
            return { filename: `pasted_data_${timestamp}.json`, mimeType: 'application/json' };
        } catch (_) {}
    }

    // 2. SQL
    if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH|EXPLAIN)\b/i.test(trimmed)) {
        return { filename: `pasted_query_${timestamp}.sql`, mimeType: 'application/sql' };
    }

    // 3. CSV / TSV
    const firstLines = trimmed.split('\n').slice(0, 5).filter(l => l.trim().length > 0);
    if (firstLines.length >= 2) {
        const commaCount = (firstLines[0].match(/,/g) || []).length;
        if (commaCount >= 2 && firstLines.every(l => (l.match(/,/g) || []).length === commaCount)) {
            return { filename: `pasted_table_${timestamp}.csv`, mimeType: 'text/csv' };
        }
        const tabCount = (firstLines[0].match(/\t/g) || []).length;
        if (tabCount >= 2 && firstLines.every(l => (l.match(/\t/g) || []).length === tabCount)) {
            return { filename: `pasted_table_${timestamp}.tsv`, mimeType: 'text/tab-separated-values' };
        }
    }

    // 4. HTML / XML
    if (/^\s*<!DOCTYPE html|^\s*<html|^\s*<\?xml/i.test(trimmed)) {
        return { filename: `pasted_document_${timestamp}.html`, mimeType: 'text/html' };
    }

    // 5. Python
    if (/^\s*(def |class |import |from \w+ import |@\w+)/m.test(trimmed)) {
        return { filename: `pasted_script_${timestamp}.py`, mimeType: 'text/x-python' };
    }

    // 6. TypeScript / JavaScript / React
    if (/^\s*(interface |type |const |let |function |export |import |return <)/m.test(trimmed)) {
        return { filename: `pasted_code_${timestamp}.ts`, mimeType: 'text/typescript' };
    }

    // 7. Markdown
    if (/^#+\s|\*\*|```/m.test(trimmed)) {
        return { filename: `pasted_doc_${timestamp}.md`, mimeType: 'text/markdown' };
    }

    // Default plain text
    return { filename: `pasted_text_${timestamp}.txt`, mimeType: 'text/plain' };
}

// ─── ChatInput ────────────────────────────────────────────────────────────────

export interface ChatInputProps {
    input: string;
    scrollTop: number;
    attachedFiles: File[];
    mentionQuery: string | null;
    availableTables: string[];
    isStreaming: boolean;
    agentMode: boolean;
    connectionId?: string;
    dbName?: string;
    dashboardCount: number;
    showDashboard: boolean;
    mode: AgentMode;
    thinking: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  fileInputRef: React.RefObject<HTMLInputElement>;
    onInput: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    onScroll: (e: React.UIEvent<HTMLTextAreaElement>) => void;
    onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    onSend: () => void;
    onAbort: () => void;
    onFilesAdd?: (files: File[]) => void;
    onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onRemoveFile: (index: number) => void;
    onMentionSelect: (table: string) => void;
    onMentionClose: () => void;
    onMentionTrigger: () => void;
    onModeChange: (mode: AgentMode) => void;
    onThinkingChange: (thinking: boolean) => void;
    onToggleDashboard: () => void;
    onToggleWorkspace?: () => void;
    showWorkspace?: boolean;
    onTranscript: (text: string) => void;
    quotaError?: string | null;
    quotaWarning?: { level: 'warning' | 'critical'; message: string } | null;
    onOpenPlans?: () => void;
    uploadError?: string | null;
    isUploading?: boolean;
    agentWarnings?: AgentWarning[];
    onDismissWarning?: (id: string) => void;
    contextMeta?: ContextMeta | null;
    localMessageCount?: number;
    tokenCount?: number | null;
    isEmptyState?: boolean;
    isDockedInOverlay?: boolean;
    isVoiceActive?: boolean;
    isVoiceConnecting?: boolean;
    isVoiceTalking?: boolean;
    onToggleVoice?: () => void;
}

export function ChatInput({
    input, scrollTop, attachedFiles, mentionQuery, availableTables, isStreaming,
    agentMode, connectionId, dbName, dashboardCount, showDashboard, mode, thinking,
    textareaRef, fileInputRef,
    onInput, onScroll, onKeyDown, onSend, onAbort, onFilesAdd, onFileSelect, onRemoveFile,
    onMentionSelect, onMentionClose, onMentionTrigger, onModeChange, onThinkingChange,
    onToggleDashboard, onToggleWorkspace, showWorkspace, onTranscript,
    quotaError, quotaWarning, onOpenPlans, uploadError, isUploading,
    agentWarnings, onDismissWarning,
    contextMeta, localMessageCount, tokenCount,
    isEmptyState = false,
    isDockedInOverlay = false,
    isVoiceActive = false,
    isVoiceConnecting = false,
    isVoiceTalking = false,
    onToggleVoice,
}: ChatInputProps) {
    const [warningDismissed, setWarningDismissed] = useState(false);
    // Auto-undismiss when the warning level changes (e.g. goes from 75% to 90%)
    const warningKey = quotaWarning ? `${quotaWarning.level}-${quotaWarning.message.slice(0, 20)}` : null;
    const [lastWarningKey, setLastWarningKey] = useState<string | null>(null);
    if (warningKey !== lastWarningKey) {
        setLastWarningKey(warningKey);
        if (warningKey) setWarningDismissed(false);
    }

    const [interimSpeech, setInterimSpeech] = useState('');

    // Auto-dismiss agent warnings (e.g. truncation, loop, budget) after 6 seconds
    useEffect(() => {
        if (!agentWarnings || agentWarnings.length === 0 || !onDismissWarning) return;
        const now = Date.now();
        const timers = agentWarnings.map((warning) => {
            const age = now - (warning.at || now);
            const delay = Math.max(500, 6000 - age);
            return setTimeout(() => {
                onDismissWarning(warning.id);
            }, delay);
        });
        return () => {
            timers.forEach(clearTimeout);
        };
    }, [agentWarnings, onDismissWarning]);

    // Auto-dismiss quota warning after 8 seconds
    useEffect(() => {
        if (!quotaWarning || warningDismissed) return;
        const timer = setTimeout(() => {
            setWarningDismissed(true);
        }, 8000);
        return () => clearTimeout(timer);
    }, [quotaWarning, warningDismissed]);

    const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        // 1. If clipboard contains native files (e.g. copied images/screenshots, files from desktop)
        const files = e.clipboardData?.files ? Array.from(e.clipboardData.files) : [];
        if (files.length > 0 && onFilesAdd) {
            e.preventDefault();
            onFilesAdd(files);
            toast.success(`Attached ${files.length} file${files.length > 1 ? 's' : ''} from clipboard`);
            return;
        }

        // 2. Check text content
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
            return;
        }
    }, [onFilesAdd]);

    const handleTranscript = (text: string, isFinal: boolean) => {
        if (isFinal) {
            setInterimSpeech('');
            onTranscript(text);
        } else {
            setInterimSpeech(text);
        }
    };

    // Shared Warning and Notification Banners
    const banners = (
        <>
            {/* Quota exhaustion banner — amber, disables input */}
            {quotaError && (
                <div className="flex items-start gap-2 mb-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl px-3 py-2.5 text-xs text-amber-800 dark:text-amber-200">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
                    <span className="flex-1 leading-relaxed">{quotaError}</span>
                    {onOpenPlans && (
                        <button
                            onClick={onOpenPlans}
                            className="shrink-0 font-medium underline underline-offset-2 hover:text-amber-600 dark:hover:text-amber-100 transition-colors whitespace-nowrap"
                        >
                            View plans
                        </button>
                    )}
                </div>
            )}
            {/* Quota warning banner — yellow (75%) or orange (90%), dismissible */}
            {!quotaError && quotaWarning && !warningDismissed && (
                <div className={`flex items-start gap-2 mb-2 rounded-xl px-3 py-2 text-xs border ${
                    quotaWarning.level === 'critical'
                        ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/50 text-orange-800 dark:text-orange-200'
                        : 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800/40 text-yellow-800 dark:text-yellow-200'
                }`}>
                    <AlertTriangle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                        quotaWarning.level === 'critical' ? 'text-orange-500' : 'text-yellow-500'
                    }`} />
                    <span className="flex-1 leading-relaxed">{quotaWarning.message}</span>
                    {onOpenPlans && (
                        <button
                            onClick={onOpenPlans}
                            className="shrink-0 font-medium underline underline-offset-2 opacity-70 hover:opacity-100 transition-opacity whitespace-nowrap"
                        >
                            Upgrade
                        </button>
                    )}
                    <ActionTooltip label="Dismiss warning" side="top">
                        <button
                            onClick={() => setWarningDismissed(true)}
                            className="shrink-0 ml-0.5 opacity-40 hover:opacity-80 transition-opacity cursor-pointer"
                            aria-label="Dismiss warning"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    </ActionTooltip>
                </div>
            )}
            {/* Upload error banner — transient, auto-dismisses */}
            {uploadError && (
                <div className="flex items-start gap-2 mb-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-xl px-3 py-2 text-xs text-red-800 dark:text-red-200">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-500" />
                    <span className="flex-1 leading-relaxed">{uploadError}</span>
                </div>
            )}
            {/* Agent warnings (e.g. oscillation, circuit breaker, quota) */}
            {agentWarnings && agentWarnings.length > 0 && (
                <div className="space-y-1.5 mb-2">
                    {agentWarnings.map((warning) => {
                        const isCritical = warning.kind === 'circuit_breaker' || warning.code === 'circuit_breaker' || warning.kind === 'budget_exhausted';
                        const isOscillation = warning.kind === 'oscillation' || warning.code === 'oscillation' || warning.code === 'loop_oscillation';
                        return (
                            <div
                                key={warning.id}
                                className={cn(
                                    'flex items-start gap-2 rounded-xl px-3 py-2 text-xs border transition-all duration-200 animate-in fade-in-50 slide-in-from-bottom-1',
                                    isCritical
                                        ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/50 text-red-800 dark:text-red-200'
                                        : isOscillation
                                        ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50 text-amber-800 dark:text-amber-200'
                                        : 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800/40 text-yellow-800 dark:text-yellow-200'
                                )}
                            >
                                <AlertTriangle className={cn('w-3.5 h-3.5 shrink-0 mt-0.5', isCritical ? 'text-red-500' : 'text-amber-500')} />
                                <span className="flex-1 leading-relaxed">{warning.message}</span>
                                {onDismissWarning && (
                                    <ActionTooltip label="Dismiss warning" side="top">
                                        <button
                                            onClick={() => onDismissWarning(warning.id)}
                                            className="shrink-0 ml-0.5 opacity-40 hover:opacity-80 transition-opacity cursor-pointer"
                                            aria-label="Dismiss warning"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </ActionTooltip>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </>
    );

    // ─────────────────────────────────────────────────────────────────────────────
    // EMPTY STATE: Spacious Card Centered Layout
    // ─────────────────────────────────────────────────────────────────────────────
    if (isEmptyState) {
        return (
            <div className="w-full relative">
                {banners}
                <div className="relative flex flex-col w-full bg-background border border-border/80 rounded-2xl shadow-sm focus-within:border-border/90 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
                    {/* Attached files chips */}
                    {attachedFiles.length > 0 && (
                        <div className="flex flex-wrap gap-2 px-3.5 pt-3 pb-1">
                            {attachedFiles.map((file, i) => (
                                <AttachmentChip key={i} file={file} onRemove={() => onRemoveFile(i)} />
                            ))}
                        </div>
                    )}

                    {/* Textarea with mention overlay */}
                    <div className="relative w-full">
                        <MentionOverlay
                            text={input}
                            interimSpeech={interimSpeech}
                            availableTables={availableTables}
                            scrollTop={scrollTop}
                            connectionId={connectionId ?? null}
                            isCompact={false}
                        />
                        <textarea
                            ref={textareaRef}
                            id="ai-chat-textarea"
                            value={input}
                            onChange={onInput}
                            onKeyDown={onKeyDown}
                            onScroll={onScroll}
                            onPaste={handlePaste}
                            placeholder={quotaError ? 'Credit limit reached — upgrade to continue' : 'Ask about your data… (use @ to reference tables)'}
                            className="w-full min-h-[34px] sm:min-h-[38px] max-h-[160px] resize-none border-0 focus-visible:outline-none focus:ring-0 px-3.5 pt-2.5 pb-1 bg-transparent text-transparent text-[14px] sm:text-[14.5px] leading-[22px] font-sans antialiased font-normal shadow-none placeholder:text-muted-foreground/70 caret-foreground break-words scrollbar-none [&::-webkit-scrollbar]:hidden selection:bg-blue-500/30 selection:text-transparent"
                            rows={1}
                        />
                    </div>

                    {/* Action buttons toolbar */}
                    <div className="flex items-center justify-between px-2 pb-2 pt-0.5 gap-2">
                        {/* Left action buttons */}
                        <div className="flex items-center gap-0.5">
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={onFileSelect}
                                className="hidden"
                                multiple
                                accept=".pdf,.docx,.xlsx,.xls,.csv,.tsv,.pptx,.txt,.md,.json,.sql,.py,.ts,.js,.tsx,.jsx,.yaml,.yml,.xml,.html,.css,.sh,.env,.log,.toml,.rs,.go,.java,.png,.jpg,.jpeg,.webp,.svg,.gif"
                            />
                            <ActionTooltip label="Attach files" side="top">
                                <button
                                    type="button"
                                    className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                    onClick={() => fileInputRef.current?.click()}
                                    aria-label="Attach files"
                                >
                                    <Plus className="w-4 h-4" />
                                </button>
                            </ActionTooltip>
                            {connectionId && (
                                <ActionTooltip label="Mention table" shortcut="@" side="top">
                                    <button
                                        type="button"
                                        className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                        onClick={onMentionTrigger}
                                        aria-label="Mention table"
                                    >
                                        <AtSign className="w-4 h-4" />
                                    </button>
                                </ActionTooltip>
                            )}
                            {dashboardCount > 0 && (
                                <ActionTooltip label="Dashboard insights" side="top">
                                    <button
                                        type="button"
                                        className={cn('h-8 flex items-center gap-1 px-2 rounded-lg transition-colors text-xs cursor-pointer',
                                            showDashboard ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground')}
                                        onClick={onToggleDashboard}
                                        aria-label="Dashboard insights"
                                    >
                                        <LayoutDashboard className="w-3.5 h-3.5" />
                                        <span className="tabular-nums">{dashboardCount}</span>
                                    </button>
                                </ActionTooltip>
                            )}
                            {onToggleWorkspace && (
                                <ActionTooltip label="Workspace artifacts" side="top">
                                    <button
                                        type="button"
                                        className={cn('h-8 flex items-center gap-1 px-2 rounded-lg transition-colors text-xs cursor-pointer',
                                            showWorkspace ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground')}
                                        onClick={onToggleWorkspace}
                                        aria-label="Workspace artifacts"
                                    >
                                        <FolderOpen className="w-3.5 h-3.5" />
                                    </button>
                                </ActionTooltip>
                            )}
                        </div>

                        {/* Right action buttons */}
                        <div className="flex items-center gap-1">
                            {agentMode && (
                                <div className="mr-1">
                                    <ModeSelector mode={mode} thinking={thinking} onModeChange={onModeChange} onThinkingChange={onThinkingChange} disabled={isStreaming} />
                                </div>
                            )}
                            {!isStreaming && (
                                <>
                                    <MicButton onTranscript={handleTranscript} disabled={isStreaming} />
                                    <VoicePanel
                                        connectionId={connectionId}
                                        isActive={isVoiceActive}
                                        isConnecting={isVoiceConnecting}
                                        isTalking={isVoiceTalking}
                                        onToggle={onToggleVoice}
                                    />
                                </>
                            )}
                            {isStreaming ? (
                                <ActionTooltip label="Stop Generating" shortcut="Esc" side="top">
                                    <button
                                        type="button"
                                        onClick={onAbort}
                                        className="h-8 w-8 flex items-center justify-center rounded-lg bg-muted hover:bg-muted/80 text-foreground transition-colors cursor-pointer"
                                        aria-label="Stop generation"
                                    >
                                        <Square className="w-3.5 h-3.5 fill-current" />
                                    </button>
                                </ActionTooltip>
                            ) : isUploading ? (
                                <button
                                    type="button"
                                    disabled
                                    className="h-8 w-8 flex items-center justify-center rounded-lg bg-muted text-muted-foreground cursor-wait"
                                    aria-label="Uploading files"
                                >
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                </button>
                            ) : (
                                <ActionTooltip label="Send Message" shortcut="Enter" side="top">
                                    <button
                                        type="button"
                                        onClick={onSend}
                                        disabled={(!input.trim() && attachedFiles.length === 0) || !!quotaError}
                                        className={cn('h-8 w-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer',
                                            (input.trim() || attachedFiles.length > 0) && !quotaError
                                                ? 'bg-foreground text-background hover:bg-foreground/90 shadow-sm'
                                                : 'text-muted-foreground/40 cursor-default')}
                                        aria-label="Send message"
                                    >
                                        <Send className="w-3.5 h-3.5" />
                                    </button>
                                </ActionTooltip>
                            )}
                        </div>
                    </div>

                    {/* Mention picker */}
                    {mentionQuery !== null && (
                        <MentionPicker
                            query={mentionQuery}
                            tables={availableTables}
                            dbName={dbName}
                            onSelect={onMentionSelect}
                            onClose={onMentionClose}
                        />
                    )}
                </div>

                {/* Empty State Footer Disclaimer */}
                <p className="text-center text-[11px] text-muted-foreground/75 mt-3 select-none">
                    Resona AI is AI and can make mistakes. Please double-check cited sources.{" "}
                    <a
                        href="https://docs.schemaweaver.dev"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2 hover:text-foreground transition-colors font-medium ml-0.5"
                    >
                        Docs
                    </a>
                </p>
            </div>
        );
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // ACTIVE STATE: Sleek Compact Bottom Pill Bar (Image 2 Claude Style)
    // ─────────────────────────────────────────────────────────────────────────────
    return (
        <div className={cn(
            isDockedInOverlay
                ? 'w-full relative mt-1'
                : 'absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background/98 to-transparent pt-3 pb-3 px-4 z-20'
        )}>
            <div className={cn(isDockedInOverlay ? 'w-full relative' : 'max-w-3xl mx-auto relative')}>
                {banners}

                {/* Active Chat Input Card */}
                <div className="relative flex flex-col w-full bg-background border border-border/80 rounded-2xl shadow-sm focus-within:border-border/90 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
                    {/* Attached files chips */}
                    {attachedFiles.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 px-3.5 pt-2.5 pb-0.5">
                            {attachedFiles.map((file, i) => (
                                <AttachmentChip
                                    key={i}
                                    file={file}
                                    size="sm"
                                    onRemove={() => onRemoveFile(i)}
                                    removeClassName="shadow-none"
                                />
                            ))}
                        </div>
                    )}

                    {/* Textarea with mention overlay */}
                    <div className="relative w-full">
                        <MentionOverlay
                            text={input}
                            interimSpeech={interimSpeech}
                            availableTables={availableTables}
                            scrollTop={scrollTop}
                            connectionId={connectionId ?? null}
                        />
                        <textarea
                            ref={textareaRef}
                            id="ai-chat-textarea"
                            value={input}
                            onChange={onInput}
                            onKeyDown={onKeyDown}
                            onScroll={onScroll}
                            onPaste={handlePaste}
                            placeholder={quotaError ? 'Credit limit reached — upgrade to continue' : 'Reply to Resona AI…'}
                            className="w-full min-h-[26px] max-h-[160px] resize-none border-0 focus-visible:outline-none focus:ring-0 px-3.5 pt-2.5 pb-1 bg-transparent text-transparent text-[14px] sm:text-[14.5px] leading-[22px] font-sans antialiased font-normal shadow-none placeholder:text-muted-foreground/70 caret-foreground break-words scrollbar-none [&::-webkit-scrollbar]:hidden selection:bg-blue-500/30 selection:text-transparent"
                            rows={1}
                        />
                    </div>

                    {/* Action buttons toolbar */}
                    <div className="flex items-center justify-between px-2 pb-2 pt-0.5 gap-2">
                        {/* Left Action Buttons */}
                        <div className="flex items-center gap-0.5">
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={onFileSelect}
                                className="hidden"
                                multiple
                                accept=".pdf,.docx,.xlsx,.xls,.csv,.tsv,.pptx,.txt,.md,.json,.sql,.py,.ts,.js,.tsx,.jsx,.yaml,.yml,.xml,.html,.css,.sh,.env,.log,.toml,.rs,.go,.java,.png,.jpg,.jpeg,.webp,.svg,.gif"
                            />
                            <ActionTooltip label="Attach files" side="top">
                                <button
                                    type="button"
                                    className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                    onClick={() => fileInputRef.current?.click()}
                                    aria-label="Attach files"
                                >
                                    <Plus className="w-4 h-4" />
                                </button>
                            </ActionTooltip>
                            {connectionId && (
                                <ActionTooltip label="Mention table" shortcut="@" side="top">
                                    <button
                                        type="button"
                                        className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                        onClick={onMentionTrigger}
                                        aria-label="Mention table"
                                    >
                                        <AtSign className="w-3.5 h-3.5" />
                                    </button>
                                </ActionTooltip>
                            )}
                            {dashboardCount > 0 && (
                                <ActionTooltip label="Dashboard insights" side="top">
                                    <button
                                        type="button"
                                        className={cn('h-8 flex items-center gap-1 px-2 rounded-lg transition-colors text-xs cursor-pointer',
                                            showDashboard ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground')}
                                        onClick={onToggleDashboard}
                                        aria-label="Dashboard insights"
                                    >
                                        <LayoutDashboard className="w-3.5 h-3.5" />
                                        <span className="tabular-nums text-[11px]">{dashboardCount}</span>
                                    </button>
                                </ActionTooltip>
                            )}
                            {onToggleWorkspace && (
                                <ActionTooltip label="Workspace artifacts" side="top">
                                    <button
                                        type="button"
                                        className={cn('h-8 flex items-center gap-1 px-2 rounded-lg transition-colors text-xs cursor-pointer',
                                            showWorkspace ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground')}
                                        onClick={onToggleWorkspace}
                                        aria-label="Workspace artifacts"
                                    >
                                        <FolderOpen className="w-3.5 h-3.5" />
                                    </button>
                                </ActionTooltip>
                            )}
                        </div>

                        {/* Right Action Buttons */}
                        <div className="flex items-center gap-1">
                            {agentMode && (
                                <div className="mr-0.5 scale-95 origin-right">
                                    <ModeSelector mode={mode} thinking={thinking} onModeChange={onModeChange} onThinkingChange={onThinkingChange} disabled={isStreaming} />
                                </div>
                            )}
                            {!isStreaming && (
                                <>
                                    <MicButton onTranscript={handleTranscript} disabled={isStreaming} />
                                    <VoicePanel
                                        connectionId={connectionId}
                                        isActive={isVoiceActive}
                                        isConnecting={isVoiceConnecting}
                                        isTalking={isVoiceTalking}
                                        onToggle={onToggleVoice}
                                    />
                                </>
                            )}
                            {isStreaming ? (
                                <ActionTooltip label="Stop Generating" shortcut="Esc" side="top">
                                    <button
                                        type="button"
                                        onClick={onAbort}
                                        className="h-8 w-8 flex items-center justify-center rounded-lg bg-muted hover:bg-muted/80 text-foreground transition-colors cursor-pointer"
                                        aria-label="Stop generation"
                                    >
                                        <Square className="w-3.5 h-3.5 fill-current" />
                                    </button>
                                </ActionTooltip>
                            ) : isUploading ? (
                                <button
                                    type="button"
                                    disabled
                                    className="h-8 w-8 flex items-center justify-center rounded-lg bg-muted text-muted-foreground cursor-wait"
                                    aria-label="Uploading files"
                                >
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                </button>
                            ) : (
                                <ActionTooltip label="Send Message" shortcut="Enter" side="top">
                                    <button
                                        type="button"
                                        onClick={onSend}
                                        disabled={(!input.trim() && attachedFiles.length === 0) || !!quotaError}
                                        className={cn('h-8 w-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer',
                                            (input.trim() || attachedFiles.length > 0) && !quotaError
                                                ? 'bg-foreground text-background hover:bg-foreground/90 shadow-sm'
                                                : 'text-muted-foreground/40 cursor-default')}
                                        aria-label="Send message"
                                    >
                                        <Send className="w-3.5 h-3.5" />
                                    </button>
                                </ActionTooltip>
                            )}
                        </div>
                    </div>

                    {/* Mention picker */}
                    {mentionQuery !== null && (
                        <MentionPicker
                            query={mentionQuery}
                            tables={availableTables}
                            dbName={dbName}
                            onSelect={onMentionSelect}
                            onClose={onMentionClose}
                        />
                    )}
                </div>

                {/* Footer disclaimer & ContextWindowBar (Claude Style) */}
                <div className="flex items-center justify-between gap-2 mt-1.5 px-1.5 min-h-[18px] text-[11px] text-muted-foreground select-none">
                    <p className="text-[11px] text-muted-foreground/70 leading-tight">
                        Resona AI can make mistakes. Check sources.{" "}
                        <a
                            href="https://docs.schemaweaver.dev"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline underline-offset-2 hover:text-foreground transition-colors font-medium ml-0.5"
                        >
                            Docs
                        </a>
                    </p>
                    <div className="flex items-center shrink-0 min-w-0 ml-auto">
                        {agentMode && (
                            <ContextWindowBar
                                contextMeta={contextMeta ?? null}
                                localMessageCount={localMessageCount}
                                tokenCount={tokenCount}
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
