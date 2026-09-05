// =============================================================================
// Slim Connection Module — Data Explorer only
// Only exports what ConnectionSelector needs: list + types + useConnections.
// Does NOT include: migrations, schema pull/diff, security checks, health events.
// =============================================================================

import type { Connection } from './types';
export type { Connection } from './types';
export { listConnections } from './crud';

import { useQuery } from '@tanstack/react-query';
import { listConnections } from './crud';
import { useAuth } from '@/components/auth/AuthProvider';

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
        enabled: Boolean(user?.id),
        staleTime: 2_000, // 2s - quick re-validation on focus or dropdown open
        refetchInterval: (query) => {
            // If user is logged in, poll every 4s when no databases/online agents, or 8s continuously
            const data = query.state.data as { connections?: Connection[] } | Connection[] | undefined;
            const conns = Array.isArray(data) ? data : data?.connections;
            const hasOnline = conns && conns.length > 0 && conns.some((c) => c.is_online);
            return hasOnline ? 8_000 : 4_000;
        },
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
    });
}
