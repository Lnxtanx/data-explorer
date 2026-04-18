// =============================================================================
// Slim Connection Module — Data Explorer only
// Only exports what ConnectionSelector needs: list + types + useConnections.
// Does NOT include: migrations, schema pull/diff, security checks, health events.
// =============================================================================

export type { Connection, ConnectionCredentials } from './types';
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
        staleTime: 30_000, // 30s
    });
}
