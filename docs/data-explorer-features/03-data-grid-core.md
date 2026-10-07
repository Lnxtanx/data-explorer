---
title: Data Grid Core
section: 3
area: data-grid
sources: 21
status: rough
---

# 03. Data Grid Core

Rendering, virtualization, column sizing and persistence for the Explorer row grid.
Scope note: filtering/sorting/column-visibility *behaviour* is Section 04 and cell
interaction / Column Stats Panel is Section 05 — this document records only the
rendering, sizing, fetch and persistence mechanics those features are built on.

## Component / File Map

| File | Responsibility | Lines |
| --- | --- | --- |
| `src/components/data-explorer/TableGrid.tsx` | Grid shell: virtualizer, query wiring, width engine, persistence calls, portaled toolbar, loading/error/empty states | 879 |
| `src/components/data-explorer/grid/ColumnHeader.tsx` | `<th>`: PK/FK icons, type badge, sort button, drag resizer, profile tooltip | 158 |
| `src/components/data-explorer/grid/GridRow.tsx` | `memo`ised absolutely-positioned `<tr>`; cell formatting, per-row copy state | 196 |
| `src/components/data-explorer/storage/grid-storage.ts` | localStorage persistence for column widths + hidden columns, LRU index, viewport re-clamp | 182 |
| `src/components/data-explorer/storage/explorer-preferences.ts` | localStorage persistence for last-viewed table + page size | 120 |
| `src/components/data-explorer/sidebar/SchemaSelector.tsx` | Radix `Select` of schemas | 47 |
| `src/components/data-explorer/TableSidebar.tsx` | `memo`ised table list, search, row estimates, PK warning, AI shortcut | 207 |
| `src/components/data-explorer/api/hooks.ts` | TanStack query keys + the row/profile/table/schema hooks the grid uses | 197 |
| `src/components/data-explorer/api/api.ts` | `fetchTableRows` / `fetchTableList` / `fetchSchemas` / `fetchColumnStats` / `fetchTableSchema` + response unwrap | 292 |
| `src/components/data-explorer/api/types.ts` | Full data contract for the explorer API | 195 |

