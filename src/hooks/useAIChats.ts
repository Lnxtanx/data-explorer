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
    type UseQueryOptions,
} from '@tanstack/react-query';

import {
    listChats,
    getChatMessages,
    deleteChat,
    runQuery,
    saveQuery,
    checkAIHealth,
    listArtifacts,
    type ListChatsResponse,
    type ChatMessagesResponse,
    type QueryRunResult,
    type SavedQuery,
    type AIHealthResponse,
    type ArtifactHistoryResponse,
} from '../lib/api/ai';

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const aiQueryKeys = {
    all: ['ai'] as const,
    chats: (connectionId?: string) => ['ai', 'chats', connectionId ?? 'all'] as const,
    messages: (chatId: string) => ['ai', 'chats', chatId, 'messages'] as const,
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
    enabled?: boolean;
}) {
    return useQuery<ListChatsResponse, Error>({
        queryKey: aiQueryKeys.chats(params?.connectionId),
        queryFn: () => listChats({
            connectionId: params?.connectionId,
            limit: params?.limit ?? 20,
            offset: params?.offset ?? 0,
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
    options?: Pick<UseQueryOptions<ChatMessagesResponse, Error>, 'enabled'>
) {
    return useQuery<ChatMessagesResponse, Error>({
        queryKey: aiQueryKeys.messages(chatId ?? ''),
        queryFn: () => getChatMessages(chatId!),
        enabled: Boolean(chatId) && options?.enabled !== false,
        staleTime: 60_000,   // Messages are immutable once saved
        gcTime: 10 * 60_000,
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
            // Invalidate all chat list variants
            queryClient.invalidateQueries({ queryKey: ['ai', 'chats'] });
        },
    });
}

// =============================================================================
// useRunQuery
// Execute an AI-generated SELECT query against a DB connection.
// =============================================================================

export function useRunQuery() {
    return useMutation<QueryRunResult, Error, {
        connectionId: string;
        sql: string;
        limit?: number;
    }>({
        mutationFn: runQuery,
    });
}

// =============================================================================
// useSaveQuery
// Persist an AI-generated query for future reuse.
// =============================================================================

export function useSaveQuery() {
    return useMutation<{ success: boolean; query: SavedQuery }, Error, {
        connectionId?: string;
        title: string;
        sql: string;
        schemaName?: string;
        chatMessageId?: string;
        tags?: string[];
    }>({
        mutationFn: saveQuery,
    });
}

// =============================================================================
// useAIHealth
// Poll AI backend availability (used to show "AI unavailable" banner).
// =============================================================================

export function useAIHealth(options?: { enabled?: boolean }) {
    return useQuery<AIHealthResponse, Error>({
        queryKey: aiQueryKeys.health(),
        queryFn: checkAIHealth,
        enabled: options?.enabled !== false,
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        retry: false,   // Don't retry health checks aggressively
    });
}

// =============================================================================
// useArtifactHistory
// Fetch recent artifacts across all chats for the artifact history browser.
// =============================================================================

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
