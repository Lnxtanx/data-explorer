---
title: Mobile Responsiveness Analysis — Data Explorer Web UI
area: frontend / responsive
status: analysis
scope: sw-data-explorer (Vite + React + Tailwind SPA)
target: single responsive web app usable on phone browsers (~375px) and desktop
---

# Mobile Responsiveness Analysis — Data Explorer UI

This document audits the `sw-data-explorer` single-page app for phone-browser
usability and lays out how to make the **same web build** work on mobile that is
opened directly in a phone browser (no separate native app required).

Every finding carries a `path:line` citation. Reference viewport for "mobile" is
**375 × 812 CSS px** (iPhone-class).

---

## 1. Executive summary

The app is a **desktop-first, mouse-first** analytics workspace. It renders and
scrolls on a phone, but it was never designed for a touch viewport:

- The **two-pane app shell is fixed-width** (256px sidebar + grid) with no
  off-canvas behaviour — on a 375px phone the data grid gets ~119px.
- The most-used surfaces (**column stats panel**, **cell hover preview**,
  **export popover**, **settings/connector dialogs**, **dashboard AI side panel**)
  use **hard-coded pixel widths** that exceed or crowd a phone viewport.
- **Critical interactions are mouse-only**: column drag-resize, double-click to
  inspect a cell, and hover-only action buttons (copy, inspect, sort, filter,
  per-table "Ask AI", card menus). Touch users have no equivalent.
- **Responsive prefixes are almost entirely absent** from the app chrome and the
  data grid. The only genuinely responsive areas are the dashboard iframe engine
  (`tokens.css` media queries at 1120px/680px), the public report viewer, and a
  couple of isolated `sm:` usages.

Good news: the primitives needed to fix this already ship in the repo
(Radix `Dialog`/`Popover`, `Sheet`, `vaul` `Drawer`, `useVirtualizer`), the grid
already handles horizontal overflow correctly, and the dashboard engine already
collapses its grid on narrow widths. The work is primarily **layout + input
adaptation**, not a rewrite.

Suggested approach: introduce one shared breakpoint (`<768px` = phone),
add a shared `useIsMobile` hook, and progressively convert fixed rails/panels to
overlays and hover affordances to tap affordances (details in §7–§9).

---

## 2. Baseline / global findings

| Item | Finding | Evidence |
| --- | --- | --- |
| Viewport meta | Correct baseline; pinch-zoom **not** disabled | `index.html:5` |
| Tailwind screens | Stock defaults only (sm 640 / md 768 / lg 1024). No custom mobile screens. | `tailwind.config.ts:6-92` |
| `xs:` breakpoint | **Undefined.** `xs:` classes are no-ops wherever used. | `tailwind.config.ts` (no `xs`); used at `src/pages/PublicReportViewer.tsx:268,279` and `src/components/ai/artifacts/views/FilePreviewView.tsx:992` |
| App-level CSS media queries | **None for the app.** The single `@media (max-width: 900px)` only collapses the hidden SEO shell. | `index.css:434-444` (`.seo-grid/.seo-columns/.seo-docs`) |
| Shared mobile hook | No shared hook. Ad-hoc `window.innerWidth < 768` checks only in AI chat + one artifact view. | `src/components/ai/AIChatMain.tsx:693`; `src/components/ai/artifacts/views/FilePreviewView.tsx:79` |
| Height units | Shell uses `h-screen` (not `dvh`); header/nav can be hidden behind mobile browser chrome. Public viewer already correctly uses `100dvh`. | `src/pages/DataExplorerPage.tsx:371` (`h-screen`); `src/pages/PublicReportViewer.tsx:210` (`h-[100dvh]`) |
| Touch target sizing | Many interactive icons are 24–32px (`h-6 w-6`, `h-7 w-7`, `w-3.5 h-3.5`), below the ~44px touch guideline. | e.g. `TableGrid.tsx:703-717`, `AIChatSidebar.tsx:341,352` |
| PWA | `vite-plugin-pwa` present; installable/offline potential not yet tuned for mobile. | `package.json:97` |

### 2.1 The core layout constraint

`DataExplorerPage` builds a full-height column and hands off to
`DataExplorerLayout`, which is an **unwrapping flex row**:

```
DataExplorerPage.tsx:371   <div className="h-screen flex flex-col ...">
DataExplorerPage.tsx:417   header  <div className="... px-4 h-10 ...">
DataExplorerLayout.tsx:466 <div className="flex w-full h-full ...">
DataExplorerLayout.tsx:471 <aside className="... sidebarCollapsed ? 'w-12' : 'w-64'">
DataExplorerLayout.tsx:596 <main className="flex-1 flex flex-col min-w-0 ...">
```

Default sidebar is expanded (`w-64` = **256px**). On a 375px viewport the main
grid is squeezed to roughly 119px, and because `<main>` is `min-w-0` nothing
overflows — it just becomes unusably narrow. There is no breakpoint at which the
sidebar becomes an overlay/drawer.

---

## 3. App shell & header

| File | Finding | Evidence |
| --- | --- | --- |
| `DataExplorerPage.tsx` | Root is `h-screen flex flex-col overflow-hidden` — use `h-dvh`/`min-h-dvh` so the layout matches the *visible* mobile viewport. | `:371` |
| `DataExplorerPage.tsx` | Header is a single non-wrapping row `flex items-center justify-between px-4 h-10`: connection selector + breadcrumb on the left; Resona toggle + export + sign-in on the right. On 375px these compete for width. | `:416-480` |
| `DataExplorerPage.tsx` | Breadcrumb (`schema › table`) is shown inline and truncatable but not collapsible. | `:427-434` |
| `DataExplorerPage.tsx` | Grid toolbar portal host `flex items-center gap-1 ml-2` — **no wrap**; on mobile the portaled toolbar (filter, columns, copy, page-size, refresh, chips, count) can overflow. | `:437-444`; toolbar itself `TableGrid.tsx:641-757` |
| Demo banner | `flex items-center justify-between` with a long text + button, no wrap. | `:374-400` |

