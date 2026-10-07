---
title: Application Shell, View Modes & Navigation
section: 1
area: app-shell
sources: 26
status: rough
---

# 01. Application Shell, View Modes & Navigation

Internal reference for engineers. Every claim carries a `path:line` citation. Third-party
behaviour (next-themes 0.3.0) is cited against `node_modules`, and is called out as such.

## Component / File Map

### Assigned files (read in full)

| File | Responsibility | ~Lines |
| --- | --- | --- |
| `src/main.tsx` | React root; optional `GoogleOAuthProvider` wrapper; global CSS imports | 17 |
| `src/App.tsx` | Route table, provider stack, CSRF init, cache-hydration gate, `DarkClassSync` | 80 |
| `src/pages/DataExplorerPage.tsx` | The only `/` route body. Owns `mode`, connection selection, header render-prop, invite + `?plan=` deep links, lazy modals, idle preload, keyboard shortcut | 518 |
| `src/pages/PublicReportViewer.tsx` | `/share/r/:shareId` route body. Documented here by route + purpose only | 248 |
| `src/lib/view-mode.ts` | `ViewMode` union, storage-key literals, custom-event name, labels, type guard | 15 |
| `src/lib/queryClient.ts` | Module-level `QueryClient` singleton, default options, persisted-query wiring, query-key factory | 81 |
| `src/lib/persist.ts` | IndexedDB-backed explorer query persister + `restoreExplorerCache` | 143 |
| `src/components/data-explorer/DataExplorerLayout.tsx` | Three-column shell: sidebar / main / AI side panel. Lazy AI + dashboard surfaces, portal hosts, AI sub-view state, dashboard hooks | 733 |
| `src/components/data-explorer/index.ts` | Barrel export for the data-explorer component folder | 16 |
| `src/components/layout/SidebarFooter.tsx` | Mode switch buttons + settings/avatar button at the bottom of the sidebar | 120 |
| `src/index.css` | Tailwind entry, four HSL palettes, scrollbar utilities, SEO styles | 444 |
| `vite.config.ts` | SWC React plugin, PWA, dep pre-bundling, dev proxy, manual chunks | 99 |
| `index.html` | Document head, SEO/JSON-LD, Razorpay script, sr-only SEO block, `#root` | 394 |

### Supporting files read to resolve a citation (not owned by this section)

| File | Why read |
| --- | --- |
| `src/shared/lib/queryRoots.ts` | Single source of the persisted query root (`src/shared/lib/queryRoots.ts:26`) |
| `src/components/settings/AppearanceSettings.tsx` | Writer of the default-mode key, dispatcher of the mode-change event, theme list |
| `src/components/auth/inviteToken.ts` | `sessionStorage` invite persistence across OAuth |
| `src/lib/api/client.ts` | `initCsrfToken` / `getCsrfToken` implementation |
| `src/components/auth/AuthProvider.tsx` | OAuth callback URL handling, logout sweep call sites, session restore |
| `src/components/auth/clearAllClientData.ts` | Logout sweep of local/session storage and cookies |
| `src/shared/storage/registry.ts` | Key ownership registry referenced by the storage modules |
| `src/shared/storage/store.ts` | Versioned store used by explorer preferences |
| `src/components/data-explorer/storage/explorer-preferences.ts` | `sw-explorer-last-table` / `sw-explorer-page-size` keys, TTL, page-size whitelist |
| `src/components/connector/api/useConnections.ts` | Connection-list query key, staleTime, poll interval |
| `src/components/data-explorer/TableGrid.tsx` | Consumer of `table-actions-portal` |
| `src/__tests__/featureLayout.test.ts`, `src/lib/__tests__/persistence.test.ts` | Architecture guards that pin the query root and storage behaviour |
| `node_modules/next-themes/dist/index.js` | Exact class-attribute behaviour of `attribute="class"` |

---

## 1. Routing

Three routes, all inside one `BrowserRouter` with no `basename` (`src/App.tsx:65-71`):

| Path | Element | Line |
| --- | --- | --- |
| `/share/r/:shareId` | `<PublicReportViewer />` | `src/App.tsx:67` |
| `/` | `<DataExplorerPage />` | `src/App.tsx:68` |
| `*` | `<Navigate to="/" replace />` | `src/App.tsx:69` |

- The catch-all redirect target is the literal `"/"` with no search string specified, so any
  unmatched path is replaced by `/` (`src/App.tsx:69`).
- Both route components are **statically** imported (`src/App.tsx:8-9`), so the public report
  viewer and the whole explorer page are in the initial chunk.

### `/share/r/:shareId` — route + purpose only

- Purpose: a standalone, unauthenticated viewer for a shared report, per its own header comment
  (`src/pages/PublicReportViewer.tsx:1-5`).
- Reads `shareId` from `useParams` (`src/pages/PublicReportViewer.tsx:37`) and fetches
  `/ai-api/ai/exports/shared/${shareId}` with a **raw** `fetch`, deliberately bypassing
  `lib/api/client` so no session cookie is attached and no `auth:unauthorized` event is fired
  (`src/pages/PublicReportViewer.tsx:55-69`).
- Sets `document.title` to `${title|filename} · Schema Weaver Data Explorer` on success
  (`src/pages/PublicReportViewer.tsx:80`).
- 404 maps to "This shared report does not exist or has expired."; other non-OK statuses map to
  `Failed to load shared report (<status>)` (`src/pages/PublicReportViewer.tsx:70-75`).
- Internal rendering is out of this section's scope.

### Query-string parameters

All shell query-string handling uses `new URLSearchParams(window.location.search)` — the router is
never consulted (`src/pages/DataExplorerPage.tsx:76,134,230,265`,
`src/components/data-explorer/DataExplorerLayout.tsx:170,176,303,335,352`).

| Param | Read at | Written / deleted at | Notes |
| --- | --- | --- | --- |
| `view` | `src/pages/DataExplorerPage.tsx:76` (mount only) | set `ai` at `:137`; set `dashboard` at `:140`; deleted at `:143` | Validated by `isViewMode` (`src/lib/view-mode.ts:13-15`) before it can win the mount precedence chain |
| `chat` | `src/components/data-explorer/DataExplorerLayout.tsx:170` | set at `:306`; deleted at `:308`, `:337`, and `src/pages/DataExplorerPage.tsx:144` | Written only when `params.get('view') === 'ai'` (`DataExplorerLayout.tsx:304`) |
| `project` | `src/components/data-explorer/DataExplorerLayout.tsx:176` | set at `:354`; deleted at `:338`, `:353`, and `src/pages/DataExplorerPage.tsx:145` | Written by the "new project chat" path only (`DataExplorerLayout.tsx:344-356`) |
| `teamInvite` | `src/pages/DataExplorerPage.tsx:231` | never deleted on the success path; the whole query string is dropped on accept/decline/fetch-failure at `:252`, `:285`, `:305` | Token also copied to `sessionStorage` at `:235` |
| `plan` | `src/pages/DataExplorerPage.tsx:266` (`params.has`) | whole query string dropped at `:269` | Any value triggers the deep link |
| `code`, `state`, `error`, `error_description`, `provider` | `src/components/auth/AuthProvider.tsx:150-153,165` | `replaceState({}, '', window.location.pathname)` at `:156` and `:164` | OAuth callback only |

