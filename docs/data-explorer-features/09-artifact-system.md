---
title: Artifact System
section: 9
area: artifacts
sources: 33
status: rough
---

# 09. Artifact System

Scope: what an artifact *is* in this codebase, how `ArtifactView` dispatches on it, the chart renderer, the `stat_block` renderers, the in-artifact data tables, file cards and file previews, every action available on an artifact, and the four separate persistence stores the UI calls "pinned / saved / history / workspace". The grid (Section 03/06) is referenced only where an artifact export differs from it. Streaming/reducer plumbing (`useAgentArtifacts`) and the clarification run protocol are documented here only to the extent artifacts depend on them.

## Component / File Map

| File | Responsibility | ~Lines |
| --- | --- | --- |
| `src/components/ai/types.ts` | `AgentArtifact` (the artifact shape), `StatBlockKind` union, chart payload types, SSE event types | 540 |
| `src/components/ai/artifacts/ArtifactView.tsx` | Chat-message dispatcher: type sniffing, header/actions, table/exec/bar/line/pie toggle charts, export dropdown, inline save form, `View SQL` | 839 |
| `src/components/ai/artifacts/ArtifactPanel.tsx` | Full-size right side panel for one artifact; hosts `FilePreviewView` for file artifacts | 275 |
| `src/components/ai/artifacts/DashboardPanel.tsx` | Grid of pinned artifacts with 4 layout modes | 217 |
| `src/components/ai/artifacts/WorkspacePanel.tsx` | Lists `/api/workspace` files grouped by content type, inline previews, download | 335 |
| `src/components/ai/artifacts/chartUtils.ts` | `CHART_COLORS`, the `ChartType` union, `isNumericColumn`, `isDateColumn`, `detectChartType` | 42 |
| `src/components/ai/artifacts/exportUtils.ts` | Client-side CSV / JSON / TSV-copy / SpreadsheetML-XLS / chart-PNG exporters | 123 |
| `src/components/ai/artifacts/htmlReport.ts` | Static HTML report + executive-summary HTML generators | 451 |
| `src/components/ai/artifacts/pdfReport.ts` | jsPDF + jspdf-autotable report/executive PDF generators | 428 |
| `src/components/ai/artifacts/views/ChartView.tsx` | Chart renderer for `type==='chart'`: heatmap, funnel, pareto, forecast, moving-average, bar, line, pie, scatter | 382 |
| `src/components/ai/artifacts/views/StatBlockView.tsx` | `stat_block` renderer: statistics, cardinality, table_diff, text, quality, anomalies, legacy column-stats, regression | 441 |
| `src/components/ai/artifacts/views/FileView.tsx` | File download/share/version card shown inline in chat | 329 |
| `src/components/ai/artifacts/views/FilePreviewView.tsx` | In-app preview for HTML / PDF / image / text / JSON / CSV / Excel | 1184 |
| `src/components/ai/artifacts/views/ClarificationView.tsx` | Clarification question + option list | 123 |
| `src/components/ai/ArtifactHistory.tsx` | Cross-chat artifact browser (server store) | 230 |
| `src/components/ai/AIChatLibrary.tsx` | "Library" page: saved charts + connections table | 225 |
| `src/components/ai/AIChatProjects.tsx` | Projects grid (no artifact content) | 249 |
| `src/components/ai/ProjectDetailView.tsx` | Project hero + its chats list (no artifact content) | 225 |
| `src/components/ai/chat/hooks/usePinnedArtifacts.ts` | Expand toggle + pinned-artifact store (`localStorage: sw_pinned_<chatId>`) | 114 |
| `src/components/ai/hooks/useAgentArtifacts.ts` | `artifact_start` / `artifact` / `artifact_rows` reducers, file-artifact version consolidation | 91 |
| `src/components/ai/hooks/useCharts.ts` | `useSavedCharts` / `useGenerateChart` / `useSaveChart` / `useDeleteChart`, chart query keys | 111 |
| `src/components/ai/hooks/useDatasetCache.ts` | `sessionStorage` dataset cache keyed by djb2 hash of `sql::connectionId` | 202 |
| `src/components/ai/api/charts.ts` | `ChartConfig`, `SavedChart`, generate/save/list/delete endpoints | 100 |
| `src/components/ai/api/projects.ts` | Project + project-chat endpoints (`AIProject`, `ProjectChat`) | 92 |
| `src/components/ai/api/index.ts` | `SqlArtifact`, `AIMessage`, `ArtifactHistoryItem`, `listArtifacts` | 375 |
| `src/components/ai/hooks/useAIChats.ts` | `useArtifactHistory` (+ chat list/messages/delete) | 188 |
| `src/components/ai/chat/utils/messageMapper.ts` | DB → local message mapping, artifact dedup, `hasArtifactData` type filter | 182 |
| `src/components/ai/chat/ChatMessage.tsx` | Renders assistant `msg.artifacts[]` through `ArtifactView`; user attachments get their own block | 386 |
| `src/components/ai/chat/hooks/useChatSendOrchestrator.ts` | `handleQuickSend` — clarification answers, attachment uploads, agent send | 349 |
| `src/components/ai/chat/utils/fileValidation.ts` | Upload-side extension/size allowlist (not used by the previewer) | 82 |
| `src/components/ai/AIChatMain.tsx` | Mounts the three side panels; wires pin/expand/quick-send | 725 |
| `src/components/ai/hooks/useAIAgent.ts` | SSE dispatch; clarification pause/resume; `pausedRunId` | 789 |
| `src/shared/lib/format.ts` | `toFilename` used by every artifact exporter | 165 |

Partially read (cited only where used): `ChatMessage.tsx:160-345`, `AIChatMain.tsx:125-155,660-725`, `useChatSendOrchestrator.ts:55-184`, `useAIAgent.ts:1-45,150-449,628-757`, `api/index.ts:60-129,284-323`, `format.ts:90-109`, `htmlReport.ts:60-330,400-451`, `pdfReport.ts:1-75`.

---

## Drift From Published Docs

The published docs under `C:\schema-weaver\sw-docs` were **not read** (out of bounds for this section), so the previously-published list of ~16 artifact/stat-block types could not be diffed name-for-name. What follows is (a) the complete set of type/kind names this codebase declares, (b) which of those are actually rendered, and (c) names commonly published for this product that **do not exist anywhere in this source tree**.

### D1. Declared but never rendered by the artifact dispatcher

| Name | Declared at | Rendered? |
| --- | --- | --- |
| `outliers` (StatBlockKind) | `src/components/ai/types.ts:98` | **No.** No `kind === 'outliers'` branch exists in `StatBlockView` (branches are `StatBlockView.tsx:395,400,405,410,415,420,425,436`); it falls through to `"No data"` at `:440`. The only other mentions are the two header comments (`StatBlockView.tsx:3,5`). |
| `joins` | `ChartType` `src/components/ai/artifacts/chartUtils.ts:9`; filter chip `ArtifactHistory.tsx:21,29`; pdf/html case `pdfReport.ts:192` | Not in chat. `ArtifactView.tsx:298-304` has no `joins` case, so a `joins` artifact renders as an empty generic table. Only the HTML/PDF exporters render `paths` (`htmlReport.ts:237-249`). |
| `metrics` | `chartUtils.ts:9`; `ArtifactHistory.tsx:22,29`; `pdfReport.ts:205` | Same as `joins`: no chat renderer. `identifiers`/`dimensions`/`measures`/`timestamps` are rendered only by the HTML/PDF exporters (`htmlReport.ts:251-265`). |
| `diagram` (+ `mermaid`, `diagramType`, `tableCount`, `relationshipCount`) | `types.ts:256-261`; `chartUtils.ts:10`; `messageMapper.ts:30` | **No renderer anywhere.** Mermaid is never imported or drawn. |
| `report` (+ `insights`, `sections`, `generatedAt`) | `types.ts:262-265`; `chartUtils.ts:10`; `messageMapper.ts:35` | **No renderer anywhere.** Not even the HTML exporter has a case; it falls to `buildTableSection` (`htmlReport.ts:287`). |
| `suggestions` (+ `suggestions[]`, `columnSummary`) | `types.ts:293-295`; `chartUtils.ts:10`; `messageMapper.ts:36` | **No renderer anywhere.** |
| `analysis_plan` (+ `planStepsData`) | `types.ts:297-298`; `chartUtils.ts:10`; `messageMapper.ts:37` | **No renderer for the artifact.** Plan steps are rendered from a different prop path — `msg.planSteps` → `PlanSteps.tsx` (`ChatMessage.tsx:283-288`). |
| `slide_deck` (+ `content`, `workspaceFileName`, `workspaceFileId`, `slideCount`) | `types.ts:279,312-318`; `chartUtils.ts:10`; `messageMapper.ts:38` | **No renderer.** No deck component exists; `slideCount` is never read. |
| `image` (artifact type) | `chartUtils.ts` does not list it; handled at `FileView.tsx:72` and `FilePreviewView.tsx:87` | Not a chat artifact type. `ArtifactView.tsx:302` (`isFile = artType === 'file'`) does **not** recognise `image`, so an `image` artifact in a chat message renders as a generic "0 rows" table. It only reaches an image preview through `ArtifactPanel`'s looser `isFile` test (`ArtifactPanel.tsx:35`). |
| `attachment` | created client-side for uploads at `useChatSendOrchestrator.ts:117`; recognised at `ArtifactPanel.tsx:35`, `FilePreviewView.tsx:93` | Never rendered through `ArtifactView` in practice: attachments live on the *user* message and are drawn by `ChatMessage.tsx:130-229`; only the expand button routes them to `ArtifactPanel` (`ChatMessage.tsx:165-175`). |
| `stats` / `anomalies` / `quality` (legacy `type` values) | `ArtifactHistory.tsx:18-20,29`; `useDatasetCache.ts:126`; `htmlReport.ts:280-282`; `pdfReport.ts:89,109,122` | `ArtifactView` routes them to the **generic table**, never to `StatBlockView` (`ArtifactView.tsx:301,635`). The legacy branches inside `StatBlockView` (`LegacyStatsKind` `:158`, `AnomaliesKind` `:81`, `QualityKind` `:124`) are therefore only reachable when `previewType === 'stat_block'` or when a `stat_block` artifact still carries legacy `stats`/`anomalies`/`score` fields. |
| `tool_call`, `thinking` | `messageMapper.ts:40-41` | Deliberately excluded from `msg.artifacts` and promoted to `toolSteps` (`messageMapper.ts:107-162`). |

