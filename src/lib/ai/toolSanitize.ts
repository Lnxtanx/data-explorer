// =============================================================================
// toolSanitize — UI allowlist for agent tool inputs & result summaries.
//
// Internal metadata (connection ids, dashboard ids, raw SQL, config dumps,
// html templates, panels arrays) must never render in the tool-call
// Parameters/Result sections or persist into client state. Sanitize at every
// ingress point (SSE handler, transcript mapper, history rehydrator) AND at
// render as defense in depth.
// =============================================================================

/** Keys that are never shown regardless of tool. */
const ALWAYS_STRIP = new Set([
  'connection_id',
  'connectionId',
  'user_id',
  'userId',
  'session_id',
  'sessionId',
  'run_id',
  'runId',
  'dashboard_id',
  'dashboardId',
  'sql',
  'query',
  'config',
  'html_template',
  'htmlTemplate',
  'panels',
  'sections',
  'request_payload',
  'usage',
  'token',
  'secret',
  'api_key',
  'apiKey',
]);

/** Per-tool allowlist of input keys that are safe + meaningful to display. */
const INPUT_ALLOWLIST: Record<string, readonly string[]> = {
  run_query: [],
  get_schema_context: ['tables'],
  add_panel: [
    'panel_key',
    'title',
    'chart_type',
    'section_id',
    'section_title',
    'explanation',
  ],
  edit_panel: [
    'panel_key',
    'title',
    'chart_type',
    'section_id',
    'section_title',
    'explanation',
  ],
  remove_panel: ['panel_key', 'explanation'],
  save_dashboard: ['title', 'description'],
  // Thinking steps carry no params.
  thinking: [],
};

/** Keys ending in these (except allowlisted labels) are treated as internal ids. */
const ID_KEY_SUFFIX = /(^|_)(id|uuid|guid|token|secret|key)$/i;

/**
 * Return a copy of `input` safe for UI display: per-tool allowlist when known,
 * otherwise a denylist (strip ALWAYS_STRIP + id-suffixed keys + sql).
 * Always returns a new object; never mutates the input.
 */
export function sanitizeToolInput(
  toolName: string | undefined,
  input: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!input || typeof input !== 'object') return {};
  const allow = INPUT_ALLOWLIST[toolName || ''];
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (ALWAYS_STRIP.has(k)) continue;
    if (allow) {
      if (allow.includes(k)) out[k] = v;
      continue;
    }
    if (ID_KEY_SUFFIX.test(k)) continue;
    out[k] = v;
  }
  return out;
}

/** UUIDs (any version) — redacted from summaries. */
const UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/** JSON-ish id fields: "dashboard_id": "..." / dashboard_id=... */
const JSON_ID_RE =
  /"?(?:dashboard_id|connection_id|user_id|session_id|run_id|panel_id|id)"?\s*[:=]\s*"?[^\s",}]+/gi;

/** SQL statement fragments (SELECT/INSERT/UPDATE/DELETE/WITH ...). */
const SQL_RE =
  /\b(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|WITH|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE)\b[\s\S]*/gi;

/**
 * Scrub internal ids and SQL text from a tool result summary before it is
 * shown in the Result section or stored on a message bubble.
 */
export function sanitizeToolSummary(summary: unknown): string {
  if (summary == null) return '';
  let s = typeof summary === 'string' ? summary : String(summary);
  s = s.replace(SQL_RE, '[query]');
  s = s.replace(UUID_RE, '…');
  s = s.replace(JSON_ID_RE, '[redacted]');
  return s;
}

/** Humanize a snake_case/camelCase key for the Parameters section label. */
export function humanizeParamKey(key: string): string {
  const special: Record<string, string> = {
    panel_key: 'Panel',
    chart_type: 'Chart type',
    section_id: 'Section',
    section_title: 'Section title',
    panel_key_id: 'Panel',
    schema_name: 'Schema',
    tables: 'Tables',
    limit: 'Limit',
    title: 'Title',
    description: 'Description',
    explanation: 'Explanation',
  };
  if (special[key]) return special[key];
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
