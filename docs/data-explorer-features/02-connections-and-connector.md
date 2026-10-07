---
title: Connections & Connector Management
section: 2
area: connector
sources: 23
status: rough
---

# 02. Connections & Connector Management

## Component / File Map

| File | Responsibility | ~Lines |
| --- | --- | --- |
| `src/components/connector/ConnectorDialog.tsx` | Modal shell, auth gate, tab router for all connector surfaces | 134 |
| `src/components/connector/ConnectorSidebar.tsx` | Left nav, 7 fixed sections | 59 |
| `src/components/connector/ConnectorWizard.tsx` | 3-step connector registration flow (CLI → key paste → result) | 520 |
| `src/components/connector/ConnectorOverview.tsx` | Landing tab: 4 metric tiles, host list, 4 recent queries | 349 |
| `src/components/connector/ConnectorList.tsx` | Per-connector cards, expand-to-discover-databases, revoke/remove | 352 |
| `src/components/connector/ConnectorSettings.tsx` | Read-only status panel + revoke/remove actions | 235 |
| `src/components/connector/ConnectorDatabases.tsx` | Flat searchable list of all discovered databases, "Explore" action | 195 |
| `src/components/connector/ConnectorHealth.tsx` | Health/latency metrics, bar chart, recent health events | 364 |
| `src/components/connector/ConnectorExecutionLogs.tsx` | Query telemetry list, SQL categoriser, filters, inspector | 351 |
| `src/components/connector/DatabaseEngineIcon.tsx` | Engine resolution + per-engine SVG/icon renderer | 189 |
| `src/components/connector/api/connectionTypes.ts` | `Connection` interface | 39 |
| `src/components/connector/api/types.ts` | `DatabaseConnector`, `DiscoveredDatabase`, `ConnectorVerifyResult`, `ExecutionEvent`, `HealthEvent`, `HealthMetricsResult` | 86 |
| `src/components/connector/api/crud.ts` | All `/api/agent/*` HTTP calls | 107 |
| `src/components/connector/api/connectionCrud.ts` | `listConnections()` — synthesises `Connection[]` from agents | 80 |
| `src/components/connector/api/connectionKeys.ts` | `connectionKeys` query-key factory (leaf) | 33 |
| `src/components/connector/api/useConnections.ts` | `useConnections()` hook + re-exports | 42 |
| `src/components/connector/api/hooks.ts` | `connectorKeys` factory + 4 queries / 3 mutations | 145 |
| `src/components/connector/api/index.ts` | Barrel: `types`, `crud`, `hooks` | 7 |
| `src/components/data-explorer/ConnectionSelector.tsx` | Header database dropdown | 194 |
| `src/lib/api/client.ts` | Shared HTTP layer used by every connector call | 276 |
| `src/lib/queryClient.ts` | Global React Query defaults (read for context) | 81 |
| `src/lib/persist.ts` | IndexedDB persister + its root filter (read for context) | 143 |
| `src/pages/DataExplorerPage.tsx` | Hosts `ConnectorDialog` + `ConnectionSelector`, owns auto-select | 518 |

---

## 1. Supported Database Engines

### 1.1 The union

`src/components/connector/DatabaseEngineIcon.tsx:10-21`

```ts
export type DatabaseEngine =
  | 'postgres' | 'postgresql' | 'mysql' | 'mariadb' | 'sqlite'
  | 'duckdb' | 'clickhouse' | 'snowflake' | 'mongodb' | 'redis'
  | 'generic';
```

11 members. `src/components/connector/DatabaseEngineIcon.tsx:10-21`

### 1.2 Resolution algorithm

`resolveDatabaseEngine(connection?: Partial<Connection> | null): DatabaseEngine` — `src/components/connector/DatabaseEngineIcon.tsx:27-63`, three tiers:

| Tier | Input | Behaviour | Citation |
| --- | --- | --- | --- |
| 0 | `connection == null` | returns `'postgres'` | `DatabaseEngineIcon.tsx:28` |
| 1 | `(connection as any).engine \|\| .type \|\| .db_type \|\| .dialect` | lowercased/trimmed; substring match: `postgres`\|`pg` → postgres; `mysql`; `maria`; `sqlite`; `duck`; `clickhouse`; `snow`; `mongo`; `redis` | `DatabaseEngineIcon.tsx:31-48` |
| 2 | `` `${database} ${name} ${db_alias}` `` lowercased | same 8 substring heuristics, **no** `postgres` branch, so a non-matching string falls through to tier 3 | `DatabaseEngineIcon.tsx:51-59` |
| 3 | — | returns `'postgres'` (documented as "Current system default") | `DatabaseEngineIcon.tsx:61-62` |

### 1.3 Implemented vs stubbed

| Engine | Icon implementation | Reachable from connector data? |
| --- | --- | --- |
| `postgres` / `postgresql` | `<img src="/postgresql.svg">` — `DatabaseEngineIcon.tsx:96-104` | Yes (default) |
| `mysql` / `mariadb` | inline SVG, circle `#00758F` + `#F29111` blob — `DatabaseEngineIcon.tsx:106-116` | Only via tier-1/2 heuristic |
| `sqlite` | inline SVG, rect `#003B57` + `#41B883` lines — `DatabaseEngineIcon.tsx:118-124` | Only via heuristic |
| `duckdb` | inline SVG, `#FFF000` circle + `#FF8000` beak — `DatabaseEngineIcon.tsx:126-133` | Only via heuristic |
| `clickhouse` | inline SVG, 4 bars `#FA4D35`/`#FFCC00` — `DatabaseEngineIcon.tsx:135-143` | Only via heuristic |
| `snowflake` | inline SVG, 6-spoke asterisk `#29B5E8` — `DatabaseEngineIcon.tsx:145-155` | Only via heuristic |
| `mongodb` | inline SVG, leaf `#00ED64`/`#13AA52` — `DatabaseEngineIcon.tsx:157-166` | Only via heuristic |
| `redis` | inline SVG, stacked lozenges `#DC382D`/`#A8231B` — `DatabaseEngineIcon.tsx:168-174` | Only via heuristic |
| `generic` | **no `case`** — falls to `default` → lucide `<Database>` — `DatabaseEngineIcon.tsx:176-177` | N/A — the string is never produced by `resolveDatabaseEngine` |

**Only PostgreSQL is actually implemented end to end.** Facts supporting this:

- Every API path in `src/components/connector/api/crud.ts` is under `/api/agent/*` (lines 20, 31, 42, 49, 56, 65-66, 84). There is no engine-parameterised endpoint anywhere in the module.
- Every explicit `engine=` prop passed in the app is the literal `"postgres"`: `ConnectorWizard.tsx:332`, `ConnectorWizard.tsx:377`, `ConnectorSettings.tsx:108`, `ConnectorOverview.tsx:175`, `ConnectorList.tsx:167`, `ConnectorList.tsx:262`.
- Only two call sites use the `connection=` prop instead, letting the heuristic run: `ConnectorDatabases.tsx:117` and `ConnectionSelector.tsx:52` + `ConnectionSelector.tsx:107`.
- The `Connection` objects those heuristics inspect are manufactured from PostgreSQL agent data: `database` = `db.database || db.db_alias` where `db` is a `DiscoveredDatabase` relayed by a Postgres connector (`connectionCrud.ts:38-40`, `connectionCrud.ts:56-60`). A non-Postgres icon can therefore only render if a Postgres database or alias *name* literally contains `mysql`, `mariadb`, `sqlite`, `duckdb`, `clickhouse`, `mongo`, `redis` or `snow`.
- Tier-1 reads `engine`/`type`/`db_type`/`dialect`, none of which exist on the `Connection` interface (`connectionTypes.ts:19-39`). Those reads are untyped `as any` casts (`DatabaseEngineIcon.tsx:31-35`) and can only fire if the runtime object carries extra properties, which `listConnections` never sets.

`PostgresIcon` is a separate exported wrapper rendering the same `/postgresql.svg` asset (`DatabaseEngineIcon.tsx:74-82`); the asset exists at `public/postgresql.svg`.

### 1.4 Status dot

`showStatusDot && isOnline` renders a `w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-background` absolutely positioned at `-top-1 -right-1` (`DatabaseEngineIcon.tsx:184-186`). It is one-directional: **no dot at all is drawn for offline connections.**

---

## 2. Connection CRUD — Full Lifecycle

### 2.1 Endpoint table

All calls go through `get` / `post` / `del` from `@/lib/api/client` (`crud.ts:7`). No `patch` is imported by this module (`crud.ts:7`).