### D2. Chart / stat names with no counterpart in this codebase

Searched across `src/` and not found as an artifact type, chart type, stat-block kind, or renderer branch:

- Chart types: `area`, `boxplot`/`box`, `violin`, `histogram`, `waterfall`, `gauge`/`kpi`, `radar`, `combo`/`dual-axis` (a Pareto dual axis exists but is not named), `bubble`, `map`/`geo`, `candlestick`, `sankey`, `treemap`, `parallel-coordinates`, `bullet`.
- Stat-block kinds: `histogram`, `distribution`, `correlation`, `covariance`, `forecast`, `trend`, `retention`, `cohort`, `seasonality`, `moving_average`, `pareto`, `pivot`, `sql`, `insight`/`insights`, `summary`, `profile`, `key_statistics`, `distribution_profile`, `time_series`.
- `area` does exist as a **saved-chart API** type — `ChartConfig.chartType: 'bar' | 'line' | 'area' | 'pie' | 'scatter'` (`src/components/ai/api/charts.ts:12`) and a label `"area": 'Area'` (`AIChatLibrary.tsx:19`) — but **no renderer can display an area chart**: `ArtifactView.tsx:390` and `ArtifactPanel.tsx:89` only offer bar/line/pie, and `ChartView.tsx:270-368` has no `area` case. A saved `area` chart is a dead end.
- Stat-block kind `'statistics'` is rendered, but `ColumnStatistic.min` / `.max` are declared (`types.ts:111-112`) and **never displayed** (`StatisticsView` reads only count/nullCount/mean/median/std/p25/p75/p95/skewness/kurtosis, `StatBlockView.tsx:54-70`).
- `FunnelStage.conversionFromTop` and `FunnelStage.dropOff`-adjacent cumulative conversion: `conversionFromTop` is documented in the type as deliberately unrendered (`types.ts:79-82`) and indeed only `conversionFromPrev` is shown (`ChartView.tsx:129-133`); `dropOff` **is** rendered (`ChartView.tsx:145-149`).
- `TextAnalysis.lengthDistribution` (`types.ts:151`) is declared and never rendered (`TextKind` reads avgLength/minLength/maxLength/uniqueCount/topWords/patterns only, `StatBlockView.tsx:345-381`).
- `SeasonalityPeriod.lag` (`types.ts:87`) is never rendered; `ChartView.tsx:371-379` prints only `label` and `strength*100`.
- `detectChartType` never returns `'pie'`, `'heatmap'`, `'funnel'`, `'scatter'`, `'executive'`, `'chart'`, `'stat_block'`, `'file'`, `'clarification'`, `'report'`, `'suggestions'`, `'analysis_plan'`, `'slide_deck'`, `'diagram'` — its return domain is exactly `'table' | 'bar' | 'line'` (`chartUtils.ts:28-41`). Those members of the `ChartType` union are only ever reached as hard-coded sentinels (`ArtifactView.tsx:332-338`, `ArtifactPanel.tsx:51-54`, `DashboardPanel.tsx:38-40`).

UNVERIFIED: the exact names enumerated in the published public docs' "~16 artifact/stat-block types" list — `sw-docs` is off-limits for this section, so the D1/D2 lists above are the closest verifiable approximation of the drift.

---

## 1. The artifact type system

### 1.1 There is no artifact type union

`AgentArtifact.type` is a bare `string`: `type: string;` (`src/components/ai/types.ts:178`). The closest thing to an enumerated set is `ChartType` in `chartUtils.ts:6-11`, but it is a **mixture of four different things** and is used as view-mode state:

```ts
export type ChartType =
    | 'table' | 'bar' | 'line' | 'pie'        // view modes
    | 'heatmap' | 'funnel' | 'scatter'        // chart sub-renderers
    | 'stats' | 'anomalies' | 'quality' | 'joins' | 'metrics'  // legacy artifact types
    | 'executive' | 'diagram'                 // view mode + legacy type
    | 'chart' | 'stat_block' | 'report' | 'file' | 'suggestions' | 'analysis_plan' | 'slide_deck' | 'clarification'; // artifact types used as sentinels
```

The real set of type strings the code recognises is the union of: the `ArtifactView` type test (`ArtifactView.tsx:298-304`), the `ArtifactPanel` type test (`ArtifactPanel.tsx:32-35`), the `hasArtifactData` switch (`messageMapper.ts:24-43`), the history filter chips (`ArtifactHistory.tsx:29`), the dataset-cache allowlist (`useDatasetCache.ts:126`), and the HTML/PDF report switches (`htmlReport.ts:279-288`, `pdfReport.ts:76-205`).

The three backend-facing discriminators are:

| Discriminator | Values | Source |
| --- | --- | --- |
| `artifact.type` | free-form string (see table below) | `types.ts:178` |
| `artifact.previewType` | `'table' \| 'chart' \| 'stat_block' \| 'file' \| string` (the union collapses to `string`) | `types.ts:276` |
| `artifact.chartType` | `'bar' \| 'line' \| 'pie' \| 'heatmap' \| 'funnel' \| 'scatter'` | `types.ts:195` |
| `artifact.statBlockKind` | `StatBlockKind` — 8 members, see §3 | `types.ts:94-102` |

`previewType` is only consulted as a forward-compat fallback for chart and stat blocks: `isChart = artType === 'chart' || previewType === 'chart'` and `isStatBlock = artType === 'stat_block' || previewType === 'stat_block'` (`ArtifactView.tsx:300-301`, mirrored at `ArtifactPanel.tsx:33-34`, `DashboardPanel.tsx:31-32`). It is **not** consulted for files (`ArtifactView.tsx:302` is `artType === 'file'` only).

### 1.2 Artifact-type dispatch table

`ArtifactView` is the only dispatcher; every other component re-implements the same four booleans rather than sharing them.

| `artifact.type` | Dispatch test | Renderer in chat (`ArtifactView`) | Full-size (`ArtifactPanel`) | Dashboard card (`DashboardPanel`) | HTML/PDF export |
| --- | --- | --- | --- | --- | --- |
| `chart` | `ArtifactView.tsx:300` | `ChartView` height 200 (`:634`) | `ChartView` height 260 (`:164`) | `ChartView` height 160 (`:79`) | `buildChartSection` / pdf `case 'chart'` (`htmlReport.ts:284`, `pdfReport.ts:167`) |
| `stat_block` | `:301` | `StatBlockView` (`:635`) | `StatBlockView` (`:165`) | `StatBlockView` (`:82`) | switch on `statBlockKind`: only `stats`, `anomalies`, `quality`, `regression` have cases; all other kinds fall to `buildTableSection` (`htmlReport.ts:279-288`, `pdfReport.ts:76,89,109,122,150`) |
| `file` | `:302` | `FileView` card — early return at `:478-484` (the inline render at `:636` is unreachable) | `FilePreviewView` (`:159`), whole panel header suppressed (`:110`) | **no file renderer** — falls into `detectChartType`/table (`DashboardPanel.tsx:37-41`) | `buildTableSection` (no file case) |
| `clarification` | `:303` | `ClarificationView` (`:637-647`) | generic table (no clarification case) | generic table | `buildTableSection` |
| `table`, `query`, `sample`, `search` | not special (`:304`) | table mode + toggles; default mode `table` (`:338`) | table, uncapped (`:179`) | `detectChartType` auto-mode | `buildTableSection` |
| `stats`, `anomalies`, `quality`, `joins`, `metrics`, `report`, `diagram`, `suggestions`, `analysis_plan`, `slide_deck` | not special | generic table; header text `"N rows · M cols"` (`:424-426`) | generic table | generic table / auto chart | `stats`/`anomalies`/`quality`/`joins`/`metrics` have cases; `report`/`diagram`/`suggestions`/`analysis_plan`/`slide_deck` do not |
| `image` | not special → **broken** (0 rows) | — | treated as file via `artifact.fileType \|\| fileName \|\| downloadUrl \|\| key` (`ArtifactPanel.tsx:35`) → `FilePreviewView` image branch (`:723-761`) | generic table | `buildTableSection` |
| `attachment` | not special | user-message block instead (`ChatMessage.tsx:130-229`) | `isFile` true (`ArtifactPanel.tsx:35`) → `FilePreviewView` | generic table | `buildTableSection` |
| `tool_call`, `thinking` | filtered out (`messageMapper.ts:40-41`) | — | — | — | — |

Actions available per branch (all citations in §6):

| Branch | Actions offered in chat |
| --- | --- |
| `chart` | Export (Excel/CSV/JSON/TSV only if it also has rows+cols; HTML; PDF — no PNG because `mode` is `'chart'`), Pin, Expand, `View SQL` if `artifact.sql` |
| `stat_block` | Export (HTML + PDF always; data formats only if `rows`+`cols` are also present), Pin, Expand, `View SQL` |
| `file` | none from `ArtifactView` (early return skips the header entirely); the card supplies Share, Preview, Download, version picker |
| `clarification` | collapse/expand chevron only — export, pin, expand are all suppressed (`:554-577`) |
| generic table | Export (4 data formats + HTML + PDF + Executive HTML + Executive PDF), Pin, Expand, view toggles (table/bar/line/pie/exec when eligible), `View SQL`, row-click detail |
| loading placeholder | none — skeleton at `:459-475` |

### 1.3 Column derivation

`cols` is `artifact.columns` if it is a non-empty array (string entries normalised to `{name}`), else the keys of `rows[0]`, else `[]` (`ArtifactView.tsx:320-329`). `rows` is memoised on `artifact.rows` specifically to keep identity stable across streaming re-renders (`:310`, comment `:307-309`).

### 1.4 Streaming artifact protocol

Three events, three reducers: `artifact_start` pushes `{id, type, title, loading:true}` (`useAgentArtifacts.ts:13-18`); `artifact` replaces the **nearest backwards** loading placeholder **with matching type** (`:28-34`, comment `:24-27` explains the parallel-batch bug), except `file` artifacts which are matched by lowercased canonical filename and push the superseded copy into `previousVersions` (`:39-58`); `artifact_rows` appends batches to the artifact matching `artifactId`, else the last `streaming`/`type==='table'`/`type==='query'` artifact, else the last artifact, setting `streaming: !done` (`:63-91`). Terminal `cancelled` / `agent_timeout` events drop all `loading` placeholders (`useAIAgent.ts:352,370`).

