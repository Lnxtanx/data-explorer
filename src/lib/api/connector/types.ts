// =============================================================================
// PostgreSQL Connector API Types
// Core type definitions for PostgreSQL database proxy connectors and status
// =============================================================================

/** A registered PostgreSQL database proxy connector instance */
export interface DatabaseConnector {
    id: string;                   // Registration UUID
    agent_id: string;             // Connector ID, e.g. "agt_laptop_abc123"
    machine_label: string;        // Host machine label, e.g. "vivek-laptop"
    status: 'pending' | 'active' | 'revoked';
    is_online: boolean;
    last_seen_at?: string;
    ip_address?: string;
    agent_version?: string;
    created_at: string;
    // Team Sharing V2 - present on shared agents (access_type:'team'),
    // own agents always carry access_type:'owner'
    access_type?: 'owner' | 'team';
    registration_id?: string;     // set on shared agents
    share_id?: string;            // team_shared_agents row id (shared agents)
    team_id?: string;
    team_name?: string | null;
    shared_by_name?: string | null;
    shared_by_email?: string | null;
}

/** A PostgreSQL database discovered on a remote proxy connector */
export interface DiscoveredDatabase {
    db_alias: string;             // Alias, e.g. "default", "production"
    database: string;             // Database name, e.g. "mydb"
    version?: string;             // e.g. "PostgreSQL 16.14"
    status: string;               // e.g. "healthy"
}

/** Response from connector key verification */
export interface ConnectorVerifyResult {
    success: boolean;
    agent_id: string;
    registration_id: string;
    machine_label: string;
    is_online: boolean;
    status: string;
    message: string;
    databases: DiscoveredDatabase[];
}

/** Execution log event from connector database operations */
export interface ExecutionEvent {
    id: string;
    agent_id?: string;
    connection_id?: string;
    db_alias?: string;
    event_type: string;
    query_sql?: string | null;
    duration_ms?: number;
    status: 'success' | 'error' | 'timeout' | 'cancelled' | string;
    error_message?: string | null;
    row_count?: number;
    metadata?: Record<string, unknown>;
    created_at: string;
}

/** Health event metric for proxy connection latency */
export interface HealthEvent {
    id: string;
    connector_id?: string;
    agent_id?: string;
    connection_name?: string;
    event_type?: string;
    status: 'healthy' | 'unhealthy' | 'online' | 'offline' | string;
    latency_ms?: number;
    created_at: string;
    metadata?: Record<string, unknown>;
}

/** Health metrics aggregate result */
export interface HealthMetricsResult {
    averageLatencyMs: number;
    p95LatencyMs: number;
    successRate: number;
    totalQueries: number;
    events: HealthEvent[];
    relay?: string;
    connected_agents?: number;
}
