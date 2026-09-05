// =============================================================================
// Data Explorer Error Messages
// Maps backend/agent error codes to user-facing messages and recovery hints.
// =============================================================================

interface ExplorerErrorEntry {
  title: string;
  message: string;
  hint?: string;
}

export const EXPLORER_ERROR_CATALOG: Record<string, ExplorerErrorEntry> = {
  // ── SW Agent reachability ──────────────────────────────────────────────
  agent_offline: {
    title: 'SW Agent is offline',
    message: 'The SW Agent for this connection is not running.',
    hint: 'Open a terminal on the machine you registered and run: sw-agent start',
  },
  agent_wake_failed: {
    title: 'SW Agent is not responding',
    message: 'The SW Agent did not respond in time.',
    hint: 'Make sure the SW Agent is running (sw-agent start) and connected to the relay.',
  },
  agent_timeout: {
    title: 'SW Agent timed out',
    message: 'The SW Agent took too long to respond.',
    hint: 'Check the SW Agent status and relay connection, then retry.',
  },
  channel_closed: {
    title: 'Connection dropped',
    message: 'The connection to the SW Agent closed unexpectedly.',
    hint: 'Retry now — the agent reconnects automatically.',
  },
  rate_limited: {
    title: 'Too many requests',
    message: 'You are sending requests too quickly.',
    hint: 'Wait a few seconds and try again.',
  },
  concurrent_request_rejected: {
    title: 'Agent is busy',
    message: 'The SW Agent is still working on another request.',
    hint: 'Wait a moment and retry.',
  },

  // ── Database connectivity ──────────────────────────────────────────────
  db_unavailable: {
    title: 'Database unreachable',
    message: 'Your database could not be reached from the SW Agent machine.',
    hint: 'Check that the database host is running and reachable (network/firewall).',
  },
  db_auth_failed: {
    title: 'Database login failed',
    message: 'Your database rejected the SW Agent credentials.',
    hint: 'Verify the database password in the SW Agent config (sw-agent > db edit).',
  },
  db_not_found: {
    title: 'Database not configured',
    message: 'This database is not registered with your SW Agent.',
    hint: 'Register it with: sw-agent > db add',
  },
  db_pool_exhausted: {
    title: 'Connection pool full',
    message: 'The database connection pool is full right now.',
    hint: 'Wait a few seconds and retry.',
  },
  db_ssl_error: {
    title: 'Database SSL failure',
    message: 'The secure connection to the database failed.',
    hint: 'Check the ssl_mode / ssl_root_cert settings on the SW Agent database config.',
  },
  env_var_missing: {
    title: 'Agent config incomplete',
    message: 'The SW Agent is missing a password environment variable for this database.',
    hint: 'See sw-agent > db ls for the variable name, set it, then restart the agent.',
  },
  config_invalid: {
    title: 'SW Agent config invalid',
    message: 'The SW Agent configuration file is invalid.',
    hint: 'Run: sw-agent doctor',
  },
  config_not_found: {
    title: 'SW Agent not configured',
    message: 'The SW Agent has no configuration yet.',
    hint: 'Run: sw-agent init',
  },

  // ── Query execution ────────────────────────────────────────────────────
  query_timeout: {
    title: 'Query timed out',
    message: 'The query took too long and was cancelled.',
    hint: 'Try again, or narrow the query with filters.',
  },
  query_cancelled: {
    title: 'Query cancelled',
    message: 'The query was cancelled.',
  },
  query_too_large: {
    title: 'Result too large',
    message: 'The result set exceeded the 10,000 row limit.',
    hint: 'Use filters or pagination to browse the data.',
  },
  stream_too_large: {
    title: 'Result too large',
    message: 'The result set exceeded the 1,000,000 row limit.',
    hint: 'Use filters or pagination to browse the data.',
  },
  execution_failed: {
    title: 'Query failed',
    message: 'The database rejected the query.',
    hint: 'The error usually comes from a column, type, or value in the query.',
  },
  internal_error: {
    title: 'SW Agent error',
    message: 'The SW Agent hit an internal error.',
    hint: 'Run: sw-agent doctor',
  },

  // ── Permissions ────────────────────────────────────────────────────────
  permission_denied: {
    title: 'Permission denied',
    message: 'Your role does not allow this action on the database.',
  },
  role_insufficient: {
    title: 'Role too limited',
    message: 'Your team role does not allow this action.',
    hint: 'Ask an admin to upgrade your role (viewer/data_reader).',
  },
  approval_denied: {
    title: 'Approval denied',
    message: 'The manual approval for this action was denied.',
  },
  approval_timeout: {
    title: 'Approval timed out',
    message: 'The manual approval request was not answered in time.',
  },

  // ── Backend / account ──────────────────────────────────────────────────
  service_unavailable: {
    title: 'Service unavailable',
    message: 'The Data Explorer connection service is not configured on this server.',
    hint: 'Contact your server administrator.',
  },
  registry_error: {
    title: 'Verification failed',
    message: 'The server could not verify this connection.',
    hint: 'Try again — if it persists, contact your server administrator.',
  },
  not_found: {
    title: 'Connection not found',
    message: 'This connection does not exist, or you do not have access to it.',
  },
  invalid_connection: {
    title: 'Invalid connection',
    message: 'This connection id is not valid.',
  },
  agent_inactive: {
    title: 'Agent registration inactive',
    message: 'Your SW Agent registration is not active.',
    hint: 'Relink the agent from Settings or the agent dashboard.',
  },
  unauthorized: {
    title: 'Session expired',
    message: 'Your session expired — please log in again.',
  },
  unknown_column: {
    title: 'Unknown column',
    message: 'The query references a column the table does not have.',
  },
  invalid_cursor: {
    title: 'Stale page',
    message: 'This page of data is no longer valid — refresh to get the latest results.',
  },
  bad_request: {
    title: 'Invalid request',
    message: 'The request was invalid.',
  },
};

/**
 * Human-readable message for an error thrown by the Data Explorer API.
 * Falls back to the error's own message, then a generic text.
 */
export function getExplorerErrorMessage(err: unknown): string {
  const apiErr = err as { code?: string; message?: string; status?: number } | null;
  const entry = apiErr?.code ? EXPLORER_ERROR_CATALOG[apiErr.code] : undefined;
  if (entry) return entry.message;
  if (apiErr?.status === 401) return EXPLORER_ERROR_CATALOG.unauthorized.message;
  return apiErr?.message || 'Something went wrong while talking to the SW Agent.';
}

/**
 * Recovery hint for an error. Prefers the backend-provided hint, then the
 * catalog entry, then nothing.
 */
export function getExplorerErrorHint(err: unknown): string | undefined {
  const apiErr = err as { code?: string; hint?: string } | null;
  if (apiErr?.hint) return apiErr.hint;
  if (apiErr?.code) return EXPLORER_ERROR_CATALOG[apiErr.code]?.hint;
  return undefined;
}

/**
 * Short title for use in error banners.
 */
export function getExplorerErrorTitle(err: unknown): string {
  const apiErr = err as { code?: string } | null;
  if (apiErr?.code) return EXPLORER_ERROR_CATALOG[apiErr.code]?.title || 'Request failed';
  return 'Request failed';
}