Notes on the query string:

- The `teamInvite` parameter is **not** removed after a successful info fetch, so a page refresh
  while the review modal is open re-runs the detection effect (`src/pages/DataExplorerPage.tsx:240-255`).
- Every URL rewrite in the shell uses `window.history.replaceState`, never the router
  (`src/pages/DataExplorerPage.tsx:138,141,147,252,269,285,305`,
  `src/components/data-explorer/DataExplorerLayout.tsx:310,340,355`).
- There is no `popstate` / history listener anywhere in `src` (grep for `popstate` returns no
  matches), so browser back/forward changes the URL without changing `mode`.

---

## 2. The three view modes

### Identifiers and labels

| Mode id | Long label (`VIEW_MODE_LABEL`) | Short label (`SidebarFooter`) | Lines |
| --- | --- | --- | --- |
| `explorer` | `Data Explorer` | `Explorer` | `src/lib/view-mode.ts:8` / `src/components/layout/SidebarFooter.tsx:40` |
| `ai` | `Resona AI` | `Resona AI` | `src/lib/view-mode.ts:9` / `src/components/layout/SidebarFooter.tsx:41` |
| `dashboard` | `Dashboard` | `Dashboard` | `src/lib/view-mode.ts:10` / `src/components/layout/SidebarFooter.tsx:42` |

- Union: `export type ViewMode = 'explorer' | 'ai' | 'dashboard';` (`src/lib/view-mode.ts:1`)
- Type guard: `isViewMode` returns true only for those three literals
  (`src/lib/view-mode.ts:13-15`).
- Appearance settings presents the same three modes as selectable launch defaults, with the
  labels `Data Explorer`, `Resona AI`, `Dashboard`
  (`src/components/settings/AppearanceSettings.tsx:113,144,175,193`).

### Where each mode renders

| Region | `explorer` | `ai` | `dashboard` |
| --- | --- | --- | --- |
| Sidebar body | `SchemaSelector` + `TableSidebar` (`DataExplorerLayout.tsx:550-576`) | `AIChatSidebar` (`DataExplorerLayout.tsx:516-535`) | `DashboardSidebar` (`DataExplorerLayout.tsx:537-549`) |
| Sidebar header title | `Data Explorer` + `resona.png` (`DataExplorerLayout.tsx:491-494`) | `Data Explorer` + `resona.png` (same branch) | `Dashboard` + `BarChart3` (`DataExplorerLayout.tsx:488-494`) |
| Main content | `TableGrid` when `selectedTable && connectionId` (`DataExplorerLayout.tsx:670-680`), else `EmptyState` (`:682-688`) | `AIChatLibrary` / `ArtifactHistory` / `AIChatProjects` / `ProjectDetailView` / `AIChatMain` selected by `aiActiveView` (`DataExplorerLayout.tsx:617-669`) | `DashboardView` (`DataExplorerLayout.tsx:691-711`) |
| Header breadcrumb | shown (`DataExplorerPage.tsx:399`) | shown (`:399`) | hidden (`:399`) |
| Header Export button | shown (`DataExplorerPage.tsx:435`) | shown (`:435`) | hidden (`:435`, and `DataExplorerLayout.tsx:595-596`) |
| Header "Resona AI" panel button | hidden (`DataExplorerPage.tsx:421`) | hidden (`:421`) | shown when panel closed (`:421-432`) |
| `ResonaAISidePanel` | not rendered (`DataExplorerLayout.tsx:716`) | not rendered (`:716`) | rendered when `isAiPanelOpen` (`:716-728`) |

Two layout quirks that are deliberate in the code:

- The explorer grid / empty state stay **mounted but `hidden`** when the dashboard is active
  (`className={cn(..., mode === 'dashboard' && "hidden")}`, `DataExplorerLayout.tsx:671,682`).
- `DashboardView` stays mounted after the first visit via `hasMountedDashboardRef`
  (`DataExplorerLayout.tsx:213-216` sets the ref; `:691` gates the render; `:692` applies the
  inverse `hidden`), explicitly to avoid destroying the iframe, Chart.js instances and scroll
  state.

### Initial-mode precedence chain (mount only)

`mode` is initialised once in a `useState` lazy initialiser
(`src/pages/DataExplorerPage.tsx:73-89`). Quoted verbatim:

```
73:  const [mode, setMode] = useState<ViewMode>(() => {
74:    if (typeof window === 'undefined') return 'explorer';
75:
76:    const urlView = new URLSearchParams(window.location.search).get('view');
77:    if (isViewMode(urlView)) return urlView;
78:
79:    const defaultMode = localStorage.getItem(DEFAULT_VIEW_MODE_KEY);
80:    if (isViewMode(defaultMode)) return defaultMode;
81:
82:    const savedSession = localStorage.getItem(VIEW_MODE_SESSION_KEY);
83:    if (isViewMode(savedSession)) return savedSession;
84:
85:    // Backward-compat: old boolean session key
86:    if (localStorage.getItem('sw-data-explorer:is-ai-mode') === 'true') return 'ai';
87:
88:    return 'explorer';
89:  });
```

| Rank | Source | Key / literal | Line |
| --- | --- | --- | --- |
| 0 | SSR guard (unreachable in this SPA — `createRoot` only, `src/main.tsx:9`) | — | `:74` |
| 1 | `?view=` URL param, validated by `isViewMode` | `view` | `:76-77` |
| 2 | Local "default mode" preference | `sw-data-explorer:default-view-mode` | `:79-80` |
| 3 | Local last-used mode | `sw-data-explorer:view-mode` | `:82-83` |
| 4 | Legacy boolean key | `sw-data-explorer:is-ai-mode === 'true'` → `ai` | `:86` |
| 5 | Hardcoded fallback | `explorer` | `:88` |

Post-mount correction: if auth has resolved and there is no user, any mode other than `explorer`
is forced back to `explorer` (`src/pages/DataExplorerPage.tsx:201-205`).

Note: rank 3 is named "session" in the constant (`VIEW_MODE_SESSION_KEY`) but is stored in
**localStorage**, not `sessionStorage` (`src/pages/DataExplorerPage.tsx:82,132`).

---

## 3. Mode persistence & sync

### Storage-key inventory (shell-owned)

