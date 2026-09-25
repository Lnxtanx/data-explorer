// =============================================================================
// Connection API Types
// Shared interfaces for the PostgreSQL connection system
// =============================================================================
//
// Phase 1 note: this file used to declare 15 additional interfaces (PulledSchema,
// SchemaDiff, Migration, MigrationStatus, MigrationPreview, Permissions,
// Fingerprint, BindingResult, ConnectionHealth, HealthEvent, SchemaSnapshot,
// ApiSuccess, ConnectionEvent, LinkedFile, ...). They were the residue of a
// schema/migration/health surface that was cut from this module but whose types
// were left behind. All had zero reachable consumers and have been removed.
// `HealthEvent` in particular collided by name with a DIFFERENT shape exported
// by @/lib/api/connector/types, which is the one ConnectorHealth.tsx actually
// imports.
// =============================================================================

// ─── Credentials & Connection ────────────────────────────────────────────────

export interface Connection {
    id: string;
    name: string;
    database: string;
    sslMode: string;
    agent_id?: string;
    db_alias?: string;
    machine_label?: string;
    is_online?: boolean;
    host_hash?: string;
    health_status?: 'healthy' | 'unhealthy' | 'unknown';
    last_health_check?: string;
    createdAt: string;
    updatedAt: string;
    lastUsedAt?: string;
    isShared?: boolean;
    // Team Sharing V2
    access_type?: 'owner' | 'team';
    team_name?: string | null;
    shared_by_name?: string | null;
}
