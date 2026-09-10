import { useState, useRef, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, FolderKanban, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAIStream } from '@/hooks/useAIStream';
import { useAIAgent } from '@/hooks/useAIAgent';
import { useAIChatMessages } from '@/hooks/useAIChats';
import { useProjects } from '@/hooks/useProjects';
import { useTableList } from '@/lib/api/data/explorer';
import { useConnections } from '@/lib/api/data/connection';
import { useDatasetCache } from '@/hooks/useDatasetCache';
import { useAIUsage, getProactiveQuotaError, getQuotaWarning } from '@/hooks/useAIUsage';
import { ArtifactPanel } from './artifacts/ArtifactPanel';
import { DashboardPanel } from './artifacts/DashboardPanel';
import { WorkspacePanel } from './artifacts/WorkspacePanel';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { ChatMessage } from './chat/ChatMessage';
import { ChatInput } from './chat/ChatInput';
import type { AgentMode } from './models/ModeSelector';
import type { AgentArtifact, AgentToolStep } from '@/hooks/useAIAgent';
import { uploadFilesForAI, getChatMessages, type AIMessage } from '@/lib/api/ai';
import type { LocalMessage } from './chat/types';
import { logger } from '@/lib/logger';

// ─── Props ────────────────────────────────────────────────────────────────────