`ArtifactHistory` re-consolidates file versions on load (`messageMapper.ts:63-89`) using the same canonical-filename rule.

---

## 2. Charts

### 2.1 Library and versions

Charts are rendered with **recharts** (`ChartView.tsx:11-15`; also `ArtifactView.tsx:3-6`, `ArtifactPanel.tsx:7-10`, `DashboardPanel.tsx:7-10`). Two sub-libraries matter: `xlsx` (SheetJS) for spreadsheet parsing (`FilePreviewView.tsx:13`), `html2canvas` lazily imported for PNG (`exportUtils.ts:113`), and `jspdf` + `jspdf-autotable` lazily imported for PDF (`pdfReport.ts:26-28`). The project also ships `victory-vendor` and `d3-*` in `node_modules` (listed by the tree walk) but no artifact file imports them — no Victory/D3 chart code exists in this section.

### 2.2 `chartType` union — verified

`types.ts:195` declares exactly:

```ts
chartType?: 'bar' | 'line' | 'pie' | 'heatmap' | 'funnel' | 'scatter';
```

Six values, matching the task brief. Every one has a branch in `ChartView` (see below), but `scatter` is non-functional (D3 below).

### 2.3 Per-type rendering matrix

| `chartType` | Renderer | Data shape consumed | Options / hard-coded values | Interactions |
| --- | --- | --- | --- | --- |
| `heatmap` | `HeatmapChart` `ChartView.tsx:47-113` | `matrix: number[][]` (`:48,54`); column labels from `artifact.columns` else `artifact.periods as string[]` (`:51`); row labels from `artifact.cohorts` else `artifact.columns` (`:52`); optional `topPairs` (`:95-110`) | Not recharts — a `<table>`; font `text-[10px]`; cell colour is a linear RGB ramp `(99,102,241) → (16,185,129)` by min/max normalisation, `t=0.5` when `maxV===minV` (`:60-64`); integers print bare, else `toFixed(2)`; `null` → `—` on `hsl(var(--muted))` (`:59`); first col fixed `w-20`; no legend/colorbar | none (static table, horizontally scrollable) |
| `funnel` | `FunnelChart` `ChartView.tsx:117-160` | `stages: FunnelStage[]` (`stage`, `count`, `conversionFromPrev`, `dropOff`) + optional `overallConversion` | Not recharts — div bars; width `count / stages[0].count * 100` (`:118,122`); bar colour `hsl(${240 - i*25}, 60%, ${55 + i*3}%)` (`:141`); step conversion red if `< 50` else emerald (`:130`); `dropOff > 0` prints `−N dropped off` (`:145-149`); overall conversion `toFixed(1)%` (`:155`) | none |
| `bar` | `ParetoChart` when `cumulativePct?.length` (`:228-259`), else simple bar (`:311-325`) | Pareto: `labels`, `values`, `cumulativePct`, optional `paretoIndex`, optional `interpretation`. Simple: `labels`/`values` mapped to `{_label, value}` (`:275`) | Pareto is a `ComposedChart`: bar on `left`, line `cumPct` on `right` with `domain={[0,100]} unit="%"` (`:245`); a red dashed `ReferenceLine` labelled `'80%'` at `labels[paretoIndex]` (`:250`); X tick font 9; interpretation in italic 11px below (`:254-256`). Simple bar: `radius={[3,3,0,0]}`, one `<Cell>` per slice cycling `CHART_COLORS` (`:318-322`), `margin={{top:4,right:4,left:-16,bottom:4}}` | Tooltip only; **no Legend** |
| `line` | `ForecastChart` when `historicalLabels?.length` (`:164-200`); `MovingAverageChart` when `!historicalLabels && maValues?.length` (`:204-224`); else simple line (`:328-338`) | Forecast: `historicalLabels/Values`, `forecastLabels/Values`, `confidenceLower/Upper`. MA: `labels`, `rawValues` (falls back to `values`, `:208`), `maValues`. Simple: `labels`/`values` | Forecast `ComposedChart`: `actual` = `CHART_COLORS[0]`, `forecast` = `CHART_COLORS[2]` with `strokeDasharray="5 3"`; CI band drawn as two stacked `<Area>`s — `ci_upper` `fill="#6366f140"`, `ci_lower` `fill="#ffffff"` (a **hard-coded white** lower overlay, `:192-193`). MA: `raw` `strokeWidth 1.5 opacity 0.5 name="Raw"`, `ma` `strokeWidth 2 name="Moving Avg"` — the only two charts that name their series. Simple line: `strokeWidth={2} dot={false}` with **no `type`** → straight segments, whereas the toggle line chart in `ArtifactView.tsx:800` uses `type="monotone"` (see §2.5) | Tooltip only; no zoom/brush anywhere |
| `pie` | `ChartView.tsx:341-354` | `{_label, value}[]` from `labels`/`values` (`:275`) | `outerRadius={75}`, `cx/cy="50%"`, label `` `${name} (${(percent*100).toFixed(0)}%)` ``, `labelLine={false}`, per-slice `<Cell>` colours (`:344-350`) | Tooltip only |
| `scatter` | `ChartView.tsx:357-368` | expects `x` and `y` | `XAxis type="number" dataKey="x"`, `YAxis type="number" dataKey="y"`, `ZAxis range={[20,100]}`, `Tooltip cursor={{strokeDasharray:'3 3'}}`, `<Scatter data={simpleData} fill={CHART_COLORS[0]} opacity={0.8}>` — **`<Scatter>` has no `dataKey`** | Tooltip only |

**`scatter` is broken.** `simpleData` is built at `ChartView.tsx:275` as `{_label, value}`; `AgentArtifact` has no `x`, `y` or `z` fields (`types.ts:176-319`), so the two numeric axes receive `undefined` and the `<Scatter>` has no key to read. Any artifact with `chartType:'scatter'` renders an empty plot frame.

### 2.4 Cross-chart chrome

- No `<Legend />` is imported or rendered in any of the four chart hosts (`ChartView.tsx:11-15`, `ArtifactView.tsx:3-6`, `ArtifactPanel.tsx:7-10`, `DashboardPanel.tsx:7-10`). Multi-series charts are only distinguishable via tooltip.
- Tooltip style is hard-coded identically in four places: `{fontSize: 11, background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 6}` — `ChartView.tsx:20-25` (constant `TOOLTIP_STYLE`), `ArtifactView.tsx:393-398`, `ArtifactPanel.tsx:92-97`; `DashboardPanel.tsx:47-52` uses `fontSize: 10`.
- No `Brush`, no `onClick`, no zoom state anywhere in these files.
- `CartesianGrid strokeDasharray="3 3"` at `opacity={0.4}` in `ChartView` (`0.4` everywhere except the dashboard cards at `0.3`).
- Trend badge: `DirectionBadge` renders only when `artifact.direction` is set, hides itself for `'flat'`, colours `volatile` amber / `up` emerald / else red, and prints `Math.abs(changePercent).toFixed(1)%` (`ChartView.tsx:29-43`, gated by `hasTrend = artifact.direction != null` at `:278`). `granularity` is printed next to it as 10px text (`:285-287`) and duplicated in the `ArtifactView` header meta (`:405-406`).
- Seasonality strip: chips of `p.label` + `(p.strength*100).toFixed(0)%` for every `seasonalPeriods` entry (`ChartView.tsx:371-379`) — appended for **every** chart type, not only time series.
- Palette: 8 hard-coded hexes `['#6366f1','#22d3ee','#f59e0b','#10b981','#f43f5e','#a78bfa','#34d399','#fb923c']`, indexed with `% CHART_COLORS.length` (`chartUtils.ts:1-4`).
- Heatmap correlation colouring threshold: `|r| > 0.7` emerald, `> 0.4` amber, else muted, printing `r = p.r.toFixed(3)` and `p.strength` (`ChartView.tsx:103-106`).

### 2.5 The toggle charts in `ArtifactView` / `ArtifactPanel` are a second, different chart engine

Table artifacts can be switched to bar/line/pie without a `chart` artifact. These are rendered inline in `ArtifactView` (`:775-825`) and `ArtifactPanel` (`:210-260`) from `rows`, using the **first non-numeric column as the label** (`labelCol = cols.find(c => !isNumericColumn(...)) ?? cols[0]`, `:361-364`) and mapping every row to `{...r, _label: String(r[labelColName] ?? '')}` (`:376-379`).

| Gate | Rule | Effect |
| --- | --- | --- |
| `canBar` | `numCols.length >= 1 && !!labelCol && rows.length <= 50` (`:366`) | bar button hidden above 50 rows |
| `canLine` | `numCols.length >= 1 && !!labelCol && rows.length <= 100` (`:367`) | line hidden above 100 rows |
| `canPie` | `numCols.length === 1 && !!labelCol && rows.length <= 10` (`:368`) | pie hidden above 10 rows or with >1 numeric column |
| `numCols.slice(0, 4)` | `:783`, `:799` (`ArtifactPanel` `:218`, `:234`) | at most 4 series |
| `numCols.slice(0, 3)` | `DashboardPanel.tsx:109,124` | at most 3 series in a dashboard card |
| axis/cell styling | font 10 (ArtifactView) / 11 (ArtifactPanel) / 9 (DashboardCard) ticks | `margin` left is `-16` / `-8` / `-20` (negative left margin clips the Y axis) |

Material appearance differences between the two engines for the same data:

| Property | `ChartView` line | `ArtifactView` toggle line |
| --- | --- | --- |
| curve | none → straight segments (`:335`) | `type="monotone"` (`:800`) |
| bar `outerRadius` | 75 (pie) | 75 in `ArtifactView` (`:814`), **150** in `ArtifactPanel` (`:249`), `"70%"` in `DashboardCard` (`:135`) |
| height | `height` prop: 200 default (`:268`), 160/260 from hosts | 200 (`:777`), 400 in `ArtifactPanel` (`:212`) |
| Forecast / MA / Pareto | hard-coded `height={200}` (`:185`, `:213`, `:240`) — the `height` prop is ignored by these three | n/a |