---

## 4. Data Explorer sidebar

### 4.1 SchemaSelector — `src/components/data-explorer/sidebar/SchemaSelector.tsx`

- `flex items-center gap-2` (`:31`) with a `flex-1` Select trigger (`:34`, `h-7 text-xs`).
- No responsive prefixes, but width is flexible so it fits **if** the sidebar is
  reachable. The blocker is the sidebar itself (§2.1), not this component.

### 4.2 TableSidebar — `src/components/data-explorer/TableSidebar.tsx`

- Table rows are tap-friendly buttons (`w-full text-left px-3 py-1.5`, `:152-164`).
- **Per-table "Ask AI" action is hover-only**:
  `className="opacity-0 group-hover:opacity-100 ..."` (`:181`) — invisible/unreachable on touch.
- Row height ~30px — a little small but workable.
- Search input is fine; the count badge is fine.

### 4.3 SidebarFooter — `src/components/layout/SidebarFooter.tsx`

- Two mode-switch buttons (`Explorer` / `Resona AI` / `Dashboard`) plus the
  settings/avatar button, laid out `grid grid-cols-2 gap-1` + icon (`:112-116`).
- Wrapped in `Tooltip` (hover-only decoration). Buttons are ~28px tall (`h-7`,
  `:54`) — below touch guidance.
- When collapsed, it stacks vertically (`:105-109`).

---

## 5. Data grid

### 5.1 TableGrid — `src/components/data-explorer/TableGrid.tsx` (container)

- **The single best mobile behaviour in the app**: the table uses
  `tableLayout: 'fixed'`, `width: '100%'`, `minWidth: 'max-content'`
  (`:784`) inside a `flex-1 overflow-auto` scroller (`:764`). Users can
  pan horizontally. Fixed row height `ROW_HEIGHT = 33` (`:47`).
- Toolbar is portaled (`createPortal`, `:641-757`) into the non-wrapping header
  host (see §3). Contains: filter popover, columns popover, copy, page-size
  select, refresh, filter chips, live indicators, row count. **No wrap / no
  overflow menu** → will overflow at 375px.
- Mouse-only interactions are all defined here: `handleCellDoubleClick`
  (`:517`), `onCellMouseEnter`/`Leave` with a 450ms hover timer (`:536-567`).
  No pointer/touch equivalents.
- No `touch-action` overrides on the scroller (good — native pan works), but
  pinch-zoom is enabled globally so double-tap triggers browser zoom instead of
  a reliable `dblclick`.

### 5.2 ColumnHeader — `src/components/data-explorer/grid/ColumnHeader.tsx`

- **Drag-to-resize is mouse-only**: `handleMouseDown` (`:42-62`) binds
  `document` `mousemove`/`mouseup`; the handle is
  `absolute right-0 ... w-1.5 cursor-col-resize` with `onMouseDown` (`:131-137`).
  No Pointer Events, no touch handlers → **column resize is impossible on touch**.
  The 1.5px handle is also far below a touch target.
- **Double-click resets width** (`:64-68`) — no touch equivalent.
- **Sort button is hover-revealed** (`opacity-0 group-hover:opacity-100`, `:118`)
  → hidden on touch.
- Column header is always visible (good; header click opens stats — that works on tap).

### 5.3 GridRow — `src/components/data-explorer/grid/GridRow.tsx`

- Fixed row-height absolute virtualized `<tr>` (`:73-80`).
- **Double-click opens inspector** (`:113`); **hover opens preview** (`:117-120`).
- **Hover-only per-cell buttons**: copy (`opacity-0 group-hover/cell:opacity-100`, `:144`)
  and inspect (`:161`). Both invisible on touch.

### 5.4 GridFilterPopover — `src/components/data-explorer/grid/GridFilterPopover.tsx`

- `PopoverContent className="w-72 p-3"` (**288px fixed**, `align="start"`, `:123`).
  Fits 375px but consumes ~77% of it; no `max-w` guard.
- Controls use `h-6`/`h-7` (`:110,149,166,223,247`) — small touch targets.

### 5.5 GridColumnsPopover — `src/components/data-explorer/grid/GridColumnsPopover.tsx`

- `PopoverContent className="w-60 p-2.5"` (**240px**, `:52`) — fits.
- List is `max-h-60 overflow-y-auto` (`:70`) — scrolls.
- No mouse-only interactions.

### 5.6 GridFilterChips — `src/components/data-explorer/grid/GridFilterChips.tsx`

- `flex items-center gap-1 overflow-x-auto` (`:20`) — **good mobile pattern**.
- Chips are `text-[10px]` with tiny remove targets (`:41,55`) — cramped on touch.

### 5.7 CellHoverPreview — `src/components/data-explorer/grid/CellHoverPreview.tsx`

- **Hard-coded `const cardWidth = 380`** (`:100`), rendered `position: fixed`
  with inline `width: 380px` (`:133-138`).
- Clamp math `left = max(12, innerWidth - cardWidth - 12)` (`:104-115`) yields
  `left = 12` and a right edge of **392px on a 375px screen → ~17px overflow**.