| Key (literal) | Store | Written | Read | Removed |
| --- | --- | --- | --- | --- |
| `sw-data-explorer:view-mode` | localStorage | `DataExplorerPage.tsx:132` (on every `mode` change, deps `[mode]`) | `DataExplorerPage.tsx:82` | never explicitly removed |
| `sw-data-explorer:default-view-mode` | localStorage | `AppearanceSettings.tsx:40` | `DataExplorerPage.tsx:79`, `AppearanceSettings.tsx:34` | never explicitly removed |
| `sw-data-explorer:is-ai-mode` | localStorage | **no writer found in `src`** | `DataExplorerPage.tsx:86` | — |
| `sw-data-explorer:dashboard-ai-panel-open` | localStorage | `DataExplorerPage.tsx:155` (toggle), `:164` (close), `:171` (open) | `DataExplorerPage.tsx:68`, `:178` | overwritten with `'false'` at `:164` |
| `sw-data-explorer:connection-id` | localStorage | `DataExplorerPage.tsx:125` | `DataExplorerPage.tsx:59` | `:127` when the id is null |
| `sw-data-explorer:active-chat-id` | localStorage | `DataExplorerLayout.tsx:298` (mode `ai` only) | `:172` | `:300`, `:331` |
| `sw-data-explorer:ai-active-view` | localStorage | `DataExplorerLayout.tsx:316` (mode `ai` only) | `:161` | never removed |
| `sw-data-explorer:active-project-id` | localStorage | `DataExplorerLayout.tsx:322`, `:348` | `:178` | `:324`, `:332` |
| `sw.pendingInvite` | **sessionStorage** | `inviteToken.ts:14` (`JSON.stringify({t,k})`) | `inviteToken.ts:23` | `inviteToken.ts:37` |
| `sw-explorer-last-table` | localStorage, 30-day TTL | `explorer-preferences.ts:73` | `:78` | by `createStore` on corrupt/expired (`shared/storage/store.ts:114-120`) |
| `sw-explorer-page-size` | localStorage, no TTL | `explorer-preferences.ts:119` | `:111` | as above |
| `sw-explorer-query-cache` (IndexedDB DB) / store `queries` | IndexedDB | `persist.ts:71-73` | `:67-69`, `:77-82` | `persist.ts:74-76`, `deleteDB` at `:139` |
| `theme` | localStorage (next-themes `storageKey` default) | `setTheme` via `AppearanceSettings.tsx:71` | next-themes | preserved across logout by allowlist (`clearAllClientData.ts:12`) |

Literal constant definitions: `src/lib/view-mode.ts:3-5`;
`src/pages/DataExplorerPage.tsx:53-54`; `src/components/data-explorer/DataExplorerLayout.tsx:131-133`;
`src/components/auth/inviteToken.ts:5`; `src/components/data-explorer/storage/explorer-preferences.ts:19-20`;
`src/lib/persist.ts:13-16`.

### Custom events

| Event | Dispatched | Listened | Payload |
| --- | --- | --- | --- |
| `sw-default-mode-changed` | `src/components/settings/AppearanceSettings.tsx:41` | `src/pages/DataExplorerPage.tsx:214` | `CustomEvent<ViewMode>` in `detail`, re-validated by `isViewMode` (`:210`) |

Constant: `VIEW_MODE_CHANGED_EVENT = 'sw-default-mode-changed'` (`src/lib/view-mode.ts:5`).
`AppearanceSettings` is the only dispatcher in `src`.

Other shell-level listeners:

| Event | Registered | Handler |
| --- | --- | --- |
| `keydown` (window) | `src/pages/DataExplorerPage.tsx:197` | Ctrl/Cmd+J, dashboard only (`:188-199`) |
| `online` (window) | `src/components/data-explorer/DataExplorerLayout.tsx:392` | refetch tables + schemas when a connection is set (`:385-394`) |
| `storage` (window) | `node_modules/next-themes` (key `theme`) | theme sync across tabs |

Cross-tab auth events (`logout`, `session_changed`) are handled in
`src/components/auth/AuthProvider.tsx:322-349` (auth domain, not this section).

### Mode-change propagation

1. `SidebarFooter` calls `onModeChange(m)` (`src/components/layout/SidebarFooter.tsx:51`), which is
   `setMode` passed straight down from the page
   (`src/pages/DataExplorerPage.tsx:376` → `src/components/data-explorer/DataExplorerLayout.tsx:585`).
2. Other entry points that call `setMode`: sidebar header logo (modes `ai`/`dashboard` →
   `explorer`, `DataExplorerLayout.tsx:477-485`), table mention click (`:416`),
   `onOpenAIForTable` (`DataExplorerPage.tsx:454-457`), voice orb expand (`:513`),
   unauthenticated reset (`:202-204`), and the custom event (`:208-213`).
3. Persistence + URL rewrite then run in one effect keyed on `[mode]`
   (`src/pages/DataExplorerPage.tsx:131-149`).

### URL rewrite behaviour on mode switch

All in `src/pages/DataExplorerPage.tsx:131-149`:

| New mode | Action | Lines |
| --- | --- | --- |
| `ai` | `params.set('view','ai')`, then `replaceState` to `${pathname}?${params}` — but only when `params.get('view') !== 'ai'` | `:136-138` |
| `dashboard` | `params.set('view','dashboard')`, same rewrite, guarded on `currentView !== 'dashboard'` | `:139-141` |
| `explorer` (only when `currentView` is `ai` or `dashboard`) | `params.delete('view')`, `params.delete('chat')`, `params.delete('project')`, then `replaceState` to `${pathname}?${query}` or bare `${pathname}` when the query is empty | `:142-147` |

Consequences that follow from the code:

- Switching back to `explorer` strips `chat` and `project` (`src/pages/DataExplorerPage.tsx:144-145`)
  but leaves `teamInvite`/`plan` untouched — those are stripped only by their own effects
  (`:252`, `:269`, `:285`, `:305`).
- A mode restored from storage still rewrites the URL, because the effect runs on mount as well:
  e.g. stored mode `ai` with no `?view` sets `?view=ai` (`:136-138`).
- The `chat` param is (re)written by the layout only when the URL already says `view=ai`
  (`src/components/data-explorer/DataExplorerLayout.tsx:304-311`).

### AI panel-open persistence

- `isAiPanelOpen` initialises from `localStorage.getItem('sw-data-explorer:dashboard-ai-panel-open') === 'true'`
  (`src/pages/DataExplorerPage.tsx:66-69`).
- On every `mode` change: in `dashboard` it re-applies the stored `'true'`
  (`:175-186`), in any other mode it forces the panel closed (`:184`).
- Toggle/close/open all persist inside `try {} catch {}` (`:151-173`), so a storage failure leaves
  state correct but the key stale.

---

## 4. Keyboard shortcuts at shell level

Exactly one handler exists in the shell files:

| Combo | Condition | Action | Lines |
| --- | --- | --- | --- |
| `Ctrl`/`Cmd` + `J` (`e.key.toLowerCase() === 'j'`) | `mode === 'dashboard'` only | `e.preventDefault()` then toggle the Dashboard-AI side panel | `src/pages/DataExplorerPage.tsx:188-199` |

- The listener is re-registered on `[mode, handleToggleAiPanel]` and removed on cleanup
  (`src/pages/DataExplorerPage.tsx:197-198`).
- Outside `dashboard` the key is not intercepted at all — the branch is inside
  `if (mode === 'dashboard')` (`:191-195`).
- The discoverability string is the button `title`, `"Open Resona AI panel (Ctrl+J)"`
  (`src/pages/DataExplorerPage.tsx:427`); the button renders only in `dashboard` mode with the
  panel closed (`:421-432`).
- A `shortcuts` section exists in the settings-section union
  (`src/pages/DataExplorerPage.tsx:62`) but the shortcut list itself lives in `SettingsModal`,
  which is outside this section.
- Other `keydown` listeners in the codebase belong to other surfaces: grid cell preview / inspector
  (`src/components/data-explorer/grid/CellHoverPreview.tsx:32`,
  `src/components/data-explorer/grid/CellInspectorModal.tsx:71`), AI input/chat
  (`src/components/ai/input/MentionPicker.tsx:50`, `src/components/ai/chat/TurnNavigator.tsx:91`,
  `src/components/ai/chat/ImageLightbox.tsx:24`), and the standalone dashboard-engine bundle
  (`src/dashboard-engine/init.ts:456`, `src/dashboard-engine/bridge.ts:380`).

