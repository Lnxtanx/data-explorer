---
title: Reports, File Previews & Public Sharing
section: 10
area: reports
sources: 30
status: rough
---

# 10. Reports, File Previews & Public Sharing

Internal reference. Every factual claim carries a `src/path/File.tsx:LINE` citation. Claims that
cannot be sourced are collected under `## Open Questions` rather than guessed. In-browser PDF
rendering, iframe behaviour and Chrome plugin behaviour are described as the source comments
describe them; where a statement depends on browser/engine semantics not visible in this repo it is
flagged.

---

## Component / File Map

### Assigned files (read in full)

| File | Responsibility | ~Lines |
| --- | --- | --- |
| `src/pages/PublicReportViewer.tsx` | Unauthenticated `/share/r/:shareId` route: metadata fetch, branded chrome, iframe embed, download | 248 |
| `src/components/ai/artifacts/htmlReport.ts` | Client-side self-contained HTML report generator (`buildHtmlReport`, `buildExecutiveHtml`) + blob download | 451 |
| `src/components/ai/artifacts/pdfReport.ts` | Client-side PDF report generator via jsPDF + jspdf-autotable (`exportPdf`, `exportExecutivePdf`) | 428 |
| `src/components/ai/artifacts/views/FilePreviewView.tsx` | In-panel preview for file artifacts: URL resolution, parse, per-format render, share, download | 1184 |
| `src/components/ai/artifacts/views/FileView.tsx` | Chat-side file card: icon/label/version switcher, share, preview, download | 329 |
| `src/components/ai/chat/ImageLightbox.tsx` | Full-size overlay preview for image attachments; Esc/backdrop close; download + open-in-tab links | 93 |
| `src/components/ai/ArtifactHistory.tsx` | Masonry history browser: search, 12 type filters, per-card exports, open-in-chat | 230 |
| `src/components/ai/types.ts` | `AgentArtifact` (report/file payload shape), SSE event shapes, `FunnelStage` | 540 |
| `src/components/ai/api/index.ts` | Typed AI endpoints incl. `listArtifacts`, `deleteChat`, `uploadFilesForAI` | 375 |
| `src/components/auth/cookies.ts` | Cookie utility + the single application cookie `sw_session` | 189 |
| `src/components/auth/AuthProvider.tsx` | OAuth login, session restore, cross-tab sync, smart-401 handler | 443 |
| `src/components/ai/hooks/useAIAgent.ts` | **Partial** — only the `tool_result` / `artifact_start` / `artifact` / `artifact_rows` SSE cases (lines 220-339) | 789 |

### Supporting files read to resolve a citation (not owned by this section)

| File | Why read |
| --- | --- |
| `src/components/ai/hooks/useAgentArtifacts.ts` | The reducer that creates/versions `file` artifacts; where `previousVersions` is built |
| `src/components/ai/hooks/useAIChats.ts` | `useArtifactHistory` query defaults (`limit` 30, `staleTime`, `gcTime`) |
| `src/components/ai/artifacts/ArtifactView.tsx` | Export menu wiring for all four generators; `isFile` definition; `FileView` render sites |
| `src/components/ai/artifacts/ArtifactPanel.tsx` | Panel-level HTML/PDF buttons; `isFile` definition; hosts `FilePreviewView` |
| `src/components/ai/artifacts/exportUtils.ts` | CSV/JSON/Excel(SSML)/PNG exporters; `toFilename` usage; the only `html2canvas` call |
| `src/components/ai/artifacts/WorkspacePanel.tsx` | Second report surface (`html_report` workspace files) with a narrower iframe sandbox |
| `src/components/ai/chat/utils/messageMapper.ts` | DB→local artifact mapping, file dedup/versioning on reload, `hasArtifactData` |
| `src/components/ai/chat/utils/fileValidation.ts` | 25 MB / 10-file caps, extension allowlist, SVG excluded from thumbnails |
| `src/components/ai/chat/ChatMessage.tsx` | `ImageLightbox` mount point (props: `src`, `name`, `downloadUrl`) |
| `src/components/ai/tools/ToolIcon.tsx` | Agent tool names `export` and `get_report_html` |
| `src/components/ai/tools/LiveToolSteps.tsx` | Same tool names in live/summary labels |
| `src/components/ai/tools/toolSanitize.ts` | Input denylist / per-tool allowlist applied to tool params and summaries |
| `src/shared/lib/format.ts` | `toFilename` sanitiser (60-char cap), `formatTimeAgo` |
| `src/lib/api/client.ts` | `API_BASE_URL`, `credentials: 'include'`, CSRF header, `auth:unauthorized` dispatch |
| `src/App.tsx` | Route table — the share route has no guard wrapper |
| `src/components/ai/AIChatMain.tsx` | Where `ArtifactPanel` (and therefore `FilePreviewView`) is mounted |
| `vite.config.ts` | `/ai-api` dev proxy target and `/ai-api` prefix rewrite; `vendor-reports` chunk |
| `index.html` | Static SEO head incl. `robots: index, follow` |
| `package.json` | `jspdf ^4.2.1`, `jspdf-autotable ^5.0.7`, `html2canvas ^1.4.1`, `xlsx ^0.18.5` |

---

## 1. Two independent generators — HTML and PDF do not feed each other

`htmlReport.ts` and `pdfReport.ts` are **two unrelated generators over the same input type**. Neither
imports the other; the only imports in `htmlReport.ts` are the `AgentArtifact` type
(`src/components/ai/artifacts/htmlReport.ts:5`) and in `pdfReport.ts` the type plus `toFilename`
(`src/components/ai/artifacts/pdfReport.ts:6-7`). There is no intermediate document, no shared
template, no HTML→PDF step, and no shared renderer.

They do, however, duplicate their type-dispatch expression verbatim:

- HTML: `const kind = artType === 'stat_block' ? ((artifact.statBlockKind ?? 'table') as string) : artType === 'chart' ? 'chart' : artType;` (`src/components/ai/artifacts/htmlReport.ts:271`)
- PDF: the identical expression at `src/components/ai/artifacts/pdfReport.ts:76`

Score thresholds are likewise duplicated (`>= 80` green / `>= 50` amber / else red) at
`src/components/ai/artifacts/htmlReport.ts:144` and `src/components/ai/artifacts/pdfReport.ts:124`.

### Which one does the agent invoke? Neither.

The four client generators are **user-initiated only**. All call sites:

| Generator | Call site | Trigger |
| --- | --- | --- |
| `exportHtml` | `src/components/ai/artifacts/ArtifactView.tsx:446` | `ExportDropdown` item "HTML Report" |
| `exportPdf` | `src/components/ai/artifacts/ArtifactView.tsx:447` | `ExportDropdown` item "PDF" |
| `exportExecutiveHtml` | `src/components/ai/artifacts/ArtifactView.tsx:450` | `ExportDropdown` item, gated on `!isSpecial && rows.length > 0` (`ArtifactView.tsx:449`) |
| `exportExecutivePdf` | `src/components/ai/artifacts/ArtifactView.tsx:451` | same gate |
| `exportHtml` (2nd) | `src/components/ai/artifacts/ArtifactPanel.tsx:138` | Panel header button "HTML" |
| `exportPdf` (2nd) | `src/components/ai/artifacts/ArtifactPanel.tsx:144` | Panel header button "PDF" |

No SSE handler, reducer or effect calls them. The agent path is a different mechanism entirely:

1. The agent exposes two tools whose names appear in the UI: `export`
   (`src/components/ai/tools/ToolIcon.tsx:101-105`, `src/components/ai/tools/LiveToolSteps.tsx:23,41`)
   and `get_report_html` (`src/components/ai/tools/ToolIcon.tsx:20,106-108`,
   `src/components/ai/tools/LiveToolSteps.tsx:43`).
2. Their results arrive as a `tool_result` frame carrying `downloadUrl` and `filename`
   (`src/components/ai/hooks/useAIAgent.ts:272-273`, typed at
   `src/components/ai/types.ts:477`) plus a separate `artifact` frame of `type: 'file'`
   (`src/components/ai/hooks/useAIAgent.ts:290-294`).
3. `applyArtifact` (`src/components/ai/hooks/useAgentArtifacts.ts:20-61`) stores the artifact;
   `applyArtifactStart` (`:13-18`) creates the `loading: true` placeholder.
4. The result is rendered by `FileView` (`src/components/ai/artifacts/ArtifactView.tsx:636`,
   `:481`) and previewed by `FilePreviewView` (`src/components/ai/artifacts/ArtifactPanel.tsx:159`).
5. `useAIAgent.ts:280-283` states the design explicitly: *"No auto-download: `export` renders a
   FileView card with a Download button. Cross-origin S3 presigned URLs ignore the anchor
   `download` attribute and would navigate the tab away."*

**Inference (well-supported, not directly citable):** the artefact served by `/share/r/:shareId` is
the **server-generated** file from `export`/`get_report_html`, stored under `artifact.key`
(`src/components/ai/types.ts:269-270`), not the output of `htmlReport.ts`. The public viewer only
ever receives a URL to that stored object (`src/pages/PublicReportViewer.tsx:32-33,69`). The server
generator is not in this repo — see `## Open Questions`.

---

## 2. HTML report generation

### Assembly function

`buildHtmlReport(artifact: AgentArtifact): string` — `src/components/ai/artifacts/htmlReport.ts:269-310`.
It is **module-private**; the only entry points are `exportHtml` (`:436-451`) and
`exportExecutiveHtml` (`:419-434`).

Document skeleton emitted at `src/components/ai/artifacts/htmlReport.ts:294-309`:

```
<!DOCTYPE html> <html lang="en"> <head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{esc(title)} — Resona AI</title>
  <style>{CSS}</style>
</head><body>
  <h1>{esc(title)}</h1>
  <p class="meta">Generated by Resona AI · {timestamp()}</p>
  {body}
  {sqlBlock}
  <footer>Resona AI · Schema Weaver Data Explorer</footer>
</body></html>
```

### Sections

One body function per `kind`, selected by the switch at `src/components/ai/artifacts/htmlReport.ts:279-288`:

| `kind` | Builder | Citation | Empty-state string |
| --- | --- | --- | --- |
| `stats` | `buildStatsSection` | `:92-127` | none (renders empty grid) |
| `anomalies` | `buildAnomaliesSection` | `:129-140` | `<p>No anomalies detected.</p>` (`:131`) |
| `quality` | `buildQualitySection` | `:142-162` | none (renders score `0`) |
| `regression` | `buildRegressionSection` | `:164-190` | none |
| `chart` | `buildChartSection` | `:192-235` | falls back to `buildTableSection` (`:234`) |
| `joins` | `buildJoinsSection` | `:237-249` | `<p>No join paths found.</p>` (`:239`) |
| `metrics` | `buildMetricsSection` | `:251-265` | none (all groups filtered out) |
| default (table) | `buildTableSection` | `:78-90` | `<p>No data.</p>` (`:81`) |