`detectChartType` (used only by `DashboardCard`, `chartUtils.ts:24-41`) picks an auto view: `rows.length > 200` → table; `columns.length > 5` → table; no numeric column → table; 1 label + 1 numeric + ≤8 rows → bar; 1 label that `isDateColumn` + 1 numeric → line; ≥1 label and ≥1 numeric and ≤40 rows → bar; else table. `isNumericColumn` samples only the **first 15 rows** (`chartUtils.ts:14`), and `isDateColumn` is `/date|time|created|updated|_at$/i` (`:20-22`) — so `isNumericColumn` can disagree with itself between the 15-row sample and the rows actually plotted.

---

## 3. Stat blocks — exhaustive `StatBlockKind` matrix

`StatBlockKind` has exactly 8 members (`types.ts:94-102`):

```ts
export type StatBlockKind =
    | 'statistics' | 'anomalies' | 'quality' | 'outliers'
    | 'text' | 'cardinality' | 'table_diff' | 'regression';
```

`StatBlockView` dispatches by **field presence OR kind**, in a fixed order (`StatBlockView.tsx:395,400,405,410,415,420,425,436,440`). Order matters: an artifact with both `coefficients` and `columnStats` renders as regression.

| # | `statBlockKind` | Dispatch condition (`StatBlockView.tsx`) | Renderer | Payload fields read (all) | What it displays | Formatting / thresholds |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `statistics` | `kind === 'statistics' \|\| artifact.columnStats` **and** `columnStats?.length` (`:400`) | `StatisticsView` (`:47-77`) | `sampleSize`; `columnStats[]`: `name`, `count`, `nullCount`, `mean`, `median`, `std`, `p25`, `p75`, `p95`, `skewness`, `kurtosis` | `Sample size: N rows` line; one card per column in a 1/2-col grid, each showing only the non-null subset of mean / median / σ / p25 / p75 / p95; a `NullBar`; a `skew … · kurt …` line when `skewness != null` | `nullPct = nullCount / (count + nullCount) * 100`, else 0 (`:55`); all stats `toFixed(2)`; NullBar bar colour emerald if `pct === 0`, amber if `< 20`, else red, min visible width `2%` (`:36-37`). `min`/`max` are **not** displayed |
| 2 | `anomalies` | `kind === 'anomalies' \|\| artifact.anomalies` (`:425`) | `AnomaliesKind` (`:81-120`) | `anomalies[]`: `column`, `type`, `severity`, `count`, `explanation`; `scannedColumns`; `totalAnomalies` | `N anomalies found across M columns`; a 5-column table (Column, Type, Severity, Count, Detail) | Count falls back `totalAnomalies ?? anomalies.length` (`:89`); `type` has `_` → space (`:108`); severity badge red/amber/muted for high/medium/low (`:17-21`); `Detail` truncated at `max-w-[200px]` (`:111`). No row cap |
| 3 | `quality` | `kind === 'quality' \|\| (artifact.score != null && artifact.type !== 'chart')` (`:420`) | `QualityKind` (`:124-154`) | `score` (non-null asserted `score!`), `summary`, `issues[]`: `severity`, `column`, `issueType`, `affectedRows`, `recommendation` | Big `/100` score, progress bar, optional summary sentence, one row per issue | Score text/colour emerald `>= 80`, amber `>= 50`, else red; bar width `${score}%` (`:125-134`); `issueType` `_` → space; recommendation right-aligned `max-w-[200px]`. No issue count cap |
| 4 | `outliers` | **no branch exists** | none | — | Falls through to `<p>No data</p>` (`:440`) unless an earlier field-presence branch matched | **DEAD KIND** — see §D1 |
| 5 | `text` | `kind === 'text' \|\| artifact.textAnalysis` **and** `textAnalysis` truthy (`:415`) | `TextKind` (`:345-383`) | `textAnalysis`: `avgLength` (`toFixed(0)`), `uniqueCount` (`toLocaleString`), `minLength`–`maxLength`, `topWords[]` (`.word`, `.count`), `patterns` (entries, `> 0` only) | 3-cell stat strip (Avg length / Unique / Range), a "Top words" chip cloud, a flat list of pattern counts | `topWords.slice(0, 20)` — hard cap **20** (`:367`); pattern keys strip a trailing `_count` then `_` → space (`:378`). `lengthDistribution` never read |
| 6 | `cardinality` | `kind === 'cardinality' \|\| artifact.cardinalityColumns` **and** `cardinalityColumns?.length` (`:405`) | `CardinalityKind` (`:204-227`) | `cardinalityColumns[]`: `name`, `cardinality`, `entropy`, `cardinalityRatio`, `topValues[].value`, `topValues[].count` | Per column: name + `N unique · entropy E` (entropy `toFixed(2)`), a chip list of top values (`value ×count`), a ratio bar | Ratio bar width `Math.min(cardinalityRatio*100, 100)%` (`:221`). **No cap on `topValues` chips** |
| 7 | `table_diff` | `kind === 'table_diff' \|\| artifact.tableDiff` **and** `tableDiff` truthy (`:410`) | `TableDiffKind` (`:283-341`) | `tableDiff`: `rowCountA`, `rowCountB`, `onlyInA[]`, `onlyInB[]`, `typeChanges[].column/.typeA/.typeB`, `statDiffs[].column/.meanA/.meanB/.delta` | Two row-count cards; red chips "Only in A"; blue chips "Only in B"; `typeA → typeB` lines; a Stat-diffs table with a signed Δ | Means `toFixed(2)`; Δ prefixed `+` when positive and coloured emerald, else red (`:332`). The whole block is `text-xs` (`:285`). No caps |
| 8 | `regression` | `kind === 'regression' \|\| artifact.coefficients` (`:395`, highest priority) | `RegressionKind` (`:231-279`) | `coefficients[]`: `feature`, `coefficient`, `pValue`, `significant`; `rSquared`, `adjRSquared`, `intercept` | `R²=x.xxx` (+ `adj x.xxx`, + right-aligned `intercept x.xxx`), then a Feature/Coeff/p-value/Sig table | R² `toFixed(3)`, colour emerald `>= 0.7`, amber `>= 0.4`, else red (`:237`); coefficient `toFixed(4)`; p-value prints `'<0.001'` when `< 0.001` else `toFixed(3)` (`:269`); non-significant rows get `opacity-50`; `✓ sig` emerald / `ns` muted |

Two additional, undocumented shapes are reachable inside the same component:

| Fallback | Condition | Renderer | Fields read |
| --- | --- | --- | --- |
| legacy column stats | `artifact.stats?.length` and nothing above matched (`:436`) | `LegacyStatsKind` (`:158-200`) | `name`, `dataType`, `isPrimaryKey`→`PK`, `isIndexed`→`IDX`, `nullable`→`NULL`, `min`, `max`, `avg`, `distinctCount`, `nullPercent`, `topValues[]` (joined with `, `, `null` rendered as the string `"null"`). 1/2/3-column grid; `min/max/avg` shown only when at least one is non-null; `NullBar` with `nullPercent ?? 0` |
| legacy quality/anomaly payloads | `score != null` (`:420`) / `anomalies` present (`:425`) | `QualityKind` / `AnomaliesKind` | as rows 2–3 |

Stat-block header text in `ArtifactView`: defaults to `'Statistics'`; `'anomalies'` → `'Anomaly Detection'`; `'quality'` → `'Quality Report'` with meta `· score {qualityScore ?? score}`; `'regression'` → `'Regression Analysis'`; `statistics`/`cardinality`/`text`/`table_diff`/`outliers` all fall through to the `'Statistics'` default (`ArtifactView.tsx:407-418`). The kind is never shown literally anywhere.

Chart artifacts are explicitly excluded from the legacy quality branch by `artifact.type !== 'chart'` (`:420`).

---

## 4. Data tables inside artifacts

No table in the artifact system virtualises. All four table renderers map a plain array (or a `.slice()` of one).

| Surface | Container | Initial rows | Step / cap | Sorting | Filtering | Column rendering |
| --- | --- | --- | --- | --- | --- | --- |
| `ArtifactView` table mode (`:653-773`) | `overflow-x-auto max-h-72` scroll box, 1px scrollbars, sticky `thead` `bg-card` (`:655-657`) — **288px** tall | `visibleRowsCount = 50` (`:344`) | `+50 more` adds 50 capped at `rows.length` (`:709`); `Show all (n)` appears only when `rows.length > visibleRowsCount + 50` (`:714-722`); footer suppressed while `artifact.streaming` (`:701`) and replaced by a `{n} rows loaded...` pulse (`:726-731`) | none | none | `font-mono`, `text-xs`, `max-w-[160px] truncate` + `title` attr; objects `JSON.stringify`d; `null`/`undefined` → italic `null` (`:676-696`). Row click toggles a "Row Detail" panel (`max-h-48`, `w-28` label column) (`:674,735-771`) |
| `ArtifactPanel` table (`:168-207`) | `overflow-x-auto` inside a `flex-1 overflow-auto p-4` body — no height cap | **uncapped** (`rows.map`, `:179`) | none | none | none | `text-sm`, `whitespace-nowrap`, `px-3 py-2`, same null/object handling; `No rows` empty state (`:203-205`) |
| `ExecutiveView` (`:32-175`) | inline, `grid-cols-1 sm:grid-cols-2` | **first 5 rows** (`:154`) + `+ {n} more rows` (`:168`) | none | none | none | numeric banner `rows / columns / numeric` (`:70-85`); numeric highlights min/max(`toLocaleString`)/avg(`toFixed(2)`)/sum (`:88-117`); categorical summary = `new Set(...).size` unique + modal top value + amber `n null` (`:120-138`); preview cells `max-w-[150px]` |
| `DashboardCard` table (`DashboardPanel.tsx:85-99`) | `overflow-auto max-h-full` | **15 rows** (`:90`) + `+{n} more` (`:97`) | none | none | none | `text-[11px]`, `max-w-[120px]`, italic `null` |
| `FilePreviewView` tabular (`:836-1183`) | `flex-1 overflow-auto`, sticky header `bg-background/95 backdrop-blur-sm` | `pageSize = 50`, options **`[25, 50, 100, 200]`** (`:76`, `:1115`) | true pagination: `totalPages = max(1, ceil(sorted/pageSize))` (`:343`), prev/next buttons + `{page} / {totalPages}` (`:1122-1142`) | click header → asc → desc → **unsorted** triple toggle (`:356-367`); comparator puts `null` last in both directions (`:325-326`), numeric compare when both `!isNaN(Number())`, else lowercase string compare (`:330-338`) | case-insensitive substring across **all** cells of a row (`:310-316`); status bar shows `(filtered from N)` when the filter bit (`:1099-1103`); empty-filter state offers "Clear search filter" (`:994-1005`); search input widths `w-28 sm:w-36 md:w-44` (`:861`) | `h-9` rows, zebra `odd:bg-background even:bg-muted/10` (`:1058`); numeric cells right-aligned `font-mono tabular-nums` (`:1073`); global `#` index column computed `(page-1)*pageSize + rowIdx + 1` (`:1048`); row click opens a `grid-cols-2 sm:3 md:4` detail drawer, `max-h-48` (`:1147-1181`); multi-sheet switcher with per-sheet row counts, only when `sheets.length > 1` (`:966-985`) |

