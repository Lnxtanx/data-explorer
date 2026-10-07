---
title: Filtering, Sorting & Column Visibility
section: 4
area: filtering-sorting
sources: 16
status: rough
---

# 04. Filtering, Sorting & Column Visibility

## Component / File Map

| File | Responsibility | ~Lines |
| --- | --- | --- |
| `src/components/data-explorer/grid/GridFilterPopover.tsx` | Add-filter UI: column picker, operator picker, value input, scope checkbox | 254 |
| `src/components/data-explorer/grid/GridFilterChips.tsx` | Active-filter chip strip, per-chip X, "Clear" | 69 |
| `src/components/data-explorer/grid/GridColumnsPopover.tsx` | Column visibility list, column search, Show all / Hide except PK | 115 |
| `src/components/data-explorer/grid/ColumnHeader.tsx` | Sort button + 3-state cycle (sort affordance only in this section) | 158 |
| `src/components/data-explorer/api/filter-matcher.ts` | In-memory row predicate `matchesFilter` | 56 |
| `src/components/data-explorer/api/api.ts` | `fetchTableRows` query-string construction; `exportPath` filter/sort/projection params | 292 |
| `src/components/data-explorer/api/hooks.ts` | `useTableRows` (infinite), `useTableRowsSimple`, query keys, staleTime/gcTime | 197 |
| `src/components/data-explorer/api/types.ts` | `FilterOperator`, `FilterCondition`, `TableRowsParams`, `ExportParams`, `ExportGridContext` | 195 |
| `src/components/data-explorer/api/data-profiling.ts` | `detectSemanticType` — name/type/sample heuristic; no network | 73 |
| `src/components/data-explorer/api/errors.ts` | `EXPLORER_ERROR_CATALOG` + 3 message/hint/title resolvers | 209 |
| `src/components/data-explorer/api/index.ts` | Barrel re-export of the above | 64 |
| `src/components/data-explorer/api/__tests__/explorerErrorsAndFilters.test.ts` | Characterization tests for `matchesFilter` + error resolvers | 156 |
| `src/components/data-explorer/TableGrid.tsx` | **Owner of all filter/sort/column state.** Cited throughout below (not a Section 03 duplication — only state ownership and the filter/sort callbacks are covered) | 879 |
| `src/components/data-explorer/storage/grid-storage.ts` | `loadHiddenColumns` / `saveHiddenColumns` (localStorage persistence) | 182 |
| `src/shared/storage/store.ts` | Versioned envelope store; TTL semantics for the above | 212 |
| `src/lib/api/client.ts` | `ApiError` construction (`code` / `hint` / `status`) consumed by `errors.ts` | 276 |
| `src/components/data-explorer/storage/explorer-preferences.ts` | `EXPLORER_PAGE_SIZES`, page-size store (pagination interaction) | 120 |
| `backend/services/sw-data-explorer/query-builder.service.js` | Server-side SQL generation for filters + ORDER BY (cited for proof only) | 551 |
| `backend/routes/data-explorer/data.routes.js` | `GET .../rows` handler, `parseFilters`, limit clamping (cited for proof only) | 763 |

---

## 1. The filter model

### 1.1 Canonical types

`src/components/data-explorer/api/types.ts:68-82` — the operator union, verbatim:

```ts
export type FilterOperator =
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'like' | 'not_like' | 'starts_with' | 'ends_with'
  | 'is_empty' | 'is_null' | 'not_null'
  | 'in';
```

`src/components/data-explorer/api/types.ts:84-88`:

```ts
export interface FilterCondition {
  column: string;
  operator: FilterOperator;
  value?: any; // Optional for is_null/not_null/is_empty
}
```

`src/components/data-explorer/api/types.ts:90-97` — request params:

```ts
export interface TableRowsParams {
  schemaName?: string;
  limit?: number;
  cursor?: string;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
  filters?: FilterCondition[];
}
```

There are exactly **14** operator literals in the union (`types.ts:69-82`). The server whitelists the same 14 (`backend/services/sw-data-explorer/query-builder.service.js:18-20`). No other operator literal exists in the frontend codebase — grep for operator-shaped strings returns only `types.ts`, `filter-matcher.ts`, `GridFilterPopover.tsx`, `GridFilterChips.tsx` and the test file.

Note: `value?: any` (`types.ts:87`) — the value is untyped. Coercion happens at filter-construction time, see §3.4.

### 1.2 Column type → operator compatibility

Type classification is **substring matching on `ColumnInfo.type`, first match wins**, `src/components/data-explorer/grid/GridFilterPopover.tsx:15-22`:

| Order | `col.type` matches | Classified as | Line |
| --- | --- | --- | --- |
| 1 | `varchar` OR `text` OR `char` | `text` | `GridFilterPopover.tsx:17` |
| 2 | `int` OR `numeric` OR `decimal` OR `float` OR `double` OR `serial` | `number` | `GridFilterPopover.tsx:18` |
| 3 | `bool` | `boolean` | `GridFilterPopover.tsx:19` |
| 4 | `date` OR `time` OR `timestamp` | `date` | `GridFilterPopover.tsx:20` |
| 5 | (none of the above) | `general` | `GridFilterPopover.tsx:21` |

Base operator lists, `src/components/data-explorer/grid/GridFilterPopover.tsx:24-30`:

```ts
const operatorsByType: Record<string, string[]> = {
  text:     ['like','not_like','starts_with','ends_with','eq','neq','is_empty','is_null','not_null'],
  number:   ['eq','neq','gt','gte','lt','lte','is_null','not_null'],
  boolean:  ['eq','neq','is_null','not_null'],
  date:     ['eq','neq','gt','gte','lt','lte','is_null','not_null'],
  general:  ['eq','neq','like','in','is_null','not_null'],
};
```

**The effective list is NOT `operatorsByType[type]`.** It is the union with `general`, de-duplicated by first occurrence — `GridFilterPopover.tsx:60-67`:

```ts
return [...operatorsByType[getColumnType(col)], ...operatorsByType.general].filter(
  (op, i, arr) => arr.indexOf(op) === i
);
```

Resulting **effective** operator sets (derived mechanically from lines 24-30 + 64-66):

| Column class | Base list (`:25`–`:29`) | `general` adds | **Effective operator list offered in the Select** | Source of the union |
| --- | --- | --- | --- | --- |
| `text` | like, not_like, starts_with, ends_with, eq, neq, is_empty, is_null, not_null | `in` | like, not_like, starts_with, ends_with, eq, neq, is_empty, is_null, not_null, **in** (10) | `GridFilterPopover.tsx:25` + `:29` + `:64` |
| `number` | eq, neq, gt, gte, lt, lte, is_null, not_null | `like`, `in` | eq, neq, gt, gte, lt, lte, is_null, not_null, **like**, **in** (10) | `GridFilterPopover.tsx:26` + `:29` + `:64` |
| `boolean` | eq, neq, is_null, not_null | `like`, `in` | eq, neq, is_null, not_null, **like**, **in** (6) | `GridFilterPopover.tsx:27` + `:29` + `:64` |
| `date` | eq, neq, gt, gte, lt, lte, is_null, not_null | `like`, `in` | eq, neq, gt, gte, lt, lte, is_null, not_null, **like**, **in** (10) | `GridFilterPopover.tsx:28` + `:29` + `:64` |
| `general` | eq, neq, like, in, is_null, not_null | — | eq, neq, like, in, is_null, not_null (6) | `GridFilterPopover.tsx:29` |
| no column chosen yet | — | — | eq, neq, like, in, is_null, not_null (6) — i.e. `general` | `GridFilterPopover.tsx:61` |

Consequences that follow directly from the code:

- `like`, `not_like`, `starts_with`, `ends_with` are offered **only** on `text` columns (`GridFilterPopover.tsx:25`). No other class lists them, and `general` contributes only `like` (`:29`).
- `in` is offered on **every** column class, because `general` is always unioned in (`GridFilterPopover.tsx:64`).
- `like` is offered on `number`, `boolean` and `date` columns even though those base lists exclude it (`GridFilterPopover.tsx:26-28` vs `:29`).
- `is_empty` is offered **only** on `text` (`GridFilterPopover.tsx:25`), yet the server and client matchers implement it generally (`query-builder.service.js:396`, `filter-matcher.ts:16`).
- `gt`/`gte`/`lt`/`lte` are offered on `text`? No — only on `number` and `date` (`GridFilterPopover.tsx:26`, `:28`).
- Any `text`-classified column also matching an earlier rule loses to rule 1. Because rule 1 is checked first, `GridFilterPopover.tsx:17` wins over `:18`–`:20` for any type containing `char`.

Classification edge cases derivable from the substring list, no inference:

- `interval` contains `int` → classified `number` (`GridFilterPopover.tsx:18`).
- `uuid`, `json`, `jsonb`, `money`, `bytea`, `point` → no substring match → `general` (`GridFilterPopover.tsx:21`).
- `timestamp without time zone` contains `time` → `date` (`GridFilterPopover.tsx:20`); it contains no `char`/`int`, so rule 1 does not pre-empt it.
- `character varying(255)` contains `char` → `text` (`GridFilterPopover.tsx:17`).

### 1.3 Operator display labels

Two independent label maps exist and they are **not** identical:

Popover dropdown (`GridFilterPopover.tsx:172-186`):

