---
title: Cell Interaction, Inspection & Column Statistics
section: 5
area: cell-inspection
sources: 20
status: rough
---

# 05. Cell Interaction, Inspection & Column Statistics

Scope: what happens when a user points at, clicks, copies from, or inspects a grid cell; the full-screen cell inspector; the column statistics slide-over; the explorer empty states; and the per-table AI shortcut in the sidebar. Grid rendering (virtualisation, widths, row painting) is Section 03. Filters and sorting are Section 04 and are only referenced here where a cell/stat action mutates them.

## Component / File Map

| File | Responsibility | ~Lines |
| --- | --- | --- |
| `src/components/data-explorer/grid/CellHoverPreview.tsx` | Portalled floating "quick peek" card shown on cell hover; copy + expand-to-modal actions | 240 |
| `src/components/data-explorer/grid/CellInspectorModal.tsx` | Radix dialog: full cell value, JSON/raw toggle, wrap toggle, in-cell find, row stepping, copy | 363 |
| `src/components/data-explorer/ColumnStatsPanel.tsx` | Right slide-over with server column statistics, top values, histogram, sample chips, stats copy | 381 |
| `src/components/data-explorer/EmptyState.tsx` | Two-branch placeholder (no connection / no table selected) with looping video, terminal command copy | 197 |
| `src/components/data-explorer/TableSidebar.tsx` | Table list; hosts the per-row AI shortcut entry point | 207 |
| `src/components/data-explorer/index.ts` | Barrel re-export (`EmptyState`, `ColumnStatsPanel` only, of this section) | 16 |
| `src/components/data-explorer/TableGrid.tsx` | Owns hover/inspect/stats state, timers, row navigation, clipboard handlers | 879 |
| `src/components/data-explorer/grid/GridRow.tsx` | Per-cell rendering, "is expandable" rule, copy/expand buttons, local copied badge | 196 |
| `src/components/data-explorer/grid/ColumnHeader.tsx` | Header cell; `onClick` opens the stats panel; pg_stats tooltip | 158 |
| `src/components/data-explorer/api/types.ts` | `ColumnStats`, `TopValue`, `Quantiles`, `HistogramBin`, `ColumnStatsResponse` | 195 |
| `src/components/data-explorer/api/hooks.ts` | `useColumnStats`, `useColumnHeaderProfiles`, `usePrefetchColumnStats` | 197 |
| `src/components/data-explorer/api/api.ts` | `fetchColumnStats` → `GET /api/data/{id}/tables/{table}/stats` | 292 |
| `src/components/data-explorer/api/errors.ts` | Error code → message/hint/title catalog used by the stats panel error state | 209 |
| `src/components/data-explorer/api/data-profiling.ts` | `detectSemanticType` — badge label/tone from name + type + sample | 73 |
| `src/components/data-explorer/DataExplorerLayout.tsx` | Renders `EmptyState` vs `TableGrid` vs AI; wires `onOpenAIForTable` | 733 |
| `src/components/ui/dialog.tsx` | Radix `Dialog` wrapper (roles, focus trap, sr-only close label) | 95 |
| `src/lib/utils.ts` | `formatShortType` used for the type chip in card + modal | 61 |
| `src/shared/lib/format.ts` | `formatCompactNumber` used for distinct/avg/stddev | 165 |
| `src/pages/DataExplorerPage.tsx` | `onOpenAIForTable` implementation (sets context table + `setMode('ai')`) | 518 |
| `src/components/ai/chat/hooks/useChatSendOrchestrator.ts` | Consumes `aiContextTable` / `aiContextSchema` when a chat message is sent | 349 |

`src/components/ai/chat/ImageLightbox.tsx` was **not** read: neither `CellInspectorModal.tsx` nor `ColumnStatsPanel.tsx` imports it. Its only importers are `src/components/ai/chat/ChatMessage.tsx:4` and `src/components/dashboard/side-panel/ResonaAIMessageItem.tsx:8`.

---

## 1. Click-to-copy

There is no "click the cell to copy" behaviour. `td` elements carry `onDoubleClick`, `onMouseEnter`, `onMouseLeave` only (`src/components/data-explorer/grid/GridRow.tsx:113-120`); a plain single click does nothing. Copy is an explicit hover-revealed button.

### 1.1 Four distinct clipboard paths

| Path | Code | Payload expression | Awaits? | Error handling | Confirmation | Timeout |
| --- | --- | --- | --- | --- | --- | --- |
| Grid cell copy button | `src/components/data-explorer/TableGrid.tsx:381-388` | `value === null ? 'NULL' : typeof value === 'object' ? JSON.stringify(value) : String(value)` | yes (`await`, line 384) | `try/catch` with an **empty** catch body, comment `// Fallback` (lines 385-387) | `Check` icon swap + absolute "Copied" pill per cell (`GridRow.tsx:151-155`, `173-178`) | 1500 ms (`GridRow.tsx:61-63`) |
| Hover card copy button | `src/components/data-explorer/grid/CellHoverPreview.tsx:117-122` | `isJson ? formattedJson : textValue` (line 119) | **no** — promise discarded, no `.catch` | none | `Check` icon swap; `title` flips to `'Copied to clipboard'` (lines 177, 179-183) | 1500 ms (`CellHoverPreview.tsx:121`) |
| Cell inspector copy button | `src/components/data-explorer/grid/CellInspectorModal.tsx:147-152` | `activeContent` (line 148) | **no** — no `.catch` | none | `Check` icon + label `'Copied'` + `toast.success('Cell content copied to clipboard')` (lines 150, 286-287) | 2000 ms (`CellInspectorModal.tsx:151`) |
| Column stats copy | `src/components/data-explorer/ColumnStatsPanel.tsx:46-67` | 7- or 8-line plain-text report (lines 48-59) | yes (`await`, line 61) | `try/catch` with empty body, comment `// Clipboard unavailable — no-op` (lines 64-66) — on failure **no** confirmation is shown at all | `Check` icon swap in header button (lines 89-91) | 1500 ms (`ColumnStatsPanel.tsx:63`) |
| (dataset level, not cell level) | `src/components/data-explorer/TableGrid.tsx:390-419` | TSV of header + all displayed rows | yes | logs + `toast.error('Failed to copy to clipboard')` (lines 416-419) | `toast.success(\`Copied ${n} rows to clipboard\`)` (line 414) | 2000 ms (line 415) |

### 1.2 Value type → clipboard representation

`String(value)` is JavaScript's default `String()` conversion: no `toLocaleString()`, no precision control, no date formatting.