Trailing SQL block: `src/components/ai/artifacts/htmlReport.ts:290-292`, emitted only when
`artifact.sql` is truthy.

Title derivation (default when `artifact.title` is absent): `src/components/ai/artifacts/htmlReport.ts:272-276`
— `'Query Results'` for `table`, `'Chart Report'` for `chart`, `"<Kind> Report"` for `stat_block`,
otherwise `"<Type> Report"`.

### Styles

A single `CSS` template literal at `src/components/ai/artifacts/htmlReport.ts:27-74`, inlined verbatim
into `<style>` at `:300`. Notable literals:

- CSS custom properties for both schemes, with a `@media (prefers-color-scheme: dark)` override:
  `:28-31`.
- `body { ... padding: 2rem; max-width: 1000px; ... line-height: 1.5; }` — `:33`.
- Font stacks are **system fonts only**: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
  (`:33`) and `'SF Mono', 'Cascadia Code', 'Consolas', monospace` (`:41`). No webfont is linked.
- `color-mix(in srgb, …)` is used for hover tints and badges (`:40, 45-49, 72`).
- `table { font-size: 0.8125rem }` (`:36`); `h1 { font-size: 1.25rem }` (`:34`); `.score { font-size: 2.5rem }`
  (`:50`); `.badge { font-size: 0.625rem }` (`:44`); `footer { font-size: 0.6875rem }` (`:73`).
- `.stat-grid { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)) }` (`:53`).

### Data injection and escaping

`esc(value: unknown)` at `src/components/ai/artifacts/htmlReport.ts:8-15`:

- `null` / `undefined` → the literal string `<span class="null">null</span>` (`:9`) — an intentional
  markup injection, not an escape failure.
- Otherwise `String(value)` with `&`→`&amp;`, `<`→`&lt;`, `>`→`&gt;`, `"`→`&quot;` (`:11-14`).
- **`'` (single quote) is not escaped.**

Every value-bearing interpolation I could locate in the file routes through `esc()`: column names and
cells (`:83-85`, `:197-200`, `:385-388`), stat fields (`:105-107`, `:113-114`, `:121`), anomaly
fields (`:135`), issue fields (`:152`), coefficient keys/values (`:183-185`), join path fields
(`:243-246`), metric tags (`:263`), `title` (`:299`, `:303`, `:403`, `:407`), `sql` (`:291`, `:395`),
and the executive-summary `topValue` (`:375`).

Raw (unescaped) interpolations, all narrow:

| Site | Interpolated value | Source constraint |
| --- | --- | --- |
| `:107` | `s.avg` in a `.mono` span | numeric (`avg: number \| null`, `types.ts:34`) |
| `:118` | `s.distinctCount` | numeric (`types.ts:31`) |
| `:119` | `Math.max(nullPct, …)` and `nullColor` | numeric / CSS var chosen from a literal ternary (`:100`) |
| `:120` | `nullPct.toFixed(1)` | numeric |
| `:126` | `artifact.totalRows.toLocaleString()` | numeric (`types.ts:237`) |
| `:131` | `a.count` | numeric (`types.ts:42`) |
| `:133`, `:146` | `badge-${s}` where `s` is a severity string | narrowed by the union `'high' \| 'medium' \| 'low'` (`types.ts:41`, `types.ts:48`) |
| `:135` | `a.severity.toUpperCase()` inside `sevBadge` | same union |
| `:138` | `totalAnomalies`, `scannedColumns` | numeric (`types.ts:239-240`) |
| `:152` | `i.affectedRows` | numeric (`types.ts:50`) |
| `:159` | `score` (numeric) and `scoreColor` | numeric / literal ternary (`:144`) |
| `:246` | `p.joinType === 'foreign_key' ? 'FK' : 'heuristic'`, `Math.round(p.confidence * 100)` | literal ternary / numeric |
| `:231` | `Number(artifact.overallConversion).toFixed(2)` | numeric coercion of the value |

No value is ever placed inside a single-quoted HTML attribute, so the missing `'` escape is not
reachable as an attribute break-out from data in this generator.

One raw interpolation is **not** escaped because it is deliberately pre-marked: `esc()` returns the
`<span class="null">null</span>` markup for nullish input (`:9`), and that string is then embedded
into a table cell (`:85`), a join row, etc.

### Charts: tables, not graphics

There is **no chart rendering of any kind** in the HTML generator. `buildChartSection`
(`src/components/ai/artifacts/htmlReport.ts:192-235`) emits `<table>` markup for every chart shape, via
the local `addTable(heads, data)` helper (`:195-201`):

| Chart payload | Table emitted | Citation |
| --- | --- | --- |
| `artifact.stages` (funnel) | `Stage / Count / Conversion`, `conversionFromPrev.toFixed(2)+'%'` | `:203-211` |
| `artifact.labels` + `artifact.values` | `Label / Value` | `:212-216` |
| `artifact.matrix` | keys of `matrix[0]` | `:217-219` — see Dead Code |
| `artifact.historicalLabels` + `artifact.forecastLabels` | `Series / Label / Value`, two blocks | `:220-228` |

`artifact.overallConversion` is prepended as a `<p class="meta">Overall conversion: X%` (`:230-232`).
If none of the four branches matched, the function returns `buildTableSection(artifact)` (`:234`).

No inline SVG, no data URI, no `<canvas>`, no `<script>`, no charting library appears anywhere in
`htmlReport.ts`. Charts in the interactive surface are Recharts components
(`src/components/ai/artifacts/ArtifactPanel.tsx:7-10`); in the exported report they are only ever
numeric tables.

### Executive summary variant

`buildExecutiveHtml` — `src/components/ai/artifacts/htmlReport.ts:313-417`. Same `<style>{CSS}</style>`
injection (`:404`), different `<title>` suffix `— Executive Summary — Resona AI` (`:403`) and a
different meta line (`:408`). It computes column summaries client-side:

- Numeric detection: every non-null value in the column passes `!isNaN(Number(v))` (`:321`).
- For numeric columns: `min`/`max` via `Math.min(...numVals)` / `Math.max(...numVals)` and `avg`/`sum`
  by reduce (`:331-334`).
- For non-numeric columns: `uniqueCount` via `new Set(vals.map(String)).size` and `topValue` via a
  frequency `Map` sorted descending (`:337-342`).
- Key-metrics banner (row/column/numeric counts) at `:351-355`; Numeric Highlights `:359-369`;
  Categorical Summary `:373-379`; Data Preview `:383-392` limited to `rows.slice(0, 10)` (`:384`)
  with a `+ N more rows` note when `rows.length > 10` (`:391`).

### Portability and delivery

Both entry points build one HTML string, wrap it in
`new Blob([html], { type: 'text/html;charset=utf-8' })` (`:425`, `:442`), create an object URL, click a
synthetic `<a download>`, and immediately `URL.revokeObjectURL(url)` (`:426-433`, `:443-450`).

Filename derivation (`src/components/ai/artifacts/htmlReport.ts:421-424` and `:438-441`), identical in
both:

```
(title || artifact.title || <fallback>)
  .replace(/[^a-zA-Z0-9_\- ]/g, '')   // strip everything except A-Za-z0-9 _ - space
  .replace(/\s+/g, '_')               // spaces -> underscores
  .slice(0, 60)                       // hard 60-char cap
```

Suffixes: `${filename}_executive.html` (`:429`) and `${filename}.html` (`:446`).
Fallbacks: `'executive-summary'` (`:421`) and `'report'` (`:438`).

**Self-contained: yes.** Single file, inline `<style>`, system fonts, zero external subresources, zero
`<script>`. It opens correctly from `file://`, which is what the "Open interactive report in full
browser tab" action relies on (`src/components/ai/artifacts/views/FilePreviewView.tsx:586-591`).

---

## 3. PDF report generation

### Library

`jspdf ^4.2.1` + `jspdf-autotable ^5.0.7` (`package.json:60-61`), loaded lazily:

```
const { default: jsPDF } = await import('jspdf');        // pdfReport.ts:26
const { applyPlugin }   = await import('jspdf-autotable'); // pdfReport.ts:27
applyPlugin(jsPDF);                                        // pdfReport.ts:28
```

The module header states the intent: *"Lazy-loaded to avoid bloating the initial bundle"*
(`src/components/ai/artifacts/pdfReport.ts:3`). The build also pins it to its own chunk:
`if (id.includes('/jspdf')) return 'vendor-reports';` (`vite.config.ts:87`).

There is **no html2canvas and no rasterisation anywhere in `pdfReport.ts`**. `doc.addImage` is never
called. The only `html2canvas` use in the whole app is the chart **PNG** exporter
(`src/components/ai/artifacts/exportUtils.ts:113-117`, `{ backgroundColor: null, scale: 2 }`), which
writes a `.png`, not a PDF.

### Pipeline (step by step) — `exportPdf`, `src/components/ai/artifacts/pdfReport.ts:25-271`

| # | Step | Citation |
| --- | --- | --- |
| 1 | Dynamic-import `jspdf` and `jspdf-autotable`, register the plugin | `:26-28` |
| 2 | Create the document: `new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })` | `:30` |
| 3 | Read page width from `doc.internal.pageSize.getWidth()` | `:31` |
| 4 | Set `margin = 40` (points), `contentWidth = pageWidth - margin * 2`, `y = margin` | `:32-34` |
| 5 | Define `addText` — font size / colour / bold / maxWidth, manual line wrap, manual page break | `:37-52` |
| 6 | Define `addGap(pts)` — advance `y` with no output | `:54` |
| 7 | Define `addAutoTable(head, body)` — delegates pagination to jspdf-autotable | `:56-70` |
| 8 | Define `str(v)` — `null`/`undefined` → `''` | `:72` |
| 9 | Resolve `kind` from `type`/`statBlockKind` (same expression as HTML) | `:76` |
| 10 | Resolve `reportTitle` (`title` arg → `artifact.title` → per-type default) | `:77-80` |
| 11 | Title at 16 pt bold, gap 2, subtitle at 8 pt muted, gap 16 | `:82-85` |
| 12 | `switch (kind)` → per-type body | `:88-238` |
| 13 | Optional SQL block with page-break guard | `:241-258` |
| 14 | Footer pass over every page | `:261-268` |
| 15 | `doc.save(...)` | `:270` |