| Operator | Label | Line |
| --- | --- | --- |
| `eq` | `= Equals` | `:172` |
| `neq` | `≠ Not equals` | `:173` |
| `gt` | `> Greater than` | `:174` |
| `gte` | `≥ Greater or equal` | `:175` |
| `lt` | `< Less than` | `:176` |
| `lte` | `≤ Less or equal` | `:177` |
| `like` | `~ Contains` | `:178` |
| `not_like` | `!~ Does not contain` | `:179` |
| `starts_with` | `^ Starts with` | `:180` |
| `ends_with` | `$ Ends with` | `:181` |
| `is_empty` | `Is empty (blank or NULL)` | `:182` |
| `is_null` | `IS NULL` | `:183` |
| `not_null` | `NOT NULL` | `:184` |
| `in` | `IN (list)` | `:185` |
| anything else | raw `op` string | `:186` |

Chip labels (`GridFilterChips.tsx:22-36`) use different glyphs for the affix operators:

| Operator | Chip label | Line |
| --- | --- | --- |
| `eq` `neq` `gt` `gte` `lt` `lte` | `=` `≠` `>` `≥` `<` `≤` | `:23-28` |
| `like` | `~` | `:29` |
| `not_like` | `!~` | `:30` |
| `starts_with` | `^=` | `:31` |
| `ends_with` | `$=` | `:32` |
| `is_empty` | `empty` | `:33` |
| `is_null` | `null` | `:34` |
| `not_null` | `not null` | `:35` |
| anything else (e.g. `in`) | raw `op` | `:36` |

So `in` renders as the literal text `in` on a chip (`GridFilterChips.tsx:36`) and as `IN (list)` in the picker (`GridFilterPopover.tsx:185`).

### 1.4 Server-side operator → SQL mapping

Cited to establish parity with the client matcher. `backend/services/sw-data-explorer/query-builder.service.js:384-440`:

| Operator | SQL emitted | Line |
| --- | --- | --- |
| `is_null` | `"col" IS NULL` | `:394` |
| `not_null` | `"col" IS NOT NULL` | `:395` |
| `is_empty` | `("col" IS NULL OR "col"::text = '')` | `:396` |
| `like` | `"col"::text ILIKE $n`, value wrapped as `%value%` when it contains no `%` or `_` | `:398`, `:403-405`, `:412-413` |
| `not_like` | `"col"::text NOT ILIKE $n`, same wrapping | `:412` |
| `starts_with` | `"col"::text ILIKE $n`, value wrapped as `value%` | `:406-407` |
| `ends_with` | `"col"::text ILIKE $n`, value wrapped as `%value` | `:408-409` |
| `in` | `"col" IN ($a, $b, …)` | `:416-427` |
| `eq` `neq` `gt` `gte` `lt` `lte` | `"col" = \| <> \| > \| >= \| < \| <= $n` | `:437-439` |

Server-side validation that rejects client input (`query-builder.service.js`):

- Unknown column → `QueryBuildError("Unknown filter column: …")`, default code `bad_request`, HTTP 400 (`:385-387`, `:24-30`).
- Operator not in `FILTER_OPERATORS` → `"Unsupported filter operator: …"` (`:388-390`).
- `like`/`not_like`/`starts_with`/`ends_with` with a non-string value → `"<op> filter requires a string value"` (`:399-401`).
- `in` with zero values → `"in filter requires at least one value"` (`:418-420`).
- `in` with more than `MAX_FILTER_IN_VALUES = 100` values → `"in filter supports at most 100 values"` (`:11`, `:421-423`).
- Any other operator with `value === undefined || null` → `"<op> filter requires a value"` (`:433-435`).

---

## 2. Where filtering happens — both, and the switch is explicit

**Both server-side and client-side paths exist and are live.** The client does not choose one globally; it branches per-render on a three-valued `filterScope` state.

### 2.1 State and the decision predicate

`src/components/data-explorer/TableGrid.tsx:71`:

```ts
const [filterScope, setFilterScope] = useState<'auto' | 'database' | 'loaded'>('auto');
```

`src/components/data-explorer/TableGrid.tsx:195-199`:

```ts
const isFullTableInMemory = useMemo(() => {
  return !hasNextPage && (estimatedTotal <= allRows.length || estimatedTotal === 0);
}, [hasNextPage, estimatedTotal, allRows.length]);

const isFilteringInMemory = filterScope === 'loaded' || (filterScope === 'auto' && isFullTableInMemory);
```

`isFullTableInMemory` means: no further cursor pages (`!hasNextPage`, `TableGrid.tsx:196`) **and** the estimated total is not larger than the rows already held (`estimatedTotal <= allRows.length`, or the estimate is `0`). `estimatedTotal` comes from `data.pages[0].pagination.estimatedTotal`, falling back to `tableInfo.estimatedRows` and then `allRows.length` (`TableGrid.tsx:184-192`).

### 2.2 The server-side path

Request construction — `src/components/data-explorer/TableGrid.tsx:167-177`:

```ts
} = useTableRows(connectionId, tableName, {
  schemaName,
  orderBy: sortColumn || undefined,
  orderDirection: sortDirection,
  filters: filterScope === 'loaded' ? [] : filters,
  limit,
});
```

`filters` is emptied **only** when `filterScope === 'loaded'` (`TableGrid.tsx:174`). For both `'auto'` and `'database'` the active filters go into the request.

Serialisation — `src/components/data-explorer/api/api.ts:69-89`:

```ts
if (params.orderBy) searchParams.set('orderBy', params.orderBy);          // api.ts:79
if (params.orderDirection) searchParams.set('orderDirection', params.orderDirection); // api.ts:80
if (params.filters && params.filters.length > 0) {
  searchParams.set('filters', JSON.stringify(params.filters));            // api.ts:81-83
}
```

So filters travel as a **JSON-encoded array in a single `filters` query-string parameter** — there is no SQL-building code on the frontend at all (`api.ts:74-83` is the complete construction).

Transport and execution:

- `src/components/data-explorer/api/hooks.ts:69-93` — `useTableRows` is a `useInfiniteQuery` whose `queryKey` embeds the whole `params` object (`hooks.ts:75`), so any filter/sort/scope change is a **new cache key**.
- `hooks.ts:76-79` calls `fetchTableRows` with `cursor: pageParam`; `hooks.ts:81` sets `getNextPageParam: (lastPage) => lastPage.pagination.nextCursor`.
- `src/lib/api/client.ts:255-257` → `get()` → `apiRequest` (`client.ts:182-210`) → `fetch` with `credentials: 'include'`.
- Server: `backend/routes/data-explorer/data.routes.js:111-174` reads `parseFilters(req.query.filters)` (`:116`), clamps `limit` via `sanitizeLimit(req.query.limit, 500, 2000)` (`:119`), and calls `buildRowsSql(...)` (`:125-135`).
- `backend/services/sw-data-explorer/query-builder.service.js:328-331` turns each filter into a positional-parameterised SQL clause; `:373` joins them with `WHERE … AND`; `:379` appends `LIMIT $n`. Identifiers go through `quoteIdent` (`:36-47`, `MAX_IDENTIFIER_LENGTH = 63`, `IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_$]*$/` at `:10`, `:16`); values are always bind parameters (`:5`, `:411`, `:425`, `:438`).
- Filters are **not** type-checked against the column's SQL type anywhere; only the column must exist in the table's column set (`query-builder.service.js:385`).

### 2.3 The client-side path

`src/components/data-explorer/TableGrid.tsx:202-207`:

```ts
const displayedRows = useMemo(() => {
  if (isFilteringInMemory && filters.length > 0) {
    return allRows.filter((row) => filters.every((f) => matchesFilter(row, f)));
  }
  return allRows;
}, [allRows, isFilteringInMemory, filters]);
```

`allRows` is the flattened concatenation of every loaded infinite-query page (`TableGrid.tsx:180-182`).

`matchesFilter` — `src/components/data-explorer/api/filter-matcher.ts:8-55`. Semantics, operator by operator:

| Operator | Client behaviour | Line |
| --- | --- | --- |
| (guard) `!row \|\| !filter.column` | returns `true` — row passes | `:9` |
| `is_null` | `val === null \|\| val === undefined` | `:14` |
| `not_null` | `val !== null && val !== undefined` | `:15` |
| `is_empty` | null/undefined **or** `String(val).trim() === ''` | `:16` |
| (guard) `val == null` for all other ops | returns `false` | `:18` |
| `eq` | numeric compare if `typeof val === 'number'`; boolean compare if `typeof val === 'boolean'` (accepts the string `'true'`); else lowercased string equality | `:24-27` |
| `neq` | mirror of `eq` | `:28-31` |
| `like` | `strVal.includes(strTarget)` | `:32-33` |
| `not_like` | `!strVal.includes(strTarget)` | `:34-35` |
| `starts_with` | `strVal.startsWith(strTarget)` | `:36-37` |
| `ends_with` | `strVal.endsWith(strTarget)` | `:38-39` |
| `gt` `gte` `lt` `lte` | `Number(val)` vs `Number(target)` | `:40-47` |
| `in` | `target.some(t => String(t).trim().toLowerCase() === strVal)`; **returns `false` when `target` is not an array** | `:48-52` |
| unknown operator | `default: return true` — row passes | `:53-54` |

Both sides of every string comparison are lowercased (`:20-21`), objects are `JSON.stringify`'d before matching (`:20`), and `row` is typed `any` (`:8`).

Filters combine with **AND only**: `filters.every(...)` (`TableGrid.tsx:204`). There is no OR / group support anywhere.

### 2.4 The two paths are not equivalent

Both behaviours are asserted by the test suite for the client matcher (`src/components/data-explorer/api/__tests__/explorerErrorsAndFilters.test.ts:91-155`), and the server has its own builder tests (`backend/services/sw-data-explorer/__tests__/query-builder.test.js:193` covers `is_empty`). Divergences that follow from the two implementations:

