// =============================================================================
// src/components/ai/chat/hooks/useChatSendOrchestrator.ts
// Handles file uploading, clarification resumption, prompt dispatch (Agent/Stream),
// and local optimistic message state updates.
// =============================================================================

import { useCallback } from 'react';
import { logger } from '@/lib/logger';
import { uploadFilesForAI } from '../../api/index';
import { clearDraft } from '../../storage/chatDrafts';
import type { AgentArtifact } from '../../hooks/useAIAgent';
import type { AgentMode } from '../../models/ModeSelector';
import type { LocalMessage } from '../types';
import type { useChatInputState } from './useChatInputState';

interface UseChatSendOrchestratorOptions {
    chatId?: string | null;
    connectionId?: string;
    projectId?: string | null;
    activeProjectId?: string | null;
    dbName?: string;
    aiContextTable?: string | null;
    aiContextSchema?: string;
    availableTables: string[];
    agentMode: boolean;
    mode: AgentMode;
    thinking: boolean;
    isStreaming: boolean;
    hasPausedRun: boolean;
    quotaError?: string | null;
    resumeAgent: (answer: string) => Promise<boolean>;
    sendAgent: (params: any) => Promise<any>;
    sendStream: (params: any) => Promise<any>;
    localMessages: LocalMessage[];
    setLocalMessages: React.Dispatch<React.SetStateAction<LocalMessage[]>>;
    inputState: ReturnType<typeof useChatInputState>;
    setWorkspaceRefreshCount: React.Dispatch<React.SetStateAction<number>>;
}

