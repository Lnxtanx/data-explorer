// =============================================================================
// Resona AI Side Panel — Dashboard AI Orchestrator
// Interactive right-side drawer dedicated exclusively to Dashboard AI.
// OpenCode / Claude Code style interactive workspace for granular mutations,
// metric inspection Q&A, and full-fidelity dashboard generation sessions.
// =============================================================================

import { ResonaAIHeader } from './ResonaAIHeader';
import { ResonaAIMessageList } from './ResonaAIMessageList';
import { ResonaAIInput } from './ResonaAIInput';
import { type SidePanelMessage } from './ResonaAIMessageItem';
import { type GenerationProgress } from '../hooks/useDashboard';
import { useSidePanelResize } from './useSidePanelResize';
import { useSidePanelSessions } from './useSidePanelSessions';
import { useSidePanelChat } from './useSidePanelChat';
import { useParentGenerationSync } from './useParentGenerationSync';
import { useAIUsage, getProactiveQuotaError, getQuotaWarning } from '../../ai/hooks/useAIUsage';
import { useConnections } from '@/components/connector/api/useConnections';
import { cn } from '@/lib/utils';
import { useEffect, useRef, useState } from 'react';

export interface ResonaAISidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  onExpandFullScreen?: () => void;
  onOpenPlans?: () => void;
  connectionId?: string;
  databaseName?: string;
  // Parent-driven generation state (from DataExplorerLayout's useGenerateDashboard)
  isDashboardGenerating?: boolean;
  dashboardGenerationProgress?: GenerationProgress | null;
  activeRunId?: string | null;
  pendingInquiry?: { id: string; message: string } | null;
  onClearPendingInquiry?: () => void;
}