- Summoned only by `onMouseEnter` with a 450ms delay (`TableGrid.tsx:554-565`);
  kept open by `onMouseEnter` and closed by `onMouseLeave`/`mousedown`
  (`:145-146`, `:38-45`). **No touch/focus equivalent → effectively never appears
  on a phone**, and its `mousedown` dismiss won't fire on touch.

### 5.8 CellInspectorModal — `src/components/data-explorer/grid/CellInspectorModal.tsx`

- **Best-behaved modal in the app**: `max-w-3xl w-[92vw] h-[600px] max-h-[88vh]
  flex flex-col` (`:156`). Adapts to small screens; internal viewer scrolls.
- Toolbar row has `flex-wrap` (`:215`); search input is responsive
  `w-44 sm:w-56` (`:261`) — one of only two responsive usages in the grid.
- Still opened by **double-click** (`:517` in TableGrid) → touch entry point
  missing even though the modal itself is fine.

### 5.9 ColumnStatsPanel — `src/components/data-explorer/ColumnStatsPanel.tsx`

- `className="h-full w-80 ... slide-in-from-right ..."` (**320px fixed**, `:75`).
- It is **not an overlay**: it is a flex sibling of the grid
  (`TableGrid.tsx:760,833`), so on a phone it crushes the grid to ~55px (or
  overflows if the 256px sidebar is also open). No `md:`/`lg:` switch to a
  full-screen sheet.
- Internal grids: stat cards `grid-cols-2` (`:157`), quantiles `grid-cols-3` (`:190`).
- **Filter-by-value action is hover-only** (`opacity-0 group-hover:opacity-100`, `:326`).

---

## 6. Connections & empty state

### 6.1 ConnectionSelector — `src/components/data-explorer/ConnectionSelector.tsx`

- Compact `inline-flex h-8` control: icon button + dropdown (`:36-71`).
- Dropdown content `w-68 p-1` (`:72`) — ~272px; fits 375px. Rows are tap-friendly.
- No responsive prefixes needed; works on mobile as-is.

### 6.2 EmptyState — `src/components/data-explorer/EmptyState.tsx`

- **Largely mobile-aware**: `p-6 pt-5 sm:pt-7`, `max-w-xl` (`:202`); the action
  row switches to a column `flex-col sm:flex-row` (`:428`); the "-10s" skip
  button is `hidden sm:flex` (`:334`); volume slider `w-14 sm:w-20` (`:383`).
- Video player is a tap-friendly custom control surface.
- Main caveat: the whole empty-state hero only renders inside the narrow main
  column (after the fixed sidebar), so it is still width-constrained by §2.1.

---

## 7. AI chat surface (`src/components/ai/`)

The AI surface already contains the codebase's one real mobile strategy — worth
building on.

### 7.1 AIChatMain — `src/components/ai/AIChatMain.tsx`

- **Has a mobile branch**: `isMobile = window.innerWidth < 768` (`:693`,
  updated on resize `:695-699`).
  - **Mobile (`:718-729`)**: renders `chatPanel` full width; any side panel
    (`WorkspacePanel`, `DashboardPanel`, `ArtifactPanel`) becomes a
    `fixed inset-0 z-50` full-screen overlay. Good.
  - **Desktop (`:731-745`)**: `ResizablePanelGroup` with a draggable splitter
    (`ResizableHandle`) — drag is mouse/pointer only and irrelevant on mobile.
- Chat column is `max-w-3xl mx-auto px-4` (`:551`, `:596`) and message list
  scrolls — mobile-safe.
- Project pill truncates `max-w-[150px]` (`:544`).
- No `sm:`/`md:` breakpoints used; it relies on the JS branch instead.

### 7.2 Fixed-width / hover-only issues in AI subcomponents

| Component | Issue | Evidence |
| --- | --- | --- |
| `ChatMessage.tsx` | `HoverCardContent className="w-[320px] ..."` (fixed 320px) | `:86` |
| `ChatInput.tsx` | `HoverCardContent className="w-[320px] ..."` | `:52` |
| `MarkdownText.tsx` | `HoverCardContent className="w-[320px] ..."` | `:135` |
| `MentionPicker.tsx` | `absolute bottom-full ... w-64` (**256px**) mention autocomplete | `:65` |
| `TablePreview.tsx` | `min-w-[280px] max-w-[320px]` — a 280px minimum table inside a chat bubble | `:18` |
| `TurnNavigator.tsx` | `absolute right-7 ... w-72 sm:w-80` turn-jump popover (partly responsive) | `:158` |
| `ModeSelector.tsx` | `w-44` dropdown | `:89` |
| `AIChatSidebar.tsx` | `DropdownMenuContent ... w-44` menus; dialog `sm:max-w-[420px]` | `:357,462,485,650,665,814` |
| `AIChatSidebar.tsx` | **Hover-only** "new chat in project" and options buttons `opacity-0 group-hover:opacity-100` | `:341,352` |
| `FilePreviewView.tsx` | Uses `sm:`/`md:` breakpoints (`w-28 sm:w-36 md:w-44`) — already adaptive | `:905` |
| `ArtifactView.tsx` | Fixed inputs `w-40`/`w-44`, dropdown `min-w-[120px]` | `:223,264,272` |
| `AIChatLibrary.tsx` | `relative w-72` search/header, table `w-10` | `:157,203` |
| `ChatLoadingSkeleton.tsx` | `w-48 sm:w-64` (responsive) | `:11` |
| `ChatEmptyState.tsx` | `w-12 h-12 sm:w-14 sm:h-14` (responsive) | `:32` |