| Operation | Method | Path | Request body | Response type | Citation |
| --- | --- | --- | --- | --- | --- |
| List connectors | `GET` | `/api/agent/status` | — | `{ success: boolean; agents: DatabaseConnector[] }` | `crud.ts:19-21` |
| Create / verify (the wizard's only write) | `POST` | `/api/agent/register/token` | `{ agent_token: string; agent_id: string; machine_label?: string }` | `ConnectorVerifyResult` | `crud.ts:26-36` |
| Revoke (soft delete) | `POST` | `/api/agent/revoke/{connectorId}` | `{}` | `{ success: boolean; message: string }` | `crud.ts:41-43` |
| Remove (hard delete) | `DELETE` | `/api/agent/{connectorId}` | — | `{ success: boolean; message: string }` | `crud.ts:48-50` |
| Discover databases | `GET` | `/api/agent/{connectorId}/databases` | — | `{ success: boolean; databases: DiscoveredDatabase[] }` | `crud.ts:55-57` |
| Execution logs | `GET` | `/api/agent/events?connectionId={enc}&limit=50` or `/api/agent/events?limit=50` | — | `{ success: boolean; events: ExecutionEvent[] }` | `crud.ts:62-72` |
| Health + latency aggregate | `GET` | `/api/agent/health?connectorId={id}&timeRange={tr}` | — | `{ success: boolean } & HealthMetricsResult` | `crud.ts:77-106` |

**`connectorId` in the URL is `DatabaseConnector.id`, not `agent_id`.** Every call site passes `connector.id` (`ConnectorList.tsx:123`, `ConnectorList.tsx:133`, `ConnectorSettings.tsx:209`, `ConnectorSettings.tsx:220`), which `types.ts:8` documents as "Registration UUID". The hook parameters are named `registrationId` (`hooks.ts:121`, `hooks.ts:135`), consistent with that.

### 2.2 Operations that do not exist

| Requested operation | Status |
| --- | --- |
| **Update / rename / edit a connection** | No endpoint, no mutation, no form. `crud.ts` exports exactly 7 functions (`crud.ts:19, 26, 41, 48, 55, 62, 77`); `patch` is not among the imports (`crud.ts:7`). |
| **Duplicate / clone a connection** | No endpoint and no UI control anywhere in the connector folder. |
| **Separate "test connection"** | The wizard's "Verify & Connect" button calls `POST /api/agent/register/token` (`ConnectorWizard.tsx:308`, `ConnectorWizard.tsx:111-114`, `crud.ts:31`). There is no dedicated test endpoint. |
| **Per-connection health ping** | No `POST /api/agent/health` or similar. Health is read-only (`crud.ts:84`). |

### 2.3 `Connection` — every field

`src/components/connector/api/connectionTypes.ts:19-39`. Columns: field / type / who writes it / who reads it.

| Field | Type | Written by | Read by |
| --- | --- | --- | --- |
| `id` | `string` | `` `${agent.agent_id}:${db.db_alias \|\| db.database}` `` (`connectionCrud.ts:37`), or bare `agent.agent_id` when the agent reports no databases (`connectionCrud.ts:56`) | `ConnectionSelector.tsx:33,102,134`; `DataExplorerPage.tsx:112`; `ConnectorDatabases.tsx:104,164` |
| `name` | `string` | `db.database \|\| db.db_alias` (`connectionCrud.ts:38`), else `agent.machine_label` (`connectionCrud.ts:57`) | `ConnectionSelector.tsx:67,115`; `ConnectorDatabases.tsx:38,126`; `DatabaseEngineIcon.tsx:51` |
| `database` | `string` | `db.database \|\| db.db_alias` (`connectionCrud.ts:39`), else hardcoded `'default'` (`connectionCrud.ts:58`) | `ConnectorDatabases.tsx:39`; `AIChatLibrary.tsx:114`; `DatabaseEngineIcon.tsx:51` |
| `sslMode` | `string` | hardcoded `'require'` in both branches (`connectionCrud.ts:44`, `connectionCrud.ts:63`) | **Nothing.** No reader in `src/`. |
| `agent_id` | `string?` | `agent.agent_id` (`connectionCrud.ts:41`, `connectionCrud.ts:60`) | `ConnectorList.tsx:245`; `ConnectorDatabases.tsx:148-151`; `ConnectionSelector` does not read it |
| `db_alias` | `string?` | `db.db_alias \|\| db.database` (`connectionCrud.ts:40`), else `'default'` (`connectionCrud.ts:59`) | `ConnectorDatabases.tsx:41,128`; `ConnectorList.tsx:245`; `DatabaseEngineIcon.tsx:51` |
| `machine_label` | `string?` | `agent.machine_label` (`connectionCrud.ts:42`, `connectionCrud.ts:61`) | `ConnectionSelector.tsx:123-126`; `ConnectorDatabases.tsx:40,145`; `DataExplorerPage` no |
| `is_online` | `boolean?` | `agent.is_online` (`connectionCrud.ts:43`, `connectionCrud.ts:62`) | `useConnections.ts:35`; `ConnectorDatabases.tsx:111,137`; `ConnectionSelector.tsx:54,109`; `DataExplorerPage.tsx:114` |
| `host_hash` | `string?` | **never written** | **never read** |
| `health_status` | `'healthy' \| 'unhealthy' \| 'unknown'`? | `agent.is_online ? 'healthy' : 'unhealthy'` (`connectionCrud.ts:45`, `connectionCrud.ts:64`) | `AIChatLibrary.tsx:118` only |
| `last_health_check` | `string?` | **never written** | **never read** |
| `createdAt` | `string` | `agent.created_at` (`connectionCrud.ts:46`, `connectionCrud.ts:65`) | no reader in `src/` |
| `updatedAt` | `string` | `agent.last_seen_at \|\| agent.created_at` (`connectionCrud.ts:47`, `connectionCrud.ts:66`) | no reader in `src/` |
| `lastUsedAt` | `string?` | **never written** | `AIChatLibrary.tsx:122,125` (always `undefined`) |
| `isShared` | `boolean?` | `agent.access_type === 'team'` (`connectionCrud.ts:48`, `connectionCrud.ts:67`) | **never read** — all UI tests `access_type === 'team'` instead (`ConnectorList.tsx:118`, `ConnectorSettings.tsx:80`, `DataExplorerLayout.tsx:154`) |
| `access_type` | `'owner' \| 'team'`? | `agent.access_type ?? 'owner'` (`connectionCrud.ts:49`, `connectionCrud.ts:68`) | `ConnectorOverview.tsx:197`; `ConnectorList.tsx:118`; `ConnectorSettings.tsx:80`; `ConnectionSelector.tsx:117,126`; `DataExplorerLayout.tsx:154`; `DashboardView.tsx:74` |
| `team_name` | `string \| null`? | `agent.team_name ?? null` (`connectionCrud.ts:50`, `connectionCrud.ts:69`) | `ConnectorSettings.tsx:168` |
| `shared_by_name` | `string \| null`? | `agent.shared_by_name ?? null` (`connectionCrud.ts:51`, `connectionCrud.ts:70`) | `ConnectorList.tsx:189,305`; `ConnectorSettings.tsx:177,199`; `ConnectionSelector.tsx:126` |

### 2.4 `DatabaseConnector` — every field

`src/components/connector/api/types.ts:7-26`. Returned by `GET /api/agent/status` (`crud.ts:20`).

| Field | Type | Rendered? |
| --- | --- | --- |
| `id` | `string` — "Registration UUID" (`types.ts:8`) | Yes — React `key` (`ConnectorList.tsx:85`, `ConnectorSettings.tsx:92`) and the revoke/remove URL segment |
| `agent_id` | `string` — "Connector ID, e.g. `agt_laptop_abc123`" (`types.ts:9`) | Yes — `ConnectorList.tsx:178`, `ConnectorSettings.tsx:119`, `ConnectorOverview.tsx:186` |
| `machine_label` | `string` — "e.g. `vivek-laptop`" (`types.ts:10`) | Yes — `ConnectorList.tsx:175`, `ConnectorSettings.tsx:116`, `ConnectorOverview.tsx:183`, `ConnectorHealth.tsx:26` |
| `status` | `'pending' \| 'active' \| 'revoked'` (`types.ts:11`) | Yes — `ConnectorList.tsx:140,161,223`, `ConnectorSettings.tsx:79,161` |
| `is_online` | `boolean` (`types.ts:12`) | Yes, extensively |
| `last_seen_at` | `string?` (`types.ts:13`) | Yes — `ConnectorList.tsx:227`, `ConnectorSettings.tsx:86`, `ConnectorOverview.tsx:187-190` |
| `ip_address` | `string?` (`types.ts:14`) | **No — declared, never rendered** |
| `agent_version` | `string?` (`types.ts:15`) | **No — declared, never rendered** |
| `created_at` | `string` (`types.ts:16`) | Yes — `ConnectorSettings.tsx:82-84` |
| `access_type` | `'owner' \| 'team'`? (`types.ts:19`) | Yes |
| `registration_id` | `string?` — "set on shared agents" (`types.ts:20`) | **No** |
| `share_id` | `string?` — `team_shared_agents` row id (`types.ts:21`) | **No** (the collaboration panel reads its own type) |
| `team_id` | `string?` (`types.ts:22`) | **No** |
| `team_name` | `string \| null`? (`types.ts:23`) | Yes — `ConnectorSettings.tsx:168` |
| `shared_by_name` | `string \| null`? (`types.ts:24`) | Yes |
| `shared_by_email` | `string \| null`? (`types.ts:25`) | Yes — fallback in `ConnectorSettings.tsx:177` |

### 2.5 `listConnections()` — the read adapter

`src/components/connector/api/connectionCrud.ts:13-80`. This is the only producer of `Connection[]`; the frontend stores no connection records of its own.

1. Calls `listConnectors()` → `GET /api/agent/status` (`connectionCrud.ts:15` → `crud.ts:20`).
2. Iterates agents with `Promise.all` (`connectionCrud.ts:20-21`).
3. **Skips agents whose `status === 'revoked'`** (`connectionCrud.ts:22`) — revoked connectors never appear in the connection list, though they still appear in `ConnectorList`/`ConnectorSettings` (which read `useConnectors`, not `useConnections`).
4. Seeds `dbs` from a non-declared `(agent as any).databases` (`connectionCrud.ts:24`).
5. If the agent `is_online` and reported zero databases, fires `GET /api/agent/{agent_id}/databases` (`connectionCrud.ts:25-28`), swallowing errors to `[]` (`connectionCrud.ts:29-31`).
6. If databases came back, emits one `Connection` per database (`connectionCrud.ts:34-53`). Otherwise emits a single synthetic connection with `database`/`db_alias` = `'default'` (`connectionCrud.ts:54-72`).
7. The entire body is wrapped in `try/catch → return { connections: [] }` (`connectionCrud.ts:14`, `connectionCrud.ts:77-79`).

Consequence: **an HTTP failure and "you have no connectors" are indistinguishable to every consumer.** `ConnectorList` renders its "No PostgreSQL connectors registered" empty state for both (`ConnectorList.tsx:46-58`); `ConnectionSelector` renders "No active databases" (`ConnectionSelector.tsx:141-149`).

Also note step 5 fires one extra request **per online agent** on every poll of `useConnections`, which runs every 4–8 s (`useConnections.ts:31-37`).

---

## 3. The Connection Wizard

`src/components/connector/ConnectorWizard.tsx`. Mounted by the `'connect'` tab (`ConnectorDialog.tsx:107`), which is the tab `DataExplorerPage` selects by default for the dialog (`DataExplorerPage.tsx:65`).

### 3.1 Step machine

`type Step = 'install' | 'credentials' | 'result'` — `ConnectorWizard.tsx:19`. Initial state `'install'` (`ConnectorWizard.tsx:29`).

| Step | Stepper label | Content | Citation |
| --- | --- | --- | --- |
| `install` | `1. Setup CLI` | 4 copyable CLI commands + "I have my Connector ID & Key" | `ConnectorWizard.tsx:441-443`, `164-245` |
| `credentials` | `2. Register Key` | Two inputs (Connector ID, Connection Key) + Verify | `ConnectorWizard.tsx:443`, `249-316` |
| `result` | `3. Connected` | Online/offline card, discovered DB list, refresh, Done | `ConnectorWizard.tsx:444`, `319-433` |

Stepper status derivation: active = current step; every step is `completed` once `step === 'result'`; `install` is `completed` when on `credentials`; otherwise `upcoming` (`ConnectorWizard.tsx:447-452`). There is no step going *backwards* except the explicit `Back` button (`ConnectorWizard.tsx:304`).

### 3.2 Step 1 — `install`

Hardcoded command list, `ConnectorWizard.tsx:21-26`:

| # | Command | Comment |
| --- | --- | --- |
| 1 | `npm i -g @vivekmind/pg-connector` | `# Install CLI globally` |
| 2 | `pg-connector init` | `# Generate secret connector key` |
| 3 | `pg-connector db add` | `# Attach your PostgreSQL database` |
| 4 | `pg-connector start` | `# Launch background daemon` |

Environment note rendered as text: `Node.js 18+ required` (`ConnectorWizard.tsx:171-173`). External link: `https://github.com/Schema-Weaver/pg-connector` with `rel="noopener noreferrer"` (`ConnectorWizard.tsx:139-142`).

Clipboard: `handleCopyAll` joins the 4 commands with `\n` and writes them (`ConnectorWizard.tsx:80-86`); `handleCopySingle` writes one command (`ConnectorWizard.tsx:88-93`). Both reset their "copied" flag after `2000` ms (`ConnectorWizard.tsx:85`, `ConnectorWizard.tsx:92`). `SimpleCommandRow` uses the same 2000 ms reset (`ConnectorWizard.tsx:498`).

### 3.3 Step 2 — `credentials`

| Field | State var | Placeholder | Prefix hint | Validation |
| --- | --- | --- | --- | --- |
| Connector ID | `connectorIdInput` (`ConnectorWizard.tsx:30`) | `agt_vivek-laptop-msi_12662b69` (`:270`) | `Starts with agt_` (`:263`) | must be non-empty **and** `startsWith('agt_')` (`:100-103`) |
| Connection Key | `connectionKeyInput` (`ConnectorWizard.tsx:31`) | `swagt_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` (32 `x` after the prefix) (`:287`) | `Starts with swagt_` (`:280`) | must be non-empty **and** `startsWith('swagt_')` (`:105-108`) |

Additional behaviour:

- Both values are `.trim()`ed before validation and before submission (`ConnectorWizard.tsx:97-98`).
- The Verify button is `disabled` when `verifyMutation.isPending` or either trimmed field is empty (`ConnectorWizard.tsx:309`). The `agt_`/`swagt_` prefix checks only fire on click (`ConnectorWizard.tsx:100,105`).
- Pressing **Enter** in the Connection Key field triggers verify (`ConnectorWizard.tsx:289`).
- Connector ID input has `autoFocus`; the key input does not (`ConnectorWizard.tsx:272`, `284-290`).
- There is **no length check, no charset check, no regex beyond the prefix, and no `required`/`pattern` attribute.**
- Validation failures raise a `sonner` toast and `return` before any network call (`ConnectorWizard.tsx:101`, `ConnectorWizard.tsx:106`).

Optional fields: **none.** Both inputs are mandatory; there is no display-name field, no host, no port, no SSL mode, no database name, no tags.

### 3.4 Step 2 → 3 submission

`handleVerify` (`ConnectorWizard.tsx:96-124`) calls `verifyMutation.mutateAsync({ connectionKey, connectorId })` (`ConnectorWizard.tsx:111-114`). Note it passes **only two arguments** — the mutation's `machineLabel?: string` (`hooks.ts:107`) is never supplied, so `crud.ts:34` sends `machine_label: undefined`, which `JSON.stringify` (`client.ts:262`) drops from the body entirely.

On success: `setResult(res)`, `setStep('result')`, and a success toast **only if** `res.is_online` (`ConnectorWizard.tsx:115-120`). A successful verify that returns `is_online: false` produces no toast.

### 3.5 Step 3 — `result`

Rendered only when `result` is non-null (`ConnectorWizard.tsx:319`).

- Header: engine icon with `engine="postgres"`, `isOnline={result.is_online}`, `showStatusDot` (`ConnectorWizard.tsx:331-336`); machine label with fallback `'Local Agent Host'` (`ConnectorWizard.tsx:340`); `result.agent_id` in mono (`ConnectorWizard.tsx:343`); Online/Offline badge with `Wifi`/`WifiOff` (`ConnectorWizard.tsx:356-360`).
- **Discovered Databases** block, rendered only when `result.databases.length > 0` (`ConnectorWizard.tsx:365-393`): count in the header (`:369`), each row keyed by `db.db_alias` (`:374`) showing `db.database` (`:382`) and, when present, `db.version` in a chip (`:384-388`). Scroll region `max-h-36 overflow-y-auto` (`ConnectorWizard.tsx:372`).
- **Offline recovery block**, rendered only when `!result.is_online` (`ConnectorWizard.tsx:396-426`): heading `Connector Daemon is Offline` (`:405`), a `Refresh Status` button (`:412-421`), and a `pg-connector start` command row (`:424`).
- `Done & Start Exploring` calls `onClose` (`ConnectorWizard.tsx:429`). In the dialog, `onClose` is `() => setActiveTab('connectors')` (`ConnectorDialog.tsx:107`) — **the modal stays open**; it switches to the connectors tab.

### 3.6 Post-verify online promotion

An effect watches the polled connector list while on `result`; if the live connector for `result.agent_id` is `is_online` while `result.is_online` is false, it patches the local result and toasts `PostgreSQL connector is online!` (`ConnectorWizard.tsx:40-51`). This works because `useConnectors` polls every 10 s (`hooks.ts:46`).

`handleRefreshStatus` (`ConnectorWizard.tsx:53-78`) awaits `refetchConnectors()`, patches `is_online` + `machine_label`, and toasts either `PostgreSQL connector is now Online!` (`:67`) or `Connector daemon is not running yet. Run "pg-connector start" in your terminal.` (`:69`). If the agent is not present in the refreshed list at all, no toast fires (the `if (found)` guard at `:59`). A thrown error yields `toast.error('Failed to check daemon status')` (`:74`). The button is disabled and the icon spins while `isRefreshing` (`:417-419`).

### 3.7 Wizard error handling summary

| Condition | Mechanism | Citation |
| --- | --- | --- |
| Bad `agt_` prefix | `toast.error('Enter a valid Connector ID starting with agt_')`, abort | `ConnectorWizard.tsx:100-103` |
| Bad `swagt_` prefix | `toast.error('Enter a valid Connection Key starting with swagt_')`, abort | `ConnectorWizard.tsx:105-108` |
| Verify rejected | inline destructive banner rendering `(verifyMutation.error as any)?.message \|\| 'Verification failed'` | `ConnectorWizard.tsx:294-299` |
| Verify rejected (thrown path) | `toast.error(err?.message \|\| 'Failed to verify connector')` | `ConnectorWizard.tsx:121-123` |
| Status refresh failed | `toast.error('Failed to check daemon status')` | `ConnectorWizard.tsx:73-75` |

---

## 4. Credential Handling

### 4.1 What credential fields exist

Exactly two user-entered secrets/identifiers, both in the wizard:

| Field | Type in wire format | Prefix constraint | Destination |
| --- | --- | --- | --- |
| Connector ID | `agent_id: string` (`crud.ts:33`) | `agt_` (`ConnectorWizard.tsx:100`) | `POST /api/agent/register/token` body |
| Connection Key | `agent_token: string` (`crud.ts:32`) | `swagt_` (`ConnectorWizard.tsx:105`) | `POST /api/agent/register/token` body |

**There are no database credential fields anywhere in the frontend.** No host, port, username, password, connection string, SSL cert, or private-key input exists in `src/components/connector/**`. Grep for `password|secret|token|credential` across the folder returns only comments, the `'credentials'` step id, the CLI hint `# Generate secret connector key` (`ConnectorWizard.tsx:23`), the `pg-connector config --token` hint (`ConnectorWizard.tsx:255`), and the `agent_token` wire field (`crud.ts:32`).

`Connection` (`connectionTypes.ts:19-39`) and `DatabaseConnector` (`types.ts:7-26`) contain no credential fields. The only host-identifying field anywhere is the undeclared `host_hash?: string` (`connectionTypes.ts:28`), which is never written and never read.

### 4.2 Write-only / never-returned

- The Connection Key is **never returned by any endpoint the frontend calls.** `ConnectorVerifyResult` (`types.ts:37-46`) carries `success`, `agent_id`, `registration_id`, `machine_label`, `is_online`, `status`, `message`, `databases` — no token. `DatabaseConnector` (`types.ts:7-26`) has no token field. `DiscoveredDatabase` (`types.ts:29-34`) has none.
- Therefore the key is effectively **write-only from the frontend's perspective**: it is sent once at `ConnectorWizard.tsx:111-114` and never read back.
- `ConnectorVerifyResult.registration_id` (`types.ts:40`) is returned by the verify call but **never used** — the UI does not retain it and never uses it for revoke/remove; those calls use `connector.id` fetched from `GET /api/agent/status` (`ConnectorList.tsx:123`, `ConnectorSettings.tsx:209`).

### 4.3 Connection keys (`connectionKeys`)

`src/components/connector/api/connectionKeys.ts:28-33`:

```ts
export const connectionKeys = {
  all:      ['connections'] as const,
  listRoot: ['connections', 'list'] as const,
  list: (userId?: string) => ['connections', 'list', userId || 'anonymous'] as const,
};
```

- These are **React Query cache keys, not cryptographic keys.**
- `listRoot` is documented as "Prefix covering every user's connection list, for bulk invalidation" (`connectionKeys.ts:30-31`) but has **no production caller** — only `src/lib/__tests__/queryKeys.test.ts:138-140`.
- The file exists purely to break a historical import cycle; the full rationale is in its header comment (`connectionKeys.ts:4-26`). It is re-exported through `useConnections.ts` (`useConnections.ts:20`).

### 4.4 Encryption, masking, storage

| Mechanism | Present? | Evidence |
| --- | --- | --- |
| Client-side encryption of the key | **No** | No crypto call anywhere in `src/components/connector/**` |
| Input masking / `type="password"` / reveal toggle | **No** | The key uses the shared `<Input>` with no `type` override — plain text, rendered on screen (`ConnectorWizard.tsx:284-290`) |
| Truncation or redaction in logs | **No** | The key is never logged; no `logger` call in the connector folder |
| `localStorage` / `sessionStorage` / IndexedDB persistence of the key | **No** | Key lives only in `useState` (`ConnectorWizard.tsx:31`); `DataExplorerPage` persists only the *connection id* under `sw-data-explorer:connection-id` (`DataExplorerPage.tsx:53,58-60,123-129`) |
| Post-submit state clear | **No** | There is no `setConnectionKeyInput('')` anywhere in the file. The value remains in component state for as long as the wizard stays mounted |
| Backend re-issue / rotation UI | **No** | The only credential-lifecycle actions are revoke and remove (`crud.ts:41-50`) |

**Revocation semantics** as documented in code comments: `revokeConnector` = "Revoke a database proxy connector's credentials (soft revoke)" (`crud.ts:39`); `removeConnector` = "Permanently remove a connector registration and its associated tokens" (`crud.ts:45-46`).

### 4.5 The `sslMode` fiction

`listConnections` stamps `sslMode: 'require'` on every synthesised connection regardless of reality (`connectionCrud.ts:44`, `connectionCrud.ts:63`). The value is derived from nothing — not from the agent, not from a user setting — and **no component reads it**. There is no UI to change it.

### 4.6 Team-shared connectors are read-only in the UI

When `access_type === 'team'`, both management panels replace the revoke/remove buttons with explanatory text:

- `ConnectorList.tsx:303-307` — `Shared by {shared_by_name || 'a teammate'} — this connector is managed by its owner.`
- `ConnectorSettings.tsx:195-201` — `Managed by {shared_by_name || 'the team owner'}. Credentials and connector daemon can only be modified by the owner.`

This is a **client-side visibility guard only**. The comment at `ConnectorList.tsx:116-117` states the intent ("they belong to another user, so management actions are not available"), but the buttons being hidden does not by itself stop the underlying `POST /api/agent/revoke/{id}` call. See Security-Relevant Observations.

---

## 5. Connection Health

### 5.1 Status enums

There are **two distinct, unrelated status concepts**.

| Enum | Type | Meaning in code | Citation |
| --- | --- | --- | --- |
| Registration status | `DatabaseConnector.status: 'pending' \| 'active' \| 'revoked'` | Lifecycle of the agent registration, not health. `'revoked'` renders a destructive badge and hides the Revoke button | `types.ts:11`; `ConnectorList.tsx:140,162-163,199,208-209`; `ConnectorSettings.tsx:79,139-140,146-147`; `ConnectorList.tsx:309` |
| Health status | `Connection.health_status?: 'healthy' \| 'unhealthy' \| 'unknown'` | Derived **solely** from `agent.is_online` — there is no independent probe | `connectionTypes.ts:29`; `connectionCrud.ts:45`, `connectionCrud.ts:64` |
| Event status | `HealthEvent.status: 'healthy' \| 'unhealthy' \| 'online' \| 'offline' \| string` | Per-event health/latency sample | `types.ts:71` |

**`'unknown'` is unreachable from `listConnections`.** The ternary only ever produces `'healthy'` or `'unhealthy'` (`connectionCrud.ts:45`, `connectionCrud.ts:64`). The `'unknown'` branch only appears as a render-time fallback in `AIChatLibrary.tsx:118` (`conn.health_status ?? 'unknown'`), which is therefore reachable only if `health_status` is `undefined`, which `listConnections` never produces.

`'pending'` and `'active'` are declared but never branched on — anything not `'revoked'` renders as `Offline` (`ConnectorList.tsx:210-211`) or shows the raw string (`ConnectorList.tsx:223`, `ConnectorSettings.tsx:161`).

### 5.2 What the UI treats as healthy

`isHealthy = status === 'healthy' || status === 'online' || status === 'success'` at three sites: the derived `successRate` fallback (`ConnectorHealth.tsx:36`), the latency bar colour (`ConnectorHealth.tsx:226`), and the recent-events list (`ConnectorHealth.tsx:288`).

Note `'success'` is honoured by the UI but is **absent from the `HealthEvent.status` literal list** (`types.ts:71`), while `'offline'` and `'unhealthy'` are declared but never distinguished — both render the `Unhealthy` badge (`ConnectorHealth.tsx:317`).

### 5.3 Health check endpoint and payload

`getHealthEvents(connectorId?, timeRange = '24h')` — `crud.ts:77-106`.

- Request: `GET /api/agent/health`, with `connectorId` appended **only if** it is truthy and not `'all'`, and `timeRange` appended if truthy (`crud.ts:79-84`). `URLSearchParams` is used (`crud.ts:79`), so values are form-encoded.
- Response shape: `{ success: boolean } & HealthMetricsResult` (`crud.ts:85`) where `HealthMetricsResult` = `{ averageLatencyMs, p95LatencyMs, successRate, totalQueries, events: HealthEvent[], relay?, connected_agents? }` (`types.ts:78-86`).
- Coerced defaults applied to every field: `averageLatencyMs ?? 0`, `p95LatencyMs ?? 0`, `successRate ?? 100`, `totalQueries ?? 0`, `events ?? []`, `relay ?? 'ok'`, `connected_agents ?? 0` (`crud.ts:86-94`).

`relay` is typed and defaulted (`types.ts:84`, `crud.ts:92`) but **never rendered** — the "Relay Status" tile in `ConnectorOverview` derives its Active/Standby state from `onlineConnectors > 0` instead (`ConnectorOverview.tsx:89-96`), and the identically named tile in `ConnectorHealth` derives it from `onlineHostsCount > 0` (`ConnectorHealth.tsx:126-133`).

**There is no health-check *trigger* endpoint in this module.** No ping, no POST, no test-connection call. Health is entirely read-side.

### 5.4 Polling

| Hook | `refetchInterval` | `staleTime` | `refetchOnWindowFocus` | `enabled` |
| --- | --- | --- | --- | --- |
| `useHealthEvents` | `5_000` ms (`hooks.ts:87`) | `2_000` ms (`hooks.ts:86`) | `true` (`hooks.ts:88`) | none — always enabled (`hooks.ts:83-89`) |
| `useConnectors` | `user ? 10_000 : false` (`hooks.ts:46`) | `5_000` ms (`hooks.ts:47`) | inherits global `false` (`queryClient.ts:16`) | `Boolean(user?.id)` (`hooks.ts:45`) |
| `useConnections` | `4_000` ms, or `8_000` ms if any connection `is_online` (`useConnections.ts:31-37`) | `2_000` ms (`useConnections.ts:30`) | `true` (`useConnections.ts:38`) | `Boolean(user?.id)` (`useConnections.ts:29`) |

Global defaults that apply to all of the above: `staleTime 60 * 1000`, `gcTime 5 * 60 * 1000`, `retry: 2`, `retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000)`, `refetchOnWindowFocus: false` (`queryClient.ts:12-17`); mutations `retry: 1` (`queryClient.ts:20`).

Persistence: the IndexedDB persister only writes queries whose key root is `'data-explorer'` and whose second segment is not `'rows'` (`persist.ts:47-51`), DB name `sw-explorer-query-cache`, buster `v1`, max age `EXPLORER_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000` (`persist.ts:13-16`). **No connector or connection query is persisted.**

### 5.5 Client-side metric derivations

`ConnectorHealth.tsx`:

- `p95Latency` fallback: sorts event latencies ascending and takes index `Math.floor(events.length * 0.95)`, falling back to `avgLatency` when that is falsy (`ConnectorHealth.tsx:32-34`). At `events.length === 20` the index is `19` — the last element — and at other lengths it can index past the end, where `|| avgLatency` catches the `undefined`.
- `successRate` fallback: `Math.round(healthyCount / events.length * 100)` where healthy means `healthy|online|success` (`ConnectorHealth.tsx:35-37`).
- Chart window: `events.slice(0, 16).reverse()` — the 16 most recent, reversed to chronological (`ConnectorHealth.tsx:41-43`), rendered as a `h-28` bar row (`ConnectorHealth.tsx:222`).
- Bar height: `Math.min(100, Math.max(14, Math.round((lat / maxLatency) * 100)))` — floor of 14 %, ceiling of 100 % (`ConnectorHealth.tsx:225`). `maxLatency` is `Math.max(...latencies, 100)`, floor 100 ms (`ConnectorHealth.tsx:45-48`).
- Colour thresholds — chart legend and bars: `<100ms` emerald, `<500ms` blue, `>500ms` amber, unhealthy destructive (`ConnectorHealth.tsx:194-206`, `236-241`). Event-row badges use a *different* pair: `<200ms` / `<1000ms` / else (`ConnectorHealth.tsx:333-339`). The same two-tier split appears in the logs list (`ConnectorExecutionLogs.tsx:259-263`) and the overview snapshot (`ConnectorOverview.tsx:322-326`).
- "Relay Status" is `Active` when `onlineHostsCount > 0`, else `Standby` (`ConnectorHealth.tsx:132`).
- "Avg Latency" tile prints `—` when `events.length === 0` (`ConnectorHealth.tsx:148`); "P95" likewise (`ConnectorHealth.tsx:165`); "Success Rate" prints a literal `'100%'` when there are no events (`ConnectorHealth.tsx:178`).
- Time-window options are exactly `'1h' | '24h' | '7d' | '30d'` with default `'24h'` (`ConnectorHealth.tsx:16`, `110-113`); both are sent verbatim as the `timeRange` query param (`crud.ts:81`).
- Connector `<Select>` option labels truncate the agent id to `id.slice(0, 12) + '...'` (`ConnectorHealth.tsx:91`).
- Events list is a `ScrollArea` fixed at `h-[320px]` (`ConnectorHealth.tsx:285`).

### 5.6 Error path

`getHealthEvents` catches everything and returns the all-defaults object, including `successRate: 100` (`crud.ts:95-105`). A 500, a 401, or an offline network all render as a perfectly healthy, perfectly idle monitor.

---

## 6. Execution Logs

### 6.1 `ExecutionEvent` fields

`src/components/connector/api/types.ts:49-62`.

| Field | Type | Rendered / consumed at |
| --- | --- | --- |
| `id` | `string` | React key (`ConnectorExecutionLogs.tsx:212`), copy-confirmation id (`:275,280`) |
| `agent_id` | `string?` | not read in the logs UI |
| `connection_id` | `string?` | inspector "Connection" cell, fallback `'default'` (`ConnectorExecutionLogs.tsx:344`) |
| `db_alias` | `string?` | not read in the logs UI |
| `event_type` | `string` | categoriser input (`ConnectorExecutionLogs.tsx:71`), filter match (`:92`), `SCHEMA_PROBE` / `EXPORT` checks (`:81-82,104-105`) |
| `query_sql` | `string \| null` | list source (`:70`), inspector `<pre>` (`:321-327`) |
| `duration_ms` | `number?` | duration badge (`:207,266`), inspector (`:332`) |
| `status` | `'success' \| 'error' \| 'timeout' \| 'cancelled' \| string` | success/fail icon split (`:206,218-222`), inspector (`:336`) |
| `error_message` | `string \| null` | **never rendered** |
| `row_count` | `number?` | row badge, shown only when `> 0` (`ConnectorExecutionLogs.tsx:208,250-254`), inspector (`:340`) |
| `metadata` | `Record<string, unknown>?` | two fallback reads only: `metadata.duration_ms` (`:207`) and `metadata.sql` (`:70`) |
| `created_at` | `string` | `toLocaleTimeString` with h/m/s (`ConnectorExecutionLogs.tsx:204-205`) |

`'timeout'` and `'cancelled'` are declared but not distinguished: the UI renders `CheckCircle2` only for `status === 'success'`, and `XCircle` (destructive) for everything else (`ConnectorExecutionLogs.tsx:206,218-222`; identically `ConnectorOverview.tsx:273,292-296`).

### 6.2 Pagination and limits

- `limit=50` is **hardcoded** into the query string (`crud.ts:65-66`). There is no page, offset, cursor, `before`/`after`, or total count in the request.
- No "load more" / pagination control exists in the UI. The list is a fixed-height `ScrollArea` of `h-[300px]` (`ConnectorExecutionLogs.tsx:201`); the loading and empty states are `h-[280px]` (`:196`, `:296`).
- The header counter reads `filteredLogs.length` after client-side filtering (`ConnectorExecutionLogs.tsx:190-192`), i.e. it reports a number out of at most 50.
- Server-side ordering of the 50 events is not specified anywhere in this code.

### 6.3 Filters

Two filters, both **client-side only**, applied after the fetch (`ConnectorExecutionLogs.tsx:76-98`):

1. **Category tabs** — exactly four tabs render: `ALL`, `QUERY`, `Schema`, `Export` (`ConnectorExecutionLogs.tsx:143-148`). The tab bar is horizontally scrollable (`overflow-x-auto`, `:142`). Counts are computed over the unfiltered set (`:100-109`).
2. **Free text** — `placeholder="Filter SQL or table..."` (`:177`), matched case-insensitively as a substring against **four** fields: the SQL text, the derived headline, the derived table name, and `event_type` (`:87-94`). The input is `w-full sm:w-48 sm:max-w-xs` (`:172`).

Category derivation, `parseSqlSummary(sql, rawEventType)` — `ConnectorExecutionLogs.tsx:24-59`:

| Condition | Result | Citation |
| --- | --- | --- |
| `!sql` | `headline: 'Database Connection Event'`, `category: 'CONNECT'` | `:25-27` |
| matches `/information_schema\|pg_catalog\|pg_class\|pg_indexes\|pg_tables\|pg_attribute/i` **or** `eventType === 'SCHEMA_PROBE'` | enters the SCHEMA branch | `:31` |
| … and `pg_indexes` | `'Inspect Table Indexes'`, table from `/tablename\s*=\s*'([^']+)'/i` | `:32-35` |
| … and `table_name` or `table_schema` | `'Discover Tables & Schemas'`, `secondary: 'information_schema.tables'`, **no table** | `:36-38` |
| … and `columns` | `'Inspect Column Metadata'`, table from `table_name = '...'` | `:39-42` |
| … otherwise | `'Schema Catalog Probe'`, `secondary: 'System catalog query'` | `:43` |
| `/^SELECT\s+count\(/i` | `` `COUNT FROM ${table \|\| 'table'}` ``, `category: 'QUERY'` | `:50-52` |
| `FROM` match present | `` `SELECT FROM ${table}` ``, `category: 'QUERY'` | `:54-56` |
| otherwise | `clean.slice(0, 60)`, `category: 'QUERY'` | `:58` |

Table extraction regex: `/FROM\s+(?:"?[\w]+"?\.)?"?([\w]+)"?/i` (`:47`).

`'EXPORT'` is in the category union (`:21`) and the filter branch accepts it (`:82`) and counts it (`:105`) — but **`parseSqlSummary` never returns `'EXPORT'`**. The Export tab can only ever be populated by a backend `event_type === 'EXPORT'`.

`'CONNECT'` counts are computed (`:106`) and the filter branch exists (`:83`), but **no CONNECT tab is rendered** (`:143-148`), so connect events are visible only under `ALL`.

### 6.4 SQL display, copy, inspector

- SQL source for the row: `log.query_sql || (log.metadata as any)?.sql || null` (`ConnectorExecutionLogs.tsx:70`).
- Per-row copy button, rendered **only when `sql` is truthy** (`:273-285`); otherwise a `w-5` spacer keeps alignment (`:287`). `handleCopySql` calls `e.stopPropagation()` so copying does not open the inspector (`:112`), and clears the confirmation after `2000` ms (`:115`).
- Inspector is an inline panel (not a modal) below the list, opened by clicking a row (`:213`), closed by a `Close` button (`:312-319`). It renders the SQL `<pre>` **only** when `inspectedLog.event.query_sql` is truthy (`:321`) — it does *not* apply the `metadata.sql` fallback the list uses, so a log whose SQL exists only in `metadata.sql` shows a headline but no SQL block.
- Inspector grid is 4 cells: Duration `duration_ms || 0`, Status (with `capitalize`), Rows `row_count || 0`, Connection `connection_id || 'default'` (`:329-346`). The SQL `<pre>` is `max-h-28 overflow-x-auto whitespace-pre-wrap` (`:324`).
- Only one inspector is open at a time — it is a single state slot (`:65`).

### 6.5 What is logged vs not

The frontend logs nothing itself — it only renders whatever `/api/agent/events` returns. The observable event taxonomy from the UI code is: schema catalog probes, ordinary `SELECT`s, `SELECT count(*)`, connection events (no SQL), and `EXPORT`-typed events. The repo's `docs/CONNECTOR_SECURITY_ARCHITECTURE.md:217-225` lists the intended telemetry set (SQL fingerprints, redacted previews, duration, rows returned/affected, operation type, health events, connection events, error information); the frontend types carry duration, row count, operation type and error message (`types.ts:49-62`).

### 6.6 Retention

**Nothing in this codebase defines or enforces log retention.** The only bound is the `limit=50` request parameter (`crud.ts:65-66`) and React Query's in-memory `gcTime` of 5 minutes (`queryClient.ts:13`). No connector query is persisted to IndexedDB (`persist.ts:47-51`).

---

## 7. Connector Settings

`src/components/connector/ConnectorSettings.tsx` is titled `Proxy Settings` in the UI (`:66`) with the description "Manage security credentials and connection status for proxy daemons" (`:68`).

**It exposes no configurable setting.** There is no toggle, no input, no select, no dropdown, no slider — the only `<Button>` elements are `Refresh` (`:71-74`), `Revoke Credentials` (`:205-214`) and `Remove Connector` (`:216-225`). What it actually renders is read-only status plus destructive actions.

### 7.1 Fields displayed per connector

| Cell | Value expression | Citation |
| --- | --- | --- |
| Machine label | `connector.machine_label` | `:116` |
| Agent id | `connector.agent_id` | `:119` |
| Team badge | rendered when `access_type === 'team'`, label `Team Shared` | `:80,124-132` |
| Online/Offline/Revoked badge | `is_online` → `Online`; else `status === 'revoked'` → `Revoked`; else `Offline` | `:133-151` |
| Status | raw `connector.status` with `capitalize` | `:161` |
| Access | `Team: {team_name}` / `Shared with Team` / `Owner (You)` | `:168` |
| Registered **or** Shared By | label flips on `isShared`; value is `shared_by_name \|\| shared_by_email \|\| 'Team Member'` for shared, else `created_at.toLocaleDateString()` or `'Active'` if unparseable | `:173-179`, `:82-84` |
| Last Active | `last_seen_at.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })` — **the cell is omitted entirely** when `last_seen_at` is absent or `isNaN` | `:86-88`, `:181-190` |
| Card opacity | `opacity-60` when `status === 'revoked'` | `:79,93-96` |

The grid is `grid-cols-2 sm:grid-cols-4` (`:156`), so Last Active makes 4 cells on `sm+` and 3 cells otherwise — the layout is not balanced because of the conditional.

### 7.2 Persistence

**Nothing is persisted.** No `localStorage`, no `sessionStorage`, no IndexedDB, no server-side settings endpoint. The only writes are `POST /api/agent/revoke/{id}` (`crud.ts:42`) and `DELETE /api/agent/{id}` (`crud.ts:49`). `Refresh` is a pure `refetch()` of `useConnectors` (`:14-21`), i.e. `GET /api/agent/status` (`hooks.ts:42` → `crud.ts:20`).

The settings changed by this tab are therefore entirely server-side records, and the "settings" surface is a viewer for them.

---

## 8. Databases View

`src/components/connector/ConnectorDatabases.tsx`, reached from the sidebar's `databases` section (`ConnectorSidebar.tsx:13`) and from the `Databases` button on every host row in the overview (`ConnectorOverview.tsx:216-223`, which navigates to `'databases'`).

### 8.1 Data source

It consumes `useConnections()` — the **synthesised `Connection[]`** (`ConnectorDatabases.tsx:21`), *not* `useConnectorDatabases`. `useConnectorDatabases` (the direct `/databases` call, `hooks.ts:54-64`) is used only by `ConnectorList` (`ConnectorList.tsx:109-111`). The refresh button here therefore re-runs the whole `listConnections` pipeline, including the per-agent `/databases` probe (`ConnectorDatabases.tsx:24-31` → `connectionCrud.ts:20-32`).

### 8.2 What each row shows

| Element | Source | Citation |
| --- | --- | --- |
| Engine icon | `<DatabaseEngineIcon connection={conn} …>` — heuristic path | `:116-121` |
| Name | `conn.name` | `:126` |
| Alias | `(conn.db_alias)`, rendered **only if** `db_alias` is truthy and `!== name` | `:128-132` |
| Online/Offline badge | `conn.is_online ? 'Online' : 'Offline'` | `:133-143` |
| Host line | `Host: {machine_label} ({agent_id})`, whole block omitted if `machine_label` is falsy | `:145-154` |
| Explore button | `onSelectConnection(conn.id)` + `toast.success('Switched to database "{name}"')` | `:159-172` |

Icon tile is `w-8 h-8` with an emerald tint when online, muted otherwise (`:108-114`). List container is `divide-y max-h-[340px] overflow-y-auto` (`:101`).

### 8.3 Search

Client-side, `useMemo` over the full list; matches `name`, `database`, `machine_label`, `db_alias`, all lowercased (`:33-43`). Placeholder: `Filter databases by name, alias, or host machine...` (`:74`). The search box is `flex-1 max-w-sm` (`:69`). Counts are shown twice — in the filter bar (`:78-80`) and in the card header (`:90-92`).

### 8.4 Database size / table counts

**Neither database size nor table count is shown anywhere in the connector module.** The only per-database metadata available is `DiscoveredDatabase = { db_alias, database, version?, status }` (`types.ts:29-34`):

| Field | Shown in ConnectorDatabases? | Shown elsewhere? |
| --- | --- | --- |
| `db_alias` | Yes, conditionally (`:128-132`) | `ConnectorList.tsx:270-272` |
| `database` | Yes, as `name` (`:126`) | `ConnectorList.tsx:268`; `ConnectorWizard.tsx:382` |
| `version` | **No** | `ConnectorList.tsx:275-279`; `ConnectorWizard.tsx:384-388` |
| `status` | **No** | **Nowhere** — `DiscoveredDatabase.status` (e.g. `"healthy"` per the comment at `types.ts:33`) has no reader |

### 8.5 Discovery mechanism

Databases are enumerated by the **host-side daemon**, relayed through the backend. The browser issues `GET /api/agent/{agent_id}/databases` (`crud.ts:56`) from inside `listConnections` (`connectionCrud.ts:27`) and from `useConnectorDatabases` (`hooks.ts:58`). There is no direct database connection from the browser and no engine-specific discovery query.

Empty states: "No databases match your search query" when the list is non-empty but filtered to zero (`:177-181`); "No databases discovered" with the hint `sw-agent start` when the list is empty (`:182-189`); spinner "Discovering databases..." while `isLoading` (`:95-99`).

---

## 9. `ConnectionSelector`

`src/components/data-explorer/ConnectionSelector.tsx`, rendered in the Data Explorer header (`DataExplorerPage.tsx:392-397`).

### 9.1 Anatomy

A two-part control inside one `h-8 rounded-lg border bg-card` container (`:36`):

| Part | Behaviour | Citation |
| --- | --- | --- |
| Left icon button (`px-2.5`, `rounded-l-lg`) | `onOpenOverview?.()`; `preventDefault` + `stopPropagation`; `title` = `` `Connected to ${selectedConnection.name}` `` or `'Open Connector Dashboard'` | `:38-57` |
| Right dropdown trigger (`rounded-r-lg`, `min-w-0 max-w-[190px]`) | label is `selectedConnection?.name \|\| 'Select Database'` + `ChevronDown` | `:61-71` |
| Dropdown content | `align="start"`, `w-68 p-1` | `:72` |

The left button's `cursor-pointer` class is applied conditionally on `onOpenOverview` being supplied (`:45-48`); it still renders (as a dead control) when the prop is absent.

### 9.2 Grouping and labels

**There is no grouping.** The list is a single flat `connections.map` (`:99-139`) inside `max-h-64 overflow-y-auto space-y-0.5` (`:98`). No section headers, no per-host grouping, no alphabetical sort.

Each row renders:
- engine icon resolved from `connection` (`:106-111`);
- `connection.name` in `text-xs font-medium` (`:114-116`);
- a `Team` chip when `access_type === 'team'` (`text-[8px] uppercase font-black`, `:117-121`);
- a secondary line `via {machine_label}`, plus ` · shared by {shared_by_name}` when team-shared and a sharer name exists — the whole line is omitted when `machine_label` is falsy (`:123-130`);
- a `Check` icon when `connection.id === selectedConnectionId` (`:134-136`).

**Ordering is whatever `listConnections` produced.** `listConnections` iterates agents in `/api/agent/status` order and pushes connections synchronously per agent, but the online-agent database probe is awaited inside `Promise.all` (`connectionCrud.ts:20-32`), so agents that need the fetch can interleave with agents that do not. There is no explicit sort in either layer.

### 9.3 Online / offline indication

Only the icon's status dot (`showStatusDot`, `:109`), which as established in §1.4 is rendered **only when online**. Offline entries therefore get no dot and no text label — a selected-but-offline connection renders the plain label in the trigger with no indicator at all.

### 9.4 Auto-selection

**The component contains none.** Selection is entirely driven by the parent:

| Behaviour | Implementation | Citation |
| --- | --- | --- |
| Initial selection | `useState(() => localStorage.getItem('sw-data-explorer:connection-id') \|\| null)` | `DataExplorerPage.tsx:53`, `58-60` |
| Validate persisted id against the live list | `connections.some(c => c.id === connectionId)` | `DataExplorerPage.tsx:112` |
| Fallback pick | `connections.find(c => c.is_online) \|\| connections[0]` | `DataExplorerPage.tsx:114` |
| Clear when list empties | `setConnectionId(null)` | `DataExplorerPage.tsx:104-109` |
| Persist on change | `localStorage.setItem(STORAGE_KEY, id)` / `removeItem` | `DataExplorerPage.tsx:123-129` |
| One-time nudge toast | `toast.info('Select a connection from the top right to get started', …, { duration: 5000 })` fired when signed in, no selection, ≥1 connection | `DataExplorerPage.tsx:218-226` |
| Side effect of switching | resets the selected table to `{ table: null, schema: 'public' }` | `DataExplorerPage.tsx:317-320` |
| Force-refresh after joining a team | `refetchConnections()` | `DataExplorerPage.tsx:280` |

### 9.5 Actions exposed

| Action | Trigger | Citation |
| --- | --- | --- |
| Select a database | row click → `onConnectionChange(connection.id)` | `:102` |
| Refetch | `DropdownMenu onOpenChange` → `refetch()` when opened; plus a header `RefreshCw` button; plus a "Scan again" button in the empty state | `:60`, `:78-89`, `:150-162` |
| Open Connector Dashboard | menu item, only if `onOpenOverview` | `:168-176` |
| Connect database (open wizard) | menu item, only if `onOpenConnectWizard` | `:178-186` |

Loading state: `Scanning databases...` with a spinner (`:92-96`). Empty state: `No active databases` plus the hint `sw-agent start` in a `<code>` block, and a `Scan again` button (`:141-163`).

The trigger's tooltip on the left button reflects the selected connection name (`:49`), and `isFetching` drives the spin state on both refresh icons (`:88`, `:160`).

---

## 10. Engine Icons — Coverage Summary

Rendered in the connector UI: `ConnectorWizard.tsx:134` (header), `ConnectorWizard.tsx:331-336`, `ConnectorWizard.tsx:376-381`; `ConnectorSidebar.tsx:13,24,51`; `ConnectorOverview.tsx:62,142,174-179,230,313`; `ConnectorList.tsx:50,166-171,238,261-266`; `ConnectorSettings.tsx:53,107-112`; `ConnectorDatabases.tsx:87,116-121,179,184`; `ConnectorExecutionLogs.tsx:187,242`; `ConnectorHealth.tsx:124`; `ConnectionSelector.tsx:51-56,106-111,143`.

| Icon | Kind | Asset | Citation |
| --- | --- | --- | --- |
| PostgreSQL | `<img>` | `/postgresql.svg` (file confirmed present in `public/`) | `DatabaseEngineIcon.tsx:99-103`, `:77` |
| MySQL / MariaDB | inline SVG | brand hex `#00758F`, `#F29111` | `DatabaseEngineIcon.tsx:108-115` |
| SQLite | inline SVG | `#003B57`, `#41B883` | `DatabaseEngineIcon.tsx:120-123` |
| DuckDB | inline SVG | `#FFF000`, `#FF8000`, `#000` | `DatabaseEngineIcon.tsx:128-132` |
| ClickHouse | inline SVG | `#FA4D35`, `#FFCC00` | `DatabaseEngineIcon.tsx:138-142` |
| Snowflake | inline SVG | `#29B5E8` | `DatabaseEngineIcon.tsx:148-153` |
| MongoDB | inline SVG | `#00ED64`, `#13AA52` | `DatabaseEngineIcon.tsx:160-164` |
| Redis | inline SVG | `#DC382D`, `#A8231B` | `DatabaseEngineIcon.tsx:171-172` |
| Anything else (incl. `'generic'`) | lucide `<Database>` | — | `DatabaseEngineIcon.tsx:176-177` |

Props: `engine?`, `connection?`, `className` (default `'w-4 h-4'`), `wrapperClassName?`, `isOnline?`, `showStatusDot` (default `false`) (`DatabaseEngineIcon.tsx:65-72`, `84-91`). Precedence is `engine` if supplied, else `resolveDatabaseEngine(connection)` (`:92`).

---

## 11. React Query Hooks

### 11.1 Query key factories

`connectorKeys` — `src/components/connector/api/hooks.ts:22-29`:

| Key | Value |
| --- | --- |
| `all` | `['connectors']` |
| `list` | `['connectors','list']` |
| `detail(id)` | `['connectors', id]` |
| `databases(connectorId)` | `['connectors', connectorId, 'databases']` |
| `logs(connectionId?)` | `['connectors','logs', connectionId \|\| 'all']` |
| `health(connectorId?, timeRange='24h')` | `['connectors','health', connectionId \|\| 'all', timeRange]` |

`connectionKeys` — `src/components/connector/api/connectionKeys.ts:28-33`: `all` = `['connections']`, `listRoot` = `['connections','list']`, `list(userId?)` = `['connections','list', userId \|\| 'anonymous']`.

### 11.2 Queries

| Hook | File:line | Query key | `enabled` | `staleTime` | `refetchInterval` | `refetchOnWindowFocus` | `select` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `useConnectors` | `hooks.ts:37-49` | `connectorKeys.list` | `Boolean(user?.id)` (`:45`) | `5_000` (`:47`) | `user ? 10_000 : false` (`:46`) | inherited `false` | returns `res.agents \|\| []` (`:43`) |
| `useConnectorDatabases` | `hooks.ts:54-64` | `connectorKeys.databases(connectorId \|\| '')` | `!!connectorId` (`:61`) | `30_000` (`:62`) | none | inherited `false` | returns `res.databases \|\| []` (`:59`) |
| `useExecutionLogs` | `hooks.ts:69-77` | `connectorKeys.logs(connectionId)` | none (`:70-76`) | `1_000` (`:73`) | `3_000` (`:74`) | `true` (`:75`) | none |
| `useHealthEvents` | `hooks.ts:82-90` | `connectorKeys.health(connectorId, timeRange)` | none (`:83-89`) | `2_000` (`:86`) | `5_000` (`:87`) | `true` (`:88`) | none |
| `useConnections` | `useConnections.ts:22-41` | `connectionKeys.list(user?.id)` | `Boolean(user?.id)` (`:29`) | `2_000` (`:30`) | `4_000` or `8_000` if any `is_online` (`:31-37`) | `true` (`:38`) | `data => data.connections` (`:28`) |

`useConnections` also sets `refetchOnReconnect: true` (`useConnections.ts:39`). The adaptive interval reads the *current* query data, tolerating either the wrapped `{connections}` shape or a bare array (`:33-34`).

All of `useConnectors` and `useConnections` gate on `useAuth()` from `../../auth/context` (`hooks.ts:38`, `useConnections.ts:23`), i.e. `src/components/auth/context.ts`.

### 11.3 Mutations

| Hook | File:line | Variables → endpoint | `onSuccess` invalidations |
| --- | --- | --- | --- |
| `useVerifyConnector` | `hooks.ts:97-113` | `{ connectionKey, connectorId, machineLabel? }` → `POST /api/agent/register/token` (`crud.ts:31`) | `connectorKeys.list` (`hooks.ts:110`) |
| `useRevokeConnector` | `hooks.ts:118-127` | `registrationId` → `POST /api/agent/revoke/{id}` (`crud.ts:42`) | `connectorKeys.all` + `connectionKeys.all` (`hooks.ts:123-124`) |
| `useRemoveConnector` | `hooks.ts:132-142` | `registrationId` → `DELETE /api/agent/{id}` (`crud.ts:49`) | `connectorKeys.all` + `connectionKeys.all` + `dataExplorerKeys.all` (`hooks.ts:137-139`) |

Note the asymmetry: **verify invalidates only `connectorKeys.list`, not `connectionKeys.all`** — so `useConnections` keeps its stale cached list until its own 4–8 s poll lands. Revoke and remove invalidate both, plus (for remove only) the whole `data-explorer` namespace because removing a connector orphans every cached schema/table/stats query keyed by its id.

### 11.4 External invalidators of these keys

Outside the connector module, the collaboration module invalidates connector state:

| Site | Keys |
| --- | --- |
| `useTeamData.ts:247-248` | `connectorKeys.list`, `connectionKeys.all` (global refresh) |
| `useTeamData.ts:272-273` | same, for "refresh shared databases" |
| `useTeamData.ts:289` | `connectorKeys.list` after share |
| `useTeamData.ts:299` | `connectorKeys.list` after unshare |
| `useTeamData.ts:351` | `connectorKeys.list` after team delete |
| `AgentSharesPanel.tsx:42` | `connectorKeys.list` after an agent-share mutation |

### 11.5 Key-factory tests

`src/lib/__tests__/queryKeys.test.ts:130-198` asserts the exact tuples for `connectionKeys` (`:132-140`), `dataExplorerKeys` (`:152-181`) and `connectorKeys` (`:185-198`), including `connectorKeys.logs()` → `['connectors','logs','all']` (`:187`) and `connectorKeys.health()` → `['connectors','health','all','24h']` (`:189`).

---

## Security-Relevant Observations

Reported factually, describing mechanisms only.

### S1 — Connection Key is rendered as plain text, with no masking

The Connection Key field is the shared `<Input>` with **no `type``, no `type="password"`, no reveal/hide toggle, and no masking of any kind** (`ConnectorWizard.tsx:284-290`). The value the user pastes is displayed in cleartext for the whole time the field is on screen. Mechanism: any screen recording, screen share, screenshot, or shoulder-surfing during step 2 captures the secret. There is no `autoComplete="off"`, no `spellCheck={false}`, and no `readOnly` after submission.

Contrast: the Connector ID field, which is not a secret, is styled identically (`ConnectorWizard.tsx:267-273`) — the code does not distinguish secret from non-secret input.

### S2 — The key is never cleared from component state after submission

There is no `setConnectionKeyInput('')` anywhere in `ConnectorWizard.tsx`. After a successful `Verify & Connect`, the secret remains in the React state of the mounted `ConnectorWizard` for as long as that component instance stays mounted — i.e. while the user sits on the `result` step (step 3), which is where the flow parks after verification (`ConnectorWizard.tsx:319`). Step 1 and step 3 do not render the input, so the value is not re-displayed, but it remains reachable to anything with access to the component tree or a React DevTools session.

Mitigating fact: switching tabs unmounts the wizard — `renderContent()` returns a different element per tab (`ConnectorDialog.tsx:92-111`) — and closing/reopening the dialog also remounts it (`DataExplorerPage.tsx:498-507` conditional render), so the state does not survive a tab change or dialog close.

### S3 — Team-shared read-only enforcement is client-side only

For `access_type === 'team'` connectors, both management panels hide the revoke and remove controls (`ConnectorList.tsx:303-307`, `ConnectorSettings.tsx:195-201`), and `ConnectorList.tsx:116-117` states the rationale. This is purely a rendering decision. The underlying calls — `POST /api/agent/revoke/{id}` (`crud.ts:42`) and `DELETE /api/agent/{id}` (`crud.ts:49`) — are ordinary authenticated requests with no client-side ownership check, and `ConnectorList`/`ConnectorSettings` pass `connector.id` straight through (`ConnectorList.tsx:123,133`, `ConnectorSettings.tsx:209,220`). Whether the backend refuses these calls for a non-owner is **UNVERIFIED** from this repo (see Open Questions).

### S4 — Connector identity is transmitted in plaintext request bodies

The Connection Key and Connector ID are sent as a JSON body to `POST /api/agent/register/token` (`crud.ts:31-35`). The transport protections that do apply, via `buildRequestConfig` (`client.ts:80-93`) and `post` (`client.ts:259-264`):

- `credentials: 'include'` — session cookie is sent (`client.ts:86`);
- `Content-Type: application/json` (`client.ts:88`);
- `X-CSRF-Token` header when a token is available (`client.ts:89`).

The CSRF token is read from a JavaScript-readable cookie via `document.cookie.match(/(?:^|;\s*)_csrf=([^;]*)/)` (`client.ts:20`) with an in-memory fallback seeded from `GET /api/csrf-token` (`client.ts:43-56`). A 401 on a non-auth endpoint dispatches a global `auth:unauthorized` event (`client.ts:99-103`, `client.ts:73-78`), so a revoked session should sign the user out.

There is no client-side encryption, signing, or hashing of the key before transmission. There is also no `referrerPolicy` or cache-control concern specific to this flow, since the body is not a URL parameter.

### S5 — Errors are indistinguishable from "no credentials configured"

`listConnections()` catches every error and returns `{ connections: [] }` (`connectionCrud.ts:77-79`), and `getConnectorDatabases` errors inside it are swallowed to `[]` (`connectionCrud.ts:29-31`). The consequence is that an expired session, a 500, or a network partition all render as the "No PostgreSQL connectors registered" state (`ConnectorList.tsx:46-58`) and "No active databases" (`ConnectionSelector.tsx:141-149`), with no error surfaced to the user. A user whose credentials *have* been revoked server-side, and a user who has never registered anything, are the same state in the UI.

The same shape applies to health: `getHealthEvents` returns `successRate: 100` on any failure (`crud.ts:96-105`), and `getExecutionLogs` returns `[]` (`crud.ts:69-71`).

### S6 — `ip_address` may reach the browser unused

`DatabaseConnector.ip_address?: string` (`types.ts:14`) and `agent_version?: string` (`types.ts:15`) are declared as part of the `/api/agent/status` response (`crud.ts:20`). No component renders either field, but both would be present in the browser's memory (and therefore in any React Query devtools or error-reporting payload that serialises the cache) if the backend populates them. Not a credential; flagged because it is host-identifying metadata that is fetched on a 4–10 s poll (`useConnections.ts:31-37`, `hooks.ts:46`).

### S7 — Database credentials are never present in the frontend

No database host, port, username, password, connection string, or TLS key is collected, stored, or transmitted anywhere in `src/components/connector/**`. This matches the Local Credential Boundary claim in `docs/CONNECTOR_SECURITY_ARCHITECTURE.md:19-49` and the `crud.ts:4` comment ("Database credentials stay 100% on the user's host machine"). The frontend, however, enforces nothing about it — `sslMode: 'require'` is fabricated client-side (`connectionCrud.ts:44,63`) and read by nobody, and read-only execution (CERO, `docs/CONNECTOR_SECURITY_ARCHITECTURE.md:51-81`) has **no representation in this codebase at all**: no SQL inspection, no statement-type allowlist, no permission check. Any such enforcement lives in the connector daemon or the backend, neither of which is in this repo.

### S8 — SQL text is persisted in the react-query cache in memory and displayed verbatim

Execution log SQL is rendered in full in the inspector `<pre>` (`ConnectorExecutionLogs.tsx:321-327`) with no truncation or redaction, and the fallback `metadata.sql` (`:70`) is read from the same payload. No SQL is written to IndexedDB — `shouldPersistQuery` restricts persistence to the `'data-explorer'` root and excludes `'rows'` (`persist.ts:47-51`) — so log SQL lives in memory under `connectorKeys.logs(...)` with `gcTime` 5 minutes (`queryClient.ts:13`). The docs list "redacted SQL statement previews" as intended telemetry (`docs/CONNECTOR_SECURITY_ARCHITECTURE.md:218`); **no redaction is implemented in this frontend**.

---

## Dead / Unused Code

Items with no reachable caller, verified by repo-wide grep over `src/`.

### Types and fields

| Item | Location | Note |
| --- | --- | --- |
| `Connection.host_hash?` | `connectionTypes.ts:28` | Never written, never read |
| `Connection.last_health_check?` | `connectionTypes.ts:29` | Never written, never read — yet `getHealthEvents` is the health source |
| `Connection.lastUsedAt?` | `connectionTypes.ts:33` | Read at `AIChatLibrary.tsx:122,125` but never written by `listConnections`, so always `undefined` (renders `—`) |
| `Connection.isShared?` | `connectionTypes.ts:34` | Written at `connectionCrud.ts:48,67`; never read — all consumers test `access_type === 'team'` |
| `Connection.sslMode` | `connectionTypes.ts:23` | Written as a hardcoded `'require'` (`connectionCrud.ts:44,63`); zero readers |
| `Connection.createdAt` / `updatedAt` | `connectionTypes.ts:31-32` | Written; zero readers |
| `DatabaseConnector.ip_address?` | `types.ts:14` | Never rendered |
| `DatabaseConnector.agent_version?` | `types.ts:15` | Never rendered |
| `DatabaseConnector.registration_id?` | `types.ts:20` | Never rendered or used by the connector module |
| `DatabaseConnector.share_id?` | `types.ts:21` | Never used here (collaboration has its own type) |
| `DatabaseConnector.team_id?` | `types.ts:22` | Never rendered |
| `ConnectorVerifyResult.registration_id` | `types.ts:40` | Returned by the verify call; never stored or used — revoke/remove use `connector.id` instead |
| `DiscoveredDatabase.status` | `types.ts:33` | Never rendered or filtered anywhere |
| `ExecutionEvent.agent_id?` | `types.ts:51` | Never rendered in the logs UI |
| `ExecutionEvent.db_alias?` | `types.ts:53` | Never rendered in the logs UI |
| `ExecutionEvent.error_message?` | `types.ts:58` | Never rendered — failures show only an `XCircle` |
| `HealthMetricsResult.relay?` | `types.ts:84` | Defaulted at `crud.ts:92`, never rendered — "Relay Status" is computed from `is_online` counts instead |
| `HealthMetricsResult.connected_agents?` | `types.ts:85` | Defaulted at `crud.ts:93`, never rendered |
| `HealthMetricsResult.totalQueries` | `types.ts:82` | Defaulted at `crud.ts:90`; `ConnectorOverview` uses `logs.length` instead (`ConnectorOverview.tsx:24`) |
| `HealthEvent.event_type?`, `HealthEvent.connection_name?`, `HealthEvent.agent_id?` | `types.ts:68,69,67` | `connection_name` is read once as a fallback label (`ConnectorHealth.tsx:294`); `event_type` and `agent_id` are never read |

### Keys and functions

| Item | Location | Note |
| --- | --- | --- |
| `connectionKeys.listRoot` | `connectionKeys.ts:31` | Documented as the bulk-invalidation prefix; only referenced by `queryKeys.test.ts:138-140` |
| `connectorKeys.detail(id)` | `hooks.ts:25` | No production caller; only `queryKeys.test.ts:197` |
| `verifyConnectorCredentials`'s `machineLabel` param | `crud.ts:29` | The only call site (`hooks.ts:108`) receives it from `useVerifyConnector`'s type, and the sole consumer of that mutation (`ConnectorWizard.tsx:111-114`) never sets it — so `machine_label` is always `undefined` and is dropped by `JSON.stringify` |

### Component props and branches

| Item | Location | Note |
| --- | --- | --- |
| `ConnectorExecutionLogs.connectionId` prop | `ConnectorExecutionLogs.tsx:14,61` | The only caller passes `connectionId={null}` (`ConnectorDialog.tsx:101`), so the `connectionId` query-param branch of `getExecutionLogs` (`crud.ts:64-65`) is unreachable from the UI |
| `DatabaseEngineIcon.wrapperClassName` | `DatabaseEngineIcon.tsx:69,88,182` | No caller passes it |
| `DatabaseEngine` members `'generic'` | `DatabaseEngineIcon.tsx:21` | No `case` branch; unreachable from `resolveDatabaseEngine` |
| `resolveDatabaseEngine` tier-1 reads (`engine`/`type`/`db_type`/`dialect`) | `DatabaseEngineIcon.tsx:31-35` | None of these properties exist on `Connection` (`connectionTypes.ts:19-39`) and `listConnections` never sets them, so this branch cannot fire from connector data |
| All non-Postgres `DatabaseEngineIcon` `case` blocks (mysql, mariadb, sqlite, duckdb, clickhouse, snowflake, mongodb, redis) | `DatabaseEngineIcon.tsx:106-174` | Reachable only via the tier-2 name heuristic, i.e. a Postgres database/alias literally containing one of those substrings |
| `DatabaseConnector.status` values `'pending'` / `'active'` | `types.ts:11` | Never branched on; anything not `'revoked'` renders as `Offline` |
| `ParsedLogSummary.category` `'CONNECT'` tab | `ConnectorExecutionLogs.tsx:21,83,106` | Counted and filtered, but no CONNECT tab is rendered (`:143-148`) |
| `ConnectorDatabases` search over `machine_label` / `db_alias` | `ConnectorDatabases.tsx:40-41` | Live, but only reachable when those fields are populated — they always are for agent-backed connections |
| `ConnectorHealth` `'1h'` / `'7d'` / `'30d'` windows | `ConnectorHealth.tsx:16,110-113` | Live options; whether the backend honours them is UNVERIFIED |

### Removed residue (documented in-file, kept for context)

`src/components/connector/api/connectionTypes.ts:6-15` records that 15 interfaces (`PulledSchema`, `SchemaDiff`, `Migration`, `Permissions`, `Fingerprint`, `BindingResult`, `ConnectionHealth`, `ApiSuccess`, `ConnectionEvent`, `LinkedFile`, etc.) were deleted in "Phase 1" for having zero reachable consumers, and notes that `HealthEvent` previously collided by name with the shape in `api/types.ts`. The same file records the historical four-module import cycle that motivated extracting `connectionKeys` (`connectionKeys.ts:4-26`), and `useConnections.ts:3-9` records the "Phase 4" move from `lib/api/data/connection/`.

---

## Open Questions

UNVERIFIED: What does the backend do with `agent_token` after `POST /api/agent/register/token` — is it hashed at rest, stored in plaintext, or discarded? No frontend code touches this.

UNVERIFIED: Is the Connection Key ever returned to the browser by any endpoint, including `/api/agent/status` or `/api/agent/{id}/databases`? The frontend types declare no such field, but the code cannot rule out an undeclared extra property (the `as any` cast at `connectionCrud.ts:24` shows extra properties are anticipated in general).

UNVERIFIED: Does the backend enforce ownership on `POST /api/agent/revoke/{id}` and `DELETE /api/agent/{id}` for team-shared (`access_type: 'team'`) connectors, or is the read-only UI the only guard (see S3)?

UNVERIFIED: Does `/api/agent/health` honour the `timeRange` values `1h`, `7d`, `30d`, or does it only accept `24h`? The frontend offers all four (`ConnectorHealth.tsx:110-113`) and sends them verbatim (`crud.ts:81`).

UNVERIFIED: Does `/api/agent/health` return `successRate: 100` (and the other all-default values) when there are simply no events, or is that value the client's error fallback only? `crud.ts:89` uses `?? 100`, which conflates "absent" with "100".

UNVERIFIED: What ordering does `/api/agent/events` apply to its 50 results, and is there any server-side retention/TTL for that table? The frontend neither specifies nor depends on the order (`crud.ts:62-72`).

UNVERIFIED: Are there pagination parameters available on `/api/agent/events` beyond `limit`, and does the endpoint cap `limit` below 50?

UNVERIFIED: Does `/api/agent/status` ever populate `agent.databases` (the undeclared field read at `connectionCrud.ts:24`), or is that branch always empty in production? The cast to `any` suggests a shape the types do not describe.

UNVERIFIED: Does the backend populate `DatabaseConnector.ip_address` and `agent_version` in practice, i.e. is host IP data actually being fetched into the browser every 4–10 s (see S6)?

UNVERIFIED: What populates `Connection.lastUsedAt`? It is declared and rendered (`AIChatLibrary.tsx:122`) but nothing in this frontend ever writes it.

UNVERIFIED: What produces `DiscoveredDatabase.status` values (the comment says e.g. `"healthy"`, `types.ts:33`)? No code reads it, so the vocabulary is unknown.

UNVERIFIED: What produces `ExecutionEvent.event_type === 'EXPORT'`? The Export tab (`ConnectorExecutionLogs.tsx:147`) depends on it entirely, since `parseSqlSummary` can never yield that category.

UNVERIFIED: Is the `@vivekmind/pg-connector` CLI (`ConnectorWizard.tsx:22`) the same artifact as the `sw-agent` binary referenced in three other places (`ConnectorOverview.tsx:233`, `ConnectorDatabases.tsx:187`, `ConnectionSelector.tsx:147`)? The frontend gives users two different sets of instructions for the same task.

UNVERIFIED: Does `getConnectorDatabases` return per-database `version` strings in production, or is `DiscoveredDatabase.version` usually absent? Two surfaces render it conditionally (`ConnectorList.tsx:275-279`, `ConnectorWizard.tsx:384-388`).

UNVERIFIED: Does the backend enforce read-only SQL execution (CERO, `docs/CONNECTOR_SECURITY_ARCHITECTURE.md:51-81`) — e.g. rejecting writes — or is that enforced only by the host daemon? There is no frontend representation of the policy either way.

UNVERIFIED: Does `/api/agent/register/token` honour the optional `machine_label` field? The frontend never sends a value for it (see Dead/Unused), so this cannot be determined from this repo.