export function ResonaAISidePanel({
  isOpen,
  onClose,
  onExpandFullScreen,
  onOpenPlans,
  connectionId,
  databaseName,
  isDashboardGenerating = false,
  dashboardGenerationProgress = null,
  activeRunId = null,
  pendingInquiry = null,
  onClearPendingInquiry,
}: ResonaAISidePanelProps) {
  const [inputText, setInputText] = useState('');

  // Quota & credits status (matching AIChatMain)
  const { data: usageStatus } = useAIUsage();
  const proactiveQuotaError = getProactiveQuotaError(usageStatus);
  const quotaWarning = getQuotaWarning(usageStatus);
  const quotaError = proactiveQuotaError;

  // Active connector connection online status
  const { data: connections } = useConnections();
  const activeConn = connections?.find((c) => c.id === connectionId);
  const isConnectorOnline = activeConn ? Boolean(activeConn.is_online) : true;

  // 1. Shared conversation messages state
  const [localMessages, setLocalMessages] = useState<SidePanelMessage[]>([]);
  const localMessagesRef = useRef<SidePanelMessage[]>([]);
  useEffect(() => {
    localMessagesRef.current = localMessages;
  }, [localMessages]);

  // 2. Drag-to-resize & width persistence
  const { panelWidth, isResizing, handleMouseDown, handleResetWidth } = useSidePanelResize();

  // 3. Durable sessions & history manager
  const sessionsManager = useSidePanelSessions({
    connectionId,
    localMessages,
    setLocalMessages,
    localMessagesRef,
    isGenerating: false, // updated via chat
  });

  // 4. Chat execution & SSE stream orchestrator
  const chat = useSidePanelChat({
    connectionId,
    databaseName,
    isConnectorOnline,
    quotaError,
    selectedRunId: sessionsManager.selectedRunId,
    setSelectedRunId: sessionsManager.setSelectedRunId,
    currentSessionId: sessionsManager.currentSessionId,
    setCurrentSessionId: sessionsManager.setCurrentSessionId,
    runState: sessionsManager.runState,
    messagesBySessionRef: sessionsManager.messagesBySessionRef,
    refetchSessions: sessionsManager.refetchSessions,
    isDashboardGenerating,
    pendingInquiry,
    onClearPendingInquiry,
    localMessages,
    setLocalMessages,
    localMessagesRef,
  });

  // 5. Mirror parent-driven generations (e.g. from empty state Regenerate)
  useParentGenerationSync({
    isDashboardGenerating,
    dashboardGenerationProgress,
    activeRunId,
    databaseName,
    setLocalMessages,
    setSelectedRunId: sessionsManager.setSelectedRunId,
    refetchSessions: sessionsManager.refetchSessions,
    hasAutoSelectedRef: sessionsManager.hasAutoSelectedRef,
  });

  if (!isOpen) return null;

  const isWorking = chat.isSidePanelGenerating || isDashboardGenerating;

  const handleSendMessage = (textToSend?: string) => {
    const msg = (textToSend ?? inputText).trim();
    if ((!msg && chat.attachedFiles.length === 0) || isWorking) return;
    chat.handleContinueDashboard(msg);
    setInputText('');
  };

  return (
    <>
      {/* Full-screen blocker during drag to prevent iframes from capturing mouse events */}
      {isResizing && (
        <div className="fixed inset-0 z-[9999] cursor-col-resize select-none pointer-events-auto" />
      )}

      <div
        style={{ width: `${panelWidth}px` }}
        className="relative h-full shrink-0 flex flex-col transition-[width] duration-75 ease-out select-text pointer-events-auto z-20"
      >
        {/* Drag-to-Resize Handle */}
        <div
          onMouseDown={handleMouseDown}
          onDoubleClick={handleResetWidth}
          title="Drag to resize · Double click to reset width"
          className={cn(
            'absolute -left-1 top-0 bottom-0 w-2 cursor-col-resize flex items-center justify-center z-30 select-none group',
            isResizing && 'bg-primary/20'
          )}
        >
          <div
            className={cn(
              'w-0.5 h-8 rounded-full transition-all duration-200',
              isResizing ? 'bg-primary h-12 w-1' : 'bg-transparent group-hover:bg-primary/60 group-hover:h-10'
            )}
          />
        </div>

        {/* Main Side Panel Aside */}
        <aside className="flex flex-col h-full flex-1 bg-card border-l border-border overflow-hidden">
          <ResonaAIHeader
            databaseName={databaseName}
            isConnectorOnline={isConnectorOnline}
            onClose={onClose}
            onNewChat={() => {
              chat.cancelDashboard();
              chat.clearAttachedFiles();
              sessionsManager.handleNewChat();
            }}
            onExpandFullScreen={onExpandFullScreen}
            sessions={sessionsManager.historyItems}
            onSelectSession={sessionsManager.handleSelectSession}
            onDeleteSession={sessionsManager.handleDeleteSession}
          />

          <ResonaAIMessageList
            messages={localMessages}
            isLoading={sessionsManager.isRunStateLoading && localMessages.length === 0}
            isStreaming={isWorking}
            databaseName={databaseName}
            connectionId={connectionId}
            onSelectPrompt={handleSendMessage}
          />

          <ResonaAIInput
            value={inputText}
            onChange={setInputText}
            onSubmit={() => handleSendMessage()}
            isStreaming={isWorking}
            onAbort={chat.cancelDashboard}
            databaseName={databaseName}
            isConnectorOnline={isConnectorOnline}
            quotaError={quotaError}
            quotaWarning={quotaWarning}
            onOpenPlans={onOpenPlans}
            placeholder="Ask Resona Dashboard AI about metrics or charts…"
            mode={chat.agentMode}
            thinking={chat.thinking}
            onModeChange={chat.setAgentMode}
            onThinkingChange={chat.setThinking}
            attachedFiles={chat.attachedFiles}
            onFileSelect={chat.handleFileSelect}
            onFilesAdd={chat.handleFilesAdd}
            onRemoveFile={chat.handleRemoveFile}
            isUploading={chat.isUploading}
          />
        </aside>
      </div>
    </>
  );
}