### Constants (all verbatim)

| Constant | Value | Citation |
| --- | --- | --- |
| Orientation | `'portrait'` | `:30`, `:282` |
| Unit | `'pt'` | `:30`, `:282` |
| Page format | `'a4'` | `:30`, `:282` |
| Margin (all sides, top + L/R) | `40` | `:32`, `:284` |
| Content width | `pageWidth - 40 * 2` | `:33`, `:285` |
| Initial `y` | `margin` (40) | `:34`, `:286` |
| `addText` default size | `10` | `:38`, `:289` |
| `addText` default colour | `C.fg` = `[24, 24, 27]` | `:38`, `:13` |
| `addText` default `maxWidth` | `contentWidth` | `:38`, `:289` |
| Line height | `size * 1.4` | `:43`, `:294` |
| Page-break threshold | `y + lineHeight > pageHeight - margin` | `:45`, `:296` |
| Table body font | `8` | `:63`, `:314` |
| `cellPadding` | `4` | `:63`, `:314` |
| Table `lineColor` | `[228, 228, 231]`, `lineWidth: 0.5` | `:63`, `:314` |
| Table head font | `7`, bold, `fillColor: C.headerBg` = `[241,241,241]` | `:64`, `:20`, `:315` |
| Alternate row fill | `[250, 250, 250]` | `:65`, `:316` |
| Gap after each table | `lastAutoTable.finalY + 12` | `:69`, `:319` |
| Report title size | `16`, bold | `:82`, `:329` |
| Subtitle size | `8` | `:84`, `:331` |
| Subtitle date format | `toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' })` | `:84`, `:331` |
| Quality score size | `36`, bold | `:125` |
| Score bar height | `6`, corner radius `3`, radius mode `'F'` (filled) | `:131-133` |
| Score bar width | `contentWidth * (score / 100)` | `:133` |
| `y` advance after score bar | `16` | `:134` |
| SQL block line pitch | `10`; block height `sqlLines.length * 10 + 12` | `:247`, `:402` |
| SQL block corner radius | `4` | `:252`, `:407` |
| SQL block font size | `7`, family `courier` | `:253-254`, `:408-409` |
| SQL text origin | `margin + 8`, `y + 10` | `:256`, `:411` |
| SQL wrap width | `contentWidth - 16` | `:246`, `:401` |
| Footer font size | `7` | `:264`, `:420` |
| Footer baseline | `pageHeight - 20` | `:266`, `:422` |
| Footer right anchor | `pageWidth - margin`, `align: 'right'` | `:267`, `:423` |
| Colour palette `C` | `fg [24,24,27]`, `muted [113,113,122]`, `accent [37,99,235]`, `green [22,163,74]`, `amber [217,119,6]`, `red [220,38,38]`, `bg [250,250,250]`, `headerBg [241,241,241]` | `:12-21` |

There is **no DPI, no scale factor, and no rasterisation** anywhere in the file. The only two
multipliers present are `size * 1.4` for line height (`:43`) and `score / 100` for the bar (`:133`).
(`scale: 2` belongs to the separate PNG exporter, `src/components/ai/artifacts/exportUtils.ts:116`.)

### Pagination

Two distinct mechanisms:

1. **Text:** the hand-rolled check inside `addText` — if the next line would cross
   `pageHeight - margin`, `doc.addPage()` and reset `y = margin` (`:45-48`, `:296-299`). No widow/orphan
   control, no "keep with next" for headings.
2. **Tables:** entirely delegated to `jspdf-autotable` via `startY: y` (`:60`, `:311`) with only
   L/R margins supplied (`:61`, `:312`) — no `bottom` margin. After the table returns, `y` is set from
   `doc.lastAutoTable.finalY + 12` (`:69`, `:319`).
   `addAutoTable` in `exportPdf` passes a `didDrawPage: () => { /* keep y updated */ }` callback whose
   body is empty (`:66`), i.e. the comment describes an intent that is not implemented — `y` is in fact
   updated once, after the table, at `:69`.
3. **SQL block:** an explicit pre-check `if (y + sqlH > pageHeight - margin) { doc.addPage(); y = margin; }`
   before drawing the background rect (`:248-251`, `:403-406`). Consequence: a SQL block taller than one
   page is not split — it is drawn from the top of a fresh page and overflows off the bottom.

### Headers and footers

Footers only; there is no header. The footer pass runs after all content, computing
`pageCount = doc.internal.getNumberOfPages ? … : doc.internal.pages.length - 1` (`:261`, `:417`), then
`doc.setPage(i)` for `i = 1 … pageCount` (`:262-263`, `:418-419`) drawing:

- left: `'Resona AI · Schema Weaver Data Explorer'` at `margin, height - 20` (`:266`, `:422`)
- right: `` `Page ${i} of ${pageCount}` `` at `pageWidth - margin, height - 20`, right-aligned (`:267`, `:423`)

### Fonts

Only two families are ever selected, both jsPDF standard-14 built-ins:

- `doc.setFont('helvetica', bold ? 'bold' : 'normal')` — `:41`, `:292`
- `doc.setFont('courier', 'normal')` for SQL only — `:254`, `:409`

No `addFont`, `addFileToVFS`, `addBase64Font`, `setFont` with a URL, or font binary appears in the
file. **No font embedding of any kind.** `helvetica` is used everywhere except the SQL block;
`courier` never uses a bold variant.

### Per-type bodies

| `kind` | Citation | Output |
| --- | --- | --- |
| `stats` | `:89-107` | 8-column table: `Column, Type, Distinct, Null %, Min, Max, Avg, Flags`; `Flags` = `PK`/`IDX`/`NULL` from `isPrimaryKey`/`isIndexed`/`nullable` (`:103`) |
| `anomalies` | `:109-120` | 5-column table: `Column, Type, Severity, Count, Detail`; severity upper-cased (`:116`) |
| `quality` | `:122-148` | Big score + `/100` + drawn score bar + optional summary + 5-column issues table |
| `regression` | `:150-165` | One 9 pt line with `R²` (4 dp), `Adj. R²` (4 dp), `Intercept` (6 dp), then a coefficient table with `pValue` relabelled `p-value` (`:160`) |
| `chart` | `:167-190` | Table only, same four-way branch as HTML (`:169-185`), else `'No data.'` (`:187`) |
| `joins` | `:192-203` | 6-column table: `From Table, From Column, To Table, To Column, Type, Confidence` (`foreign_key`→`FK`, else `Heuristic`; `Math.round(confidence*100)+'%'`) |
| `metrics` | `:205-220` | Four blocks: 8 pt bold uppercase label, 10 pt accent items joined by `  ·  ` |
| default (table) | `:222-237` | Full row-count/column-count line then a table of **every** row |

`artifact.sql` block: `:241-258`.

### Executive summary variant

`exportExecutivePdf` — `src/components/ai/artifacts/pdfReport.ts:277-427`. It **re-declares** the whole
helper block (`addText` `:288-303`, `addGap` `:305`, `addAutoTable` `:307-320`, `str` `:322`) rather
than sharing the `exportPdf` copy. Differences from the `exportPdf` copy: `exportExecutivePdf`'s
`addAutoTable` omits the `didDrawPage` key (`:307-320` vs `:56-67`) and uses `addGap(20)` after the
title instead of `addGap(2)` + `addGap(16)` (`:330-332` vs `:82-85`).

Content: metrics line `${rows.length} rows · ${cols.length} columns · ${numericCols.length} numeric`
(`:335-341`); Numeric Highlights table `Column, Min, Max, Avg, Sum` (`:348-358`); Categorical Summary
table `Column, Unique Values, Top Value, Nulls` (`:366-377`); Data Preview = `rows.slice(0, 10)`
(`:384`) with `+ N more rows` when `rows.length > 10` (`:389-392`); SQL block `:396-413`; footer
`:416-424`; `doc.save(\`${toFilename(reportTitle, 'report')}_executive.pdf\`)` (`:426`).

Numeric-column *detection* for the executive PDF samples only the first 15 rows —
`rows.slice(0, 15)` at `src/components/ai/artifacts/pdfReport.ts:337` — but the min/max/avg/sum are
then computed over **all** rows (`:351`). The HTML executive summary has no such sampling: detection
and aggregation both use every row (`src/components/ai/artifacts/htmlReport.ts:320-334`).

### Filename

`doc.save(\`${toFilename(reportTitle, 'report')}.pdf\`)` (`:270`) and `…_executive.pdf` (`:426`).
`toFilename` (`src/shared/lib/format.ts:96-101`) is `[^\w- ]` strip → whitespace→`_` → `.slice(0, 60)`,
with the comment noting the fallback-word drift it was created to unify (`src/shared/lib/format.ts:11-15`,
`:93-95`). **This is the only user-supplied string that reaches jsPDF**, via `reportTitle` → `doc.text`.

---

## 4. File preview matrix

All of the following is `src/components/ai/artifacts/views/FilePreviewView.tsx`. Extension detection is
derived once at `:80`:

```
const ext = (fileName.split('.').pop() || artifact.fileType || artifact.format || '').toLowerCase();
```

Note the precedence: **filename extension first**, then `artifact.fileType`, then `artifact.format`.
`FileView.tsx:66` uses the opposite order — `(active.fileType || active.format || fileName.split('.').pop())`.
The same file can therefore be classified differently by the card and by the preview.

Classifier flags at `:82-88`:

| Flag | Expression | Citation |
| --- | --- | --- |
| `isExcel` | `['xlsx','xls','xlsm'].includes(ext) \|\| artifact.fileType === 'xlsx'` | `:82` |
| `isCsv` | `['csv','tsv'].includes(ext) \|\| artifact.fileType === 'csv'` | `:83` |
| `isJson` | `ext === 'json' \|\| artifact.fileType === 'json'` | `:84` |
| `isHtml` | `['html','htm'].includes(ext) \|\| artifact.format === 'html'` | `:85` |
| `isPdf` | `ext === 'pdf'` | `:86` |
| `isImage` | `['png','jpg','jpeg','webp','gif','svg'].includes(ext) \|\| artifact.type === 'image'` | `:87` |
| `isText` | `['txt','log','md','sql'].includes(ext)` | `:88` |

### Resolution matrix

