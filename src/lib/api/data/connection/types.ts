// =============================================================================
// Connection API Types
// Shared interfaces for the PostgreSQL connection system
// =============================================================================

// ─── Credentials & Connection ────────────────────────────────────────────────

export interface ConnectionCredentials {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    sslMode?: 'disable' | 'require' | 'verify-full';
    sslRootCert?: string; // PEM-format CA certificate for verify-full mode
}

export interface Connection {
    id: string;
    name: string;
    database: string;
    sslMode: string;
    host_hash?: string;
    health_status?: 'healthy' | 'unhealthy' | 'unknown';
    last_health_check?: string;
    createdAt: string;
    updatedAt: string;
    lastUsedAt?: string;
    isShared?: boolean;
}

export interface TestResult {
    success: boolean;
    message: string;
    serverVersion?: string;
    errorCode?: string;
}

// ─── Events & Files ──────────────────────────────────────────────────────────

export interface ConnectionEvent {
    id: string;
    event_type: 'CONNECT' | 'PUSH' | 'PULL' | 'LINK' | 'UNLINK' | 'UPDATE' | 'DRIFT_DETECTED' | 'HEALTH_CHECK';
    status: 'success' | 'warning' | 'failure';
    metadata?: Record<string, any>;
    created_at: string;
    file_id?: string;
}

export interface LinkedFile {
    id: string;
    title: string;
    updated_at: string;
    created_at: string;
}

// ─── Schema ──────────────────────────────────────────────────────────────────

export interface PulledSchema {
    tables: any[];
    enums: Record<string, string[]>;
    sequences: any[];
    views: any[];
    functions: any[];
    triggers: any[];
    policies: any[];
    metadata: {
        schemaName: string;
        introspectedAt: string;
        tableCount: number;
    };
}

export interface SchemaDiff {
    tables: {
        added: { table: string; columns: string[]; columnDefs?: any[]; isDestructive: boolean }[];
        removed: { table: string; columns: string[]; isDestructive: boolean; warning?: string }[];
        modified: { table: string; hasChanges: boolean }[];
    };
    columns: {
        added: { table: string; column: string; type: string }[];
        removed: { table: string; column: string; type: string; warning?: string }[];
        modified: { table: string; column: string; changes: { field: string; from: any; to: any }[]; isDestructive: boolean }[];
    };
    enums: {
        added: { name: string; values: string[] }[];
        removed: { name: string; values: string[]; isDestructive: boolean }[];
        modified: { name: string; addedValues: string[]; removedValues: string[] }[];
    };
    indexes?: {
        added: { table: string; name: string; columns: string[] }[];
        removed: { table: string; name: string; columns: string[] }[];
    };
    summary: {
        totalChanges: number;
        destructiveChanges: number;
        safeChanges: number;
    };
}

// ─── Migration ───────────────────────────────────────────────────────────────

export interface MigrationPreview {
    sql: string;
    originalSql?: string;
    warnings: string[];
    statementCount: number;
    hasDestructiveChanges: boolean;
    hasIncompatibleChanges?: boolean;
    incompatibleDetails?: any[];
    behavioralDDL?: { count: number;[key: string]: any };
    summary: {
        tablesAdded: number;
        tablesRemoved: number;
        tablesModified: number;
        columnsAdded: number;
        columnsRemoved: number;
        columnsModified: number;
    };
}

export interface Migration {
    id: string;
    connection_id: string;
    version: string;
    name: string;
    checksum: string;
    up_sql: string;
    down_sql?: string;
    applied_at?: string;
    applied_by?: string;
    rolled_back_at?: string;
    status: 'pending' | 'applied' | 'rolled_back' | 'failed';
    execution_time_ms?: number;
    error_message?: string;
    commit_message?: string;
    behavioral_applied?: { count: number;[key: string]: any };
    behavioral_errors?: { count: number;[key: string]: any };
    schema_hash_before?: string;
    schema_hash_after?: string;
    canRollback?: boolean;
    metadata?: {
        schemaName?: string;
        statementCount?: number;
        warnings?: string[];
        summary?: any;
    };
}

export interface MigrationStatus {
    total: number;
    pending: number;
    applied: number;
    rolled_back: number;
    failed: number;
}

// ─── Security ────────────────────────────────────────────────────────────────

export interface Permissions {
    canRead: boolean;
    canWrite: boolean;
    canCreate: boolean;
    isSuperuser: boolean;
}

export interface Fingerprint {
    hash: string;
    components: Record<string, string>;
    generatedAt: string;
}

export interface BindingResult {
    bound: boolean;
    ownedByCurrentUser: boolean;
    owner?: string;
    claimedAt?: string;
}

// ─── Health ──────────────────────────────────────────────────────────────────

export interface ConnectionHealth {
    status: 'healthy' | 'unhealthy' | 'unknown';
    latencyMs?: number;
    serverVersion?: string;
    lastChecked?: string;
    error?: string;
}

export interface HealthEvent {
    id: string;
    connection_id: string;
    event_type: string;
    details?: Record<string, any>;
    created_at: string;
}

// ─── Snapshot ────────────────────────────────────────────────────────────────

export interface SchemaSnapshot {
    id: string;
    connection_id: string;
    schema_hash: string;
    schema_sql: string;
    snapshot_type: 'pre_migration' | 'post_migration' | 'manual';
    created_at: string;
    metadata?: Record<string, any>;
}

// ─── API Response Wrappers ───────────────────────────────────────────────────

export interface ApiSuccess<T = unknown> {
    success: true;
    data: T;
}