| Behaviour | Server (`query-builder.service.js`) | Client (`filter-matcher.ts`) |
| --- | --- | --- |
| Case sensitivity of `like`/`starts_with`/`ends_with` | `ILIKE` — case-insensitive (`:412`) | lowercased before compare — case-insensitive (`:20-21`, `:32-39`) |
| `is_empty` on whitespace-only string | `(col IS NULL OR col::text = '')` — a `'   '` row is **not** empty (`:396`) | `String(val).trim() === ''` — a `'   '` row **is** empty (`:16`); asserted at test `:107-110` |
| `like` with a literal `%` or `_` in the value | used as a real SQL wildcard (`:404-405`) | plain substring match; `%` is a literal character (`:33`) |
| `gt`/`lt` on a non-numeric value | Postgres raises; `execution_failed` catalog entry (`errors.ts:107-111`) | `Number(val)` → `NaN` → every comparison is `false` (`:40-47`) |
| Unknown operator literal | rejected with 400 `bad_request` (`:388-390`, `:26`) | row silently passes (`:53-54`); asserted at test `:153-155` |

### 2.5 `filterScope` transitions — and a one-way ratchet

The scope control is a single checkbox, `src/components/data-explorer/grid/GridFilterPopover.tsx:233-245`:

```tsx
{!isFullTableInMemory && (
  <input
    type="checkbox"
    checked={filterScope !== 'loaded'}
    onChange={(e) => onFilterScopeChange(e.target.checked ? 'database' : 'loaded')}
  />
)}
```

- Checked ⇔ `filterScope !== 'loaded'` (`GridFilterPopover.tsx:238`).
- Unchecking sets `'loaded'`; re-checking sets `'database'` (`:239`).
- **Nothing in the codebase ever sets `filterScope` back to `'auto'`.** `setFilterScope` is passed directly as `onFilterScopeChange` (`TableGrid.tsx:652`) and is called from exactly one place, `GridFilterPopover.tsx:239`.
- `filterScope` is **not** reset when the user switches tables. The per-table reset effect (`TableGrid.tsx:138-147`) clears `sortColumn`, `sortDirection`, `filters`, `hiddenColumns`, `selectedColumn`, `copiedDataset`, `columnWidths` — but not `filterScope`. `TableGrid` is not remounted per table (no `key` prop at `DataExplorerLayout.tsx:672-679`), so an explicit `'database'` / `'loaded'` choice persists across table navigation for the lifetime of the mount.
- Because the checkbox is hidden when `isFullTableInMemory` is true (`:233`), a user on a fully-loaded small table cannot see or change the scope; if `filterScope` is `'database'` at that point, `isFilteringInMemory` is `false` (`TableGrid.tsx:199`) and the grid keeps round-tripping to the server.

### 2.6 Scope indicator in the popover header

`GridFilterPopover.tsx:127-133` renders one of two labels:

- `Instant In-Memory` (emerald) when `isFilteringInMemory` is true (`:128-129`).
- `Database Query` (primary) otherwise (`:130-132`).

### 2.7 Loading affordance for the server path

`TableGrid.tsx:210`:

```ts
const isApplyingFilter = isFetching && !isFetchingNextPage && filters.length > 0 && !isFilteringInMemory;
```

When true: a 2px indeterminate bar is drawn at the top of the grid (`TableGrid.tsx:634-638`, class `h-[2px]`), the scroll container gets `opacity-60 pointer-events-none` (`TableGrid.tsx:765`), and a pulsing `Applying filter...` label with a spinner appears in the action bar (`TableGrid.tsx:729-734`).

---

## 3. Filter UI

### 3.1 Opening the popover

Radix `Popover` with local open state — `GridFilterPopover.tsx:51` (`const [open, setOpen] = useState(false)`), `:104` (`<Popover open={open} onOpenChange={setOpen}>`).

Trigger button (`GridFilterPopover.tsx:105-122`): `h-6`, `px-2`, `text-[11px]`, `gap-1`. `variant={activeFilterCount > 0 ? 'default' : 'ghost'}` (`:107`) and, when `activeFilterCount > 0`, `bg-primary text-primary-foreground` (`:111`). `activeFilterCount` is `filters.length` (`TableGrid.tsx:648`).

Count badge (`:116-120`): rendered only when `activeFilterCount > 0`; classes `bg-primary-foreground/20 text-primary-foreground px-1 rounded-full text-[10px] min-w-[14px] text-center`.

Popover panel: `w-72 p-3`, `align="start"` (`:123`).

The component is portalled into the header action bar — `TableGrid.tsx:641-642` renders it through `createPortal(..., portalTarget)`, where `portalTarget` is `document.getElementById('table-actions-portal')` (`TableGrid.tsx:133-135`).

### 3.2 Draft filter state

`GridFilterPopover.tsx:52-56`:

```ts
const [tempFilter, setTempFilter] = useState<{
  column: string;
  operator: FilterCondition['operator'];
  value: string;
}>({ column: '', operator: 'like', value: '' });
```

The draft lives entirely inside `GridFilterPopover`; it is not lifted to `TableGrid` and does not cause `TableGrid` re-renders while typing (stated intent in the file header comment, `GridFilterPopover.tsx:2-3`).

Default operator on reset is `'like'` — both on mount (`:56`) and after every successful add (`:99`).

### 3.3 Column picker

`GridFilterPopover.tsx:137-159`. Radix `Select`, trigger `h-7 text-xs bg-background`, placeholder `"Column"` (`:150`).

- Lists **all** columns passed in — no search, no filtering, no grouping: `columns.map(...)` (`:153-157`).
- Each item renders `name` then the raw type in muted text: `{c.name} <span className="text-muted-foreground">({c.type})</span>` (`:155`). No truncation logic.
- `columns` is `data.pages[0].columns` (`TableGrid.tsx:212-214`) — the column list from the first page's response.
- On selection (`:139-147`), the operator and value are **reset based on the class**: boolean → `{ operator: 'eq', value: 'true' }`; everything else → `{ operator: 'like', value: '' }` (`:142-146`). `isBool` is computed with `getColumnType(col) === 'boolean'` (`:141`).

### 3.4 Operator picker

`GridFilterPopover.tsx:162-190`. Radix `Select`, trigger `h-7 text-xs bg-background`, placeholder `"Operator"` (`:167`).

- The option list is `getFilteredOperators()` (`:170`), recomputed on every render — no memoisation (`GridFilterPopover.tsx:60-67`).
- The `Select`'s `value` is `tempFilter.operator` (`:163`). Changing the operator only spreads the existing draft: `setTempFilter({ ...tempFilter, operator: v })` (`:164`). It does **not** re-validate the already-typed value against the new operator's type.
- Labels per §1.3.

### 3.5 Value input

Rendered only when the operator is not one of `is_null`, `not_null`, `is_empty` — `GridFilterPopover.tsx:193`.

Three variants:

1. **Boolean column** → Radix `Select` with two fixed options `true (TRUE)` / `false (FALSE)` (`GridFilterPopover.tsx:197-208`). Displayed value defaults to `'true'` via `value={tempFilter.value || 'true'}` (`:199`).
2. **Everything else** → `<Input>` (`:211-227`), `h-7 text-xs bg-background`.
3. Otherwise (null operators) → nothing rendered.

Placeholders, keyed by operator (`GridFilterPopover.tsx:215-222`):

| Operator | Placeholder | Line |
| --- | --- | --- |
| `in` | `val1, val2, val3...` | `:216` |
| `starts_with` | `Starts with...` | `:217` |
| `ends_with` | `Ends with...` | `:218` |
| `like` | `Contains text...` | `:219` |
| `not_like` | `Does not contain...` | `:220` |
| any other | `Value...` | `:221` |

`onChange` writes straight to state on every keystroke: `setTempFilter({ ...tempFilter, value: e.target.value })` (`:214`).

`Enter` in the text input calls `handleAdd()` (`:224-226`). The boolean `Select` has no Enter handler.

### 3.6 Validation and add gating

`GridFilterPopover.tsx:69-71`:

```ts
const isValueRequired = !['is_null', 'not_null', 'is_empty'].includes(tempFilter.operator);
const isAddFilterDisabled =
  !tempFilter.column || !tempFilter.operator || (isValueRequired && !String(tempFilter.value).trim());
```

The Add Filter button is `disabled={isAddFilterDisabled}` (`:247`), `w-full h-7 text-xs rounded-lg` (`:247`), icon `Plus` `w-3 h-3 mr-1` (`:248`).

There is **no** per-operator format validation client-side — no numeric range check, no date parse, no email check. `handleAdd` re-checks the same `isAddFilterDisabled` and returns early (`:74`).

### 3.7 Value coercion at add time

`GridFilterPopover.tsx:73-101`, in order:

| Branch | Condition | Result | Line |
| --- | --- | --- | --- |
| 1 | `operator === 'in'` | `value.split(',').map(v => v.trim()).filter(v => v.length > 0)` → **array of strings, no numeric coercion** | `:79-80` |
| 2 | `operator` is `is_null` \| `not_null` \| `is_empty` | `value = undefined` | `:81-86` |
| 3 | `colType === 'boolean'` | `value = (tempFilter.value === 'true')` → real boolean | `:87-88` |
| 4 | `colType === 'number'` | `Number(value)` applied only if `!isNaN(n) && String(value).trim() !== ''`; otherwise the raw string survives | `:89-91` |
| (else) | | raw string | `:78` |

Because branch 1 precedes branch 4, an `in` filter on a numeric column produces an array of **strings**, not numbers.

Then `onAddFilter({ column, operator, value })` (`:94-98`) and the draft resets and the popover closes: `setTempFilter({ column: '', operator: 'like', value: '' })` + `setOpen(false)` (`:99-100`).

### 3.8 Adding, removing, clearing — all in `TableGrid`