| Extension / signal | Strategy | Load path | Render | Citation |
| --- | --- | --- | --- | --- |
| `artifact.rows` **and** `artifact.columns` both non-empty (any extension) | Short-circuit: build one sheet named `Data` | `:131-137` | Tabular | `:131-137` |
| `artifact.rawContent` / `text_content` / `textContent` non-empty + `csv\|tsv\|xlsx\|xls\|xlsm` | `XLSX.read(str, {type:'string'})`, `sheet_to_json({header:1, defval:'', blankrows:false})` | `:140-165` | Tabular | `:144-158` |
| `…rawContent` + `txt\|log\|md\|sql` | `setTextRaw` | `:166-169` | Monospace text block | `:764-830` |
| `…rawContent` + `html\|htm` | `setHtmlRaw` | `:170-173` | Sandboxed `iframe srcDoc` | `:516-634` |
| `…rawContent` + `json` | `setTextRaw` + `JSON.parse` → pretty-print + optional table | `:174-193` | Tabular (default) or raw | `:764-830`, `:836+` |
| `png, jpg, jpeg, webp, gif, svg` **or** `artifact.type === 'image'` | **No fetch** — `<img src=url>`; URL forced to a binary route | `:198-202`, `:99-106` | `<img>`, `max-h-[500px]` | `:723-761` |
| `pdf` | **No fetch** — `<iframe src=url#toolbar=0&navpanes=0&view=FitH>`, unsandboxed | `:204-208`, `:711-715` | Native browser PDF viewer | `:637-719` |
| `html, htm` (remote) | `fetch` → `res.text()` | `:217-222` | `<iframe srcDoc sandbox="allow-scripts allow-popups allow-modals">` | `:625-630` |
| `json` (remote) | `fetch` → `res.text()` → `JSON.parse` → pretty-print (`JSON.stringify(parsed, null, 2)`) + optional table | `:224-252` | Tabular or raw | `:764-830` |
| `txt, log, md, sql` (remote) | `fetch` → `res.text()` | `:254-259` | Monospace text block | `:764-830` |
| `csv, tsv, xlsx, xls, xlsm` (remote) | `fetch` → `res.arrayBuffer()` → `XLSX.read(buf, {type:'array'})` | `:261-291` | Tabular, multi-sheet switcher | `:836-1184` |
| `json` where `JSON.parse` yields an **array of objects** | Keys unioned across all elements via `new Set(parsed.flatMap(…Object.keys))`, one sheet `JSON Records` | `:232-237`, `:179-182` | Tabular | `:836-1184` |
| `json` where `JSON.parse` yields a **plain object** | Two-column `Key / Value`, objects stringified; one sheet `Properties` | `:238-246`, `:183-187` | Tabular | `:836-1184` |
| `json` where the value is a scalar (number/string/boolean/`null`) | Neither branch runs → `sheets` stays `[]` | `:232`, `:238`, `:248-249` | Empty tabular "No data found in this sheet." | `:989-993` |
| **Anything else** (`.docx`, `.pptx`, `.zip`, `.doc`, unknown, …) | Falls through to the tabular branch and is handed to `XLSX.read(buffer, {type:'array'})` | `:261-263` | Throws → error state | `:292-294`, `:482-513` |
| Unresolvable URL (no `key`, no `fileId`, no `downloadUrl`) | `throw new Error('File download URL is not available.')` | `:119-121` | Error state | `:482-513` |

### There is no explicit "download-only" branch

Binary formats unsupported by SheetJS are not detected. They reach `XLSX.read(buffer, {type:'array'})`
at `:263`; the resulting exception is caught at `:292` and surfaces the error panel at `:482-513`,
which offers **Retry** (`:493-499`) and — only when `artifact.downloadUrl || artifact.key` — a
**Direct Download** button (`:500-509`). So "download-only" is an emergent behaviour of the error
state, not a designed preview mode.

### Two parse-idiom inconsistencies worth recording

- Remote CSV/TSV is parsed in **binary** mode (`res.arrayBuffer()` → `{type:'array'}`, `:262-263`),
  while the same format from local content is parsed in **string** mode (`{type:'string'}`, `:144`).
- Header normalisation differs: local path uses `String(h ?? '').trim() || \`Column ${i+1}\`` (`:155`);
  remote path uses an equivalent two-line form (`:281-284`). Same output.

### Size caps

**None.** There is no size check before fetch, before `arrayBuffer()`, before `XLSX.read`, or before
`res.text()` anywhere in `FilePreviewView`. `artifact.sizeBytes` is used **only for display**, through
the `humanSize` helper (`:19-24`): `< 1024` → `"N B"`, `< 1048576` → `"N.N KB"`, else `"N.N MB"`. It
appears at `:530-534`, `:649-653`, `:730-732`, `:775-777`, `:852-854`.

The only hard caps in this component are UI-shaped:

| Cap | Value | Citation |
| --- | --- | --- |
| Default page size | `50` | `:76` |
| Page-size options | `25, 50, 100, 200` | `:1115` |
| Image max height | `max-h-[500px]` | `:757` |
| Copy-feedback reset delay | `2000 ms` | `:453`, `:463`, `:544`, `:795` |
| Share-feedback reset delay | `2500 ms` | `:417`, `:425`, `:431` |
| Selected-row drawer height | `max-h-48` | `:1148` |

The upload-side caps live in the attachment path, not the report path:
`MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024` (25 MB) and `MAX_FILE_COUNT = 10`
(`src/components/ai/chat/utils/fileValidation.ts:6-7`).

### URL resolution order (`fetchValidUrl`, `:91-123`)

1. Images: `artifact.key` → `/ai-api/ai/exports/content?key=<enc>` (`:100-102`); else `fileId` →
   `/ai-api/ai/files/<id>/raw` (`:103-105`). The comment at `:96-98` explains why the binary `/raw`
   route is required instead of the text/JSON content endpoint.
2. Any file: `artifact.key` → `/ai-api/ai/exports/content?key=<enc>` (`:109-111`) — chosen to avoid S3
   CORS entirely.
3. `fileId` present **and** the stored `downloadUrl` is absent or not same-origin (`!startsWith('/')`)
   → `/api/ai/files/<id>/content` (`:112-114`).
4. Otherwise `artifact.downloadUrl || artifact.url` (`:115`).
5. Else `fileId` → `/api/ai/files/<id>/content` (`:116-118`); else throw (`:119-121`).

`fileId` itself is `artifact.fileId || artifact.file_id || (artifact.type === 'attachment' && artifact.id)`
(`:92-93`).

Fetch credentials: same-origin URLs get `credentials: 'include'`, cross-origin URLs (presigned S3) get
**no** `credentials` at all, to avoid CORS credential errors (`:210-212`).

### Tabular view capabilities (`:836-1184`)

Case-insensitive substring filter across every cell (`:310-316`); click-to-sort with a three-state
asc → desc → unsorted cycle (`:356-367`); nulls always sort last (`:325-326`); numeric-aware
comparison falling back to lowercased string compare (`:328-338`); pagination (`:343-347`) reset to
page 1 and deselect on any filter/sheet/sort change (`:350-353`); a multi-sheet switcher shown only when
`sheets.length > 1` (`:966-985`); click-a-row detail drawer (`:1147-1181`); copy-as-CSV and copy-as-TSV
with RFC-4180-style quoting for values containing `,`, `"` or `\n` (`:439-454`) and tab-stripping for
TSV (`:456-464`).

### Image lightbox (separate surface)

`ImageLightbox` (`src/components/ai/chat/ImageLightbox.tsx`) is a separate path from
`FilePreviewView`'s image branch — the header comment says an `<img>` in an iframe cannot be zoomed or
dismissed as a user expects (`:2-10`). It is mounted from `src/components/ai/chat/ChatMessage.tsx:377-382`
and `src/components/dashboard/side-panel/ResonaAIMessageItem.tsx:307-312`. Behaviour: `z-[10000]`
fixed overlay at `bg-black/80 backdrop-blur-sm` (`:36`); `role="dialog"` + `aria-modal="true"` (`:38-39`);
Escape closes via a `window` keydown listener (`:22-32`); backdrop click closes (`:37`);
`document.body.style.overflow` is forced to `hidden` and restored on unmount (`:26-31`); Download and
Open-in-new-tab anchors render only when `downloadUrl` is provided (`:45-67`), the latter with
`rel="noopener noreferrer"` (`:60`); an `<img>` `onError` sets `display:none` to hide a broken icon
(`:88`).

Thumbnails for attachments deliberately exclude SVG — `IMAGE_EXTENSIONS` omits it with the rationale
that SVG is markup and inline-rendering it would execute its contents
(`src/components/ai/chat/utils/fileValidation.ts:22-26`). Note the contrast with
`FilePreviewView`'s `isImage`, which **does** include `svg` (`:87`).

---

## 5. Public sharing (`/share/r/:shareId`)

### Route

`src/App.tsx:67` registers `/share/r/:shareId` → `<PublicReportViewer />` as a **sibling** of `/`, inside
the same `<BrowserRouter>` (`:65-71`). There is no guard component, no `ProtectedRoute`, no
`Navigate`-to-login wrapper — confirmed by grep: the only route-level elements are `PublicReportViewer`,
`DataExplorerPage` and a catch-all `Navigate to="/"` (`src/App.tsx:67-69`).

`<AuthProvider>` is mounted *above* the router (`src/App.tsx:64-71`), so it does run on this route, but
`PublicReportViewer` never calls `useAuth()` — its only imports are `useState`/`useEffect`, `useParams`,
`Link`, `cn`, and four lucide icons (`src/pages/PublicReportViewer.tsx:7-12`). `AuthProvider` itself has
no location awareness: no `useLocation`, no redirect, no route allow/deny list
(`src/components/auth/AuthProvider.tsx:34-441`).

### Publishing

Two identical implementations:

- Chat card: `handleShare` — `src/components/ai/artifacts/views/FileView.tsx:144-181`
- In-panel preview: `handleShare` — `src/components/ai/artifacts/views/FilePreviewView.tsx:401-436`

Sequence:

1. If `artifact.key` is present, build
   `new URLSearchParams({ key, filename, title })` (`FileView.tsx:149-153`;
   `FilePreviewView.tsx:405-409`) and call
   `fetch(\`/ai-api/ai/exports/share?${query}\`)` — a plain `fetch` with **no** `credentials` option
   (`FileView.tsx:154`; `FilePreviewView.tsx:410`).
2. On `res.ok` **and** a truthy `data.shareId` (`FileView.tsx:155-157`; `FilePreviewView.tsx:411-413`),
   build `${window.location.origin}/share/r/${data.shareId}` (`FileView.tsx:158`;
   `FilePreviewView.tsx:414`) and `navigator.clipboard.writeText(fullUrl)` (`:159` / `:415`).