| Value type | Grid button (`TableGrid.tsx:382`) | Hover card (`CellHoverPreview.tsx:119`) | Inspector (`CellInspectorModal.tsx:133,148`) | Notes |
| --- | --- | --- | --- | --- |
| `null` | literal `'NULL'` | `''` (empty string) | `''` (empty string) | `textValue`/`rawText` short-circuit to `''` at `CellHoverPreview.tsx:54-56` and `CellInspectorModal.tsx:77-87`. Card and modal **display** `NULL` (`CellHoverPreview.tsx:211-212`, `CellInspectorModal.tsx:299-300`) but **copy an empty string**. See "Contradictions" below. |
| `undefined` | `String(undefined)` = `'undefined'` | `''` | `''` | Same short-circuit. Grid row renders an empty string (`GridRow.tsx:13`). |
| boolean | `'true'` / `'false'` (`String(value)`) | `'true'` / `'false'` (`String(value)`, line 71) | same as raw | No copy button is rendered for boolean cells — the boolean branch (`GridRow.tsx:124-132`) renders only the coloured pill. Grid display itself uses `String(value)` at `GridRow.tsx:14`. |
| number | `String(value)`, e.g. `1200` (no thousands separator) | same | same | `formatCompactNumber` is **not** used on the copy path (it is used in `ColumnStatsPanel.tsx:51,167,176,179`). |
| object / array (json, jsonb) | `JSON.stringify(value)` — compact, single line | `JSON.stringify(value, null, 2)` — pretty, 2-space indent (`CellHoverPreview.tsx:64`) | pretty when `viewMode === 'formatted'` (default, line 54), compact `JSON.stringify(value)` when `'raw'` (`CellInspectorModal.tsx:117`) | `JSON.stringify` throwing falls back to `String(value)` in both components (`CellHoverPreview.tsx:67-69`, `CellInspectorModal.tsx:98-100`); in `GridRow.formatCellValue` it falls back to `'[Object]'` (`GridRow.tsx:20`). |
| string that *looks* like JSON | `String(value)` — the raw string is copied, **not** re-serialised | pretty-printed: the string is `JSON.parse`d then re-stringified with indent (`CellHoverPreview.tsx:73-84`) | same (`CellInspectorModal.tsx:103-114`) | Detection is purely first/last character: starts with `{` and ends `}` **or** starts with `[` and ends `]` (lines 73-76 / 103-106). |
| date / timestamp | `String(value)` — the raw PG string verbatim | `String(value)` (line 71) | same | Values arrive as JSON strings; nothing in the explorer constructs `Date` instances (see Dead/Unused §). The `value instanceof Date` branch exists at `GridRow.tsx:15` but has no producer. |
| short text | `String(value)` | `String(value)` | same | |
| long text | `String(value)` — **no truncation on any copy path** | `String(value)` | `String(value)` | The grid cell only *displays* a CSS-truncated value (`GridRow.tsx:135` `truncate`); the copy uses the untruncated raw value. |

### 1.3 Confirmation affordances (verbatim)

- Grid cell: absolute pill, `Check` icon + text `Copied` — `GridRow.tsx:174-177`.
- Hover card: icon swap `Copy` → `Check` with `text-emerald-500`; `title` attribute `'Copy cell text'` → `'Copied to clipboard'` — `CellHoverPreview.tsx:177-183`.
- Inspector: button label `Copy` → `Copied`, plus `toast.success('Cell content copied to clipboard')` — `CellInspectorModal.tsx:150,287`.
- Stats panel: icon swap only, `title="Copy statistics"` never changes — `ColumnStatsPanel.tsx:89-90`.
- Empty state: icon swap + `toast.success('Copied to clipboard')` — `EmptyState.tsx:60,159-163`.

---

## 2. Cell hover preview ("quick peek")

### 2.1 Trigger and suppression

| Rule | Value | Citation |
| --- | --- | --- |
| Expandable predicate (per cell) | `value !== null && value !== undefined && (formattedText.length > 18 \|\| formattedText.includes('\n'))` | `src/components/data-explorer/grid/GridRow.tsx:98-101` |
| Open delay | `450` ms | `src/components/data-explorer/TableGrid.tsx:554-565` |
| Close grace after cell mouseleave | `200` ms | `src/components/data-explorer/TableGrid.tsx:574-576` |
| Re-checked inside the timer | `if (isScrollingRef.current) return;` | `src/components/data-explorer/TableGrid.tsx:551,555` |
| Scroll freeze | any `scroll` on the grid container **or** `window` clears the pending timer and nulls the card; previews are disabled for `150` ms after the last scroll event | `src/components/data-explorer/TableGrid.tsx:96-115` (timer at 108-110) |
| Card self-close | `onMouseLeave={onClose}` — immediate, no grace | `src/components/data-explorer/grid/CellHoverPreview.tsx:146` |
| Card re-open grace | `onMouseEnter` calls `onKeepOpen()`, which clears `closeTimerRef` | `CellHoverPreview.tsx:145` + `TableGrid.tsx:850-855` |
| Escape | window `keydown` → `onClose()` | `CellHoverPreview.tsx:28-34` |
| Outside `mousedown` | `document` listener, attached after a `50` ms `setTimeout` so the opening click does not immediately close it | `CellHoverPreview.tsx:37-50` |
| Double-click | clears `hoverTimerRef`, opens the inspector, nulls the card | `TableGrid.tsx:517-533` |

Consequence: a cell whose formatted text is ≤ 18 characters and single-line never shows the card, and also never shows the in-cell `Maximize2` button (same predicate, `GridRow.tsx:158`). Such cells can still be opened in the inspector by double-clicking the cell (`TableGrid.tsx:522`) — double-click works for every non-null cell regardless of length.

### 2.2 What it renders

- Rendered through `createPortal(..., document.body)` with `position: fixed`, `z-[9999]` — `CellHoverPreview.tsx:130-138,238-239`.
- Header: JSON icon `Braces` (amber) when the value parsed as JSON, else `FileText` (primary) — lines 151-155; column name truncated with the full name in `title` (line 156); type chip rendered via `formatShortType(data.columnType)` with the full type in `title` (lines 159-164); `Row #{rowNumber}` (line 170).
- Content: **the full value, not a truncated one.** Scroll container `max-h-[230px] overflow-y-auto`, `whitespace-pre-wrap break-words` — lines 205-210. JSON is pretty-printed with 2-space indent (line 214); non-JSON is `textValue` (line 216); `null` renders italic `NULL` (lines 211-212).
- Footer: `{charCount.toLocaleString()} chars` and, only when `lineCount > 1`, ` · {lineCount} lines` (lines 222-224); hint text `Esc to close` (line 226); action link `Full inspector` (lines 228-234).
- `charCount` is `raw.length` (compact form) while `lineCount` is computed from the pretty form when JSON (`CellHoverPreview.tsx:87,92`) — for JSON the character count does not match the visible text length.
- Actions: copy icon button (lines 172-184), expand `Maximize2` button `title="Inspect in modal (Double-click)"` (lines 185-193), bare `X` close button `title="Close preview"` (lines 194-200), plus the footer `Full inspector` button (lines 228-234).

