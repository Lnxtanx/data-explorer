// =============================================================================
// DatabaseEngineIcon - Universal Multi-Database Engine Icon Component
// Uses official brand assets (PostgreSQL elephant, MySQL, SQLite, etc.)
// =============================================================================

import React from 'react';
import { Database } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Connection } from '@/lib/api/data/connection/types';

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
 * Resolves the database engine type from connection metadata.
 * Defaults to 'postgres' since current proxy connector relays PostgreSQL.
 */
export function resolveDatabaseEngine(connection?: Partial<Connection> | null): DatabaseEngine {
  if (!connection) return 'postgres';

  // 1. Explicit engine / type property
  const explicit =
    (connection as any).engine ||
    (connection as any).type ||
    (connection as any).db_type ||
    (connection as any).dialect;

  if (explicit && typeof explicit === 'string') {
    const norm = explicit.toLowerCase().trim();
    if (norm.includes('postgres') || norm === 'pg') return 'postgres';
    if (norm.includes('mysql')) return 'mysql';
    if (norm.includes('maria')) return 'mariadb';
    if (norm.includes('sqlite')) return 'sqlite';
    if (norm.includes('duck')) return 'duckdb';
    if (norm.includes('clickhouse')) return 'clickhouse';
    if (norm.includes('snow')) return 'snowflake';
    if (norm.includes('mongo')) return 'mongodb';
    if (norm.includes('redis')) return 'redis';
  }

  // 2. Name / alias heuristic check
  const combined = `${connection.database || ''} ${connection.name || ''} ${connection.db_alias || ''}`.toLowerCase();
  if (combined.includes('mysql')) return 'mysql';
  if (combined.includes('mariadb')) return 'mariadb';
  if (combined.includes('sqlite')) return 'sqlite';
  if (combined.includes('duckdb')) return 'duckdb';
  if (combined.includes('clickhouse')) return 'clickhouse';
  if (combined.includes('mongo')) return 'mongodb';
  if (combined.includes('redis')) return 'redis';
  if (combined.includes('snow')) return 'snowflake';

  // 3. Current system default: PostgreSQL
  return 'postgres';
}

export interface DatabaseEngineIconProps {
  engine?: DatabaseEngine | string;
  connection?: Partial<Connection> | null;
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

export function DatabaseEngineIcon({
  engine,
  connection,
  className = 'w-4 h-4',
  wrapperClassName,
  isOnline,
  showStatusDot = false,
}: DatabaseEngineIconProps) {
  const resolved = engine ? (engine as DatabaseEngine) : resolveDatabaseEngine(connection);

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
          <svg viewBox="0 0 24 24" fill="none" className={cn('shrink-0', className)}>
            <circle cx="12" cy="12" r="10" fill="#00758F" />
            <path
              d="M7 14c1.5-2 3.5-3 5-3 2 0 3.5 1.5 5 1.5s2-.5 2-.5-1 2-3 2-3.5-1-5-1c-1.5 0-3 1-4 1z"
              fill="#F29111"
            />
          </svg>
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
          <svg viewBox="0 0 24 24" fill="none" className={cn('shrink-0', className)}>
            <path
              d="M12 2s-6 6.5-6 11c0 3.3 2.7 6 6 6s6-2.7 6-6c0-4.5-6-11-6-11z"
              fill="#00ED64"
            />
            <path d="M12 3v15" stroke="#13AA52" strokeWidth="1.5" />
          </svg>
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