**Systemic AI issue:** `HoverCard` (`ChatMessage`, `ChatInput`, `MarkdownText`)
is hover-triggered by Radix and cannot be opened on touch; combined with multiple
`w-[320px]` fixed cards this is the main AI mobile risk. Also many hover-only
controls (`group-hover:opacity-100`) across `ToolCallCard`, `LiveToolSteps`,
`ClarificationView`, `MarkdownText` (copy-math), `AIChatProjects` have no touch
path.

---

## 8. Dashboard surface

### 8.1 Rendered dashboard iframe (engine) — `src/dashboard-engine/tokens.css`

This is **the most responsive part of the product** and should be the model:

- Fluid container: `.sw-dashboard { max-width: 1400px; padding: 20px 24px }` (`:166-170`).
- Grid collapses on narrow widths:
  `@media (max-width: 1120px)` → 3-col becomes 2-col (`:261-265`);
  `@media (max-width: 680px)` → 3/2-col become **1 column** and all spans reset
  (`:266-269`).
- Tables scroll horizontally: `.sw-table-wrapper { overflow: auto; max-height: 460px }` (`:963-970`).
- Cohort grid scrolls: `.sw-cohort-wrap { overflow-x: auto }` (`:1237-1241`).
- Geo map is fluid `width:100%; aspect-ratio:2/1` (`:1404-1412`).
- Charts are fluid `width:100%; max-height:280px` (`:957-960`).

**Remaining mobile issues in the engine:**
- **Hover-only card controls**: `.sw-card-action-btn { opacity: .45 }` revealed on
  `.sw-card:hover` (`:382-401`); `.sw-card-resize-handle` opacity on hover
  (`:312-320`). On touch there is no hover, so card actions/resize are hidden.
- **Drag-resize handle is pointer-based** (`cursor: nwse-resize`, `touch-action:none`,
  `:295-310`) — small (16px) and awkward on touch.
- Card menus use a custom absolute dropdown (`.sw-card-dropdown`, `:447-467`) with
  `min-width:155px`; positioned `top: calc(100% + 4px); right: 0` — can clamp/skip
  at the screen edge on mobile but is not viewport-guarded.
- Focus mode pins card at `top/left/right/bottom: 24px` (`:601-617`) — fine on phones.
- Funnel labels fixed `width:110px` (`:1337-1346`) — small but acceptable.

### 8.2 React dashboard shell

| File | Finding | Evidence |
| --- | --- | --- |
| `DashboardView.tsx` | Iframe `w-full h-full flex-1` — fluid (good). Offline/shared banner rows don't wrap but are short. Dialogs `sm:max-w-md`. | `:306-334`, `:338,373` |
| `DashboardSidebar.tsx` | Section-nav rail with search, refresh, settings dropdown, hidden-panel pill. Fits the 256px sidebar; footer buttons `h-7` small. Dropdown menus `w-52`/`w-36`. | `:221-515`, `:391,411` |
| `DashboardEmptyState.tsx` | **Responsive**: `max-w-4xl px-8 sm:px-12`, `text-xl sm:text-2xl`, `ml-4 pl-9` timeline with fixed offsets. Some fixed negative offsets (`-left-[37px]`) are fragile on very narrow screens. | `:82,85,96,114` |
| `GenerateProgress.tsx` | Centered `max-w-lg w-full` card, `max-w-xs` text — mobile-safe. | `:41,52` |
| `side-panel/ResonaAISidePanel.tsx` | Right drawer. Resize overlay `fixed inset-0 z-[9999] cursor-col-resize` (`:130`); panel `flex flex-col h-full flex-1 border-l` (`:156`). | — |
| `side-panel/useSidePanelResize.ts` | **Width 340–750px** (`MIN=340, MAX=750, DEFAULT=400`, `:8-10`); drag uses **mouse events only** (`:28-64`). On a 375px phone the panel is effectively full-screen and cannot be resized; at desktop it is a fixed rail. | `:8-10,28-64` |
| `ResonaAIHeader.tsx` | `w-72 sm:w-80` session dropdown (`:160`); some `max-w-[120px] hidden sm:inline`. | — |
| `ResonaAIMessageItem.tsx` | `max-w-[90%] sm:max-w-[85%]` (responsive). | `:107` |
| `ResonaAIEmptyState.tsx` | `max-w-[290px]`, `max-w-[340px]` — fits. | `:43,48` |
| `ResonaAIInput.tsx` | `w-full`, `max-h-32` — fits. | `:278` |

---

## 9. Settings, billing, auth, collaboration, connector, notifications, export

### 9.1 Shared primitives (root-cause issues)

| File | Finding | Evidence |
| --- | --- | --- |
| `ui/dialog.tsx` | Base `DialogContent`: `fixed left-[50%] top-[50%] w-full max-w-lg translate-...` — **no side margin**, so modals are full-bleed/edge-touching on phones. | `:37-52` |
| `ui/alert-dialog.tsx` | Same `w-full max-w-lg` full-bleed behaviour. | `:28-44` |
| `ui/popover.tsx` | Default `PopoverContent w-72` (288px) with no viewport guard. | `:20` |
| `ui/tabs.tsx` | `TabsList inline-flex`, triggers `whitespace-nowrap` — **no wrap/scroll** → tab rows overflow when there are many tabs. | `:15,30,42` |
| `ui/table.tsx` | `div.relative.w-full.overflow-auto` — data tables scroll horizontally (good). | `:7` |
| `ui/sheet.tsx`, `ui/drawer.tsx` | Available but **unused** by these surfaces — no existing mobile drawer fallback. | — |