### 2.3 Positioning

All constants are declared inline in the render body, not memoised:

- `cardWidth = 380`, `estimatedHeight = 260`, `padding = 12` — `CellHoverPreview.tsx:100-102`.
- Horizontal: starts at `rect.left`; if `left + 380 > window.innerWidth - 12` it is pulled to `window.innerWidth - 380 - 12`; then floored at `12` — lines 104-108.
- Vertical: `spaceBelow = window.innerHeight - rect.bottom`; renders **above** when `spaceBelow < 260 + 20 && rect.top > 260`, at `max(12, rect.top - 260 - 8)`; otherwise **below** at `min(window.innerHeight - 260 - 12, rect.bottom + 6)` — lines 111-115.
- Height is estimated, never measured; the 230 px content cap means a tall JSON value is taller than `estimatedHeight`.
- The rect is captured once at hover time via `e.currentTarget.getBoundingClientRect()` inside the 450 ms timer — `TableGrid.tsx:556`.

---

## 3. Cell inspector modal

### 3.1 Open / close

Opened by:
- double-click on any non-null cell — `TableGrid.tsx:517-533` (guarded by `value !== null && value !== undefined`, line 522);
- the in-cell `Maximize2` button, rendered only when the expandable predicate passes — `GridRow.tsx:158-170`, `title="Inspect in full modal (Double-click)"`;
- the hover card's `Maximize2` button (`CellHoverPreview.tsx:185-193`) or its `Full inspector` link (`CellHoverPreview.tsx:228-234`), both calling `onOpenInspector(data)` then `onClose()` (`CellHoverPreview.tsx:124-128`).

Closed by: Radix `onOpenChange` when `open` goes false (`CellInspectorModal.tsx:155`), i.e. Escape, overlay click, or the built-in `X` (`src/components/ui/dialog.tsx:45-48`); the footer button labelled `Close (Esc)` (`CellInspectorModal.tsx:337-339`); and the parent setting `inspectorData` to `null` (`TableGrid.tsx:870`).

### 3.2 Data loading

The modal **never fetches anything**. It receives the already-loaded cell value as a prop (`CellInspectorModal.tsx:36`, `25-33`). Row stepping reads the in-memory `displayedRows` array in the parent: `const targetRow = displayedRows[newIndex]`, then `value: targetRow[inspectorData.columnName]` — `TableGrid.tsx:221-237`. There is no on-demand request, no abort, no loading state.

Guard: if `newIndex` is out of range or `targetRow` is falsy the navigation is a no-op (`TableGrid.tsx:225-227`), so stepping is limited to rows already loaded into the current page set.

When opened from the hover card, `CellHoverData` is spread into `CellInspectorData` and `tableName`/`schemaName` appended — `TableGrid.tsx:856-863`. The spread carries the extra `rect` property into `inspectorData`; it is never read by the modal.

### 3.3 Size / row guards

| Guard | Value | Citation |
| --- | --- | --- |
| Modal box | `max-w-3xl w-[92vw] h-[600px] max-h-[88vh]` | `CellInspectorModal.tsx:156` |
| Row-step availability | `hasPrevRow = rowIndex > 0`, `hasNextRow = rowIndex < displayedRows.length - 1` | `TableGrid.tsx:871-872` |
| Step button `disabled` | mirrors the same booleans | `CellInspectorModal.tsx:194,205` |
| Keyboard stepping | `ArrowLeft`/`ArrowRight`, only when `hasPrevRow`/`hasNextRow`, and **skipped when `document.activeElement` is `INPUT` or `TEXTAREA`** | `CellInspectorModal.tsx:59-73` |
| Value size | no cap; content pane is `flex-1 overflow-auto` and line-count is unbounded | `CellInspectorModal.tsx:293-324` |
| `null` open | blocked at the caller (`TableGrid.tsx:522`) yet still rendered if it ever occurs: `data.value === null` → italic `NULL` | `CellInspectorModal.tsx:299-300` |

### 3.4 Content

- Header: column name (`DialogTitle`), `formatShortType` type chip with full type in `title`, and the subtitle `{schemaName}.{tableName} · Row #{rowNumber}` — `CellInspectorModal.tsx:169-184`.
- Toolbar: JSON-only `Formatted JSON` / `Raw Text` segmented toggle (lines 218-243, hidden entirely for non-JSON); word-wrap toggle showing `Wrap On` / `Wrap Off` with `title` `'Disable word wrap'` / `'Enable word wrap'` (lines 246-258); search box `placeholder="Find in cell…"` (lines 261-275); copy button (lines 280-288).
- Content: one row per line with a `w-12` right-aligned line-number gutter starting at 1, and blank lines rendered as `\u00A0` — lines 302-322.
- Footer stats: `{charCount.toLocaleString()} characters · {wordCount.toLocaleString()} words · {lineCount.toLocaleString()} lines · {(byteSize / 1024).toFixed(1)} KB` — lines 329-335.
- Derived-value details: `charCount = raw.length` (compact form, line 126); `wordCount` from `raw.trim().split(/\s+/)` (line 119); `lineCount` from the **active** text, so it changes with `viewMode` (lines 117-118); `byteSize = new Blob([activeText]).size`, i.e. UTF-8 byte length of the active text (line 120). Memo deps are `[data, viewMode]` (line 131) — `wrapLines` is a pure class toggle (line 311) and correctly excluded.
- Find: the search term is regex-escaped (`/[.*+?^${}()|[\]\\]/g → '\\$&'`) and matched case-insensitively with `g` (lines 139-143, 348). The match count shown in the input's right gutter is the number of matches in `activeContent` (line 142). Matches are wrapped in `<mark className="bg-amber-400/30 …">` (line 354). There is no next/previous-match navigation and no scroll-into-view.
- Discrepancy: `matchCount` trims the term (`if (!searchTerm.trim()) return 0`, line 140) but `HighlightedLine` compares against the **untrimmed** `search` (line 353), so a term with a leading/trailing space yields a non-zero count that highlights nothing.

---

## 4. Column Stats Panel

### 4.1 Open / close, container type

- **Container**: a plain in-flow `<div>`, not a Radix Dialog/Drawer — no portal, no overlay, no backdrop, no focus trap, no Escape handler, no `role`. `className="h-full w-80 bg-card border-l border-border shadow-xl z-30 flex flex-col animate-in slide-in-from-right duration-200"` — `ColumnStatsPanel.tsx:75`. Width `w-80` = 320 px; enter animation `duration-200`.
- **Opens**: clicking the column header `<th>` (`ColumnHeader.tsx:81` → `handleHeaderClick`, lines 38-40 → `TableGrid.handleColumnClick`, lines 284-286). The handler toggles: clicking the same header again sets `selectedColumn` to `null` and closes the panel. Sorting is stopped from propagating so the sort button does not open the panel (`ColumnHeader.tsx:32`), and the column resize handle also stops propagation (`ColumnHeader.tsx:135`).
- **Closes**: the header `X` icon button (`ColumnStatsPanel.tsx:93-95`), or `onFilterFromStats` firing from a top-value row, which calls `onClose()` after the filter is added (`ColumnStatsPanel.tsx:69-72`).
- **Auto-closes**: `setSelectedColumn(null)` on table/schema/connection change (`TableGrid.tsx:143`).
- Rendered only when `selectedColumn` is non-null, as a sibling of the scroll container inside the grid's flex row (`TableGrid.tsx:833-843`).