| Action | Implementation | Effect on scroll container |
| --- | --- | --- |
| Add | `handleAddFilter` — `setFilters(prev => [...prev, filter])` (`TableGrid.tsx:298-301`) | `scrollRef.current?.scrollTo({ top: 0, left: 0 })` (`:300`) |
| Remove by index | `handleRemoveFilter` — copies the array and `next.splice(index, 1)` (`TableGrid.tsx:303-310`) | `scrollTo({top:0,left:0})` (`:309`) |
| Clear all / "Clear filters" link | `handleFiltersChange([])` → `setFilters(newFilters)` (`TableGrid.tsx:293-296`); wired to `GridFilterChips.onClearAll` at `TableGrid.tsx:723` and to the empty-state link at `TableGrid.tsx:774` | `scrollTo({top:0,left:0})` (`:295`) |
| Add from column stats | `handleFilterFromStats(column, value)` — appends `{ column, operator: 'eq', value }` **unless an identical `column`+`eq`+`value` triple already exists** (`TableGrid.tsx:312-320`, dedupe at `:314-316`) | `scrollTo({top:0,left:0})` (`:319`) |

There is **no edit-in-place** path: an existing filter can only be removed and re-added. Removal is by array index, and `GridFilterChips` keys chips by index (`GridFilterChips.tsx:40`), so removing a middle chip re-keys every chip after it.

There is no duplicate-detection in `handleAddFilter` (`TableGrid.tsx:299`) — the popover can add the same column+operator+value repeatedly. Only the stats-panel path dedupes.

### 3.9 Debounce / throttle on filter input

**None.** The value `Input` writes to React state on every `onChange` (`GridFilterPopover.tsx:214`) with no `setTimeout`, `useDeferredValue`, or debounce wrapper. The only debounce in the grid is on **column-width persistence**: `saveTimeoutRef` with `400` ms in `handleColumnResize` and `handleResetColumnWidth` (`TableGrid.tsx:322`, `:331-334`, `:345-348`) — unrelated to filtering. No debounce utility is imported anywhere in `src/components/data-explorer` (grep for `debounce|throttle` returns no hits in that tree).

### 3.10 Other timing constants in the surrounding grid

| Value | Purpose | Line |
| --- | --- | --- |
| `150` ms | scroll-stop timer that re-enables hover previews | `TableGrid.tsx:108-110` |
| `400` ms | debounce before `saveColumnWidths` | `TableGrid.tsx:334`, `:348` |
| `600` ms | minimum `isManualRefreshing` lockout after Refresh | `TableGrid.tsx:375-377` |
| `2000` ms | "Copied" button reset | `TableGrid.tsx:415` |
| `1500` ms | scroll-stop after copy in `ColumnStatsPanel` | `ColumnStatsPanel.tsx:63` |

---

## 4. Sorting

### 4.1 Sort state shape

Two independent `useState` values in `TableGrid` — **not** an array, **not** an object:

`src/components/data-explorer/TableGrid.tsx:68-69`:

```ts
const [sortColumn, setSortColumn] = useState<string | null>(null);
const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
```

Initial state: `sortColumn === null`, `sortDirection === 'asc'`. `sortDirection` is never `null` — "unsorted" is represented by `sortColumn === null` alone.

Both are passed individually to every visible header — `TableGrid.tsx:792-793`:

```tsx
sortColumn={sortColumn}
sortDirection={sortDirection}
```

Prop contract — `src/components/data-explorer/grid/ColumnHeader.tsx:7-9`:

```ts
sortColumn: string | null;
sortDirection: 'asc' | 'desc';
onSort: (column: string | null, direction: 'asc' | 'desc') => void;
```

### 4.2 Cycle order

`src/components/data-explorer/grid/ColumnHeader.tsx:29` and `:31-36`:

```ts
const isActive = sortColumn === column.name;

const handleSortClick = (e: React.MouseEvent) => {
  e.stopPropagation();
  if (!isActive) onSort(column.name, 'asc');
  else if (sortDirection === 'asc') onSort(column.name, 'desc');
  else onSort(null, 'asc');
};
```

**Cycle: `unsorted → asc → desc → unsorted`.** The third step calls `onSort(null, 'asc')`, which resets `sortColumn` to `null` **and** `sortDirection` to `'asc'` simultaneously (`TableGrid.tsx:288-291`).

Icon mapping (`ColumnHeader.tsx:120-126`):

| State | Icon | Tooltip | Line |
| --- | --- | --- | --- |
| not sorted on this column | `ArrowUpDown` `w-3 h-3` | `Click to sort` | `:125`, `:120` |
| `sortColumn === name && sortDirection === 'asc'` | `ArrowUp` | `Sorted ascending` | `:123`, `:120` |
| `sortColumn === name && sortDirection === 'desc'` | `ArrowDown` | `Sorted descending` | `:123`, `:120` |

Visibility: the sort button is `opacity-0 group-hover:opacity-100` when not active, `text-primary` when active (`ColumnHeader.tsx:116-119`). It sits at `ml-auto` inside the header flex row (`:117`).

`handleSortClick` calls `e.stopPropagation()` (`ColumnHeader.tsx:32`) so it does not also trigger `handleHeaderClick` → the column stats panel (`:38-40`).

The state setter — `TableGrid.tsx:288-291`:

```ts
const handleSort = useCallback((column: string | null, direction: 'asc' | 'desc') => {
  setSortColumn(column);
  setSortDirection(direction);
}, []);
```

**No scroll reset.** Unlike the filter callbacks, `handleSort` contains no `scrollTo({top:0})` (`TableGrid.tsx:288-291` vs `:295`, `:300`, `:309`, `:319`).

### 4.3 Multi-column sort is not supported

- The state holds a single `sortColumn` (`TableGrid.tsx:68`) — there is no array of sort keys anywhere in `src/components/data-explorer`.
- The wire format is scalar: `orderBy` is a single string and `orderDirection` a single enum (`types.ts:94-95`), serialised as two separate query params (`api.ts:79-80`).
- The server accepts one `orderBy` string (`backend/routes/data-explorer/data.routes.js:117`) and pushes it into `sortColumns = [orderBy]` — a one-element array (`backend/services/sw-data-explorer/query-builder.service.js:335-339`). The `sortColumns.map(...).join(', ')` at `:346-348` is generic, but nothing on the client ever produces more than one entry.
- `TableRowsResponse.orderColumns` is typed `string[]` (`types.ts:64`) and the server does populate it (`query-builder.service.js:381`, `data.routes.js:171`), but the frontend never reads it — see §9.

### 4.4 Server-side ORDER BY

When `orderBy` is absent, the server falls back to a **stable key**, so unsorted pagination is still deterministic (`query-builder.service.js:333-344`):

1. `orderBy` if supplied and present in the column set (`:335-339`); otherwise `QueryBuildError('Unknown sort column: …', 'unknown_column')` (`:337`).
2. Else `orderKey` — the primary key array, or `[columnMetaRows[0].name]` if the table has no PK (`data.routes.js:124`).
3. Else `columns[0].name` (`query-builder.service.js:343`).

Direction: `orderDirection === 'desc' ? 'DESC' : 'ASC'` applied to every sort column (`query-builder.service.js:347`). The route coerces anything that is not the literal string `'desc'` to `'asc'` (`data.routes.js:118`), so the client cannot request an invalid direction.

Keyset pagination is appended as an extra `AND` clause on the sort columns (`:350-368`); if the incoming cursor's column list does not match the current sort, the server throws `QueryBuildError('Cursor does not match the current sort', 'invalid_cursor')` (`:352-358`) → catalog entry `invalid_cursor` / "Stale page" (`errors.ts:169-172`).

**Cursor invalidation on sort change is not client-side.** Because `useTableRows` keys on the full `params` object (`hooks.ts:75`), a sort change produces a brand-new query with `initialPageParam: undefined` (`hooks.ts:80`) — there is no cursor to invalidate.

### 4.5 Client-side sorting does not exist

`displayedRows` only ever applies `matchesFilter`; there is no in-memory sort (`TableGrid.tsx:202-207`). Sorting is **always** server-side — unlike filtering, `sortColumn`/`sortDirection` are sent in the request unconditionally (`TableGrid.tsx:172-173`, `filterScope` does not gate them). When `filters: []` is sent because `filterScope === 'loaded'` (`TableGrid.tsx:174`), `orderBy` is still sent.

### 4.6 Reset on table change

`TableGrid.tsx:138-147` — on any change to `connectionId`, `schemaName` or `tableName`:

```ts
setSortColumn(null);
setSortDirection('asc');
setFilters([]);
...
```

Sort state is **not persisted** to localStorage. Only hidden columns and column widths are (§5.4).

---

## 5. Column visibility

### 5.1 State and ownership

`src/components/data-explorer/TableGrid.tsx:73-75`:

```ts
const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => {
  return loadHiddenColumns(connectionId, schemaName, tableName);
});
```

A `Set<string>` of **hidden** column names (not a visible list). Projection onto render — `TableGrid.tsx:216-218`:

```ts
const visibleColumns = useMemo(() => {
  return columns.filter((c) => !hiddenColumns.has(c.name));
}, [columns, hiddenColumns]);
```

`visibleColumns` drives the header row (`TableGrid.tsx:788`), every `GridRow` (`:818`), the clipboard export (`:396`, `:398`), and the export context (`:244`).

`columns` is `data.pages[0].columns` (`TableGrid.tsx:212-214`) — a hidden name that does not exist in the first page is inert.

### 5.2 Toggle UI

`src/components/data-explorer/grid/GridColumnsPopover.tsx` — Radix `Popover` with **no controlled `open` state** (`:40`), i.e. fully uncontrolled.