interface AIChatMainProps {
    connectionId?: string;
    chatId?: string | null;
    projectId?: string | null;
    onChatCreated?: (chatId: string) => void;
    onProjectClick?: (projectId: string) => void;
    aiContextTable?: string | null;
    aiContextSchema?: string;
    onTableClick?: (tableName: string) => void;
    onOpenPlans?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB — must match backend
const MAX_FILE_COUNT = 10;
const ALLOWED_FILE_EXTENSIONS = new Set([
    '.pdf', '.docx', '.xlsx', '.xls', '.csv', '.tsv', '.pptx',
    '.txt', '.md', '.json', '.sql', '.py', '.ts', '.js', '.tsx', '.jsx',
    '.yaml', '.yml', '.xml', '.html', '.css', '.sh', '.env', '.log',
    '.toml', '.rs', '.go', '.java', '.dockerfile',
]);

function validateFiles(files: File[]): { valid: File[]; errors: string[] } {
    const valid: File[] = [];
    const errors: string[] = [];
    for (const f of files) {
        const ext = '.' + f.name.split('.').pop()?.toLowerCase();
        if (!ALLOWED_FILE_EXTENSIONS.has(ext)) {
            errors.push(`${f.name}: unsupported file type (${ext})`);
            continue;
        }
        if (f.size > MAX_FILE_SIZE_BYTES) {
            errors.push(`${f.name}: exceeds 25 MB limit (${(f.size / 1024 / 1024).toFixed(1)} MB)`);
            continue;
        }
        valid.push(f);
    }
    return { valid, errors };
}

const colorClass: Record<string, string> = {
    slate: 'bg-slate-500', blue: 'bg-blue-500', indigo: 'bg-indigo-500',
    violet: 'bg-violet-500', rose: 'bg-rose-500', orange: 'bg-orange-500', emerald: 'bg-emerald-500',
};

/** Strip model-generated XML wrapper tags that some LLMs add to their output. */
function stripXmlTags(text: string): string {
    if (!text) return text;
    const responseMatch = text.match(/<response>([\s\S]*?)<\/response>/);
    if (responseMatch) return responseMatch[1].trim();
    return text
        .replace(/<thinking>[\s\S]*?<\/thinking>/g, '')
        .replace(/<\/?(thinking|response|answer)>/g, '')
        .trim();
}

function hasArtifactData(a: NonNullable<AIMessage['artifacts']>[number]): boolean {
    if (!a.type) return !!(a.rows && a.columns);
    switch (a.type) {
        case 'table':
        case 'sample':
        case 'search':   return !!(a.rows && a.columns);
        case 'stats':
        case 'stat_block': return !!((a as any).stats || (a as any).stat_block || a.summary || (a as any).columnStats);
        case 'diagram':  return !!a.mermaid;
        case 'file':     return !!((a as any).download_url || (a as any).downloadUrl || (a as any).url || (a as any).filename);
        case 'chart':    return true;
        case 'query':    return !!(a.sql || (a.rows && a.columns));
        case 'report':   return !!((a as any).sections || (a as any).insights);
        case 'suggestions': return !!((a as any).suggestions);
        case 'analysis_plan': return !!((a as any).planStepsData || (a as any).plan_steps);
        case 'slide_deck': return !!((a as any).content);
        case 'clarification': return !!((a as any).question || (a as any).options);
        case 'tool_call': return false; // Handled separately in toolSteps
        case 'thinking': return false; // Handled separately in toolSteps
        default:         return !!(a.rows && a.columns);
    }
}

function toLocal(m: AIMessage, index?: number, allMessages?: AIMessage[]): LocalMessage {
    const rawArtifacts = m.artifacts ?? [];
    const artifacts: AgentArtifact[] = rawArtifacts
        .filter(hasArtifactData)
        .map(a => ({
            type: a.type ?? 'table',
            downloadUrl: (a as any).download_url || (a as any).downloadUrl || (a as any).url,
            filename: (a as any).filename,
            fileSize: (a as any).file_size || (a as any).size_bytes || (a as any).fileSize,
            rowCount: (a as any).row_count ?? (a as any).rowCount,
            question: (a as any).question,
            options: (a as any).options,
            ...a,
        } as AgentArtifact));

    // If an assistant message has a clarification artifact, check if it was answered in history
    if (m.role === 'assistant' && allMessages && index !== undefined) {
        const clarIdx = artifacts.findIndex(a => a.type === 'clarification');
        if (clarIdx !== -1) {
            const nextUserMsg = allMessages.slice(index + 1).find(msg => msg.role === 'user');
            if (nextUserMsg && nextUserMsg.content) {
                artifacts[clarIdx] = {
                    ...artifacts[clarIdx],
                    answered: true,
                    answer: nextUserMsg.content,
                };
            }
        }
    }

    // Restore tool steps from execution_trace if available, or fall back to tool_call artifacts
    const rawSteps = (m as any).execution_trace?.toolSteps ?? [];
    let toolSteps: AgentToolStep[] | undefined = undefined;

    if (rawSteps.length > 0) {
        toolSteps = rawSteps.map((s: any) => ({
            id: s.id,
            name: s.name,
            input: s.input ?? {},
            status: s.status === 'done' ? 'done' as const : s.status === 'error' ? 'error' as const : 'calling' as const,
            result: s.result,
            latencyMs: s.latency_ms ?? s.latencyMs,
            startedAt: s.startedAt,
            downloadUrl: s.downloadUrl ?? s.download_url,
            filename: s.filename,
        }));
    } else {
        const toolArtifacts = rawArtifacts.filter(a => (a as any).type === 'tool_call');
        if (toolArtifacts.length > 0) {
            toolSteps = toolArtifacts.map((a: any, idx: number) => ({
                id: a.id || `step-${idx}`,
                name: a.tool || a.name || 'tool',
                input: a.input ?? {},
                status: (a.status === 'error' ? 'error' : 'done') as 'calling' | 'done' | 'error',
                result: a.result || (a.summary ? { success: true, summary: a.summary } : undefined),
                latencyMs: a.latency_ms ?? a.latencyMs,
                downloadUrl: a.download_url ?? a.downloadUrl,
                filename: a.filename,
            }));
        }
    }

    // Check if there is a thinking artifact and prepend as a thinking step if not already present
    const thinkingArtifact = rawArtifacts.find(a => (a as any).type === 'thinking');
    if (thinkingArtifact && (thinkingArtifact as any).text) {
        const thinkingText = (thinkingArtifact as any).text;
        const thinkingStep: AgentToolStep = {
            id: 'thinking-rehydrated',
            name: 'thinking',
            type: 'thinking',
            label: 'Thinking Process',
            input: {},
            status: 'done',
            result: { success: true, summary: thinkingText },
        };
        toolSteps = [thinkingStep, ...(toolSteps ?? [])];
    }

    return {
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        sql: m.artifacts?.[0]?.sql ?? undefined,
        artifacts: artifacts.length > 0 ? artifacts : undefined,
        toolSteps,
        tokenCount: m.token_count,
        userId: m.user_id ?? null,
        isMine: m.isMine ?? true,
        authorName: m.authorName ?? null,
        authorEmail: m.authorEmail ?? null,
    };
}

function ChatLoadingSkeleton() {
    return (
        <div className="flex flex-col gap-6 py-4 animate-in fade-in duration-200" aria-label="Loading chat conversation">
            {/* Simulated User Message Skeleton */}
            <div className="flex justify-end">
                <div className="h-10 w-48 sm:w-64 bg-muted/60 rounded-2xl animate-pulse" />
            </div>
            {/* Simulated Assistant Message Skeleton */}
            <div className="flex justify-start">
                <div className="flex flex-col gap-3 w-full max-w-xl">
                    <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-muted/70 animate-pulse" />
                        <div className="h-4 w-28 bg-muted/70 rounded-md animate-pulse" />
                    </div>
                    <div className="space-y-2">
                        <div className="h-4 w-full bg-muted/60 rounded-md animate-pulse" />
                        <div className="h-4 w-5/6 bg-muted/50 rounded-md animate-pulse" />
                        <div className="h-4 w-2/3 bg-muted/50 rounded-md animate-pulse" />
                    </div>
                    {/* Simulated Artifact Box Skeleton */}
                    <div className="h-28 w-full bg-card/60 rounded-xl border border-border/40 p-4 flex flex-col gap-2.5 animate-pulse mt-1">
                        <div className="h-4 w-36 bg-muted/60 rounded" />
                        <div className="h-12 w-full bg-muted/30 rounded" />
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AIChatMain({
    connectionId, chatId, projectId,
    onChatCreated, onProjectClick,
    aiContextTable, aiContextSchema, onTableClick, onOpenPlans,
}: AIChatMainProps) {
    // ── State ────────────────────────────────────────────────────────────────
    const [input, setInput] = useState('');
    const [scrollTop, setScrollTop] = useState(0);
    const [localMessages, setLocalMessages] = useState<LocalMessage[]>([]);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [expandedArtifact, setExpandedArtifact] = useState<AgentArtifact | null>(null);
    const [dashboardArtifacts, setDashboardArtifacts] = useState<AgentArtifact[]>(() => {
        if (!chatId) return [];
        try {
            const raw = localStorage.getItem(`sw_pinned_${chatId}`);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    });

    useEffect(() => {
        if (!chatId) {
            setDashboardArtifacts([]);
            return;
        }
        try {
            const raw = localStorage.getItem(`sw_pinned_${chatId}`);
            setDashboardArtifacts(raw ? JSON.parse(raw) : []);
        } catch {
            setDashboardArtifacts([]);
        }
    }, [chatId]);

    const updateDashboardArtifacts = useCallback((updater: AgentArtifact[] | ((prev: AgentArtifact[]) => AgentArtifact[])) => {
        setDashboardArtifacts(prev => {
            const next = typeof updater === 'function' ? updater(prev) : updater;
            if (chatId) {
                try {
                    localStorage.setItem(`sw_pinned_${chatId}`, JSON.stringify(next));
                } catch (e) {
                    logger.warn('[AIChatMain] Failed to save pinned artifacts:', e);
                }
            }
            return next;
        });
    }, [chatId]);

    const [showDashboard, setShowDashboard] = useState(false);
    const [showWorkspace, setShowWorkspace] = useState(false);
    const [workspaceRefreshCount, setWorkspaceRefreshCount] = useState(0);
    const [dismissedWarnings, setDismissedWarnings] = useState<Record<string, boolean>>({});
    // Pagination state for older messages
    const [hasMoreOlder, setHasMoreOlder] = useState(false);
    const [oldestCursor, setOldestCursor] = useState<string | null>(null);
    const [isLoadingOlder, setIsLoadingOlder] = useState(false);

    // Data Explorer mode + thinking — per-chat, persisted server-side on the
    // chat_sessions row (restored below when reopening a chat). No localStorage.
    const [mode, setMode] = useState<AgentMode>('flash');
    const [thinking, setThinking] = useState(false);

    // ── Refs ─────────────────────────────────────────────────────────────────
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const justCreatedChatRef = useRef(false);
    const prevChatIdRef = useRef<string | null | undefined>(undefined);
    const uploadErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Single auto-dismiss helper for uploadError (#22): any new error clears a
    // pending timer so a stale validation error can't wipe out a later error,
    // and every error path auto-dismisses after UPLOAD_ERROR_DISMISS_MS.
    const showUploadError = useCallback((message: string | null) => {
        if (uploadErrorTimerRef.current) {
            clearTimeout(uploadErrorTimerRef.current);
            uploadErrorTimerRef.current = null;
        }
        setUploadError(message);
        if (message) {
            uploadErrorTimerRef.current = setTimeout(() => {
                setUploadError(null);
                uploadErrorTimerRef.current = null;
            }, 6000);
        }
    }, []);

    // ── Hooks ────────────────────────────────────────────────────────────────
    const queryClient = useQueryClient();
    const { data: tableListData } = useTableList(connectionId ?? null, 'public');
    const availableTables = tableListData?.tables?.map(t => t.name) ?? [];
    const agentMode = !!connectionId;
    const datasetCache = useDatasetCache();

    // Proactive quota state — fetched on mount and refreshed every 60 s
    const { data: usageStatus } = useAIUsage();

    const {
        send: sendStream, abort: abortStream, status: streamStatus,
        streamedText, sqlArtifacts, error: streamError, reset: resetStream, chatId: streamedChatId,
    } = useAIStream();

    const {
        send: sendAgent, abort: abortAgent, status: agentStatus, runId: agentRunId,
        planSteps, toolSteps, artifacts, streamedText: agentText,
        thinkingText: agentThinking, liveThinking: agentLiveThinking, error: agentError, reset: resetAgent, chatId: agentChatId,
        phase, phaseDetail, iterations, tokenCount, creditsUsed, model, contextMeta,
        warnings: agentWarnings,
        pausedRunId,
        resume: resumeAgent,
    } = useAIAgent();

    const { data: chatHistory, isLoading: isChatLoading } = useAIChatMessages(chatId ?? '', { enabled: !!chatId });
    const { data: projects } = useProjects();
    const { data: connections } = useConnections();

    // Check if the current chat history in cache matches the active chatId
    const isChatReady = Boolean(chatId && chatHistory && chatHistory.chat?.id === chatId);
    const isSwitchingChat = Boolean(chatId && chatId !== prevChatIdRef.current && !justCreatedChatRef.current && !isChatReady);

    const activeProjectId = projectId || chatHistory?.chat?.project_id;
    const activeProject = activeProjectId ? projects?.find(p => p.id === activeProjectId) : null;
    const activeConnection = connections?.find(c => c.id === connectionId);
    const dbName = activeConnection?.name;
    // A clarification pause is NOT streaming — the input stays enabled and the
    // next send answers the paused question (resume) instead of starting a new run.
    const isStreaming = agentMode ? agentStatus === 'running' : streamStatus === 'streaming';
    const awaitingClarification = agentMode && agentStatus === 'awaiting_clarification';
    // A paused clarification survives an in-memory state reset: `pausedRunId`
    // is mirrored to session storage when the pause lands, so the "answer" send
    // still routes to `resume()` even if `agentStatus`/`runId` were cleared.
    const hasPausedRun = agentMode && (awaitingClarification || Boolean(agentRunId || pausedRunId));
    const activeError = agentMode ? agentError : streamError;

    // Quota errors — two sources:
    // 1. Proactive: fetched from /api/ai/usage on load (shows banner before first message)
    // 2. Reactive:  set on a failed request (quota_exceeded SSE or 429 JSON)
    const proactiveQuotaError = getProactiveQuotaError(usageStatus);
    const quotaWarning         = getQuotaWarning(usageStatus);

    const QUOTA_KEYWORDS = [
        'credit limit', 'quota', 'limit reached', 'upgrade',
        'quota exceeded', 'token quota',   // from ai-quota.js middleware 429
        'daily limit', 'monthly limit',    // from useAIAgent quota_exceeded handler
    ];
    const reactiveQuotaError = activeError && QUOTA_KEYWORDS.some(k => activeError.toLowerCase().includes(k))
        ? activeError
        : null;

    // Proactive wins for display; reactive is captured as fallback
    const quotaError = proactiveQuotaError ?? reactiveQuotaError;

    // ── Effects ──────────────────────────────────────────────────────────────

    useEffect(() => {
        if (!chatId) {
            prevChatIdRef.current = null;
            setLocalMessages([]);
            setHasMoreOlder(false);
            setOldestCursor(null);
            resetStream(); resetAgent();
            return;
        }
        const isNavigating = chatId !== prevChatIdRef.current && !justCreatedChatRef.current;
        if (isNavigating && chatHistory?.messages && chatHistory.chat?.id === chatId) {
            prevChatIdRef.current = chatId;
            setLocalMessages(chatHistory.messages.filter(m => m.role !== 'system').map((m, idx, arr) => toLocal(m, idx, arr)));
            setHasMoreOlder(Boolean(chatHistory.hasMore));
            setOldestCursor(chatHistory.oldestCursor ?? null);
            resetStream(); resetAgent();
        } else if (justCreatedChatRef.current && chatId) {
            prevChatIdRef.current = chatId;
            justCreatedChatRef.current = false;
        }
    }, [chatId, chatHistory]);

    const handleLoadOlderMessages = useCallback(async () => {
        if (!chatId || !oldestCursor || isLoadingOlder) return;
        setIsLoadingOlder(true);
        try {
            const olderRes = await getChatMessages(chatId, { before: oldestCursor, limit: 30 });
            if (olderRes && olderRes.messages && olderRes.messages.length > 0) {
                const olderLocal = olderRes.messages.filter(m => m.role !== 'system').map((m, idx, arr) => toLocal(m, idx, arr));
                setLocalMessages(prev => [...olderLocal, ...prev]);
                setHasMoreOlder(Boolean(olderRes.hasMore));
                setOldestCursor(olderRes.oldestCursor ?? null);
            } else {
                setHasMoreOlder(false);
            }
        } catch (err) {
            logger.warn('[AIChatMain] Failed to load older messages:', err);
        } finally {
            setIsLoadingOlder(false);
        }
    }, [chatId, oldestCursor, isLoadingOlder]);

    useEffect(() => {
        if (!agentMode && (streamStatus === 'done' || streamStatus === 'aborted' || streamStatus === 'error')) {
            setLocalMessages(prev => {
                const nonStreaming = prev.filter(m => !m.isStreaming);
                if (streamedText) {
                    return [
                        ...nonStreaming,
                        { id: `assistant-${Date.now()}`, role: 'assistant', content: streamedText, sql: sqlArtifacts[0]?.sql },
                    ];
                }
                return nonStreaming;
            });
            if (streamStatus === 'done') {
                queryClient.invalidateQueries({ queryKey: ['ai', 'chats'] });
                queryClient.invalidateQueries({ queryKey: ['ai', 'projects'] });
            }
        }
    }, [streamStatus]);

    useEffect(() => {
        // `done`, `aborted`, `error`, AND `awaiting_clarification` finalize the
        // streaming bubble into a snapshot. A clarification pause snapshots the
        // pre-pause leg (incl. the clarification card) so it stays in the chat
        // while the user answers; the DB/dataset side-effects below run ONLY on
        // real completion (`done`).
        if (agentMode && (agentStatus === 'done' || agentStatus === 'aborted' || agentStatus === 'error' || agentStatus === 'awaiting_clarification')) {
            const hasOutput = Boolean(
                agentText.trim() ||
                artifacts.length > 0 ||
                toolSteps.length > 0 ||
                planSteps.length > 0
            );

            const finalOk = agentStatus === 'done' || agentStatus === 'awaiting_clarification';

            const sanitizedToolSteps = toolSteps.length > 0
                ? toolSteps.map(s => s.status === 'calling'
                    ? {
                        ...s,
                        status: (finalOk ? 'done' : 'error') as 'done' | 'error',
                        result: s.result ?? {
                            success: finalOk,
                            summary: agentStatus === 'aborted' ? 'Stopped by user' : (agentStatus === 'error' ? 'Failed' : 'Completed'),
                        },
                    }
                    : s
                )
                : undefined;

            const sanitizedPlanSteps = planSteps.length > 0
                ? planSteps.map(p => p.status === 'running'
                    ? { ...p, status: (finalOk ? 'done' : 'error') as 'done' | 'error' }
                    : p
                )
                : undefined;

            const finalizedArtifacts = artifacts.filter(a => !a.loading);

            setLocalMessages(prev => {
                const nonStreaming = prev.filter(m => !m.isStreaming);
                if (hasOutput) {
                    return [
                        ...nonStreaming,
                        {
                            id: `assistant-${Date.now()}`,
                            role: 'assistant',
                            content: stripXmlTags(agentText),
                            planSteps: sanitizedPlanSteps,
                            toolSteps: sanitizedToolSteps,
                            artifacts: finalizedArtifacts.length > 0 ? [...finalizedArtifacts] : undefined,
                            isAgent: true,
                            tokenCount,
                            creditsUsed,
                            model,
                        },
                    ];
                }
                return nonStreaming;
            });

            if (agentStatus === 'done') {
                if (connectionId && finalizedArtifacts.length > 0) {
                    for (const a of finalizedArtifacts) datasetCache.set(a, connectionId);
                }
                // Refresh workspace panel so any files written during this run appear.
                setWorkspaceRefreshCount(c => c + 1);
                queryClient.invalidateQueries({ queryKey: ['ai', 'chats'] });
                queryClient.invalidateQueries({ queryKey: ['ai', 'projects'] });
            }
        }
    }, [agentStatus]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [localMessages, isStreaming]);

    const activeChatId = agentMode ? agentChatId : streamedChatId;
    useEffect(() => {
        if (activeChatId && !chatId) {
            justCreatedChatRef.current = true;
            onChatCreated?.(activeChatId);
        }
    }, [activeChatId]);

    // ── Handlers ─────────────────────────────────────────────────────────────

    const handleCopy = (id: string, text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleModeChange = (m: AgentMode) => {
        // Mode persists on the chat row via upsertChat on the next send.
        setMode(m);
        if (m === 'deep') {
            setThinking(true);
        } else {
            setThinking(false);
        }
    };

    const handleThinkingChange = (t: boolean) => {
        setThinking(t);
    };

    // Restore per-chat mode + thinking when reopening an existing thread.
    useEffect(() => {
        const storedMode = chatHistory?.chat?.agent_mode;
        if (storedMode === 'flash' || storedMode === 'deep') {
            setMode(storedMode);
        }
        if (chatHistory?.chat?.thinking_enabled != null) {
            setThinking(!!chatHistory.chat.thinking_enabled);
        } else if (storedMode === 'deep') {
            setThinking(true);
        }
    }, [chatHistory?.chat?.agent_mode, chatHistory?.chat?.thinking_enabled]);

    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        setInput(val);
        e.target.style.height = '52px';
        e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
        const cursor = e.target.selectionStart ?? val.length;
        const atMatch = val.slice(0, cursor).match(/@(\w*)$/);
        setMentionQuery(atMatch ? atMatch[1] : null);
    };

    const handleMentionSelect = (table: string) => {
        setInput(prev => {
            const cursor = textareaRef.current?.selectionStart ?? prev.length;
            const atIdx = prev.slice(0, cursor).lastIndexOf('@');
            if (atIdx === -1) return prev;
            const newText = prev.slice(0, atIdx) + '@' + table + ' ' + prev.slice(cursor).replace(/^ /, '');
            setTimeout(() => {
                if (textareaRef.current) {
                    const pos = atIdx + table.length + 2;
                    textareaRef.current.focus();
                    textareaRef.current.setSelectionRange(pos, pos);
                }
            }, 0);
            return newText;
        });
        setMentionQuery(null);
    };

    const handleMentionTrigger = () => {
        const cursor = textareaRef.current?.selectionStart ?? input.length;
        setInput(prev => prev.slice(0, cursor) + '@' + prev.slice(cursor));
        setMentionQuery('');
        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                textareaRef.current.setSelectionRange(cursor + 1, cursor + 1);
            }
        }, 0);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey && mentionQuery === null) {
            e.preventDefault();
            handleSend();
        }
        if (e.key === 'Backspace' && textareaRef.current) {
            const { selectionStart, selectionEnd } = textareaRef.current;
            if (selectionStart === selectionEnd && selectionStart > 0) {
                const mentionMatch = input.slice(0, selectionStart).match(/@(\w+)$/);
                if (mentionMatch && availableTables.includes(mentionMatch[1])) {
                    e.preventDefault();
                    const next = input.slice(0, selectionStart - mentionMatch[0].length) + input.slice(selectionStart);
                    setInput(next);
                    setTimeout(() => {
                        if (textareaRef.current) {
                            const pos = selectionStart - mentionMatch[0].length;
                            textareaRef.current.setSelectionRange(pos, pos);
                            textareaRef.current.style.height = 'auto';
                            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
                            setScrollTop(textareaRef.current.scrollTop);
                        }
                    }, 0);
                }
            }
        }
    };

    const handleQuickSend = useCallback(async (message: string, files?: File[]) => {
        if (!message.trim() && !(files && files.length > 0)) return;
        if (isStreaming) return;

        // While paused for a clarification, a quick-sent message is the ANSWER
        // to the question — resume the same run instead of starting a new one.
        if (hasPausedRun) {
            const resumed = await resumeAgent(message);
            if (resumed) {
                setLocalMessages(prev => {
                    const updated = prev.map(m => {
                        if (m.role === 'assistant' && m.artifacts?.some(a => a.type === 'clarification')) {
                            return {
                                ...m,
                                artifacts: m.artifacts.map(a => a.type === 'clarification' ? { ...a, answered: true, answer: message } : a),
                            };
                        }
                        return m;
                    });
                    return [
                        ...updated,
                        { id: `user-${Date.now()}`, role: 'user', content: message },
                        { id: 'streaming', role: 'assistant', content: '', isStreaming: true, isAgent: true },
                    ];
                });
                return;
            }
            // resume() declined (no paused run actually found) — fall through
            // to a normal new run with this message.
        }

        const effectiveSchema = aiContextSchema || 'public';
        const effectiveTables = aiContextTable ? [aiContextTable] : [];
        const filesToUpload = files ? [...files] : [];
        const userMessageId = `user-${Date.now()}`;
        setLocalMessages(prev => [...prev,
            { id: userMessageId, role: 'user', content: message, files: filesToUpload.length > 0 ? ['uploading…'] : [], },
            { id: 'streaming', role: 'assistant', content: '', isStreaming: true, isAgent: agentMode },
        ]);
        let fileIds: string[] = [];
        let uploadedFileNames: string[] = [];
        if (filesToUpload.length > 0) {
            try {
                const uploadRes = await uploadFilesForAI(filesToUpload, { chatId: chatId ?? undefined });
                if (uploadRes.ok && uploadRes.files && uploadRes.files.length > 0) {
                    fileIds = uploadRes.files.map(f => f.file_id);
                    uploadedFileNames = uploadRes.files.map(f => f.filename);
                }
            } catch (err) {
                logger.warn('[AIChatMain] QuickSend failed to upload files:', err);
            } finally {
                setLocalMessages(prev => prev.map(m =>
                    m.id === userMessageId
                        ? { ...m, files: uploadedFileNames.length > 0 ? uploadedFileNames : undefined }
                        : m
                ));
            }
        }
        const history = localMessages.filter(m => !m.isStreaming).map(m => ({ role: m.role, content: m.content }));
        if (agentMode && connectionId) {
            await sendAgent({ connectionId, message, chatId: chatId ?? undefined, schemaName: effectiveSchema, databaseName: dbName, history, mentionedTables: effectiveTables, agentMode: mode, thinking, projectId, fileIds });
        }
    }, [isStreaming, localMessages, connectionId, chatId, aiContextTable, aiContextSchema, agentMode, sendAgent, mode, thinking, dbName, projectId, hasPausedRun, resumeAgent]);

    const handleSend = useCallback(async () => {
        if ((!input.trim() && attachedFiles.length === 0) || isStreaming) return;

        // While paused for a clarification, the sent text is the ANSWER to the
        // question — resume the same run instead of starting a new one.
        if (hasPausedRun) {
            const answer = input.trim();
            const resumed = await resumeAgent(answer);
            if (resumed) {
                setInput('');
                setLocalMessages(prev => {
                    const updated = prev.map(m => {
                        if (m.role === 'assistant' && m.artifacts?.some(a => a.type === 'clarification')) {
                            return {
                                ...m,
                                artifacts: m.artifacts.map(a => a.type === 'clarification' ? { ...a, answered: true, answer } : a),
                            };
                        }
                        return m;
                    });
                    return [
                        ...updated,
                        { id: `user-${Date.now()}`, role: 'user', content: answer },
                        { id: 'streaming', role: 'assistant', content: '', isStreaming: true, isAgent: true },
                    ];
                });
                if (textareaRef.current) textareaRef.current.style.height = '52px';
                return;
            }
            // resume() declined — fall through to a normal new run.
        }

        // Block send if quota is exhausted (double-check, UI already disables button)
        if (quotaError) {
            logger.warn('[AIChatMain] Send blocked: quota exhausted');
            return;
        }
        const messageText = input.trim();
        const mentionedTables = Array.from(messageText.matchAll(/@(\w+)/g))
            .map(m => m[1])
            .filter(t => availableTables.includes(t));
        const effectiveTables = mentionedTables.length > 0 ? mentionedTables : (aiContextTable ? [aiContextTable] : []);
        const effectiveSchema = aiContextSchema || 'public';

        const filesToUpload = [...attachedFiles];
        const userMessageId = `user-${Date.now()}`;
        // Only show file badges in the bubble if the upload succeeds (#5)
        setLocalMessages(prev => [...prev,
            { id: userMessageId, role: 'user', content: messageText, files: filesToUpload.length > 0 ? ['uploading…'] : [], mentionedTable: effectiveTables[0] },
            { id: 'streaming', role: 'assistant', content: '', isStreaming: true, isAgent: agentMode },
        ]);
        setInput('');
        setAttachedFiles([]);
        showUploadError(null);
        if (textareaRef.current) textareaRef.current.style.height = '52px';

        let fileIds: string[] = [];
        let uploadedFileNames: string[] = [];
        if (filesToUpload.length > 0) {
            setIsUploading(true);
            try {
                const uploadRes = await uploadFilesForAI(filesToUpload, { chatId: chatId ?? undefined });
                if (uploadRes.ok && uploadRes.files && uploadRes.files.length > 0) {
                    fileIds = uploadRes.files.map(f => f.file_id);
                    uploadedFileNames = uploadRes.files.map(f => f.filename);
                } else {
                    showUploadError('File upload failed — files were not attached to this message.');
                }
            } catch (err) {
                logger.warn('[AIChatMain] Failed to upload attached files:', err);
                showUploadError('File upload failed. Your message will be sent without file context.');
            } finally {
                setIsUploading(false);
                // Update the bubble to show real uploaded filenames (or clear if failed)
                setLocalMessages(prev => prev.map(m =>
                    m.id === userMessageId
                        ? { ...m, files: uploadedFileNames.length > 0 ? uploadedFileNames : undefined }
                        : m
                ));
            }
        }

        const history = localMessages.filter(m => !m.isStreaming).map(m => ({ role: m.role, content: m.content }));

        if (agentMode && connectionId) {
            await sendAgent({ connectionId, message: messageText, chatId: chatId ?? undefined, schemaName: effectiveSchema, databaseName: dbName, history, mentionedTables: effectiveTables, agentMode: mode, thinking, projectId: activeProjectId ?? undefined, fileIds });
        } else {
            await sendStream({ connectionId, chatId: chatId ?? undefined, message: messageText, history, mentionedTables: effectiveTables, tableContext: effectiveTables.length > 0 ? { tableName: effectiveTables[0], schemaName: effectiveSchema } : undefined, projectId: activeProjectId ?? undefined, fileIds });
        }
    }, [input, attachedFiles, isStreaming, localMessages, connectionId, chatId, aiContextTable, aiContextSchema, agentMode, sendAgent, sendStream, availableTables, mode, thinking, quotaError, activeProjectId, showUploadError, hasPausedRun, resumeAgent]);

    // ── Build display messages ────────────────────────────────────────────────

    const displayMessages: LocalMessage[] = localMessages.map(m => {
        if (!m.isStreaming) return m;
        if (!isStreaming) {
            return {
                ...m,
                isStreaming: false,
                content: agentMode ? (agentText ? stripXmlTags(agentText) : m.content) : (streamedText || m.content),
                planSteps: agentMode && planSteps.length > 0 ? planSteps.map(p => p.status === 'running' ? { ...p, status: 'error' } : p) : m.planSteps,
                toolSteps: agentMode && toolSteps.length > 0 ? toolSteps.map(s => s.status === 'calling' ? { ...s, status: 'error' } : s) : m.toolSteps,
                artifacts: agentMode && artifacts.length > 0 ? artifacts.filter(a => !a.loading) : m.artifacts,
            };
        }
        if (agentMode) return { ...m, content: agentText, planSteps: planSteps.length > 0 ? planSteps : undefined, toolSteps: toolSteps.length > 0 ? toolSteps : undefined, artifacts: artifacts.length > 0 ? artifacts : undefined };
        return { ...m, content: streamedText, sql: sqlArtifacts[0]?.sql };
    });

    // ── Render ────────────────────────────────────────────────────────────────

    const chatPanel = (
        <main className="flex-1 flex flex-col h-full bg-background relative overflow-hidden">
            {/* Compact project button */}
            {activeProject && (
                <div className="absolute top-2.5 left-4 z-20 pointer-events-auto">
                    <button
                        onClick={() => onProjectClick?.(activeProject.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-background/90 hover:bg-muted border border-border/70 shadow-xs backdrop-blur-md text-foreground/80 hover:text-foreground transition-all duration-150 group cursor-pointer"
                        title={`Project: ${activeProject.title} — click to view project`}
                    >
                        <FolderKanban className="w-3 h-3 text-primary" />
                        <span className="truncate max-w-[150px]">{activeProject.title}</span>
                    </button>
                </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full">
                <div className="max-w-3xl mx-auto w-full px-4 pt-8 pb-40 flex flex-col gap-6">

                    {/* Loading skeleton when switching between existing chats */}
                    {isSwitchingChat ? (
                        <ChatLoadingSkeleton />
                    ) : displayMessages.length === 0 ? (
                        <div className="flex flex-col items-center mt-24 sm:mt-28 gap-4 text-center select-none">
                            <img
                                src="/resona.png"
                                alt="Resona AI"
                                className="w-14 h-14 sm:w-16 sm:h-16 object-contain opacity-90 transition-transform duration-300 hover:scale-105"
                            />
                            <div>
                                <h2 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight">
                                    How can I help?
                                </h2>
                                <p className="text-sm sm:text-base text-muted-foreground mt-1.5">
                                    Ask anything about your data.
                                </p>
                            </div>
                            {aiContextTable && (
                                <div className="mt-3 flex flex-col gap-2 w-full max-w-md text-left">
                                    {[`Describe the ${aiContextTable} table`, `Show top 10 rows from ${aiContextTable}`, `Any anomalies in ${aiContextTable}?`].map(prompt => (
                                        <button key={prompt}
                                            onClick={() => { setInput(prompt); textareaRef.current?.focus(); }}
                                            className="flex items-center gap-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-xl px-3.5 py-2.5 transition-all border border-border/40 hover:border-border/80 shadow-2xs cursor-pointer">
                                            <ChevronRight className="w-4 h-4 shrink-0 opacity-40" />
                                            <span>{prompt}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            {/* Load older messages trigger */}
                            {hasMoreOlder && (
                                <div className="flex justify-center -mb-2">
                                    <button
                                        onClick={handleLoadOlderMessages}
                                        disabled={isLoadingOlder}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground bg-muted/60 hover:bg-muted border border-border/60 transition-colors shadow-2xs cursor-pointer"
                                    >
                                        {isLoadingOlder ? (
                                            <>
                                                <Loader2 className="w-3 h-3 animate-spin text-primary" />
                                                <span>Loading earlier messages…</span>
                                            </>
                                        ) : (
                                            <span>Load earlier messages</span>
                                        )}
                                    </button>
                                </div>
                            )}
                            {/* Message list */}
                            {displayMessages.map(msg => (
                        <ChatMessage
                            key={msg.id}
                            msg={msg}
                            agentMode={agentMode}
                            agentStatus={agentStatus}
                            phase={phase}
                            phaseDetail={phaseDetail}
                            iterations={iterations ?? 0}
                            isStreaming={isStreaming}
                            copiedId={copiedId}
                            connectionId={connectionId}
                            datasetCache={datasetCache}
                            availableTables={availableTables}
                            liveThinking={agentLiveThinking}
                            onCopy={handleCopy}
                            onTableClick={onTableClick}
                            onExpand={setExpandedArtifact}
                            onPin={a => {
                                updateDashboardArtifacts(prev => {
                                    const isPinned = prev.some(p => (p.title && p.title === a.title) || (p.sql && p.sql === a.sql) || (p.downloadUrl && p.downloadUrl === a.downloadUrl));
                                    if (isPinned) return prev.filter(p => !((p.title && p.title === a.title) || (p.sql && p.sql === a.sql) || (p.downloadUrl && p.downloadUrl === a.downloadUrl)));
                                    return [...prev, a];
                                });
                                setShowDashboard(true);
                                setExpandedArtifact(null);
                            }}
                            isPinnedArtifact={a => dashboardArtifacts.some(p => (p.title && p.title === a.title) || (p.sql && p.sql === a.sql) || (p.downloadUrl && p.downloadUrl === a.downloadUrl))}
                            onQuickSend={handleQuickSend}
                        />
                    ))}</>)}

                    {/* Error — quota errors are shown in the input banner instead */}
                    {activeError && !quotaError && (
                        <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
                            {activeError}
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* Input */}
            <ChatInput
                input={input}
                scrollTop={scrollTop}
                attachedFiles={attachedFiles}
                mentionQuery={mentionQuery}
                availableTables={availableTables}
                isStreaming={isStreaming}
                agentMode={agentMode}
                connectionId={connectionId}
                dbName={dbName}
                dashboardCount={dashboardArtifacts.length}
                showDashboard={showDashboard}
                mode={mode}
                thinking={thinking}
                contextMeta={contextMeta}
                localMessageCount={localMessages.filter(m => !m.isStreaming).length}
                tokenCount={tokenCount}
                textareaRef={textareaRef}
                fileInputRef={fileInputRef}
                onInput={handleInput}
                onScroll={e => setScrollTop((e.currentTarget as HTMLTextAreaElement).scrollTop)}
                onKeyDown={handleKeyDown}
                onSend={handleSend}
                onAbort={() => agentMode ? abortAgent() : abortStream()}
                onFileSelect={e => {
                    if (!e.target.files) return;
                    const { valid, errors } = validateFiles(Array.from(e.target.files));
                    if (errors.length > 0) {
                        showUploadError(errors.join('; '));
                    }
                    if (valid.length > 0) {
                        setAttachedFiles(prev => {
                            const combined = [...prev, ...valid];
                            if (combined.length > MAX_FILE_COUNT) {
                                showUploadError(`Maximum ${MAX_FILE_COUNT} files allowed. Only the first ${MAX_FILE_COUNT} will be attached.`);
                                return combined.slice(0, MAX_FILE_COUNT);
                            }
                            return combined;
                        });
                    }
                    if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                onRemoveFile={i => setAttachedFiles(prev => prev.filter((_, j) => j !== i))}
                onMentionSelect={handleMentionSelect}
                onMentionClose={() => setMentionQuery(null)}
                onMentionTrigger={handleMentionTrigger}
                onModeChange={handleModeChange}
                onThinkingChange={handleThinkingChange}
                onToggleDashboard={() => { setShowDashboard(s => !s); setShowWorkspace(false); setExpandedArtifact(null); }}
                onToggleWorkspace={() => { setShowWorkspace(s => !s); setShowDashboard(false); setExpandedArtifact(null); }}
                showWorkspace={showWorkspace}
                onTranscript={text => { setInput(prev => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + text); textareaRef.current?.focus(); }}
                quotaError={quotaError}
                quotaWarning={quotaWarning}
                onOpenPlans={onOpenPlans}
                uploadError={uploadError}
                isUploading={isUploading}
                agentWarnings={(agentWarnings ?? []).filter(w => !dismissedWarnings[w.id])}
                onDismissWarning={id => setDismissedWarnings(prev => ({ ...prev, [id]: true }))}
            />
        </main>
    );

    const sidePanel = showWorkspace ? (
        <WorkspacePanel
            connectionId={connectionId}
            sessionId={chatId}
            onClose={() => setShowWorkspace(false)}
            refreshTrigger={workspaceRefreshCount}
        />
    ) : showDashboard ? (
        <DashboardPanel
            artifacts={dashboardArtifacts}
            onClose={() => setShowDashboard(false)}
            onRemove={idx => updateDashboardArtifacts(prev => prev.filter((_, i) => i !== idx))}
        />
    ) : expandedArtifact ? (
        <ArtifactPanel artifact={expandedArtifact} onClose={() => setExpandedArtifact(null)} onQuickSend={handleQuickSend} />
    ) : null;

    if (!sidePanel) return chatPanel;

    return (
        <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizablePanel defaultSize={50} minSize={30}>{chatPanel}</ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={50} minSize={25}>{sidePanel}</ResizablePanel>
        </ResizablePanelGroup>
    );
}