Numeric caps in one place: `50` (`ArtifactView` initial rows), `+50`, `Show all`, `max-h-72` = 288 px, row detail `max-h-48` = 192 px, `4` series (chat/panel) / `3` series (dashboard), `5` exec-preview rows, `15` dashboard rows, `50/200` FilePreviewView page size, `25/50/100/200` page-size options.

Streaming artifacts re-render the whole slice on every `artifact_rows` batch (there is no incremental row component); the only optimisation is memoising `rows` identity (`ArtifactView.tsx:310`) and `chartData` (`:376-379`, comment `:370-374`).

---

## 5. Files and previews

### 5.1 Two different file UIs

| UI | Component | Where | Purpose |
| --- | --- | --- | --- |
| File card | `FileView.tsx:57` | inline in chat, and (unreachably) at `ArtifactView.tsx:636` | download / share / preview-open / version switch. `max-w-[420px]`, `rounded-xl` (`:186`) |
| File preview | `FilePreviewView.tsx:49` | right side panel via `ArtifactPanel.tsx:159` | in-app render of the file's contents |

### 5.2 Accepted extensions / MIME — verbatim

`FilePreviewView.tsx:82-88` (the previewer):

```ts
const isExcel = ['xlsx', 'xls', 'xlsm'].includes(ext) || artifact.fileType === 'xlsx';
const isCsv   = ['csv', 'tsv'].includes(ext)       || artifact.fileType === 'csv';
const isJson  = ext === 'json'                    || artifact.fileType === 'json';
const isHtml  = ['html', 'htm'].includes(ext)      || (artifact as any).format === 'html';
const isPdf   = ext === 'pdf';
const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext) || artifact.type === 'image';
const isText  = ['txt', 'log', 'md', 'sql'].includes(ext);
```

`FileView.tsx:66-72` (the card, slightly different — note `svg` is **absent** and `pdf`/`image` have no `fileType` fallback):

```ts
const ext = (active.fileType || (active as any).format || fileName.split('.').pop() || '').toLowerCase();
const isSpreadsheet = ['xlsx', 'xls', 'xlsm'].includes(ext) || active.fileType === 'xlsx';
const isCsv        = ['csv', 'tsv'].includes(ext) || active.fileType === 'csv';
const isPdf        = ext === 'pdf';
const isHtml       = ['html', 'htm'].includes(ext) || (active as any).format === 'html';
const isImage      = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext) || active.type === 'image';
```

Upload-side allowlist (`chat/utils/fileValidation.ts:9-15`) — governs attachments only, **not** previews of agent exports:

```ts
export const ALLOWED_FILE_EXTENSIONS = new Set([
    '.pdf', '.docx', '.xlsx', '.xls', '.csv', '.tsv', '.pptx',
    '.txt', '.md', '.json', '.sql', '.py', '.ts', '.js', '.tsx', '.jsx',
    '.yaml', '.yml', '.xml', '.html', '.css', '.sh', '.env', '.log',
    '.toml', '.rs', '.go', '.java', '.dockerfile',
    '.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif',
]);
```
plus `MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024` and `MAX_FILE_COUNT = 10` (`fileValidation.ts:6-7`).

**Anything not matched by the previewer's predicates is parsed as a spreadsheet** — the last branch unconditionally does `res.arrayBuffer()` + `XLSX.read(buffer, {type:'array'})` (`FilePreviewView.tsx:262-263`). An unknown extension therefore shows "No data found in this sheet", not a download prompt.

### 5.3 Preview strategy per type

| Type | Strategy | Cites |
| --- | --- | --- |
| any, short-circuit | if `artifact.rows.length > 0 && artifact.columns.length > 0`, build a single synthetic sheet named `'Data'` and never touch the network | `:131-137` |
| any, local content | `artifact.rawContent` (or `text_content`/`textContent`); CSV/Excel → `XLSX.read(localContent,{type:'string'})`; text → raw; html → raw; json → raw **and** a table | `:140-194` |
| image | `<img src>` from `/ai-api/ai/exports/content?key=…`, else `/ai-api/ai/files/{id}/raw`, else the stored URL; `max-h-[500px] object-contain` | `:99-106`, `:198-202`, `:723-761` |
| pdf | `<iframe src="{url}#toolbar=0&navpanes=0&view=FitH">` (Chrome PDF plugin chrome suppressed); "Open in new tab" gives the full viewer | `:204-208`, `:637-719`, `:712` |
| html | `<iframe srcDoc sandbox="allow-scripts allow-popups allow-modals">`, full height, `bg-white`; plus copy-source, share, open-in-new-tab (Blob URL) | `:217-222`, `:516-634`, `:625-630` |
| json | raw pretty-printed view + auto-tabular view: array-of-objects → sheet `'JSON Records'` with the union of all keys; plain object → 2-column `'Properties'` sheet; toggle button switches raw/table | `:224-252`, `:764-830`, `:882-892` |
| text (`txt/log/md/sql`) | monospace `<pre>` in `bg-muted/20`, no cap | `:254-259`, `:764-830` |
| csv / tsv / xlsx / xls / xlsm | `XLSX.read(buffer,{type:'array'})`, **every** sheet parsed with `sheet_to_json({header:1, defval:'', blankrows:false})`; empty headers become `Column {i+1}`; row 0 is the header, `rawData.slice(1)` are rows | `:261-291` |
| download-only | none in the previewer — everything is previewed or fails with the error card (Retry + Direct Download when `downloadUrl \|\| key`, `:492-510`) | `:482-513` |

Download-only **does** exist in the *workspace* panel: `content_type === 'pdf'` renders "Binary file available for download" with a Download button and no preview (`WorkspacePanel.tsx:161-174`).

### 5.4 Size guards and limits

- `FilePreviewView`: **no size guard of any kind.** It `arrayBuffer()`s the whole file and parses every sheet; the only bound is browser memory. `artifact.sizeBytes` / `size_bytes` / `fileSize` are used only for the humanised label (`humanSize`, `:19-24`, thresholds `1024` / `1024*1024`).
- Workspace panel truncates any non-html/markdown/pdf content at **5000 characters** with a literal `'\n\n... (truncated)'` suffix (`WorkspacePanel.tsx:178`); markdown and html render in full (`:155-160`, `:146-154`).
- `ArtifactHistory` requests `limit: 50` (`ArtifactHistory.tsx:146`); `useArtifactHistory`'s own default is `30` (`useAIChats.ts:178`).
- `useDatasetCache` trims cached artifacts to `MAX_ROWS_PER_ENTRY = 500` and evicts beyond `MAX_ENTRIES = 50`, TTL `DEFAULT_TTL_MS = 30 * 60 * 1000`, prefix `sw_ds_` (`useDatasetCache.ts:28-31`; doc comment at `:4` says "SHA-256" but the implementation is djb2, `:35-43`). It is only wired in as a read-only timestamp source for the "cached" badge (`ChatMessage.tsx:341` → `ArtifactView.tsx:520-524`); nothing in this section calls `set`.
- Share links: `${window.location.origin}/share/r/${shareId}` with a 2500 ms confirmation (`FileView.tsx:158-161`, `FilePreviewView.tsx:414-417`).
- Re-signing: before downloading, if `artifact.key` is present the client calls `${API_BASE_URL}/api/ai/exports/download-url?key=…` with `credentials:'include'` and falls back to the stored URL on any failure (`FileView.tsx:113-142`, `FilePreviewView.tsx:370-398`).

---

## 6. Artifact interactions — complete inventory

Every action, its handler, and its implementation status.