---

## 5. Layout composition

### Panel arrangement

`DataExplorerLayout` root: `flex w-full h-full bg-background overflow-hidden`
(`src/components/data-explorer/DataExplorerLayout.tsx:462`).

| Slot | Element | Sizing | Lines |
| --- | --- | --- | --- |
| 1 | `<aside>` sidebar | `w-64` expanded, `w-12` collapsed, `transition-all duration-300` | `:464-468` |
| 2 | `<main>` workspace | `flex-1 flex flex-col min-w-0 overflow-hidden` | `:592` |
| 3 | `ResonaAISidePanel` | rendered only in `dashboard` **and** panel open | `:716-728` |

Sidebar internals:

- Header `h-10 border-b`; the logo/title button returns to `explorer` when the mode is `ai` or
  `dashboard`, otherwise selects the first table when none is selected
  (`src/components/data-explorer/DataExplorerLayout.tsx:471-510`).
- Body: mode-specific, unmounted entirely when collapsed (`:513-578`).
- `SchemaSelector` renders only when `connectionId` is truthy (`:553-563`).
- Footer: `SidebarFooter`, `shrink-0 mt-auto` (`:581-588`).
- Collapse state is local, initial `false` (`:157`); toggled by the ghost icon button (`:498-509`).

Main content:

- The header is produced by an IIFE that builds `exportButtonElement` and then either invokes the
  `headerContent` render-prop or renders it as a node (`:593-615`). `DataExplorerPage` always
  passes a **function** (`:388`), so the function branch (`:605-607`) is the live path.
- `AIChatMain` is keyed `chat-session-${newChatKey}`; `newChatKey` is incremented by the new-chat
  handlers to force a remount (`:180`, `:333`, `:349`, `:649`).

### Portal hosts

| Host id | Declared | Consumer | Conditional hiding |
| --- | --- | --- | --- |
| `table-actions-portal` | `src/pages/DataExplorerPage.tsx:409-416`, inside the header | `TableGrid` resolves it once on mount (`src/components/data-explorer/TableGrid.tsx:132-135`) and portals into it (`TableGrid.tsx:641`) | `className` is `hidden` when `mode === 'dashboard'`, otherwise `flex items-center gap-1 ml-2` (`DataExplorerPage.tsx:411-415`). The inline comment states the reason: the host must stay mounted because `createPortal` needs a live target, but the portaled grid toolbar must not appear on the dashboard (`DataExplorerPage.tsx:407-408`) |
| `table-export-portal` | `src/pages/DataExplorerPage.tsx:436`, `className="hidden"` unconditionally | Only `DataExplorerLayout.tsx:358-363` (lookup, runs on every render) and `:612` (`createPortal(exportButtonElement, exportPortalTarget)`) | Always `hidden` — the export button is instead inlined into the header render-prop (`DataExplorerPage.tsx:435`) |

Because the only call site passes `headerContent` as a function, `DataExplorerLayout.tsx:609-614`
(the `ReactNode` branch) never executes, and with it `table-export-portal` has no consumer. See
Dead / Unused Code.

### How mode influences header controls

| Control | Render condition | Line |
| --- | --- | --- |
| `ConnectionSelector` | always | `src/pages/DataExplorerPage.tsx:392-397` |
| `schema › table` breadcrumb | `selectedTable.table && mode !== 'dashboard'` | `:399-406` |
| `table-actions-portal` host | always mounted; `hidden` on dashboard | `:409-416` |
| "Resona AI" open-panel button | `mode === 'dashboard' && !isAiPanelOpen` | `:421-432` |
| Export button | `mode !== 'dashboard'` (page side) and `mode === 'dashboard' ? null : <ExportButton/>` (layout side) | `:435` / `src/components/data-explorer/DataExplorerLayout.tsx:595-603` |
| Sign In button | `!user && !authLoading` | `:437-450` |

### Mode switching UI (SidebarFooter)

- `ALL_MODES = ['explorer','ai','dashboard']`, filtered to exclude the current mode, so **two**
  buttons render at any time (`src/components/layout/SidebarFooter.tsx:36-37`), laid out in a
  `grid-cols-2` when expanded (`:112-114`) or stacked when collapsed (`:105-109`).
- `aria-label` is `Switch to ${VIEW_MODE_LABEL[m]}` and the tooltip shows the long label
  (`:56`, `:62-64`).
- Icons per mode: `ai` → `/resona.png`, `dashboard` → `BarChart3`, `explorer` → `Database`
  (`:22-30`).
- The settings button renders `PremiumAvatar` when an avatar URL exists, otherwise a `Settings`
  glyph; label `Settings` either way (`:69-98`).

---

## 6. Theming

### Theme names

| Id | Label in Appearance settings | Palette in CSS | Sources |
| --- | --- | --- | --- |
| `light` | `Light` | `:root` block | `src/App.tsx:60` / `AppearanceSettings.tsx:23` / `src/index.css:15-54` |
| `dark` | `Dark` | `.dark` block | `src/App.tsx:60` / `AppearanceSettings.tsx:24` / `src/index.css:56-84` |
| `dark-black` | `Dark Black` | `.dark-black` block (comment `/* OLED / Pure Black */`) | `src/App.tsx:60` / `AppearanceSettings.tsx:25` / `src/index.css:87-115` |
| `blue-gray` | `Blue Gray` | `.blue-gray` block (comment `/* Midnight / Blue Gray */`) | `src/App.tsx:60` / `AppearanceSettings.tsx:26` / `src/index.css:118-146` |
| `system` | `System` | none of its own | `src/App.tsx:60` / `AppearanceSettings.tsx:27` |

All colour tokens are raw HSL triples (e.g. `--background: 0 0% 100%;`,
`src/index.css:16`) consumed as `hsl(var(--x))` (`src/index.css:183,187,201`).
`--radius: 0.625rem` is defined once on `:root` (`src/index.css:44`).

### How the class is applied to `<html>`

- Provider config: `attribute="class"`, `defaultTheme="light"`, `enableSystem={false}`,
  `themes={["light","dark","dark-black","blue-gray","system"]}` (`src/App.tsx:56-61`).
- next-themes 0.3.0 applies the class itself: with `attribute === "class"` it does
  `classList.remove(...themes)` then `classList.add(resolved)`, and resolves to the OS theme only
  when `theme === "system" && enableSystem` (`node_modules/next-themes/dist/index.js`, the `applyTheme`
  callback). Because `enableSystem` is `false`, selecting `system` puts the literal class `system`
  on `<html>`; no palette block matches it, so `:root` (light) applies.
- Same library source: `resolvedTheme = theme === "system" ? systemTheme : theme`, and the
  `systemTheme` state is kept current by a `matchMedia("(prefers-color-scheme: dark)")` listener
  regardless of `enableSystem` (`node_modules/next-themes/dist/index.js`).
- Library default `storageKey` is `"theme"` (`node_modules/next-themes/dist/index.js`), which is the
  key preserved across logout (`src/components/auth/clearAllClientData.ts:12`).

### Dark-mode sync component

