---
title: Export System
section: 6
area: export
sources: 11
status: rough
---

# 06. Export System

Covers two independent export surfaces:

1. **Grid export** — `src/components/export/ExportButton.tsx`, the popover in the Data Explorer header. Server-rendered, three scopes, five formats.
2. **Artifact export** — `src/components/ai/artifacts/exportUtils.ts`, the per-artifact download menu in Resona AI. Fully client-side, no backend, separate format set (including PNG and TSV).

They share nothing except the word "export". The boundary is described in [Artifact Export — Separate System](#artifact-export--separate-system).

## Component / File Map

| File | Role | Notes |
| --- | --- | --- |
| `src/components/export/ExportButton.tsx` | The entire grid export UI + orchestration. 1301 lines. | Owns scope state, format state, row limit, schema/table selection, job polling, cancellation, Google Sheets OAuth + upload. |
| `src/components/export/ExportFormatIcon.tsx` | Inline SVG per format. 204 lines. | `switch (format)`; returns `null` for anything unrecognised (`ExportFormatIcon.tsx:201`). |
| `src/components/export/api/google-sheets.ts` | Drive REST upload, OAuth token cache, recent-export history. 219 lines. | Raw `fetch` to `googleapis.com`, deliberately bypassing the shared API client (`google-sheets.ts:7-11`). |
| `src/components/data-explorer/api/types.ts` | `ExportFormat`, `ExportScope`, `ExportGridContext`, `ExportParams`, `SchemaExportStatus`. | `ExportFormat` still contains `'ndjson'` (`types.ts:173`) — dead. |
| `src/components/data-explorer/api/api.ts` | Transport for all export HTTP calls. | Path builders, header parsing, blob fetch, job start/progress/cancel/download. |
| `src/components/data-explorer/api/index.ts` | Barrel. | Re-exports three download helpers that have no callers. |
| `src/lib/api/client.ts` | Shared request preamble (`apiRequestRaw`). | Cookie auth + CSRF header. See [Auth Mechanism](#auth-mechanism). |
| `src/components/data-explorer/DataExplorerLayout.tsx` | Mounts `ExportButton`, resolves the portal target. | `DataExplorerLayout.tsx:594-615`. |
| `src/pages/DataExplorerPage.tsx` | Provides the header via `headerContent` render-prop; hosts `#table-export-portal`. | `DataExplorerPage.tsx:388`, `:435-436`. |
| `src/components/data-explorer/TableGrid.tsx` | Produces the `ExportGridContext` snapshot. | `TableGrid.tsx:240-251`. |
| `src/components/ai/artifacts/exportUtils.ts` | Artifact-level client-side export. | CSV / JSON / TSV-copy / SpreadsheetML-XLS / PNG. |

## Drift From Published Docs

> **The published public docs claim Data Explorer exports support "CSV, JSON, NDJSON, Excel, SQL". Two of those five are wrong in opposite directions.**
>
> - **NDJSON is not exportable.** The string `'ndjson'` survives in exactly one place in the entire `src/` tree: the `ExportFormat` union at `src/components/data-explorer/api/types.ts:173`. A repo-wide search for `ndjson` returns that single line and nothing else. It has no entry in `EXPORT_OPTIONS` (`ExportButton.tsx:75-111`), no icon case in `ExportFormatIcon.tsx` (the `switch` covers `excel`, `json`, `csv`, `google_sheets`, `sql` and returns `null` otherwise, `ExportFormatIcon.tsx:201-202`), and no handling in any request builder. **There is no way to select NDJSON from the UI.** It is a dead type member. See [Dead / Unused Code](#dead--unused-code).
> - **Google Sheets is exportable and is undocumented.** `'google_sheets'` is the **second** option in the format grid, positioned between CSV and Excel (`ExportButton.tsx:83-89`), rendered with the full Google four-colour G logo (`ExportFormatIcon.tsx:134-161`) and the display label `Sheets`. It has its own OAuth flow, its own localStorage token cache, a 10-entry export history panel in the popover, and a Drive multipart upload path. It appears nowhere in the published format list.
>
> The accurate list of *selectable* formats is: **CSV, Google Sheets, Excel, JSON, SQL** — five options, of which four produce a downloaded file and one uploads to Google Drive.

---

# Grid Export

## 1. Export Formats

The type union (`src/components/data-explorer/api/types.ts:173`):

```ts
export type ExportFormat = 'csv' | 'google_sheets' | 'excel' | 'json' | 'sql' | 'ndjson';
```

The selectable set is the `EXPORT_OPTIONS` array (`ExportButton.tsx:75-111`) — five entries, and `ndjson` is **not** among them.

| # | `format` value | Display label | `ext` (shown top-right of Format section) | File extension used | Icon | Selected-state colour (border / bg / text) | Selected ring |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `csv` | `CSV` (`:78`) | `.csv` (`:79`) | `.csv` | Green page SVG, body `#059669`, fold `#10B981`, data-line glyphs `#A7F3D0`, `CSV` badge `ExportFormatIcon.tsx:96-132` | `border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300` (`:80`) | `ring-1 ring-emerald-500/30` (`:81`) |
| 2 | `google_sheets` | `Sheets` (`:85`) | `Google Sheets` — **not** an extension (`:86`) | n/a — no local file | Google "G" 4-path logo: `#4285F4` / `#34A853` / `#FBBC05` / `#EA4335`, `viewBox="0 0 24 24"` (`ExportFormatIcon.tsx:134-161`) | `border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300` (`:87`) | `ring-1 ring-blue-500/30` (`:88`) |
| 3 | `excel` | `Excel` (`:92`) | `.xlsx` (`:93`) | `.xlsx` | Green page SVG, body `#107C41`, grid lines `#4ADE80` at 40% opacity, `XLS` badge `#22C55E` (`ExportFormatIcon.tsx:12-48`) | `border-emerald-600 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300` (`:94`) | `ring-1 ring-emerald-600/30` (`:95`) |
| 4 | `json` | `JSON` (`:99`) | `.json` (`:100`) | `.json` | Amber page SVG, body `#F59E0B`, inner panel `#B45309`, `{ }` glyph `#FEF08A`, `JSON` badge `#D97706` (`ExportFormatIcon.tsx:50-94`) | `border-amber-500 bg-amber-500/10 text-amber-800 dark:text-amber-300` (`:101`) | `ring-1 ring-amber-500/30` (`:102`) |
| 5 | `sql` | `SQL` (`:106`) | `.sql` (`:107`) | `.sql` | Blue page SVG, body `#2563EB`, disk-cylinder glyphs `#93C5FD`/`#60A5FA`, `SQL` badge `#3B82F6` (`ExportFormatIcon.tsx:163-199`) | `border-blue-500 bg-blue-500/10 text-blue-800 dark:text-blue-300` (`:108`) | `ring-1 ring-blue-500/30` (`:109`) |

Notes on rendering:

- The format grid is `grid-cols-5` (`ExportButton.tsx:1050`), matching the five options exactly.
- Every icon is rendered at `size={22}` (`ExportButton.tsx:1068`), overriding the component's default of `24` (`ExportFormatIcon.tsx:10`).
- Unselected buttons get `border-border/60 bg-card hover:bg-muted/60 text-muted-foreground`; selected buttons additionally get `font-semibold` (`ExportButton.tsx:1059-1065`).
- Buttons are `disabled={isExporting}` (`ExportButton.tsx:1056`) and get `opacity-50 cursor-not-allowed`.
- `selectedFormatOption` falls back to `EXPORT_OPTIONS[0]` (CSV) if the current format is not found (`ExportButton.tsx:728-731`).
- `ndjson` would render as `null` from `ExportFormatIcon` (`ExportFormatIcon.tsx:201`) — i.e. an empty tile if it were ever added to `EXPORT_OPTIONS`.

## 2. Export Scopes

The union (`src/components/data-explorer/api/types.ts:172`):

```ts
export type ExportScope = 'view' | 'table' | 'database';
```

Local state initialises to `'view'` (`ExportButton.tsx:123`), but the *effective* scope overrides it when there is no table at all:

```ts
const effectiveScope: ExportScope = !hasTable ? 'database' : scope;   // ExportButton.tsx:180
```

where `hasTable = !!connectionId && !!tableName` (`ExportButton.tsx:164`). **Consequence: with no table selected the popover silently opens on Database scope regardless of what tab was last clicked.**

### Mechanical meaning

| Scope | What is actually sent | Request builder |
| --- | --- | --- |
| `view` | One `GET` for the current table, with the grid's filters, sort and visible-column projection. | `fetchTableExport(connectionId, tableName, schemaName, { format, maxRows, filters, orderBy, orderDirection, columns })` — `ExportButton.tsx:605-612` → `api.ts:132-152` |
| `table` | One `GET` per selected table (multi-table selection supported). **No grid context is applied** — the per-table call at `ExportButton.tsx:637-640` passes only `format` and `maxRows`. | `fetchTableExport` → `api.ts:132-152` |
| `database` | One `POST` to start a background job, then polling, then one `GET` for a streamed ZIP. | `startSchemaExport` (`ExportButton.tsx:522-526` → `api.ts:206-217`), `getSchemaExportProgress` (`api.ts:222-230`), `fetchSchemaExportBlob` (`api.ts:276-291`) |

### Scope × Format compatibility

There is exactly **one** format/scope incompatibility in the code, and it is `google_sheets` + `database`.

| | `csv` | `google_sheets` | `excel` | `json` | `sql` |
| --- | --- | --- | --- | --- | --- |
| **`view`** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **`table`** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **`database`** | ✅ | ❌ **blocked** | ✅ | ✅ | ✅ |

The gating conditions that disable / block `google_sheets` at database scope, all four of them:

1. **The footer action button is disabled** when format is `google_sheets` under database scope (`ExportButton.tsx:1250-1254`):
   ```ts
   disabled={
     !connectionId ||
     (effectiveScope === 'database' && (effectiveSchemas.length === 0 || format === 'google_sheets')) ||
     (effectiveScope === 'table' && selectedTables.length === 0)
   }
   ```
2. **An amber inline warning renders** in the database panel (`ExportButton.tsx:977-981`): *"Google Sheets export is available for **View** and **Table** scopes. Select CSV, Excel, JSON, or SQL to export all schemas as a ZIP."*
3. **The button label changes** to `Select View or Table for Sheets` (`ExportButton.tsx:741-744`).
4. **`handleExport` re-checks and bails** with a `toast.info('Google Sheets export is available for View and Table scopes.')` (`ExportButton.tsx:482-485`), and the same guard exists a second time inside `exportToGoogleDrive` (`ExportButton.tsx:411-416`).

Note the format tile itself is **never** disabled — `disabled={isExporting}` only (`ExportButton.tsx:1056`). There is no per-format/scope disabling of tiles; the block is enforced on the action button plus two redundant runtime guards.

### Scope tab gating (`ExportButton.tsx:792-817`)

| Tab | `disabled` expression | Condition |
| --- | --- | --- |
| **View** | `!hasGrid \|\| isExporting` (`:795`) | `hasGrid = !!gridContext && hasTable` (`:165`) — needs both a live grid snapshot and a selected table. Tooltip flips to `'Select a table first'` when unavailable (`:798`). |
| **Table** | `(!hasTable && tableList.length === 0) \|\| isExporting` (`:803`) | Enabled even without a selected table as long as the table list has loaded rows. Tooltip: `'Full table data (select one or multiple tables)'` (`:806`). |
| **Database** | `!connectionId \|\| isExporting` (`:811`) | Needs only a connection. Tooltip: `'All schemas & tables bundled as a ZIP archive'` (`:814`). |

Disabled tabs render `opacity-35 cursor-not-allowed hover:bg-transparent` (`ExportButton.tsx:1293`).

## 3. Scope Selection UI

### 3a. Table multi-select (`table` scope, `ExportButton.tsx:875-970`)

- List is populated from `useTableList(connectionId, schemaName)` (`ExportButton.tsx:171`) — **the current schema only**. `tableName`/`schemaName` come from props; there is no schema switcher inside the Table panel. The panel footer prints `Schema: {schemaName}` as static text (`ExportButton.tsx:967`).
- Selection state is `string[]`, defaulting to `[]` (`ExportButton.tsx:130`), and is reset to `[tableName]` whenever the `tableName` prop changes (`ExportButton.tsx:158-162`).
- `toggleTableSelection` add/removes by exact name (`ExportButton.tsx:188-195`).
- **Select all / Deselect all** toggle: compares `selectedTables.length === tableList.length`; sets `[]` if equal, otherwise every name in `tableList` (`ExportButton.tsx:197-203`). Label logic at `ExportButton.tsx:891-894`. The button is `disabled={isExporting}` (`:887`).
- **Search-within-tables** input renders **only when `tableList.length > 6`** (`ExportButton.tsx:898`). Placeholder `"Filter tables..."` (`:903`). Matching is a case-insensitive `includes` on `t.name` against `tableSearchTerm.toLowerCase()` (`ExportButton.tsx:174-178`). An `X` clear button appears when the term is non-empty (`ExportButton.tsx:908-915`). The input is `disabled={isExporting}` (`:902`).
- Scroll container is `max-h-32` (`8rem`) with `overflow-y-auto` (`ExportButton.tsx:920`).
- Each row shows `~{estimatedRows.toLocaleString()}` when `t.estimatedRows >= 0` (`ExportButton.tsx:947-951`).
- Selection count pill: `{selectedTables.length}` (`ExportButton.tsx:881-883`).
- Summary line: `No tables selected` / `1 table selected ({name})` / `{n} tables selected` (`ExportButton.tsx:960-966`).
- Empty states: `Loading tables…` while `tablesLoading` (`ExportButton.tsx:922`); `No matching tables` when a search term is active, otherwise `No tables available` (`ExportButton.tsx:923-926`).
- During export, rows get `opacity-60 pointer-events-none` and checkboxes are `disabled` (`ExportButton.tsx:936`, `:941`).

### 3b. Schema multi-select (`database` scope, `ExportButton.tsx:975-1037`)

- Source list is `useSchemas(connectionId)` (`ExportButton.tsx:167`) filtered to schemas with `tableCount > 0` (`ExportButton.tsx:168`). Empty schemas are hidden.
- **"All schemas" default**: `selectedSchemas` is `string[] | null`, initialised to `null`, documented in-code as *"null = all schemas; array = explicit selection"* (`ExportButton.tsx:126-127`). The All-schemas checkbox is `checked={selectedSchemas === null}` (`ExportButton.tsx:989`) and its handler resets to `null` (`:990`).
- Every individual schema checkbox renders `checked={selectedSchemas === null || checked}` (`ExportButton.tsx:1013`) — i.e. **when the null/"all" state is active every schema box appears ticked and cannot be individually unticked without first leaving the all-schemas state.**
- Un-ticking from the null state materialises the full explicit list minus that schema: `schemas.filter(s => s.name !== schema.name).map(s => s.name)` (`ExportButton.tsx:1016-1018`).
- Scroll container is `max-h-28` (`7rem`) (`ExportButton.tsx:999`).
- Header shows the aggregate table count across all schemas; each row shows its own `tableCount` (`ExportButton.tsx:994-996`, `:1027-1029`).
- The whole schema block is skipped entirely when `schemas.length === 0` (`ExportButton.tsx:983`).
- `totalTables` used in the pre-flight toast is `effectiveSchemas.reduce((sum, s) => sum + s.tableCount, 0)` (`ExportButton.tsx:182-186`).
- What is actually transmitted: `selectedSchemas === null ? [] : selectedSchemas` (`ExportButton.tsx:524`), and `startSchemaExport` omits the `schemas` query param entirely when the array is empty — the backend then reads that as "all user schemas" per the docstring (`api.ts:203-204`, `:212`).

### 3c. WYSIWYG "view" panel (`ExportButton.tsx:822-870`)

Displays `schemaName.tableName` with the table name in `text-primary` (`:828`), an `Active View` badge (`:831-833`), a `~{estimatedTotal}` rows stat and a `{visibleColumns.length}/{allColumnsCount}` columns stat (`:837-850`), plus `Filter`/`ArrowUpDown` indicator chips rendered only when `gridContext.filters.length > 0 || gridContext.orderBy` (`:853-868`). The sort chip text is truncated at `max-w-[100px]` (`:864`).

## 4. Row Limits

| Constant | Value | Citation |
| --- | --- | --- |
| `EXPORT_MAX_ROWS` — UI default | `10000` | `ExportButton.tsx:56` |
| `maxRows` initial state | `EXPORT_MAX_ROWS` = `10000` | `ExportButton.tsx:125` |
| `ROW_PRESETS` — the full preset list | `[1000, 5000, 10000, 25000, 50000]` | `ExportButton.tsx:57` |

| Preset | Select label | Exceeds the 10 000 default? |
| --- | --- | --- |
| `1000` | `1k rows` | No |
| `5000` | `5k rows` | No |
| `10000` | `10k rows` | No — this is the default |
| `25000` | `25k rows` | **Yes — 2.5×** |
| `50000` | `50k rows` | **Yes — 5×** |

- Label formula: `preset >= 1000 ? \`${(preset / 1000).toLocaleString()}k rows\` : \`${preset} rows\`` (`ExportButton.tsx:1098`). All five presets are `>= 1000`, so the sub-1000 branch is unreachable with the current list.
- The value is sent to the server as the `maxRows` query parameter (`api.ts:141`: `maxRows: String(params.maxRows ?? 10000)`). **`?? 10000` is the server-side default when `maxRows` is omitted** — so the limit is **server-enforced**; the client only chooses a number. The client does not truncate rows itself; there is no slicing of any fetched array anywhere in `ExportButton.tsx`.
- `maxRows` is **not** sent for the `database` scope at all — `startSchemaExport` takes only `format` and `schemas` (`api.ts:206-217`), and the Row Limit control is hidden when `effectiveScope === 'database'` (`ExportButton.tsx:1082`). Consequence: **a Database ZIP export has no client-side row cap; whatever limit the backend applies is server-defined and not observable from this repo.**
- Cap feedback: the response header `X-Export-Capped === 'true'` sets `capped` (`api.ts:192`), which renders `Capped at {maxRows} rows.` as the success-toast description on both the view path (`ExportButton.tsx:619`) and the single-table path (`ExportButton.tsx:647`).
- The row-limit `Select` is `disabled={isExporting}` (`ExportButton.tsx:1088`).

## 5. Async Job System

### 5a. Database (ZIP) job lifecycle

**Start** — `startSchemaExport(connectionId, schemas, format)` (`ExportButton.tsx:522-526`):

```
POST {API_BASE_URL}/api/data/{connectionId}/export-all?format={format}[&schemas={a,b,c}]
```

- Body is sent but not used for control data; all parameters are query string (`api.ts:211-215`).
- `format` is the selected `ExportFormat` string verbatim — including `'google_sheets'`, though that combination is blocked before reaching this call.
- `schemas` param is omitted entirely when the array is empty (= all schemas) (`api.ts:212`).
- Returns `{ jobId, tableCount }` (`api.ts:210`).
- `jobId` is stashed in `activeJobIdRef` (`ExportButton.tsx:528`); `tableCount` seeds the progress baseline: `jobRes.tableCount || totalTables` (`ExportButton.tsx:529`) and `setExportProgress({ done: 0, total: targetTotal })` (`:530`).

**Progress polling** (`ExportButton.tsx:536-557`):

```
GET {API_BASE_URL}/api/data/{connectionId}/export-all/{jobId}/progress
```

| Timing / field | Value | Citation |
| --- | --- | --- |
| Poll interval | `500` ms (`setInterval`) | `ExportButton.tsx:557` |
| Guard | returns early if `!activeJobIdRef.current \|\| !mountedRef.current` | `ExportButton.tsx:537` |
| Response shape | `{ done: number; total: number; status: SchemaExportStatus }` | `api.ts:225` |
| `SchemaExportStatus` union | `'running' \| 'done' \| 'error' \| 'cancelled'` | `types.ts:174` |
| UI updated only when `status === 'running'` | any other status stops updating the counter | `ExportButton.tsx:540-553` |
| Poll errors | swallowed by an empty `catch {}` — "Ignore background polling glitches" | `ExportButton.tsx:554-556` |
| Poll timer cleanup | `clearInterval` in the success path, the catch path, **and** the `finally` (belt-and-braces, three sites) | `:566`, `:578`, `:590` |
| Timer also cleared on unmount | `mountedRef` set false + `clearInterval` | `ExportButton.tsx:142-148` |

Progress surface while running: the infinite-duration toast is re-issued each tick with `Exporting ({done} / {total}) tables into ZIP…` and a `Cancel` action wired to `handleCancelExport` (`ExportButton.tsx:543-552`), and the in-popover footer shows a spinner plus `{done}/{total} tables` (`ExportButton.tsx:1229-1246`). The header trigger button simultaneously swaps its label for `{done}/{total}` (`ExportButton.tsx:785`).

**Download** — `fetchSchemaExportBlob(connectionId, jobId, signal)` (`ExportButton.tsx:560-564`):

```
GET {API_BASE_URL}/api/data/{connectionId}/export-all/{jobId}/download
```

- Reads `X-Export-Table-Count` (parsed, returned, **but unused by the caller**) into `tableCount` (`api.ts:284`, `:290`).
- Filename from `Content-Disposition`, fallback `database_export_{YYYY-MM-DD}.zip` (`api.ts:285-288`).
- The response is buffered fully into a `Blob` — `await response.blob()` (`api.ts:289`).

**Success**: progress snapped to `{done: targetTotal, total: targetTotal}` (`:567`), `triggerDownload(blob, filename)` (`:568`), success toast `Successfully exported {n} tables as ZIP` with `duration: 3500` and `action: undefined` to strip the Cancel button (`:570-574`), popover closed (`:575`).

**Failure**: `AbortError` → `toast.info('Export cancelled', { duration: 3000 })` (`:579-582`); anything else → `toast.error('Export failed', { duration: 4000 })` with the error message as description (`:583-587`).

### 5b. Multi-table (Table scope) sequential job

Not a backend job — a client-side loop (`ExportButton.tsx:671-702`):

| Constant | Value | Citation |
| --- | --- | --- |
| Delay between successive downloads | `250` ms (`await new Promise(r => setTimeout(r, 250))`) | `ExportButton.tsx:700` |
| Condition for the delay | `i < selectedTables.length - 1 && !abortController.signal.aborted` | `ExportButton.tsx:699` |
| Progress seed | `setExportProgress({ done: 0, total: selectedTables.length })` | `ExportButton.tsx:655` |
| Per-item progress | `setExportProgress({ done: i, ... })` — set *before* the fetch, so it shows the count already attempted | `ExportButton.tsx:675` |
| Per-table error handling | caught, logged via `logger.error`, loop continues, `exportedCount` not incremented | `ExportButton.tsx:694-696` |
| Terminal state | only reached `if (!abortController.signal.aborted)` | `ExportButton.tsx:704` |
| Success toast | `Successfully exported {exportedCount} of {selectedTables.length} tables`, `duration: 3500` | `ExportButton.tsx:706-710` |

There is no server job id here; cancellation is purely local `AbortController` — and note `fetchTableExport` is called **without a signal** (`ExportButton.tsx:688-691`), so abort only stops the loop, it does not abort an in-flight HTTP request.

### 5c. Cancellation

`handleCancelExport` (`ExportButton.tsx:216-231`), used by the footer `Cancel` button (`:1241`) and by the toast `Cancel` actions (`:548`, `:661`, `:681`):

1. `abortControllerRef.current.abort()` then null the ref (`:217-220`).
2. If `activeJobIdRef.current && connectionId` → `cancelSchemaExport(connectionId, jobId)` with `.catch(() => undefined)`; failures are swallowed. Ref nulled (`:221-224`).
   ```
   DELETE {API_BASE_URL}/api/data/{connectionId}/export-all/{jobId}
   ```
   Response type `{ status: SchemaExportStatus }` (`api.ts:238`).
3. `clearInterval(pollTimerRef.current)` and null the ref (`:225-228`).
4. `setIsExporting(false)` and `setExportProgress(null)` (`:229-230`).

`handleCancelExport` is memoised with `[connectionId]` (`:231`).

**Note: the View scope and the single-Table scope have no cancel path.** They are single non-cancellable `fetchTableExport` calls (`:605`, `:637`); the footer swaps to the Cancel button whenever `isExporting` is true regardless of which path is running (`ExportButton.tsx:1229`), but for those two paths `abortControllerRef.current` is `null` (only assigned at `:533` and `:668`), so pressing Cancel only clears the UI flag while the request keeps running to completion.

### 5d. In-flight UI state — complete list

| Element | State during export | Citation |
| --- | --- | --- |
| Trigger button icon | `Loader2` with `animate-spin text-primary`, `w-3.5 h-3.5` (replaces the `Download` icon) | `ExportButton.tsx:780-784` |
| Trigger button label | `{done}/{total}` if `exportProgress` is non-null, else the literal `Export` | `ExportButton.tsx:785` |
| Trigger button `disabled` | `disabled={!connectionId}` only — **the trigger stays clickable mid-export** | `ExportButton.tsx:777` |
| Format tiles | all `disabled` + `opacity-50 cursor-not-allowed` | `:1056`, `:1064` |
| Scope tabs (View / Table / Database) | all `disabled` | `:795`, `:803`, `:811` |
| Select-all button | `disabled` + `disabled:opacity-50` | `:887`, `:889` |
| Table search input | `disabled` | `:902` |
| Table rows / schema rows | `opacity-60 pointer-events-none`, checkboxes `disabled` | `:936`, `:941`, `:988`, `:1012` |
| Row-limit `Select` | `disabled` | `:1088` |
| Footer | replaces the action button with a spinner + `{done}/{total} tables` (or the literal `Streaming…` when `exportProgress` is null) + destructive `Cancel` button | `:1229-1246` |
| Dynamic label (unreachable in this state) | `Exporting ({done} / {total})…` when `total > 1`, else `Exporting…` | `ExportButton.tsx:735-739` |
| Popover | stays open (closed only on success at `:575`, `:622`, `:650`, `:711`) | — |

The `exportButtonText` memo computes `Exporting…` branches (`ExportButton.tsx:734-740`) that are only rendered through the footer action button, which is itself replaced by the Cancel block while `isExporting` — so those two branches are never displayed.

## 6. Google Sheets Flow

### 6a. OAuth

- Library: `@react-oauth/google`'s `useGoogleLogin` (`ExportButton.tsx:42`, `:459-473`).
- Provider is mounted app-wide only when `VITE_GOOGLE_CLIENT_ID` is set (`src/main.tsx:7-16`).
- Requested scope: **`https://www.googleapis.com/auth/drive.file`** (`ExportButton.tsx:460`) — the non-sensitive per-file scope, which the module header states requires no demo video / sensitive-scope verification (`google-sheets.ts:2-4`, `:104-105`).
- `hint: user?.email || undefined` (`ExportButton.tsx:461`), `prompt: ''` (`ExportButton.tsx:462`) — i.e. no forced consent re-prompt when a valid token is absent but the grant may still exist.
- `onSuccess` stores the token and immediately calls `exportToGoogleDrive(access_token)` (`:463-468`). Note the token is stored with `tokenResponse.expires_in || 3600` — **default 3600 s if Google omits `expires_in`** (`:465`).
- `onError` → `setIsExporting(false)` + `toast.error('Google authorization was cancelled or failed.')` (`:469-472`).

### 6b. Token cache

Storage prefix `DRIVE_TOKEN_PREFIX = 'sw_google_drive_token_v3'` (`google-sheets.ts:18`).

| Behaviour | Value / rule | Citation |
| --- | --- | --- |
| Per-user key | `sw_google_drive_token_v3_{lowercased trimmed email}`; falls back to the bare prefix when no email | `google-sheets.ts:20-25` |
| Read fallback | if the per-user key misses, the bare prefix key is tried | `google-sheets.ts:40-42` |
| Payload | `{ accessToken: string; expiresAt: number }` (unix ms) | `google-sheets.ts:27-30` |
| Expiry buffer | `60000` ms — treated as expired when `Date.now() >= expiresAt - 60000` | `google-sheets.ts:46` |
| Expiry action | both keys removed, returns `null` | `google-sheets.ts:50-52` |
| Default lifetime on write | `3600` seconds (`expiresInSeconds = 3600`) | `google-sheets.ts:63` |
| Double write | **every write stores the token under BOTH the per-user key and the bare prefix key** | `google-sheets.ts:72-73` |
| Clear | removes both localStorage keys plus legacy `sessionStorage` keys `sw_google_drive_token_v2` and `sw_google_drive_token_v1` | `google-sheets.ts:84-87` |
| Parse failure | `catch { return null }` | `google-sheets.ts:53-55` |

### 6c. Upload

`uploadCsvToGoogleSheets({ accessToken, title, csvBlob })` (`google-sheets.ts:107-164`):

| Detail | Value | Citation |
| --- | --- | --- |
| Endpoint | `POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart` | `google-sheets.ts:136` |
| MIME metadata | `mimeType: 'application/vnd.google-apps.spreadsheet'` → Drive auto-converts the CSV to a native spreadsheet | `google-sheets.ts:118` |
| Body | hand-built `multipart/related` string; boundary `'-------sw_sheets_upload_' + Math.random().toString(36).substring(2)` | `google-sheets.ts:121-134` |
| Blob handling | **entire CSV is read into a JS string first**: `await csvBlob.text()` (`:125`) — the whole export is duplicated in memory as UTF-16 text before the request. |
| Auth header | `Authorization: Bearer ${accessToken}` | `google-sheets.ts:139` |
| 401 handling | clears the token (note: `clearStoredDriveToken()` is called **without** the email argument, so only the bare prefix + legacy keys are removed) and throws `'Google authorization expired. Please try exporting again.'` | `google-sheets.ts:146-149` |
| Other errors | `errBody?.error?.message` or `` `Google Sheets upload failed (${response.status})` `` | `google-sheets.ts:150-152` |
| Returned URL | `` `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` `` | `google-sheets.ts:157` |

### 6d. Sheet title / date stamp

```ts
const dateStr = new Date().toISOString().split('T')[0];                          // :259
const sheetTitle = `${schemaName}.${tableName} (${dateStr})`;                    // :260  (view scope)
const sheetTitle = `${schemaName}.${targetTable} (${dateStr})`;                  // :327  (table scope)
const extraTitle = `${schemaName}.${extraTable} (${dateStr})`;                   // :385  (extra tables)
```

UTC date only, `YYYY-MM-DD`. Multi-table Google Sheets exports reuse the **same** `dateStr` computed once at `:326` for every additional table (`:385`).

### 6e. Sheet title sanitisation

**There is none.** `sheetTitle` is interpolated raw from `schemaName`/`tableName` and passed straight to Drive as `metadata.name`. No `toFilename`, no character filtering. This is the only filename-ish construction in the grid export path that is built client-side; the `/export` and `/export-all/.../download` filenames come from the server's `Content-Disposition` (see §8).

### 6f. Per-scope Google Sheets behaviour

| Scope | Behaviour | Citation |
| --- | --- | --- |
| `view` | Fetch CSV via `fetchTableExport` **with the full grid context** (filters / orderBy / orderDirection / visible columns), force `format: 'csv'` regardless of the selected tile, upload, open the sheet. | `ExportButton.tsx:241-309` |
| `table` | First selected table: CSV with `format: 'csv'`, `maxRows`, **no grid context** (`:320-323`). Remaining tables exported sequentially in a `for` loop from `i = 1` (`:377-406`), each with its own upload, its own history entry, and failures logged rather than surfaced (`:402-404`). | `ExportButton.tsx:311-409` |
| `database` | Blocked: closes any pending tab, `toast.info('Google Sheets export is available for View and Table scopes.')`, `setIsExporting(false)`, return. | `ExportButton.tsx:411-416` |

The selected `format` state is **ignored** on the Google Sheets path — `format: 'csv'` is hardcoded in both `fetchTableExport` calls (`:250`, `:321`, `:382`).

### 6g. Popup pre-emption

`handleExport` opens `window.open('about:blank', '_blank')` **before** starting the upload and renames its `document.title` to `'Preparing Google Sheet…'` (`ExportButton.tsx:488-496`). The blob is later navigated into that same tab (`pendingTab.location.href = uploadResult.url`, `:269`, `:336`), or a new tab is opened if `pendingTab` is null or already closed (`:271`, `:338`). Every early-return and the `catch` block explicitly `close()` the pending tab (`:243`, `:313`, `:412`, `:418-420`). The `window.open` call is wrapped in a bare `try {} catch {}` labelled "Popup blocker fallback" (`:489-496`).

### 6h. Error branches in `exportToGoogleDrive`

| Trigger | Behaviour | Citation |
| --- | --- | --- |
| `err.message` contains `'expired'` **or** `'401'` | `clearStoredDriveToken(user?.email)`, `toast.info('Google authorization expired. Refreshing permission…')`, then **recursively calls `requestDriveToken()`** and returns | `ExportButton.tsx:422-427` |
| `err.message` contains `'Google Sheets API'` **or** `'sheets.googleapis.com'` | `toast.error('Google Sheets API is disabled in your Google Cloud project', { duration: 15000 })` with an `Enable API` action that opens `https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=1013066723615` — **the GCP project number is hardcoded in the string** | `ExportButton.tsx:429-445` |
| Anything else | `toast.error('Google Sheets export failed', { duration: 10000 })` with `err.message` or `'Could not create Google Sheet.'` | `ExportButton.tsx:447-451` |
| Always | `finally { setIsExporting(false) }` | `ExportButton.tsx:452-454` |

`1013066723615` is the numeric project prefix of the client id shipped in `.env.example` (`VITE_GOOGLE_CLIENT_ID=1013066723615-5efjkbsnuov3edoembrb6qiukbht72fu.apps.googleusercontent.com`), so the recovery link is correct only while that client id is in use.

### 6i. Recent-sheets history

| Detail | Value | Citation |
| --- | --- | --- |
| Storage key | `sw_recent_google_sheets_v1` (`localStorage`) | `google-sheets.ts:180` |
| Record shape | `{ id, title, url, tableName, schemaName, rowCount?, timestamp }` | `google-sheets.ts:170-178` |
| Retention | **last `10`** — `.slice(0, 10)`, newest first (`[item, ...existing]`) | `google-sheets.ts:202` |
| De-dupe | filtered on **both** `s.id !== item.id && s.url !== item.url` before prepending | `google-sheets.ts:201` |
| Read | `JSON.parse` guarded; non-array → `[]`; parse failure → `[]` | `google-sheets.ts:185-194` |
| Write failure | `catch { return [] }` (history silently lost) | `google-sheets.ts:205-207` |
| Clear | `localStorage.removeItem` only — **not keyed per user** | `google-sheets.ts:213-218` |
| Load timing | lazily at mount via `useState(() => getRecentGoogleSheets())` (`ExportButton.tsx:134`), then **re-synced on every popover open** (`ExportButton.tsx:151-155`) | — |
| Render gate | `format === 'google_sheets' && recentSheets.length > 0` | `ExportButton.tsx:1157` |
| Header | `Recent Sheets ({n})` with a `Clock` icon | `ExportButton.tsx:1160-1162` |
| Per-row timestamp | `formatTimeAgo(item.timestamp, { justNow: 'Just now', clampFuture: true })` — the `clampFuture` option exists specifically because "the inline copy in ExportButton did this" | `ExportButton.tsx:1186`; `src/shared/lib/format.ts:29-32`, `:59` |
| Per-row row count | shown only when `rowCount !== undefined && rowCount > 0` | `ExportButton.tsx:1187-1192` |
| Scroll | `max-h-32` (`8rem`) | `ExportButton.tsx:1175` |
| Row actions | `Copy Link` (clipboard write + `toast.success('Link copied to clipboard!')`) and `Open Google Sheet ↗` (`window.open(..., '_blank', 'noopener,noreferrer')`) | `ExportButton.tsx:1200-1216` |
| `Clear` button | calls `clearRecentGoogleSheets()`, resets both `recentSheets` and `lastExportedSheet` | `ExportButton.tsx:1164-1173` |

### 6j. Surfacing the resulting URL

Three surfaces, all from the same `uploadResult.url`:

1. **Browser tab** — `pendingTab.location.href` or `window.open(url, '_blank', 'noopener,noreferrer')` (`ExportButton.tsx:268-272`, `:335-339`).
2. **Success toast** — `duration: 30000`, `description: sheetTitle`, action `Open Sheet ↗`, and a **misuse of sonner's `cancel` slot** to carry a `Copy Link` label (`ExportButton.tsx:287-307`, `:354-374`). The `cancel` label renders in the toast's cancel affordance, so "Copy Link" appears where a dismiss control normally sits.
3. **In-popover banner** — `lastExportedSheet` renders an emerald "Google Sheet Ready" card with `Open Sheet` and `Copy` buttons and an `X` dismiss (`ExportButton.tsx:1109-1155`). Banner has `animate-in fade-in duration-200` (`:1110`). The sheet title is truncated at `max-w-[230px]` (`:1118`). State is cleared at the start of every Google Sheets export (`ExportButton.tsx:237`).

## 7. WYSIWYG "view" Scope

### 7a. What is captured

`TableGrid` builds the snapshot (`TableGrid.tsx:240-247`):

```ts
const gridExportContext = useMemo<ExportGridContext>(() => ({
  filters,
  orderBy: sortColumn,
  orderDirection: sortDirection,
  visibleColumns: visibleColumns.map((c) => c.name),
  allColumnsCount: columns.length,
  estimatedTotal: displayedRows.length,
}), [filters, sortColumn, sortDirection, visibleColumns, columns, displayedRows.length]);
```

Pushed upward via `useEffect(() => { onGridContextChange?.(gridExportContext) }, ...)` (`TableGrid.tsx:249-251`) into `DataExplorerLayout`'s `gridExportContext` state (`DataExplorerLayout.tsx:183`), which passes it straight to `<ExportButton gridContext={gridExportContext} />` (`DataExplorerLayout.tsx:601`).

The interface (`types.ts:186-195`):

| Field | Type | Sent to server? |
| --- | --- | --- |
| `filters` | `FilterCondition[]` | ✅ yes |
| `orderBy` | `string \| null` | ✅ yes |
| `orderDirection` | `'asc' \| 'desc'` | ✅ yes |
| `visibleColumns` | `string[]` | ✅ yes |
| `allColumnsCount` | `number` | ❌ **display only** (`ExportButton.tsx:846`) |
| `estimatedTotal` | `number` | ❌ **display only** (`ExportButton.tsx:840`) |
| `tableCount?` | `number \| undefined` | ❌ optional and **never set by any producer** — see [Dead / Unused Code](#dead--unused-code) |

### 7b. How it is serialised

Both Google-Sheets-view (`:252-255`) and grid-view (`:608-611`) apply the same four mappings:

| Grid field | Param | Transform | Result when empty |
| --- | --- | --- | --- |
| `filters` | `filters` | passed verbatim | `undefined` if `filters.length === 0` (`:252`, `:608`) |
| `orderBy` | `orderBy` | `gridContext.orderBy \|\| undefined` | `undefined` if `null`/empty (`:253`, `:609`) |
| `orderDirection` | `orderDirection` | passed verbatim | always sent — the field is non-optional in the type (`types.ts:190`), so `asc`/`desc` is sent even with no sort column (`:254`, `:610`) |
| `visibleColumns` | `columns` | `gridContext.visibleColumns` | `undefined` if `length === 0` (`:255`, `:611`) |

`exportPath` then stringifies: `filters` via `JSON.stringify(params.filters)` (`api.ts:144`) and `columns` via `params.columns.join(',')` (`api.ts:149`). So the resulting query string is:

```
GET /api/data/{connectionId}/tables/{encodeURIComponent(tableName)}/export
      ?schemaName={schema}
      &format={format}
      &maxRows={maxRows}
      [&filters={urlencoded JSON array}]
      [&orderBy={col}]
      [&orderDirection={asc|desc}]
      [&columns={comma-separated}]
```

`schemaName`, `format` and `maxRows` are **always** present (`api.ts:138-142`); the rest are conditional.

### 7c. What is NOT captured — proof

The snapshot contains exactly six assigned keys (`TableGrid.tsx:241-246`). Therefore none of the following can reach the export, because they are never placed into `ExportGridContext`:

- **Pagination / cursor position.** `TableRowsParams.cursor` exists (`types.ts:93`) but `ExportGridContext` has no cursor field (`types.ts:187-195`) and `exportPath` has no cursor handling (`api.ts:132-152`).
- **Row offset.** No offset/limit field; `exportPath` never sends the grid's page size.
- **Cell-level state.** No cell selection, expanded cells, edited/pending values, or pinned rows.
- **Column order.** Only `visibleColumns` (the *set* of visible names) is sent; the grid's display sort order is not, and the backend receives a comma-joined list (`api.ts:149`).
- **Column widths, column resize, frozen columns.**
- **In-flight infinite-scroll pages.** `estimatedTotal` is `displayedRows.length` (`TableGrid.tsx:246`) — the number of rows **loaded in the browser**, not the server's total. It is used purely as the `~N rows` display figure (`ExportButton.tsx:840`). The exported row count is therefore independent of how much the grid has paged in, and the `~` prefix on the badge is honest about the estimate.
- **Search / free-text find.** No field exists in `ExportGridContext`.
- **`tableCount`** — declared optional, never assigned (`types.ts:194`).

One further asymmetry: `gridContext` is only wired into the **`view`** and the **view-path-of-`google_sheets`** branches (`:252-255`, `:608-611`). The `table` scope sends `format` + `maxRows` only (`:320-323`, `:637-640`, `:688-691`) and the `database` scope sends `format` + `schemas` only (`:522-526`). Grid state therefore never leaks into a multi-table or whole-database export — selecting multiple tables silently drops the active filter and sort.

## 8. File Naming

There are three distinct construction paths.

### 8a. Table / view exports — server-named, zero client sanitisation

`filenameFromDisposition` (`api.ts:167-171`):

```ts
const disposition = response.headers.get('Content-Disposition') || '';
const match = disposition.match(/filename="?([^"]+)"?/);
return match ? match[1] : fallback;
```

- Callers: `fetchTableExport` with fallback `` `${tableName}.${params.format || 'csv'}` `` (`api.ts:195`), `fetchSchemaExportBlob` with fallback `` `database_export_${new Date().toISOString().split('T')[0]}.zip` `` (`api.ts:287`).
- **The frontend performs no date stamping and no sanitisation for these files.** Whatever string appears in `Content-Disposition` becomes `link.download` verbatim (`ExportButton.tsx:209`).
- The `filename` regex has no `filename*=UTF-8''…` support and no RFC 5987 percent-decoding, so a server that only emits the extended form falls through to the fallback.
- The fallback `${tableName}.${format}` would produce e.g. `orders.google_sheets` if that combination ever reached it — but the Google Sheets path discards `result.filename` entirely (only `result.blob` and `result.rowCount` are used, `:266`, `:332`, `:389`), so the path is unreachable in practice.
- **No collision handling.** Multiple tables in a multi-table export each land as a separate download with whatever name the server returned (`ExportButton.tsx:692`); if names repeat, the browser's own uniquifier applies. There is no index, timestamp or counter appended client-side.

### 8b. ZIP database export — server-named, UTC date fallback

`fetchSchemaExportBlob` (`api.ts:276-291`), as above. The filename is whatever `Content-Disposition` says, else `database_export_YYYY-MM-DD.zip` (UTC, `toISOString().split('T')[0]`, `api.ts:287`). Sanitisation of schema/table names inside the archive is the backend's concern and is not observable from this repo.

### 8c. Google Sheets titles — client-built, no sanitisation

See §6e. `${schemaName}.${tableName} (YYYY-MM-DD)`, raw, no filtering (`ExportButton.tsx:260`, `:327`, `:385`).

### 8d. Artifact export — the only path that sanitises

`toFilename` (`src/shared/lib/format.ts:96-101`):

```ts
return (title || fallback)
  .replace(/[^a-zA-Z0-9_\- ]/g, '')
  .replace(/\s+/g, '_')
  .slice(0, 60);
```

Strips everything outside `[a-zA-Z0-9_- ]`, collapses whitespace runs to a single `_`, truncates to **60** characters, and falls back to `'export'` (or `'chart'` for PNG, via the call site) when the title is empty. Used only by `exportUtils.ts:40`, `:47`, `:103`, `:120` — **never** by the grid export.

## 9. Blob / Download Mechanics

### 9a. Transport

- All grid-export HTTP goes through `apiRequestRaw` (`api.ts:187`, `:282`), which applies `credentials: 'include'`, the CSRF header, and a JSON content type, then leaves status handling to itself: non-OK throws `ApiError`, JSON bodies parsed for `message`/`error`, non-JSON bodies read as text (`src/lib/api/client.ts:132-160`).
- `API_BASE_URL = import.meta.env.VITE_API_URL || ''` — empty means same-origin through the Vite proxy (`src/lib/api/client.ts:7`).
- Download happens client-side only. `getExportUrl` / `getSchemaExportDownloadUrl` / `downloadSchemaExport` (`api.ts:157`, `:254`, `:261`) would enable anchor navigation but have **no callers**.

### 9b. Trigger

```ts
const triggerDownload = (blob: Blob, filename: string) => {   // ExportButton.tsx:205-214
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 10000);         // 10 000 ms
};
```

| Property | Value / note |
| --- | --- |
| Object URL revocation | deferred `10000` ms after click (`ExportButton.tsx:213`) — the blob is held in memory for a further 10 s. |
| Anchor lifetime | appended, clicked, then immediately removed (`ExportButton.tsx:210-212`). |
| Multi-table pacing | `250` ms between downloads so the browser handles each (`ExportButton.tsx:700`). |
| No navigation | no `window.location` change; the SPA is never unloaded. |

### 9c. Memory characteristics

| Stage | Behaviour | Citation |
| --- | --- | --- |
| Table export body | `await response.blob()` — **fully buffered in renderer memory**, no streaming, no `ReadableStream` consumption | `api.ts:197` |
| ZIP body | `await response.blob()` — same, on a potentially multi-hundred-MB archive | `api.ts:289` |
| CSV → Drive | the blob is additionally fully decoded to a JS string (`await csvBlob.text()`), then concatenated into a larger `multipart/related` string, then sent as a string body — i.e. up to **three** in-memory copies (Blob bytes, UTF-16 string, multipart string) | `google-sheets.ts:125-142` |
| Peak exposure | largest single value is the Database ZIP (unbounded by any client row cap — see §4) | — |
| Revocation | all object URLs released after 10 s | `ExportButton.tsx:213` |
| Artifact path | `downloadBlob` revokes the URL **immediately** after `.click()`, with no timeout — different from `triggerDownload` | `exportUtils.ts:16` |

There is no progress reporting on byte transfer — the `X-Export-Table-Count` count only tracks table-level completion reported by the backend (`api.ts:284`).

### 9d. Error handling per stage

| Stage | Handling | Citation |
| --- | --- | --- |
| No connection | `toast.error('Select a connection to export')`, return before anything is set in flight | `ExportButton.tsx:476-479` |
| Trigger button disabled | `disabled={!connectionId}` | `ExportButton.tsx:777` |
| View path guard | `!tableName` → `toast.error('Please select a table to export', { duration: 3000 })` | `ExportButton.tsx:598-602` |
| Empty selection guard | `selectedTables.length === 0` → `toast.error('Please select at least one table to export', { duration: 3000 })` | `ExportButton.tsx:627-631` |
| No-schema guard | `effectiveSchemas.length === 0` → `toast.error('No tables found in the selected schemas')` | `ExportButton.tsx:510-514` |
| Job registration / ZIP download | try/catch: `AbortError` → `toast.info('Export cancelled', { duration: 3000 })`; else `toast.error('Export failed', { duration: 4000, description: err.message })` | `ExportButton.tsx:577-588` |
| View / table / multi-table | outer try/catch → `toast.error('Export failed', { duration: 4000 })` with `err.message` or `'Something went wrong while exporting.'` | `ExportButton.tsx:713-717` |
| Multi-table per-item | swallowed into `logger.error('Failed to export table X:', tableErr)`; the run continues | `ExportButton.tsx:694-696` |
| Google Sheets per-item (extra tables) | swallowed into `logger.error('Failed to export X to Google Sheets:', ...)` | `ExportButton.tsx:402-404` |
| Poll errors | fully swallowed (`catch {}`) | `ExportButton.tsx:554-556` |
| Cancel API call | `.catch(() => undefined)` | `ExportButton.tsx:222` |
| `finally` | always `trackEvent('export', { scope, format, table })` when `tableName` is set, then `setIsExporting(false)`, `setExportProgress(null)`, `abortControllerRef.current = null` | `ExportButton.tsx:718-725` |
| 401 on any grid-export request | dispatches the global `auth:unauthorized` window event via `announceUnauthorized`, which AuthProvider consumes to sign out | `src/lib/api/client.ts:99-103`, `:140` |

`trackEvent` POSTs `{ kind, device_id, meta }` to `/api/activity/event` (`src/components/auth/activity.ts:66-72`). **Export metadata leaves the app:** `scope`, `format`, and the table name are recorded (`ExportButton.tsx:720`). `format` here is the selected tile value, so a Google Sheets export is logged as `format: 'google_sheets'` even though the actual transfer was CSV.

## 10. Empty / Error / Edge State Matrix

| State | Trigger button | Popover / panels | Action button | Toast | Citation |
| --- | --- | --- | --- | --- | --- |
| **No connection** (`connectionId === null`) | `disabled`, icon `Download`, label `Export` | Renders; `useSchemas`/`useTableList` are `enabled: !!connectionId` so both lists stay empty (`api/hooks.ts:41`, `:57`) | `disabled` (`!connectionId`) | — (button unreachable; the `toast.error('Select a connection to export')` at `:476-479` is a defensive guard for programmatic calls) | `:777`, `:1250` |
| **Connected, no table** | enabled | `effectiveScope` forced to `database`; View tab `disabled`; Table tab enabled only if the list is non-empty | database branch, `disabled` if no schemas | — | `:180`, `:795`, `:803`, `:1252` |
| **No schema has tables** | enabled | Schema block omitted entirely (`schemas.length > 0` guard) | `disabled` (`effectiveSchemas.length === 0`) | — | `:983`, `:1252` |
| **No tables in schema** | enabled | Table list shows `No tables available`; summary `No tables selected` | `disabled` (`selectedTables.length === 0`) | — | `:925`, `:961`, `:1253` |
| **Search yields nothing** | enabled | List shows `No matching tables` (distinct message) | unchanged | — | `:924-926` |
| **Tables still loading** | enabled | `Loading tables…` in the list body | unchanged | — | `:922` |
| **Google Sheets + Database scope** | enabled | Amber inline warning; View/Table content unaffected | `disabled`; label `Select View or Table for Sheets` | `toast.info('Google Sheets export is available for View and Table scopes.')` if clicked programmatically | `:977-981`, `:741-744`, `:1252`, `:482-485` |
| **Export in progress (any scope)** | spinner + `{done}/{total}`, still enabled | all inputs disabled/dimmed | replaced by spinner + `Cancel` | infinite `toast.loading`, `duration: Infinity` | `:780-785`, `:1229-1246`, `:238`, `:516`, `:656` |
| **Export in progress, no progress object** | spinner + literal `Export` | as above | `Streaming…` instead of a counter | as above | `:785`, `:1234` |
| **Success (table/view)** | restored | popover closes (`:622`, `:650`) | restored | `toast.success`, `duration: 3500`, description `Capped at N rows.` iff `capped` | `:615-621`, `:643-649` |
| **Success (database)** | restored | popover closes | restored | `toast.success('Successfully exported N tables as ZIP')`, `duration: 3500` | `:570-574` |
| **Partial success (multi-table)** | restored | — | — | `Successfully exported {exportedCount} of {n} tables` — failures are invisible to the user | `:706-710` |
| **Failure (generic)** | restored | popover stays **open** (closed only on success) | restored | `toast.error('Export failed')`, `duration: 4000` | `:583-587`, `:713-717`, `:714` |
| **Cancelled (database job)** | restored | stays open | restored | `toast.info('Export cancelled')`, `duration: 3000` | `:579-581`, `:662`, `:682` |
| **Cancelled (multi-table loop)** | restored | stays open | restored | `toast.info('Export cancelled')`; no success toast because of the `if (!aborted)` gate at `:704` | `:662`, `:682`, `:704` |
| **Cancelled (view / single-table)** | restored | stays open | restored | **no toast at all** — Cancel only clears local flags; no `AbortController` is attached to those requests | `:216-231`, `:605`, `:637` |
| **Google Sheets: user denies/cancels OAuth** | restored | stays open | restored | `toast.error('Google authorization was cancelled or failed.')` | `:469-472` |
| **Google Sheets: token expired mid-upload (401)** | restored | stays open | restored | `toast.info('Google authorization expired. Refreshing permission…')` then a new OAuth prompt; the old token is cleared | `:422-427`, `google-sheets.ts:146-149` |
| **Google Sheets: API disabled on the GCP project** | restored | stays open | restored | `toast.error(...)`, `duration: 15000`, with an `Enable API` deep link to project `1013066723615` | `:429-445` |
| **Google Sheets: success** | restored | emerald banner + history entry | restored | `toast.success`, `duration: 30000`, `Open Sheet ↗` action, `Copy Link` in the `cancel` slot | `:287-307`, `:1109-1155` |
| **Google Sheets: history empty** | restored | history section not rendered | restored | — | `:1157` |
| **Google Sheets: no `VITE_GOOGLE_CLIENT_ID`** | restored | — | restored | **not handled in the component.** `GoogleOAuthProvider` is simply not mounted (`src/main.tsx:10-16`); `useGoogleLogin` behaviour in that state is not observable from this repo | — |

## 11. UI Placement

### 11a. Mount point

`DataExplorerLayout.tsx:594-603`:

```tsx
// Export is a grid-only control — skip it entirely on dashboard view.
const exportButtonElement =
  mode === 'dashboard' ? null : (
    <ExportButton
      connectionId={connectionId}
      tableName={selectedTable?.name ?? ''}
      schemaName={schemaName}
      gridContext={gridExportContext}
    />
  );
```

`tableName` degrades to `''` when no table is selected (`DataExplorerLayout.tsx:599`), which is what makes `hasTable` false and forces `effectiveScope` to `'database'`.

### 11b. Portal resolution

```tsx
useEffect(() => {
  const el = document.getElementById('table-export-portal');   // :359
  if (el !== exportPortalTarget) setExportPortalTarget(el);
});                                                            // no dep array — runs every render
```

Held in `useState<HTMLElement | null>(null)` (`DataExplorerLayout.tsx:184`). The effect has **no dependency array**, so it re-queries the DOM on every render; the identity guard prevents a state update loop (`:360-362`).

### 11c. Two placement paths

| Path | Condition | Destination |
| --- | --- | --- |
| **Render-prop (active in this app)** | `typeof headerContent === 'function'` (`DataExplorerLayout.tsx:605`) → returns `headerContent({ exportButton: exportButtonElement })` (`:606`). `DataExplorerPage` passes exactly such a function (`src/pages/DataExplorerPage.tsx:388`). | `{mode !== 'dashboard' && exportButton}` inside the top header bar, immediately left of the `#table-export-portal` div and right of the `table-actions-portal` (`src/pages/DataExplorerPage.tsx:435-436`). Header bar is `flex items-center justify-between px-4 h-10 border-b border-border bg-card` (`:389`). |
| **Portal (fallback, currently unreached)** | `headerContent` is not a function | `createPortal(exportButtonElement, exportPortalTarget)` into `#table-export-portal`, rendered as `<div id="table-export-portal" className="hidden" />` (`DataExplorerLayout.tsx:612`; `src/pages/DataExplorerPage.tsx:436`). **The portal host carries `className="hidden"`, so a button portaled there would be invisible** — which is why the render-prop path is the one that actually works. |

### 11d. View-mode visibility

| View mode | Export button | Citation |
| --- | --- | --- |
| `explorer` | **visible** in the header | `DataExplorerLayout.tsx:596` (non-dashboard), `DataExplorerPage.tsx:435` |
| `ai` | **visible** in the header. `effectiveScope` is computed the same way regardless of mode, so with a table selected it opens on View scope over the Resona chat surface even though `TableGrid` is unmounted — `gridExportContext` retains its last explorer-mode value, so View scope remains enabled and exports the last grid's state | `DataExplorerLayout.tsx:596`; grid hidden at `DataExplorerLayout.tsx:616-616` (`mode === 'ai'` renders `AIChatMain`) |
| `dashboard` | **not rendered at all** — `mode === 'dashboard' ? null : …` (`DataExplorerLayout.tsx:596`) plus a second guard `{mode !== 'dashboard' && exportButton}` (`src/pages/DataExplorerPage.tsx:435`). Comment: *"Export is a grid-only control"* (`DataExplorerLayout.tsx:594`), *"grid only, never on dashboard"* (`src/pages/DataExplorerPage.tsx:434`) | — |
| Agent mode (`flash` / `deep`) | **no effect** — no reference to agent mode exists anywhere in the export path. Export availability is keyed solely on `ViewMode` | — |

---

## Artifact Export — Separate System

`src/components/ai/artifacts/exportUtils.ts` is a completely independent path. Header comment: *"Artifact export utilities — all client-side, no backend calls"* (`exportUtils.ts:3`).

| Export | Function | Format produced | Implementation | MIME | Filename |
| --- | --- | --- | --- | --- | --- |
| CSV | `exportCsv` (`:31-41`) | RFC-4180-ish CSV, `,` delimiter, `\n` line ending | `escapeCsvField` quotes when the value contains `,`, `"` or `\n`, doubling inner quotes; `null`/`undefined` → `''` (`:22-29`) | `text/csv;charset=utf-8` (`:40`) | `${toFilename(title ?? 'data', 'export')}.csv` (`:40`) |
| JSON | `exportJson` (`:45-48`) | `JSON.stringify(data, null, 2)` | — | `application/json` (`:47`) | `${toFilename(...)}.json` (`:47`) |
| TSV → clipboard | `copyTsv` (`:52-64`) | tab-separated, **no escaping at all**, no quoting | `navigator.clipboard.writeText`; `null`/`undefined` → `''` (`:60`) | n/a (clipboard) | n/a |
| Excel | `exportExcel` (`:72-104`) | **SpreadsheetML 2003 XML, `.xls` — not real XLSX** (`<?mso-application progid="Excel.Sheet"?>`, `:90`) | Hand-built XML; `escXml` escapes `& < > "` (`:68-70`); cell type is `Number` for `typeof v === 'number'`, else `String` (`:84`); one worksheet named `Data` with one bold header row (`:96-98`) | `application/vnd.ms-excel` (`:103`) | `${toFilename(...)}.xls` (`:103`) |
| Chart PNG | `exportChartPng` (`:108-122`) | PNG at `scale: 2`, `backgroundColor: null` | dynamic `import('html2canvas')` (`:113`), `canvas.toBlob` (`:118`) | `image/png` (`:120`) | `${toFilename(title ?? 'chart', 'export')}.png` (`:120`) |

### Boundary with grid export

| Dimension | Grid export | Artifact export |
| --- | --- | --- |
| Backend | Yes — `POST /export-all`, `GET .../export`, `GET .../progress`, `GET .../download`, `DELETE /export-all/{jobId}` | **No HTTP at all** — every row is already in the browser (`exportUtils.ts:3`) |
| Auth | cookie session + CSRF via `apiRequestRaw` | none |
| Formats | CSV, Google Sheets, Excel (`.xlsx`, server-generated), JSON, SQL | CSV, JSON, **TSV-to-clipboard**, Excel (`.xls` SpreadsheetML), **PNG** |
| SQL | yes | **no** |
| Google Sheets | yes | **no** |
| PNG | no | **yes** |
| Row limit | user-selected, 1 000–50 000 | none — exports whatever `artifact.rows` holds |
| Filename sanitisation | none (server `Content-Disposition`) | `toFilename`, 60-char truncate (`format.ts:96-101`) |
| Object URL revocation | deferred `10000` ms (`ExportButton.tsx:213`) | immediate (`exportUtils.ts:16`) |
| Progress / cancellation | yes | none |

**Naming collision worth flagging:** the artifact `.xls` SpreadsheetML (`exportUtils.ts:103`) and the grid `.xlsx` server export (`ExportButton.tsx:93`) are both labelled "Excel" in their respective UIs but are different formats with different extensions. The grid path's `.xlsx` label is what the backend actually produces; the client never inspects the bytes.

Call sites: `ArtifactView.tsx:436-443` (Excel / CSV / JSON / Copy TSV, plus PNG when a chart ref exists), `ArtifactPanel.tsx:101-103` (PNG, CSV), `ArtifactHistory.tsx:79`, `:86` (Excel, CSV).

---

## Dead / Unused Code

| Item | Location | Evidence |
| --- | --- | --- |
| **`'ndjson'` in the `ExportFormat` union** | `src/components/data-explorer/api/types.ts:173` | The only occurrence of `ndjson` in all of `src/`. Absent from `EXPORT_OPTIONS` (`ExportButton.tsx:75-111`), absent from the `ExportFormatIcon` switch (`:11-203`), never sent by any request builder. Selecting it is impossible. **This is the source of the published-docs error.** |
| **`getExportUrl`** | `src/components/data-explorer/api/api.ts:157-164`, re-exported at `api/index.ts:34` | No callers anywhere in `src/`. Superseded by `fetchTableExport`. |
| **`downloadSchemaExport`** | `api/api.ts:261-271`, re-exported at `api/index.ts:39` | No callers. Superseded by `fetchSchemaExportBlob`. Note its filename `schema_export_{date}.zip` (`api.ts:267`) differs from the live fallback `database_export_{date}.zip` (`api.ts:287`) — an inconsistency sitting in dead code. |
| **`getSchemaExportDownloadUrl`** | `api/api.ts:254-256`, re-exported at `api/index.ts:38` | Only caller is `downloadSchemaExport` (`api.ts:266`), itself dead. |
| **`apiRequestBlob`** | `src/lib/api/client.ts:171-176` | No callers; its own docstring advertises "e.g. CSV/XLSX export" (`client.ts:170`) but the export path uses `apiRequestRaw(...).blob()` instead. |
| **`ExportGridContext.tableCount?`** | `src/components/data-explorer/api/types.ts:194` | Optional field, read by nobody. The only producer (`TableGrid.tsx:240-247`) never assigns it. |
| **`ExportParams.schemaName?`** | `src/components/data-explorer/api/types.ts:177` | Never passed by any caller; `exportPath` takes `schemaName` as a positional argument instead (`api.ts:135`, `:138`). |
| **`X-Export-Table-Count` header parse** | `api/api.ts:284`, returned at `:290` | `fetchSchemaExportBlob` parses and returns `tableCount`, but `ExportButton.tsx:560-576` destructures only `{ blob, filename }`. |
| **`tableList` `tablesLoading` in the Table tab `disabled` expression** | `ExportButton.tsx:803` | `disabled={(!hasTable && tableList.length === 0) \|\| isExporting}` — `tablesLoading` is consumed only for the `Loading tables…` row (`:921`). |
| **`exportButtonText` "Exporting…" branches** | `ExportButton.tsx:735-739` | The only consumer of the label is the footer action button (`:1258`), which is replaced by the spinner + Cancel block whenever `isExporting` (`:1229`). The two `Exporting…` returns are unreachable in the UI. |
| **`ScopeTab` `title` for the View tab** | `ExportButton.tsx:798` | Live, but worth noting it is the only tab whose tooltip changes based on state. Not dead. |
| **`clearStoredDriveToken` legacy sessionStorage keys** | `google-sheets.ts:86-87` | Removes `sw_google_drive_token_v2` and `sw_google_drive_token_v1`. The current prefix is `v3` (`google-sheets.ts:18`) and this module writes only to `localStorage` — the v1/v2 session keys are migration leftovers. |
| **`ExportButtonProps` doc comment vs. reality** | `ExportButton.tsx:63-64` | Comment says grid context "enables the View scope (WYSIWYG export)" — accurate; `gridContext` is live, not dead. Listed here only to note it is **optional**, so a caller omitting it silently disables the View tab. |

## Auth Mechanism (factual)

- Grid-export requests are authenticated **exclusively by the session cookie**. `buildRequestConfig` sets `credentials: 'include'` with the comment `// Include cookies for session` (`src/lib/api/client.ts:86`).
- **No bearer token and no API key is sent on any grid-export request.** There is no `Authorization` header anywhere in `api.ts` or in `ExportButton.tsx`; `get`/`post`/`del` inherit the same preamble (`client.ts:255-276`).
- CSRF: `X-CSRF-Token` is attached to **every** request when a token is available (`client.ts:89`). The token comes from the `_csrf` cookie, falling back to an in-memory copy seeded from `GET /api/csrf-token` (`client.ts:18-28`, `:43-56`). This means **export GETs also carry a CSRF header** — broader than necessary for a read-only download.
- Session expiry: any 401 from an export endpoint dispatches `window.dispatchEvent(new Event('auth:unauthorized'))` (`client.ts:99-103`, fired from `apiRequestRaw` at `:140`), which the AuthProvider consumes to sign out. `AUTH_ENDPOINTS` (`client.ts:73-78`) exempts only the four `/api/auth/*` paths.
- Base URL: `import.meta.env.VITE_API_URL || ''` — empty means same-origin, proxied to `VITE_PROXY_TARGET` in dev (`.env.example`).
- **Google Sheets is the sole exception.** `uploadCsvToGoogleSheets` uses `Authorization: Bearer ${accessToken}` (`google-sheets.ts:139`) against `googleapis.com`, deliberately bypassing the shared client because "there is no session cookie, no CSRF token and no `auth:unauthorized` semantics on that host" (`google-sheets.ts:7-11`). That access token is an OAuth grant held **in `localStorage` in plaintext** under `sw_google_drive_token_v3[_email]` (`google-sheets.ts:18-25`, `:72-73`) and is readable by any script on the origin.
- `trackEvent('export', …)` (`ExportButton.tsx:720`) posts to `/api/activity/event` (`activity.ts:67`) with the app's `device_id`, recording the scope, format and table name server-side.

## Open Questions

UNVERIFIED: Does the backend honour `maxRows` values above its own hard ceiling, and what is that ceiling? The client sends any preset (up to 50 000) with no clamping, and the repo is frontend-only.
UNVERIFIED: What row limit, if any, does the backend apply to the Database ZIP export? The client sends no `maxRows` on `/export-all` (`ExportButton.tsx:522-526`, `api.ts:206-217`) and cannot observe the result.
UNVERIFIED: Does the backend still implement an `ndjson` format branch on `/tables/{table}/export`? The string survives only in the frontend type union (`types.ts:173`); no backend source is present in this repository to check.
UNVERIFIED: What exact `Content-Disposition` filenames does the backend emit for `/export` and `/export-all/{jobId}/download`, and does it sanitise schema/table names inside those names? The client parses whatever arrives (`api.ts:167-171`) and never sanitises.
UNVERIFIED: Does the backend emit RFC 5987 `filename*=UTF-8''…` rather than `filename="…"`? The regex at `api.ts:169` has no support for it and would silently fall back to `database_export_{date}.zip`.
UNVERIFIED: Does the backend actually produce a real XLSX for `format=excel`, or SpreadsheetML-in-an-xlsx-name? The label `.xlsx` (`ExportButton.tsx:93`) is asserted by the client and never verified against the response Content-Type.
UNVERIFIED: What does `useGoogleLogin` do when `VITE_GOOGLE_CLIENT_ID` is unset and `GoogleOAuthProvider` is not mounted (`src/main.tsx:10-16`)? There is no in-component handling of that case.
UNVERIFIED: Is the `auth:unauthorized` event from an export 401 actually handled by AuthProvider, and does it sign the user out or silently refresh? The dispatch site is `src/lib/api/client.ts:102`; the listener is outside the files in scope.
UNVERIFIED: Is the stale-`gridExportContext` behaviour in `ai` mode (View scope exporting the last explorer grid's filters) intended? `DataExplorerLayout.tsx:183` is never reset on mode change and `TableGrid` is unmounted (`DataExplorerLayout.tsx:616-669`).
UNVERIFIED: What is the intended behaviour of the Google Sheets per-scope error-message substring matching (`'expired'`, `'401'`, `'Google Sheets API'`, `'sheets.googleapis.com'`) against arbitrary Google API error strings? The matches are on `err.message` text (`ExportButton.tsx:422`, `:429`) with no error typing.
UNVERIFIED: Does `cancelSchemaExport` actually stop backend work, or is it advisory? The response's `{ status: 'cancelled' }` (`types.ts:174`) is discarded by `handleCancelExport` (`ExportButton.tsx:222`), and the ZIP stream is aborted client-side via `AbortController` (`ExportButton.tsx:563`).
UNVERIFIED: Is there any cross-tab `storage` event listener that keeps the Drive token or recent-sheets history in sync between tabs? `google-sheets.ts` registers none; the comment claims the token "Persists across all tabs" (`google-sheets.ts:34`) but that is a claim about `localStorage` durability, not live sync.