### 4.2 Data source

`useColumnStats(connectionId, tableName, schemaName, columnName)` — `ColumnStatsPanel.tsx:37`.

- Query key `[...dataExplorerKeys.stats(connectionId, tableName, schemaName), column ?? 'all']`, `enabled: !!connectionId && !!tableName`, `staleTime: 60_000` — `api/hooks.ts:123-135`.
- Transport: `GET /api/data/{connectionId}/tables/{encodeURIComponent(tableName)}/stats?schemaName=…&column=…` — `api/api.ts:97-111`.
- **Every statistic below is computed server-side** (the SW Agent / Postgres side). The frontend only formats. The `approx` flag and the tooltip "Values are approximate, computed from Postgres statistics (pg_stats), not a full scan." (`ColumnStatsPanel.tsx:149`) confirm min/max/quantiles/histogram can come from `pg_stats` (`api/types.ts:135`).
- A second, cheaper query supplies per-header tooltips: `useColumnHeaderProfiles` with `mode=pg_stats` (`api/hooks.ts:143-154`, `api/api.ts:150`). Its tooltip slices `topValues.slice(0, 3)` (`ColumnHeader.tsx:151`).
- The response is additionally narrowed client-side: `data?.columns.find(c => c.name === columnName)` — `ColumnStatsPanel.tsx:38`.
- Loading state: 2 header skeletons plus a 2×2 grid of `h-16` skeleton cards (`ColumnStatsPanel.tsx:101-112`).
- Error state: `Failed to load statistics` + `getExplorerErrorMessage(error)` + optional `getExplorerErrorHint(error)` (`ColumnStatsPanel.tsx:113-122`), resolved through the code→text catalog in `api/errors.ts:12-208`.

### 4.3 Every statistic rendered

| # | Statistic | Rendered as | Source field | Computation site | Where |
| --- | --- | --- | --- | --- | --- |
| 1 | Column SQL type | monospace `text-xs`, `Type` icon; `nullable` chip appended | `type`, `nullable` | server | `ColumnStatsPanel.tsx:128-132` |
| 2 | Semantic type badge | pill, `label` + `tone` | `name`, `type`, `sampleValues` | **client** (`detectSemanticType`) | `ColumnStatsPanel.tsx:41-44,81-85`; `api/data-profiling.ts:27-73` |
| 3 | Primary Key flag | amber pill `Primary Key` | `isPrimaryKey` | server | `ColumnStatsPanel.tsx:136-140` |
| 4 | Indexed flag | green pill `Indexed`, rendered **only when not a PK** | `isIndexed` | server | `ColumnStatsPanel.tsx:141-145` |
| 5 | Approximate flag | grey pill `approximate` + pg_stats tooltip | `approx` | server | `ColumnStatsPanel.tsx:146-153` |
| 6 | Null % | `${nullPercent.toFixed(1)}%`, `?` when null; turns amber when `nullPercent > 50` | `nullPercent` | server; rounding + colour threshold client | `ColumnStatsPanel.tsx:158-163` |
| 7 | Distinct | `formatCompactNumber(distinctCount)`, `—` when null | `distinctCount` | server; compaction client | `ColumnStatsPanel.tsx:164-168`; `shared/lib/format.ts:128-132` |
| 8 | Min | `formatValue(minValue)`, card hidden when null/undefined; `~` prefix when `approx` | `minValue` | server; formatting client | `ColumnStatsPanel.tsx:169-171` |
| 9 | Max | `formatValue(maxValue)`, same rules | `maxValue` | server; formatting client | `ColumnStatsPanel.tsx:172-174` |
| 10 | Avg | `formatCompactNumber(avgValue)`, `Sigma` icon, card hidden when null/undefined | `avgValue` | server; compaction client | `ColumnStatsPanel.tsx:175-177` |
| 11 | Std dev | `formatCompactNumber(stdDevValue)`, card hidden when null/undefined | `stdDevValue` | server; compaction client | `ColumnStatsPanel.tsx:178-180` |
| 12 | Quantiles q25 / q50 / q75 | three compact cards, whole section hidden when `quantiles` is null; `(approx)` suffix | `quantiles.{q25,q50,q75}` | server; `fmtVal` client | `ColumnStatsPanel.tsx:184-196`, `354` |
| 13 | Data completeness | label + `{100 - nullPercent.toFixed(1)}%` and a 1.5-unit-tall bar at `width: 100 - nullPercent` %, `0%` when nullPercent is null | `nullPercent` | **derived client-side** | `ColumnStatsPanel.tsx:199-210` |
| 14 | FK reference | section `References`: target table + `columns.join(', ')` + `View` button (`ExternalLink`) | `column.fkReference` (from `ColumnInfo`, not from stats) | server (schema metadata) | `ColumnStatsPanel.tsx:44,214-241` |
| 15 | Distribution (histogram) | one row per bin: `bin.label ?? bin.bucket` (truncated `max-w-[180px]`, `title` = label) + `{bin.percent.toFixed(1)}%` + bar at `width: bin.percent%`; section hidden when `histogram` is empty; `(approx)` suffix | `histogram[].{label,bucket,percent}` | server; rounding client | `ColumnStatsPanel.tsx:244-271` |
| 16 | Top Values | per item: value (`NULL` for null, else `String(value) \|\| '(empty)'`) + `{percent.toFixed(1)}%` + bar at `width: percent%`; hidden when empty | `topValues[].{value,percent}` | server; rounding client | `ColumnStatsPanel.tsx:274-283,314-342` |
| 17 | Filter-from-top-value | `Filter` icon button revealed on row hover, `title` = `Filter rows where value = ${item.value}`; rendered only when `onFilterFromStats` was supplied **and** `item.value !== null` | `topValues[].value` | client | `ColumnStatsPanel.tsx:279,323-331` |
| 18 | Sample Preview | `Sample Preview` chips, `String(val) \|\| '(empty)'`, `title` = `String(val)`; hidden when empty | `sampleValues` | server | `ColumnStatsPanel.tsx:286-301` |
| 19 | Fallback (no stats) | `BarChart3` icon + `No statistics available` | — | — | `ColumnStatsPanel.tsx:303-308` |

Client-side value formatter used by Min/Max — `ColumnStatsPanel.tsx:344-352`:

```
null/undefined        -> '—'
number                -> val.toLocaleString()
string w/ 'T' or '-'  -> new Date(val) ; if valid -> toLocaleDateString()
otherwise             -> String(val)
```

`fmtVal` (used for quantiles) is the naive form: `null/undefined → '—'`, else `String(val)` — `ColumnStatsPanel.tsx:354`.

### 4.4 Thresholds, precision, rounding

| Number | Meaning | Citation |
| --- | --- | --- |
| `> 50` | `nullPercent` above which the Null % card turns amber | `ColumnStatsPanel.tsx:162` |
| `toFixed(1)` | Null % card | `ColumnStatsPanel.tsx:161` |
| `toFixed(1)` | completeness percentage | `ColumnStatsPanel.tsx:202` |
| `toFixed(1)` | histogram bin percent | `ColumnStatsPanel.tsx:259` |
| `toFixed(1)` | top-value percent | `ColumnStatsPanel.tsx:322` |
| `1_000_000` / `1_000` | `formatCompactNumber` compaction to `M` / `K`, one decimal; below 1000 it returns `String(num)` (no separators) | `shared/lib/format.ts:128-132` |
| `w-80` | panel width 320 px | `ColumnStatsPanel.tsx:75` |
| `duration-200` | slide-in animation | `ColumnStatsPanel.tsx:75` |
| `max-w-[180px]` | histogram bin label and top-value label truncation | `ColumnStatsPanel.tsx:256,318` |
| `slice(0, 3)` | top values shown in the *header tooltip* (not the panel) | `ColumnHeader.tsx:151` |
| `60_000` ms | `staleTime` for the stats query | `api/hooks.ts:133` |
| `1500` ms | stats-copy confirmation | `ColumnStatsPanel.tsx:63` |

### 4.5 Copy-statistics report format (verbatim, line by line)

`ColumnStatsPanel.tsx:48-59`:

```
Column: {name} ({type}[, nullable])
Null: {nullPercent ?? '?'}% ({nullCount ?? '?'})
Distinct: {formatCompactNumber(distinctCount ?? 0)}
Min: {formatValue(minValue)}
Max: {formatValue(maxValue)}
Avg: {avgValue ?? '—'}
Std dev: {stdDevValue ?? '—'}
q25/q50/q75: {q25} / {q50} / {q75}      // only when columnStats.quantiles is truthy
```

### 4.6 Filter-from-stats

`handleFilterValue` calls `onFilterFromStats(columnName, value)` then `onClose()` (`ColumnStatsPanel.tsx:69-72`). The parent dedupes: it skips the append when an identical `{column, operator: 'eq', value}` filter already exists, then scrolls the grid to `top: 0, left: 0` (`TableGrid.tsx:312-320`).

---

## 5. Empty & error states — `EmptyState.tsx`

`EmptyState` has exactly **two** render branches, selected by `hasConnection` (`EmptyState.tsx:66,181`). It contains no error state, no loading state and no retry affordance.

The parent renders `EmptyState` only when the view is not AI and not `selectedTable && connectionId` (`DataExplorerLayout.tsx:670-688`), so the `else` branch implies "connected but no table chosen".

| # | Condition | Verbatim copy | Actions | Citation |
| --- | --- | --- | --- | --- |
| 1 | `!hasConnection` — hero card heading | `No connection selected` | — | `EmptyState.tsx:139-141` |
| 2 | `!hasConnection` — hero card body | `Choose a database from the top bar or connect your PostgreSQL instance to start exploring.` | — | `EmptyState.tsx:142-144` |
| 3 | `!hasConnection` — video status label | `Architecture Preview` (with a pulsing emerald dot) | — | `EmptyState.tsx:110-112` |
| 4 | `!hasConnection` — video tabs | `Terminal Flow`, `Architecture Flow` (from `/pg_connector_cinematic.mp4`, `/pg_connector_flow.mp4`) | Two tab buttons, `type="button"`, switching `selectedVideo` | `EmptyState.tsx:16-27,115-129` |
| 5 | `!hasConnection` — terminal copy pill | Displayed (truncated) text: `npm i -g @vivekmind/pg-connector`; **clipboard payload**: `npm i -g @vivekmind/pg-connector && pg-connector start` | One button, `title="Click to copy setup command"`; on click fires `toast.success('Copied to clipboard')` and swaps the icon for 2000 ms | `EmptyState.tsx:149-164`, payload at `151`, `title` at `153`, toast/timeout at `60-61` |
| 6 | `!hasConnection` — primary CTA | `Add Connection` | `<Button>` rendered **only when `onOpenConnectWizard` is supplied** | `EmptyState.tsx:167-176` |
| 7 | `hasConnection` and no table selected — heading | `Select a table` | none | `EmptyState.tsx:187` |
| 8 | `hasConnection` and no table selected — body | `Pick a table from the sidebar to view its data` (with a left arrow icon) | none | `EmptyState.tsx:188-191` |
| 9 | Transient, after the copy pill is clicked | icon swap `Copy` → `Check`; `toast.success('Copied to clipboard')` | resets after `2000` ms | `EmptyState.tsx:57-62,159-163` |

Both video assets and `resona.png` referenced elsewhere in this section exist in `public/` (`public/pg_connector_cinematic.mp4`, `public/pg_connector_flow.mp4`, `public/resona.png`).

Video behaviour: `muted` is hard-enforced three ways (`video.muted`, `video.defaultMuted`, `video.volume = 0`) and `play()` is called with a swallowing `.catch` — `EmptyState.tsx:35-55`. `onEnded` calls `play()` again as a loop fallback (lines 88-91). The inactive video is rendered as a hidden preloading `<video aria-hidden="true">` for 0 ms tab switching (lines 96-105). `onContextMenu` is prevented on the player container (line 73).

### Adjacent non-cell empty/error states (for completeness, owned by other sections)

| State | Condition | Copy | Citation |
| --- | --- | --- | --- |
| Sidebar loading | `isLoading` | 8 skeleton rows | `TableSidebar.tsx:48-60` |
| Sidebar error | `error` | `Failed to load tables` + catalog message + optional hint + `Try again` button | `TableSidebar.tsx:62-91` |
| Sidebar no connection | `!hasConnection` | `Select a connection` | `TableSidebar.tsx:93-99` |
| Sidebar no tables | `tables.length === 0` | `No tables found` | `TableSidebar.tsx:101-108` |
| Sidebar no search match | `filteredTables.length === 0 && searchTerm` | `No match for "{searchTerm}"` | `TableSidebar.tsx:139-145` |
| Grid no rows, filtered | `displayedRows.length === 0 && filters.length > 0` | `No rows match your filters` + `Clear filters` | `TableGrid.tsx:770-775` |
| Grid no rows | `displayedRows.length === 0 && filters.length === 0` | `This table is empty` | `TableGrid.tsx:776-780` |
| Grid error | `error && allRows.length === 0` | `getExplorerErrorTitle(error)` + message + hint + `Retry` | `TableGrid.tsx:603-629` |
| Stats error | `error` | `Failed to load statistics` + message + hint | `ColumnStatsPanel.tsx:113-122` |
| Stats no data | not loading, no error, `columnStats` undefined | `No statistics available` | `ColumnStatsPanel.tsx:303-308` |