### 9.2 Settings

| File | Finding | Evidence |
| --- | --- | --- |
| `SettingsModal.tsx` | `max-w-4xl h-[90vh] max-h-[600px] p-0 ...` containing a **fixed two-pane row** (`flex flex-1`) = `SettingsSidebar` + content. | `:74,79-89` |
| `SettingsSidebar.tsx` | Fixed `w-48` (**192px**), no responsive collapse. | `:32` |
| → net effect | At 375px: ~183px left for all settings content. | — |
| `AppearanceSettings.tsx` | Theme chooser `grid grid-cols-3 gap-3` — ~55px cells inside the narrow column. | — |
| `MemorySettings.tsx` | `Select w-[200px]` (**wider than the ~183px content column → overflow**), `Textarea min-h-[300px]`. | — |
| `CollaborationSettings.tsx` | `TabsList w-full sm:w-auto` with 4 triggers — can overflow (no scroll). Team grid `sm:grid-cols-3` is responsive. | `:224` |
| `ProfileSettings.tsx` | `flex flex-col sm:flex-row gap-3 max-w-xs` — responsive. | `:61` |
| `DocumentationSettings.tsx` | `flex-col sm:flex-row`, `grid-cols-1 sm:grid-cols-2` — responsive. | `:114,132,166,205` |
| `FeedbackSettings.tsx` | `max-w-2xl`, `w-full`, `flex-wrap` — fine. | — |
| `ShortcutsSettings.tsx` | Keyboard reference table — fine. | — |

### 9.3 Billing

| File | Finding | Evidence |
| --- | --- | --- |
| `billing/components/PlansSettings.tsx` | Dialog `max-w-2xl max-h-[85vh] overflow-y-auto` (full-bleed on phone). Many inner grids already responsive: `flex-col sm:flex-row`, `grid-cols-2 sm:grid-cols-4`, `grid-cols-1 sm:grid-cols-2`. | `:736,442,514,750,864,992` |
| PlansSettings tables | History/Invoices are 6-column `<Table>` inside cards with `overflow-hidden`. Table primitive scrolls horizontally, but the card clips the scroll affordance. | `:545-728,562,651` |
| `billing/components/UsageSettings.tsx` | `grid grid-cols-1 sm:grid-cols-2` — responsive. | `:235,377` |
| `PremiumAvatar.tsx` | Fixed small size map — fine. | `:15-34` |

### 9.4 Collaboration

| File | Finding | Evidence |
| --- | --- | --- |
| `InvitationReviewModal.tsx` | **Bug:** `DialogContent className="sm:max-width-md"` — invalid Tailwind (`max-width` vs `max-w`), so it silently keeps `max-w-lg`. Footer is `flex-col sm:flex-row` (responsive). | `:56,121` |
| `MembersPanel.tsx` | Invite row `flex gap-2` with `flex-1` input + **fixed `w-[110px]` select** — overflows the narrow modal column. | `:101-111` |
| `ConnectionsPanel.tsx` | `grid gap-2.5 sm:grid-cols-2` — responsive. | `:47` |
| `AgentSharesPanel.tsx` / `ProjectsPanel.tsx` | Truncation-safe rows; no fixed columns. | — |

### 9.5 Connector

| File | Finding | Evidence |
| --- | --- | --- |
| `ConnectorDialog.tsx` | `max-w-4xl p-0 gap-0 h-[640px] max-h-[90vh]` with a **fixed `w-48` ConnectorSidebar** (same two-pane problem as Settings). | `:115` |
| Content panes | **Already responsive**: `grid-cols-2 sm:grid-cols-4`, `flex-col sm:flex-row`, `w-full sm:w-48`, `hidden sm:inline` across overview/health/logs/settings/wizard. | e.g. `ConnectorOverview.tsx:58,220`; `ConnectorHealth.tsx:73,98,120`; `ConnectorExecutionLogs.tsx:141,172,329` |

### 9.6 Notifications

- `NotificationBanner.tsx` `aside w-full px-4 py-2` with centered `max-w-4xl`
  content and an absolutely-positioned dismiss button (`right-3`). No
  `min-w-0`/truncate on the message and an optional `shrink-0` link can crowd the
  dismiss button on a 375px bar. | `:82-121`

### 9.7 Export

| File | Finding | Evidence |
| --- | --- | --- |
| `export/ExportButton.tsx` | `PopoverContent align="end" className="w-[340px] ..."` (**fixed 340px**, right-anchored) — ~91% of a 375px screen; collision detection may shift it but it is very tight. | `:790` |
| Format tiles | `grid grid-cols-5 gap-1.5` (CSV/Sheets/Excel/JSON/SQL) into 340px → ~62px tiles with `text-[10px]`. | `:1051` |
| Other fixed bits | scope tabs `grid-cols-3` (`:793`), row-limit select `w-28` (`:1093`), truncations `max-w-[230px]`/`max-w-[100px]` (`:1119,865`). No responsive prefixes anywhere in the file. | — |

---

## 10. Public report viewer — already mobile-ready (reference implementation)

`src/pages/PublicReportViewer.tsx` is the model to copy from:

- Full-height `flex flex-col h-[100dvh] min-h-[100dvh] max-h-[100dvh] ... overscroll-none` (`:210`).
- Responsive header (`flex-wrap`, `px-3 sm:px-4`, labels `hidden sm:inline`) (`:212-280`).
- Mobile detection + native PDF reader notice (`:205-207,285-302`).
- Native share sheet via `navigator.share` (`:143-156`).
- touch scroll `[-webkit-overflow-scrolling:touch]` (`:305`).