export function useChatSendOrchestrator({
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
}: UseChatSendOrchestratorOptions) {
    const handleQuickSend = useCallback(async (message: string, files?: File[]) => {
        if (!message.trim() && !(files && files.length > 0)) return;
        if (isStreaming) return;

        clearDraft(chatId, connectionId);

        // Resume active clarification run if paused
        if (hasPausedRun) {
            const resumed = await resumeAgent(message);
            if (resumed) {
                setLocalMessages(prev => {
                    const updated = prev.map(m => {
                        if (m.role === 'assistant' && m.artifacts?.some(a => a.type === 'clarification')) {
                            return {
                                ...m,
                                artifacts: m.artifacts.map(a =>
                                    a.type === 'clarification' ? { ...a, answered: true, answer: message } : a
                                ),
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
        }

        const effectiveSchema = aiContextSchema || 'public';
        const effectiveTables = aiContextTable ? [aiContextTable] : [];
        const filesToUpload = files ? [...files] : [];
        const userMessageId = `user-${Date.now()}`;

        setLocalMessages(prev => [
            ...prev,
            { id: userMessageId, role: 'user', content: message, files: filesToUpload.length > 0 ? ['uploading…'] : [] },
            { id: 'streaming', role: 'assistant', content: '', isStreaming: true, isAgent: agentMode },
        ]);

        let fileIds: string[] = [];
        let uploadedFileNames: string[] = [];
        let userAttachmentArtifacts: AgentArtifact[] = [];

        if (filesToUpload.length > 0) {
            try {
                const uploadRes = await uploadFilesForAI(filesToUpload, { chatId: chatId ?? undefined });
                if (uploadRes.ok && uploadRes.files && uploadRes.files.length > 0) {
                    fileIds = uploadRes.files.map(f => f.file_id);
                    uploadedFileNames = uploadRes.files.map(f => f.filename);
                    userAttachmentArtifacts = uploadRes.files.map(f => ({
                        type: 'attachment',
                        id: f.file_id,
                        file_id: f.file_id,
                        fileName: f.filename,
                        filename: f.filename,
                        fileType: f.file_type,
                        fileSize: f.size_bytes,
                        size_bytes: f.size_bytes,
                        downloadUrl: f.download_url || `/api/ai/files/${f.file_id}/content`,
                        preview: f.preview,
                        rawContent: (f as any).text_content,
                        extracted_components: f.extracted_components,
                    }));
                }
            } catch (err) {
                logger.warn('[useChatSendOrchestrator] QuickSend failed to upload files:', err);
            } finally {
                setWorkspaceRefreshCount(c => c + 1);
                setLocalMessages(prev => prev.map(m =>
                    m.id === userMessageId
                        ? {
                            ...m,
                            files: uploadedFileNames.length > 0 ? uploadedFileNames : undefined,
                            artifacts: userAttachmentArtifacts.length > 0 ? userAttachmentArtifacts : undefined,
                          }
                        : m
                ));
            }
        }

        const history = localMessages.filter(m => !m.isStreaming).map(m => ({ role: m.role, content: m.content }));
        if (agentMode && connectionId) {
            await sendAgent({
                connectionId,
                message,
                chatId: chatId ?? undefined,
                schemaName: effectiveSchema,
                databaseName: dbName,
                history,
                mentionedTables: effectiveTables,
                agentMode: mode,
                thinking,
                projectId,
                fileIds,
            });
        }
    }, [
        isStreaming,
        chatId,
        connectionId,
        hasPausedRun,
        aiContextSchema,
        aiContextTable,
        agentMode,
        setLocalMessages,
        localMessages,
        sendAgent,
        dbName,
        mode,
        thinking,
        projectId,
        resumeAgent,
        setWorkspaceRefreshCount,
    ]);

    const handleSend = useCallback(async () => {
        const { input, attachedFiles, resetInput, setIsUploading, showUploadError } = inputState;
        if ((!input.trim() && attachedFiles.length === 0) || isStreaming) return;

        // Resume active clarification run if paused
        if (hasPausedRun) {
            const answer = input.trim();
            const resumed = await resumeAgent(answer);
            if (resumed) {
                resetInput();
                setLocalMessages(prev => {
                    const updated = prev.map(m => {
                        if (m.role === 'assistant' && m.artifacts?.some(a => a.type === 'clarification')) {
                            return {
                                ...m,
                                artifacts: m.artifacts.map(a =>
                                    a.type === 'clarification' ? { ...a, answered: true, answer } : a
                                ),
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
                return;
            }
        }

        if (quotaError) {
            logger.warn('[useChatSendOrchestrator] Send blocked: quota exhausted');
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

        setLocalMessages(prev => [
            ...prev,
            {
                id: userMessageId,
                role: 'user',
                content: messageText,
                // Show the REAL filenames while they upload. This used to be the
                // literal string 'uploading…', which the message renderer had to
                // display as if it were a file name.
                files: filesToUpload.map((f) => f.name),
                attachmentsUploading: filesToUpload.length > 0,
                mentionedTable: effectiveTables[0],
            },
            { id: 'streaming', role: 'assistant', content: '', isStreaming: true, isAgent: agentMode },
        ]);

        resetInput();

        let fileIds: string[] = [];
        let uploadedFileNames: string[] = [];
        let userAttachmentArtifacts: AgentArtifact[] = [];

        if (filesToUpload.length > 0) {
            setIsUploading(true);
            try {
                const uploadRes = await uploadFilesForAI(filesToUpload, { chatId: chatId ?? undefined });
                if (uploadRes.ok && uploadRes.files && uploadRes.files.length > 0) {
                    fileIds = uploadRes.files.map(f => f.file_id);
                    uploadedFileNames = uploadRes.files.map(f => f.filename);
                    userAttachmentArtifacts = uploadRes.files.map(f => ({
                        type: 'attachment',
                        id: f.file_id,
                        file_id: f.file_id,
                        fileName: f.filename,
                        filename: f.filename,
                        fileType: f.file_type,
                        fileSize: f.size_bytes,
                        size_bytes: f.size_bytes,
                        downloadUrl: f.download_url || `/api/ai/files/${f.file_id}/content`,
                        preview: f.preview,
                        rawContent: (f as any).text_content,
                        extracted_components: f.extracted_components,
                    }));
                } else {
                    showUploadError('File upload failed — files were not attached to this message.');
                }
            } catch (err) {
                logger.warn('[useChatSendOrchestrator] Failed to upload attached files:', err);
                showUploadError('File upload failed. Your message will be sent without file context.');
            } finally {
                setIsUploading(false);
                setWorkspaceRefreshCount(c => c + 1);
                setLocalMessages(prev => prev.map(m =>
                    m.id === userMessageId
                        ? {
                            ...m,
                            files: uploadedFileNames.length > 0 ? uploadedFileNames : undefined,
                            artifacts: userAttachmentArtifacts.length > 0 ? userAttachmentArtifacts : undefined,
                            attachmentsUploading: false,
                          }
                        : m
                ));
            }
        }

        const history = localMessages.filter(m => !m.isStreaming).map(m => ({ role: m.role, content: m.content }));

        if (agentMode && connectionId) {
            await sendAgent({
                connectionId,
                message: messageText,
                chatId: chatId ?? undefined,
                schemaName: effectiveSchema,
                databaseName: dbName,
                history,
                mentionedTables: effectiveTables,
                agentMode: mode,
                thinking,
                projectId: activeProjectId ?? undefined,
                fileIds,
            });
        } else {
            await sendStream({
                connectionId,
                chatId: chatId ?? undefined,
                message: messageText,
                history,
                mentionedTables: effectiveTables,
                tableContext: effectiveTables.length > 0 ? { tableName: effectiveTables[0], schemaName: effectiveSchema } : undefined,
                projectId: activeProjectId ?? undefined,
                fileIds,
            });
        }
    }, [
        inputState,
        isStreaming,
        hasPausedRun,
        resumeAgent,
        setLocalMessages,
        quotaError,
        availableTables,
        aiContextTable,
        aiContextSchema,
        agentMode,
        localMessages,
        connectionId,
        sendAgent,
        dbName,
        mode,
        thinking,
        activeProjectId,
        sendStream,
        chatId,
        setWorkspaceRefreshCount,
    ]);

    return {
        handleSend,
        handleQuickSend,
    };
}