---

## 6. Table sidebar AI shortcut

- Entry point: a `14×14` px `<img src="/resona.png" alt="AI">` rendered at the right of each table row, but **only when `onOpenAIForTable` is supplied** — `TableSidebar.tsx:178-186`. It is `opacity-0 group-hover:opacity-100`, i.e. invisible until the row is hovered (`TableSidebar.tsx:181`).
- Context passed: **only `table.name`** — `onOpenAIForTable(table.name)` at `TableSidebar.tsx:180`, matching the signature `(tableName: string) => void` (`TableSidebar.tsx:28`). No schema, no row, no filters are passed. `e.stopPropagation()` prevents the row's own `onTableSelect` from firing (`TableSidebar.tsx:180`), so the clicked table is **not** selected and the grid is not scrolled to it.
- `title` = `Ask AI about ${table.name}` — `TableSidebar.tsx:182`.
- Handler implementation: `setAiContextTable(tableName); setMode('ai');` — `src/pages/DataExplorerPage.tsx:454-457`. This is a direct switch of the top-level `ViewMode` to the Resona AI chat view (`DataExplorerPage.tsx:90`, `456`).
- Schema for the AI context is bound separately and independently of the click: `aiContextSchema={selectedTable.schema}` — `DataExplorerPage.tsx:460`, whose backing state is `{ table: null, schema: 'public' }` (`DataExplorerPage.tsx:91-94`) and is updated via `onTableSelectChange` (`DataExplorerLayout.tsx:397-407`). In practice the sidebar only lists tables of the currently selected schema (`DataExplorerLayout.tsx:555-574`), so the two normally coincide — but they are derived from different state and are not coupled in the click handler.
- Prop relay: `DataExplorerPage.tsx:454` → `DataExplorerLayout.tsx:123,144` → `DataExplorerLayout.tsx:573` → `TableSidebar.tsx:28,40`.
- Downstream consumption: `aiContextTable` / `aiContextSchema` reach `AIChatMain` (`DataExplorerLayout.tsx:662-663` → `src/components/ai/AIChatMain.tsx:242-243`) and are consumed at send time as `const effectiveTables = aiContextTable ? [aiContextTable] : []` and `const effectiveSchema = aiContextSchema || 'public'` (`src/components/ai/chat/hooks/useChatSendOrchestrator.ts:95-96`, and again at `223-224` when no `@`-mentioned tables are present). They also seed the chat empty-state suggestion chips (`src/components/ai/chat/components/ChatEmptyState.tsx:52-57`).
- Lifetime: `aiContextTable` is set once and never cleared — the only references in `DataExplorerPage.tsx` are lines 90, 455 and 459. The AI context therefore persists after the user navigates back to the explorer.

---

## 7. Accessibility

### Cell inspector modal

- Radix `Dialog` root with `open` / `onOpenChange` (`CellInspectorModal.tsx:155`, `ui/dialog.tsx:7`), which supplies `role="dialog"`, `aria-modal`, focus trapping, focus-on-open, focus restore on close, and Escape-to-close (`ui/dialog.tsx:34-49`).
- Accessible name comes from `DialogTitle` = the column name (`CellInspectorModal.tsx:171-173`, `ui/dialog.tsx:64-74`). **No `DialogDescription` is rendered**, so the dialog has no accessible description (`ui/dialog.tsx:76-82` is exported but unused here).
- The built-in close button carries `<span className="sr-only">Close</span>` (`ui/dialog.tsx:45-48`); the footer button adds visible text `Close (Esc)` (`CellInspectorModal.tsx:337-339`).
- Header row navigation buttons are real `<button>`s with visible text `Prev Row` / `Next Row` and `title` `'Previous Row (Left Arrow)'` / `'Next Row (Right Arrow)'` (`CellInspectorModal.tsx:189-210`).
- `ArrowLeft` / `ArrowRight` step rows, suppressed while an `INPUT`/`TEXTAREA` has focus (`CellInspectorModal.tsx:59-73`).
- The `Formatted JSON` / `Raw Text` toggle is a pair of plain `<button>`s with no `aria-pressed` / `role="tab"` (`CellInspectorModal.tsx:220-242`); the active state is conveyed by class only.
- The content region is a scrollable `<div>` with `select-text` and no `role="region"` / `tabIndex` / `aria-label` (`CellInspectorModal.tsx:293-298`), so it is not keyboard-scrollable.
- Search uses a shadcn `Input` with a `placeholder` but **no `<label>` and no `aria-label`** (`CellInspectorModal.tsx:263-269`).

### Cell hover preview

- **No ARIA at all**: no `role`, no `aria-*`, no `aria-expanded`, no `aria-live`. The card is an unlabelled `<div>` portalled onto `document.body` (`CellHoverPreview.tsx:130-147`).
- Icon-only controls rely on `title` alone, which is not reliably announced: copy `title="Copy cell text"` / `'Copied to clipboard'` (line 177), expand `title="Inspect in modal (Double-click)"` (line 190), close `title="Close preview"` (line 197).
- Escape closes it via a `window` listener (`CellHoverPreview.tsx:28-34`) — it is not dismissible by Tab-out, because it is not focus-managed.
- `onClick={(e) => e.stopPropagation()}` on the card root plus a 50 ms-delayed outside-`mousedown` listener are the pointer dismissal paths (`CellHoverPreview.tsx:37-50,144`).
- The card is only reachable by keyboard by tabbing into its three buttons; it is never focused programmatically.

### Column stats panel

- **No ARIA and no focus management**: plain `<div>` container with no `role="complementary"`, no `aria-label`, no Escape handler, no backdrop, no focus trap (`ColumnStatsPanel.tsx:75`).
- The `X` close button has **no `title` and no `aria-label`** — only an unlabelled `X` icon (`ColumnStatsPanel.tsx:93-95`).
- Header buttons: `title="Copy statistics"` (`ColumnStatsPanel.tsx:89`); FK drill-in `title={\`Open table ${fkReference.table}\`}` plus visible text `View` (lines 233-237).
- Top-value filter trigger is a `<button>` revealed by `opacity-0 group-hover:opacity-100` with a `title` (`ColumnStatsPanel.tsx:324-330`) — pointer-only discovery, though it remains in the tab order.

### Grid cells