Trigger button (`:41-51`): `variant="ghost"`, `h-6 px-2 text-[11px] gap-1`, icon `Eye w-3 h-3` (`:43`), label `Columns` (`:44`).

Panel: `w-60 p-2.5`, `align="start"` (`:52`). Header row shows `Columns` + `{columns.length - hiddenColumns.size} / {columns.length} visible` (`:53-58`).

Early return: `if (columns.length === 0) return null` (`GridColumnsPopover.tsx:31`) — the whole control is unmounted until the first rows page resolves.

### 5.3 The visible-count label

Computed **twice**, identically, as a subtraction:

| Location | Expression | Line |
| --- | --- | --- |
| Trigger button badge | `({columns.length - hiddenColumns.size}/{columns.length})` — rendered **only** when `hiddenColumns.size > 0` | `GridColumnsPopover.tsx:45-49` |
| Panel header | `{columns.length - hiddenColumns.size} / {columns.length} visible` — **always** rendered | `GridColumnsPopover.tsx:55-57` |

Trigger badge classes: `text-[10px] text-muted-foreground` (`:46`). Panel header classes: `text-[10px] text-muted-foreground` (`:55`).

No clamping: if `hiddenColumns` ever contained names absent from `columns`, the numerator could go negative — the only guard is that `saveHiddenColumns` round-trips through a `Set<string>` (`TableGrid.tsx:427`, `grid-storage.ts:180`).

### 5.4 Eye / crossed-eye states

`GridColumnsPopover.tsx:80-84`:

```tsx
{hiddenColumns.has(col.name) ? (
  <EyeOff className="w-3 h-3 text-muted-foreground flex-shrink-0" />
) : (
  <Eye className="w-3 h-3 text-foreground flex-shrink-0" />
)}
```

The **crossed-eye (`EyeOff`) means the column is hidden**. The row itself also gets `opacity-50` when hidden (`GridColumnsPopover.tsx:77`).

Row affordance: the whole row is a `<button>` (`:72-89`), `w-full flex items-center gap-2 px-2 py-1 rounded text-xs hover:bg-muted transition-colors text-left` (`:76`), calling `onToggleColumn(col.name)` (`:74`).

Row contents:

- PK columns get `text-primary font-medium` on the name (`GridColumnsPopover.tsx:85`).
- Type is shown right-aligned: `ml-auto text-[10px] text-muted-foreground` (`:88`).
- Name is `truncate` (`:85`).

List container: `max-h-60 overflow-y-auto space-y-0.5 pr-0.5` (`GridColumnsPopover.tsx:70`).

### 5.5 Column search inside the popover

Rendered **only when `columns.length > 5`** — `GridColumnsPopover.tsx:59`.

- Input `h-7 text-xs pl-7 bg-background/50`, placeholder `"Search columns…"` (`:62-67`), `Search w-3 h-3 absolute left-2 top-2 text-muted-foreground` (`:61`).
- State: `const [searchTerm, setSearchTerm] = useState('')` (`:29`) — local to the component, reset on unmount.
- Matching (`:33-37`): `c.name.toLowerCase().includes(term) || c.type.toLowerCase().includes(term)` — matches on **type text as well as name**, single `term`, no token splitting, no regex.
- Empty/whitespace `searchTerm` short-circuits to `return true` (`:34`).

**No debounce** — `onChange` → `setSearchTerm` directly (`:64`), and the `columns.filter(...)` runs on every render (`:33`).

### 5.6 Show all / Hide except PK

`GridColumnsPopover.tsx:92-111` — a bordered footer (`pt-2 mt-2 border-t border-border flex items-center justify-between gap-2`):

| Button | Handler | Disabled when | Line |
| --- | --- | --- | --- |
| `Show all` | `onShowAll` | `hiddenColumns.size === 0` | `:96`, `:98`, `:100` |
| `Hide except PK` | `onHideAllExceptPK` | `hiddenColumns.size >= columns.length - 1` | `:105`, `:107`, `:109` |

Both are `variant="ghost" size="sm" className="h-6 text-[11px] px-2"`.

Implementations in `TableGrid.tsx`:

- `handleShowAllColumns` (`:432-436`): `next = new Set<string>()`, `setHiddenColumns(next)`, `saveHiddenColumns(connectionId, schemaName, tableName, next)` (`:435`).
- `handleHideAllExceptPK` (`:438-445`): fresh `Set`, then `for (const c of columns) if (!c.isPrimaryKey) next.add(c.name)` (`:440-442`), then set + save (`:443-444`).
- `toggleColumnVisibility` (`:422-430`): clones the `Set`, adds or deletes the name (`:425-426`), then **persists synchronously on every toggle** (`:427`). No debounce (contrast with column widths, `TableGrid.tsx:331-334`).

There is **no reset-to-defaults** control — the two buttons are the only bulk operations.

### 5.7 Persistence — per-table localStorage, no TTL

`src/components/data-explorer/storage/grid-storage.ts`:

| Concern | Value / line |
| --- | --- |
| Key prefix | `sw-data-explorer-hidden-cols-` (`:22`) |
| Key format | `${prefix}${connectionId}-${schemaName}-${tableName}` (`:38-40`) |
| Envelope version | `CACHE_VERSION = 1` (`:17`) |
| Serialised shape | `{ v, ts, data: string[] }` via `createStore` (`:149-156`, `shared/storage/store.ts:194-202`) |
| **TTL** | **none** — `hiddenColsStore` omits `ttlMs`, and `createStore` treats a null `ttlMs` as "no expiry" (`store.ts:45`, `:181`) |
| Fallback on any failure | `[]` → `new Set()` (`grid-storage.ts:153`, `:163`, `store.ts:102-106`) |
| Migration | legacy bare JSON array of strings (`:155`) |
| Read guard | returns empty `Set` if `!connectionId || !tableName` (`:163`) |
| Write guard | same guard (`:174`) |
| **Delete-when-empty** | `if (hiddenColumns.size === 0) localStorage.removeItem(key)` (`:177-178`) — "Show all" on a fully-shown table **removes the key** rather than writing `[]` |
| LRU eviction | `registerKey(key, 'data-explorer')` (`:176`) only — the hidden-cols key is registered for logout-time wiping but is **not** entered into the `MAX_TABLES_CACHED = 50` LRU index, which is only maintained by `manageLRUCache` from `saveColumnWidths` (`:19`, `:114`, `:124-147`) |

Contrast: the **column-width** store in the same file *does* have `MAX_CACHE_AGE_MS = 30 * 24 * 60 * 60 * 1000` (30 days) (`:18`, `:52`) and *is* LRU-evicted. Hidden columns have neither.

Reload path: `loadHiddenColumns` is called in the `useState` initialiser (`:74`) **and** again in the per-table reset effect (`:142`), so switching tables and switching back restores the saved set.

Clear-all-client-data: hidden-column keys are registered under the `'data-explorer'` group via `registerKey` (`:176`), so they are covered by the prefix-based wipe.

### 5.8 Hidden columns and export

`visibleColumns.map(c => c.name)` is pushed into the export context (`TableGrid.tsx:244`), which `ExportButton` forwards as the `columns` query param — `src/components/export/ExportButton.tsx:255` and `:611`, serialised as a comma-joined string (`api.ts:148-150`). So hidden columns are excluded from View-scope exports. The server validates each requested column against the table's column set and errors with `unknown_column` otherwise (`query-builder.service.js:310-314`).

---

## 6. Filter chips

`src/components/data-explorer/grid/GridFilterChips.tsx` (69 lines total).

### 6.1 Render gate

`GridFilterChips.tsx:15`: `if (filters.length === 0) return null;` — nothing renders, including the leading divider, when there are no filters.

### 6.2 Structure

```tsx
<>
  <div className="w-px h-4 bg-border mx-1" />          // :19  vertical divider
  <div className="flex items-center gap-1 overflow-x-auto">  // :20  scrollable strip
    {filters.map(...)}                                  // :21
    <button onClick={onClearAll}>Clear</button>          // :60-65
  </div>
</>
```

The divider (`:19`) and the chip strip are emitted even though this component is not the only child of the portal fragment — `TableGrid.tsx:643` renders a separate identical divider immediately before `<GridFilterPopover>`. When filters exist the action bar therefore shows two adjacent `w-px h-4 bg-border mx-1` dividers.

### 6.3 Chip markup

`GridFilterChips.tsx:38-57`:

```
<span key={index} className="inline-flex items-center gap-1 bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap">
  <span className="font-medium">{filter.column}</span>      // :43
  <span className="opacity-60">{opLabel}</span>               // :44
  {filter.value !== undefined && filter.value !== null && (  // :45
    <span>{Array.isArray(filter.value) ? `(${filter.value.join(', ')})` : String(filter.value)}</span>  // :47
  )}
  <button onClick={() => onRemoveFilter(index)} title="Remove filter"><X className="w-2.5 h-2.5" /></button>  // :50-56
</span>
```

- Keys are **array indices** (`:40`) — see §3.8 for the re-keying consequence.
- Chip colour is fixed `bg-primary/10 text-primary`; there is no per-chip state.
- Value segment: arrays render as `(a, b, c)` (`:47`); everything else via `String(...)` (`:47`).
- Value segment is **omitted entirely** when `filter.value` is `undefined` or `null` (`:45`) — which is the case for all three of `is_null`, `not_null`, `is_empty`, since the popover coerces them to `undefined` (`GridFilterPopover.tsx:86`). Those chips therefore show only `column` + operator label.
- Removability: the X button is always present (`:50-56`), `hover:text-foreground cursor-pointer`, `title="Remove filter"`, `X w-2.5 h-2.5`. It calls `onRemoveFilter(index)` (`:51`).
- Strip overflow: `overflow-x-auto` (`:20`) — many filters scroll horizontally rather than wrap.