| Action | Where | Handler | Status |
| --- | --- | --- | --- |
| Expand (open side panel) | `ArtifactView.tsx:569-577` (`Maximize2`, title "Expand view"), shown only when `variant==='chat' && onExpand && !isClarification` | `usePinnedArtifacts.handleToggleExpand` (`chat/hooks/usePinnedArtifacts.ts:13-24`) → `expandedArtifact` → `AIChatMain.tsx:706-707` renders `ArtifactPanel` | **Fully implemented.** Toggle semantics: identity matched by object ref, `key`, `downloadUrl`, `id`, or `fileName` (`:16-22`); the same 5-way identity test is duplicated in `ChatMessage.tsx:323-331` for the `isExpanded` highlight |
| Pin to dashboard | `ArtifactView.tsx:555-568` (`PinIcon`, filled + `text-primary` when `isPinned`), hidden for clarification | `usePinnedArtifacts.handlePinArtifact` (`usePinnedArtifacts.ts:66-91`) | **Fully implemented, and it is a toggle** — clicking a pinned artifact removes it (`:75-84`), although the tooltip only ever says "Pin to dashboard" / "Pinned to dashboard" (`ArtifactView.tsx:564`). Side effect: `onOpenDashboard?.()` opens the dashboard and closes the workspace (`usePinnedArtifacts.ts:87` → `AIChatMain.tsx:138-141`), and the expanded panel is closed (`:88`) |
| Pin identity | — | `title` OR `sql` OR `downloadUrl` equality (`usePinnedArtifacts.ts:69-83`, `:93-103`) | **Weak.** Two artifacts sharing a `title` (or a `sql`) are treated as the same artifact — a chart and a table built from one SQL string collide |
| Export (dropdown) | `ArtifactView.tsx:190-238`, rendered at `:554` only in `variant==='chat'` | `handleAction` (`:196-205`) awaits each action | **Fully implemented**, with a swallowed failure: the `catch` is empty and no toast appears (`:201-203`); success sets the button label to `"{label} done"` for **1500 ms** (`:199-200`) |
| Export — Excel / CSV / JSON / Copy TSV | `:436-439`, only when `rows.length > 0 && cols.length > 0` | `exportExcel`, `exportCsv`, `exportJson`, `copyTsv` (`exportUtils.ts:72,31,45,52`) | **Fully implemented** |
| Export — PNG | `:443`, only when `mode` is `bar`/`line`/`pie` (`:430`) | `exportChartPng(chartRef.current, …)` (`exportUtils.ts:108-122`) | **Implemented, structurally unreachable for `chart` artifacts.** `chartRef` is attached only to the inline toggle charts (`:776,792,810`); `type==='chart'` artifacts have `mode==='chart'` (`:332`) so PNG is never offered. `ChartView` has its own internal ref (`ChartView.tsx:269`) that nobody hands to the exporter. `html2canvas` is lazily imported; `backgroundColor:null`, `scale:2`; null element returns silently (`exportUtils.ts:112`) |
| Export — HTML / PDF | `:446-447`, offered for **every** artifact type | `exportHtml` (`htmlReport.ts:436`), `exportPdf` (`pdfReport.ts:25`) | **Fully implemented** |
| Export — Executive HTML / PDF | `:450-451`, only when `!isSpecial && rows.length > 0` | `exportExecutiveHtml` (`htmlReport.ts:419`), `exportExecutivePdf` (`pdfReport.ts:426`) | **Fully implemented** for generic table artifacts only |
| Export (single button, panel) | `ArtifactPanel.tsx:131-136` label "Export" | `handleExport` (`:99-105`) | **Partially implemented** — no dropdown: chart mode → PNG, otherwise → CSV only. No JSON/Excel/TSV/Executive from the panel |
| Copy SQL | `ArtifactPanel.tsx:124-130` (`Copy`/`Check` icon swap, 2000 ms) | inline `navigator.clipboard.writeText` (`:126`) | **Fully implemented** (panel only) |
| View underlying SQL | `ArtifactView.tsx:829-836` (`<details>` "View SQL", `pre` overflow-x-auto); `ArtifactPanel.tsx:265-272` (same, `max-h-40` on the `pre`) | native `<details>` | **Fully implemented** (read-only; no copy inside `ArtifactView`) |
| View row detail | `ArtifactView.tsx:674` row click → `:735-771` | local `expandedRow` state (`:343`) | **Fully implemented** (chat table only; `ArtifactPanel` rows are not clickable) |
| View toggle (table/bar/line/pie/exec) | `ArtifactView.tsx:530-550`, `:383-391` | `setMode` | **Fully implemented**, gated by `canBar/canLine/canPie` and suppressed when `isSpecial \|\| artifact.locked` (`:383`, comment `:381-382`). Not gated on `variant`, so toggles *do* appear in the history browser's card variant |
| Save to library | `SaveForm` component (`:242-290`) rendered at `:597-628` when `saveTarget && connectionId && artifact.sql` | `useSaveChart().mutate` (`:611-624`) | **Dead / unreachable.** `saveTarget` is only ever `null`: `useState<'query'\|'chart'\|null>(null)` (`:347`) and the two writes are `setSaveTarget(null)` in `onCancel` (`:602`) and `onSuccess` (`:620`). No button anywhere calls it with a value. Consequences: `AIChatLibrary`'s saved-chart list has no producer, and `useSaveChart` has exactly one caller — this dead form |
| Regenerate artifact | — | — | **Absent.** No regenerate/re-run/retry control exists on any artifact in these files |
| Delete artifact | — | — | **Absent** from the artifact UI. The only removals are (a) unpinning from the dashboard grid, `AIChatMain.tsx:704` → `DashboardPanel.tsx:207`, and (b) deleting a **saved chart** from the Library, `AIChatLibrary.tsx:72` → `deleteChart` (`api/charts.ts:96`) |
| Navigate to chat | `ArtifactHistory.tsx:107-113` (`ExternalLink`, title "Open in Chat") | `onOpenChat(item.chatId)` else `navigate('/chat/' + chatId)` | **Fully implemented** (history only). Not available in chat (already there) or in the dashboard cards |
| Share | `FileView.tsx:144-181`, `FilePreviewView.tsx:401-436` | `GET /ai-api/ai/exports/share?key&filename&title` → clipboard; falls back to copying `downloadUrl` on any error/non-OK/exception | **Fully implemented for file artifacts only.** Share button renders only when `active.key \|\| active.downloadUrl` (`FileView.tsx:270`) |
| Download | `FileView.tsx:113-142`, `FilePreviewView.tsx:370-398`, `WorkspacePanel.tsx:118-127` | anchor with optional re-sign | **Fully implemented** |
| Version switch | `FileView.tsx:209-258` | `setSelectedArtifact(v)` over `[artifact, ...previousVersions]` (`:74-77`) | **Fully implemented** — the menu only opens when `totalVersions > 1` (`:212-213`, `:229`); the chip falls back to `totalVersions` when neither `version` nor `reportVersion` is set (`:77`) |
| Copy CSV / TSV from preview | `FilePreviewView.tsx:439-464` | clipboard, 2000 ms confirmation | **Fully implemented**, over `activeSheet` (the active sheet only, all rows — not just the page) |
| Answer clarification | see §11 | | |
| Retry a failed preview | `FilePreviewView.tsx:493-499` | `loadFile()` | **Fully implemented** |

---

## 7. Dashboard panel

| Aspect | Behaviour | Cite |
| --- | --- | --- |
| Store | `localStorage` key **`sw_pinned_${chatId}`** — a JSON array of whole `AgentArtifact` objects, one namespace per chat | `usePinnedArtifacts.ts:29,42,55` |
| Read | lazy `useState` initialiser + `useEffect` on `chatId` change; JSON parse failures silently yield `[]` | `:26-34`, `:36-47` |
| Write | every mutation goes through `updateDashboardArtifacts`, which writes the whole array back; `localStorage` quota errors are logged as a warning, not surfaced | `:49-64` |
| Pin semantics | toggle (add/remove) by `title`/`sql`/`downloadUrl` identity; auto-opens the dashboard and closes the workspace; closes the expanded panel | `:66-91`, `AIChatMain.tsx:138-141` |
| Removal from the grid | per-card `X` button → `onRemove(idx)` → `updateDashboardArtifacts(prev => prev.filter((_, i) => i !== idx))` | `DashboardPanel.tsx:70-72,207`; `AIChatMain.tsx:704` |
| Layout modes | `LayoutMode = '1-col' \| '2-col' \| '3-col' \| '2-row'`, default `'2-col'`; grid classes `grid-cols-1`, `grid-cols-1 sm:grid-cols-2`, `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`, `grid-cols-1`; `gap-3` | `DashboardPanel.tsx:19,153,155-160,204` |
| Card min height | `min-h-[200px]`, `min-h-[250px]` in `'2-row'` ("Stacked") | `:162` |
| Per-card view | `isChart` → `ChartView height 160`; `isStatBlock` → `StatBlockView`; otherwise `detectChartType(rows, cols)` → table / bar / line / pie | `:37-41,79-99,102-142` |
| Per-card capabilities | title, decorative `GripVertical` icon, remove button. **No** drag-and-drop, **no** export, **no** `View SQL`, **no** expand | `:64-73` |
| Series cap | `numCols.slice(0, 3)` | `:109,124` |
| Title fallback | `artifact.title` → `"{ChartType} Chart"` / `'Stats'` / `"{n} rows"` | `:55-60` |
| Empty state | "Pin artifacts from the chat to build your dashboard." | `:199-202` |
| Header | count `{n} artifact{s}` + 4 layout buttons + close | `:174-195` |
| Persistence | localStorage only. No server call, no version, no reordering, no resizing. This is unrelated to `src/components/dashboard/*` (the separate dashboard engine, out of scope for this section) |
| Side-panel width | chat 55 / side 45 when a panel is open (`defaultSize`), min 30 / min 25 | `AIChatMain.tsx:711-722` |

Cards are keyed by **array index** (`DashboardPanel.tsx:206`) and the layout switch is a plain `useState` (`:153`) — there is no persistence of the chosen layout either.

---

## 8. Workspace panel

`WorkspacePanel.tsx:62` — a side panel listing files the backend persisted for the current chat.

| Aspect | Behaviour | Cite |
| --- | --- | --- |
| List endpoint | `GET /api/workspace?connection_id=…&session_id=…` → `{ files, count }`; `session_id` is the chatId, so the list is scoped to the current chat | `:75-82`; `AIChatMain.tsx:694-699` |
| Refetch | on `connectionId` / `sessionId` / `refreshTrigger` change, plus a manual Refresh button (spins while loading) | `:90`, `:205-211` |
| Refresh trigger source | `setWorkspaceRefreshCount(c => c + 1)` fires after an attachment upload in `handleQuickSend` | `useChatSendOrchestrator.ts:134` |
| Content endpoint | `GET /api/workspace/{id}` on expand; result cached in `loadedContents` and never refetched once present | `:94-105` |
| Download | `GET /api/workspace/download/{id}` via a synthetic anchor | `:118-127`, `:314-321` |
| Metadata shape | `WorkspaceFile { id, name, content_type, title, description, tags, version, content_size, connection_id, created_at, updated_at, content? }` — `created_at` is declared but never rendered | `:14-28` |
| Grouping | by `content_type` (`|| 'text'`), each group headed by `TYPE_LABELS[type] ?? type` with an icon from `TYPE_ICONS[type] ?? File` | `:186-191`, `:252-265` |
| Recognised content types | exactly `html_report`, `markdown`, `csv`, `json`, `sql`, `text`, `pdf` (icons `Code/FileText/Table2/Code/Code/File/FileText`; labels `HTML Report/Markdown/CSV/JSON/SQL/Text/PDF`). Any other type falls to the generic `<pre>` branch | `:40-58`, `:144-181` |
| Render per type | `html_report` → `<iframe srcDoc sandbox="allow-scripts" height={400}>`; `markdown` → `<pre>`; `pdf` → download-only card; everything else → `<pre>` truncated at 5000 chars | `:145-181` |
| Row content | `title \|\| name`, then `name`, `v{version}`, `content_size` (`> 1024` → KB with `toFixed(1)`), and `toLocaleDateString(updated_at)`; description and tags chips when expanded | `:279-310` |
| Expansion | one file at a time (`expandedId`), click row or chevron; only one file's content is fetched at a time | `:66,107-114,274-278,299-311` |
| Per-file actions | expand/collapse, Download. **No** delete, rename, tag edit, share, preview-in-panel, or copy | — |
| Panel actions | Refresh, Close | `:204-221` |
| Empty / error states | "No files in this chat yet" with the note that exports appear here automatically; error state with Retry | `:238-249`, `:231-237` |
| Group header count | `{typeFiles.length}` per type | `:263` |