```
14: function DarkClassSync() {
15:   const { resolvedTheme } = useTheme();
16:
17:   useEffect(() => {
18:     const root = document.documentElement;
19:     const isDark = resolvedTheme === "dark" || resolvedTheme === "dark-black" || resolvedTheme === "blue-gray";
20:     root.classList.toggle("dark", isDark);
21:   }, [resolvedTheme]);
22:
23:   return null;
24: }
```
(`src/App.tsx:14-24`), rendered as the first child inside `ThemeProvider` (`src/App.tsx:62`).

Observed ordering hazard (not runtime-verified): `DarkClassSync` is a child of the provider that
owns the `applyTheme` effect, so its effect runs first in the commit, and `applyTheme` then
removes every id in `themes` — which includes `dark` — before adding the resolved id
(`node_modules/next-themes/dist/index.js`). Each of `.dark`, `.dark-black` and `.blue-gray`
redefines the full token set (`src/index.css:56-146`), so the visible palette is the same either
way; see Open Questions.

CSS specificity note: all three dark blocks are single-class selectors, so when several are present
the last one in source order wins — `.dark` (`src/index.css:56`) → `.dark-black` (`:87`) →
`.blue-gray` (`:118`).

### Theme consumption outside the palette

- Dashboard pane: `currentTheme = appTheme === 'system' ? resolvedTheme : appTheme`, then
  `dashTheme` coerces anything that is not `light`/`dark-black`/`blue-gray` to `'dark'`
  (`src/components/data-explorer/DataExplorerLayout.tsx:187-193`) and passes it to `useDashboard`
  (`:194-197`).
- `@keyframes soundbar` (`0%,100% { transform: scaleY(0.4) }`, `50% { transform: scaleY(1) }`) is the
  only animation defined in `src/index.css` (`src/index.css:5-8`).

---

## 7. Startup sequence

Order of operations on a cold load:

1. **Document head, parser-blocking work** (`index.html`): Razorpay checkout script
   (`index.html:6`), Inter + JetBrains Mono stylesheet (`index.html:30-33`), three JSON-LD blocks
   (`:57-142`), an inline `.sr-only` rule (`:143-155`). Then `<div id="root">` (`:164`), the
   sr-only SEO `<main>` (`:167-390`), and the module entry `src/main.tsx` (`:392`).
2. **Root render** (`src/main.tsx:9-17`): `App` is wrapped in `GoogleOAuthProvider` only when
   `import.meta.env.VITE_GOOGLE_CLIENT_ID` is truthy (`src/main.tsx:7,10-16`); otherwise `App`
   renders bare. Global CSS side-effect imports: `./index.css` and `katex/dist/katex.min.css`
   (`src/main.tsx:4-5`).
3. **Cache-hydration gate first** — `CacheHydrationGate` is the outermost provider in `App`
   (`src/App.tsx:54`). It calls `restoreExplorerCache(queryClient)` once and renders a spinner
   until that promise settles (`:26-46`).
4. **CSRF init** — `App`'s own `useEffect` calls `initCsrfToken()` (`src/App.tsx:49-51`).
   Implementation: early-returns if a `_csrf` cookie or in-memory token exists, otherwise
   `fetch(`${API_BASE_URL}/api/csrf-token`, { credentials: 'include' })` and caches
   `data.csrfToken` in memory; every failure is swallowed as non-fatal
   (`src/lib/api/client.ts:43-56`). The token is read lazily per mutating request
   (`src/lib/api/client.ts:81,89`).
5. **Provider stack, outermost to innermost** (`src/App.tsx:54-77`):
   `CacheHydrationGate` → `QueryClientProvider` (singleton from
   `src/lib/queryClient.ts:9`) → `ThemeProvider` → `DarkClassSync` → `TooltipProvider
   delayDuration={150} skipDelayDuration={100}` (`:63`) → `AuthProvider` → `BrowserRouter` →
   `Routes`. `<Toaster />` is a sibling of `BrowserRouter`, inside `AuthProvider` (`:72`).
6. **Auth restore** runs inside `AuthProvider` once per mount
   (`src/components/auth/AuthProvider.tsx:251-319`): a session cookie yields an immediate minimal
   user to avoid a logged-out flash (`:258-268`), then backend validation (`:272`), refresh if
   needed (`:288-290`), and `setLoading(false)` (`:315`).

### What blocks first paint, and why

| Blocker | Detail |
| --- | --- |
| Cache-hydration spinner | `CacheHydrationGate` returns a full-screen spinner until `restoreExplorerCache` resolves (`src/App.tsx:37-43`); children — including `QueryClientProvider`, `AuthProvider` and the router — do not mount before that |
| IndexedDB work behind the spinner | `openDB('sw-explorer-query-cache', 1, …)` (`src/lib/persist.ts:53-59`), then `restoreQueries(queryClient, { queryKey: ['data-explorer'] })` followed by `persisterGc()` (`src/lib/persist.ts:125-128`) |
| Render-blocking head resources | Razorpay script (`index.html:6`) and the Google Fonts stylesheet (`index.html:30-33`) |

The CSRF fetch does **not** block anything: it is fire-and-forget in `App`'s effect and its
promise is not awaited (`src/App.tsx:49-51`; `src/lib/api/client.ts:43`).

Two observations, both derived from the code and neither runtime-verified:

- `App.tsx:31-33` attaches only `.finally()` to `restoreExplorerCache(...)`. A rejecting restore
  still flips `cacheReady`, but the rejection itself is not caught here, i.e. it surfaces as an
  unhandled rejection.
- The restore runs against the module-level `queryClient` singleton before
  `QueryClientProvider` mounts (`src/App.tsx:12,31,55`), which is intentional (restore is scoped to
  the explorer root, `src/lib/persist.ts:126`) but means persisted data is in the cache before the
  provider exists.

### Query client defaults

`src/lib/queryClient.ts:9-23`:

| Option | Value | Line |
| --- | --- | --- |
| `queries.staleTime` | `60 * 1000` (60s) | `:12` |
| `queries.gcTime` | `5 * 60 * 1000` (5 min) | `:13` |
| `queries.retry` | `2` | `:14` |
| `queries.retryDelay` | `Math.min(1000 * 2 ** attempt, 10_000)` | `:15` |
| `queries.refetchOnWindowFocus` | `false` | `:16` |
| `queries.persister` | `explorerQueryPersister` | `:17` |
| `mutations.retry` | `1` | `:20` |

The connection list opts out of the global focus policy and polls: `staleTime: 2_000`,
`refetchInterval` `8_000` when at least one connection has `is_online`, else `4_000`,
`refetchOnWindowFocus: true`, `refetchOnReconnect: true`
(`src/components/connector/api/useConnections.ts:30-39`).

Query-key factory (`src/lib/queryClient.ts:43-81`): `user.*`, `payments.*` (incl.
`history(userId)`), `legacySubscription = ['subscription']`, `aiUsage = ['ai-usage']`. The file's
own comments record that `user.session`, the `files` factory and a second `connections` factory were
removed as dead (`src/lib/queryClient.ts:30-38`), and that `legacySubscription` is a duplicate of
`payments.subscription` awaiting reconciliation (`:56-71`).

---

## 8. Code-splitting and lazy loading

### Eager (initial chunk)