### 6.4 "Clear" affordance

`GridFilterChips.tsx:60-65`:

```tsx
<button onClick={onClearAll} className="text-muted-foreground hover:text-foreground text-[10px] cursor-pointer ml-1">
  Clear
</button>
```

Always rendered whenever the component renders (i.e. whenever `filters.length > 0`) — there is no disabled state. Label is the bare word `Clear`, with no count. Wired to `handleFiltersChange([])` at `TableGrid.tsx:723`.

### 6.5 Count badge location

There is **no count badge in the chips component**. The only filter count indicator in the UI is the badge on the Filter trigger button — `GridFilterPopover.tsx:116-120`, fed by `activeFilterCount={filters.length}` (`TableGrid.tsx:648`). A separate count appears in the export dialog: `{gridContext.filters.length} filter{s}` (`ExportButton.tsx:855-858`).

---

## 7. `data-profiling.ts`

`src/components/data-explorer/api/data-profiling.ts` (73 lines).

**It fetches nothing.** Despite the filename, the module contains zero imports and zero network code — only an interface, a tone palette and one pure function. Its header comment states the purpose: "Semantic type detection for columns (name + declared type + sample values). Used to render value-type badges in the column stats panel." (`data-profiling.ts:1-4`).

### 7.1 Exports

| Export | Shape | Line |
| --- | --- | --- |
| `interface SemanticType` | `{ label: string; tone: string }` | `:6-9` |
| `detectSemanticType(name, type, samples = [])` | returns `SemanticType \| null` | `:27-31` |

The 7-entry `TONES` palette (Tailwind class strings) is module-private — `data-profiling.ts:11-19`: amber, sky, violet, emerald, rose, teal, indigo. `EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/` is module-private (`:21`).

### 7.2 Detection rules, in evaluation order

First match wins; the function returns at the first hit (`:36-72`):

| # | Condition | Label | Tone | Line |
| --- | --- | --- | --- | --- |
| 1 | `t === 'boolean'` (exact match on the lowercased declared type) | `Boolean` | violet | `:36` |
| 2 | `t === 'uuid' \|\| t.includes('uuid')` | `UUID` | indigo | `:38` |
| 3 | `n === 'id' \|\| /(^|_)(id\|uid\|key)$/.test(n)` | `ID` | amber | `:40` |
| 4 | `n.includes('email') \|\| EMAIL_RE.test(samples[0])` | `Email` | sky | `:42` |
| 5 | `/url\|website\|web_site\|href\|link/i.test(n)` | `URL` | sky | `:44` |
| 6 | `/phone\|mobile\|cell\|contact_no/.test(n)` | `Phone` | rose | `:46` |
| 7 | `/(^\|_)at$/.test(n) \|\| n.endsWith('_date') \|\| n === 'date' \|\| /timestamp\|datetime\|date\b\|time\b/.test(t)` | `Date/Time` | teal | `:48-53` |
| 8 | money-ish **name** AND numeric-ish **type**: `/price\|amount\|cost\|total\|fee\|salary\|budget\|balance\|revenue/.test(n) && /(numeric\|money\|real\|double\|int)/.test(t)` | `Currency` | emerald | `:55-60` |
| 9 | `n.includes('status') \|\| n.includes('state') | `Status` | indigo | `:62` |
| 10 | `n.includes('name') \|\| n.includes('title') \|\| n.includes('label')` | `Name` | teal | `:64-66` |
| 11 | `n.includes('address') \|\| n.includes('city') \|\| n.includes('country') \|\| n.includes('zip')` | `Location` | sky | `:68-70` |
| — | no match | `null` | — | `:72` |

Inputs are lowercased/trimmed once at the top: `name.toLowerCase().trim()`, `type.toLowerCase()`, `String(samples[0] ?? '').toLowerCase()` (`:32-34`). Only `samples[0]` is inspected (`:34`, `:42`).

Note the ordering consequence: a column literally named `url_id` matches rule 3 (`ID`) before rule 5 (`URL`) — `data-profiling.ts:40` precedes `:44`. Similarly `email_id` → `ID`, not `Email`.

### 7.3 Its one caller

`src/components/data-explorer/ColumnStatsPanel.tsx:13` (import), `:41-43` (call):

```ts
const semanticType = columnStats
  ? detectSemanticType(columnStats.name, columnStats.type, columnStats.sampleValues)
  : detectSemanticType(column.name, column.type, []);