3. Set the "copied" flag, cleared after `2500 ms` (`FileView.tsx:160-161`; `FilePreviewView.tsx:416-417`).
4. **Fallbacks** — if there is no `key`, the response is not ok, `shareId` is missing, or the call
   throws, the raw `artifact.downloadUrl` is copied verbatim instead
   (`FileView.tsx:167-177`; `FilePreviewView.tsx:422-432`).

Button visibility differs between the two surfaces: `FileView` renders the share button only when
`active.key || active.downloadUrl` (`:270`); `FilePreviewView` renders it unconditionally in all three
toolbars (HTML `:562`, PDF `:657`, tabular `:917`). In the preview, a file with neither a `key` nor a
`downloadUrl` therefore produces a click that copies nothing and shows no feedback — `handleShare` has
no `else` branch (`FilePreviewView.tsx:403-436`).

### What the share id is

An opaque string returned by the backend as `data.shareId` (`FileView.tsx:157`;
`FilePreviewView.tsx:413`). It is interpolated straight into the URL path
(`${origin}/share/r/${data.shareId}`, `FileView.tsx:158`; `FilePreviewView.tsx:414`) with **no
client-side validation or encoding**. Its generation, length, entropy and lifetime are backend
concerns — see `## Open Questions`.

### Fetching in the viewer

```
const res = await fetch(`/ai-api/ai/exports/shared/${shareId}`);   // PublicReportViewer.tsx:69
```

- No `shareId` param → `"Invalid report link"`, `loading = false` (`:44-48`).
- `404` → `throw new Error("This shared report does not exist or has expired.")` (`:71-73`).
- Any other non-ok → `` `Failed to load shared report (${res.status})` `` (`:74`).
- Success → `res.json()` → `setMeta(data)` (`:76-78`).
- A module-level `isCancelled` flag guards against state updates after unmount (`:50`, `:77`, `:83-86`,
`:87-90`, `:95`).

Response shape, `SharedReportMeta` (`src/pages/PublicReportViewer.tsx:26-34`):

| Field | Type | Read by the component? |
| --- | --- | --- |
| `shareId` | `string` | no |
| `title` | `string` | yes — header text and `document.title` (`:79-81`, `:171-173`) |
| `filename` | `string` | yes — header fallback and the `download` attribute (`:171-173`, `:216`) |
| `format` | `string` | yes — lower-cased to pick PDF vs HTML (`:138`, `:145`) |
| `createdAt` | `number?` | **no — declared but never read** |
| `rawUrl` | `string` | yes — iframe `src` and the PDF "Open" link (`:146`, `:202`, `:233`, `:239`) |
| `downloadUrl` | `string` | yes — the Download anchor `href` (`:215`) |

`/ai-api` is a distinct base path from `/api`, proxied separately in dev to
`env.VITE_AI_PROXY_TARGET || "http://localhost:8001"` with the `/ai-api` prefix stripped
(`vite.config.ts:73-77`).

### Rendering

`const format = (meta.format || '').toLowerCase()` (`:138`); `isPdf = format === 'pdf'` (`:145`);
`frameSrc = isPdf ? \`${meta.rawUrl}#toolbar=0&navpanes=0&view=FitH\` : meta.rawUrl` (`:146`).

| Branch | Element | Sandbox | Citation |
| --- | --- | --- | --- |
| PDF | `<iframe src={frameSrc} className="w-full flex-1 min-h-0 border-0 bg-white">` | **none** | `:231-236` |
| Everything else (including HTML) | `<iframe src={frameSrc} … title={meta.title \|\| meta.filename}>` | `sandbox="allow-scripts allow-popups allow-modals"` | `:238-243` |

The comment at `:139-144` states the reasoning for both halves of that asymmetry: Chrome's built-in
PDF viewer is an extension-provided plugin that cannot be hosted in a sandboxed frame (so sandboxing a
PDF aborts with `net::ERR_ABORTED`), while HTML reports are treated as untrusted model output and keep
the sandbox **minus `allow-same-origin`**, "which would let the framed document reach back into this
same-origin page and strip its own sandbox" (`:143-145`).

Layout: `min-h-screen md:h-[100dvh]` root (`:149`); a `flex-wrap` header (`:151`); `main` is a **column
flex box** so `h-full` resolves against it, with the frame as `flex-1 min-h-0` — the comment at `:226-229`
records that `h-full` alone left the iframe at its default 150 px on narrow screens. `min-h-[70vh]` is
the mobile floor (`:230`).

### What the viewer explicitly does NOT expose

- No app shell, no sidebar, no navigation, no connection switcher — only the brand lockup text
  "Schema Weaver / Data Explorer" (`:155-161`) and the logo `/resona.png` (`:156`).
- No chat transcript, no artifact list, no artifact history (`ArtifactHistory.tsx` is not imported).
- No SQL, no `query`, no connection id, no database name, no schema, no user identity, no email, no
  author attribution. `meta` contains only the seven fields above; nothing else from the chat is sent
  to this view.
- No analytics: `trackEvent` (`src/components/auth/activity.ts`) is never called from
  `PublicReportViewer.tsx`.
- No React Query usage, no `useAIAgent`, no `AuthProvider` hooks.
- `meta.createdAt` is received and dropped (`:31`).

### Actions exposed

| Action | Mechanism | Citation |
| --- | --- | --- |
| Copy share link | `navigator.clipboard.writeText(window.location.href)`; "copied" state for `2500 ms` | `:98-102`, `:183-196` |
| Open in new tab (PDF only) | `<a href={meta.rawUrl} target="_blank" rel="noopener noreferrer">` | `:200-211` |
| Download | `<a href={meta.downloadUrl} download={meta.filename}>` | `:214-222` |
| Go to Schema Weaver (error state only) | `<Link to="/">` | `:127-132` |

Icon selection is format-derived: `FileText` in rose for PDF, an inline HTML5-shield SVG otherwise
(`:168-170`, defined `:15-24`). A non-interactive "Report" badge is shown from `sm:` up (`:174-176`).

### SEO / meta handling

The **only** per-report metadata write is:

```
if (data.title || data.filename) {
    document.title = `${data.title || data.filename} · Schema Weaver Data Explorer`;
}   // PublicReportViewer.tsx:79-81
```

Not done, and verifiable by absence in the file:

- No `description` meta, no `og:title` / `og:description` / `og:image`, no `twitter:*` update.
- No `rel="canonical"` update — the static canonical stays at the site root
  (`index.html:24`).
- No `robots` meta update — the static `<meta name="robots" content="index, follow, …">`
  (`index.html:12-15`) therefore applies to **every** shared report page.
- No JSON-LD injection (the three static blocks in `index.html:57-142` are generic site blocks).
- No structured data derived from the report.
- `document.title` is never restored on unmount, and no cleanup function resets it
  (`:43-96` has no reset).
- No `noindex`, no `X-Robots-Tag`, no cache-control consideration on the client side.

Loading and error states render full-screen centred cards with the share id echoed in a monospace line
(`:110`) and a "Report Unavailable" card (`:116-136`).

---

## 6. Security of the public route

### Mechanism, factually

1. **The report body is never fetched, escaped, or sanitised by the client.** `PublicReportViewer`
   fetches JSON *metadata* only (`src/pages/PublicReportViewer.tsx:76`) and hands the browser a URL
   (`:146`). There is no `innerHTML`, no `dangerouslySetInnerHTML`, no `DOMPurify`, no `esc()` call, and
   no string manipulation of report content anywhere in the 248-line file.
2. **It is not rendered as raw HTML in the app's DOM.** The report is loaded by the browser as a
   separate document inside an `<iframe>` (`:232-243`). The app's own React tree never contains report
   markup.
3. **The HTML branch is sandboxed with a restricted attribute set:**
   `sandbox="allow-scripts allow-popups allow-modals"` (`:242`). Consequences that follow directly
   from that list:
   - `allow-same-origin` is **absent**, so the framed document is in an opaque origin and cannot read
     the parent document, its DOM, its cookies, or its `localStorage`. The comment at `:143-145` names
     this omission as deliberate.
   - `allow-top-navigation` and `allow-top-navigation-by-user-activation` are **absent**, so the framed
     document cannot navigate the top-level tab.
   - `allow-forms` is **absent**.
   - `allow-popups` is present but `allow-popups-to-escape-sandbox` is **absent**, so any window the
     report opens remains sandboxed.
   - `allow-modals` is present, so `alert`/`confirm`/`print` are permitted.
4. **Script sources are whatever the document itself contains.** The viewer injects nothing, but
   `allow-scripts` means any `<script>` in the shared document executes. The client-side generator
   emits no `<script>` at all (absence across `src/components/ai/artifacts/htmlReport.ts:294-309` and
   `:398-416`), so `allow-scripts` is only load-bearing for documents produced by the server-side
   generator, which is not in this repo.
5. **The PDF branch has no `sandbox` attribute** (`:232-236`) — the comment at `:139-144` attributes
   this to Chrome's PDF plugin being extension-provided and unloadable inside a sandboxed frame. The
   content in that frame is therefore the browser's PDF viewer, not report markup.
6. **URLs from the response are used verbatim.** `meta.rawUrl` becomes `src` (`:146`, `:233`, `:239`)
   and an anchor `href` (`:202`); `meta.downloadUrl` becomes an anchor `href` (`:215`). There is no
   scheme check, no origin allowlist, and no path check on either value. The `download` attribute on
   `:216` constrains the suggested filename only — it does not constrain the destination.
7. **`rel="noopener noreferrer"` is present** on the PDF "Open" link (`:204`).

### What is *not* sanitised

- The shared document's own markup. Nothing on the client inspects it.
- The server-side generator's output. Not in this repo; see `## Open Questions`.
- `esc()` (`src/components/ai/artifacts/htmlReport.ts:8-15`) protects only the *client-side* generator's
  own output, and its escape set omits `'` (`:11-14`). As mapped in §2, no interpolated value in that
  file lands inside a single-quoted attribute, so this omission is not currently reachable from data —
  but it is a one-line change away from being reachable if an attribute context is ever added.
- `descendant`/`srcDoc` reports shown in-app go through the same sandbox attribute set
  (`src/components/ai/artifacts/views/FilePreviewView.tsx:625-630`). The workspace panel uses a
  **narrower** sandbox, `sandbox="allow-scripts"` only
  (`src/components/ai/artifacts/WorkspacePanel.tsx:151`), for `html_report` workspace files rendered
  from `srcDoc={content}` (`:148`).

### Residual risks (mechanism-level, no payloads)