`DataExplorerPage` and `PublicReportViewer` (`src/App.tsx:8-9`); the whole explorer sidebar/grid
stack `TableSidebar`, `TableGrid`, `ExportButton`, `EmptyState`, `SchemaSelector`
(`src/components/data-explorer/DataExplorerLayout.tsx:13-21`); `ResonaAISidePanel`
(`DataExplorerLayout.tsx:36`); `ConnectionSelector` (`src/pages/DataExplorerPage.tsx:8`);
`NotificationBanner` (`:28`, `:372`); `FloatingVoiceOrb` (`:30`, `:511`);
`VoiceSessionProvider` (`:29`, `:369`); `katex/dist/katex.min.css` (`src/main.tsx:5`).

### Lazy imports — complete list

| Component | Declaration | Rendered when |
| --- | --- | --- |
| `SettingsModal` | `src/pages/DataExplorerPage.tsx:38` | `showSettings` (`:468-480`) |
| `ConnectorDialog` | `src/pages/DataExplorerPage.tsx:39` | `showConnectorDialog` (`:498-507`) |
| `InvitationReviewModal` | `src/pages/DataExplorerPage.tsx:40` | `pendingInviteInfo` truthy (`:482-496`) |
| `AIChatSidebar` | `DataExplorerLayout.tsx:27` | mode `ai`, sidebar not collapsed (`:516-535`) |
| `AIChatMain` | `DataExplorerLayout.tsx:28` | mode `ai`, `aiActiveView` is `chat` (`:648-667`) |
| `AIChatLibrary` | `DataExplorerLayout.tsx:29` | mode `ai`, `aiActiveView === 'library'` (`:619-620`) |
| `AIChatProjects` | `DataExplorerLayout.tsx:30` | mode `ai`, `aiActiveView === 'projects'` (`:629-636`) |
| `ProjectDetailView` | `DataExplorerLayout.tsx:31` | mode `ai`, `project_detail` with an active project (`:637-646`) |
| `ArtifactHistory` | `DataExplorerLayout.tsx:32` | mode `ai`, `aiActiveView === 'artifacts'` (`:621-628`) |
| `DashboardView` | `DataExplorerLayout.tsx:34` | mode `dashboard` or dashboard visited at least once (`:691-711`) |
| `DashboardSidebar` | `DataExplorerLayout.tsx:35` | mode `dashboard`, sidebar not collapsed (`:537-549`) |

Comment at `DataExplorerLayout.tsx:24-26` states the intent: AI components are only rendered when
AI mode is active so recharts, mermaid and jspdf stay out of the initial bundle.

Suspense fallbacks: `ModalLoadingFallback` (fixed overlay + "Opening…", `duration-150`) for
`SettingsModal` (`src/pages/DataExplorerPage.tsx:42-51,469`); `fallback={null}` for
`InvitationReviewModal` (`:483`) and `ConnectorDialog` (`:499`);
`AISuspenseFallback` (`flex-1 animate-pulse bg-muted/30`) for every AI/dashboard surface
(`DataExplorerLayout.tsx:109-111`).

### Idle preloading

```
340:  useEffect(() => {
341:    const preload = () => {
342:      preloadSettingsModal();
343:      preloadConnectorDialog();
344:    };
345:    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
346:      const handle = (window as any).requestIdleCallback(preload, { timeout: 1500 });
347:      return () => (window as any).cancelIdleCallback(handle);
348:    } else {
349:      const timer = setTimeout(preload, 600);
350:      return () => clearTimeout(timer);
351:    }
352:  }, []);
```
(`src/pages/DataExplorerPage.tsx:340-352`). The two preload thunks are declared at
`src/pages/DataExplorerPage.tsx:35-36` and reused by the `lazy()` wrappers at `:38-39`, so the
idle fetch warms the same module promise the modal uses. `InvitationReviewModal` is never
preloaded.

### Build-time chunking (`vite.config.ts`)

- `manualChunks` groups (`vite.config.ts:84-94`): `vendor-charts` (`/recharts/`, `/d3-`,
  `/victory-`), `vendor-mermaid` (`/mermaid/`), `vendor-reports` (`/jspdf`), `vendor-katex`
  (`node_modules/katex/`), `vendor-xlsx` (`node_modules/xlsx/`), `vendor-motion`
  (`node_modules/framer-motion/`), `vendor-react` (`react`, `react-dom`, `react-router-dom`),
  `vendor-radix` (`@radix-ui/`), `vendor-query` (`@tanstack/`).
- `build.chunkSizeWarningLimit: 650` (kB) (`vite.config.ts:81`).
- `esbuild.drop: ['console','debugger']` in production mode only (`vite.config.ts:12-14`) —
  note the React plugin is `@vitejs/plugin-react-swc` (`vite.config.ts:2`), so TSX is
  transformed by SWC; see Open Questions.
- PWA: `registerType: 'autoUpdate'`, dev disabled, `maximumFileSizeToCacheInBytes: 3 * 1024 * 1024`
  (`vite.config.ts:18-23`); manifest name `Data Explorer | Schema Weaver`, `theme_color
  '#0f172a'`, `resona.png` at 192x192 and 512x512 maskable (`:25-43`).
- Dev server: `host: true`, `port: 8000`; proxy `/api` → `VITE_PROXY_TARGET || http://localhost:3000`
  with `ws: true`; proxy `/ai-api` → `VITE_AI_PROXY_TARGET || http://localhost:8001` with the
  `/ai-api` prefix stripped (`vite.config.ts:64-79`).
- `optimizeDeps.include`: react, react-dom, react-router-dom, @tanstack/react-query, lucide-react,
  clsx, tailwind-merge, sonner, next-themes (`vite.config.ts:46-58`).
- Alias `@` → `./src` (`vite.config.ts:59-63`).

---

## 9. Connection selection lifecycle

1. **Seed**: `connectionId` initialises from
   `localStorage.getItem('sw-data-explorer:connection-id')` or `null`
   (`src/pages/DataExplorerPage.tsx:53,58-60`).
2. **Live list**: `useConnections()` (`src/pages/DataExplorerPage.tsx:71`) is keyed
   `connectionKeys.list(user?.id)` and only enabled when a user id exists
   (`src/components/connector/api/useConnections.ts:26-29`); the query is polled every 4–8s
   (`:31-37`).
3. **Validation and auto-correction** (`src/pages/DataExplorerPage.tsx:101-121`):
   - No connections at all → `setConnectionId(null)` if one was set, then return (`:104-109`).
   - Otherwise `isCurrentValid = connections.some(c => c.id === connectionId)` (`:112`); if false,
     pick `connections.find(c => c.is_online)` and fall back to `connections[0]` (`:114`), or
     `null` if the list somehow yielded nothing (`:117-118`).
   - Effect deps are `[connectionsLoaded, connections, connectionId]` (`:121`), so it re-runs after
     every poll, which makes the correction self-healing while the list is being refreshed.
4. **Persist**: a `connectionId` truthy value is written to the same key; a null value removes it
   (`src/pages/DataExplorerPage.tsx:123-129`).
5. **Reset on change**: `handleConnectionChange` clears the page-level selected table back to
   `{ table: null, schema: 'public' }` (`src/pages/DataExplorerPage.tsx:317-320`), and the layout
   independently resets `selectedTable` and `schemaName` on `connectionId` change with the comment
   that a stale table from another connection must never render against the new one
   (`src/components/data-explorer/DataExplorerLayout.tsx:423-429`).