```

Rendered as a pill next to the column name in the stats panel header — `ColumnStatsPanel.tsx:81-85`, classes `text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0` + the tone string (`:82`).

The `[]` fallback (`:43`) means the email rule (rule 4) cannot fire before the stats query resolves.

### 7.4 The actual profiling fetch (a different file)

Column profiling is fetched by `useColumnHeaderProfiles` — `src/components/data-explorer/api/hooks.ts:143-154`:

```ts
queryFn: () => fetchColumnStats(connectionId!, tableName!, schemaName, undefined, 'pg_stats'),
```

- `mode: 'pg_stats'` is the only accepted mode on the frontend (`api.ts:97-103`).
- Endpoint: `GET /api/data/{connectionId}/tables/{table}/stats?schemaName=…&mode=pg_stats` (`api.ts:107-109`).
- Query key: `[...all, 'header-profiles', connectionId, tableName, schemaName]` (`hooks.ts:149`) — one query for **all** columns, `column` omitted.
- `staleTime: 60_000` (`hooks.ts:152`). No `retry` override, so the global default applies; the other hooks set `retry: 2` with `retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000)` (`hooks.ts:43-44`, `:59-60`).

Consumers:
- `ColumnHeader.profile` prop (`ColumnHeader.tsx:15`), fed from a `Map` built from `profilesData.columns` (`TableGrid.tsx:126-130`, `:799`).
- `buildProfileTitle` builds the `<th title>` tooltip (`ColumnHeader.tsx:142-158`): `"<name>: <100 - nullPercent>% filled, <distinctCount> distinct"` (`:145`), optional `"Range <min> – <max>"` when `minValue != null` (`:147-149`), optional `"Top: <v> (<p>%), …"` over `profile.topValues.slice(0, 3)` (`:150-155`), and the literal suffix `"approximate values from Postgres statistics"` when `profile.approx` (`:156`). Returns `undefined` when there is no profile or `nullPercent == null` (`:143`), which suppresses the tooltip entirely.
- The per-column panel uses `useColumnStats(..., columnName)` (`hooks.ts:123-135`, called at `ColumnStatsPanel.tsx:37`) — the non-`pg_stats` mode, keyed with `column ?? 'all'` (`hooks.ts:130`), `staleTime: 60_000` (`:133`).

Neither stats query participates in filtering. `ColumnStats.topValues` is surfaced as a **filter entry point**: each top value gets a hover-revealed filter button (`ColumnStatsPanel.tsx:324-330`, `title={`Filter rows where value = ${item.value}`}`) which calls `onFilter(item.value)` (`:325`) → `handleFilterValue` (`:69-72`) → `onFilterFromStats` → `handleFilterFromStats` in `TableGrid.tsx:312-320`, appending `{ operator: 'eq' }`. The button is hidden for `NULL` values (`ColumnStatsPanel.tsx:323`).

---

## 8. Error handling

### 8.1 Where `code` / `hint` come from

`src/lib/api/client.ts:216-232` — `ApiError` is constructed with `status`, `message` and the parsed body; then:

```ts
this.code = payload?.code ?? payload?.error;                       // client.ts:230
this.hint = payload?.hint ?? payload?.details?.hint;              // client.ts:231
```

Thrown from `apiRequest` (`client.ts:206`) and `apiRequestRaw` (`client.ts:154`, `:156`). A 401 on any non-auth endpoint also dispatches a window `auth:unauthorized` event (`client.ts:99-103`); the auth endpoint allowlist is `AUTH_ENDPOINTS` at `client.ts:73-78`.

`src/components/data-explorer/api/api.ts:34-44` — `unwrapResponse` handles the envelope-level failure: if `response.success === false`, it throws a plain `Error` with `status = 500` hard-coded and copies `message`/`code`/`hint` off the body (`api.ts:35-41`). **Note the hard-coded 500**: a `success: false` 200-style body is reported to the UI as a 500 even when the payload carries a different meaning.

### 8.2 Resolution precedence

| Resolver | Order | Lines |
| --- | --- | --- |
| `getExplorerErrorMessage(err)` | 1) catalog entry for `err.code` → 2) `unauthorized` copy if `err.status === 401` → 3) `err.message` → 4) `'Something went wrong while talking to the SW Agent.'` | `errors.ts:183-189` |
| `getExplorerErrorHint(err)` | 1) `err.hint` (backend-supplied) → 2) catalog `hint` for `err.code` → 3) `undefined` | `errors.ts:195-200` |
| `getExplorerErrorTitle(err)` | 1) catalog `title` for `err.code` → 2) `'Request failed'` | `errors.ts:205-209` |

`getExplorerErrorHint` calls `getExplorerErrorHint` twice in the panel's JSX (`ColumnStatsPanel.tsx:117` and `:119`) — the same pure lookup twice.

### 8.3 Error-mapping table (`src/components/data-explorer/api/errors.ts`)

| `code` | title | message | hint | Line |
| --- | --- | --- | --- | --- |
| `agent_offline` | SW Agent is offline | The SW Agent for this connection is not running. | Open a terminal on the machine you registered and run: `sw-agent start` | `:14-18` |
| `agent_wake_failed` | SW Agent is not responding | The SW Agent did not respond in time. | Make sure the SW Agent is running (`sw-agent start`) and connected to the relay. | `:19-23` |
| `agent_timeout` | SW Agent timed out | The SW Agent took too long to respond. | Check the SW Agent status and relay connection, then retry. | `:24-28` |
| `channel_closed` | Connection dropped | The connection to the SW Agent closed unexpectedly. | Retry now — the agent reconnects automatically. | `:29-33` |
| `rate_limited` | Too many requests | You are sending requests too quickly. | Wait a few seconds and try again. | `:34-38` |
| `concurrent_request_rejected` | Agent is busy | The SW Agent is still working on another request. | Wait a moment and retry. | `:39-43` |
| `db_unavailable` | Database unreachable | Your database could not be reached from the SW Agent machine. | Check that the database host is running and reachable (network/firewall). | `:46-50` |
| `db_auth_failed` | Database login failed | Your database rejected the SW Agent credentials. | Verify the database password in the SW Agent config (`sw-agent > db edit`). | `:51-55` |
| `db_not_found` | Database not configured | This database is not registered with your SW Agent. | Register it with: `sw-agent > db add` | `:56-60` |
| `db_pool_exhausted` | Connection pool full | The database connection pool is full right now. | Wait a few seconds and retry. | `:61-65` |
| `db_ssl_error` | Database SSL failure | The secure connection to the database failed. | Check the `ssl_mode` / `ssl_root_cert` settings on the SW Agent database config. | `:66-70` |
| `env_var_missing` | Agent config incomplete | The SW Agent is missing a password environment variable for this database. | See `sw-agent > db ls` for the variable name, set it, then restart the agent. | `:71-75` |
| `config_invalid` | SW Agent config invalid | The SW Agent configuration file is invalid. | Run: `sw-agent doctor` | `:76-80` |
| `config_not_found` | SW Agent not configured | The SW Agent has no configuration yet. | Run: `sw-agent init` | `:81-85` |
| `query_timeout` | Query timed out | The query took too long and was cancelled. | Try again, or narrow the query with filters. | `:88-92` |
| `query_cancelled` | Query cancelled | The query was cancelled. | *(none)* | `:93-96` |
| `query_too_large` | Result too large | The result set exceeded the 10,000 row limit. | Use filters or pagination to browse the data. | `:97-101` |
| `stream_too_large` | Result too large | The result set exceeded the 1,000,000 row limit. | Use filters or pagination to browse the data. | `:102-106` |
| `execution_failed` | Query failed | The database rejected the query. | The error usually comes from a column, type, or value in the query. | `:107-111` |
| `internal_error` | SW Agent error | The SW Agent hit an internal error. | Run: `sw-agent doctor` | `:112-116` |
| `permission_denied` | Permission denied | Your role does not allow this action on the database. | *(none)* | `:119-122` |
| `role_insufficient` | Role too limited | Your team role does not allow this action. | Ask an admin to upgrade your role (viewer/data_reader). | `:123-127` |
| `approval_denied` | Approval denied | The manual approval for this action was denied. | *(none)* | `:128-131` |
| `approval_timeout` | Approval timed out | The manual approval request was not answered in time. | *(none)* | `:132-135` |
| `service_unavailable` | Service unavailable | The Data Explorer connection service is not configured on this server. | Contact your server administrator. | `:138-142` |
| `registry_error` | Verification failed | The server could not verify this connection. | Try again — if it persists, contact your server administrator. | `:143-147` |
| `not_found` | Connection not found | This connection does not exist, or you do not have access to it. | *(none)* | `:148-151` |
| `invalid_connection` | Invalid connection | This connection id is not valid. | *(none)* | `:152-155` |
| `agent_inactive` | Agent registration inactive | Your SW Agent registration is not active. | Relink the agent from Settings or the agent dashboard. | `:156-160` |
| `unauthorized` | Session expired | Your session expired — please log in again. | *(none)* | `:161-164` |
| `unknown_column` | Unknown column | The query references a column the table does not have. | *(none)* | `:165-168` |
| `invalid_cursor` | Stale page | This page of data is no longer valid — refresh to get the latest results. | *(none)* | `:169-172` |
| `bad_request` | Invalid request | The request was invalid. | *(none)* | `:173-176` |

**33 entries.** `interface ExplorerErrorEntry` is `{ title; message; hint? }` (`errors.ts:6-10`); `hint` is optional and **10** entries omit it: `query_cancelled`, `permission_denied`, `approval_denied`, `approval_timeout`, `not_found`, `invalid_connection`, `unauthorized`, `unknown_column`, `invalid_cursor`, `bad_request`.

Filter-relevant codes reachable from this section's code paths: `bad_request` (default code for every `QueryBuildError`, `query-builder.service.js:26`), `unknown_column` (unknown filter column `query-builder.service.js:386`, unknown sort column `:337`, unknown export column `:312`), `invalid_cursor` (cursor/sort mismatch, `query-builder.service.js:353`, `:358`), `execution_failed` (a bad filter *value* reaching Postgres), `query_timeout`, `query_too_large`, `stream_too_large`.

### 8.4 Toast vs inline

**Inline (no toast) — every filter/sort/column failure in the grid:**

| Surface | Gate | What is shown | Lines |
| --- | --- | --- | --- |
| Full-grid error state | `error && allRows.length === 0` | Circle with `X w-5 h-5 text-destructive`; `getExplorerErrorTitle(error)`; `getExplorerErrorMessage(error)`; hint in a muted bordered box; **Retry** button calling `refetch()` | `TableGrid.tsx:603-628` (`:613`, `:614`, `:615-619`, `:621-624`) |
| Column stats panel | `error` after the `isLoading` branch | Hard-coded heading `Failed to load statistics` (destructive); `getExplorerErrorMessage(error)`; hint box if present. **No retry button.** | `ColumnStatsPanel.tsx:113-122` |
| Filter-progress indicator | `isApplyingFilter` | Pulsing bar + `Applying filter...` (not an error, but the only signal during a server-side filter round-trip) | `TableGrid.tsx:634-638`, `:729-734` |
| Empty filtered result | `displayedRows.length === 0 && filters.length > 0` | `Table2 w-8 h-8 text-muted-foreground/30`, text `No rows match your filters`, and a `Clear filters` link button → `handleFiltersChange([])` | `TableGrid.tsx:770-775` |

The full-grid error state is **suppressed once any rows are already loaded** — `error && allRows.length === 0` (`TableGrid.tsx:603`). A failed refetch over existing data shows no error UI at all; the only trace is the row count reverting to `allRows.length` (`TableGrid.tsx:741-753`).

**Toast (`sonner`) — none of these are filter/sort/column paths.** Every toast in the data-explorer tree is clipboard-related:

| Message | Trigger | Line |
| --- | --- | --- |
| `No data available to copy` | `displayedRows.length === 0` on Copy | `TableGrid.tsx:392` |
| `Copied N rows to clipboard` | clipboard success, `displayedRows.length` rows | `TableGrid.tsx:414` |
| `Failed to copy to clipboard` | clipboard rejection, after `logger.error('Failed to copy rows:', err)` | `TableGrid.tsx:417-418` |
| `Copied to clipboard` | `EmptyState.tsx:60` | `EmptyState.tsx:60` |
| `Cell content copied to clipboard` | `CellInspectorModal.tsx:150` | `CellInspectorModal.tsx:150` |

`sonner`'s `toast` is imported at `TableGrid.tsx:33`. A successful filter add / remove / clear and every sort click produce **no** toast and no confirmation.

`handleRefresh` swallows its own errors: `catch { /* Handled by React Query state */ }` (`TableGrid.tsx:372-374`) and holds `isManualRefreshing` for `600` ms regardless (`:375-377`). The `dataExplorerKeys.rows` / `.stats` / `.tables` / `.schemas` invalidations all run even though `refetch()` already targets the rows query (`TableGrid.tsx:357-371`).

---

## 9. Pagination interaction

**There is no page-number state.** Pagination is cursor/keyset-based via `useInfiniteQuery` (`hooks.ts:69-93`), so "reset to page 1" is realised as *discarding the accumulated pages and starting from `initialPageParam: undefined`* (`hooks.ts:80`).

### 9.1 Every reset site

| Trigger | Reset mechanism | Line |
| --- | --- | --- |
| Add filter | `scrollTo({top:0,left:0})` — plus a new query key, so pages start over | `TableGrid.tsx:300` (key: `:75` in `hooks.ts`) |
| Remove filter (by index) | `scrollTo({top:0,left:0})` | `TableGrid.tsx:309` |
| Clear all filters (`handleFiltersChange`) | `scrollTo({top:0,left:0})` | `TableGrid.tsx:295` |
| Filter added from column stats | `scrollTo({top:0,left:0})` | `TableGrid.tsx:319` |
| Page-size change | `scrollTo({top:0,left:0})` + `setExplorerPageSize(next)` | `TableGrid.tsx:151-155` |
| Table / schema / connection change | `setFilters([])`, `setSortColumn(null)`, `setSortDirection('asc')`, `scrollTo({top:0,left:0})` | `TableGrid.tsx:138-147` (`:139`, `:140`, `:141`, `:146`) |
| Row-count shrink (e.g. filters applied in memory) | `el.scrollTop = 0` if `el.scrollTop > displayedRows.length * ROW_HEIGHT` | `TableGrid.tsx:273-282` (`:275-279`) |

### 9.2 What does **not** reset

- **`handleSort` performs no scroll reset** (`TableGrid.tsx:288-291`). The new query key restarts the pages, but the scroll container stays where it was — which can land the user past the end of the new, shorter result set. The shrink guard at `TableGrid.tsx:273-282` only fires when `displayedRows.length` *shrinks*, and compares against `ROW_HEIGHT = 33` (`TableGrid.tsx:47`, `:277`).
- **`setFilterScope` performs no scroll reset.** It is passed bare as `onFilterScopeChange` (`TableGrid.tsx:652`); there is no wrapper.
- **`toggleColumnVisibility`, `handleShowAllColumns`, `handleHideAllExceptPK` perform no scroll reset** (`TableGrid.tsx:422-445`).
- **`limit` (page size) is not reset** by any filter or sort change; it is a separate `useState` seeded from `getExplorerPageSize()` (`TableGrid.tsx:149`).

### 9.3 Page-size limits

| Constant | Value | Line |
| --- | --- | --- |
| `EXPLORER_PAGE_SIZES` | `[100, 250, 500, 1000, 2000]` | `explorer-preferences.ts:81` |
| `DEFAULT_PAGE_SIZE` | `500` | `explorer-preferences.ts:82` |
| Page-size storage TTL | none (`pageSizeStore` omits `ttlMs`, `explorer-preferences.ts:87-103`) | — |
| Invalid stored value | discarded → `DEFAULT_PAGE_SIZE` (validated against the allowlist, `explorer-preferences.ts:84-85`, `:91`) | — |
| Invalid value on write | rejected, previous preference intact (`explorer-preferences.ts:118`) | — |
| Server default `limit` when absent/invalid | `500` | `data.routes.js:119` |
| Server hard cap | `2000` (`sanitizeLimit(req.query.limit, 500, 2000)`) | `data.routes.js:119` |
| `MAX_ROWS_PER_PAGE` (builder default cap) | `2000` | `query-builder.service.js:12` |
| `sanitizeLimit` fallback inside the builder | `50` when called from `buildRowsSql` (`sanitizeLimit(limit, 50, maxLimit)`) | `query-builder.service.js:323` |
| `MAX_EXPORT_ROWS` | `10_000` | `query-builder.service.js:13` |
| `MAX_FILTER_IN_VALUES` | `100` | `query-builder.service.js:11` |
| `MAX_IDENTIFIER_LENGTH` | `63` | `query-builder.service.js:10` |
| `SMALL_TABLE_ROW_LIMIT` | `100_000` | `query-builder.service.js:14` |
| Client `maxPages` (retained page cache) | `5` | `hooks.ts:82` |
| Rows `staleTime` | `60_000` ms | `hooks.ts:84`, `:108` |
| Rows `gcTime` | `30 * 60_000` = 30 min | `hooks.ts:85`, `:109` |
| `staleTime` — schemas / table list / stats / header profiles / schema | `60_000` / `30_000` / `60_000` / `60_000` / `60_000` ms | `hooks.ts:42`, `:58`, `:133`, `:152`, `:169` |

### 9.4 Stale-data placeholder during key transitions

`hooks.ts:86-91` — both row hooks keep the previous page data while the new key loads:

```ts
placeholderData: (prevData, prevQuery) =>
  prevData && prevQuery &&
  prevQuery.queryKey[2] === connectionId &&
  prevQuery.queryKey[3] === tableName
    ? prevData
    : undefined,