| # | Observation | Citation |
| --- | --- | --- |
| R1 | The in-app "Open interactive report in full browser tab" button calls `window.open(blobUrl, '_blank')` on a `blob:` URL built from the report source, with **no sandbox and no `noopener`**. A `blob:` URL inherits the creating document's origin, so that tab runs at the app origin with a `window.opener` reference. This is the single place in this section where untrusted report HTML is rendered outside a sandbox. | `FilePreviewView.tsx:586-591` |
| R2 | `meta.rawUrl` / `meta.downloadUrl` are consumed with no scheme or origin validation. The trust boundary is entirely the backend JSON response. | `PublicReportViewer.tsx:146, 202, 215, 233, 239` |
| R3 | Shared report pages inherit `robots: index, follow` from the static head; combined with unguessable-but-not-guaranteed ids and no `noindex`, report URLs are crawl-eligible. | `index.html:12-15`, `PublicReportViewer.tsx:79-81` |
| R4 | The in-code comment at `PublicReportViewer.tsx:55-68` claims the raw fetch avoids attaching the viewer's session cookie. `fetch()` defaults to `credentials: 'same-origin'`, so for this same-origin path the session cookie **is** still sent. What the raw fetch actually avoids is the explicit `'include'`, the `X-CSRF-Token` header, and the `auth:unauthorized` 401 dispatch. The comment overstates the isolation. | `PublicReportViewer.tsx:55-68` vs `src/lib/api/client.ts:86-92, 99-103` |
| R5 | `buildExecutiveHtml` spreads a whole-column array into `Math.min(...numVals)` / `Math.max(...numVals)` (engine call-argument limit). Behaviour at large row counts is not determinable from this repo. | `htmlReport.ts:331-332` |
| R6 | `PublicReportViewer` mounts under `CacheHydrationGate` → `QueryClientProvider` → `AuthProvider`, so an unauthenticated visitor still runs `initCsrfToken()` (a `credentials: 'include'` fetch to `/api/csrf-token`) and the whole `AuthProvider` mount effect, including `validateSession()` when a `sw_session` cookie exists. | `src/App.tsx:49-51, 64-71`; `src/lib/api/client.ts:43-56`; `AuthProvider.tsx:251-319` |
| R7 | `shareId` is interpolated into a URL path with no encoding, and the viewer echoes it to the DOM as text (`{shareId}`, React-escaped) | `PublicReportViewer.tsx:110`, `:69` |

### Sanitisers that *do* exist nearby (and where they apply)

- `sanitizeToolInput` / `sanitizeToolSummary`
  (`src/components/ai/tools/toolSanitize.ts:88-105`, `:123-130`) — a key denylist
  (`ALWAYS_STRIP`, `:28-52`, including `sql`, `html_template`, `htmlTemplate`, `sections`,
  `request_payload`) plus a per-tool allowlist (`INPUT_ALLOWLIST`, `:55-78`), and UUID / JSON-id / SQL
  redaction in summaries. Applied at three ingress points: the SSE handler
  (`useAIAgent.ts:253`, `:267`), the transcript mapper (`messageMapper.ts:114`, `:117`), and the history
  rehydrator (`messageMapper.ts:134`, `:137`). **This governs what the tool-call cards display — it does
  not touch report bytes.**
- `esc()` (`htmlReport.ts:8-15`) — output encoder for the client-side HTML generator only.
- `stripXmlTags` (`messageMapper.ts:12-20`) — strips model-emitted `<response>`/`<thinking>` wrappers from
  message text.
- No HTML sanitiser library is present in the app: `package.json:20-77` contains no `dompurify` or
  `sanitize-html`.

---

## 7. Cookies and auth

### Cookies that exist

`src/components/auth/cookies.ts:111-113` declares exactly one application cookie:

```
export const COOKIE_KEYS = {
  SESSION_TOKEN: 'sw_session',
} as const;
```

A second cookie, `_csrf`, is **not** in this file — it is read straight off `document.cookie` by regex
in the API client (`src/lib/api/client.ts:20-21`) and issued by the backend.

| Property | Value | Citation |
| --- | --- | --- |
| Name | `sw_session` | `cookies.ts:112` |
| Payload | `{ userId, expiresAt }` only — the comment states "Only store userId and expiresAt — no PII (email, name, avatar)" | `cookies.ts:133-141` |
| Encoding | `encodeURIComponent(JSON.stringify(value))` for objects | `cookies.ts:32-34` |
| `path` | `/` | `cookies.ts:16` |
| `secure` | `window.location.protocol === 'https:'` (omitted entirely over plain HTTP) | `cookies.ts:17`, `:63-65` |
| `sameSite` | `lax` | `cookies.ts:18`, `:139` |
| Lifetime | `SESSION_DURATION_DAYS = 7` | `cookies.ts:124`, `:131` |
| Refresh threshold | `SESSION_REFRESH_THRESHOLD = 24 * 60 * 60 * 1000` (1 day) | `cookies.ts:125`, `:168` |

Helpers: `setCookie` `:24-72`, `getCookie` `:78-97` (JSON-parses opportunistically), `deleteCookie`
`:102-105`, `setSessionCookie` `:130-142`, `getSessionCookie` `:147-159` (self-deletes on expiry),
`sessionNeedsRefresh` `:164-169`, `refreshSessionCookie` `:174-182`, `deleteSessionCookie` `:187-189`.

**`sw_session` is a client-side mirror, not the credential.** The authoritative session is an httpOnly
cookie owned by the backend; `AuthProvider` only calls the backend to clear it —
`// Call backend to clear httpOnly session cookie` (`src/components/auth/AuthProvider.tsx:194`). Every
`setSessionCookie` call site pairs it with a prior `validateSession()`/`loginWith*` round-trip
(`AuthProvider.tsx:64-67`, `:119-122`, `:256-294`).

### How the public route bypasses auth

Structurally, not by cookie manipulation:

1. `/share/r/:shareId` is a plain `<Route>` sibling with **no** guard component and no
   `Navigate`-on-unauthenticated wrapper (`src/App.tsx:66-70`).
2. `PublicReportViewer` never reads auth state — no `useAuth` import, no `useContext`
   (`src/pages/PublicReportViewer.tsx:7-12`).
3. `AuthProvider` performs no route-based gating whatsoever: it has no `useLocation`, no redirect
   logic, and no list of exempt paths (`src/components/auth/AuthProvider.tsx:34-441`).
4. The share metadata request is a raw `fetch` (`:69`) rather than `apiRequest`
   (`src/lib/api/client.ts:182-214`), which avoids the shared preamble that adds
   `credentials: 'include'` and `X-CSRF-Token` (`src/lib/api/client.ts:80-93`) and the 401 handler that
   fires `auth:unauthorized` (`src/lib/api/client.ts:99-103`). `AuthProvider`'s smart-401 listener would
   otherwise try to sign the viewer out (`AuthProvider.tsx:352-389`).
5. Authorisation for the report itself is entirely the backend's: the viewer cannot see whether
   `shared/:shareId` requires anything. See `## Open Questions`.

---

## 8. Download vs preview

### Download flow

Identical in both surfaces:

| Step | `FileView.tsx` | `FilePreviewView.tsx` |
| --- | --- | --- |
| Initial URL | `active.downloadUrl` (`:117`) | `artifact.downloadUrl` (`:373`) |
| Re-sign when `key` present | `fetch(\`${API_BASE_URL}/api/ai/exports/download-url?key=${encodeURIComponent(active.key)}\`, { credentials: 'include' })` (`:118-123`) | same, with `artifact.key` (`:374-379`) |
| Adopt returned URL | `if (res.ok) { … if (data?.success && data?.url) url = data.url; }` (`:124-127`) | `:380-383` |
| On throw | silently falls back to the stored URL (`:128-130`) | `:384-386` |
| No URL at all | `if (!url) return;` (`:132`) | `if (!url) return;` (`:388`) |
| Trigger | synthetic `<a download={fileName}>` appended/clicked/removed (`:133-138`) | `:389-394` |
| Busy flag | `preparing` (`:58`, `:115`, `:140`) | `downloading` (`:52`, `:371`, `:396`) |

`API_BASE_URL = import.meta.env.VITE_API_URL || ''` (`src/lib/api/client.ts:7`).

**Why the re-sign exists:** `artifact.key` is documented as *"S3 object key — lets FileView re-sign an
expired pre-signed URL"* (`src/components/ai/types.ts:269-270`), and the `useAIAgent` comment records
that cross-origin S3 presigned URLs ignore the anchor `download` attribute and would navigate the tab
away (`useAIAgent.ts:280-283`).

### Filename derivation

| Context | Expression | Fallback | Citation |
| --- | --- | --- | --- |
| Chat card download | `active.fileName ?? (active as any).filename ?? active.title` | `'document'` | `FileView.tsx:65` |
| In-panel download | `artifact.fileName \|\| (artifact as any).filename \|\| artifact.title` | `'export'` | `FilePreviewView.tsx:79` |
| Public viewer download | `<a download={meta.filename}>` — used verbatim from the backend | none | `PublicReportViewer.tsx:216` |
| Lightbox download | `download={filename \|\| undefined}` | none | `ImageLightbox.tsx:48` |
| Workspace download | `download={file.name}` | none | `WorkspacePanel.tsx:123` |
| HTML report | sanitise → `.slice(0, 60)` + `.html` / `._executive.html` | `'report'` / `'executive-summary'` | `htmlReport.ts:438-446`, `:421-429` |
| PDF report | `toFilename(reportTitle, 'report')` + `.pdf` / `._executive.pdf` | `'report'` | `pdfReport.ts:270`, `:426` |
| CSV / JSON / Excel | `toFilename(title ?? 'data', 'export')` + `.csv` / `.json` / `.xls` | `'data'`/`'export'` | `exportUtils.ts:40, 47, 103` |
| Chart PNG | `toFilename(title ?? 'chart', 'export')` + `.png` | `'chart'` | `exportUtils.ts:120` |

The two file-download fallbacks differ (`'document'` vs `'export'`, `FileView.tsx:65` vs
`FilePreviewView.tsx:79`), and the two use different nullish operators, so an empty-string `fileName`
yields `''` in the card and falls through to `title` in the panel.

Note `exportExcel` writes **SpreadsheetML 2003 XML** with MIME `application/vnd.ms-excel` and a `.xls`
extension (`exportUtils.ts:89-103`), not a real `.xlsx` — despite the button label "Excel"
(`ArtifactHistory.tsx:81-84`).

### Are downloads authenticated?

Split answer:

- **The re-sign request is authenticated** — explicit `credentials: 'include'`
  (`FileView.tsx:122`; `FilePreviewView.tsx:377`).