6. **Derived connection metadata** in the layout: `databaseName` from the selected connection's
   `name`, and `connectionAccess = selectedConnection?.access_type ?? 'owner'`, passed to
   `DashboardSidebar` as `accessType` (`src/components/data-explorer/DataExplorerLayout.tsx:151-154`,
   `:547`; type at `src/components/connector/api/connectionTypes.ts:36`).
7. **First-run nudge**: if the user is signed in, no connection is selected, the list has loaded
   and is non-empty, and the toast has not yet fired in this session, an info toast
   "Select a connection from the top right to get started" runs with `duration: 5000`
   (`src/pages/DataExplorerPage.tsx:218-226`).

Related preference persistence used by the layout (not connection-specific, but part of the
same lifecycle): `sw-explorer-last-table` is written on every table selection
(`src/components/data-explorer/DataExplorerLayout.tsx:405,457`) and on restore
(`src/components/data-explorer/storage/explorer-preferences.ts:67-79`); row prefetch uses
`getExplorerPageSize()` (`DataExplorerLayout.tsx:366-372`), whose whitelist is
`[100, 250, 500, 1000, 2000]` with default `500`
(`src/components/data-explorer/storage/explorer-preferences.ts:81-82`).

---

## 10. Invitation and billing deep links

### Team-invite flow

| Step | Code | Lines |
| --- | --- | --- |
| 1. Detect | `params.get('teamInvite')` | `src/pages/DataExplorerPage.tsx:231` |
| 2. Persist before it can be lost | `storePendingInvite(urlToken, 'team')` → `sessionStorage['sw.pendingInvite'] = {"t":…,"k":…}` | `src/pages/DataExplorerPage.tsx:235`; `src/components/auth/inviteToken.ts:5,12-19` |
| 3. Restore after OAuth | `stored?.k === 'team' ? stored.t : null`, URL token wins | `src/pages/DataExplorerPage.tsx:237-238` |
| 4. Stale-storage cleanup | `clearPendingInvite()` when nothing is pending | `src/pages/DataExplorerPage.tsx:256-259` |
| 5. Fetch details | `getInvitationInfo(token,'team')` → `GET /api/teams/invitations/info/${token}` | `src/pages/DataExplorerPage.tsx:242-245`; `src/components/collaboration/api/collaboration.ts:240-245` |
| 6. Fetch failure | `logger.error`, toast "Invalid or expired invitation link" (only when `pendingInviteInfo` is still null), `clearPendingInvite()`, query string wiped | `src/pages/DataExplorerPage.tsx:246-253` |
| 7. Review modal | rendered when `pendingInviteInfo` is truthy; props `isAuthenticated={!!user}`, `currentUserEmail`, `onSignIn`, `isProcessing` | `src/pages/DataExplorerPage.tsx:482-496` |
| 8. Sign in to accept | `storePendingInvite(inviteToken,'team')` then `signInWithGoogle()` | `src/pages/DataExplorerPage.tsx:310-315` |
| 9. Accept | `acceptTeamInvitation(inviteToken)` → `POST /api/teams/invitations/accept`; on `success`: toast "Joined team successfully!", `refetchConnections()`, `clearPendingInvite()`, state cleared, query string wiped | `src/pages/DataExplorerPage.tsx:273-292`; `collaboration.ts:224-228` |
| 10. Decline | `declineTeamInvitation(teamId, inviteId)` → `POST /api/teams/${teamId}/invitations/${inviteId}/decline`, but only when `type === 'team' && teamId`; backend failure is logged as a warning only; storage cleared and query string wiped regardless | `src/pages/DataExplorerPage.tsx:294-306`; `collaboration.ts:230-235` |

Why step 2 is necessary: the OAuth callback handler runs
`window.history.replaceState({}, '', window.location.pathname)`, discarding the entire query
string (`src/components/auth/AuthProvider.tsx:162-164`), and both providers redirect to
`window.location.origin` (`src/components/auth/AuthProvider.tsx:416,430-433`). The page's own
comment states the same reason (`src/pages/DataExplorerPage.tsx:232-233,308-309`).

Access restrictions on the handlers: accept requires `inviteToken && pendingInviteInfo && user`
(`src/pages/DataExplorerPage.tsx:274`); decline requires `inviteToken && pendingInviteInfo`
(`:295`). The invite path offers Google sign-in only — `signInWithGithub` is wired to
`SettingsModal` (`:476`), not to `handleSignInForInvite` (`:310-315`).

### `?plan=` deep link

```
264:  useEffect(() => {
265:    const params = new URLSearchParams(window.location.search);
266:    if (params.has('plan')) {
267:      setSettingsSection('plans');
268:      setShowSettings(true);
269:      window.history.replaceState({}, document.title, window.location.pathname);
270:    }
271:  }, []);
```
(`src/pages/DataExplorerPage.tsx:264-271`). The comment above it states the intent: the marketing
site deep-links here so the user can purchase/upgrade in-app (`src/pages/DataExplorerPage.tsx:262-263`).

- Value-insensitive: `params.has('plan')` only (`:266`); the value is never read.
- Opens `SettingsModal` with `initialSection={settingsSection}` → `'plans'`
  (`src/pages/DataExplorerPage.tsx:267,468-479`); `'plans'` is one of the eight allowed section ids
  (`:62`).
- Runs once on mount (`[]`, `:271`) and strips the query string immediately (`:269`), so a reload
  does not reopen it.
- The same `'plans'` section is reachable from the header via the layout's `onOpenPlans`
  (`src/pages/DataExplorerPage.tsx:383-386`), which is also what `AIChatMain` receives as
  `onOpenPlans={onOpenPlans ?? onOpenSettings}`
  (`src/components/data-explorer/DataExplorerLayout.tsx:665`).

---

## 11. Explorer cache hydration (`src/lib/persist.ts`)

Constants:

| Name | Value | Line |
| --- | --- | --- |
| `EXPLORER_CACHE_DB` | `'sw-explorer-query-cache'` | `src/lib/persist.ts:13` |
| store name | `'queries'` | `:14` |
| `EXPLORER_CACHE_BUSTER` | `'v1'` | `:15` |
| `EXPLORER_CACHE_MAX_AGE_MS` | `24 * 60 * 60 * 1000` (24 h) | `:16` |
| persister `prefix` | `'sw-explorer-query'` | `:64` |
| `refetchOnRestore` | `true` | `:65` |
| `PERSISTED_ROOT` | `DATA_EXPLORER_QUERY_ROOT` = `'data-explorer'` | `:32`; `src/shared/lib/queryRoots.ts:26` |

Mechanics:

- IndexedDB opened with `openDB(name, 1, { upgrade })`, creating the `queries` object store if
  absent (`src/lib/persist.ts:53-59`).
- Two-layer filter. The library-level filter is the coarse `filters: { queryKey: [PERSISTED_ROOT] }`
  (`:87-89`); the fine-grained predicate is applied in the wrapper that the `QueryClient` actually
  holds, `explorerQueryPersister` (`:107-114`), which delegates only when
  `shouldPersistQuery` passes.