Note: it uses `hidden xs:inline` (`:268,279`) but `xs` is **not defined** in the
Tailwind config, so those labels never appear at any width — a latent bug.

---

## 11. Voice

| File | Finding | Evidence |
| --- | --- | --- |
| `voice/components/FloatingVoiceOrb.tsx` | 64px orb, portaled to `body`, positioned via inline px but **clamped to the viewport** on resize (`snap`) — stays on screen. Drag uses **Pointer Events + `touch-action:none`** so touch drag works. **But mute/end buttons are hover-only** (`hovered ? opacity-100 : opacity-0 focus-within:opacity-100`, `:207-231`); double-click swaps renderer (`:163`, no touch equivalent). | `:133-171,163,207-246` |
| `voice/components/VoiceControlBar.tsx` | `max-w-3xl px-4 py-2.5 flex items-center justify-between gap-4`, **no wrap**; three `w-9 h-9` buttons + label. Dense at 375px but fits. Only responsive bit is `sm:gap-2` (`:126`). | `:81-84` |
| `voice/components/VoiceSessionOverlay.tsx` | Hero variant `max-w-xl px-4` (safe); docked variant `absolute bottom-0 left/right-0 p-4` with `max-w-3xl` inner (safe). | `:69-121` |
| `voice/components/VoicePanel.tsx` | Buttons `h-8 w-8` (32px), tooltips hover-only. | `:37-64` |
| `voice/components/MicButton.tsx` | `h-8 w-8`; error bubble `absolute bottom-full ... whitespace-nowrap` can overflow horizontally. | `:40,67` |
| `voice/components/VoiceOrbStage.tsx` | Fixed orb sizes 68/112/160px, centered — fits. | `:38,55,64` |
| `orbs/IridescentFlow.tsx` | Canvas `dpr` capped at 2, respects `prefers-reduced-motion` and pauses off-screen (battery-friendly); `use-webgl-support` falls back to `PulseOrb` on weak GPUs. | `:291-295,395,406` |

---

## 12. Cross-cutting issues (priority ordered)

| # | Issue | Where | Mobile impact |
| --- | --- | --- | --- |
| 1 | Fixed 256px sidebar, no drawer | `DataExplorerLayout.tsx:466-472` | Grid reduced to ~119px |
| 2 | `ColumnStatsPanel` 320px flex sibling (not overlay) | `ColumnStatsPanel.tsx:75`; `TableGrid.tsx:760,833` | Grid crushed/overflow |
| 3 | `CellHoverPreview` 380px fixed + mouse-only | `CellHoverPreview.tsx:100,104-115,133-138,145-146` | ~17px overflow; never appears on touch |
| 4 | Column drag-resize + double-click (no touch) | `ColumnHeader.tsx:42-62,64-68,131-137` | Resize impossible |
| 5 | Double-click cell inspect + hover-only actions | `GridRow.tsx:113,144,161`; `TableSidebar.tsx:181`; `ColumnStatsPanel.tsx:326` | Core actions unreachable |
| 6 | Export popover 340px + `grid-cols-5` | `ExportButton.tsx:790,1051` | Crowded/clipped |
| 7 | Settings/Connector two-pane modals (fixed `w-48`) | `SettingsModal.tsx:74`; `ConnectorDialog.tsx:115` | ~183px content column |
| 8 | Base Dialog/AlertDialog full-bleed (`w-full max-w-lg`) | `ui/dialog.tsx:37`; `ui/alert-dialog.tsx:28` | Edge-touching modals |
| 9 | No-wrap `TabsList` | `ui/tabs.tsx`; `CollaborationSettings.tsx:224` | Overflowing tabs |
| 10 | Fixed popovers `w-72` / `w-[340px]` | `ui/popover.tsx:20`; `ExportButton.tsx:790` | Near-viewport-width |
| 11 | Hover-only AI cards/bubbles (`w-[320px]`) | `ChatMessage.tsx:86`; `ChatInput.tsx:52`; `MarkdownText.tsx:135` | Unreachable on touch |
| 12 | Resona dashboard side panel 340–750px, mouse-resize | `useSidePanelResize.ts:8-10,28-64` | Full-width/unresizable |
| 13 | Header/toolbar no wrap | `DataExplorerPage.tsx:417,437-444`; `TableGrid.tsx:641-757` | Overflow |
| 14 | Invalid `xs:` breakpoint | `PublicReportViewer.tsx:268,279`; `FilePreviewView.tsx:992` | Labels never render |
| 15 | Invalid `sm:max-width-md` | `InvitationReviewModal.tsx:56` | Wrong modal width |
| 16 | `h-screen` vs `dvh` | `DataExplorerPage.tsx:371` | Content under mobile chrome |
| 17 | Hover-only card controls in dashboard engine | `tokens.css:382-401,312-320` | Hidden on touch |

---

## 13. Recommended strategy (how to make it fit)

### 13.1 Foundations

1. **Define one mobile breakpoint** and a shared hook.
   - Use Tailwind stock `md:` (768px) as the phone/desktop line; `<md` = phone.
   - Add `src/hooks/useIsMobile.ts` (matchMedia-based) and reuse it instead of
     ad-hoc `innerWidth` checks (`AIChatMain.tsx:693`).
2. **Switch full-height containers to dynamic viewport units.**
   - Replace `h-screen` with `h-dvh`/`min-h-dvh` in the shell
     (`DataExplorerPage.tsx:371`) to handle mobile browser bars (the public
     viewer already does this).