- **The download itself is a bare anchor navigation**, so its authentication is whatever the resolved URL
  carries. The client enforces nothing: there is no check before `a.click()`, no token in the query
  string, and no verification that the resolved host is expected. Once a URL is known (including a
  resolved presigned S3 URL), the browser fetches it as a top-level navigation.
- **The public viewer's Download anchor is identical** — a plain `<a href={meta.downloadUrl}>`
  (`PublicReportViewer.tsx:214-222`), reachable with no session. Its authentication is the backend's.

---

## 9. Report lifecycle

| Step | Status | Mechanism | Citation |
| --- | --- | --- | --- |
| **Create (client-side)** | Implemented, user-initiated | `exportHtml` / `exportPdf` / `exportExecutiveHtml` / `exportExecutivePdf`; blob download (HTML) or `doc.save` (PDF) | `htmlReport.ts:436, 419`; `pdfReport.ts:25, 277`; entry points `ArtifactView.tsx:446-451`, `ArtifactPanel.tsx:138-148` |
| **Create (agent-side)** | Implemented server-side; only its results are consumed | `export` and `get_report_html` tools → `tool_result` frame (`downloadUrl`, `filename`) + `artifact` frame of `type: 'file'` | `ToolIcon.tsx:20, 101-108`; `LiveToolSteps.tsx:23, 41-43`; `useAIAgent.ts:272-273, 290-294` |
| **Store** | Implemented server-side; client holds only an S3 key | `artifact.key` (`types.ts:269-270`); served via `/ai-api/ai/exports/content?key=`; re-signed via `/api/ai/exports/download-url?key=` | `FilePreviewView.tsx:101, 110, 377`; `FileView.tsx:121` |
| **Version** | Implemented, in two independent places | Live: `applyArtifact` replaces a same-named `file` artifact and pushes the old one into `previousVersions` (match on `fileName\|\|filename\|\|title`, trimmed + lowercased). Reload: `mapDbMessageToLocal` groups by the same canonical name and keeps the last as `latest`. | `useAgentArtifacts.ts:36-58`; `messageMapper.ts:63-89`; UI at `FileView.tsx:74-77, 208-258` |
| **List (Artifact History)** | Implemented | `ArtifactHistory` → `useArtifactHistory` → `listArtifacts` (`GET /api/ai/artifacts`) with `connectionId`, `type`, `search`, `limit`, `offset` | `ArtifactHistory.tsx:141-148`; `useAIChats.ts:165-184`; `api/index.ts:303-318` |
| — filters | 12 type chips + free-text search | `ALL_TYPES` | `ArtifactHistory.tsx:29, 174-189`; labels `:14-27` |
| — page size | `limit: 50` passed by the caller; hook default is `30` | `ArtifactHistory.tsx:145` vs `useAIChats.ts:178` |
| — per-card actions | Excel, CSV, Copy SQL, Open-in-chat — **only when rows+columns exist / sql exists** | `:76-113` |
| — preview from history | **Not reachable.** History cards render `<ArtifactView variant="card">` with **no `onExpand`** prop, and the Eye/preview button is gated on `onView` being present | `ArtifactHistory.tsx:119-123`; `ArtifactView.tsx:636`; `FileView.tsx:294` |
| **View** | Implemented, two surfaces | `FilePreviewView` inside `ArtifactPanel` (HTML/PDF/image/text/table); `WorkspacePanel` `html_report` iframes | `ArtifactPanel.tsx:157-160`; `AIChatMain.tsx:706-707`; `WorkspacePanel.tsx:144-181` |
| **Share** | Implemented, create-and-copy only | `POST`/`GET` `/ai-api/ai/exports/share?key&filename&title` → `{shareId}` → clipboard | `FileView.tsx:144-181`; `FilePreviewView.tsx:401-436` |
| **List shares** | **Not implemented.** No call site enumerates share ids anywhere in the app | grep: `/ai-api/ai/exports/share` appears only at `FileView.tsx:154`, `FilePreviewView.tsx:410` |
| **Revoke / unshare** | **Not implemented.** No `deleteArtifact`, `unshare`, or `revokeShare` for reports exists. The only `unshare*`/`revoke*` functions are team agent shares, invitations, and connector credentials | grep over `src`: `unshareAgentFromTeam` (`src/components/collaboration/api/collaboration.ts:284`), `revokeTeamInvitation` (`:217`), `revokeConnector` (`src/components/connector/api/crud.ts:41`) |
| **Expire** | Implied by the viewer's 404 message, but no client action triggers it | `"This shared report does not exist or has expired."` | `PublicReportViewer.tsx:71-73` |
| **Delete** | **Only indirectly.** `deleteChat` (`DELETE /api/ai/chats/:id`, documented as a soft delete) is the sole removal path that touches artifacts; there is no artifact- or report-level delete | `api/index.ts:224-231` |
| **Bulk export from history** | Excel + CSV only, gated on rows+columns; no HTML/PDF action on history cards | `ArtifactHistory.tsx:76-93` |

---

## 10. Numeric limits, magic numbers and defaults (verbatim)

### Filenames

| Limit | Value | Citation |
| --- | --- | --- |
| HTML report filename stem | `.slice(0, 60)` | `htmlReport.ts:424`, `:441` |
| `toFilename` stem (PDF, CSV, JSON, XLS, PNG) | `.slice(0, 60)` | `src/shared/lib/format.ts:100` |
| Character class stripped | `/[^a-zA-Z0-9_\- ]/g` | `htmlReport.ts:422, 440`; `format.ts:98` |
| Whitespace collapse | `/\s+/g` → `'_'` | `htmlReport.ts:423, 441`; `format.ts:99` |

### Row / row-sample caps

| Limit | Value | Citation |
| --- | --- | --- |
| Executive HTML data preview | first `10` rows; `+ N more rows` when > 10 | `htmlReport.ts:384, 391` |
| Executive PDF data preview | first `10` rows; `+ N more rows` when > 10 | `pdfReport.ts:384, 390` |
| Executive PDF numeric-column detection sample | first `15` rows (aggregation still over all rows) | `pdfReport.ts:337` vs `:351` |
| Standard `buildTableSection` | **no cap** — every row in `artifact.rows` | `htmlReport.ts:84-86` |
| Standard PDF table branch | **no cap** — `rows.map(...)` into `addAutoTable` | `pdfReport.ts:233` |
| Workspace file default content truncation | `content.slice(0, 5000)` + `'\n\n... (truncated)'` | `WorkspacePanel.tsx:178` |

### Preview UI caps

| Limit | Value | Citation |
| --- | --- | --- |
| Page size default / options | `50` / `[25, 50, 100, 200]` | `FilePreviewView.tsx:76`, `:1115` |
| Image preview max height | `max-h-[500px]` | `FilePreviewView.tsx:757` |
| Attachment upload size cap | `MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024` | `src/components/ai/chat/utils/fileValidation.ts:6` |
| Attachment count cap | `MAX_FILE_COUNT = 10` (truncates via `combined.slice(0, MAX_FILE_COUNT)`) | `fileValidation.ts:7`; `useChatInputState.ts:163-165` |
| Allowed upload extensions | 30 entries (`.pdf .docx .xlsx .xls .csv .tsv .pptx .txt .md .json .sql .py .ts .js .tsx .jsx .yaml .yml .xml .html .css .sh .env .log .toml .rs .go .java .dockerfile .png .jpg .jpeg .webp .svg .gif`) | `fileValidation.ts:9-15` |
| Attachment thumbnails | raster only — `['.png','.jpg','.jpeg','.webp','.gif']`, SVG deliberately excluded | `fileValidation.ts:22-26` |

### History / query caps

| Limit | Value | Citation |
| --- | --- | --- |
| Artifact history page size | `limit: 50` | `ArtifactHistory.tsx:145` |
| `useArtifactHistory` default limit / offset | `30` / `0` | `useAIChats.ts:178-179` |
| `useArtifactHistory` cache | `staleTime: 30_000`, `gcTime: 5 * 60_000` | `useAIChats.ts:181-182` |
| History query-key omission | `search` is passed to the fetcher but **not** part of `aiQueryKeys.artifacts(...)` — two different search strings share one cache entry | `useAIChats.ts:173-176` |

### Report geometry (PDF)

Recorded in full in §3. Headline values: A4 portrait, unit `pt`, margin `40`, body `10` pt with
`size * 1.4` leading, table `8` pt / head `7` pt / `cellPadding` `4` / `lineWidth` `0.5`, title `16` pt,
quality score `36` pt, score bar height `6` radius `3`, SQL `7` pt courier at 10 pt pitch, footer `7` pt
at `pageHeight - 20`. **No DPI, no scale factor, no rasterisation.**

### Report geometry (HTML)

`body { padding: 2rem; max-width: 1000px; line-height: 1.5 }` (`htmlReport.ts:33`);
`table { font-size: 0.8125rem }` (`:36`); `h1 { font-size: 1.25rem }` (`:34`);
`.badge { font-size: 0.625rem }` (`:44`); `.score { font-size: 2.5rem }` (`:50`);
`.score-bar { height: 6px }` (`:51`); `.null-bar { height: 4px }` (`:59`);
`.stat-grid { minmax(280px, 1fr) }` (`:53`); `footer { font-size: 0.6875rem }` (`:73`);
`.badge-*` tints are `color-mix(…, 12%, transparent)` (`:45-49`).

### Misc

| Value | Where | Citation |
| --- | --- | --- |
| Session cookie lifetime | `SESSION_DURATION_DAYS = 7` | `cookies.ts:124` |
| Session refresh threshold | `SESSION_REFRESH_THRESHOLD = 24 * 60 * 60 * 1000` | `cookies.ts:125` |
| Auth periodic refresh | every `60 * 60 * 1000` ms | `AuthProvider.tsx:397` |
| Smart-401 re-arm cooldown | `2000 ms` | `AuthProvider.tsx:382` |
| Sign-out cooldown | `1500 ms` | `AuthProvider.tsx:224` |
| Clipboard "copied" resets | `2500 ms` (share), `2000 ms` (copy/copy-SQL) | `FileView.tsx:161, 170, 176`; `FilePreviewView.tsx:417, 425, 431`; `ArtifactHistory.tsx:45` |
| Chart PNG scale | `scale: 2`, `backgroundColor: null` | `exportUtils.ts:116`, `:115` |
| PWA max cached file | `3 * 1024 * 1024` bytes | `vite.config.ts:23` |

---

## Security-Relevant Observations