- `shouldPersistQuery` = `Array.isArray(queryKey) && queryKey[0] === PERSISTED_ROOT && queryKey[1] !== 'rows'`
  (`:47-51`) — i.e. everything under the explorer root **except** the `rows` sub-namespace, which is
  deliberately excluded because row payloads are unbounded (`:34-36`).
- The file documents a fixed regression here: `filters: { predicate }` was a silent no-op that
  matched every query, so every domain was being written to IndexedDB; the predicate is now applied
  at the wrapper because `QueryFilters` has no negation member (`:38-45`, `:94-106`).
- `restoreExplorerCache(queryClient)` = `restoreQueries(queryClient, { queryKey: [PERSISTED_ROOT] })`
  followed by `persisterGc()` (`:125-128`). Scoped restore is deliberate: older builds may have
  written other domains into the same DB, and a scoped restore cleans them up (`:116-124`).
- `purgeExplorerCache()` removes all persisted entries (`:130-132`); `purgeExplorerCacheDb()` closes
  and deletes the whole database, swallowing the failure when another tab holds it open (`:134-142`).
- `purgeExplorerCacheDb()` is called by `signOut()` (`src/components/auth/AuthProvider.tsx:203-208`)
  and on a cross-tab logout (`:328-330`), alongside `queryClient.clear()` (`:201`).

Wiring: `queryClient` sets `persister: explorerQueryPersister` on the global query defaults
(`src/lib/queryClient.ts:17`), and `App` invokes `restoreExplorerCache` inside the gate
(`src/App.tsx:12,31`). There is no `PersistQueryClientProvider` in `src` — restore is done
explicitly.

Guard rails: the architecture test asserts `dataExplorerKeys.all[0] === DATA_EXPLORER_QUERY_ROOT`
and that no module outside `shared/` hardcodes the literal `'data-explorer'`
(`src/__tests__/featureLayout.test.ts:151-186`).

### Query client key factory (for context)

`src/lib/queryClient.ts:43-81` exports `queryKeys.user`, `queryKeys.payments`,
`queryKeys.legacySubscription` and `queryKeys.aiUsage`. The `user` keys are **not** under the
`data-explorer` root, so they are not persisted by `shouldPersistQuery` (`src/lib/persist.ts:47-51`).

---

## Dead / Unused Code

Items below have no importer in `src`, or a code path that cannot execute with the current call
sites. Each was checked by grep across `src`.

| Item | Evidence |
| --- | --- |
| `table-export-portal` host element | Declared `src/pages/DataExplorerPage.tsx:436`; the only consumer is `DataExplorerLayout.tsx:358-363,612`, and that `createPortal` sits in the `headerContent`-as-`ReactNode` branch (`:609-614`) which is unreachable because the sole call site passes a function (`src/pages/DataExplorerPage.tsx:388`; `DataExplorerLayout` has exactly one importer, `src/pages/DataExplorerPage.tsx:7,374`) |
| `exportPortalTarget` state | Written by the same unconditional effect (`DataExplorerLayout.tsx:358-363`, note it has no dependency array) and read only by the unreachable portal at `:612` |
| Barrel exports other than `DataExplorerLayout` | `src/components/data-explorer/index.ts:6-16` re-exports `TableSidebar`, `TableGrid`, `EmptyState`, `ColumnStatsPanel`, `ExportButton`, `ConnectionSelector`, `SchemaSelector`, `ColumnHeader`, `GridRow`. The barrel has one importer, `src/pages/DataExplorerPage.tsx:7`, which takes only `DataExplorerLayout`; `ColumnStatsPanel`, `ColumnHeader` and `GridRow` are imported by direct path from `src/components/data-explorer/TableGrid.tsx:34-36` |
| `sw-data-explorer:is-ai-mode` | Read once as a legacy fallback (`src/pages/DataExplorerPage.tsx:86`); no writer exists anywhere in `src` |
| `shared/storage/registry.ts` readers | `registeredKeys` (`:27`) and `keysForOwner` (`:32`) are called only from `src/shared/storage/__tests__/store.test.ts:182-183`; `clearRegistered` (`:47`) has no caller in `src` at all. The registry is never consulted by the logout sweep, which still enumerates localStorage directly (`src/components/auth/clearAllClientData.ts:30-50`) |
| `src/components/settings/AppearanceSettings.tsx:20` (`export { DEFAULT_VIEW_MODE_KEY }`) | Re-export; no importer of `AppearanceSettings` targets that symbol (the settings modal imports the component) |
| `ModeIcon` `explorer` branch icon (`Database`) | Live, but only reachable when the explorer mode button renders, i.e. never while `mode === 'explorer'` because the current mode is filtered out (`src/components/layout/SidebarFooter.tsx:37,45-58`) |

Not dead, but worth recording:

- `src/components/data-explorer/DataExplorerLayout.tsx:51-107` `formatInsightWhyPrompt` is live
  (called by `handleInsightWhy`, `:235`), and its output is routed to the Dashboard-AI side panel
  through `pendingInquiry` (`:237-240`, `:725-726`).
- `queryKeys.legacySubscription` is live but documented in-code as a duplicate of
  `payments.subscription` awaiting reconciliation (`src/lib/queryClient.ts:56-71`).

---

## Open Questions

UNVERIFIED: Does `DarkClassSync`'s `dark` class actually survive on `<html>`? It runs as a child
effect before the provider's `applyTheme` effect, and `applyTheme` removes every id in `themes`
(which includes `dark`) before adding the resolved one — so it may be stripped in the same commit.
Only observable in a browser; the palettes are self-contained so the visual result is likely the
same either way.

UNVERIFIED: With `enableSystem={false}` (`src/App.tsx:59`) and `system` selectable in
Appearance settings (`src/components/settings/AppearanceSettings.tsx:27`), does selecting `System`
actually follow the OS preference? next-themes applies the literal class `system` (no CSS block →
light palette) and exposes `resolvedTheme` as the OS value, which `DarkClassSync` then maps to
`dark`. Requires a runtime check.

UNVERIFIED: Does `esbuild.drop: ['console','debugger']` (`vite.config.ts:12-14`) strip anything
from application source, given the React plugin is `@vitejs/plugin-react-swc`
(`vite.config.ts:2`) and therefore TSX is transformed by SWC rather than esbuild?

UNVERIFIED: Does `restoreExplorerCache` rejecting actually produce an unhandled rejection in
production, and is there any global handler that swallows it? `src/App.tsx:31-33` attaches only
`.finally()`.

UNVERIFIED: Is there any other consumer of the `data-explorer` query root that expects row data to
be restored? `shouldPersistQuery` excludes the `rows` segment (`src/lib/persist.ts:47-51`) and the
restore is scoped to the root (`:126`); whether any screen depends on persisted row data could not
be determined from the shell files.

UNVERIFIED: `PublicReportViewer` is statically imported (`src/App.tsx:9`), so its 248 lines ship in
the initial chunk. Whether the marketing/docs site depends on the sr-only SEO block being in the
same document (`index.html:167-390`) as opposed to server-rendered HTML, and whether `/share/r/*`
is excluded from any prerender, could not be determined from this repo.

UNVERIFIED: Which theme ids appear in `<html>` for `system` and `dark` on a real first paint
(next-themes also injects a pre-hydration inline script, `node_modules/next-themes/dist/index.js`),
and therefore whether `index.css:56-84` (`.dark`) ever wins. No browser verification was performed.