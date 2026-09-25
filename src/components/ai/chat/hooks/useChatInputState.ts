// =============================================================================
// src/components/ai/chat/hooks/useChatInputState.ts
// Handles input drafting, textarea height, mentions, and file attachment queue
// =============================================================================

import { useState, useRef, useEffect, useCallback } from 'react';
import { getDraft, saveDraft, clearDraft } from '../../storage/chatDrafts';
import { validateFiles, MAX_FILE_COUNT } from '../utils/fileValidation';

interface UseChatInputStateOptions {
    chatId?: string | null;
    connectionId?: string;
    availableTables: string[];
    onSend: () => void;
}

export function useChatInputState({
    chatId,
    connectionId,
    availableTables,
    onSend,
}: UseChatInputStateOptions) {
    const [input, setInput] = useState(() => getDraft(chatId, connectionId));
    const inputRef = useRef(input);
    inputRef.current = input;

    const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
    const [scrollTop, setScrollTop] = useState(0);
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const activeTargetRef = useRef({ chatId, connectionId });
    const draftSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const uploadErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Single auto-dismiss helper for uploadError
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

    // Debounced draft save helper
    const queueSaveDraft = useCallback((text: string, cId = chatId, connId = connectionId) => {
        if (draftSaveTimeoutRef.current) clearTimeout(draftSaveTimeoutRef.current);
        draftSaveTimeoutRef.current = setTimeout(() => {
            saveDraft(cId, connId, text);
        }, 300);
    }, [chatId, connectionId]);

    // Save previous draft and load incoming draft on conversation/connection switch
    useEffect(() => {
        const prev = activeTargetRef.current;
        if (prev.chatId !== chatId || prev.connectionId !== connectionId) {
            if (draftSaveTimeoutRef.current) clearTimeout(draftSaveTimeoutRef.current);
            saveDraft(prev.chatId, prev.connectionId, inputRef.current);

            const restored = getDraft(chatId, connectionId);
            setInput(restored);
            inputRef.current = restored;
            setAttachedFiles([]);
            setMentionQuery(null);
            showUploadError(null);
            activeTargetRef.current = { chatId, connectionId };
        }
    }, [chatId, connectionId, showUploadError]);

    // Keep textarea height synchronized whenever input changes programmatically
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
        }
    }, [input]);

    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        setInput(val);
        queueSaveDraft(val);
        e.target.style.height = 'auto';
        e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
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
            onSend();
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

    const handleFilesAdd = useCallback((filesToAdd: File[]) => {
        const { valid, errors } = validateFiles(filesToAdd);
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
    }, [showUploadError]);

    const resetInput = useCallback(() => {
        clearDraft(chatId, connectionId);
        setInput('');
        setAttachedFiles([]);
        setScrollTop(0);
        showUploadError(null);
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }, [chatId, connectionId, showUploadError]);

    return {
        input,
        setInput,
        attachedFiles,
        setAttachedFiles,
        scrollTop,
        setScrollTop,
        mentionQuery,
        setMentionQuery,
        uploadError,
        showUploadError,
        isUploading,
        setIsUploading,
        textareaRef,
        fileInputRef,
        handleInput,
        handleMentionSelect,
        handleMentionTrigger,
        handleKeyDown,
        handleFilesAdd,
        resetInput,
    };
}
