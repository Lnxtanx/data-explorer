import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronRight, FolderKanban } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAIStream } from '@/hooks/useAIStream';
import { useAIAgent } from '@/hooks/useAIAgent';
import { useAIChatMessages } from '@/hooks/useAIChats';
import { useAssignChatToProject, useProjects } from '@/hooks/useProjects';
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
import { ContextWindowBar } from './chat/ContextWindowBar';
import { DEFAULT_MODEL_ID } from './models/modelConfig';
import type { AgentArtifact } from '@/hooks/useAIAgent';
import type { AIMessage } from '@/lib/api/ai';
import type { LocalMessage } from './chat/types';

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
        case 'table':    return !!(a.rows && a.columns);
        case 'stats':    return !!a.stats;
        case 'diagram':  return !!a.mermaid;
        default:         return !!(a.rows && a.columns);
    }
}

function toLocal(m: AIMessage): LocalMessage {
    const artifacts: AgentArtifact[] = (m.artifacts ?? [])
        .filter(hasArtifactData)
        .map(a => ({ type: a.type ?? 'table', ...a } as AgentArtifact));

    // Restore tool steps from execution_trace if available
    const rawSteps = (m as any).execution_trace?.toolSteps ?? [];
    const toolSteps = rawSteps.length > 0
        ? rawSteps.map((s: any) => ({
            id: s.id,
            name: s.name,
            input: s.input ?? {},
            status: s.status === 'done' ? 'done' as const : s.status === 'error' ? 'error' as const : 'calling' as const,
            result: s.result,
        }))
        : undefined;

    return {
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        sql: m.artifacts?.[0]?.sql ?? undefined,
        artifacts: artifacts.length > 0 ? artifacts : undefined,
        toolSteps,
        tokenCount: m.token_count,
    };
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
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [expandedArtifact, setExpandedArtifact] = useState<AgentArtifact | null>(null);
    const [dashboardArtifacts, setDashboardArtifacts] = useState<AgentArtifact[]>([]);
    const [showDashboard, setShowDashboard] = useState(false);
    const [showWorkspace, setShowWorkspace] = useState(false);
    const [workspaceRefreshCount, setWorkspaceRefreshCount] = useState(0);
    const [selectedModel, setSelectedModel] = useState<string>(() => {
        try { return localStorage.getItem('resona_model') ?? DEFAULT_MODEL_ID; } catch { return DEFAULT_MODEL_ID; }
    });

    // ── Refs ─────────────────────────────────────────────────────────────────
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const justCreatedChatRef = useRef(false);
    const prevChatIdRef = useRef<string | null | undefined>(undefined);

    // ── Hooks ────────────────────────────────────────────────────────────────
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
        send: sendAgent, abort: abortAgent, status: agentStatus,
        planSteps, toolSteps, artifacts, streamedText: agentText,
        thinkingText: agentThinking, liveThinking: agentLiveThinking, error: agentError, reset: resetAgent, chatId: agentChatId,
        phase, phaseDetail, iterations, tokenCount, creditsUsed, model, contextMeta,
    } = useAIAgent();

    const { data: chatHistory } = useAIChatMessages(chatId ?? '', { enabled: !!chatId });
    const { data: projects } = useProjects();
    const { data: connections } = useConnections();
    const assignChat = useAssignChatToProject();

    const activeProjectId = projectId || chatHistory?.chat?.project_id;
    const activeProject = activeProjectId ? projects?.find(p => p.id === activeProjectId) : null;
    const activeConnection = connections?.find(c => c.id === connectionId);
    const dbName = activeConnection?.name;
    const isStreaming = agentMode ? agentStatus === 'running' : streamStatus === 'streaming';
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
            resetStream(); resetAgent();
            return;
        }
        const isNavigating = chatId !== prevChatIdRef.current && !justCreatedChatRef.current;
        if (isNavigating && chatHistory?.messages) {
            prevChatIdRef.current = chatId;
            setLocalMessages(chatHistory.messages.filter(m => m.role !== 'system').map(toLocal));
            resetStream(); resetAgent();
        } else if (justCreatedChatRef.current && chatId) {
            prevChatIdRef.current = chatId;
            justCreatedChatRef.current = false;
        }
    }, [chatId, chatHistory?.messages]);

    useEffect(() => {
        if (!agentMode && streamStatus === 'done' && streamedText) {
            setLocalMessages(prev => [
                ...prev.filter(m => !m.isStreaming),
                { id: `assistant-${Date.now()}`, role: 'assistant', content: streamedText, sql: sqlArtifacts[0]?.sql },
            ]);
        }
    }, [streamStatus]);

    useEffect(() => {
        if (agentMode && agentStatus === 'done') {
            setLocalMessages(prev => [
                ...prev.filter(m => !m.isStreaming),
                {
                    id: `assistant-${Date.now()}`, role: 'assistant', content: stripXmlTags(agentText),
                    planSteps: planSteps.length > 0 ? [...planSteps] : undefined,
                    toolSteps: toolSteps.length > 0 ? [...toolSteps] : undefined,
                    artifacts: artifacts.length > 0 ? [...artifacts] : undefined,
                    isAgent: true, tokenCount, creditsUsed, model,
                },
            ]);
            if (connectionId && artifacts.length > 0) {
                for (const a of artifacts) datasetCache.set(a, connectionId);
            }
            // Refresh workspace panel so any files written during this run appear.
            setWorkspaceRefreshCount(c => c + 1);
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
            if (projectId) assignChat.mutate({ projectId, chatId: activeChatId });
        }
    }, [activeChatId]);

    // ── Handlers ─────────────────────────────────────────────────────────────

    const handleCopy = (id: string, text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleModelChange = (m: string) => {
        setSelectedModel(m);
        try { localStorage.setItem('resona_model', m); } catch { /* ignore */ }
    };

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

    const handleQuickSend = useCallback(async (message: string) => {
        if (!message.trim() || isStreaming) return;
        const effectiveSchema = aiContextSchema || 'public';
        const effectiveTables = aiContextTable ? [aiContextTable] : [];
        setLocalMessages(prev => [...prev,
            { id: `user-${Date.now()}`, role: 'user', content: message },
            { id: 'streaming', role: 'assistant', content: '', isStreaming: true, isAgent: agentMode },
        ]);
        const history = localMessages.filter(m => !m.isStreaming).map(m => ({ role: m.role, content: m.content }));
        if (agentMode && connectionId) {
            await sendAgent({ connectionId, message, chatId: chatId ?? undefined, schemaName: effectiveSchema, databaseName: dbName, history, mentionedTables: effectiveTables, synthesisModel: selectedModel });
        }
    }, [isStreaming, localMessages, connectionId, chatId, aiContextTable, aiContextSchema, agentMode, sendAgent, selectedModel, dbName]);

    const handleSend = useCallback(async () => {
        if ((!input.trim() && attachedFiles.length === 0) || isStreaming) return;
        // Block send if quota is exhausted (double-check, UI already disables button)
        if (quotaError) {
            console.warn('[AIChatMain] Send blocked: quota exhausted');
            return;
        }
        const messageText = input.trim();
        const mentionedTables = Array.from(messageText.matchAll(/@(\w+)/g))
            .map(m => m[1])
            .filter(t => availableTables.includes(t));
        const effectiveTables = mentionedTables.length > 0 ? mentionedTables : (aiContextTable ? [aiContextTable] : []);
        const effectiveSchema = aiContextSchema || 'public';

        setLocalMessages(prev => [...prev,
            { id: `user-${Date.now()}`, role: 'user', content: messageText, files: attachedFiles.map(f => f.name), mentionedTable: effectiveTables[0] },
            { id: 'streaming', role: 'assistant', content: '', isStreaming: true, isAgent: agentMode },
        ]);
        setInput('');
        setAttachedFiles([]);
        if (textareaRef.current) textareaRef.current.style.height = '52px';

        const history = localMessages.filter(m => !m.isStreaming).map(m => ({ role: m.role, content: m.content }));

        if (agentMode && connectionId) {
            await sendAgent({ connectionId, message: messageText, chatId: chatId ?? undefined, schemaName: effectiveSchema, databaseName: dbName, history, mentionedTables: effectiveTables, synthesisModel: selectedModel });
        } else {
            await sendStream({ connectionId, chatId: chatId ?? undefined, message: messageText, history, mentionedTables: effectiveTables, tableContext: effectiveTables.length > 0 ? { tableName: effectiveTables[0], schemaName: effectiveSchema } : undefined });
        }
    }, [input, attachedFiles, isStreaming, localMessages, connectionId, chatId, aiContextTable, aiContextSchema, agentMode, sendAgent, sendStream, availableTables, selectedModel, quotaError]);

    // ── Build display messages ────────────────────────────────────────────────

    const displayMessages: LocalMessage[] = localMessages.map(m => {
        if (!m.isStreaming) return m;
        if (agentMode) return { ...m, content: agentText, planSteps: planSteps.length > 0 ? planSteps : undefined, toolSteps: toolSteps.length > 0 ? toolSteps : undefined, artifacts: artifacts.length > 0 ? artifacts : undefined };
        return { ...m, content: streamedText, sql: sqlArtifacts[0]?.sql };
    });

    // ── Render ────────────────────────────────────────────────────────────────

    const chatPanel = (
        <main className="flex-1 flex flex-col h-full bg-background relative overflow-hidden">
            {/* Project context header */}
            {activeProject && (
                <div className="h-12 border-b border-border/40 shrink-0 flex items-center px-4 bg-muted/10 gap-2 z-10">
                    <div className={cn('w-5 h-5 rounded flex items-center justify-center shrink-0 text-white', colorClass[activeProject.color] || colorClass.slate)}>
                        <FolderKanban className="w-3 h-3" />
                    </div>
                    <button className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors truncate" onClick={() => onProjectClick?.(activeProject.id)}>
                        {activeProject.title}
                    </button>
                    <span className="text-muted-foreground/30 px-1">/</span>
                    <span className="text-sm font-medium text-foreground truncate max-w-[300px]">{chatHistory?.chat?.title || 'New Chat'}</span>
                </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full">
                <div className="max-w-3xl mx-auto w-full px-4 pt-8 pb-40 flex flex-col gap-6">

                    {/* Empty state */}
                    {displayMessages.length === 0 && (
                        <div className="flex flex-col items-center mt-20 gap-3 text-center">
                            <img src="/resona.png" alt="Resona AI" className="w-10 h-10 object-contain opacity-70" />
                            <div>
                                <h3 className="text-xl font-semibold text-foreground tracking-tight">How can I help?</h3>
                                <p className="text-sm text-muted-foreground mt-1">Ask anything about your data.</p>
                            </div>
                            {aiContextTable && (
                                <div className="mt-2 flex flex-col gap-1.5 w-full max-w-sm text-left">
                                    {[`Describe the ${aiContextTable} table`, `Show top 10 rows from ${aiContextTable}`, `Any anomalies in ${aiContextTable}?`].map(prompt => (
                                        <button key={prompt}
                                            onClick={() => { setInput(prompt); textareaRef.current?.focus(); }}
                                            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded-lg px-3 py-2 transition-colors border border-border/30 hover:border-border/60">
                                            <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-40" />
                                            {prompt}
                                        </button>
                                    ))}
                                </div>
                            )}
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
                            liveModel={model}
                            isStreaming={isStreaming}
                            copiedId={copiedId}
                            connectionId={connectionId}
                            datasetCache={datasetCache}
                            availableTables={availableTables}
                            thinkingText={agentThinking}
                            liveThinking={agentLiveThinking}
                            onCopy={handleCopy}
                            onTableClick={onTableClick}
                            onExpand={setExpandedArtifact}
                            onPin={a => { setDashboardArtifacts(prev => [...prev, a]); setShowDashboard(true); setExpandedArtifact(null); }}
                            onQuickSend={handleQuickSend}
                        />
                    ))}

                    {/* Error — quota errors are shown in the input banner instead */}
                    {activeError && !quotaError && (
                        <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
                            {activeError}
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* Context window indicator */}
            {agentMode && (
                <ContextWindowBar
                    contextMeta={contextMeta}
                    localMessageCount={localMessages.filter(m => !m.isStreaming).length}
                    className="border-t border-border/20"
                />
            )}

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
                selectedModel={selectedModel}
                textareaRef={textareaRef}
                fileInputRef={fileInputRef}
                onInput={handleInput}
                onScroll={e => setScrollTop((e.currentTarget as HTMLTextAreaElement).scrollTop)}
                onKeyDown={handleKeyDown}
                onSend={handleSend}
                onAbort={() => agentMode ? abortAgent() : abortStream()}
                onFileSelect={e => { if (e.target.files) setAttachedFiles(prev => [...prev, ...Array.from(e.target.files!)]); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                onRemoveFile={i => setAttachedFiles(prev => prev.filter((_, j) => j !== i))}
                onMentionSelect={handleMentionSelect}
                onMentionClose={() => setMentionQuery(null)}
                onMentionTrigger={handleMentionTrigger}
                onModelChange={handleModelChange}
                onToggleDashboard={() => { setShowDashboard(s => !s); setShowWorkspace(false); setExpandedArtifact(null); }}
                onToggleWorkspace={() => { setShowWorkspace(s => !s); setShowDashboard(false); setExpandedArtifact(null); }}
                showWorkspace={showWorkspace}
                onTranscript={text => { setInput(prev => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + text); textareaRef.current?.focus(); }}
                quotaError={quotaError}
                quotaWarning={quotaWarning}
                onOpenPlans={onOpenPlans}
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
            onRemove={idx => setDashboardArtifacts(prev => prev.filter((_, i) => i !== idx))}
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
