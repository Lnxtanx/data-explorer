import { useState } from 'react';
import { Plus, Send, Database, LayoutDashboard, FolderOpen, AtSign, X, FileText, Square, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTableSchema, useTableRowsSimple } from '@/lib/api/data/explorer';
import { MentionPicker } from '../input/MentionPicker';
import { MicButton } from '../MicButton';
import { ModelPicker } from '../models/ModelPicker';

import { TablePreview } from '../messages/TablePreview';

// ─── Mention Overlay ──────────────────────────────────────────────────────────

function MentionOverlay({ text, interimSpeech, availableTables, className, style, scrollTop, connectionId }: {
    text: string; interimSpeech?: string; availableTables: string[]; className?: string; style?: React.CSSProperties; scrollTop: number; connectionId: string | null;
}) {
    const parts = text.split(/(@\w+)/g);
    return (
        <div className="absolute inset-0 pointer-events-none select-none overflow-hidden z-[5] rounded-xl">
            <div
                className={cn(
                    'w-full min-h-full py-3.5 pr-[180px] text-[15px] leading-[24px] font-sans antialiased whitespace-pre-wrap break-words text-foreground',
                    className,
                )}
                style={{ ...style, transform: `translateY(-${scrollTop}px)` }}
            >
                {parts.map((part, i) => {
                    const tableName = part.startsWith('@') ? part.slice(1) : null;
                    if (tableName && availableTables.includes(tableName)) {
                        return (
                            <HoverCard key={i} openDelay={200} closeDelay={100}>
                                <HoverCardTrigger asChild>
                                    <span className="inline relative pointer-events-auto bg-blue-500/15 text-blue-600 dark:text-blue-400 font-normal rounded-sm ring-[1px] ring-blue-500/20 cursor-help transition-all duration-200">
                                        {part}
                                    </span>
                                </HoverCardTrigger>
                                <HoverCardContent
                                    className="w-[320px] p-4 bg-background/95 backdrop-blur-md border-border/60 shadow-2xl z-[100] rounded-xl"
                                    align="start" side="top" sideOffset={12}
                                >
                                    {connectionId ? (
                                        <TablePreview tableName={tableName} connectionId={connectionId} />
                                    ) : (
                                        <div className="text-xs text-muted-foreground p-2 text-center">
                                            <Database className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                            <p>Select a database to see table preview</p>
                                        </div>
                                    )}
                                </HoverCardContent>
                            </HoverCard>
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
    selectedModel: string;
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    onInput: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    onScroll: (e: React.UIEvent<HTMLTextAreaElement>) => void;
    onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    onSend: () => void;
    onAbort: () => void;
    onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onRemoveFile: (index: number) => void;
    onMentionSelect: (table: string) => void;
    onMentionClose: () => void;
    onMentionTrigger: () => void;
    onModelChange: (id: string) => void;
    onToggleDashboard: () => void;
    onToggleWorkspace?: () => void;
    showWorkspace?: boolean;
    onTranscript: (text: string) => void;
    quotaError?: string | null;
    quotaWarning?: { level: 'warning' | 'critical'; message: string } | null;
    onOpenPlans?: () => void;
}

export function ChatInput({
    input, scrollTop, attachedFiles, mentionQuery, availableTables, isStreaming,
    agentMode, connectionId, dbName, dashboardCount, showDashboard, selectedModel,
    textareaRef, fileInputRef,
    onInput, onScroll, onKeyDown, onSend, onAbort, onFileSelect, onRemoveFile,
    onMentionSelect, onMentionClose, onMentionTrigger, onModelChange,
    onToggleDashboard, onToggleWorkspace, showWorkspace, onTranscript,
    quotaError, quotaWarning, onOpenPlans,
}: ChatInputProps) {
    let leftPadOffset = 44;
    if (connectionId) leftPadOffset += 34;
    if (dashboardCount > 0) leftPadOffset += 46;
    if (onToggleWorkspace) leftPadOffset += 34;

    const [warningDismissed, setWarningDismissed] = useState(false);
    // Auto-undismiss when the warning level changes (e.g. goes from 75% to 90%)
    const warningKey = quotaWarning ? `${quotaWarning.level}-${quotaWarning.message.slice(0, 20)}` : null;
    const [lastWarningKey, setLastWarningKey] = useState<string | null>(null);
    if (warningKey !== lastWarningKey) {
        setLastWarningKey(warningKey);
        if (warningKey) setWarningDismissed(false);
    }

    const [interimSpeech, setInterimSpeech] = useState('');

    const handleTranscript = (text: string, isFinal: boolean) => {
        if (isFinal) {
            setInterimSpeech('');
            onTranscript(text);
        } else {
            setInterimSpeech(text);
        }
    };

    return (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background/98 to-transparent pt-4 pb-4 px-4">
            <div className="max-w-3xl mx-auto relative">
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
                        <button
                            onClick={() => setWarningDismissed(true)}
                            className="shrink-0 ml-0.5 opacity-40 hover:opacity-80 transition-opacity"
                            title="Dismiss"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    </div>
                )}
                <div className="relative flex flex-col w-full bg-background border border-border rounded-xl shadow-sm focus-within:border-border/70 transition-colors">

                    {/* Attached files */}
                    {attachedFiles.length > 0 && (
                        <div className="flex flex-wrap gap-2 px-3 pt-3 pb-1">
                            {attachedFiles.map((file, i) => (
                                <div key={i} className="flex items-center gap-2 bg-muted/50 border border-border/50 rounded-lg pl-2 pr-1 py-1 text-xs">
                                    <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                                    <span className="truncate max-w-[100px] font-medium">{file.name}</span>
                                    <button
                                        className="h-4 w-4 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground"
                                        onClick={() => onRemoveFile(i)}
                                    >
                                        <X className="w-2.5 h-2.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Textarea row */}
                    <div className="relative flex items-end w-full">
                        {/* Left action buttons */}
                        <div className="absolute left-2 bottom-[14px] z-10 flex items-center gap-0.5">
                            <input type="file" ref={fileInputRef} onChange={onFileSelect} className="hidden" multiple />
                            <button
                                className="h-8 w-8 flex items-center justify-center rounded-lg bg-muted/50 hover:bg-muted text-muted-foreground transition-colors"
                                onClick={() => fileInputRef.current?.click()}
                                title="Attach file"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                            {connectionId && (
                                <button
                                    className="h-8 w-8 flex items-center justify-center rounded-lg bg-muted/50 hover:bg-muted text-muted-foreground transition-colors"
                                    onClick={onMentionTrigger}
                                    title="Mention Table"
                                >
                                    <AtSign className="w-4 h-4" />
                                </button>
                            )}
                            {dashboardCount > 0 && (
                                <button
                                    className={cn('h-8 flex items-center gap-1 px-2 rounded-lg transition-colors text-xs',
                                        showDashboard ? 'text-primary bg-primary/10' : 'text-muted-foreground/40 hover:text-muted-foreground')}
                                    onClick={onToggleDashboard}
                                >
                                    <LayoutDashboard className="w-3.5 h-3.5" />
                                    <span className="tabular-nums">{dashboardCount}</span>
                                </button>
                            )}
                            {onToggleWorkspace && (
                                <button
                                    className={cn('h-8 flex items-center gap-1 px-2 rounded-lg transition-colors text-xs',
                                        showWorkspace ? 'text-primary bg-primary/10' : 'text-muted-foreground/40 hover:text-muted-foreground')}
                                    onClick={onToggleWorkspace}
                                    title="Workspace"
                                >
                                    <FolderOpen className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>

                        {/* Textarea with mention overlay */}
                        <div className="relative w-full min-h-[52px] rounded-xl border border-border/40 bg-muted/20 focus-within:border-primary/30 transition-all duration-200">
                            <MentionOverlay
                                text={input}
                                interimSpeech={interimSpeech}
                                availableTables={availableTables}
                                scrollTop={scrollTop}
                                style={{ paddingLeft: leftPadOffset }}
                                connectionId={connectionId ?? null}
                            />
                            <textarea
                                ref={textareaRef}
                                id="ai-chat-textarea"
                                value={input}
                                onChange={onInput}
                                onKeyDown={onKeyDown}
                                onScroll={onScroll}
                                placeholder={quotaError ? 'Credit limit reached — upgrade to continue' : 'Ask about your data… (use @ to reference tables)'}
                                className="w-full min-h-[52px] resize-none border-0 focus-visible:outline-none focus:ring-0 py-3.5 pr-[180px] bg-transparent text-transparent text-[15px] leading-[24px] font-sans antialiased font-normal shadow-none placeholder:text-muted-foreground/35 caret-foreground break-words scrollbar-none [&::-webkit-scrollbar]:hidden selection:bg-blue-500/30 selection:text-transparent"
                                rows={1}
                                style={{ paddingLeft: leftPadOffset }}
                            />
                        </div>

                        {/* Right action buttons */}
                        <div className="absolute right-2 bottom-[14px] z-10 flex items-center gap-1">
                            {agentMode && (
                                <div className="mr-1">
                                    <ModelPicker value={selectedModel} onChange={onModelChange} />
                                </div>
                            )}
                            {!isStreaming && <MicButton onTranscript={handleTranscript} disabled={isStreaming} />}
                            {isStreaming ? (
                                <button
                                    onClick={onAbort}
                                    className="h-8 w-8 flex items-center justify-center rounded-lg bg-muted hover:bg-muted/80 text-foreground transition-colors"
                                >
                                    <Square className="w-3.5 h-3.5 fill-current" />
                                </button>
                            ) : (
                                <button
                                    onClick={onSend}
                                    disabled={(!input.trim() && attachedFiles.length === 0) || !!quotaError}
                                    className={cn('h-8 w-8 flex items-center justify-center rounded-lg transition-colors',
                                        (input.trim() || attachedFiles.length > 0) && !quotaError
                                            ? 'bg-foreground text-background hover:bg-foreground/90'
                                            : 'text-muted-foreground/30 cursor-default')}
                                >
                                    <Send className="w-3.5 h-3.5" />
                                </button>
                            )}
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

                    </div>

                <p className="text-center mt-2 text-[11px] text-muted-foreground/40">
                    Resona AI can make mistakes. Verify important results.
                </p>
            </div>
        </div>
    );
}
