// =============================================================================
// Connection CRUD API
// Test, save, list, delete connections
// =============================================================================

import { get, post, patch, del, put } from '../../client';
import type { ConnectionCredentials, Connection, TestResult, ConnectionEvent, LinkedFile } from './types';

/**
 * Test a database connection without saving
 */
export async function testConnection(credentials: ConnectionCredentials): Promise<TestResult> {
    return post<TestResult>('/api/connection/test', credentials);
}

/**
 * Save a database connection (creates or updates)
 */
export async function saveConnection(
    name: string,
    credentials: ConnectionCredentials
): Promise<{ success: boolean; connection: Connection }> {
    return post('/api/connection/save', { name, ...credentials });
}

/**
 * List all saved connections for the current user
 */
export async function listConnections(): Promise<{ connections: Connection[] }> {
    return get<{ connections: Connection[] }>('/api/connection/list');
}

/**
 * Delete a saved connection
 */
export async function deleteConnection(id: string): Promise<{ success: boolean }> {
    return del<{ success: boolean }>(`/api/connection/${id}`);
}

/**
 * Update an existing connection (by ID)
 */
export async function updateConnection(
    id: string,
    name: string,
    credentials: ConnectionCredentials
): Promise<{ success: boolean; connection: Connection }> {
    return put(`/api/connection/${id}`, { name, ...credentials });
}

/**
 * Get real connection events from the database
 */
export async function getConnectionEvents(
    connectionId: string,
    options?: { limit?: number; eventType?: string }
): Promise<{ events: ConnectionEvent[] }> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.eventType) params.set('eventType', options.eventType);

    const query = params.toString() ? `?${params.toString()}` : '';
    return get<{ events: ConnectionEvent[] }>(`/api/connection/${connectionId}/events${query}`);
}

/**
 * Get files linked to a connection
 */
export async function getLinkedFiles(
    connectionId: string
): Promise<{ files: LinkedFile[] }> {
    return get<{ files: LinkedFile[] }>(`/api/connection/${connectionId}/linked-files`);
}