- Cells are `<td>` with `cursor-default`; copy and expand are `<button type="button">` revealed by `opacity-0 group-hover/cell:opacity-100` (`GridRow.tsx:141-157`, `158-170`). Both use `title` only (`'Copy cell value'`, `'Inspect in full modal (Double-click)'`) — no `aria-label`.
- The copied confirmation pill is a `<span>` and is not announced (`GridRow.tsx:173-178`).

### Table sidebar AI shortcut

- Implemented as a `<span onClick>` nested **inside** the row `<button>` (`TableSidebar.tsx:152,178-186`). Nested interactive content inside a `<button>` is invalid HTML; the click is only reachable by pointer.
- No `role="button"`, no `tabIndex`, no `onKeyDown` — **not keyboard operable at all**. Visibility is `opacity-0 group-hover:opacity-100` (line 181), so it also does not appear on keyboard focus.
- The inner `<img>` does have `alt="AI"` (`TableSidebar.tsx:184`).

### Empty state

- The hero `<video>` has no `aria-label`/`aria-hidden`, though it is `pointer-events-none` and decorative (`EmptyState.tsx:76-93`); the hidden preload videos are correctly `aria-hidden="true"` (line 103).
- The video switcher uses real `<button type="button">` elements with text labels (`EmptyState.tsx:116-129`).
- The copy pill is a real `<button type="button">` with a `title`; the `Add Connection` CTA is a real `<Button>` (`EmptyState.tsx:149-154,167-176`).

---

## 8. Clipboard, download and async behaviour

**Clipboard summary**

| Concern | Finding |
| --- | --- |
| False-positive confirmation | `GridRow.handleCopy` awaits `onCopyCell` and then unconditionally sets the copied state (`GridRow.tsx:58-64`), while `TableGrid.handleCopyCell` swallows clipboard failures in an empty `catch` (`TableGrid.tsx:383-388`). The `Copied` pill therefore appears even when the write failed. |
| Unhandled rejections | `CellHoverPreview.tsx:119`, `CellInspectorModal.tsx:148` and `EmptyState.tsx:58` all call `navigator.clipboard.writeText(...)` without `await` and without `.catch`. |
| Silent failure | `ColumnStatsPanel.handleCopyStats` swallows the error (`ColumnStatsPanel.tsx:64-66`) and, because `setCopied(true)` is inside the `try` after the `await`, a failure leaves no visual feedback whatsoever. |
| Only handled path | The dataset-level copy logs and toasts: `logger.error('Failed to copy rows:', err)` + `toast.error('Failed to copy to clipboard')` (`TableGrid.tsx:416-419`). |
| Guard | Dataset copy refuses up front when there is nothing to copy: `toast.error('No data available to copy')` (`TableGrid.tsx:391-394`). |
| Serialisation safety | Every `JSON.stringify` call site is wrapped in `try/catch` with a fallback (`TableGrid.tsx:402-404`, `CellHoverPreview.tsx:63-69`, `CellInspectorModal.tsx:94-100`, `GridRow.tsx:17-21`). |

**Downloads**: none. No `download` attribute, anchor, or `fetchTableExport` call exists in any file in this section. `ColumnStatsPanel.tsx:235` imports `ExternalLink` but uses it for the FK `View` navigation button, not a download.

**Async**

| Behaviour | Detail | Citation |
| --- | --- | --- |
| Stats fetch | React Query, `enabled` on connection+table, `staleTime: 60_000`, no `gcTime` override, no `refetchInterval` | `api/hooks.ts:123-135` |
| Header profile fetch | Separate `mode=pg_stats` query, `staleTime: 60_000`; comment: "single cheap pg_stats-only profile for every column" | `api/hooks.ts:137-154`, `TableGrid.tsx:125-126` |
| Stats cache invalidation | The grid refresh button invalidates `dataExplorerKeys.stats(...)` alongside rows/tables/schemas | `TableGrid.tsx:354-379` |
| Stats prefetch | `usePrefetchColumnStats` exists but has **no callers** (see Dead/Unused) | `api/hooks.ts:188-197` |
| Per-table state reset | On `connectionId`/`schemaName`/`tableName` change: sort, filters, hidden columns, `selectedColumn`, `copiedDataset`, widths are all reset and the grid scrolls to origin | `TableGrid.tsx:137-147` |
| Timers created in this section | `450` hover open, `200` hover close, `150` scroll-stop, `50` outside-click attach, `1500`/`1500`/`2000`/`1500`/`2000` confirmation resets, `1500` cell-copy reset, `2000` dataset-copy reset | see §4.4 and §1.1 |

---

## Contradictions and defects found

1. **`NULL` cells display `NULL` but copy an empty string.** `CellHoverPreview.tsx:211-212` and `CellInspectorModal.tsx:299-300` render the literal `NULL`, while `textValue`/`rawText` are short-circuited to `''` at `CellHoverPreview.tsx:54-56` and `CellInspectorModal.tsx:77-87`, and those are what `handleCopy` writes (lines 119 / 148).
2. **The `'NULL'` branch of `handleCopyCell` is unreachable.** `TableGrid.tsx:382` maps `null → 'NULL'`, but `GridRow` never renders the copy button for `null` (`GridRow.tsx:122-123`) and `TableGrid.tsx:522` blocks `null` from opening the inspector.
3. **Boolean cells have no copy affordance at all.** They render only the coloured pill (`GridRow.tsx:124-132`); `formattedText` is `'true'`/`'false'` (≤ 18 chars, no newline) so the expandable predicate is false, meaning neither the copy nor the `Maximize2` button is produced.
4. **Copy confirmation can lie.** `GridRow.tsx:58-64` shows `Copied` regardless of whether `TableGrid.tsx:383-388`'s clipboard write succeeded.
5. **Character count is inconsistent with what is displayed for JSON.** `CellHoverPreview.tsx:92` uses `raw.length` (compact) while `lineCount` at line 87 uses the pretty form.
6. **Search count vs highlight disagree on whitespace.** `matchCount` trims (`CellInspectorModal.tsx:140`) but `HighlightedLine` compares the raw term (`CellInspectorModal.tsx:353`).
7. **AI shortcut is pointer-only and nested inside a `<button>`** (`TableSidebar.tsx:152,178-186`) — invalid nesting, no `tabIndex`, no `role`, invisible to keyboard focus.
8. **AI context schema is not derived from the clicked table.** `TableSidebar.tsx:180` passes only `table.name`; `DataExplorerPage.tsx:460` supplies the schema from unrelated `selectedTable.schema` state.

---

## Dead / Unused Code