3. **Add a safe mobile default for the base `DialogContent`/`AlertDialogContent`**:
   `w-[calc(100vw-1.5rem)] max-h-[90dvh] overflow-y-auto` so all modals stop
   touching screen edges.
4. **Define an `xs` screen** (e.g. 420px) in `tailwind.config.ts`, or remove the
   `xs:` usages — currently a silent no-op.
5. **Enforce ≥44px touch targets** for icon buttons in the shell/grid/toolbar.

### 13.2 Shell & navigation

- Make the left sidebar an **off-canvas drawer** below `md`: reuse the existing
  `Sheet` or `vaul` `Drawer` primitives; add a hamburger in the header; keep the
  `w-12` collapsed rail only on `md+`.
- Make the header **wrap or overflow menu** on mobile: move grid actions
  (filter/columns/copy/refresh/page-size) into a single "⋯" menu below `md`, and
  let the portaled toolbar scroll horizontally as a fallback.
- Show the breadcrumb only on `sm+` or truncate it.

### 13.3 Data grid

- Convert **ColumnStatsPanel → full-screen `Sheet`/`Drawer`** at `<md` (it already
  looks like a drawer). Avoid rendering it as a grid sibling on phones.
- Provide **touch equivalents**:
  - Replace double-click-to-inspect with **single tap** (or long-press) on touch.
  - Replace hover Card with **tap → bottom sheet** quick-peek on touch; hide
    `CellHoverPreview` on coarse pointers (`@media (hover: none)`).
  - Make per-cell copy/inspect, column sort, per-table Ask-AI, and stats
    filter buttons **always visible on touch** (swap `opacity-0 group-hover:*`
    for a `coarse-pointer:`-visible state).
  - Disable **drag-resize** on touch and provide a "reset widths / auto-fit"
    action instead (`ColumnHeader.tsx`).
- Keep the existing horizontal-scroll table behaviour (it is correct); consider
  sticky first column ("#" + PK) for orientation on phones.
- Guard popovers: `w-72 max-w-[calc(100vw-1rem)]`; enlarge `h-6`/`h-7` controls.

### 13.4 AI chat

- Promote the existing `<768px` full-screen side-panel behaviour into a shared
  pattern and apply it to any remaining fixed panels.
- Convert `HoverCard` usages (`ChatMessage`, `ChatInput`, `MarkdownText`) to a
  tap-triggered popover/sheet on touch.
- Change fixed `w-[320px]` cards to `w-[min(320px,calc(100vw-2rem))]`.
- `TablePreview` `min-w-[280px]` → allow horizontal scroll or stack.

### 13.5 Dashboard

- Keep the engine's media queries; additionally:
  - Reveal `.sw-card-action-btn` / resize handle on touch via
    `@media (hover: none)` and enlarge them.
  - Replace drag-resize with explicit width/height presets on touch, or at least
    make the handle larger and pointer-friendly.
  - Viewport-guard `.sw-card-dropdown` (flip/clamp at edges).
- React shell: below `md`, render `DashboardSidebar` as a collapsible top
  section or drawer instead of a fixed rail.
- `ResonaAISidePanel`: on phones make it a full-screen overlay (like AI chat
  side panels) and hide the mouse-only resize handle.

### 13.6 Settings / Connector / Billing

- Below `md`, **stack the two-pane modals**: turn the `w-48` sidebar into a
  horizontal, scrollable tab strip (or a `Select`) above the content.
- Fix fixed widths inside settings (`MemorySettings` `w-[200px]` select).
- `TabsList`: add `overflow-x-auto` (or wrap) so tab rows never overflow.
- Export: `w-[min(340px,calc(100vw-1rem))]` and `grid-cols-3 sm:grid-cols-5`.
- Fix the two class bugs: `InvitationReviewModal` `sm:max-width-md` →
  `sm:max-w-md`; `xs:` in PublicReportViewer and FilePreviewView.

### 13.7 Voice

- Make `VoiceControlBar` wrap or ship a compact variant under `md`.
- On the floating orb, expose mute/end as always-visible (or via tap-toggled
  menu) on touch; provide a tap path to swap the renderer.
- Prevent the `MicButton` error bubble from overflowing (`max-w`, wrap).

### 13.8 Optional (mobile polish)

- PWA is already wired (`vite-plugin-pwa`): add a manifest + `display:
  standalone` and offline shell for an installable mobile experience.
- Test on real devices with Chrome DevTools device mode; verify with
  `matchMedia('(hover: none)')` / `pointer: coarse` for input-adaptive styling.

---

## 14. Prioritized remediation roadmap

| Phase | Scope | Effort | Rationale |
| --- | --- | --- | --- |
| **P0** | Shell off-canvas sidebar + header/toolbar wrap/overflow menu; base Dialog margins; `h-dvh` | M | Unblocks the whole app on phones |
| **P0** | ColumnStatsPanel → Sheet; CellHoverPreview → tap sheet + hide on coarse pointers | M | Two worst overflow offenders |
| **P0** | Touch equivalents for grid actions (tap inspect, always-visible cell/column actions) | M | Core workflow reachability |
| **P1** | Settings/Connector two-pane → stacked tabs; fix fixed widths; Tabs scroll | M | Major secondary surfaces |
| **P1** | Export popover responsive + `grid-cols-3 sm:grid-cols-5` | S | High-frequency action |
| **P1** | AI HoverCards → tap popovers; clamp `w-[320px]` cards | M | AI is a headline feature |
| **P2** | Dashboard engine touch controls + panel presets; Resona panel full-screen | M | Analytics on mobile |
| **P2** | Voice control bar wrap + orb touch controls | S | Polish |
| **P2** | Bug fixes: `sm:max-width-md`, `xs:` breakpoint | XS | Correctness |
| **P3** | PWA manifest/standalone + offline; sticky grid column; device testing | M | Distribution & UX |

