// =============================================================================
// Connection listing for the Data Explorer.
// Exports: the Connection type, listConnections(), useConnections(), and the
// connectionKeys factory (re-exported from ./connectionKeys).
//
// Phase 4 moved this in from lib/api/data/connection/ and flattened the old
// 4-module connector <-> connection cycle into this folder. connectionKeys lives
// in its own leaf because components/connector/api/hooks.ts needs it without
// pulling in useAuth + react-query through this module.
// =============================================================================

import type { Connection } from './connectionTypes';
export type { Connection } from './connectionTypes';
export { listConnections } from './connectionCrud';

import { useQuery } from '@tanstack/react-query';
import { listConnections } from './connectionCrud';
import { useAuth } from '../../auth/context';
import { connectionKeys } from './connectionKeys';
export { connectionKeys };

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

