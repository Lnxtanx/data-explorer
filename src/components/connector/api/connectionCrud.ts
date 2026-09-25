// =============================================================================
// Connection CRUD API
// Agent & Discovered Database Adapter for Data Explorer
// =============================================================================

import { listConnectors, getConnectorDatabases } from './index';
import type { DiscoveredDatabase } from './index';
import type { Connection } from './connectionTypes';

/**
 * List all discovered database connections from registered PostgreSQL connectors
 */
export async function listConnections(): Promise<{ connections: Connection[] }> {
    try {
        const res = await listConnectors();
        const agents = res.agents || [];
        const connections: Connection[] = [];

        // Probe databases in parallel for all online agents
        await Promise.all(
            agents.map(async (agent) => {
                if (agent.status === 'revoked') return;

                let dbs: DiscoveredDatabase[] = (agent as any).databases || [];
                if (agent.is_online && dbs.length === 0) {
                    try {
                        const dbRes = await getConnectorDatabases(agent.agent_id);
                        dbs = dbRes.databases || [];
                    } catch {
                        dbs = [];
                    }
                }

                if (dbs.length > 0) {
                    for (const db of dbs) {
                        connections.push({
                            id: `${agent.agent_id}:${db.db_alias || db.database}`,
                            name: db.database || db.db_alias,
                            database: db.database || db.db_alias,
                            db_alias: db.db_alias || db.database,
                            agent_id: agent.agent_id,
                            machine_label: agent.machine_label,
                            is_online: agent.is_online,
                            sslMode: 'require',
                            health_status: agent.is_online ? 'healthy' : 'unhealthy',
                            createdAt: agent.created_at,
                            updatedAt: agent.last_seen_at || agent.created_at,
                            isShared: agent.access_type === 'team',
                            access_type: agent.access_type ?? 'owner',
                            team_name: agent.team_name ?? null,
                            shared_by_name: agent.shared_by_name ?? null,
                        });
                    }
                } else {
                    connections.push({
                        id: agent.agent_id,
                        name: agent.machine_label,
                        database: 'default',
                        db_alias: 'default',
                        agent_id: agent.agent_id,
                        machine_label: agent.machine_label,
                        is_online: agent.is_online,
                        sslMode: 'require',
                        health_status: agent.is_online ? 'healthy' : 'unhealthy',
                        createdAt: agent.created_at,
                        updatedAt: agent.last_seen_at || agent.created_at,
                        isShared: agent.access_type === 'team',
                        access_type: agent.access_type ?? 'owner',
                        team_name: agent.team_name ?? null,
                        shared_by_name: agent.shared_by_name ?? null,
                    });
                }
            })
        );

        return { connections };
    } catch {
        return { connections: [] };
    }
}