Legend: XS < 1h, S ≈ half-day, M ≈ 1–3 days (per phase, rough).

---

## 15. Appendix — citation index

Shell & nav: `src/pages/DataExplorerPage.tsx:371,417,437-444`;
`src/components/data-explorer/DataExplorerLayout.tsx:466-472,596`;
`src/components/layout/SidebarFooter.tsx:105-116`;
`src/components/data-explorer/sidebar/SchemaSelector.tsx:31,34`.

Grid: `src/components/data-explorer/TableGrid.tsx:47,517,536-567,641-757,760,764,784,833`;
`src/components/data-explorer/grid/ColumnHeader.tsx:42-68,118,131-137`;
`src/components/data-explorer/grid/GridRow.tsx:113,117-120,144,161`;
`src/components/data-explorer/grid/GridFilterPopover.tsx:110,123`;
`src/components/data-explorer/grid/GridColumnsPopover.tsx:52,70`;
`src/components/data-explorer/grid/GridFilterChips.tsx:20,41,55`;
`src/components/data-explorer/grid/CellHoverPreview.tsx:100,104-115,133-138,145-146`;
`src/components/data-explorer/grid/CellInspectorModal.tsx:156,215,261`;
`src/components/data-explorer/ColumnStatsPanel.tsx:75,157,190,326`;
`src/components/data-explorer/TableSidebar.tsx:181`.

Connections/empty: `src/components/data-explorer/ConnectionSelector.tsx:36-72`;
`src/components/data-explorer/EmptyState.tsx:202,334,383,428`.

AI: `src/components/ai/AIChatMain.tsx:544,551,596,693-746`;
`src/components/ai/chat/ChatMessage.tsx:86,155`;
`src/components/ai/chat/ChatInput.tsx:52`;
`src/components/ai/messages/MarkdownText.tsx:135`;
`src/components/ai/input/MentionPicker.tsx:65`;
`src/components/ai/messages/TablePreview.tsx:18`;
`src/components/ai/chat/TurnNavigator.tsx:158`;
`src/components/ai/AIChatSidebar.tsx:341,352,357,814`;
`src/components/ai/artifacts/views/FilePreviewView.tsx:79,905`;
`src/components/ai/artifacts/ArtifactView.tsx:223,264,272`;
`src/components/ai/AIChatLibrary.tsx:157,203`;
`src/components/ai/models/ModeSelector.tsx:89`.

Dashboard: `src/dashboard-engine/tokens.css:166-170,261-269,295-320,382-401,447-467,601-617,957-960,963-970,1237-1241`;
`src/components/dashboard/DashboardView.tsx:306-334,338,373`;
`src/components/dashboard/DashboardSidebar.tsx:391,411,521`;
`src/components/dashboard/DashboardEmptyState.tsx:82,85,96,114`;
`src/components/dashboard/GenerateProgress.tsx:41,52`;
`src/components/dashboard/side-panel/useSidePanelResize.ts:8-10,28-64`;
`src/components/dashboard/side-panel/ResonaAISidePanel.tsx:130,156`;
`src/components/dashboard/side-panel/ResonaAIHeader.tsx:160`;
`src/components/dashboard/side-panel/ResonaAIMessageItem.tsx:107`.

Settings/billing/etc.: `src/components/settings/SettingsModal.tsx:74,79-89`;
`src/components/settings/SettingsSidebar.tsx:32`;
`src/components/settings/AppearanceSettings.tsx`; `src/components/settings/MemorySettings.tsx`;
`src/components/settings/CollaborationSettings.tsx:224`;
`src/components/settings/ProfileSettings.tsx:61`;
`src/components/billing/components/PlansSettings.tsx:736,442,514,545-728,750,1051`;
`src/components/billing/components/UsageSettings.tsx:235,377`;
`src/components/collaboration/InvitationReviewModal.tsx:56`;
`src/components/collaboration/MembersPanel.tsx:101-111`;
`src/components/connector/ConnectorDialog.tsx:115`;
`src/components/connector/ConnectorOverview.tsx:58,220`;
`src/components/connector/ConnectorHealth.tsx:73,98,120`;
`src/components/connector/ConnectorExecutionLogs.tsx:141,172,329`;
`src/components/notifications/NotificationBanner.tsx:82-121`;
`src/components/export/ExportButton.tsx:790,793,1051,1093,1119`.

UI primitives: `src/components/ui/dialog.tsx:37-52`; `ui/alert-dialog.tsx:28-44`;
`ui/popover.tsx:20`; `ui/tabs.tsx:15,30,42`; `ui/table.tsx:7`; `ui/sheet.tsx`; `ui/drawer.tsx`.

Public viewer: `src/pages/PublicReportViewer.tsx:143-156,205-210,212-280,285-305`.

Voice: `src/components/voice/components/FloatingVoiceOrb.tsx:133-171,163,207-246`;
`VoiceControlBar.tsx:81-84,126`; `VoiceSessionOverlay.tsx:69-121`;
`VoicePanel.tsx:37-64`; `MicButton.tsx:40,67`; `VoiceOrbStage.tsx:38,55,64`;
`src/components/voice/orbs/IridescentFlow.tsx:291-295,395,406`.

Global: `index.html:5`; `tailwind.config.ts:6-92`; `src/index.css:434-444`;
`package.json:97`.
