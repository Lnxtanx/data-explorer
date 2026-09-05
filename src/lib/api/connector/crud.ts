// =============================================================================
// PostgreSQL Connector CRUD API
// All operations talk to server-side backend endpoints
// Database credentials stay 100% on the user's host machine
// =============================================================================

import { get, post, del } from '../client';
import type {
    DatabaseConnector,
    DiscoveredDatabase,
    ConnectorVerifyResult,
    ExecutionEvent,
    HealthEvent,
    HealthMetricsResult,
} from './types';

/**
 * List all registered database proxy connectors for the current user
 */
export async function listConnectors(): Promise<{ success: boolean; agents: DatabaseConnector[] }> {
    return get<{ success: boolean; agents: DatabaseConnector[] }>('/api/agent/status');
}

/**
 * Verify connector credentials pasted by user in setup wizard
 */
export async function verifyConnectorCredentials(
    connectionKey: string,
    connectorId: string,
    machineLabel?: string
): Promise<ConnectorVerifyResult> {
    return post<ConnectorVerifyResult>('/api/agent/register/token', {
        agent_token: connectionKey,
        agent_id: connectorId,
        machine_label: machineLabel,
    });
}

/**
 * Revoke a database proxy connector's credentials (soft revoke)
 */
export async function revokeConnector(connectorId: string): Promise<{ success: boolean; message: string }> {
    return post<{ success: boolean; message: string }>(`/api/agent/revoke/${connectorId}`, {});
}

/**
 * Permanently remove a connector registration and its associated tokens
 */
export async function removeConnector(connectorId: string): Promise<{ success: boolean; message: string }> {
    return del<{ success: boolean; message: string }>(`/api/agent/${connectorId}`);
}

/**
 * Discover databases exposed by a connected proxy agent
 */
export async function getConnectorDatabases(connectorId: string): Promise<{ success: boolean; databases: DiscoveredDatabase[] }> {
    return get<{ success: boolean; databases: DiscoveredDatabase[] }>(`/api/agent/${connectorId}/databases`);
}

/**
 * Fetch execution logs recorded by database proxy connectors
 */
export async function getExecutionLogs(connectionId?: string | null): Promise<ExecutionEvent[]> {
    try {
        const url = connectionId && connectionId !== 'all'
            ? `/api/agent/events?connectionId=${encodeURIComponent(connectionId)}&limit=50`
            : '/api/agent/events?limit=50';
        const res = await get<{ success: boolean; events: ExecutionEvent[] }>(url);
        return res.events || [];
    } catch {
        return [];
    }
}

/**
 * Fetch health events and latency metrics for proxy connectors
 */
export async function getHealthEvents(connectorId?: string | null, timeRange: string = '24h'): Promise<HealthMetricsResult> {
    try {
        const params = new URLSearchParams();
        if (connectorId && connectorId !== 'all') params.append('connectorId', connectorId);
        if (timeRange) params.append('timeRange', timeRange);

        const queryString = params.toString();
        const url = queryString ? `/api/agent/health?${queryString}` : '/api/agent/health';
        const res = await get<{ success: boolean } & HealthMetricsResult>(url);
        return {
            averageLatencyMs: res.averageLatencyMs || 0,
            p95LatencyMs: res.p95LatencyMs || 0,
            successRate: res.successRate ?? 100,
            totalQueries: res.totalQueries || 0,
            events: res.events || [],
            relay: res.relay || 'ok',
            connected_agents: res.connected_agents || 0,
        };
    } catch {
        return {
            averageLatencyMs: 0,
            p95LatencyMs: 0,
            successRate: 100,
            totalQueries: 0,
            events: [],
            relay: 'ok',
            connected_agents: 0,
        };
    }
}
