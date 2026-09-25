// =============================================================================
// useAIChats
// React Query hooks for AI chat history management.
//
// Hooks exported:
//   useAIChatList    — paginated list of user's chats (for sidebar)
//   useAIChatMessages — messages for a specific chat (for loading history)
//   useDeleteAIChat  — mutation to soft-delete a chat
//   useRunQuery      — mutation to execute a validated SELECT query
//   useSaveQuery     — mutation to persist a saved query
//   useAIHealth      — query to check AI backend availability
// =============================================================================

import {
    useQuery,
    useMutation,
    useQueryClient,
  } from '@tanstack/react-query';
import { toast } from 'sonner';
import { projectQueryKeys } from './useProjects';

import {
    listChats,
    getChatMessages,
    deleteChat,
    updateChat,
    listArtifacts,
    type ListChatsResponse,
    type ChatMessagesResponse,
    type UpdateChatParams,
    type UpdateChatResponse,
    type ArtifactHistoryResponse,
} from '../api/index';

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const aiQueryKeys = {
    all: ['ai'] as const,
    /** Prefix covering every chat list, for bulk invalidation. */
    chatsRoot: ['ai', 'chats'] as const,
    chats: (connectionId?: string) => ['ai', 'chats', connectionId ?? 'all'] as const,
    messages: (chatId: string, before?: string | null) =>
        before ? (['ai', 'chats', chatId, 'messages', before] as const) : (['ai', 'chats', chatId, 'messages'] as const),
    artifacts: (connectionId?: string, type?: string) => ['ai', 'artifacts', connectionId ?? 'all', type ?? 'all'] as const,
    health: () => ['ai', 'health'] as const,
};





// =============================================================================
// useAIChatList
// Fetch the user's chat history, optionally scoped to a connection.
// =============================================================================

export function useAIChatList(params?: {
    connectionId?: string;
    limit?: number;
    offset?: number;
    useCase?: string;
    enabled?: boolean;
}) {
    return useQuery<ListChatsResponse, Error>({
        queryKey: [...aiQueryKeys.chats(params?.connectionId), params?.useCase ?? 'data_explorer'],
        queryFn: () => listChats({
            connectionId: params?.connectionId,
            limit: params?.limit ?? 20,
            offset: params?.offset ?? 0,
            useCase: params?.useCase ?? 'data_explorer',
        }),
        enabled: params?.enabled !== false,
        staleTime: 30_000,        // 30s — chat list doesn't change that fast
        gcTime: 5 * 60_000,       // Keep in cache for 5 min
    });
}

// =============================================================================
// useAIChatMessages
// Fetch all messages for a specific chat (to restore conversation context).
// =============================================================================

export function useAIChatMessages(
    chatId: string | null,
    options?: {
        limit?: number;
        before?: string | null;
        slim?: boolean;
        enabled?: boolean;
    }
) {
    return useQuery<ChatMessagesResponse, Error>({
        queryKey: aiQueryKeys.messages(chatId ?? '', options?.before),
        queryFn: () => getChatMessages(chatId!, {
            limit: options?.limit,
            before: options?.before,
            slim: options?.slim,
        }),
        enabled: Boolean(chatId) && options?.enabled !== false,
        staleTime: 60_000,   // Messages are immutable once saved
        gcTime: 10 * 60_000,
    });
}

// =============================================================================
// useUpdateAIChat
// Mutation to update chat properties (title, project).
// =============================================================================

export function useUpdateAIChat() {
    const queryClient = useQueryClient();

    return useMutation<UpdateChatResponse, Error, { chatId: string; updates: UpdateChatParams }>({
        mutationFn: ({ chatId, updates }) => updateChat(chatId, updates),
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: aiQueryKeys.chatsRoot });
            queryClient.invalidateQueries({ queryKey: projectQueryKeys.all });
            if (variables.chatId) {
                queryClient.invalidateQueries({ queryKey: aiQueryKeys.messages(variables.chatId) });
            }
        },
    });
}

// =============================================================================
// useDeleteAIChat
// Mutation to soft-delete a chat. Invalidates the chat list on success.
// =============================================================================

export function useDeleteAIChat() {
    const queryClient = useQueryClient();

    return useMutation<{ success: boolean }, Error, string>({
        mutationFn: (chatId: string) => deleteChat(chatId),
        onSuccess: () => {
            // Invalidate all chat list variants and project queries
            queryClient.invalidateQueries({ queryKey: aiQueryKeys.chatsRoot });
            queryClient.invalidateQueries({ queryKey: projectQueryKeys.all });
            toast.success('Conversation deleted from your history.');
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to delete conversation');
        },
    });
}

// =============================================================================
// useArtifactHistory
// Fetch recent artifacts across all chats for the artifact history browser.
// =============================================================================
//
// Phase 1 removed useRunQuery, useSaveQuery and useAIHealth: all three had zero
// consumers. Their API functions (runQuery, saveQuery, checkAIHealth) remain in
// lib/api/ai, so they can be re-wired without a transport change.

// =============================================================================
// useArtifactHistory
// Fetch recent artifacts across all chats for the artifact history browser.
// =============================================================================
//
// Phase 1 removed useRunQuery, useSaveQuery and useAIHealth: all three had zero
// consumers. Their API functions (runQuery, saveQuery, checkAIHealth) remain in
// lib/api/ai, so they can be re-wired without a transport change.

export function useArtifactHistory(params?: {
    connectionId?: string;
    type?: string;
    search?: string;
    limit?: number;
    offset?: number;
}) {
    return useQuery<ArtifactHistoryResponse, Error>({
        queryKey: aiQueryKeys.artifacts(params?.connectionId, params?.type),
        queryFn: () => listArtifacts({
            connectionId: params?.connectionId,
            type: params?.type,
            search: params?.search,
            limit: params?.limit ?? 30,
            offset: params?.offset ?? 0,
        }),
        staleTime: 30_000,
        gcTime: 5 * 60_000,
    });
}




