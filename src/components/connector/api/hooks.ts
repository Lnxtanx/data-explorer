// =============================================================================
// PostgreSQL Connector React Query Hooks
// Centralized state management for database proxy connectors
// =============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../auth/context';
import {
    listConnectors,
    verifyConnectorCredentials,
    revokeConnector,
    removeConnector,
    getConnectorDatabases,
    getExecutionLogs,
    getHealthEvents,
} from './crud';
import { connectionKeys } from './connectionKeys';
import { dataExplorerKeys } from '../../data-explorer/api/hooks';

// ─── Query Keys ──────────────────────────────────────────────────────────────

export const connectorKeys = {
    all: ['connectors'] as const,
    list: ['connectors', 'list'] as const,
    detail: (id: string) => ['connectors', id] as const,
    databases: (connectorId: string) => ['connectors', connectorId, 'databases'] as const,
    logs: (connectionId?: string | null) => ['connectors', 'logs', connectionId || 'all'] as const,
    health: (connectorId?: string | null, timeRange: string = '24h') => ['connectors', 'health', connectorId || 'all', timeRange] as const,
};

// ─── Queries ─────────────────────────────────────────────────────────────────

/**
 * List all registered PostgreSQL database proxy connectors.
 * Polls every 10s to keep online status updated.
 */
export function useConnectors() {
    const { user } = useAuth();
    return useQuery({
        queryKey: connectorKeys.list,
        queryFn: async () => {
            const res = await listConnectors();
            return res.agents || [];
        },
        enabled: Boolean(user?.id),
        refetchInterval: user ? 10_000 : false,
        staleTime: 5_000,
    });
}

/**
 * Get database list from a live proxy connector.
 */
export function useConnectorDatabases(connectorId: string | null) {
    return useQuery({
        queryKey: connectorKeys.databases(connectorId || ''),
        queryFn: async () => {
            const res = await getConnectorDatabases(connectorId!);
            return res.databases || [];
        },
        enabled: !!connectorId,
        staleTime: 30_000,
    });
}

/**
 * Fetch proxy execution logs with live polling.
 */
export function useExecutionLogs(connectionId?: string | null) {
    return useQuery({
        queryKey: connectorKeys.logs(connectionId),
        queryFn: () => getExecutionLogs(connectionId),
        staleTime: 1_000,
        refetchInterval: 3_000,
        refetchOnWindowFocus: true,
    });
}

/**
 * Fetch health events and latency metrics with live polling.
 */
export function useHealthEvents(connectorId?: string | null, timeRange: string = '24h') {
    return useQuery({
        queryKey: connectorKeys.health(connectorId, timeRange),
        queryFn: () => getHealthEvents(connectorId, timeRange),
        staleTime: 2_000,
        refetchInterval: 5_000,
        refetchOnWindowFocus: true,
    });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

/**
 * Verify connector credentials pasted by the user.
 */
export function useVerifyConnector() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({
            connectionKey,
            connectorId,
            machineLabel,
        }: {
            connectionKey: string;
            connectorId: string;
            machineLabel?: string;
        }) => verifyConnectorCredentials(connectionKey, connectorId, machineLabel),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: connectorKeys.list });
        },
    });
}

/**
 * Revoke a connector.
 */
export function useRevokeConnector() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (registrationId: string) => revokeConnector(registrationId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: connectorKeys.all });
            queryClient.invalidateQueries({ queryKey: connectionKeys.all });
        },
    });
}

/**
 * Permanently remove a connector registration.
 */
export function useRemoveConnector() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (registrationId: string) => removeConnector(registrationId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: connectorKeys.all });
            queryClient.invalidateQueries({ queryKey: connectionKeys.all });
            queryClient.invalidateQueries({ queryKey: dataExplorerKeys.all });
        },
    });
}



