import { useState, useRef, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FolderKanban, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';

// Subcomponents & Panels
import { ArtifactPanel } from './artifacts/ArtifactPanel';
import { DashboardPanel } from './artifacts/DashboardPanel';
import { WorkspacePanel } from './artifacts/WorkspacePanel';
import { ChatMessage } from './chat/ChatMessage';
import { ChatInput, type ChatInputProps } from './chat/ChatInput';
import { TurnNavigator } from './chat/TurnNavigator';
import { ChatLoadingSkeleton } from './chat/components/ChatLoadingSkeleton';
import { ChatEmptyState } from './chat/components/ChatEmptyState';
import { VoiceSessionOverlay } from '@/components/voice';

// Extracted Custom Hooks
import { useChatScroll } from './chat/hooks/useChatScroll';
import { usePinnedArtifacts } from './chat/hooks/usePinnedArtifacts';
import { useChatHistory } from './chat/hooks/useChatHistory';
import { useChatVoiceIntegration } from './chat/hooks/useChatVoiceIntegration';
import { useChatInputState } from './chat/hooks/useChatInputState';
import { useChatSendOrchestrator } from './chat/hooks/useChatSendOrchestrator';

// Domain Hooks & Utilities
import { useAIStream } from './hooks/useAIStream';
import { useAIAgent } from './hooks/useAIAgent';
import { useAIChatMessages, aiQueryKeys } from './hooks/useAIChats';
import { useProjects, projectQueryKeys } from './hooks/useProjects';
import { useTableList } from '../data-explorer/api/index';
import { useConnections } from '../connector/api/useConnections';
import { useDatasetCache } from './hooks/useDatasetCache';
import { useAIUsage, getProactiveQuotaError, getQuotaWarning } from './hooks/useAIUsage';
import { useGreeting } from '../auth/hooks/useGreeting';
import { stripXmlTags } from './chat/utils/messageMapper';
import { clearDraft } from './storage/chatDrafts';
import type { AgentMode } from './models/ModeSelector';
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
    onNewChat?: () => void;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AIChatMain({
    connectionId,
    chatId,
    projectId,
    onChatCreated,
    onProjectClick,
    aiContextTable,
    aiContextSchema,
    onTableClick,
    onOpenPlans,
    onNewChat,
}: AIChatMainProps) {
    const greeting = useGreeting();
    const queryClient = useQueryClient();

    // Mode, thinking & local UI states
    const [mode, setMode] = useState<AgentMode>('flash');
    const [thinking, setThinking] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [showDashboard, setShowDashboard] = useState(false);
    const [showWorkspace, setShowWorkspace] = useState(false);
    const [workspaceRefreshCount, setWorkspaceRefreshCount] = useState(0);
    const [dismissedWarnings, setDismissedWarnings] = useState<Record<string, boolean>>({});

    const agentMode = Boolean(connectionId);

    // Context & Connections
    const { data: tableListData } = useTableList(connectionId ?? null, 'public');
    const availableTables = tableListData?.tables?.map(t => t.name) ?? [];
    const datasetCache = useDatasetCache();
    const { data: usageStatus } = useAIUsage();
    const { data: projects } = useProjects();
    const { data: connections } = useConnections();

    // Streaming and Agent Hooks
    const {
        send: sendStream,
        abort: abortStream,
        status: streamStatus,
        streamedText,
        sqlArtifacts,
        error: streamError,
        reset: resetStream,
        chatId: streamedChatId,
    } = useAIStream();

    const {
        send: sendAgent,
        abort: abortAgent,
        status: agentStatus,
        runId: agentRunId,
        planSteps,
        toolSteps,
        artifacts,
        streamedText: agentText,
        liveThinking: agentLiveThinking,
        error: agentError,
        reset: resetAgent,
        chatId: agentChatId,
        phase,
        phaseDetail,
        iterations,
        tokenCount,
        creditsUsed,
        model,
        contextMeta,
        warnings: agentWarnings,
        pausedRunId,
        resume: resumeAgent,
    } = useAIAgent();

    // Pinned Artifacts
    const {
        expandedArtifact,
        setExpandedArtifact,
        handleToggleExpand,
        dashboardArtifacts,
        updateDashboardArtifacts,
        handlePinArtifact,
        isPinnedArtifact,
    } = usePinnedArtifacts(chatId, () => {
        setShowDashboard(true);
        setShowWorkspace(false);
    });

    // Chat History
    const [isVoiceActiveState, setIsVoiceActiveState] = useState(false);
    const { data: chatHistory, isError: isChatError } = useAIChatMessages(chatId ?? '', {
        enabled: Boolean(chatId),
    });

    const resetBoth = useCallback(() => {
        resetStream();
        resetAgent();
    }, [resetStream, resetAgent]);

    const {
        localMessages,
        setLocalMessages,
        hasMoreOlder,
        isLoadingOlder,
        handleLoadOlderMessages,
        justCreatedChatRef,
        isSwitchingChat,
    } = useChatHistory({
        chatId,
        chatHistory,
        isChatError,
        isVoiceActive: isVoiceActiveState,
        onNewChat,
        onResetStreamAndAgent: resetBoth,
    });

    // Voice Session Integration (Gemini Live)
    const voice = useChatVoiceIntegration({
        connectionId,
        chatId,
        userName: greeting.firstName,
        agentMode,
        setLocalMessages,
        onChatCreated,
        justCreatedChatRef,
    });

    useEffect(() => {
        setIsVoiceActiveState(voice.isVoiceActive);
    }, [voice.isVoiceActive]);

    // Active project & database names
    const activeProjectId = projectId || chatHistory?.chat?.project_id;
    const activeProject = activeProjectId ? projects?.find(p => p.id === activeProjectId) : null;
    const activeConnection = connections?.find(c => c.id === connectionId);
    const dbName = activeConnection?.name;

    // Streaming state & quota detection
    const isStreaming = agentMode ? agentStatus === 'running' : streamStatus === 'streaming';
    const awaitingClarification = agentMode && agentStatus === 'awaiting_clarification';
    const hasPausedRun = agentMode && (awaitingClarification || Boolean(agentRunId || pausedRunId));
    const activeError = agentMode ? agentError : streamError;

    const proactiveQuotaError = getProactiveQuotaError(usageStatus);
    const quotaWarning = getQuotaWarning(usageStatus);
    const QUOTA_KEYWORDS = [
        'credit limit', 'quota', 'limit reached', 'upgrade',
        'quota exceeded', 'token quota',
        'daily limit', 'monthly limit',
    ];
    const reactiveQuotaError = activeError && QUOTA_KEYWORDS.some(k => activeError.toLowerCase().includes(k))
        ? activeError
        : null;
    const quotaError = proactiveQuotaError ?? reactiveQuotaError;

    // Send reference to link input state Enter-key submission
    const handleSendRef = useRef<() => Promise<void>>(() => Promise.resolve());

    // Input state management
    const inputState = useChatInputState({
        chatId,
        connectionId,
        availableTables,
        onSend: () => {
            handleSendRef.current();
        },
    });

    // Send & File Upload Orchestration Hook
    const { handleSend, handleQuickSend } = useChatSendOrchestrator({
        chatId,
        connectionId,
        projectId,
        activeProjectId,
        dbName,
        aiContextTable,
        aiContextSchema,
        availableTables,
        agentMode,
        mode,
        thinking,
        isStreaming,
        hasPausedRun,
        quotaError,
        resumeAgent,
        sendAgent,
        sendStream,
        localMessages,
        setLocalMessages,
        inputState,
        setWorkspaceRefreshCount,
    });

    handleSendRef.current = handleSend;

    // Finalize non-agent stream messages
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
                queryClient.invalidateQueries({ queryKey: aiQueryKeys.chatsRoot });
                queryClient.invalidateQueries({ queryKey: projectQueryKeys.all });
            }
        }
    }, [streamStatus, agentMode, streamedText, sqlArtifacts, queryClient, setLocalMessages]);

    // Finalize agent stream messages
    useEffect(() => {
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
                setWorkspaceRefreshCount(c => c + 1);
                queryClient.invalidateQueries({ queryKey: aiQueryKeys.chatsRoot });
                queryClient.invalidateQueries({ queryKey: projectQueryKeys.all });
            }
        }
    }, [agentStatus, agentMode, agentText, artifacts, toolSteps, planSteps, tokenCount, creditsUsed, model, connectionId, datasetCache, queryClient, setLocalMessages]);

    // Track active created chatId
    const activeChatId = agentMode ? agentChatId : streamedChatId;
    useEffect(() => {
        if (activeChatId && !chatId) {
            clearDraft(null, connectionId);
            justCreatedChatRef.current = true;
            onChatCreated?.(activeChatId);
        }
    }, [activeChatId, chatId, connectionId, onChatCreated, justCreatedChatRef]);

    // Restore per-chat mode & thinking when opening an existing chat
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

    const handleCopy = useCallback((id: string, text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    }, []);

    // Build display messages including active interim streaming and voice interim turns
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
        if (agentMode) {
            return {
                ...m,
                content: agentText,
                planSteps: planSteps.length > 0 ? planSteps : undefined,
                toolSteps: toolSteps.length > 0 ? toolSteps : undefined,
                artifacts: artifacts.length > 0 ? artifacts : undefined,
            };
        }
        return { ...m, content: streamedText, sql: sqlArtifacts[0]?.sql };
    });

    const finalDisplayMessages = voice.getFinalDisplayMessages(displayMessages);

    // Scroll & turn intersection tracking
    const {
        scrollContainerRef,
        messagesEndRef,
        isAtBottom,
        hasNewMessages,
        activeTurnId,
        handleScroll,
        handleScrollToBottom,
        handleScrollToTop,
        handleSelectTurn,
    } = useChatScroll({
        chatId,
        localMessages,
        isStreaming,
        displayMessages: finalDisplayMessages,
        showWorkspace,
        showDashboard,
        hasExpandedArtifact: Boolean(expandedArtifact),
    });

    // ChatInput Props
    const chatInputProps: ChatInputProps = {
        input: inputState.input,
        scrollTop: inputState.scrollTop,
        attachedFiles: inputState.attachedFiles,
        mentionQuery: inputState.mentionQuery,
        availableTables,
        isStreaming,
        agentMode,
        connectionId,
        dbName,
        dashboardCount: dashboardArtifacts.length,
        showDashboard,
        mode,
        thinking,
        contextMeta,
        localMessageCount: localMessages.filter(m => !m.isStreaming).length,
        tokenCount,
        textareaRef: inputState.textareaRef,
        fileInputRef: inputState.fileInputRef,
        onInput: inputState.handleInput,
        onScroll: e => inputState.setScrollTop((e.currentTarget as HTMLTextAreaElement).scrollTop),
        onKeyDown: inputState.handleKeyDown,
        onSend: handleSend,
        onAbort: () => agentMode ? abortAgent() : abortStream(),
        onFilesAdd: inputState.handleFilesAdd,
        onFileSelect: e => {
            if (!e.target.files) return;
            inputState.handleFilesAdd(Array.from(e.target.files));
            if (inputState.fileInputRef.current) inputState.fileInputRef.current.value = '';
        },
        onRemoveFile: i => inputState.setAttachedFiles(prev => prev.filter((_, j) => j !== i)),
        onMentionSelect: inputState.handleMentionSelect,
        onMentionClose: () => inputState.setMentionQuery(null),
        onMentionTrigger: inputState.handleMentionTrigger,
        onModeChange: m => {
            setMode(m);
            setThinking(m === 'deep');
        },
        onThinkingChange: setThinking,
        onToggleDashboard: () => {
            setShowDashboard(s => !s);
            setShowWorkspace(false);
            setExpandedArtifact(null);
        },
        onToggleWorkspace: () => {
            setShowWorkspace(s => !s);
            setShowDashboard(false);
            setExpandedArtifact(null);
        },
        showWorkspace,
        onTranscript: text => {
            inputState.setInput(prev => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + text);
            inputState.textareaRef.current?.focus();
        },
        quotaError,
        quotaWarning,
        onOpenPlans,
        uploadError: inputState.uploadError,
        isUploading: inputState.isUploading,
        agentWarnings: (agentWarnings ?? []).filter(w => !dismissedWarnings[w.id]),
        onDismissWarning: id => setDismissedWarnings(prev => ({ ...prev, [id]: true })),
        isVoiceActive: voice.isVoiceActive,
        isVoiceConnecting: voice.isVoiceConnecting,
        isVoiceTalking: voice.isVoiceTalking,
        onToggleVoice: voice.handleToggleVoice,
    };

    // Main Chat Column
    const chatPanel = (
        <main className="flex-1 flex flex-col h-full bg-background relative overflow-hidden">
            {activeProject && (
                <div className="absolute top-2.5 left-4 z-20 pointer-events-auto">
                    <button
                        onClick={() => onProjectClick?.(activeProject.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-background/90 hover:bg-muted border border-border/70 shadow-sm backdrop-blur-md text-foreground/80 hover:text-foreground transition-all duration-150 group cursor-pointer"
                        title={`Project: ${activeProject.title} — click to view project`}
                    >
                        <FolderKanban className="w-3 h-3 text-primary" />
                        <span className="truncate max-w-[150px]">{activeProject.title}</span>
                    </button>
                </div>
            )}

            {isSwitchingChat ? (
                <div className="flex-1 overflow-y-auto">
                    <div className="max-w-3xl mx-auto w-full px-4 pt-8 pb-40 flex flex-col gap-6">
                        <ChatLoadingSkeleton />
                    </div>
                </div>
            ) : voice.isVoiceActive && finalDisplayMessages.length === 0 ? (
                <VoiceSessionOverlay
                    variant="hero"
                    isActive={voice.isVoiceActive}
                    orbState={voice.voiceOrbState}
                    audioLevelRef={voice.voiceAudioLevelRef}
                    isMuted={voice.isVoiceMuted}
                    isConnecting={voice.isVoiceConnecting}
                    isTalking={voice.isVoiceTalking}
                    isTypeOpen={voice.isTypeOpen}
                    onToggleType={() => voice.setIsTypeOpen(prev => !prev)}
                    onToggleMute={voice.toggleVoiceMute}
                    onEndSession={voice.endVoiceSession}
                >
                    {voice.isTypeOpen && (
                        <div className="mt-3">
                            <ChatInput {...chatInputProps} isEmptyState={false} />
                        </div>
                    )}
                </VoiceSessionOverlay>
            ) : finalDisplayMessages.length === 0 ? (
                <ChatEmptyState
                    greeting={greeting}
                    chatInputProps={chatInputProps}
                    aiContextTable={aiContextTable}
                    availableTables={availableTables}
                    onSelectPrompt={prompt => {
                        inputState.setInput(prompt);
                        inputState.textareaRef.current?.focus();
                    }}
                />
            ) : (
                <>
                    <div
                        ref={scrollContainerRef}
                        onScroll={handleScroll}
                        className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full"
                    >
                        <div className={cn(
                            'max-w-3xl mx-auto w-full px-4 pt-8 flex flex-col gap-6',
                            voice.isVoiceActive
                                ? (voice.isTypeOpen ? 'pb-80' : 'pb-64')
                                : 'pb-48 sm:pb-52'
                        )}>
                            {hasMoreOlder && (
                                <div className="flex justify-center -mb-2">
                                    <button
                                        onClick={handleLoadOlderMessages}
                                        disabled={isLoadingOlder}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground bg-muted/60 hover:bg-muted border border-border/60 transition-colors shadow-sm cursor-pointer"
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

                            {finalDisplayMessages.map(msg => (
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
                                    expandedArtifact={expandedArtifact}
                                    onCopy={handleCopy}
                                    onTableClick={onTableClick}
                                    onExpand={handleToggleExpand}
                                    onPin={handlePinArtifact}
                                    isPinnedArtifact={isPinnedArtifact}
                                    onQuickSend={handleQuickSend}
                                />
                            ))}

                            {activeError && !quotaError && (
                                <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
                                    {activeError}
                                </div>
                            )}

                            <div ref={messagesEndRef} className="h-4 shrink-0 scroll-mb-40" />
                        </div>
                    </div>

                    {voice.isVoiceActive ? (
                        <VoiceSessionOverlay
                            variant="docked"
                            isActive={voice.isVoiceActive}
                            orbState={voice.voiceOrbState}
                            audioLevelRef={voice.voiceAudioLevelRef}
                            isMuted={voice.isVoiceMuted}
                            isConnecting={voice.isVoiceConnecting}
                            isTalking={voice.isVoiceTalking}
                            isTypeOpen={voice.isTypeOpen}
                            onToggleType={() => voice.setIsTypeOpen(prev => !prev)}
                            onToggleMute={voice.toggleVoiceMute}
                            onEndSession={voice.endVoiceSession}
                        >
                            {voice.isTypeOpen && (
                                <ChatInput {...chatInputProps} isEmptyState={false} />
                            )}
                        </VoiceSessionOverlay>
                    ) : (
                        <ChatInput {...chatInputProps} isEmptyState={false} />
                    )}

                    <TurnNavigator
                        messages={finalDisplayMessages}
                        activeTurnId={activeTurnId}
                        isAtBottom={isAtBottom}
                        hasNewMessages={hasNewMessages}
                        onSelectTurn={handleSelectTurn}
                        onScrollToBottom={handleScrollToBottom}
                        onScrollToTop={handleScrollToTop}
                    />
                </>
            )}
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

    return (
        <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizablePanel id="chat-main" defaultSize={sidePanel ? 55 : 100} minSize={30}>
                {chatPanel}
            </ResizablePanel>
            {sidePanel && (
                <>
                    <ResizableHandle withHandle />
                    <ResizablePanel id="chat-side" defaultSize={45} minSize={25}>
                        {sidePanel}
                    </ResizablePanel>
                </>
            )}
        </ResizablePanelGroup>
    );
}