---

## 9. Artifact history

| Aspect | Behaviour | Cite |
| --- | --- | --- |
| Store | server-side, one row per artifact persisted with a chat message; `GET /api/ai/artifacts` | `api/index.ts:303-318` |
| Item shape | `ArtifactHistoryItem { id, messageId, chatId, chatTitle, connectionId, createdAt, artifact: SqlArtifact }`; response adds `total` | `api/index.ts:288-301` |
| Hook | `useArtifactHistory({connectionId, type, search, limit, offset})`; `staleTime: 30_000`, `gcTime: 5 * 60_000`, `limit` default **30**, `offset` default 0 | `useAIChats.ts:165-184` |
| Caller | `ArtifactHistory.tsx:141-146` with `{connectionId, type: typeFilter, search: search \|\| undefined, limit: 50}` | |
| **Filter dimensions (4)** | 1. `connectionId` (prop, from the parent — not an on-page control); 2. `type` — 12 chips: `all, table, chart, stats, anomalies, quality, joins, metrics, slide_deck, report, file, image` (`TYPE_LABELS`/`ALL_TYPES`, `:14-29`, `all` maps to `undefined`); 3. free-text `search` ("Search by title or query...", `:168`); 4. hard-coded `limit: 50` (no offset, no pagination control) | `:137-146,164-190` |
| Search correctness | the query key is `aiQueryKeys.artifacts(connectionId, type)` — it **omits `search`** while the `queryFn` reads it. Typing therefore does not change the key, so the list is not refetched per keystroke; the new term only reaches the server on the next fetch triggered by a key change or a stale/refetch event. **Partially implemented** | `useAIChats.ts:44,173-180` |
| Total count | `{data.total} ITEMS` from the server, so it can exceed the 50 rendered | `:159-161` |
| Layout | CSS multi-column masonry: `columns-1 lg:columns-2 2xl:columns-3 gap-8 space-y-8`, `break-inside-avoid` per card | `:196,215`, `:49` |
| Card header | chat title (or "Untitled Session"), `formatTimeAgo(createdAt)`, first segment of `connectionId.split('-')[0]` behind a `Database` icon, and the raw `artifact.type` as an uppercase chip | `:51-71` |
| Card actions (hover-revealed, `opacity-0 group-hover:opacity-100`) | Download Excel, Download CSV (both require `rows.length > 0 && columns.length > 0`), Copy SQL (2000 ms), Open in Chat | `:74-114` |
| Card body | `<ArtifactView variant="card" connectionId={item.connectionId} />` — the history browser passes **no** `onPin`, `onExpand`, `onQuickSend`, `cachedAt` or `isExpanded`, so in this surface: no export dropdown, no pin, no expand, and no "cached" badge (all gated on `variant==='chat'` / `cachedAt`); view toggles still render | `:119-123`; `ArtifactView.tsx:520-524,552-592` |
| Empty / loading | 6 skeleton cards; "No artifacts yet" | `:195-213` |
| Export buttons | call `exportExcel` / `exportCsv` from `exportUtils.ts` directly (no dropdown, no JSON/TSV/PNG/HTML/PDF) | `:78-92` |

---

## 10. "Saved" vs "pinned" vs "history" — four distinct stores

| | Pinned | Saved (Library) | History | Workspace files |
| --- | --- | --- | --- | --- |
| Backing store | `localStorage['sw_pinned_<chatId>']` | server `GET/POST/DELETE /api/ai/charts` | server `GET /api/ai/artifacts` | server `/api/workspace` |
| Scope | per chat id, per browser | per user, cross-chat | cross-chat, filtered by connection | per chat `session_id` |
| Payload | the entire `AgentArtifact` object, duplicated | `SavedChart { id, title, chartType, config, sqlQuery, schemaName, tags, pinned, createdAt }` — a config + SQL, no data | `SqlArtifact` as persisted with the message | `WorkspaceFile` metadata (+ `content` on demand) |
| Written by | the pin button | `useSaveChart` → **only** the unreachable `SaveForm` | the agent run writer | the agent export tools |
| Read by | `DashboardPanel` | `AIChatLibrary` | `ArtifactHistory` | `WorkspacePanel` |
| Mutable from the UI | unpin / remove from grid | delete only (`AIChatLibrary.tsx:68-75`) | read-only | download only |
| Survives reload | yes (localStorage) | yes | yes | yes |
| Cap | none | `listCharts({limit: 50})` (no pagination) | 50 per page, `total` shown | none; all files of the session |

**Where the UI conflates them**

1. `AIChatLibrary.tsx:184` tells the user *"No saved charts yet. Ask Resona to generate a chart and save it."* — there is no "save" affordance anywhere in the artifact UI (`setSaveTarget` is never set, §6), so the instruction cannot be followed from the product.
2. The Library also shows a `Pin` glyph when `chart.pinned` is true (`AIChatLibrary.tsx:67`), inviting the reader to think this is the same pin as the artifact pin. It is a server-side boolean on `SavedChart` (`api/charts.ts:34`) and is **never written by any client code** in this section.
3. `ArtifactHistory`'s type chips (`table/chart/stats/anomalies/quality/joins/metrics/slide_deck/report/file/image`, `:14-29`) filter on **legacy type strings** that `ArtifactView` no longer routes to their dedicated renderers — filtering "Quality" yields artifacts rendered as generic, row-less tables (see §D1). The chip list also has no entry for the types the dispatcher actually special-cases (`stat_block`, `clarification`), so those artifacts are unreachable by filter.
4. The Library search box and the History search box behave differently: History passes `search` to the server (but does not key on it), while the Library fetches `listCharts({limit:50})` and filters client-side on `title` + `chartType` (`AIChatLibrary.tsx:24-38`) — its query key *does* include the search term (`useCharts.ts:40`, with the caveat documented in the comment at `:30-39` that every keystroke allocates a new cache entry for identical data).
5. `SavedChart.pinned` and the pinned-artifact store are unrelated mechanisms that share a word; `ChartType` (`chartUtils.ts:6-11`) is a third reuse of the same names as both view modes and artifact types.

---

## 11. Clarification view

| Stage | Behaviour | Cite |
| --- | --- | --- |
| Trigger | the `done` SSE frame arrives with `completionReason === 'clarification'` — the run **pauses** instead of completing | `useAIAgent.ts:395` |
| State transition | `status → 'awaiting_clarification'`, `phase → 'idle'`, `phaseDetail → ''`; `pausedRef`, `pauseEventIndexRef` and `pausedRunId` are recorded and the pending-run record is re-stamped with `event_index` + fresh `at` | `useAIAgent.ts:396-408`, `:170-181`, `types.ts:323` |
| Artifact | `type:'clarification'` with `question`, `options[]`, `default`, `reason`, later `answered` / `answer` | `types.ts:300-310` |
| Card chrome | `HelpCircle` icon (emerald once answered), header text switches to `"Clarification Answered"` and appends `· "{answer}"`; the whole header is clickable to collapse, plus an explicit chevron; the card dims to `border-border/40 bg-card/60` when answered | `ArtifactView.tsx:489,493-511,578-590` |
| Auto-collapse | initial collapsed state is `true` when the artifact is a clarification that is already answered; a `useEffect` collapses it the moment `answered`/`answer` appears | `ArtifactView.tsx:306,312-318` |
| Suppressed actions | export, pin and expand are all hidden for clarifications | `ArtifactView.tsx:554-577` |
| Option list | options are de-duplicated case-insensitively and the `default` (recommended) option is **hoisted to the top** even if the backend put it elsewhere; if `options` is empty the recommended string is the only option; when there are no options at all the copy becomes "Type your response in the chat input below." | `views/ClarificationView.tsx:33-55,81-119` |
| Recommended marker | the option matching `default` (case-insensitive) gets a `Recommended` badge and stronger border/bg | `ClarificationView.tsx:84,93-103` |
| Free text | the card never has an input. Both empty states point at the chat input: "Or type your response in the chat input below." | `ClarificationView.tsx:111-113,116-118` |
| Answered state | renders `✓ Selected: {answer}` and all buttons disappear | `ClarificationView.tsx:72-78` |
| Send path | clicking an option → `accept(opt)` → `onSelect` → `ArtifactView.tsx:640-643`: `onQuickSend?.(answer)` then collapse the card | `ArtifactView.tsx:637-647` |
| Orchestration | `handleQuickSend` → if `hasPausedRun` → `resumeAgent(message)`; on success it patches **every** assistant message carrying a `clarification` artifact to `{answered:true, answer:message}`, appends the user message and a streaming assistant placeholder, and returns without sending anything else | `useChatSendOrchestrator.ts:63-93` |
| Transport | `POST /api/ai/runs/{runId}/resume` with `{answer, clientTime, clientTimezone}`, then the SSE stream is reconnected **from the paused `event_index`** so the stale pre-pause `done` frame is skipped | `useAIAgent.ts:668-676,707-714`, comment `:630-634` |
| Resumability | the run id is resolved from `pausedRunId` → `pausedRef` (survives `reset()`) → a session-persisted pause record (survives a remount). `PENDING_RUN_TTL_MS = 15 * 60_000` blocks auto-reconnect to stale runs; a nested clarification re-stamps instead of clearing | `useAIAgent.ts:645-658`, `:89`, `:446-449` |
| History backfill | when rehydrating a chat, a `clarification` artifact is marked `answered: true` with the **next user message's content** as the answer | `messageMapper.ts:91-104` |
| `resume()` failure modes | non-OK → error state with `detail.message` if present and `pauseEventIndexRef` reset to 0; network error → `status:'error'`; a non-resumable run returns `false` immediately | `useAIAgent.ts:657,677-697` |
| Comment/code mismatch | `types.ts:304` documents `default` as *"pre-highlighted, accept with Enter"* — **no key handler exists** in `ClarificationView.tsx`; accepting requires a click |

---

## 12. Export from artifacts vs the grid export

`exportUtils.ts` is entirely client-side — the file's own header says "all client-side, no backend calls" (`:3`) — and is a completely separate implementation from `src/components/export/**` (Section 06).