Supporting files read for citations (not part of this section's surface):
`src/components/data-explorer/DataExplorerLayout.tsx` (mounts the grid and sidebars),
`src/components/data-explorer/api/filter-matcher.ts`, `src/components/data-explorer/api/index.ts`,
`src/lib/utils.ts`, `src/lib/api/client.ts`, `src/lib/queryClient.ts`, `src/lib/persist.ts`,
`src/shared/storage/store.ts`, `src/shared/storage/registry.ts`, `src/shared/lib/format.ts`,
`src/shared/lib/queryRoots.ts`, `src/pages/DataExplorerPage.tsx` (portal host, partial).

---

## 1. Virtualization

**Library.** `@tanstack/react-virtual` `useVirtualizer`, declared at
`src/components/data-explorer/TableGrid.tsx:31` and instantiated at
`src/components/data-explorer/TableGrid.tsx:254-259`. Installed version
`@tanstack/react-virtual@3.14.10` (`package.json:53`) over
`@tanstack/virtual-core@3.17.8`.

**Row height is fixed/estimated, never measured.**

| Setting | Value | Citation |
| --- | --- | --- |
| `ROW_HEIGHT` constant | `33` (comment: "compact single-line (33px)") | `src/components/data-explorer/TableGrid.tsx:47` |
| `estimateSize` | `() => ROW_HEIGHT` — constant, index-independent | `src/components/data-explorer/TableGrid.tsx:257` |
| `count` | `displayedRows.length` | `src/components/data-explorer/TableGrid.tsx:255` |
| `getScrollElement` | `() => scrollRef.current` | `src/components/data-explorer/TableGrid.tsx:256` |
| `overscan` | `8` (items, not pixels) | `src/components/data-explorer/TableGrid.tsx:258` |
| `measureElement` | not overridden | `src/components/data-explorer/TableGrid.tsx:254-259` |

`GridRow` attaches no `ref` and no `data-index` attribute to its `<tr>`
(`src/components/data-explorer/grid/GridRow.tsx:71-86`), so virtual-core's measurement
path (`node_modules/@tanstack/virtual-core/dist/esm/index.js:128`, `:224`) is never
triggered and every `virtualRow.size` stays at 33. The `<tr>` is styled
`position: absolute; top: 0; left: 0; width: 100%; height: {virtualRow.size}px; transform: translateY({virtualRow.start}px)`
(`src/components/data-explorer/grid/GridRow.tsx:73-80`). Cells are
`overflow-hidden` with a `truncate` span (`src/components/data-explorer/grid/GridRow.tsx:107`, `:135`),
so content cannot wrap and force a height mismatch.

**Exact render-windowing logic.**

1. `virtualizer.getVirtualItems()` is called on every render
   (`src/components/data-explorer/TableGrid.tsx:260`).
2. virtual-core computes a base range from the scroll offset:
   `calculateRangeImpl` binary-searches `scrollOffset` for `startIndex`, then walks
   forward while `measurements[endIndex].end < scrollOffset + outerSize`
   (`node_modules/@tanstack/virtual-core/dist/esm/index.js:1239-1255`).
3. `getVirtualIndexes` applies the default `rangeExtractor`
   (`node_modules/@tanstack/virtual-core/dist/esm/index.js:749-773`), which is:
   `start = max(startIndex - overscan, 0)`,
   `end = min(endIndex + overscan, count - 1)`
   (`node_modules/@tanstack/virtual-core/dist/esm/index.js:19-28`).
4. `TableGrid` maps exactly that array into `<GridRow>` elements
   (`src/components/data-explorer/TableGrid.tsx:807-826`).

**DOM rows for N logical rows.** With viewport height `H`:

```
rangeSpan  = (rows intersecting [scrollOffset, scrollOffset + H)) <= ceil(H / 33)
domRows    = min(N, rangeSpan + 2 × 8)          // ≤ 16 overscan slots
```

Upper bound `domRows ≤ min(N, ceil(H/33) + 16)`. Library default `overscan` is `1`
(`node_modules/@tanstack/virtual-core/dist/esm/index.js:254`); this grid sets `8`.
Plus one `<thead>` row (`src/components/data-explorer/TableGrid.tsx:786-804`) and one
filler `<td>` per body row (`src/components/data-explorer/grid/GridRow.tsx:183`).

**Scroll container sizing.** The virtual body is a real `<table>` with
`tableLayout: 'fixed'; width: 100%; minWidth: 'max-content'`
(`src/components/data-explorer/TableGrid.tsx:784`); `<tbody>` carries
`height: {virtualizer.getTotalSize()}px; position: relative`
(`src/components/data-explorer/TableGrid.tsx:806`), which is the scrollable extent.

**Infinite-scroll trigger.** A trailing-window effect fetches the next page when the
last rendered index is within 15 rows of the end:
`lastVirtualIndex >= displayedRows.length - 15` → `fetchNextPage()`
(`src/components/data-explorer/TableGrid.tsx:263-269`). Guarded by
`hasNextPage && !isFetchingNextPage` (`:266`).

**Row-count trim guard.** If `displayedRows.length` shrinks below the previous value
*and* `scrollTop > displayedRows.length * ROW_HEIGHT`, the container is reset to
`scrollTop = 0` (`src/components/data-explorer/TableGrid.tsx:272-282`).

---

## 2. Data Fetching

### 2.1 Request shape

`fetchTableRows(connectionId, tableName, params)` builds
`GET {API_BASE_URL}/api/data/{connectionId}/tables/{encodeURIComponent(tableName)}/rows?…`
(`src/components/data-explorer/api/api.ts:69-89`; base URL from
`src/lib/api/client.ts:7`).

Query-string construction, one `if` per parameter — each is **omitted when falsy/empty**
(`src/components/data-explorer/api/api.ts:76-83`):

| Param | Set when | Encoding | Citation |
| --- | --- | --- | --- |
| `schemaName` | truthy | raw | `src/components/data-explorer/api/api.ts:76` |
| `limit` | truthy | `String(limit)` | `src/components/data-explorer/api/api.ts:77` |
| `cursor` | truthy | raw | `src/components/data-explorer/api/api.ts:78` |
| `orderBy` | truthy | raw (omitted when no sort column) | `src/components/data-explorer/api/api.ts:79` |
| `orderDirection` | truthy | raw | `src/components/data-explorer/api/api.ts:80` |
| `filters` | array with `length > 0` | `JSON.stringify(filters)` | `src/components/data-explorer/api/api.ts:81-83` |

Table name is URL-encoded; schema/table are not interpolated into the path body
(`src/components/data-explorer/api/api.ts:86`).

Every request goes through `get<T>` → `apiRequest` (`src/lib/api/client.ts:255-257`,
`:182-210`), which attaches `credentials: 'include'`, `Content-Type: application/json`
and an `X-CSRF-Token` header when one is available
(`src/lib/api/client.ts:80-93`), and fires a window `auth:unauthorized` event on a
non-auth 401 (`src/lib/api/client.ts:99-103`, `:204-207`).

**Response unwrap.** The backend envelope `{ success: true, ...data }` is unwrapped by
`unwrapResponse` (`src/components/data-explorer/api/api.ts:34-44`); on `success === false`
it throws an `Error` with **`status` hard-coded to `500`**
(`src/components/data-explorer/api/api.ts:37`) plus `code` and `hint`
(`:38-39`). A `{success:true}` response with a non-JSON content type resolves to `{}`
(`src/lib/api/client.ts:192-200`).

### 2.2 Cursor (keyset) pagination — proof

- `TableRowsParams.cursor?: string`, there is no `offset`/`page`/`skip` field anywhere in
  the contract (`src/components/data-explorer/api/types.ts:90-97`).
- `initialPageParam: undefined as string | undefined` — the first page carries no cursor
  (`src/components/data-explorer/api/hooks.ts:80`).
- `getNextPageParam: (lastPage) => lastPage.pagination.nextCursor`
  (`src/components/data-explorer/api/hooks.ts:81`).
- `PaginationInfo.nextCursor: string | null` / `prevCursor: string | null`
  (`src/components/data-explorer/api/types.ts:53-58`).

Consequences:
- **Forward-only.** No `getPreviousPageParam` is configured and `fetchPreviousPage` is
  never destructured (`src/components/data-explorer/api/hooks.ts:74-92`,
  `src/components/data-explorer/TableGrid.tsx:158-177`). `prevCursor`
  (`src/components/data-explorer/api/types.ts:56`) is returned by the API and read by
  nothing in the explorer.
- **`hasNextPage` is derived from `nextCursor`, not from `hasMore`**
  (`src/components/data-explorer/api/hooks.ts:81`). `PaginationInfo.hasMore`
  (`src/components/data-explorer/api/types.ts:54`) has no reader in the explorer.

### 2.3 Page size

| Item | Value | Citation |
| --- | --- | --- |
| Options offered | `[100, 250, 500, 1000, 2000]` | `src/components/data-explorer/storage/explorer-preferences.ts:81` |
| Default | `500` | `src/components/data-explorer/storage/explorer-preferences.ts:82` |
| State initialiser | `useState<number>(() => getExplorerPageSize())` | `src/components/data-explorer/TableGrid.tsx:149` |
| Sent as | `limit` in the query key params and in the URL | `src/components/data-explorer/TableGrid.tsx:175`, `src/components/data-explorer/api/api.ts:77` |
| Select UI (portaled) | `Select` + `SelectItem` per option, label `"{size} / page"` | `src/components/data-explorer/TableGrid.tsx:691-700` |
| On change | sets state, persists, scrolls to `{top:0,left:0}` | `src/components/data-explorer/TableGrid.tsx:151-155` |

Changing `limit` changes the query key, so a brand-new infinite query starts from page 1.

### 2.4 Query configuration

`useTableRows` (`src/components/data-explorer/api/hooks.ts:69-93`):

| Option | Value | Citation |
| --- | --- | --- |
| `queryKey` | `[...dataExplorerKeys.rows(connectionId, tableName), params]` — root `'data-explorer'`, segment `'rows'` | `src/components/data-explorer/api/hooks.ts:75`, `src/components/data-explorer/api/hooks.ts:25-26`, `src/shared/lib/queryRoots.ts:26` |
| `queryFn` | `({ pageParam }) => fetchTableRows(…, { ...params, cursor: pageParam })` | `src/components/data-explorer/api/hooks.ts:76-79` |
| `initialPageParam` | `undefined` | `src/components/data-explorer/api/hooks.ts:80` |
| `getNextPageParam` | `lastPage.pagination.nextCursor` | `src/components/data-explorer/api/hooks.ts:81` |
| **`maxPages`** | **`5`** | `src/components/data-explorer/api/hooks.ts:82` |
| `enabled` | `!!connectionId && !!tableName` | `src/components/data-explorer/api/hooks.ts:83` |
| `staleTime` | `60_000` (1 min) | `src/components/data-explorer/api/hooks.ts:84` |
| `gcTime` | `30 * 60_000` (30 min) | `src/components/data-explorer/api/hooks.ts:85` |
| `placeholderData` | previous data reused **only** when `queryKey[2] === connectionId && queryKey[3] === tableName` | `src/components/data-explorer/api/hooks.ts:86-91` |

Client-wide defaults inherited by the rows query
(`src/lib/queryClient.ts:11-18`): `staleTime` 60 s (`:12`), `gcTime` 5 min (`:13`),
`retry: 2` (`:14`), `retryDelay: Math.min(1000 * 2 ** attempt, 10_000)` (`:15`),
`refetchOnWindowFocus: false` (`:16`), `persister: explorerQueryPersister` (`:17`).

### 2.5 Polling / refetch-on-focus

- **No polling.** No `refetchInterval` is set on any explorer query
  (`src/components/data-explorer/api/hooks.ts:37-171`).
- **No focus refetch.** `refetchOnWindowFocus: false` globally
  (`src/lib/queryClient.ts:16`), and `useTableRows` does not override it
  (`src/components/data-explorer/api/hooks.ts:69-93`).
- **Reconnect refetch is opt-in per hook.** `refetchOnReconnect: true` is set only on
  `useSchemas` (`src/components/data-explorer/api/hooks.ts:45`) and `useTableList`
  (`src/components/data-explorer/api/hooks.ts:61`) — **not** on rows.
- **Browser `online` listener** refetches tables + schemas only
  (`src/components/data-explorer/DataExplorerLayout.tsx:385-394`). Rows are not refetched.
- **Manual refresh** is the only row-refresh path
  (`src/components/data-explorer/TableGrid.tsx:354-379`): `refetch()` plus
  `invalidateQueries` for `tables`, `schemas`, `rows` and `stats` in one
  `Promise.all` (`src/components/data-explorer/TableGrid.tsx:357-371`). The spinner is
  cleared by an unconditional `setTimeout(…, 600)` in `finally`
  (`src/components/data-explorer/TableGrid.tsx:375-377`), so the button stays disabled for
  ≥600 ms regardless of how long the refetch took.
- **Header profiles** (`useColumnHeaderProfiles`, used at
  `src/components/data-explorer/TableGrid.tsx:126`) run one `mode=pg_stats` query for all
  columns (`src/components/data-explorer/api/hooks.ts:143-154`,
  `src/components/data-explorer/api/api.ts:150`) with `staleTime: 60_000`
  (`src/components/data-explorer/api/hooks.ts:152`).

### 2.6 Cancellation and race guards

**There is no request cancellation.**

- `queryFn` destructures **only** `pageParam`; the `signal` React Query provides on the
  query-function context is never read (`src/components/data-explorer/api/hooks.ts:76-79`).
- `fetchTableRows` has no `signal` parameter (`src/components/data-explorer/api/api.ts:69-73`)
  and neither does `get<T>` (`src/lib/api/client.ts:255-257`) or `apiRequest`
  (`src/lib/api/client.ts:182-185`), so there is no plumbing to pass one.
- Consequence in library terms: React Query creates an `AbortController` per fetch
  (`node_modules/@tanstack/query-core/build/legacy/query.js:222`) but only marks the signal
  consumed when `queryFn` touches `.signal` (`…/query.js:223-231`, `:244`), and
  `abortController.abort()` fires only from the retryer's `onCancel`
  (`…/query.js:278-286`). Because the grid never touches `signal`, an in-flight row request
  runs to completion even if the table changes mid-flight.

**Guards that do exist:**

| Guard | What it does | Citation |
| --- | --- | --- |
| `placeholderData` | Reuses the previous result while a new key loads, but **only** when connection *and* table match — prevents showing table A's rows under table B | `src/components/data-explorer/api/hooks.ts:86-91` |
| Reset-on-table-change effect | Clears sort/filters/selection/widths/hidden and scrolls to origin on `[connectionId, schemaName, tableName]` change | `src/components/data-explorer/TableGrid.tsx:138-147` |
| `isFetchingNextPage` latch | Prevents re-entrant `fetchNextPage` | `src/components/data-explorer/TableGrid.tsx:266` |
| Row-count trim reset | Resets `scrollTop` when the row array shrinks past the current scroll offset | `src/components/data-explorer/TableGrid.tsx:272-282` |
| Scroll-freeze flag | `isScrollingRef` with a 150 ms debounce to suppress hover previews | `src/components/data-explorer/TableGrid.tsx:96-123`, `:110` |
| Hover open/close timers | 450 ms open delay, 200 ms close delay, both cleared on scroll and unmount | `src/components/data-explorer/TableGrid.tsx:554-566`, `:574-576`, `:99-102`, `:119-121` |

There is **no** `mountedRef`, request-sequence counter or `ignore`-flag pattern anywhere in
`TableGrid.tsx`, `hooks.ts` or `api.ts`.

### 2.7 `maxPages: 5` — bounded window (correctness-relevant)

`maxPages: 5` (`src/components/data-explorer/api/hooks.ts:82`) makes React Query discard
the **oldest** page when a 6th arrives: `addToEnd` does
`newItems.slice(1)` when `length > max`
(`node_modules/@tanstack/query-core/build/legacy/utils.js:218-221`, applied at
`node_modules/@tanstack/query-core/build/legacy/infiniteQueryBehavior.js:50-55`).

Observed consequences in this grid:

- At most 5 pages are ever resident, i.e. `5 × limit` rows — 2500 at the default 500
  (`src/components/data-explorer/storage/explorer-preferences.ts:82`).
- Row numbers are `virtualRow.index + 1` over `displayedRows`
  (`src/components/data-explorer/TableGrid.tsx:809`), and `displayedRows` is the flattened
  retained pages (`src/components/data-explorer/TableGrid.tsx:180-182`). After a page is
  trimmed, **the row-number column restarts at 1 for the retained window**.
- `estimatedTotal` reads `data.pages[0].pagination.estimatedTotal`
  (`src/components/data-explorer/TableGrid.tsx:185`), i.e. the oldest *retained* page.
- `columns` also comes from `data.pages[0].columns`
  (`src/components/data-explorer/TableGrid.tsx:212-214`).
- `isFullTableInMemory` (`src/components/data-explorer/TableGrid.tsx:195-197`) therefore can
  only become true for tables that fit in `5 × limit` rows.

---

## 3. Column Sizing Engine

Computed once per data change in a single `useMemo` keyed on `[columns, firstPageRows]`
(`src/components/data-explorer/TableGrid.tsx:449-495`), where
`firstPageRows = data?.pages[0]?.rows` (`src/components/data-explorer/TableGrid.tsx:448`).
There is **no** percentile and **no** statistical outlier rejection — the content width is
a plain maximum over the sample.

### 3.1 Measurement primitive

`measureTextWidth(text, font)` uses a **module-level singleton**
`CanvasRenderingContext2D` created lazily from a detached `<canvas>`
(`src/lib/utils.ts:12-19`), setting `context.font` then returning
`context.measureText(text).width` (`src/lib/utils.ts:24-29`). If the context is
unavailable it falls back to `text.length * 8` (`src/lib/utils.ts:26`).

Two font strings are used, verbatim:

| Purpose | Font string | Fallback when measurement yields 0 | Citation |
| --- | --- | --- | --- |
| Column name | `'500 12px Inter, sans-serif'` | `col.name.length * 8.5` | `src/components/data-explorer/TableGrid.tsx:456` |
| Long cell value | `'400 13px Inter, sans-serif'` | n/a — only called when `str.length > 35` | `src/components/data-explorer/TableGrid.tsx:469` |

Note the fallback at `src/components/data-explorer/TableGrid.tsx:456` is effectively dead:
`measureTextWidth` already returns a non-zero value for any non-empty string (fallback
`length * 8`), so the `* 8.5` branch only fires for an empty column name. Also note the
font used for measurement (`400 13px`) does not match the rendered cell font
(`text-[12px]`, `src/components/data-explorer/grid/GridRow.tsx:135`).

### 3.2 Sampling strategy

`const sampleRows = (firstPageRows || []).slice(0, 8);`
— **at most the first 8 rows of page 0 only** (`src/components/data-explorer/TableGrid.tsx:453`).
Later pages are never sampled.

### 3.3 Header floor

```
shortType        = formatShortType(col.type) + (col.nullable ? '?' : '')
shortTypeWidth   = shortType ? (shortType.length * 6.5) + 6 : 0
extraHeaderPad   = (col.isPrimaryKey || col.isForeignKey ? 20 : 0) + 42
minHeaderWidth   = max(ceil(colNameWidth + shortTypeWidth + extraHeaderPad), 100)
```

Citations: `src/components/data-explorer/TableGrid.tsx:457`, `:458`, `:459`, `:460`.
So the header floor is **100 px** regardless of type; PK/FK columns get +20 px for the icon.

### 3.4 Content measurement

Per column, iterate the sample; skip `null`/`undefined`; string-ify objects with
`JSON.stringify` (`src/components/data-explorer/TableGrid.tsx:465-474`):

```
str        = typeof val === 'object' ? JSON.stringify(val) : String(val)
estimated  = str.length > 35
               ? measureTextWidth(str.slice(0, 50), '400 13px Inter, sans-serif')
               : str.length * 7.8
maxContentWidth = max(estimated)                 // over the ≤8 sampled rows
contentWidth     = ceil(maxContentWidth + 28)    // +28 px cell padding
```

Citations: `src/components/data-explorer/TableGrid.tsx:466-476`.
Values longer than 35 chars are measured over **only their first 50 characters**
(`src/components/data-explorer/TableGrid.tsx:469`), so long text is systematically
under-measured relative to a true fit.

### 3.5 Per-type max-width clamps

The branch is a substring test on `col.type.toLowerCase()`
(`src/components/data-explorer/TableGrid.tsx:462`), evaluated top-down with `else if`:

| Order | Test (substring on lowercased type) | Max content width | Citation |
| --- | --- | --- | --- |
| 1 | `includes('bool')` | `110` | `src/components/data-explorer/TableGrid.tsx:479-480` |
| 2 | `includes('int')` **or** `includes('serial')` **or** `includes('numeric')` **or** `includes('double')` **or** `includes('float')` | `160` | `src/components/data-explorer/TableGrid.tsx:481-482` |
| 3 | `includes('timestamp')` **or** `includes('date')` **or** `includes('time')` | `200` | `src/components/data-explorer/TableGrid.tsx:483-484` |
| 4 | `includes('uuid')` | `280` | `src/components/data-explorer/TableGrid.tsx:485-486` |
| 5 (fallback) | everything else | `450` | `src/components/data-explorer/TableGrid.tsx:487-489` |

Effective mapping for common PostgreSQL types, given the substring tests and the order above:

| Postgres type (informational, derived from the substring rules) | Clamp | Citation of rule |
| --- | --- | --- |
| `boolean` / `bool` | 110 | `src/components/data-explorer/TableGrid.tsx:479-480` |
| `smallint`, `int2`, `integer`, `int4`, `int8`, `bigint`, `serial`, `bigserial`, `real`, `float4`, `float8`, `double precision`, `numeric`, `decimal` | 160 | `src/components/data-explorer/TableGrid.tsx:481-482` |
| `date`, `time`, `timetz`, `timestamp`, `timestamptz`, `interval` | 200 | `src/components/data-explorer/TableGrid.tsx:483-484` |
| `uuid` | 280 | `src/components/data-explorer/TableGrid.tsx:485-486` |
| `text`, `varchar`, `character varying`, `json`, `jsonb`, `bytea`, `money`, `bit`, `enum`, arrays, … | 450 | `src/components/data-explorer/TableGrid.tsx:487-489` |

Ordering artifacts of the substring test, stated as observed behaviour:
- `numeric` is caught by rule 2, so long numeric/money strings are capped at 160.
- `interval` and `bit` both contain `int`, so they are caught by rule 2 (160), not rule 3
  (200) or rule 5 (450).
- Rule 1 wins over everything, so a hypothetical type containing both `bool` and `int`
  takes 110.

### 3.6 Final width and resolution

```
finalWidth = max(minHeaderWidth, clampedContentWidth)
widths[col.name] = Math.round(finalWidth)
```

Citations: `src/components/data-explorer/TableGrid.tsx:491-492`.

**Manual-override resolution** — `getWidthForColumn` (`src/components/data-explorer/TableGrid.tsx:497-505`):

```
userW = columnWidths[colName]        // persisted / dragged
defW  = defaultWidths[colName]       // sampled engine
if (userW && defW && defW > userW * 2.5) return defW;   // sanity override, factor 2.5
return userW || defW || 200;                            // final fallback 200
```

So the width-sanity rule is: **discard the saved width when the freshly sampled default is
more than 2.5× the saved width** (`src/components/data-explorer/TableGrid.tsx:501-503`).
Fallback when neither exists: `200` (`src/components/data-explorer/TableGrid.tsx:504`).

Results are flattened into a lookup map recomputed only when `visibleColumns` or
`getWidthForColumn` changes (`src/components/data-explorer/TableGrid.tsx:508-514`), and
consumed as `resolvedWidths[column.name] || 200`
(`src/components/data-explorer/TableGrid.tsx:796`,
`src/components/data-explorer/grid/GridRow.tsx:102`).

`formatShortType` (used for the header badge width and the visible badge) maps verbose
types to short labels and truncates anything longer than 12 chars to
`slice(0,10) + '…'` (`src/lib/utils.ts:34-51`).

---

## 4. Column Resize

All in `src/components/data-explorer/grid/ColumnHeader.tsx`.

**Hit area.** A `div` is absolutely positioned at the header's right edge:
`w-1.5 h-full cursor-col-resize hover:bg-primary z-10`, with
`style={{ right: '-3px' }}` (`src/components/data-explorer/grid/ColumnHeader.tsx:131-137`)
— 6 px wide, overhanging 3 px into the next column. Clicks are stopped from bubbling
(`:135`).

**Manual drag** (`src/components/data-explorer/grid/ColumnHeader.tsx:42-62`):

1. `mousedown` → `preventDefault()` + `stopPropagation()` (`:43-44`).
2. `startX = e.pageX`, `startWidth = width || 200` (`:46-47`).
3. `document`-level `mousemove` → `onResize(Math.max(50, startWidth + (moveEvent.pageX - startX)))` (`:49-53`).
4. `document`-level `mouseup` removes both listeners (`:55-58`).

Properties: **mouse events only** — no Pointer Events, no touch handling, no `setPointerCapture`.
Minimum enforced at `50` px in two places (`src/components/data-explorer/grid/ColumnHeader.tsx:51`
and again in the parent at `src/components/data-explorer/TableGrid.tsx:328`).
**No maximum clamp** on manual resize.
Every `mousemove` writes React state and resets the persistence debounce, so a drag issues a
`setState` per mouse event (no rAF throttle in the resize path).

**Double-click** on the resizer calls `onResetWidth()`
(`src/components/data-explorer/grid/ColumnHeader.tsx:64-68`), which the grid wires to
`handleResetColumnWidth` (`src/components/data-explorer/TableGrid.tsx:798`, `:340-352`).
That handler **deletes** the column's entry from the width map
(`src/components/data-explorer/TableGrid.tsx:342-343`) and persists the result. This is
"clear the manual override", **not** a true auto-fit — the column reverts to the sampled
`defaultWidths` value from §3, never to a full-content fit.

**Header width is pinned three ways**: `style={{ width, minWidth: width, maxWidth: width }}`
(`src/components/data-explorer/grid/ColumnHeader.tsx:80`), and the body cell repeats
`width` / `minWidth` / `maxWidth` (`src/components/data-explorer/grid/GridRow.tsx:108-112`).

**Debounced persistence.** `handleColumnResize` and `handleResetColumnWidth` share one
`saveTimeoutRef` and write after **400 ms** of inactivity
(`src/components/data-explorer/TableGrid.tsx:322`, `:331-334`, `:345-348`).
The ref is **not** cleared on unmount.

---

## 5. Persistence — `grid-storage.ts`

**Backend: `localStorage`.** No IndexedDB in this module. `createStore` defaults
`storage` to `localStorage` (`src/shared/storage/store.ts:111`), and `registerKey` /
`manageLRUCache` touch `localStorage` directly (`src/shared/storage/registry.ts:22-24`,
`src/components/data-explorer/storage/grid-storage.ts:126`, `:143`, `:178`).
The `idb` dependency is used by the *query-cache* persister only
(`src/lib/persist.ts:8`, `:53-59`), not by grid layout.

### 5.1 Constants

| Constant | Value | Citation |
| --- | --- | --- |
| `CACHE_VERSION` | `1` | `src/components/data-explorer/storage/grid-storage.ts:17` |
| `MAX_CACHE_AGE_MS` | `30 * 24 * 60 * 60 * 1000` (30 days) | `src/components/data-explorer/storage/grid-storage.ts:18` |
| `MAX_TABLES_CACHED` | `50` | `src/components/data-explorer/storage/grid-storage.ts:19` |
| `REGISTRY_KEY` | `'sw-grid-cache-index'` | `src/components/data-explorer/storage/grid-storage.ts:20` |
| `CACHE_PREFIX` | `'sw-data-explorer-cols-'` | `src/components/data-explorer/storage/grid-storage.ts:21` |
| `HIDDEN_COLS_PREFIX` | `'sw-data-explorer-hidden-cols-'` | `src/components/data-explorer/storage/grid-storage.ts:22` |

### 5.2 Storage keys

| Key | Template | Scoping | Citation |
| --- | --- | --- | --- |
| Column widths | `` `${CACHE_PREFIX}${connectionId}-${schemaName}-${tableName}` `` | connection + schema + table, hyphen-joined | `src/components/data-explorer/storage/grid-storage.ts:34-36` |
| Hidden columns | `` `${HIDDEN_COLS_PREFIX}${connectionId}-${schemaName}-${tableName}` `` | connection + schema + table, hyphen-joined | `src/components/data-explorer/storage/grid-storage.ts:38-40` |
| LRU registry | `sw-grid-cache-index` | global, array of width keys | `src/components/data-explorer/storage/grid-storage.ts:20`, `:124-147` |

Because the identifiers are joined with `-` and not escaped, a `schemaName` or `tableName`
containing `-` can collide with another `(schema, table)` pair.

### 5.3 Envelope, TTL, validation

Both stores delegate to `createStore` (`src/shared/storage/store.ts:108-212`).
Envelope is `{ v, ts, data }` (`src/shared/storage/store.ts:28-34`, written at `:195`).

| Store | `version` | `ttlMs` | `fallback` | `validate` | `migrate` | Citation |
| --- | --- | --- | --- | --- | --- | --- |
| widths | `1` | 30 days | `{ cols: {} }` | `isColumnWidthCache` (`cols` is a non-null object) | legacy flat `{ v, ts, cols }` → envelope, `ts` carried across | `src/components/data-explorer/storage/grid-storage.ts:48-65`; validator `:42-46` |
| hidden columns | `1` | **none** | `[]` | none | bare JSON array of strings | `src/components/data-explorer/storage/grid-storage.ts:149-156` |

**Hidden columns therefore never expire** — no `ttlMs` is passed
(`src/components/data-explorer/storage/grid-storage.ts:150-156`).

Read order in `createStore`: missing → fallback; unparseable → discard + fallback;
non-envelope → `migrate`; wrong `v` → `migrate`; past TTL → discard; fails `validate` →
discard (`src/shared/storage/store.ts:122-192`). Envelope detection keys on the presence of
**both** `data` and `ts`, deliberately not on `v`
(`src/shared/storage/store.ts:146-150`).

### 5.4 Viewport-relative normalisation on read

`loadColumnWidths` clamps every restored width
(`src/components/data-explorer/storage/grid-storage.ts:80-88`):

```
screenWidth = window.innerWidth
final[col]  = Math.max(50, Math.min(data.w, screenWidth * 0.85))
```

Entries whose `w` is not a number are skipped (`:86`). The clamp is against the **window**
width, not the grid container width. `saveColumnWidths` performs **no** clamp — it persists
the raw width plus a ratio `{ w: width, r: width / screenWidth }`
(`src/components/data-explorer/storage/grid-storage.ts:108-111`).

### 5.5 LRU cap and eviction

`manageLRUCache(newKey)` runs **before** every width write
(`src/components/data-explorer/storage/grid-storage.ts:113-115`, `:124-147`):

1. Read `sw-grid-cache-index`, defaulting to `[]` and resetting to `[]` if not an array (`:126-131`).
2. Move `newKey` to the end — `filter(k => k !== newKey)` then `push(newKey)` (`:134-135`).
3. `while (registry.length > 50) { localStorage.removeItem(registry.shift()) }` (`:138-141`).
4. Write the registry back (`:143`).
5. Whole body wrapped in `try/catch` — a corrupt registry only costs eviction accuracy (`:125`, `:144-146`).

`saveColumnWidths` also wraps `manageLRUCache` + `write` in a `try/catch` for
`QuotaExceededError` (`src/components/data-explorer/storage/grid-storage.ts:116-118`).

**Only width keys ever enter the LRU index.** `saveHiddenColumns` calls `registerKey` but
never `manageLRUCache` (`src/components/data-explorer/storage/grid-storage.ts:168-182`),
so hidden-column keys are never evicted by the 50-table cap.

`registerKey(key, 'data-explorer')` is called for the width key
(`src/components/data-explorer/storage/grid-storage.ts:106`), the hidden-columns key
(`:176`) and both preference keys (`src/components/data-explorer/storage/explorer-preferences.ts:65`,
`:105`), feeding the logout sweep `clearRegistered`
(`src/shared/storage/registry.ts:47-58`).

### 5.6 Read/write API surface

| Export | Signature | Behaviour | Citation |
| --- | --- | --- | --- |
| `loadColumnWidths` | `(connectionId, schemaName, tableName) => Record<string, number>` | SSR guard returns `{}`; viewport re-clamp; non-numeric entries dropped | `src/components/data-explorer/storage/grid-storage.ts:70-91` |
| `saveColumnWidths` | `(connectionId, schemaName, tableName, widths: Record<string, number>) => void` | SSR guard; `registerKey`; writes `{ cols }`; LRU + quota-guarded | `src/components/data-explorer/storage/grid-storage.ts:96-119` |
| `loadHiddenColumns` | `(connectionId, schemaName, tableName) => Set<string>` | SSR guard **plus** `!connectionId \|\| !tableName` guard → empty `Set`; filters non-strings | `src/components/data-explorer/storage/grid-storage.ts:158-166` |
| `saveHiddenColumns` | `(connectionId, schemaName, tableName, hiddenColumns: Set<string>) => void` | Empty set ⇒ `localStorage.removeItem(key)`; otherwise writes the array | `src/components/data-explorer/storage/grid-storage.ts:168-182` |
| `ColumnEntry` (type) | `{ w: number; r: number }` | `r` documented as viewport-relative width | `src/components/data-explorer/storage/grid-storage.ts:24-28` |

`loadColumnWidths` has **no** `!connectionId` guard, unlike `loadHiddenColumns`
(`src/components/data-explorer/storage/grid-storage.ts:75` vs `:163`). In practice the grid
only mounts with a truthy `connectionId`
(`src/components/data-explorer/DataExplorerLayout.tsx:670`).

Call sites in the grid: initialisers
(`src/components/data-explorer/TableGrid.tsx:73-79`), reset-on-table-change
(`:142`, `:145`), debounced writes (`:333`, `:347`), immediate writes for visibility toggles
(`:427`, `:435`, `:444`).

### 5.7 Query-cache persistence (separate, for completeness)

The *row data itself* is deliberately **not** persisted. `shouldPersistQuery` excludes the
`'rows'` segment (`src/lib/persist.ts:47-51`, `:107-114`). What is persisted to IndexedDB
db `sw-explorer-query-cache`, store `queries`, buster `v1`, maxAge `24 * 60 * 60 * 1000`
(24 h), prefix `sw-explorer-query`, `refetchOnRestore: true`
(`src/lib/persist.ts:13-16`, `:61-90`).

---

## 6. `explorer-preferences.ts` — persisted preferences

| # | Preference | Storage key | Type | Default | TTL | Citation |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Last viewed table | `sw-explorer-last-table` | `{ connectionId, schemaName, tableName }` \| `null` | `null` | 30 days (`30 * 24 * 60 * 60 * 1000`) | key `src/components/data-explorer/storage/explorer-preferences.ts:19`; TTL `:18`, `:38`; fallback `:39`; shape `:23-27` |
| 2 | Rows per page | `sw-explorer-page-size` | `number`, must be one of `EXPLORER_PAGE_SIZES` | `500` | **none** (no `ttlMs`) | key `:20`; options `:81`; default `:82`; store `:87-103` |

Envelopes: both `version: 1` (`src/components/data-explorer/storage/explorer-preferences.ts:17`,
`:37`, `:89`).

Validators:
- `isLastViewedTable` requires all three fields to be `string`; `null` is also accepted
  (`src/components/data-explorer/storage/explorer-preferences.ts:29-33`, `:40`).
- `isAllowedPageSize` requires membership in `[100, 250, 500, 1000, 2000]`
  (`src/components/data-explorer/storage/explorer-preferences.ts:84-85`, `:91`).

Migrations (lossless, `ts` carried across so TTL is not reset):
- last-table: legacy flat `{ v, connectionId, schemaName, tableName, ts }` → envelope
  (`src/components/data-explorer/storage/explorer-preferences.ts:44-62`).
- page-size: legacy **bare decimal string** (`"1000"`) parsed with `parseInt`, rejected
  unless it is an allowed size (`src/components/data-explorer/storage/explorer-preferences.ts:93-102`).

Public API:

| Export | Behaviour | Citation |
| --- | --- | --- |
| `saveLastViewedTable(connectionId, schemaName, tableName)` | SSR guard, then `write` | `src/components/data-explorer/storage/explorer-preferences.ts:67-74` |
| `loadLastViewedTable(): LastViewedTable \| null` | SSR guard returns `null` | `:76-79` |
| `getExplorerPageSize(): number` | SSR guard returns `500` | `:107-112` |
| `setExplorerPageSize(size: number)` | Rejects a value outside `EXPLORER_PAGE_SIZES` **before** writing, leaving the previous preference intact | `:114-119` |
| `EXPLORER_PAGE_SIZES` | `[100, 250, 500, 1000, 2000] as const` | `:81` |
| `DEFAULT_PAGE_SIZE` | `500` | `:82` |

Write call sites: `setExplorerPageSize` from the page-size select
(`src/components/data-explorer/TableGrid.tsx:153`);
`saveLastViewedTable` on table select and on auto-selecting the first table
(`src/components/data-explorer/DataExplorerLayout.tsx:405`, `:457`).
Restore path: `loadLastViewedTable` is consulted after the table list loads, matched on
`connectionId` **and** `schemaName`, then on a table-name hit; otherwise the first table of
the schema is auto-selected (`src/components/data-explorer/DataExplorerLayout.tsx:435-459`).

---

## 7. Sticky Header, Scrolling, Row Rendering, Row Number

**Scroll container.** A single `div` with `ref={scrollRef}`, classes
`flex-1 overflow-auto scrollbar-thin transition-opacity duration-150`
(`src/components/data-explorer/TableGrid.tsx:761-767`). While a server-side filter is being
applied it gets `opacity-60 pointer-events-none`
(`src/components/data-explorer/TableGrid.tsx:764-766`).

**Sticky header.** `<thead className="sticky top-0 z-20 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">`
with `<tr className="bg-muted border-b border-border">`
(`src/components/data-explorer/TableGrid.tsx:785-786`). Vertical stickiness only — there is
no `sticky left-*` on any header cell, so **the row-number column scrolls horizontally out
of view**.

**Row-number column.**

| Element | Geometry | Citation |
| --- | --- | --- |
| Header `<th>` | `w-10 min-w-[40px] max-w-[40px] px-2 py-1.5 text-[11px] text-center` + inline `style={{ width: 40 }}` | `src/components/data-explorer/TableGrid.tsx:787` |
| Body `<td>` | `w-10 min-w-[40px] max-w-[40px] px-2 py-[6px] text-[11px] tabular-nums` + inline `style={{ width: 40 }}` | `src/components/data-explorer/grid/GridRow.tsx:87-90` |
| Value | `rowNum = virtualRow.index + 1` | `src/components/data-explorer/TableGrid.tsx:809` |
| Key | `virtualRow.key` (default key extractor = index) | `src/components/data-explorer/TableGrid.tsx:813`, `node_modules/@tanstack/virtual-core/dist/esm/index.js:18` |

`rowNum` is the 1-based index **within the currently retained `displayedRows` array**, not
an absolute table row index — see §2.7.

**Row rendering.** One `<tr>` per virtual item
(`src/components/data-explorer/TableGrid.tsx:807-826`). Zebra striping by
`rowIndex % 2 === 0 ? bg-background : bg-muted/20`, plus `hover:bg-accent/50`
(`src/components/data-explorer/grid/GridRow.tsx:81-85`).

**Cell value formatting** (`src/components/data-explorer/grid/GridRow.tsx:11-24`):

| Input | Rendered as | Citation |
| --- | --- | --- |
| `null` | italic muted `NULL` span | `src/components/data-explorer/grid/GridRow.tsx:122-123` |
| `undefined` | `''` | `src/components/data-explorer/grid/GridRow.tsx:13` |
| `boolean` | green/red pill, `String(value)` | `:124-132` |
| `Date` | `value.toISOString()` | `:15` |
| other objects | `JSON.stringify`, fallback `'[Object]'` | `:16-22` |
| everything else | `String(value)` | `:23` |

**Expandability heuristic** gating the hover preview and the inspector button:
`value != null && (formattedText.length > 18 || formattedText.includes('\n'))`
(`src/components/data-explorer/grid/GridRow.tsx:98-101`).

**Filler cells.** One trailing `<th>` in the header row
(`src/components/data-explorer/TableGrid.tsx:803`) and one trailing `<td>` per body row
(`src/components/data-explorer/grid/GridRow.tsx:183`), both `min-w-0`, the `<td>` also
`pointer-events-none`. These absorb the space left by `width: 100%` + `minWidth: max-content`.

**Column header cell internals** (`src/components/data-explorer/grid/ColumnHeader.tsx:84-128`):
PK `Key` icon amber, FK `Link2` icon blue (FK icon hidden when the column is also PK, `:89`);
column name `shrink-0 whitespace-nowrap` so it is never squeezed (`:94-96`); type badge
`font-mono truncate min-w-0 flex-shrink` (`:99-104`); FK target hint `→ {table}` revealed on
group hover (`:107-111`); sort button at `ml-auto`, hidden until group hover (`:114-127`).
Sort cycle is 3-state — `asc → desc → none` — via `onSort(column.name, 'asc')` /
`onSort(column.name, 'desc')` / `onSort(null, 'asc')` (`src/components/data-explorer/grid/ColumnHeader.tsx:31-36`),
handled by `handleSort` (`src/components/data-explorer/TableGrid.tsx:288-291`).

**Header profile tooltip** is built from the pg_stats query and rendered as the `<th>`
`title` (`src/components/data-explorer/grid/ColumnHeader.tsx:82`, `:142-158`): filled
percentage from `nullPercent`, distinct count, min–max range, top 3 values, and an
"approximate values from Postgres statistics" suffix when `profile.approx`
(`:143-157`). It is suppressed entirely when `profile` is missing or
`profile.nullPercent == null` (`:143`).

---

## 8. Loading, Empty and Error States

| State | Trigger | Rendered output | Citation |
| --- | --- | --- | --- |
| Initial skeleton | `isLoading && allRows.length === 0` | Header strip with **5** `Skeleton h-4 w-24` bars; body with **14** skeleton rows, each = one `w-8` row-number skeleton + **5** `w-24` cell skeletons | `src/components/data-explorer/TableGrid.tsx:580-599` (`:584`, `:589`, `:591-594`) |
| Full-page error | `error && allRows.length === 0` | `X` icon in a destructive circle, `getExplorerErrorTitle`, `getExplorerErrorMessage`, optional `getExplorerErrorHint` in a muted box, `Retry` button calling `refetch()` | `src/components/data-explorer/TableGrid.tsx:603-629` |
| Filtered-to-zero | `displayedRows.length === 0 && filters.length > 0` | `Table2` icon, "No rows match your filters", `Clear filters` link button calling `handleFiltersChange([])` | `src/components/data-explorer/TableGrid.tsx:768-775` |
| Empty table | `displayedRows.length === 0 && filters.length === 0` | `Table2` icon, "This table is empty" | `src/components/data-explorer/TableGrid.tsx:776-781` |
| Server filter in flight | `isApplyingFilter = isFetching && !isFetchingNextPage && filters.length > 0 && !isFilteringInMemory` | 2 px `h-[2px]` indeterminate `animate-pulse` bar pinned `top-0 z-30` + "Applying filter..." spinner + `opacity-60 pointer-events-none` scroll container | `src/components/data-explorer/TableGrid.tsx:210`, `:634-638`, `:729-734`, `:764-766` |
| Next page in flight | `isFetchingNextPage` | "Loading..." spinner in the portaled toolbar | `src/components/data-explorer/TableGrid.tsx:735-740` |
| Manual refresh | `isManualRefreshing` | `RotateCw` spins, button disabled; cleared after a fixed 600 ms | `src/components/data-explorer/TableGrid.tsx:709-717`, `:375-377` |

Both error and loading branches are early returns placed **after** every hook
(`src/components/data-explorer/TableGrid.tsx:580`, `:603` vs the last hook at `:584`/`:572`),
so hook order is stable — the same invariant is explicitly annotated in `GridRow`
(`src/components/data-explorer/grid/GridRow.tsx:66-68`).

Row-count footer string has four variants: filters active → "Showing {displayedRows} of
{allRows} rows"; no filters and `allRows >= estimatedTotal` → "{allRows} rows"; partial →
"Showing {allRows} of ~{formatCount(estimatedTotal)} rows"; `estimatedTotal === 0` →
"{allRows} rows" (`src/components/data-explorer/TableGrid.tsx:741-753`).

`EmptyState.tsx` is **not** rendered by `TableGrid`; it is the sibling branch of the layout
when `!(selectedTable && connectionId)`
(`src/components/data-explorer/DataExplorerLayout.tsx:681-688`).

---

## 9. Schema + Table Sidebar

### 9.1 SchemaSelector

Rendered only when `connectionId` is truthy (`src/components/data-explorer/DataExplorerLayout.tsx:553-562`).
Source list: `schemasData?.schemas || [{ name: 'public', tableCount: 0 }]`
(`src/components/data-explorer/DataExplorerLayout.tsx:376`).

| Property | Value | Citation |
| --- | --- | --- |
| Control | Radix `Select`, `Layers` icon prefix, trigger `h-7 text-xs flex-1`, placeholder `"Select schema"` | `src/components/data-explorer/sidebar/SchemaSelector.tsx:6-12`, `:32`, `:34-36` |
| Options | one `SelectItem` per schema, `key`/`value` = `schema.name`, label = `schema.name` only | `src/components/data-explorer/sidebar/SchemaSelector.tsx:38-42` |
| Disabled | `disabled \|\| isLoading` | `src/components/data-explorer/sidebar/SchemaSelector.tsx:33` |
| Default value | `'public'` | `src/components/data-explorer/DataExplorerLayout.tsx:158` |
| On change | `handleSchemaChange` → set schema, clear selected table, notify parent | `src/components/data-explorer/DataExplorerLayout.tsx:397-401` |
| Reset on connection change | schema returns to `'public'`, selected table cleared | `src/components/data-explorer/DataExplorerLayout.tsx:425-429` |
| Query | `useSchemas`, `staleTime: 60_000`, `retry: 2`, `retryDelay: min(1000 * 2 ** attempt, 5000)`, `refetchOnReconnect: true` | `src/components/data-explorer/api/hooks.ts:37-47` |
| Endpoint | `GET /api/data/{connectionId}/schemas` | `src/components/data-explorer/api/api.ts:49-52` |

`SchemaInfo.tableCount` (`src/components/data-explorer/api/types.ts:7-10`) is carried through
the selector but **never rendered**.

### 9.2 TableSidebar

`memo`-wrapped (`src/components/data-explorer/TableSidebar.tsx:31`).

| Concern | Behaviour | Citation |
| --- | --- | --- |
| Row estimate | `formatCompactNumber(table.estimatedRows)`, rendered only when `estimatedRows >= 0` | `src/components/data-explorer/TableSidebar.tsx:187-194`; formatter `src/shared/lib/format.ts:128-132` |
| Size | `table.sizeFormatted` appears **only in the `title` tooltip**, never as visible text | `src/components/data-explorer/TableSidebar.tsx:157` |
| PK warning | amber `AlertTriangle w-3 h-3` with `title="No primary key"` when `!table.hasPrimaryKey`, plus a `" · No PK"` suffix in the row tooltip | `src/components/data-explorer/TableSidebar.tsx:170-174`, `:157` |
| Full tooltip | `` `${name} · ${sizeFormatted \|\| 'unknown size'} · ~${formatCompactNumber(estimatedRows)} rows${hasPrimaryKey ? '' : ' · No PK'}` `` | `src/components/data-explorer/TableSidebar.tsx:157` |
| Selection | `selectedTable?.name === table.name && selectedTable?.schema === table.schema`; selected row gets `bg-primary/10` + `border-l-2 border-primary` | `src/components/data-explorer/TableSidebar.tsx:150`, `:161-163` |
| List key | `` `${table.schema}.${table.name}` `` | `src/components/data-explorer/TableSidebar.tsx:153` |
| Search | uncontrolled-free `Input`, `state` `searchTerm` (`src/components/data-explorer/TableSidebar.tsx:42`); filter is `t.name.toLowerCase().includes(searchTerm.toLowerCase())` — case-insensitive substring on **name only**, computed inline on every render, **not memoised** | `src/components/data-explorer/TableSidebar.tsx:44-46`, `:116-121` |
| Count badge | `{searchTerm ? `${filtered}/${tables.length}` : tables.length}` in `font-mono tabular-nums` | `src/components/data-explorer/TableSidebar.tsx:132-134` |
| Clear button | `X` icon, only when `searchTerm` is non-empty | `src/components/data-explorer/TableSidebar.tsx:123-131` |
| No-match | `No match for "{searchTerm}"` panel replacing the list | `src/components/data-explorer/TableSidebar.tsx:139-145` |
| Hover/focus prefetch | `onMouseEnter` **and** `onFocus` call `onPrefetchTable?.(table)` | `src/components/data-explorer/TableSidebar.tsx:155-156` |
| Prefetch payload | `prefetchTableRows(connectionId, table.name, { schemaName, limit: getExplorerPageSize() })` | `src/components/data-explorer/DataExplorerLayout.tsx:366-372` |
| AI shortcut | `<img src="/resona.png" className="w-3.5 h-3.5">`, `opacity-0 group-hover:opacity-100 hover:scale-110`, `onClick` with `stopPropagation` → `onOpenAIForTable(table.name)`, title `` `Ask AI about ${table.name}` ``; rendered only when `onOpenAIForTable` is provided | `src/components/data-explorer/TableSidebar.tsx:178-186` |
| Sidebar states | loading = **8** skeleton rows (`:48-60`); error = message + hint + "Try again" via `onRetry` (`:62-91`); `!hasConnection` = "Select a connection" (`:93-99`); `tables.length === 0` = "No tables found" (`:101-108`) | `src/components/data-explorer/TableSidebar.tsx` as cited |
| Sidebar width | `w-64` expanded, `w-12` collapsed, `transition-all duration-300` | `src/components/data-explorer/DataExplorerLayout.tsx:464-468` |

Table list query: `useTableList`, `staleTime: 30_000`, `retry: 2`,
`retryDelay: min(1000 * 2 ** attempt, 5000)`, `refetchOnReconnect: true`
(`src/components/data-explorer/api/hooks.ts:53-63`), endpoint
`GET /api/data/{connectionId}/tables?schemaName=…`
(`src/components/data-explorer/api/api.ts:57-64`).

---

## 10. Performance Guards

**Memoisation in `TableGrid`:**

| Memo | Deps | Citation |
| --- | --- | --- |
| `profilesByName` | `[profilesData]` | `src/components/data-explorer/TableGrid.tsx:127-130` |
| `allRows` (page flatten) | `[data]` | `:180-182` |
| `estimatedTotal` | `[data, tableInfo.estimatedRows, allRows.length]` | `:184-192` |
| `isFullTableInMemory` | `[hasNextPage, estimatedTotal, allRows.length]` | `:195-197` |
| `displayedRows` (in-memory filter) | `[allRows, isFilteringInMemory, filters]` | `:202-207` |
| `columns` | `[data]` | `:212-214` |
| `visibleColumns` | `[columns, hiddenColumns]` | `:216-218` |
| `gridExportContext` | `[filters, sortColumn, sortDirection, visibleColumns, columns, displayedRows.length]` | `:240-247` |
| `defaultWidths` (sizing engine) | `[columns, firstPageRows]` | `:449-495` |
| `resolvedWidths` (flat width lookup) | `[visibleColumns, getWidthForColumn]` | `:508-514` |

`useCallback` for `handlePageSizeChange`, `handleNavigateInspectorRow`,
`handleColumnClick`, `handleSort`, `handleFiltersChange`, `handleAddFilter`,
`handleRemoveFilter`, `handleFilterFromStats`, `handleColumnResize`,
`handleResetColumnWidth`, `handleRefresh`, `handleCopyCell`, `handleCopyFetchedData`,
`toggleColumnVisibility`, `handleShowAllColumns`, `handleHideAllExceptPK`,
`handleCellDoubleClick`, `handleCellMouseEnter`, `handleCellMouseLeave`
(`src/components/data-explorer/TableGrid.tsx:151`, `:221`, `:284`, `:288`, `:293`, `:298`,
`:303`, `:312`, `:324`, `:340`, `:354`, `:381`, `:390`, `:422`, `:432`, `:438`, `:517`,
`:536`, `:569`).

**Row-level memoisation.** `GridRow` is `React.memo` with a custom comparator comparing
`virtualRow.key`, `virtualRow.start`, `virtualRow.size`, `row` identity, `rowIndex`,
`visibleColumns` identity and `resolvedWidths` identity — handler props are deliberately
excluded because they are stable `useCallback`s
(`src/components/data-explorer/grid/GridRow.tsx:43`, `:186-196`).

**Localised cell state.** Per-row `localCopiedCell` keyed by `` `${rowIndex}-${column.name}` ``
keeps the copy indicator out of `TableGrid`'s state; the flag auto-clears after **1500 ms**
(`src/components/data-explorer/grid/GridRow.tsx:55-64`, `:94`, `:96`, `:173-178`).
The comment states the intent explicitly: "prevents parent TableGrid from re-rendering"
(`src/components/data-explorer/grid/GridRow.tsx:55`).

**Scroll-freeze.** A scroll handler sets `isScrollingRef`, clears the pending hover-open
timer, dismisses any visible hover card, and arms a **150 ms** debounce to clear the flag;
hover previews are suppressed while the flag is set (`src/components/data-explorer/TableGrid.tsx:96-123`,
`:110`, `:551`, `:555`). Registered with `{ passive: true }` on both the scroll element and
`window` (`:114-115`), with cleanup removing both listeners and all three timers
(`:116-122`). `hoveredCellRef` mirrors state so the passive listener can read it without
re-subscribing (`:87-88`).

**Canvas context reuse.** `measureTextWidth` shares one `CanvasRenderingContext2D` across the
module instead of creating a canvas per measurement
(`src/lib/utils.ts:12-19`).

**Width-lookup precomputation.** The header comment cites this explicitly: "Precompute width
lookup dictionary to eliminate repeated inline lookups"
(`src/components/data-explorer/TableGrid.tsx:507`).

**Query-level.** `staleTime: 60_000` and `gcTime: 30 * 60_000` keep revisiting a table
instant (`src/components/data-explorer/api/hooks.ts:84-85`); `placeholderData` avoids a
white flash on sort/filter/page-size changes within the same table
(`src/components/data-explorer/api/hooks.ts:86-91`).

**Not present.** No `useDeferredValue`, no `startTransition`, no rAF batching, and no
`useSyncExternalStore` anywhere in `TableGrid.tsx`. The fetch `params` object is rebuilt on
every render (`src/components/data-explorer/TableGrid.tsx:170-176`) — harmless because
`hashKey` sorts plain-object keys and `JSON.stringify` drops `undefined` members
(`node_modules/@tanstack/query-core/build/legacy/utils.js:87-95`).

---

## 11. Data Contract (`src/components/data-explorer/api/types.ts`)

### 11.1 Schema list

| Type | Field | Type | Line |
| --- | --- | --- | --- |
| `SchemaInfo` | `name` | `string` | `:8` |
| | `tableCount` | `number` | `:9` |
| `SchemaListResponse` | `schemas` | `SchemaInfo[]` | `:13` |

### 11.2 Table list

| Type | Field | Type | Line |
| --- | --- | --- | --- |
| `TableInfo` | `name` | `string` | `:19` |
| | `schema` | `string` | `:20` |
| | `estimatedRows` | `number` | `:21` |
| | `sizeBytes` | `number` | `:22` |
| | `sizeFormatted` | `string` | `:23` |
| | `hasIndexes` | `boolean` | `:24` |
| | `indexCount` | `number` | `:25` |
| | `lastVacuum` | `string \| null` | `:26` |
| | `deadTuples` | `number` | `:27` |
| | `liveTuples` | `number` | `:28` |
| | `deadTuplePercent` | `number` | `:29` |
| | `hasPrimaryKey` | `boolean` | `:30` |
| `TableListResponse` | `tables` | `TableInfo[]` | `:34` |
| | `schemaName` | `string` | `:35` |

### 11.3 Column descriptor + rows

| Type | Field | Type | Line |
| --- | --- | --- | --- |
| `ColumnInfo` | `name` | `string` | `:41` |
| | `type` | `string` | `:42` |
| | `nullable` | `boolean` | `:43` |
| | `isPrimaryKey` | `boolean` | `:44` |
| | `isForeignKey` | `boolean` | `:45` |
| | `isIndexed` | `boolean` | `:46` |
| | `fkReference?` | `{ table: string; columns: string[] }` (composite-FK ready) | `:47-50` |
| `PaginationInfo` | `hasMore` | `boolean` | `:54` |
| | `nextCursor` | `string \| null` | `:55` |
| | `prevCursor` | `string \| null` | `:56` |
| | `estimatedTotal` | `number` | `:57` |
| `TableRowsResponse` | `rows` | `Record<string, any>[]` | `:61` |
| | `columns` | `ColumnInfo[]` | `:62` |
| | `pagination` | `PaginationInfo` | `:63` |
| | `orderColumns` | `string[]` | `:64` |
| | `orderDirection` | `'asc' \| 'desc'` | `:65` |

Row objects are untyped `Record<string, any>` keyed by **column name**; the grid reads cells
as `row[column.name]` (`src/components/data-explorer/grid/GridRow.tsx:95`).

### 11.4 Filters

| Type | Field | Type | Line |
| --- | --- | --- | --- |
| `FilterOperator` | `'eq' \| 'neq' \| 'gt' \| 'gte' \| 'lt' \| 'lte' \| 'like' \| 'not_like' \| 'starts_with' \| 'ends_with' \| 'is_empty' \| 'is_null' \| 'not_null' \| 'in'` | union of 14 literals | `:68-82` |
| `FilterCondition` | `column` | `string` | `:85` |
| | `operator` | `FilterOperator` | `:86` |
| | `value?` | `any` (optional for `is_null` / `not_null` / `is_empty`) | `:87` |
| `TableRowsParams` | `schemaName?` | `string` | `:91` |
| | `limit?` | `number` | `:92` |
| | `cursor?` | `string` | `:93` |
| | `orderBy?` | `string` | `:94` |
| | `orderDirection?` | `'asc' \| 'desc'` | `:95` |
| | `filters?` | `FilterCondition[]` | `:96` |

Client-side matcher `matchesFilter(row, filter)` implements all 14 operators
(`src/components/data-explorer/api/filter-matcher.ts:8-55`): `is_null` / `not_null` /
`is_empty` short-circuit (`:14-16`), a nullish cell fails every other operator (`:18`),
string comparison is lowercased (`:20-21`), `in` compares via `String(t).trim().toLowerCase()`
and returns `false` for a non-array target (`:48-52`), and an unknown operator returns
`true` (`:53-54`). Multiple filters are AND-ed
(`src/components/data-explorer/TableGrid.tsx:204`).

### 11.5 Column stats (Section 05 surface, contract recorded here)

| Type | Fields | Line |
| --- | --- | --- |
| `TopValue` | `value: any`, `count: number`, `percent: number` | `:101-105` |
| `Quantiles` | `q25`, `q50`, `q75` (all `any`) | `:107-111` |
| `HistogramBin` | `bucket: number`, `count: number`, `percent: number`, `label?: string` | `:113-118` |
| `ColumnStats` | `name`, `type`, `nullable`, `isPrimaryKey`, `isIndexed`, `nullCount: number \| null`, `nullPercent: number \| null`, `distinctCount: number \| null`, `minValue: any`, `maxValue: any`, `avgValue: number \| null`, `stdDevValue: number \| null`, `quantiles: Quantiles \| null`, `histogram?: HistogramBin[]`, `approx: boolean`, `sampleValues: any[]`, `topValues?: TopValue[]` | `:120-139` |
| `ColumnStatsResponse` | `columns: ColumnStats[]`, `totalRows: number`, `sizeBytes: number`, `statsCollectedAt: string` | `:141-146` |

`mode=pg_stats` selects the cheap whole-table profile used for header tooltips
(`src/components/data-explorer/api/api.ts:97-111`).

### 11.6 Table schema + export

| Type | Fields | Line |
| --- | --- | --- |
| `TableSchema.columns[]` | `name`, `type`, `nullable`, `position`, `is_pk`, `is_indexed`, `is_fk`, `fk_ref?: { table, columns }` | `:151-160` |
| `TableSchema.primaryKey` | `string[]` | `:161` |
| `TableSchema.indexes[]` | `name`, `columns: string[]`, `isUnique` | `:162-166` |
| `TableSchema.estimatedRows` | `number` | `:167` |
| `ExportScope` | `'view' \| 'table' \| 'database'` | `:172` |
| `ExportFormat` | `'csv' \| 'google_sheets' \| 'excel' \| 'json' \| 'sql' \| 'ndjson'` | `:173` |
| `SchemaExportStatus` | `'running' \| 'done' \| 'error' \| 'cancelled'` | `:174` |
| `ExportParams` | `schemaName?`, `maxRows?`, `format?`, `filters?`, `orderBy?`, `orderDirection?`, `columns?` | `:176-184` |
| `ExportGridContext` | `filters`, `orderBy: string \| null`, `orderDirection`, `visibleColumns: string[]`, `allColumnsCount`, `estimatedTotal`, `tableCount?` | `:187-195` |

`ExportGridContext` is pushed upward by the grid on every change
(`src/components/data-explorer/TableGrid.tsx:240-251`); note its `estimatedTotal` field is
populated with **`displayedRows.length`**, not `estimatedTotal`
(`src/components/data-explorer/TableGrid.tsx:246`).

---

## 12. Correctness Risks and Races

Ordered by severity.

1. **`maxPages: 5` silently renumbers rows and truncates history.**
   `src/components/data-explorer/api/hooks.ts:82`. Once a 6th page arrives the oldest page is
   dropped (`node_modules/@tanstack/query-core/build/legacy/utils.js:218-221`). Because
   `rowNum = virtualRow.index + 1` over the flattened retained array
   (`src/components/data-explorer/TableGrid.tsx:809`, `:180-182`), the `#` column restarts at
   1 mid-scroll and the user cannot scroll back past the trim point. With the default page
   size this happens after 2500 rows (`src/components/data-explorer/storage/explorer-preferences.ts:82`).
   There is no backward pagination to recover (`src/components/data-explorer/api/hooks.ts:74-92`).

2. **No request cancellation on table switch.** `queryFn` never reads `signal`
   (`src/components/data-explorer/api/hooks.ts:76-79`) and `fetchTableRows`/`get` accept no
   `AbortSignal` (`src/components/data-explorer/api/api.ts:69-73`,
   `src/lib/api/client.ts:255-257`), so React Query's `AbortController` is never triggered
   (`node_modules/@tanstack/query-core/build/legacy/query.js:222`, `:278-286`). A slow page-1
   request for the previous table keeps running after the user switches tables. It cannot
   corrupt the new table's data (different cache key), but it wastes a connection and, on a
   connection-limited pool, delays the new request.

3. **The sidebar row prefetch never warms the grid's cache entry.** Prefetch uses
   `queryClient.prefetchQuery({ queryKey: [...rows(connectionId, tableName), params] })`
   (`src/components/data-explorer/api/hooks.ts:182`) with `params = { schemaName, limit }`
   (`src/components/data-explorer/DataExplorerLayout.tsx:368-371`), while the grid's key
   carries `params = { schemaName, orderBy, orderDirection, filters, limit }`
   (`src/components/data-explorer/TableGrid.tsx:170-176`). `hashKey` sorts keys and
   `JSON.stringify` drops `undefined` members
   (`node_modules/@tanstack/query-core/build/legacy/utils.js:87-95`), so
   `{"limit":500,"schemaName":"public"}` ≠
   `{"filters":[],"limit":500,"orderDirection":"asc","schemaName":"public"}`. Hover-prefetching
   therefore issues a request whose result the grid will not read.

4. **Filter/sort/page-size changes show stale rows under a non-blocking overlay.**
   `placeholderData` reuses the previous result whenever connection and table match,
   ignoring `filters`, `orderBy`, `orderDirection`, `limit` and `schemaName`
   (`src/components/data-explorer/api/hooks.ts:86-91`). The overlay only engages when
   `isApplyingFilter` is true, i.e. when `filters.length > 0 && !isFilteringInMemory`
   (`src/components/data-explorer/TableGrid.tsx:210`, `:764-766`). A pure **sort** change, a
   **page-size** change, or a `filterScope === 'loaded'` change therefore paints
   previous-order rows at full opacity and full interactivity with no loading indicator.

5. **`fetchNextPage` can be double-issued.** The trigger effect
   (`src/components/data-explorer/TableGrid.tsx:264-269`) depends on
   `isFetchingNextPage`, which is React state; two renders can occur before it flips, and the
   effect has no in-flight ref of its own.

6. **`handleRefresh` does not invalidate header profiles.** It invalidates `tables`,
   `schemas`, `rows` and `stats` (`src/components/data-explorer/TableGrid.tsx:359-370`) but
   the header-profile key is `[...all, 'header-profiles', …]`
   (`src/components/data-explorer/api/hooks.ts:149`), which matches none of them — column
   tooltips keep showing pre-refresh statistics.

7. **Application-level errors are reported as HTTP 500.** `unwrapResponse` forces
   `status = 500` on `success: false` (`src/components/data-explorer/api/api.ts:37`), so
   `ApiError.isRateLimited` (429) / `isForbidden` (403) predicates can never fire for a
   `{ success: false }` body (`src/lib/api/client.ts:238-248`).

8. **`handleColumnResize` timers are not cleared on unmount.** `saveTimeoutRef` survives
   unmount (`src/components/data-explorer/TableGrid.tsx:322`, `:331-334`, `:345-348`); the
   deferred `saveColumnWidths` still fires with its captured value. Harmless for correctness,
   but it writes to `localStorage` after teardown.

9. **`handleMouseDown` drag listeners are not removed on unmount.** `mousemove`/`mouseup` are
   attached to `document` and only removed inside `handleMouseUp`
   (`src/components/data-explorer/grid/ColumnHeader.tsx:60-61`, `:55-58`); unmounting mid-drag
   leaks them until the next `mouseup`.

10. **Storage keys are not escaped.** `` `${prefix}${connectionId}-${schemaName}-${tableName}` ``
    (`src/components/data-explorer/storage/grid-storage.ts:35`, `:39`) collides for identifiers
    containing `-` (e.g. `public-my_table` vs `public` + `my-table`).

11. **Hidden-column keys are outside the LRU cap.** `saveHiddenColumns` registers the key but
    never calls `manageLRUCache` (`src/components/data-explorer/storage/grid-storage.ts:168-182`
    vs `:113-115`), so those entries are never evicted by the 50-table limit and never expire
    (no `ttlMs`, `:150-156`).

12. **Restored widths are clamped against `window.innerWidth`, not the grid viewport**
    (`src/components/data-explorer/storage/grid-storage.ts:80`, `:87`). In a narrow window
    beside a wide sidebar, a legitimately wide column is silently capped at 85 % of the window.

---

## Dead / Unused Code

| Item | Evidence |
| --- | --- |
| `ColumnEntry.r` — "viewport-relative width" | Written on every save (`src/components/data-explorer/storage/grid-storage.ts:110`) and declared in the type (`:25-28`), but `loadColumnWidths` reads only `data?.w` (`:86-87`). No reader anywhere in `src/`. |
| `usePrefetchColumnStats` | Exported (`src/components/data-explorer/api/hooks.ts:188-196`) and re-exported (`src/components/data-explorer/api/index.ts:55`), but **zero** call sites outside the barrel. (`usePrefetchTableRows` at `src/components/data-explorer/api/hooks.ts:177` *is* used: `src/components/data-explorer/DataExplorerLayout.tsx:182`.) |
| String branch of `estimatedTotal` | `typeof rawTotal === 'string'` with `parseInt` (`src/components/data-explorer/TableGrid.tsx:187-190`) guards a case the contract forbids — `estimatedTotal: number` (`src/components/data-explorer/api/types.ts:57`) and `estimatedRows: number` (`:21`). |
| `TableInfo` fields unused by the explorer UI | `sizeBytes` (`:22`), `hasIndexes` (`:24`), `indexCount` (`:25`), `lastVacuum` (`:26`), `deadTuples` (`:27`), `liveTuples` (`:28`), `deadTuplePercent` (`:29`) — the only `TableInfo` fields read anywhere under `src/components/data-explorer/` are `name`, `schema`, `sizeFormatted`, `hasPrimaryKey`, `estimatedRows` (`src/components/data-explorer/TableSidebar.tsx:150`, `:157`, `:170`, `:187`, `:192`; `src/components/data-explorer/TableGrid.tsx:185`). |
| `tableInfo` prop | Only `tableInfo.estimatedRows` is read (`src/components/data-explorer/TableGrid.tsx:185`, `:192`); the rest of the object is inert. |
| `PaginationInfo.prevCursor` | In the contract (`src/components/data-explorer/api/types.ts:56`), no reader under `src/components/data-explorer/`; no `getPreviousPageParam` / `fetchPreviousPage` exists. |
| `PaginationInfo.hasMore` | `src/components/data-explorer/api/types.ts:54`; the grid derives `hasNextPage` from `nextCursor` instead (`src/components/data-explorer/api/hooks.ts:81`). |
| `TableRowsResponse.orderColumns` / `orderDirection` | `src/components/data-explorer/api/types.ts:64-65`; no reader in the grid (the grid tracks its own `sortColumn` / `sortDirection` state, `src/components/data-explorer/TableGrid.tsx:68-69`). |
| `ColumnInfo.isIndexed` | `src/components/data-explorer/api/types.ts:46`; the grid reads `isPrimaryKey`, `isForeignKey`, `fkReference`, `nullable`, `type`, `name` only. `ColumnStats.isIndexed` (`:125`) *is* read, by `ColumnStatsPanel.tsx:141`. |
| `SchemaInfo.tableCount` | `src/components/data-explorer/api/types.ts:9`; `SchemaSelector` renders `schema.name` alone (`src/components/data-explorer/sidebar/SchemaSelector.tsx:39-41`). |
| `ExportGridContext.tableCount` | Optional field (`src/components/data-explorer/api/types.ts:194`); the grid never sets it (`src/components/data-explorer/TableGrid.tsx:240-247`). |
| `Store.onWrite` option | Declared (`src/shared/storage/store.ts:62`) and invoked (`:198`, `:206`), but no `createStore` call site in the explorer passes it (`src/components/data-explorer/storage/grid-storage.ts:48-65`, `:149-156`; `src/components/data-explorer/storage/explorer-preferences.ts:35-63`, `:87-103`). |
| `Store.clear()` | Declared (`src/shared/storage/store.ts:69`, `:204-207`); no caller in the explorer storage modules. |
| `registeredStoreKeys()` | `src/shared/storage/store.ts:92-94`; referenced only by its own unit test (`src/shared/storage/__tests__/store.test.ts:9`, `:170`). |
| `measureTextWidth` `* 8.5` fallback | `src/components/data-explorer/TableGrid.tsx:456`; unreachable for any non-empty string because `measureTextWidth` already falls back to `length * 8` (`src/lib/utils.ts:26`). |
| `GridRowProps.virtualRow` sub-type | Declares only `{ key, size, start }` (`src/components/data-explorer/grid/GridRow.tsx:30-34`) while the full `VirtualItem` (incl. `index`, `end`, `lane`) is passed (`src/components/data-explorer/TableGrid.tsx:813-817`); `virtualRow.key` is also redundantly re-applied as the React `key` on the `<tr>` (`src/components/data-explorer/grid/GridRow.tsx:72`). |
| File-header claim "zero dead code" | `src/components/data-explorer/TableGrid.tsx:3` — contradicted by the entries above. |

---

## Open Questions

UNVERIFIED: What does the backend do with the `cursor` value — is it a Postgres keyset `(column, value)` tuple, an offset encoded as a string, or an opaque server-side token? The frontend only forwards it verbatim (`src/components/data-explorer/api/api.ts:78`), so its semantics are not determinable from this repository.

UNVERIFIED: What page size does the backend cap `limit` at? `fetchTableRows` forwards `limit` unchanged (`src/components/data-explorer/api/api.ts:77`) and the largest selectable option is 2000 (`src/components/data-explorer/storage/explorer-preferences.ts:81`); no client-side clamp exists and the server code is not in this repo.

UNVERIFIED: Does the backend populate `pagination.prevCursor` and `pagination.hasMore`, and are they ever correct when a filter is active? Nothing on the client reads them.

UNVERIFIED: Are the `filters` JSON values (dates, numbers, booleans, arrays) re-typed correctly server-side? The client `JSON.stringify`s arbitrary user input (`src/components/data-explorer/api/api.ts:82`) with no validation.

UNVERIFIED: What is the actual rendered `<tr>` height at runtime? The virtualizer assumes a flat 33 px (`src/components/data-explorer/TableGrid.tsx:47`, `:257`) with no measurement, and no runtime assertion exists that the absolutely-positioned row plus its `overflow-hidden` cells actually resolve to exactly 33 px.

UNVERIFIED: Does `measureTextWidth` in this app ever hit its `text.length * 8` fallback (no canvas), and is the `Inter` font actually loaded at the time widths are computed? Canvas `measureText` falls back to a default font if `Inter` is not yet loaded, and `defaultWidths` is computed in a `useMemo` during the first data render with no font-load await (`src/components/data-explorer/TableGrid.tsx:449-495`, `src/lib/utils.ts:24-29`).

UNVERIFIED: What is the actual height of the scroll viewport `H` in production layout? The DOM-row count formula in §1 depends on it and it is determined by flex CSS outside these files.

UNVERIFIED: Does the tailwind-scrollbar `scrollbar-thin` class change the effective viewport height passed to `observeElementRect`? The virtualizer measures `clientRect` of the scroll element; the scrollbar treatment is not specified in these files.

UNVERIFIED: Is the `sw-grid-cache-index` LRU registry ever seeded with pre-existing keys from before the registry existed? `manageLRUCache` only pushes on write (`src/components/data-explorer/storage/grid-storage.ts:134-135`), so tables written by an older build are never in the index and never evicted — but the migration path that would seed it cannot be confirmed from this repo.

UNVERIFIED: Are column widths meant to be per-viewport? `r: width / screenWidth` is persisted (`src/components/data-explorer/storage/grid-storage.ts:110`) but never read (§ Dead / Unused Code), so no cross-viewport behaviour exists today; the intent behind the field is not recoverable.

UNVERIFIED: What triggers the grid's 600 ms minimum spinner on refresh (`src/components/data-explorer/TableGrid.tsx:375-377`)? There is no comment and no constant, so whether it is a deliberate UX floor or a leftover is not determinable.

UNVERIFIED: `useTableRowsSimple` and `useTableSchema` (`src/components/data-explorer/api/hooks.ts:99-117`, `:160-171`) are consumed only by `src/components/ai/messages/TablePreview.tsx:8-9`. Whether the AI surface is still in scope for this product is a product decision, not a code fact.