| Item | Evidence |
| --- | --- |
| `searchInputRef` in the cell inspector — declared and attached, never read; there is no autofocus on the find box | `src/components/data-explorer/grid/CellInspectorModal.tsx:56,264` |
| `usePrefetchColumnStats` — exported from the api barrel, zero call sites in `src/` | `src/components/data-explorer/api/hooks.ts:188-197`, `src/components/data-explorer/api/index.ts:55` |
| `value instanceof Date` branch in `formatCellValue` — nothing in the explorer constructs `Date` instances from API row data (the only `new Date(` uses are in `ColumnStatsPanel.formatValue` and export filenames) | `src/components/data-explorer/grid/GridRow.tsx:15` |
| `data.value === null` render branches — unreachable through the grid, which never opens the preview/modal for `null` | `CellHoverPreview.tsx:211-212`, `CellInspectorModal.tsx:299-300` |
| `'NULL'` branch of `handleCopyCell` — see Contradiction 2 | `TableGrid.tsx:382` |
| `ColumnStatsResponse.totalRows`, `.sizeBytes`, `.statsCollectedAt` — declared on the response type, never read anywhere in `src/` | `src/components/data-explorer/api/types.ts:143-145` |
| `TopValue.count` — fetched and typed, never rendered; the panel shows only `percent` | `api/types.ts:103`; panel at `ColumnStatsPanel.tsx:314-342` |
| `HistogramBin.count` — fetched and typed, never rendered | `api/types.ts:115`; panel at `ColumnStatsPanel.tsx:253-268` |
| `HistogramBin.bucket` — used only as a display fallback when `label` is absent | `api/types.ts:114`; `ColumnStatsPanel.tsx:257` |
| `cellKey` second parameter of `onCopyCell` — declared on the prop type but the handler ignores it; the key exists only for the row-local badge state | `GridRow.tsx:40`, `TableGrid.tsx:381`; used at `GridRow.tsx:94,96,60-63` |
| `StatCard`'s `className` prop — accepted but never passed by any of the ten call sites | `ColumnStatsPanel.tsx:367`; call sites `158,164,169,172,175,178,191,192,193` |
| `CellHoverData.rect` leaks into `inspectorData` via object spread and is never read by the modal | `TableGrid.tsx:857-861`; `CellInspectorModal.tsx:25-33` |
| `DialogDescription` is exported from the ui dialog module but not used by the cell inspector | `src/components/ui/dialog.tsx:76-82` |
| `onKeepOpen` is optional on `CellHoverPreview` and optional `onNavigateRow` on `CellInspectorModal`, but both are always supplied by `TableGrid` — the optionality is unused | `CellHoverPreview.tsx:20`, `CellInspectorModal.tsx:39`; callers `TableGrid.tsx:850-855,873` |
| `ImageLightbox` (with its `downloadUrl` prop) is unrelated to this section and is not referenced by either inspected component | importers: `src/components/ai/chat/ChatMessage.tsx:4`, `src/components/dashboard/side-panel/ResonaAIMessageItem.tsx:8` |

---

## Open Questions

UNVERIFIED: What is the top-N limit on `topValues` returned by `/stats`? No `TOP_N`, `top_values` or `LIMIT` constant exists anywhere in this repo — the panel simply maps whatever array it receives (`ColumnStatsPanel.tsx:274-283`).

UNVERIFIED: How many `sampleValues` does the server return, and with what selection strategy? No sample-size constant exists client-side (`ColumnStatsPanel.tsx:286-301`).

UNVERIFIED: How many histogram bins does the server emit, and what binning strategy is used? The panel renders `columnStats.histogram` unbounded with no truncation (`ColumnStatsPanel.tsx:244-271`).

UNVERIFIED: What SQL does the SW Agent run for `/stats`, and which fields are exact vs `pg_stats`-derived in each mode (`default` vs `mode=pg_stats`)? The frontend only sees the `approx` boolean (`api/types.ts:135-136`); the agent is not part of this repo.

UNVERIFIED: Is `distinctCount` exact or estimated when `approx` is true? The `approx` flag is only described for "min/max/quantiles/histogram" (`api/types.ts:135`) and the header tooltip labels the whole profile "approximate values from Postgres statistics" (`ColumnHeader.tsx:156`) — the two statements do not agree on scope.

UNVERIFIED: Is `nullPercent` a percentage already (0-100) or a ratio? The code treats it as 0-100 (`100 - nullPercent`, `ColumnStatsPanel.tsx:202`), but the wire contract is not documented in this repo.

UNVERIFIED: What does `mode=pg_stats` omit relative to the default mode? `useColumnHeaderProfiles` passes it (`api/hooks.ts:150`) and the doc comment says it yields "bars" only ("computed only from Postgres statistics", `api/api.ts:95`), but the actual field set is not specified.

UNVERIFIED: Is there any size or length guard that prevents opening the inspector on a very large value (e.g. multi-megabyte `jsonb`)? `TableGrid.tsx:522` only excludes `null`/`undefined`; the modal renders an unbounded line list (`CellInspectorModal.tsx:302-322`).

UNVERIFIED: Does `navigator.clipboard.writeText` ever actually reject in the target browsers here, and does the unhandled rejection surface anywhere? The three non-awaited call sites (`CellHoverPreview.tsx:119`, `CellInspectorModal.tsx:148`, `EmptyState.tsx:58`) have no error path.

UNVERIFIED: Is the 200 ms `closeTimerRef` grace window (`TableGrid.tsx:574-576`) ever actually used, given the card's own `onMouseLeave={onClose}` fires immediately (`CellHoverPreview.tsx:146`)? The card and cell are separated by a 6 px gap (`CellHoverPreview.tsx:115`), so the timing depends on browser hover semantics that cannot be determined from the code.

UNVERIFIED: Why does `aiContextTable` never get cleared (`DataExplorerPage.tsx:90,455,459`)? Whether persisting the AI context after returning to the explorer is intended cannot be determined from the code.

UNVERIFIED: Is the AI shortcut intended to select the clicked table first? `TableSidebar.tsx:180` calls `stopPropagation()`, so the table row's `onTableSelect` never fires; nothing in the code states whether that is deliberate.

UNVERIFIED: Why is `searchInputRef` never used — is find-in-cell autofocus a planned feature or a leftover? (`CellInspectorModal.tsx:56,264`)

UNVERIFIED: Are `Total rows`, `table size` and `stats collected at` deliberately omitted from the stats panel UI, given `totalRows`/`sizeBytes`/`statsCollectedAt` are on the response type (`api/types.ts:143-145`) but never read?

UNVERIFIED: Is the empty `<DialogDescription>` omission in `CellInspectorModal` deliberate (Radix logs a dev warning for a missing description)? No `DialogDescription` is rendered (`CellInspectorModal.tsx:154-343`).

UNVERIFIED: What keyboard path opens the cell inspector? The in-cell `Maximize2` button and the hover card are reachable by Tab, but the double-click path (`TableGrid.tsx:517`) has no keyboard equivalent, and no code documents an intended one.

UNVERIFIED: Do the two video files referenced by `EmptyState.tsx:20,25` have any accessibility track or poster? Only their presence in `public/` was verified; the files were not inspected.