1. **The public route is unauthenticated by construction.** `/share/r/:shareId` has no guard wrapper
   and the viewer never touches auth state (`src/App.tsx:67`; `PublicReportViewer.tsx:7-12`). The
   `sw_session` cookie is only a `{userId, expiresAt}` mirror — the real credential is a backend
   httpOnly cookie (`src/components/auth/AuthProvider.tsx:194`; `src/components/auth/cookies.ts:130-142`).
2. **Shared report HTML executes script inside a sandbox that is one attribute short of same-origin
   access.** `sandbox="allow-scripts allow-popups allow-modals"` (`PublicReportViewer.tsx:242`) omits
   `allow-same-origin`, which is the correct omission and is documented as deliberate at `:143-145`. The
   residual capability set is: JS execution, popups (themselves still sandboxed), and modals. No top
   navigation, no forms, no origin access.
3. **The PDF branch is deliberately unsandboxed** (`PublicReportViewer.tsx:232-236`) because Chrome's
   PDF viewer is an extension-provided plugin (`:139-144`). The exposed surface there is the browser's
   PDF viewer, not report markup.
4. **No client-side sanitisation exists on the shared-report path, by design.** The viewer never
   receives the report bytes — it receives URLs (`:146`, `:215`). There is no HTML sanitiser in the
   dependency tree (`package.json:20-77`).
5. **Response-supplied URLs are consumed without scheme or origin validation** (`PublicReportViewer.tsx:146, 202, 215, 233, 239`). The trust boundary is the backend JSON at `:76`; nothing on the client constrains `rawUrl` or `downloadUrl`.
6. **One unsandboxed render of untrusted report HTML exists.** The in-app "open in a new tab" action uses
   `window.open(blobUrl, '_blank')` with no `sandbox` and no `noopener`
   (`FilePreviewView.tsx:586-591`). `blob:` URLs inherit the creating origin, so that tab runs at the app
   origin and holds an `window.opener` reference. This is the highest-severity item in this section.
7. **The code comment about the public fetch overstates its isolation.** `PublicReportViewer.tsx:55-68`
   says the raw fetch avoids attaching the viewer's session cookie, but `fetch()` defaults to
   `credentials: 'same-origin'`, so a same-origin request still carries cookies. What the raw fetch
   actually avoids is `credentials: 'include'`, the CSRF header, and the 401 sign-out dispatch
   (`src/lib/api/client.ts:86-92, 99-103`).
8. **Shared report pages are crawl-eligible.** `document.title` is updated per report (`:79-81`) but the
   static `<meta name="robots" content="index, follow, …">` (`index.html:12-15`), canonical
   (`index.html:24`), and `og:url`/`twitter:url` (`index.html:38, 48`) are left pointing at the site
   root, and `document.title` is never restored on unmount.
9. **Report bytes are never authenticated before download.** The re-sign call is authenticated
   (`FileView.tsx:122`), but the download itself is a bare anchor navigation (`FileView.tsx:133-138`;
   `PublicReportViewer.tsx:214-222`).
10. **The HTML generator's escaper omits `'`** (`htmlReport.ts:11-14`). Not currently reachable, because
    no interpolated value lands in a single-quoted attribute; recorded because it is a latent gap in the
    only output encoder in this section.
11. **`Math.min(...numVals)` spread** in the executive HTML summary (`htmlReport.ts:331-332`) is an
    unbounded call-argument expansion over a full column.
12. **Adjacent: workspace `html_report` files use a narrower sandbox** — `sandbox="allow-scripts"` with
    no popups/modals and no `allow-same-origin` (`WorkspacePanel.tsx:151`).
13. **Tool-input/output redaction is thorough but scoped to the tool cards only.** `ALWAYS_STRIP`
    includes `html_template`, `htmlTemplate`, `sections` and `request_payload`
    (`toolSanitize.ts:28-52`), and `sanitizeToolSummary` redacts UUIDs, JSON id fields and SQL
    (`:123-130`). Applied at the SSE handler, transcript mapper and history rehydrator
    (`useAIAgent.ts:253, 267`; `messageMapper.ts:114, 117, 134, 137`). It does not inspect report bytes.

---

## Dead / Unused Code

| Item | Evidence | Note |
| --- | --- | --- |
| `SharedReportMeta.createdAt` | Declared `src/pages/PublicReportViewer.tsx:31`; zero reads in the file | Received and dropped |
| `SharedReportMeta.shareId` | Declared `src/pages/PublicReportViewer.tsx:27`; zero reads | The id comes from the route param instead |
| `buildChartSection` matrix branch | `src/components/ai/artifacts/htmlReport.ts:217-219` computes `keys` as `null` whenever `artifact.matrix[0]` is an array, and `artifact.matrix` is typed `number[][]` (`src/components/ai/types.ts:206`) — so `addTable` is never called from this branch and the function falls through to `buildTableSection` at `:234` | Dead for any well-typed artifact. The PDF twin is guarded explicitly (`pdfReport.ts:178`, `:186-188`) and lands on `'No data.'` |
| `FunnelStage.conversionFromTop` | Declared optional `src/components/ai/types.ts:79-82` with the comment "not rendered anywhere … Kept because the field is on the wire". Confirmed unread in `htmlReport.ts` and `pdfReport.ts` | Kept deliberately, per its own doc comment |
| `HumanSize` duplication | `src/components/ai/artifacts/views/FileView.tsx:14-19` and `src/components/ai/artifacts/views/FilePreviewView.tsx:19-24` are byte-identical; a third copy exists in `src/components/export/ExportButton.tsx` | Not dead, but triplicated |
| `Html5Icon` triplication | `src/pages/PublicReportViewer.tsx:15-24`, `src/components/ai/artifacts/views/FilePreviewView.tsx:27-36`, `src/components/ai/artifacts/views/FileView.tsx:22-31` — three identical inline SVG components | Live in all three, but duplicated |
| `addAutoTable`'s `didDrawPage` callback | `src/components/ai/artifacts/pdfReport.ts:66` — `didDrawPage: () => { /* keep y updated */ }`, an empty body; the comment describes behaviour the function does not implement, and the sibling copy at `:307-320` omits the key entirely | Vestigial |
| `runQuery`, `saveQuery`, `checkAIHealth` | `src/components/ai/api/index.ts:258-284`, `:325-327`; `useAIChats.ts:161-163` records that `Phase 1 removed useRunQuery, useSaveQuery and useAIHealth: all three had zero consumers` | API functions kept intentionally for re-wiring |
| Preview from Artifact History | `ArtifactHistory.tsx:119-123` renders `ArtifactView` without `onExpand`; `FileView.tsx:294` gates the preview button on `onView` | The code path exists; the history view just never enables it |
| Executive HTML/PDF from non-table artifacts | `ArtifactView.tsx:449` gates on `!isSpecial && rows.length > 0`, so chart / stat-block / file artifacts never get executive variants | Deliberate gate, listed for completeness |

---

## Open Questions

- UNVERIFIED: What generates the HTML that a `/share/r/:shareId` link actually serves? The client-side
  generators in `htmlReport.ts` write a local blob download and are never uploaded anywhere; the shared
  document must come from a server-side generator (implied by the `get_report_html` tool at
  `src/components/ai/tools/ToolIcon.tsx:20, 106-108`), and that generator is not in this repo.
- UNVERIFIED: How is `shareId` generated — length, alphabet, entropy, collision handling, and whether it
  is a random token or a sequential/enumerable identifier?
- UNVERIFIED: Do shared links expire, and what is the TTL? The viewer only reports 404 as "does not exist
  or has expired" (`src/pages/PublicReportViewer.tsx:71-73`); nothing in the client creates, reads or
  refreshes an expiry.
- UNVERIFIED: Can a share link be revoked or unshared from the UI, and does deleting the source chat or
  artifact invalidate it? No revoke/delete endpoint is called anywhere for reports.
- UNVERIFIED: What authorisation does `/ai-api/ai/exports/shared/:shareId` itself enforce? The client
  cannot show whether it requires a share secret beyond the id, whether the id alone is sufficient, or
  whether the backend applies its own rate limiting.
- UNVERIFIED: Are the `rawUrl` and `downloadUrl` values returned by that endpoint same-origin, and what
  Content-Type / `Content-Disposition` / CSP headers does the backend send for them? The client applies
  no validation to either value (`src/pages/PublicReportViewer.tsx:146, 215`).
- UNVERIFIED: Does the backend's HTML report generator emit `<script>`, external subresources, or inline
  event handlers? This determines whether `allow-scripts` on the public iframe is load-bearing.
- UNVERIFIED: Are the app's `sw_session` cookie (`sameSite: 'lax'`, `src/components/auth/cookies.ts:18`)
  and the backend's httpOnly session cookie actually transmitted on a share link opened from another
  origin? Both depend on browser cookie rules and on attributes set outside this repo.
- UNVERIFIED: Is there any server-side size cap on report generation or on the `key`/`filename`/`title`
  parameters sent to `/ai-api/ai/exports/share` (`src/components/ai/artifacts/views/FileView.tsx:149-154`)?
  No client-side cap exists.
- UNVERIFIED: Are the PDF constants (`unit: 'pt'`, `format: 'a4'`) ever overridden for landscape or
  letter-size output? The code hard-codes portrait A4 at `src/components/ai/artifacts/pdfReport.ts:30`
  and `:282` with no option to change it.
- UNVERIFIED: With only the jsPDF standard-14 fonts registered (`src/components/ai/artifacts/pdfReport.ts:41, 254`),
  how do non-WinAnsi characters in column names and cell values render in the PDF? No font file is
  registered and no fallback logic exists, but the resulting glyph behaviour depends on jsPDF internals.
- UNVERIFIED: What is the row limit the backend applies before emitting `artifact.rows`? The report
  generators render every row they receive (`src/components/ai/artifacts/htmlReport.ts:84-86`;
  `src/components/ai/artifacts/pdfReport.ts:233`) with no truncation of their own, so the cap — if any —
  is entirely server-side.
- UNVERIFIED: Does `/ai-api/ai/exports/content?key=` (`src/components/ai/artifacts/views/FilePreviewView.tsx:101, 110`)
  enforce the same authorisation as the share endpoint, or is it a bearer-of-the-key read? The client
  requests it with `credentials: 'include'` only when the URL is same-origin
  (`src/components/ai/artifacts/views/FilePreviewView.tsx:211-212`).
- UNVERIFIED: Is `slide_deck` / workspace `html_report` content (`src/components/ai/types.ts:312-318`)
  ever surfaced through the public share route, or only through the authenticated Workspace panel?