| Capability | `exportUtils.ts` | Notes |
| --- | --- | --- |
| CSV | `exportCsv` (`:31-41`), `escapeCsvField` quotes a field if it contains `,`, `"` or `\n`, doubling inner quotes (`:22-29`); `null`/`undefined` → empty string; rows joined with **`\n`** (LF only, no CRLF); MIME `text/csv;charset=utf-8` | No BOM — Excel on Windows will mis-detect UTF-8 |
| JSON | `exportJson(rows, title)` (`:45-48`) — `JSON.stringify(rows, null, 2)` of the **rows array only** | The caller passes `rows` (`ArtifactView.tsx:438`), so `sql`, `columns` and every stat field are dropped. Artifact history has no JSON button at all |
| Excel | `exportExcel` (`:72-104`) writes **SpreadsheetML 2003 XML** (not xlsx) with `<?mso-application progid="Excel.Sheet"?>`, one `<Worksheet ss:Name="Data">`, and `.xls` + `application/vnd.ms-excel`; cells are `ss:Type="Number"` when `typeof v === 'number'` else `String`; the header row is bolded by a regex swap `<Cell>` → `<Cell ss:StyleID="h">` (`:98`) — safe because data is XML-escaped first (`:68-70`) | Excel shows a format-mismatch warning for SpreadsheetML-in-`.xls` |
| TSV | `copyTsv` (`:52-64`) — tab-joined, **no quoting/escaping**, `null` → `''`, no trailing newline | Values containing tabs or newlines corrupt the paste |
| PNG | `exportChartPng` (`:108-122`) — lazy `import('html2canvas')`, `backgroundColor: null`, `scale: 2` (2× DPI), `canvas.toBlob` → `image/png` | Rasterises the live DOM node; theme CSS variables must resolve. Null element → silent no-op |
| Filenames | `toFilename(title ?? 'data', 'export')` + extension; `toFilename` strips everything outside `[a-zA-Z0-9_\- ]`, turns spaces into `_`, and **truncates to 60 chars** | `shared/lib/format.ts:96-101` (test at `format.test.ts:93-102`) |
| HTML report | `htmlReport.ts:436-451` — one self-contained document, inline CSS, `esc()` on all interpolated values, `Resona AI · Schema Weaver Data Explorer` footer; filename `${title}.html` sanitised and sliced to 60 (`htmlReport.ts:438-441`) | Dispatch on `type`/`statBlockKind` — only `stats`, `anomalies`, `quality`, `regression`, `chart`, `joins`, `metrics` have builders; everything else becomes a plain table (`htmlReport.ts:271-288`) |
| Executive HTML | `exportExecutiveHtml` (`htmlReport.ts:419-434`) — metrics banner, numeric highlights, categorical summary, first **10** preview rows (`:384`), SQL block; filename `${title}_executive.html` | Only offered when `!isSpecial && rows.length > 0` (`ArtifactView.tsx:449-451`) |
| PDF | `exportPdf` (`pdfReport.ts:25-270`) — lazy `jspdf` + `jspdf-autotable`; A4 portrait, `unit:'pt'`, `margin = 40`, table `fontSize 8`, head `fontSize 7` bold on `[241,241,241]`, alternating `[250,250,250]` rows, auto page-breaks (`:30-33,56-70,45`); saves `toFilename(title,'report').pdf` | Same kind dispatch as the HTML report (`pdfReport.ts:76-205`) |
| Executive PDF | `exportExecutivePdf` (`pdfReport.ts:426`) — numeric summary computed from the **first 15 rows** (`:337`), first 10 preview rows (`:384`) | |

Differences from the grid export that matter to an engineer:

1. **No server round-trip, no audit row, no export job.** Every artifact export writes a Blob directly (or a jsPDF `doc.save`); nothing is recorded server-side, unlike the grid's export pipeline.
2. **Data is whatever the browser holds.** For an artifact still streaming, `rows` grows via `artifact_rows` (`useAgentArtifacts.ts:63-91`) and an export taken mid-stream is a partial CSV/JSON. There is no "wait for done".
3. **Column order comes from `artifact.columns`** (`exportCsv`/`exportExcel` map `columns`, not `Object.keys(rows[0])`), so a mismatch between the two silently drops or blanks columns.
4. **Formats differ from the grid**: JSON here has no metadata envelope, Excel is SpreadsheetML, CSV has LF endings and no BOM, TSV is unquoted.
5. **The side panel offers strictly fewer formats** than the chat dropdown (PNG or CSV only — `ArtifactPanel.tsx:99-105`), and the history browser offers only Excel + CSV (`ArtifactHistory.tsx:78-92`).

---

## Dead / Unused Code

| Item | Evidence | Impact |
| --- | --- | --- |
| `SaveForm` + `saveTarget` + `useSaveChart` | `ArtifactView.tsx:347` initialised to `null`; the only writes are `setSaveTarget(null)` (`:602`, `:620`); no call site sets a value | "Save chart to library" is unreachable; `AIChatLibrary`'s saved-charts list has no producer in the frontend |
| `savedLabel` state | `ArtifactView.tsx:350` — `const [, setSavedLabel]`, never read; the comment at `:348-349` says so | Dead |
| `{isFile && <FileView … />}` at `ArtifactView.tsx:636` | unreachable: the `isFile` fast-path returns at `:478-484` | Dead JSX branch |
| `onQuickSend` prop on `ArtifactPanel` | declared at `:24`, **not destructured** at `:31`; `AIChatMain.tsx:707` still passes `handleQuickSend` | Dead prop |
| `StatBlockKind` member `'outliers'` | `types.ts:98`; only header comments mention it (`StatBlockView.tsx:3,5`); no branch | Stat block renders `"No data"` |
| `StatBlockView` legacy branches (`LegacyStatsKind`, and `quality`/`anomalies` reachable by field) | only reachable when `previewType === 'stat_block'` or a `stat_block` artifact carries legacy fields — `ArtifactView.tsx:301,635` never routes legacy `type` values here | Effectively dead for the chat surface |
| `ChartType` members `'report'`, `'file'`, `'suggestions'`, `'analysis_plan'`, `'slide_deck'`, `'diagram'`, `'heatmap'`, `'funnel'`, `'scatter'`, `'executive'`, `'chart'`, `'stat_block'`, `'clarification'`, `'stats'`, `'anomalies'`, `'quality'`, `'joins'`, `'metrics'` | `chartUtils.ts:6-11`; `detectChartType` can only return `table\|bar\|line` (`:28-41`) | Union is a superset of anything any call site produces or compares against |
| `ChartConfig.chartType: 'area'` | `api/charts.ts:12`; label at `AIChatLibrary.tsx:19`; no renderer in `ChartView.tsx:270-368`, `ArtifactView.tsx:383-391`, `ArtifactPanel.tsx:83-90` | A saved area chart cannot be displayed anywhere |
| `chart` → scatter renderer | `ChartView.tsx:357-368` reads `x`/`y`, which `AgentArtifact` does not define; `<Scatter>` has no `dataKey`; data is `{_label, value}` (`:275`) | Renders an empty frame |
| `chartUtils.isDateColumn` | used only by `detectChartType` (`:39`) | Live but only reachable through `DashboardCard` auto-detection |
| `GripVertical` in `DashboardCard` | `DashboardPanel.tsx:67` — decorative; no drag handlers anywhere in the file | Suggests drag-rearrange that does not exist |
| `AgentArtifact` fields never read by any renderer in this section | `granularity` (read, header only), `detected`, `dominantPeriod`, `dominantLabel` (`types.ts:219-221`), `slideCount` (`:279`), `totalRows` (read only by `htmlReport.ts:126`), `columnSummary` (`:295`), `previousVersions` is read by `FileView` | Dead payload fields |
| `useDatasetCache.get/set/has/remove/clearAll/stats` | only `getCachedAt` is consumed (`ChatMessage.tsx:341`); nothing in this section calls `set` | Cache is never populated from the artifact path |
| `useSavedCharts` / `useGenerateChart` | `useCharts.ts:48,62` — `AIChatLibrary` defines its own `useSavedCharts(search)` (`AIChatLibrary.tsx:24`) and nothing calls `useGenerateChart` | Dead hooks |
| `ArtifactPanel` `maximize`/view toggles for `file` artifacts | panel header is suppressed for files (`:110`) and `viewOptions` is empty for `isSpecial` (`:83-90`) | Dead branch |
| `updateProject`, `assignChatToProject`, `AIProject.fileCount` | `api/projects.ts:72,90`, `:25-26`; no consumer in `AIChatProjects.tsx` / `ProjectDetailView.tsx` | Dead API surface for the artifact/project UI |
| `ImageLightbox` | `ChatMessage.tsx:376-379` renders it for message images, but it is outside the artifact system | Noted, not documented here |

---

## Open Questions

- UNVERIFIED: the exact list of ~16 artifact/stat-block types in the published public docs — `C:\schema-weaver\sw-docs` was off-limits, so §Drift is a code-side approximation, not a name-for-name diff.
- UNVERIFIED: which backend tool names map to which `statBlockKind` value, and whether the backend ever emits `statBlockKind:'outliers'` (if it does, the frontend shows "No data" for those artifacts).
- UNVERIFIED: whether the backend ever emits `chartType:'scatter'` with any payload — the artifact schema has no `x`/`y`/`z` fields, so if it does, those charts are blank and I could not determine the intended wire shape from the frontend.
- UNVERIFIED: the intended wire shape of `matrix` for cohort/retention heatmaps — `HeatmapChart` reads `matrix` as `number[][]` (`ChartView.tsx:54`) while `htmlReport.ts:218` explicitly handles a `matrix` whose rows are *objects* (`Object.keys(artifact.matrix[0])`), implying at least one producer sends objects; the frontend renderer would render `[object Object]` cells for those.
- UNVERIFIED: whether anything server-side consumes `SavedChart.pinned` — no client code writes it (`api/charts.ts:34`).
- UNVERIFIED: whether `/api/ai/artifacts` honours `search` and how it matches (title vs SQL vs content) — the client only passes the term (`api/index.ts:313`) and the response shape is opaque.
- UNVERIFIED: whether the pinned-artifact `localStorage` quota (`sw_pinned_<chatId>`, full artifact objects) is ever exceeded in practice; the only failure handling is a warning log (`usePinnedArtifacts.ts:57`).
- UNVERIFIED: the workspace `content_type` vocabulary — the client only knows 7 values (`WorkspacePanel.tsx:40-58`) and falls back to `File`/raw text for anything else, so additional server-side types are undocumented from the frontend.