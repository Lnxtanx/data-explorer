// =============================================================================
// Slim Connection Module — Data Explorer only
// Only exports what ConnectionSelector needs: list + types + useConnections.
// Does NOT include: migrations, schema pull/diff, security checks, health events.
// =============================================================================

export type { Connection, ConnectionCredentials } from './types';
export { listConnections } from './crud';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
    listConnections, 
    testConnection, 
    saveConnection, 
    updateConnection, 
    deleteConnection 
} from './crud';
import { useAuth } from '@/components/auth/AuthProvider';
import type { ConnectionCredentials } from './types';

export const connectionKeys = {
    all: ['connections'] as const,
    list: (userId?: string) => ['connections', 'list', userId || 'anonymous'] as const,
};

export function useConnections() {
    const { user } = useAuth();

    return useQuery({
        queryKey: connectionKeys.list(user?.id),
        queryFn: () => listConnections(),
        select: (data) => data.connections,
        staleTime: 30_000, // 30s
    });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export function useTestConnection() {
    return useMutation({
        mutationFn: (credentials: ConnectionCredentials) => testConnection(credentials),
    });
}

export function useSaveConnection() {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    return useMutation({
        mutationFn: ({ name, credentials }: { name: string; credentials: ConnectionCredentials }) =>
            saveConnection(name, credentials),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: connectionKeys.list(user?.id) });
        },
    });
}

export function useUpdateConnection() {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    return useMutation({
        mutationFn: ({ id, name, credentials }: { id: string; name: string; credentials: ConnectionCredentials }) =>
            updateConnection(id, name, credentials),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: connectionKeys.list(user?.id) });
        },
    });
}

export function useDeleteConnection() {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    return useMutation({
        mutationFn: (id: string) => deleteConnection(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: connectionKeys.list(user?.id) });
        },
    });
}
