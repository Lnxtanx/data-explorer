// =============================================================================
// DatabaseEngineIcon - Universal Multi-Database Engine Icon Component
// Uses official brand assets (PostgreSQL elephant, MySQL, SQLite, etc.)
// =============================================================================

import { Database } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Connection } from './api/connectionTypes';

export type DatabaseEngine =
  | 'postgres'
  | 'postgresql'
  | 'mysql'
  | 'mariadb'
  | 'sqlite'
  | 'duckdb'
  | 'clickhouse'
  | 'snowflake'
  | 'mongodb'
  | 'redis'
  | 'generic';

/**
 * Resolves the database engine type from connection or connector metadata.
 */
export function resolveDatabaseEngine(
  connection?: Partial<Connection> | any,
  fallbackConnections?: Connection[]
): DatabaseEngine {
  if (!connection) return 'postgres';

  const matchEngineStr = (val?: string | null): DatabaseEngine | null => {
    if (!val || typeof val !== 'string') return null;
    const norm = val.toLowerCase().trim();
    if (norm.includes('mysql') || norm.includes('maria')) return 'mysql';
    if (norm.includes('postgres') || norm.includes('pg') || norm.includes('psql')) return 'postgres';
    if (norm.includes('mongo')) return 'mongodb';
    if (norm.includes('sqlite')) return 'sqlite';
    if (norm.includes('duck')) return 'duckdb';
    if (norm.includes('clickhouse')) return 'clickhouse';
    if (norm.includes('snow')) return 'snowflake';
    if (norm.includes('redis')) return 'redis';
    return null;
  };

  // 1. Explicit engine / type property on the connection itself
  const direct =
    matchEngineStr(connection.engine) ||
    matchEngineStr(connection.type) ||
    matchEngineStr(connection.db_type) ||
    matchEngineStr(connection.dialect) ||
    matchEngineStr(connection.database_type);
  if (direct) return direct;

  // 2. If this is a connector with discovered databases array
  if (Array.isArray(connection.databases) && connection.databases.length > 0) {
    for (const db of connection.databases) {
      const fromDb =
        matchEngineStr(db.engine) ||
        matchEngineStr(db.dialect) ||
        matchEngineStr(db.type) ||
        matchEngineStr(db.db_alias) ||
        matchEngineStr(db.database) ||
        matchEngineStr(db.version);
      if (fromDb) return fromDb;
    }
  }

  // 3. Check name, database, db_alias, version, id
  const fromProps =
    matchEngineStr(connection.db_alias) ||
    matchEngineStr(connection.database) ||
    matchEngineStr(connection.name) ||
    matchEngineStr(connection.version) ||
    matchEngineStr(connection.id);
  if (fromProps) return fromProps;

  // 4. If fallbackConnections provided, match by agent_id or connector id
  if (fallbackConnections && Array.isArray(fallbackConnections)) {
    const targetAgentId = connection.agent_id || connection.id;
    const matched = fallbackConnections.find(
      (c) => (c.agent_id && c.agent_id === targetAgentId) || c.id === targetAgentId
    );
    if (matched) {
      const fromMatched =
        matchEngineStr(matched.db_alias) ||
        matchEngineStr(matched.database) ||
        matchEngineStr(matched.name) ||
        matchEngineStr((matched as any).engine) ||
        matchEngineStr((matched as any).dialect);
      if (fromMatched) return fromMatched;
    }
  }

  // 5. Check machine_label or agent_id string heuristics as last resort
  const fromHost =
    matchEngineStr(connection.machine_label) ||
    matchEngineStr(connection.agent_id);
  if (fromHost) return fromHost;

  return 'postgres';
}

export interface DatabaseEngineIconProps {
  engine?: DatabaseEngine | string;
  connection?: Partial<Connection> | any;
  fallbackConnections?: Connection[];
  className?: string;
  wrapperClassName?: string;
  isOnline?: boolean;
  showStatusDot?: boolean;
}

export function PostgresIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <img
      src="/postgresql.svg"
      alt="PostgreSQL"
      className={cn('shrink-0 object-contain', className)}
    />
  );
}

export function MysqlIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <img
      src="/mysql.svg"
      alt="MySQL"
      className={cn('shrink-0 object-contain', className)}
    />
  );
}

export function MongoIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <img
      src="/mongodb.svg"
      alt="MongoDB"
      className={cn('shrink-0 object-contain', className)}
    />
  );
}

export function DatabaseEngineIcon({
  engine,
  connection,
  fallbackConnections,
  className = 'w-4 h-4',
  wrapperClassName,
  isOnline,
  showStatusDot = false,
}: DatabaseEngineIconProps) {
  const resolved = engine ? (engine as DatabaseEngine) : resolveDatabaseEngine(connection, fallbackConnections);

  const renderIcon = () => {
    switch (resolved) {
      case 'postgres':
      case 'postgresql':
        return (
          <img
            src="/postgresql.svg"
            alt="PostgreSQL"
            className={cn('shrink-0 object-contain', className)}
          />
        );

      case 'mysql':
      case 'mariadb':
        return (
          <img
            src="/mysql.svg"
            alt="MySQL"
            className={cn('shrink-0 object-contain', className)}
          />
        );

      case 'sqlite':
        return (
          <svg viewBox="0 0 24 24" fill="none" className={cn('shrink-0', className)}>
            <rect x="3" y="4" width="18" height="16" rx="3" fill="#003B57" />
            <path d="M7 9h10M7 12h7M7 15h10" stroke="#41B883" strokeWidth="2" strokeLinecap="round" />
          </svg>
        );

      case 'duckdb':
        return (
          <svg viewBox="0 0 24 24" fill="none" className={cn('shrink-0', className)}>
            <circle cx="12" cy="12" r="10" fill="#FFF000" />
            <circle cx="9.5" cy="10" r="1.5" fill="#000" />
            <path d="M12 12c2 0 4 .5 5 2l-3 1c-1 0-2-.5-2-1v-2z" fill="#FF8000" />
          </svg>
        );

      case 'clickhouse':
        return (
          <svg viewBox="0 0 24 24" fill="none" className={cn('shrink-0', className)}>
            <rect x="3" y="5" width="3" height="14" rx="1" fill="#FA4D35" />
            <rect x="8" y="3" width="3" height="18" rx="1" fill="#FFCC00" />
            <rect x="13" y="7" width="3" height="10" rx="1" fill="#FFCC00" />
            <rect x="18" y="9" width="3" height="6" rx="1" fill="#FA4D35" />
          </svg>
        );

      case 'snowflake':
        return (
          <svg viewBox="0 0 24 24" fill="none" className={cn('shrink-0', className)}>
            <path
              d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19"
              stroke="#29B5E8"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        );

      case 'mongodb':
        return (
          <img
            src="/mongodb.svg"
            alt="MongoDB"
            className={cn('shrink-0 object-contain', className)}
          />
        );

      case 'redis':
        return (
          <svg viewBox="0 0 24 24" fill="none" className={cn('shrink-0', className)}>
            <path d="M12 3l9 4.5-9 4.5-9-4.5L12 3z" fill="#DC382D" />
            <path d="M3 12l9 4.5 9-4.5M3 16.5l9 4.5 9-4.5" stroke="#A8231B" strokeWidth="2" />
          </svg>
        );

      default:
        return <Database className={className} />;
    }
  };

  return (
    <div className={cn("relative inline-flex items-center justify-center shrink-0", wrapperClassName)}>
      {renderIcon()}
      {showStatusDot && isOnline && (
        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-background" />
      )}
    </div>
  );
}