```

Positional indexing relies on the key shape `[DATA_EXPLORER_QUERY_ROOT, 'rows', connectionId, tableName, params]` (`hooks.ts:25-26`, `:75`). So on a filter/sort change within the same table, **the previous result set stays on screen** until the new one arrives. There is no toast or banner saying the displayed rows are stale; the only cue is the `Applying filter...` indicator, which is gated on `!isFilteringInMemory` (`TableGrid.tsx:210`) and therefore **does not appear for in-memory filtering**, where results change synchronously anyway.

The row-count label switches format when filters are active — `TableGrid.tsx:741-753`:

- With filters: `Showing {displayedRows.length} of {allRows.length} rows` (`:743`).
- Without, fully loaded: `{allRows.length} rows` (`:746`).
- Without, partially loaded: `Showing {allRows.length} of ~{formatCount(estimatedTotal)} rows` (`:748`).
- Neither: `{allRows.length} rows` (`:751`).

Note that in the `loaded` (in-memory) scope, `displayedRows.length ≤ allRows.length` and `allRows.length` is only what has been streamed so far — so the label reports "N of M rows" where M is the loaded subset, not the table total.

---

## 10. Dead / Unused Code

| Item | Evidence | Note |
| --- | --- | --- |
| `TableRowsResponse.orderColumns: string[]` | Declared `types.ts:64`; populated by the server (`query-builder.service.js:381`, `data.routes.js:171`) but grep for `orderColumns` in `sw-data-explorer/src` returns only the type declaration | Response field never consumed by the frontend |
| `TableRowsResponse.orderDirection: 'asc' \| 'desc'` | Declared `types.ts:65`; server sets it (`data.routes.js:172`); no frontend read | Same |
| `filterInputRef` | Created `GridFilterPopover.tsx:58`, attached as `ref` at `:212`, never read (no `.focus()`, no `.current` access anywhere) | Dead ref |
| `ExportGridContext.tableCount?: number` | Declared `types.ts:194`; never written by the grid (`TableGrid.tsx:240-247`) and never read (the `.tableCount` hits in `ExportButton.tsx:168`, `:186`, `:529`, `:995`, `:1028` are all `SchemaInfo.tableCount` from `types.ts:9`) | Dead optional field |
| `filterScope === 'database'` as a *reachable* value | Set only at `GridFilterPopover.tsx:239`; never reset to `'auto'`; **not** cleared by the per-table reset effect (`TableGrid.tsx:138-147`) | `'database'` is reachable but is a one-way state — nothing returns the scope to `'auto'` |
| `operatorsByType` entries for non-`text` types, as *exclusive* lists | The union at `GridFilterPopover.tsx:64-66` overrides them with `general`, so `number`/`boolean`/`date` all gain `like` and `in` | The per-type arrays are not the effective lists; see §1.2 |
| `matchesFilter`'s `in` non-array branch (`return false`) | `filter-matcher.ts:52` — the popover always produces an array (`GridFilterPopover.tsx:79-80`), and `handleFilterFromStats` always uses `eq` (`TableGrid.tsx:317`) | Unreachable through the UI; kept for defensive typing (asserted at test `:150`) |
| `matchesFilter`'s `default: return true` | `filter-matcher.ts:53-54` | Unreachable through the UI (the operator Select only offers whitelisted literals). Asserted deliberately at test `:153-155` |
| `getFilteredOperators()`'s `!col` fallback | `GridFilterPopover.tsx:63` (`if (!col) return operatorsByType.general`) | Only reachable if `columns` changes to no longer contain the selected column mid-draft |
| `is_empty` for non-`text` columns | Offered only in the `text` list (`GridFilterPopover.tsx:25`) though implemented server-side (`query-builder.service.js:396`) and client-side (`filter-matcher.ts:16`) | Cannot be created from the UI for number/boolean/date columns |
| `GridColumnsPopover` `Popover` open state | `GridColumnsPopover.tsx:40` — `<Popover>` with no `open`/`onOpenChange` | Intentional (uncontrolled); noted because `GridFilterPopover.tsx:104` does control it |
| Second adjacent divider in the action bar | `TableGrid.tsx:643` and `GridFilterChips.tsx:19` both render `w-px h-4 bg-border mx-1` | Cosmetic duplication when filters exist |

---

## Open Questions

- UNVERIFIED: whether the SW Agent's own row cap (independent of the backend's `sanitizeLimit(req.query.limit, 500, 2000)` at `data.routes.js:119`) can truncate a filtered result before the 2000-row limit — no agent-side cap was located in the frontend repo.
- UNVERIFIED: what actually populates `pagination.estimatedTotal` for a filtered query — `fetchTableMeta` returns it (`data.routes.js:121`, `:169`) but the meta appears to be cached per table (`data.routes.js:681`), so whether it is a filtered count or the unfiltered `reltuples` estimate could not be determined from the frontend repo alone.
- UNVERIFIED: whether `getColumnType`'s substring chain (`GridFilterPopover.tsx:15-22`) is fed raw `format_type()` strings or normalised type names. The backend maps `c.relname`/`a.attname` plus a type field (`query-builder.service.js:166`, `:219`) but the exact type string source for the rows response (`data.routes.js:160`) was not traced, so the exact effect of the `interval`→`number` and `character varying`→`text` matches on real data is unconfirmed.
- UNVERIFIED: whether the `db` folder contains the SW Agent relay-side row cap. `sw-agent/src` was searched for `filters` with no hits, and the relay was not read, so it cannot be stated whether the agent re-validates or re-limits the filter payload.
- UNVERIFIED: whether `filterScope` surviving a table switch is intentional. `TableGrid` has no `key` prop at `DataExplorerLayout.tsx:672-679` and the reset effect omits it, but no comment or test states the intent.
- UNVERIFIED: whether the absent debounce on the filter value `Input` (`GridFilterPopover.tsx:214`) and the column search `Input` (`GridColumnsPopover.tsx:64`) is deliberate. Both file headers claim "Isolated state prevents typing re-renders" (`GridFilterPopover.tsx:3`, `GridColumnsPopover.tsx:3`), which explains the *lack of grid re-renders* but not the absence of any request-throttling.
- UNVERIFIED: whether the `chip key={index}` choice (`GridFilterChips.tsx:40`) is a known issue. No test or comment addresses re-keying on middle-chip removal.
- UNVERIFIED: which of the 33 `EXPLORER_ERROR_CATALOG` entries are actually emitted by the backend today. Several (`approval_denied`, `approval_timeout`, `role_insufficient`, `stream_too_large`) reference an approval workflow that was not located in the data-explorer route file.
- UNVERIFIED: whether `unwrapResponse`'s hard-coded `status = 500` (`api.ts:38`) is reachable in practice, i.e. whether any data-explorer endpoint returns HTTP 200 with `success: false`.