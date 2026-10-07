---
title: Dashboard & Dashboard AI
section: 11
area: dashboard
sources: 51
status: rough
---

# 11. Dashboard & Dashboard AI

Internal reference for engineers. Every claim carries a `path:line` citation. Files outside the
assigned list are read only for integration wiring and are labelled as such. Third-party
Chart.js behaviour is cited against the CDN loader in the backend repo and labelled as such.

Dashboard is the third top-level view mode. Its two halves are (a) the left-rail sidebar plus a
sandboxed-iframe render surface, and (b) the **Dashboard AI side panel** — a right-hand drawer
wired to a *separate* generation endpoint family from the full Resona AI chat.

## Component / File Map

### Assigned files (read in full)

| File | Responsibility | ~Lines |
| --- | --- | --- |
| `src/components/dashboard/DashboardView.tsx` | Iframe render pipeline, parent side of the postMessage bridge, delete + hidden-panel modals, shared/team gating | 395 |
| `src/components/dashboard/DashboardSidebar.tsx` | Section nav rail, section search, auto-refresh, settings dropdown, delete-dashboard dialog | 571 |
| `src/components/dashboard/DashboardEmptyState.tsx` | 5-step generation timeline, owner vs team variants, generate / connect CTA | 147 |
| `src/components/dashboard/GenerateProgress.tsx` | Full-view generation progress card: 5 phase chips, progress bar, live tool steps, dismissable warnings | 143 |
| `src/components/dashboard/api/dashboard.ts` | All 14 dashboard endpoints, query-key factory, SSE parser + chunk reassembly | 487 |
| `src/components/dashboard/hooks/useDashboard.ts` | 11 React Query hooks/mutations; `PHASE_PROGRESS` percent map | 564 |
| `src/components/dashboard/side-panel/ResonaAISidePanel.tsx` | Side-panel orchestrator; wires resize + sessions + chat + parent sync | 184 |
| `src/components/dashboard/side-panel/ResonaAIHeader.tsx` | Brand bar, new-chat, ⋮ history dropdown with search + delete confirm | 303 |
| `src/components/dashboard/side-panel/ResonaAIInput.tsx` | Textarea, ModeSelector, attachments, paste-to-file conversion | 253 |
| `src/components/dashboard/side-panel/ResonaAIMessageItem.tsx` | `SidePanelMessage` type + user/assistant bubbles, tool steps, thinking, warnings | 316 |
| `src/components/dashboard/side-panel/ResonaAIMessageList.tsx` | Scroll container, dedupe, scroll-to-bottom pill | 176 |
| `src/components/dashboard/side-panel/ResonaAIEmptyState.tsx` | Greeting + 3 suggestion pills | 63 |
| `src/components/dashboard/side-panel/useSidePanelChat.ts` | Send path, SSE event → bubble dispatch, file upload, transcript rehydration | 657 |
| `src/components/dashboard/side-panel/useSidePanelSessions.ts` | Run list, selection, per-session message cache, delete, new chat | 188 |
| `src/components/dashboard/side-panel/useSidePanelResize.ts` | Width clamp + localStorage persistence | 79 |
| `src/components/dashboard/side-panel/useParentGenerationSync.ts` | Mirrors parent-driven generation as live bubbles | 120 |
| `src/components/dashboard/side-panel/transcriptMapper.ts` | Durable run transcript → `SidePanelMessage[]` | 364 |
| `src/components/dashboard/side-panel/types.ts` | `SessionHistoryItem` | 20 |
| `src/components/dashboard/side-panel/index.ts` | Barrel | 12 |
| `src/dashboard-engine/contract.ts` | Type-only contract: `PanelData`, `BridgeMessage`, `SwRuntimeApi`, globals | 104 |
| `src/dashboard-engine/bridge.ts` | `window.swRuntime` + inbound `message` handler (sandbox side) | 390 |
| `src/dashboard-engine/init.ts` | `DOMContentLoaded` bootstrap, card decoration, drag resize, scroll-spy | 461 |
| `src/dashboard-engine/render.ts` | Central renderer dispatch + `panelConfigs` cache; defines `window.swChart` | 80 |
| `src/dashboard-engine/renderers/chart.ts` | Chart.js line / bar / area (+ combo `y2_col`) | 222 |
| `src/dashboard-engine/renderers/donut.ts` | Chart.js doughnut / pie | 101 |
| `src/dashboard-engine/renderers/cohort.ts` | Cohort retention heat grid (`pivotCohortMatrix`) | 119 |
| `src/dashboard-engine/renderers/funnel.ts` | Cascade funnel (`computeFunnel`) | 89 |
| `src/dashboard-engine/renderers/geo.ts` | Equirectangular canvas map, dots + regions modes | 300 |
| `src/dashboard-engine/renderers/insight.ts` | Single-signal card + "Why?" button + evidence registry | 133 |
| `src/dashboard-engine/renderers/kpi.ts` | KPI value + change badge + SVG sparkline + progress bar | 114 |
| `src/dashboard-engine/renderers/table.ts` | Sortable / searchable / paginated table | 209 |
| `src/dashboard-engine/renderers/error.ts` | `renderError` + `renderUnsupported` | 55 |
| `src/dashboard-engine/chart-instances.ts` | `chartInstances` registry + 10-colour `COLOR_PALETTE` | 19 |
| `src/dashboard-engine/format.ts` | `escHtml`, `fmtNumber`, `fmtDate`, `fmtDateShort`, `isDateCol`, `isNumericVal`, 2 SVG strings | 68 |
| `src/dashboard-engine/theme.ts` | `resolveTheme`, `applyTheme`, `getThemeColor` | 27 |
| `src/dashboard-engine/index.ts` | IIFE entry: applies theme, imports render + bridge + init | 12 |
| `src/dashboard-engine/tokens.css` | Design system: 4 palettes, ~360 `sw-*` rules. Characterised below, not dumped | 1444 |
| `src/dashboard-engine/__tests__/renderers.test.ts` | Cohort / funnel / dispatch tests | 215 |
| `src/dashboard-engine/__tests__/geo-project.test.ts` | `projectLatLon` + `projectGeo` tests | 109 |
| `src/dashboard-engine/__tests__/section-spy.test.ts` | `setupSectionVisibilitySpy` tests | 121 |

### Supporting files read for integration context

| File | Why read |
| --- | --- |
| `src/components/data-explorer/DataExplorerLayout.tsx` (lines 40–113, 180–360, 520–733) | Parent that mounts all three dashboard surfaces and owns the mutations |
| `src/pages/DataExplorerPage.tsx` (lines 54, 64–72, 149–200, 418–432) | `Ctrl+J` handler, panel-open persistence |
| `src/components/ai/types.ts` (lines 7–22) | `AgentToolStep` shape used by both panel and progress card |
| `src/components/ai/tools/toolSanitize.ts` (lines 85–139) | `sanitizeToolInput` / `sanitizeToolSummary` used in 6 places in this section |
| `src/lib/api/sseChunks.ts` (lines 1–70) | `SseChunkAssembler`, 64 KB frame limit |
| `src/lib/utils.ts` (line 57) | `stripTemporalTag` |
| `src/lib/modes.ts` (line 27) | Canonical `AgentMode = 'flash' \| 'deep'` |
| `scripts/build-dashboard-engine.mjs` | esbuild IIFE bundle of the engine |
| `package.json` | Script names, dependency list |
| `vitest.engine.config.ts` | Engine test scope |
| `../backend/services/de-dashboard/swchart-runtime.js` | Chart.js CDN pin + injection order (**backend repo**) |
| `../backend/services/de-dashboard/dashboard-render.service.js` (grep only) | Where the four `__SW_*` globals are serialised (**backend repo**) |

---

## 1. Dashboard AI side panel — opening, resizing, sessions

### 1.1 How it opens

- Shortcut: `Ctrl+J` **or** `Cmd+J`, gated on `mode === 'dashboard'` — `src/pages/DataExplorerPage.tsx:190-195`. Outside dashboard mode the handler is a no-op (it does not `preventDefault`).
- Open state persists in `localStorage` under `'sw-data-explorer:dashboard-ai-panel-open'` — `src/pages/DataExplorerPage.tsx:54`, read at `:66-68`, written at `:155` / `:164` / `:171`, and re-applied on mode change at `:176-186`.
- A header button labelled `Resona AI` with `title="Open Resona AI panel (Ctrl+J)"` renders only when `mode === 'dashboard' && !isAiPanelOpen` — `src/pages/DataExplorerPage.tsx:421-431`.
- The panel is mounted only in dashboard mode: `{mode === 'dashboard' && isAiPanelOpen && <ResonaAISidePanel ... />}` — `src/components/data-explorer/DataExplorerLayout.tsx:716-728`.
- The panel itself returns `null` when `isOpen` is false — `src/components/dashboard/side-panel/ResonaAISidePanel.tsx:98`. Because the parent already gates on `isAiPanelOpen`, that branch is unreachable in the current wiring.
- Generating a dashboard from the empty state force-opens the panel *before* the request starts: `handleGenerateDashboard` calls `onOpenAiPanel?.()` then `rawStartGeneration(opts)` — `src/components/data-explorer/DataExplorerLayout.tsx:220-223`.
- A "Why?" click on an insight card also force-opens it — `src/components/data-explorer/DataExplorerLayout.tsx:242`, via `setPendingInquiry` at `:237-240`.

### 1.2 Resize behaviour and bounds

`useSidePanelResize` (`src/components/dashboard/side-panel/useSidePanelResize.ts`) is the whole mechanism:

| Constant / rule | Value | Citation |
| --- | --- | --- |
| `DEFAULT_SIDE_PANEL_WIDTH` | `400` | `useSidePanelResize.ts:8` |
| `MIN_SIDE_PANEL_WIDTH` | `340` | `useSidePanelResize.ts:9` |
| `MAX_SIDE_PANEL_WIDTH` | `750` | `useSidePanelResize.ts:10` |
| Storage key | `'sw-data-explorer:resona-ai-panel-width'` | `useSidePanelResize.ts:11` |
| Width derivation during drag | `window.innerWidth - e.clientX` | `useSidePanelResize.ts:39` |
| Live clamp during drag | `Math.min(Math.max(newWidth, 340), Math.min(window.innerWidth - 350, 750))` | `useSidePanelResize.ts:40` |
| Clamp on load (persisted value) | `Math.min(Math.max(parsed, 340), 750)` | `useSidePanelResize.ts:19` |
| Width transition | `transition-[width] duration-75` | `ResonaAISidePanel.tsx:118` |

- Drag starts on `mousedown` on a `w-2` handle positioned `-left-1`; it sets `body.cursor = 'col-resize'` and `body.userSelect = 'none'` — `useSidePanelResize.ts:28-34`, handle markup at `ResonaAISidePanel.tsx:121-136`.
- Persistence happens on `mouseup`, not during the move — `useSidePanelResize.ts:44-56`.
- Double-click resets to `400` and rewrites storage — `useSidePanelResize.ts:66-71`, wired at `ResonaAISidePanel.tsx:124`.
- A full-viewport `fixed inset-0 z-[9999]` blocker is mounted while `isResizing` to stop the dashboard iframe from swallowing mousemove — `ResonaAISidePanel.tsx:112-114`.

### 1.3 Session / conversation model

Two identifiers, both server-assigned for history and client-generated for new chats:

- `run_id` — one generation turn. `DashboardRunSummary.run_id` — `src/components/dashboard/api/dashboard.ts:136`.
- `session_id` — the conversation. `DashboardRunSummary.session_id` — `dashboard.ts:139`.
- A new chat mints a client-side session id: `crypto.randomUUID()` with fallback `` `sess-${Date.now()}` `` — `useSidePanelSessions.ts:163` (new chat) and `:147` (post-delete), and again in `useSidePanelChat.ts:270`.
- Continuing an existing conversation is done by sending `resumeOf = selectedRunId` — `useSidePanelChat.ts:235`. It is deliberately left `undefined` when `selectedRunId` is `null`, i.e. a fresh chat never accidentally resumes — `useSidePanelChat.ts:233-235`.
- `useDashboardGenerate` invalidates `dashboardKeys.sessionRoot` (`['dashboard','session']`) plus the per-run key and the per-connection list — `useDashboard.ts:428-433`, and again in `finally` so a *failed* first run still surfaces in history — `useDashboard.ts:443-446`.

Client state in `useSidePanelSessions`:

| Behaviour | Detail | Citation |
| --- | --- | --- |
| Per-session message cache | `messagesBySessionRef: Record<sessionId, SidePanelMessage[]>` | `useSidePanelSessions.ts:49` |
| Stash on switch | current messages copied into the cache before switching | `useSidePanelSessions.ts:118-120`, `:160-162` |
| Restore on switch | cached array written straight back into `localMessages` | `useSidePanelSessions.ts:128-131` |
| Auto-select newest, once | `hasAutoSelectedRef` guard prevents re-select after `handleNewChat` | `useSidePanelSessions.ts:93-102` |
| Advance within a session | if a newer `run_id` exists for `currentSessionId`, follow it | `useSidePanelSessions.ts:104-110` |
| Optimistic pending entry | unshifted when `currentSessionId` is not yet on the server; id `pending-<sessionId>`, title = first user message sliced to 80 chars, `turnCount = max(1, ceil(messages/2))` | `useSidePanelSessions.ts:66-82`, slice at `:76`, turn count at `:79` |
| Selecting a pending entry | no-op (keeps you on the unsaved chat) | `useSidePanelSessions.ts:116` |
| Delete | `DELETE …/generate/sessions/:runId`; if the deleted run was active, mint a fresh session id and clear messages | `useSidePanelSessions.ts:140-154` |

History dropdown (`ResonaAIHeader.tsx`):

- Status dot colour map: `completed`→emerald, `running`→sky + pulse, `failed`→rose, `cancelled`→amber, `queued`/`pending`→muted, anything else→muted — `ResonaAIHeader.tsx:52-59`, applied at `:209`.
- Title is `session.message` with fallback `'Dashboard Session'` — `useSidePanelSessions.ts:59`.
- Search input only renders when `sessions.length > 4` — `ResonaAIHeader.tsx:168`.
- List is capped by CSS at `max-h-64 sm:max-h-72` — `ResonaAIHeader.tsx:193`.
- Empty copy: `'No matching sessions'` (search active) / `'No previous sessions yet'` — `ResonaAIHeader.tsx:190`.

Mode / thinking persistence (per-user, shared key with the full chat):

| Setting | Key | Default | Citation |
| --- | --- | --- | --- |
| Agent mode | `'sw-data-explorer:resona-ai-mode'` | `'deep'` | `useSidePanelChat.ts:59-63`, write at `:79` |
| Thinking | `'sw-data-explorer:resona-ai-thinking'` | `true` | `useSidePanelChat.ts:69-73`, write at `:86` |
| Effective thinking sent | `isDeep \|\| thinking` | deep forces thinking on | `useSidePanelChat.ts:242-243` |

### 1.4 Dashboard AI vs the full Resona AI chat

The full Resona AI chat surface (chat, artifacts, projects, streaming agent) is documented in
Sections 07–10. Only the deltas observable *inside this section's files*:

| Dimension | Dashboard AI side panel | Citation |
| --- | --- | --- |
| Endpoint family | `/api/de/dashboards/*` | `dashboard.ts:180-484` |
| Durable run read-back | `GET /api/ai/runs/:runId` — shares the backend-ai run store | `dashboard.ts:473` |
| Session list | Own `useDashboardSessions`, own dropdown | `useDashboard.ts:341-352` |
| Conversation shape | Opencode/Claude-Code style: free-form follow-ups that *mutate* an existing dashboard via `resumeOf` | `dashboard.ts:305-308`, `useSidePanelChat.ts:235` |
| Mode toggle | Reuses `ModeSelector` (flash/deep + thinking) | `ResonaAIInput.tsx:203-211` |
| Panel surfaces | None — the panel renders chat only; chart/artifact panels live inside the full AI chat | `ResonaAISidePanel.tsx:139-180` |
| Structured artefacts | None of its own — `ArtifactPanel` / `DashboardPanel` / `WorkspacePanel` are documented in **Section 09** | — |

`ArtifactPanel`, `DashboardPanel` (the AI-chat component, distinct from the API type
`DashboardPanel` at `dashboard.ts:60`) and `WorkspacePanel` are **not** documented here. See
Section 09.

---

## 2. Parent-generation sync and the transcript mapper

### 2.1 `useParentGenerationSync.ts` — observing the parent view's generation

The side panel does **not** own a generation; the parent `DataExplorerLayout` does
(`useGenerateDashboard` at `DataExplorerLayout.tsx:203-209`). The panel receives three props and
synthesises a fake user+assistant turn so the panel does not look empty while the modal
progress card is showing:

| Stage | Behaviour | Citation |
| --- | --- | --- |
| Mount | When `isDashboardGenerating` flips true and no live turn exists, appends a user bubble reading `Generate analytics dashboard for {databaseName}` (or `Generate analytics dashboard`) plus an assistant bubble with `isStreaming: true` | `useParentGenerationSync.ts:35-61`, copy at `:47-50` |
| Guard | `hasAutoSelectedRef.current = true` so the sessions hook does not jump back to an older run | `useParentGenerationSync.ts:60` |
| Stream | Each tick overwrites the last bubble with `text \|\| message` and copies `toolSteps` / `warnings` | `useParentGenerationSync.ts:64-87` |
| Finalise | On the generating→false edge, content becomes `progress.text` → `progress.message` → `'✔ Dashboard ready.'` when `activeRunId` is set, else `'⚠️ Dashboard generation stopped.'` | `useParentGenerationSync.ts:90-119`, strings at `:97` |
| Rebind | When `activeRunId` exists: mark auto-selected, `setSelectedRunId(activeRunId)`, `refetchSessions()` | `useParentGenerationSync.ts:114-118` |
| Teardown | `parentLiveTurnRef.current = null` before the state write, so the finalise effect cannot loop | `useParentGenerationSync.ts:99` |

Because `useGenerateDashboard` clears `progress` in its `finally` block
(`useDashboard.ts:242`), the `dashboardGenerationProgress` prop is `null` by the time the
finalise effect runs; the final content therefore resolves through `activeRunId` to
`'✔ Dashboard ready.'` in the normal success path.

### 2.2 `transcriptMapper.ts` — what it maps and why

Input is `DashboardRunState` (`dashboard.ts:148-160`), which carries `transcript` **or** the
legacy `conversation` array — `transcriptMapper.ts:49`. Output is `SidePanelMessage[]`
(`ResonaAIMessageItem.tsx:24-36`). It exists because the wire transcript is not a chat log: it
carries system scaffolding, internal ids, duplicated turns and raw SQL.

| Transform | Rule | Citation |
| --- | --- | --- |
| Pre-filter | Drop entries with no string `role`, plus `_durable_marker` and `_pinboard` entries | `transcriptMapper.ts:49-51` |
| Drop `system` turns | always | `transcriptMapper.ts:57` |
| Strip temporal tag | `stripTemporalTag` removes leading `[Sent: …]` lines | `transcriptMapper.ts:61`, `:81`, `src/lib/utils.ts:57` |
| Strip attachment scaffolding | Split on `'\n\n### Attached Files:\n'`, keep only the prefix text; harvest `<uploaded_file name="…">` names from the tail | `transcriptMapper.ts:28-39`, marker at `:29`, regex at `:35` |
| Consecutive-user dedupe | Compare **display** text, not raw content, because the server-augmented turn never equals the optimistic local copy | `transcriptMapper.ts:57-70`, rationale at `:58-60` |
| Thinking → tool step | `m.thinking` becomes an `AgentToolStep` named `thinking`, `type: 'thinking'`, `label: 'Thinking…'`, `status: 'done'` | `transcriptMapper.ts:109-120` |
| `tool_calls` → steps | Args read from `tc.args` / `tc.arguments` / `tc.function.arguments`, JSON-parsed when a string | `transcriptMapper.ts:121-151` |
| Tool-call dedupe | `stepKey = tc.id \|\| \`${name}:${JSON.stringify(input)}\`` in a `seenStepKeys` set | `transcriptMapper.ts:132-134` |
| Fallback step source | `m.toolSteps` or `m.execution_trace.toolSteps` when no `tool_calls` were present | `transcriptMapper.ts:153-167` |
| `tool` role enrichment | Match on `tool_call_id` against `toolStepMap`; success summary = `m.content.slice(0, 300)` | `transcriptMapper.ts:203-222`, slice at `:217` |
| Assistant coalescing | Consecutive assistant turns merge into one bubble; content joined with `\n\n` | `transcriptMapper.ts:182-202`, join at `:196` |
| Synthetic user turn | If the transcript has no user turn, unshift `runState.message` (or `request_payload.message`) | `transcriptMapper.ts:226-241`, id `u-initial-{runState.id \|\| 'fallback'}` at `:233` |
| Synthetic assistant turn | Trailing user turn gets an outcome based on `runState.status`: `completed` → `completion_message \|\| 'Dashboard generated and saved.'`; `running` → empty streaming bubble; `failed` → `⚠️ {error \|\| completion_message \|\| 'Dashboard generation failed.'}` | `transcriptMapper.ts:244-271` |
| Empty assistant content | Synthesised from steps — `Dashboard updated via {mutationTool}.`, `Queried database: {k} is **{v}**.`, `Query result: {k}: **{v}**, …`, `Query completed: {first 150 chars}`, `Queried database to inspect metrics.`, `Action completed.` | `transcriptMapper.ts:274-339`, mutation tool allowlist at `:288-290` |
| SQL / id scrub | Every synthesised string passes `sanitizeToolSummary`, which replaces SQL with `[query]`, UUIDs with `…`, and `*_id:` fields with `[redacted]` | `transcriptMapper.ts:337`, `src/components/ai/tools/toolSanitize.ts:116-129` |
| Adjacent-assistant dedupe | Coalesces adjacent assistant bubbles with equal or empty content, merging `toolSteps` / `thinking` | `transcriptMapper.ts:341-360` |

`_isResuming` is the second parameter and is **not read** (`transcriptMapper.ts:47`).

Rehydration on top of this lives in `useSidePanelChat.ts:123-197`: it skips while either the panel
or the parent is generating (`:124`), returns `prev` unchanged when the mapped array is
element-wise identical (`:132-144`), and otherwise merges positionally — never via a greedy
`find` — with an explicit comment forbidding the greedy lookup (`:150-155`).

---

## 3. Generation flow

Two entry points converge on the same SSE endpoint. Both are documented because they produce
different UI and different cache behaviour.

### 3.1 Endpoints

| # | Method | Path | Body / params | Returns | Citation |
| --- | --- | --- | --- | --- | --- |
| 1 | GET | `/api/de/dashboards` | `connectionId` (required), `theme` (optional) | `GetDashboardResponse` | `dashboard.ts:178-183` |
| 2 | GET | `/api/de/dashboards/:id` | `theme` (optional) | `GetDashboardResponse` | `dashboard.ts:188-192` |
| 3 | GET | `/api/de/dashboards/:id/meta` | — | `{ id, version?, updated_at?, is_shared?, shared_by? }` | `dashboard.ts:199-205` |
| 4 | POST | `/api/de/dashboards/:id/refresh` | — | `RefreshResult` (`html`, `panelData`, `refreshedAt`) | `dashboard.ts:210-214` |
| 5 | POST | `/api/de/dashboards/:id/panels/:panelKey/refresh` | — | `PanelRefreshResult` | `dashboard.ts:219-224` |
| 6 | DELETE | `/api/de/dashboards/:id` | — | `{ deleted }` | `dashboard.ts:229-233` |
| 7 | DELETE | `/api/de/dashboards/:id/panels/:panelKey` | `{ explanation }` | `{ dashboard_id, panelKey, deleted, version?, html? }` | `dashboard.ts:238-250` |
| 8 | POST | `/api/de/dashboards/:id/panels/reorder` | `{ panelKey, direction: 'up' \| 'down' }` | `{ dashboard_id, panelKey, panels, version, html? }` | `dashboard.ts:255-267` |
| 9 | POST | `/api/de/dashboards/:id/panels/resize` | `{ panelKey, colSpan?, height? }` | `{ …, col_span?, height?, panels, version }` | `dashboard.ts:272-285` |
| 10 | POST | `/api/de/dashboards/:id/panels/visibility` | `{ panelKey, isHidden }` | `{ …, is_hidden, panels, version }` | `dashboard.ts:290-302` |
| 11 | POST | `/api/de/dashboards/generate` | see payload below | SSE stream → `DashboardProgressEvent` | `dashboard.ts:309-456` |
| 12 | GET | `/api/de/dashboards/generate/sessions` | `connectionId` | `{ runs: DashboardRunSummary[] }` | `dashboard.ts:463-467` |
| 13 | GET | `/api/ai/runs/:runId` | — | `DashboardRunState` | `dashboard.ts:472-474` |
| 14 | DELETE | `/api/de/dashboards/generate/sessions/:runId` | — | `{ success }` | `dashboard.ts:479-484` |

### 3.2 Generate request payload

Sent as JSON via `apiRequestRaw` (not `apiRequest`) so the SSE body stays readable while
`code` / `hint` / `isRateLimited` / `isServerError` and the 401 sign-out event are preserved —
rationale at `dashboard.ts:315-318`. Optional fields are **omitted**, not sent as `null` —
`dashboard.ts:321-331`:

| Field | Type | Default when omitted | Citation |
| --- | --- | --- | --- |
| `connectionId` | `string` | required | `dashboard.ts:322` |
| `message` | `string` | omitted | `dashboard.ts:323` |
| `resumeOf` | `string` (a `run_id`) | omitted | `dashboard.ts:324` |
| `sessionId` | `string` | omitted | `dashboard.ts:325` |
| `agentMode` | `AgentMode` (`'flash' \| 'deep'`) | omitted | `dashboard.ts:326` |
| `thinking` | `boolean` | omitted (sent when explicitly `false`) | `dashboard.ts:327` |
| `fileIds` | `string[]` | omitted unless non-empty | `dashboard.ts:328` |
| `clientTime` | ISO string | `new Date().toISOString()` | `dashboard.ts:329` |
| `clientTimezone` | IANA string | `Intl.DateTimeFormat().resolvedOptions().timeZone`, else `'UTC'` | `dashboard.ts:330` |

`AbortSignal` is forwarded so `cancelGeneration` can abort mid-stream — `dashboard.ts:332`,
wired from `useDashboard.ts:199` and `useDashboard.ts:425`.

### 3.3 SSE parsing and the progress model

Parser: `generateDashboard` reads `res.body.getReader()`, decodes with a streaming
`TextDecoder`, normalises `\r\n`→`\n`, splits on `\n\n`, keeps the trailing partial block in
`buffer` — `dashboard.ts:335-344`, `:422-449`. If the reader has no body it throws
`'Response body is not readable'` (`:336`). Every `data:` payload goes through
`SseChunkAssembler` first; `undefined` means "chunk fragment, wait for siblings" —
`dashboard.ts:363-366`, `src/lib/api/sseChunks.ts:63-67`. The backend splits frames larger than
**64 KB** (`src/lib/api/sseChunks.ts:5`).

Event name → client `phase` mapping (`dashboard.ts:367-411`):

| SSE `event:` | Emitted `phase` | Extra fields carried | Line |
| --- | --- | --- | --- |
| `phase` | `parsed.phase` | `message` | `:367-368` |
| `delta` | `'delta'` | `delta` = `parsed.text \|\| parsed.delta`, `text` | `:369-370` |
| `thinking_chunk` / `thinking` | `'thinking'` | `delta`, `text` | `:371-372` |
| `thinking_clear` | `'thinking_clear'` | — | `:373-374` |
| `tool_call` | `'tool_call'` | `id`, `name`, `input` (`parsed.input ?? parsed.arguments ?? {}`) | `:375-383` |
| `tool_result` | `'tool_result'` | `id`, `name`, `success`, `summary`, `latency_ms` | `:384-394` |
| `tool_retry` | `'tool_retry'` | `id`, `name` | `:395-396` |
| `status` | `parsed.phase \|\| 'status'` | `message` = `parsed.detail \|\| parsed.message` | `:397-398` |
| `warning` / `budget_warning` | `'warning'` | `message`, `dimension`, `pct` | `:399-400` |
| `budget_exhausted` | `'budget_exhausted'` | `message`, `reason` | `:401-402` |
| `context_compacted` | `'status'` | fixed message `'Context window compacted — continuing generation…'` | `:403-404` |
| `run_started` | — | `run_id`, `session_id` | `:405-406` |
| `done` | — | `finalResult = parsed`, also forwarded to `onProgress` | `:407-409` |
| `error` | — | **throws** `parsed.message \|\| 'Generation failed'` | `:410-411` |

A JSON parse failure is swallowed with `logger.warn` unless the event is `error` —
`dashboard.ts:413-418`. On `done` the reader is cancelled (`:436-443`). If the stream ends with
no `done`, it throws `'Dashboard generation stream ended without completion event'` —
`dashboard.ts:451-453`.

### 3.4 Percent mapping

`PHASE_PROGRESS` in `useDashboard.ts:41-49`:

| Phase | Percent |
| --- | --- |
| `introspect` | 20 |
| `plan` | 45 |
| `mutate` | 60 |
| `validate` | 70 |
| `persist` | 85 |
| `render` | 95 |
| `done` | 100 |
| unknown phase | 50 (`:173`) |
| `delta` (special-cased) | 98 (`:166`) |
| initial optimistic value | 10 (`:116`) |

### 3.5 Path A — empty state / sidebar "Create Dashboard" (modal progress)

1. `DashboardEmptyState` button calls `handleAction` → `onGenerate()` when a connection exists, otherwise `onOpenConnectWizard()` — `DashboardEmptyState.tsx:57-63`, button at `:118-139`.
2. `DataExplorerLayout.handleGenerateDashboard` opens the AI panel, then calls `rawStartGeneration(opts)` — `DataExplorerLayout.tsx:220-223`.
3. `useGenerateDashboard.startGeneration` sets `isGenerating`, clears `error`, seeds progress `{ phase: 'introspect', message: 'Starting dashboard generation...', percent: 10 }`, creates an `AbortController` — `useDashboard.ts:114-119`.
4. Calls `generateDashboard(..., { agentMode: 'deep', thinking: true, ...opts })` — `useDashboard.ts:125-205`. **Deep mode and thinking are hardcoded defaults for this path** (`:201-202`), unlike the side panel which uses the user's toggles.
5. The `onProgress` callback accumulates `toolSteps` (sanitized via `sanitizeToolInput`, `:135`), marks steps `done`/`error` with `latencyMs` from `latency_ms` (`:144-155`), de-duplicates `warnings` by message (`:156-160`), and mirrors text/thinking/progress into state (`:162-191`). `run_id` / `session_id` are captured whenever present (`:192-197`).
6. `DashboardView` short-circuits to `GenerateProgress` while `isGenerating` — `DashboardView.tsx:261-267`.
7. On `done`: progress set to `{ phase: 'done', percent: 100 }` with message = accumulated text → `result.text` → `` `Dashboard ready: ${result.title}` `` → `'Dashboard ready!'` — `useDashboard.ts:207-208`.
8. Optimistic cache write via `setQueriesData` (all theme variants), then `invalidateQueries` on `detail(connectionId)` and `sessions(connectionId)` — `useDashboard.ts:213-230`.
9. `finally`: `isGenerating=false`, `progress=null`, `abortControllerRef=null` — `useDashboard.ts:240-244`.
10. `Cancel Generation` button calls `onCancel` → `cancelGeneration` → `abortControllerRef.abort()` — `GenerateProgress.tsx:131-139`, `useDashboard.ts:247-254`.

`GenerateProgress` surface detail: 5 phase chips — `introspect`/`Schema`, `plan`/`Layout & KPIs`,
`validate`/`SQL Safety`, `persist`/`Save`, `render`/`Render` — `GenerateProgress.tsx:19-25`. Chip
state is `currentIdx > idx || percent >= 100` for done, `currentIdx === idx && percent < 100` for
current — `:98-99`. Default bar percent when `progress` is null is **15** (`:28`) and the default
message is `'Analyzing tables, relations, and drafting business metrics...'` (`:36`). Warnings
are passed through `sanitizeToolSummary` and can be dismissed individually (`:31-33`, `:80-89`).
Live tool steps reuse `LiveToolSteps` from the full AI chat — `GenerateProgress.tsx:66`.

### 3.6 Path B — Dashboard AI side panel (inline chat)

1. `Enter` without Shift submits; Shift+Enter inserts a newline — `ResonaAIInput.tsx:113-120`. The action button toggles to a Stop square while streaming — `ResonaAIInput.tsx:122-128`, `:241-244`.
2. `handleSendMessage` refuses empty input with no attachments, and refuses while `isWorking` — `ResonaAISidePanel.tsx:102-107`, where `isWorking = chat.isSidePanelGenerating || isDashboardGenerating` (`:100`).
3. `handleContinueDashboard` — see `useSidePanelChat.ts:200-611` for the full body:
   - optimistic user + empty streaming assistant bubbles (`:209-231`);
   - `resumeOf = selectedRunId || undefined` (`:235`);
   - session id minted if absent (`:270-274`);
   - files uploaded first via `uploadFilesForAI(files, { sessionId })`, producing `fileIds`, with attachment metadata backfilled onto the already-rendered user bubble (`:278-305`, backfill at `:288-293`); on failure: `toast.error('File upload failed. Proceeding without file context.')` (`:301`);
   - files-only turns synthesise `` `I've attached ${name}. Please analyze the attached file content and incorporate it into the dashboard.` `` (`:309`);
   - `onProgress` folds `tool_call` / `tool_result` / `warning` / `budget_exhausted` / `delta` / `thinking*` into `toolSteps`, `warnings`, `accumulatedText`, `accumulatedThinking` (`:321-416`), writing to the bubble matched by `assistantMsgId`, falling back to a `findIndex` on that id (`:419-446`);
   - after completion: thinking steps with empty summaries are dropped and adjacent thinking steps merged, `status: 'calling'` is coerced to `'done'` (`:462-486`);
   - `finalContent` fallbacks: `Updated dashboard (${result.mutation}).` / `Dashboard ready: ${result.title}` (`:452-459`);
   - final dedupe + splice of the user bubble if missing (`:500-563`);
   - `setSelectedRunId(result.run_id)` + invalidate that session key (`:565-568`), `setCurrentSessionId(result.session_id)` (`:569-571`), per-session cache write (`:572-575`), `refetchSessions()` (`:576`);
   - cache write of `html` + `panelData` into `dashboardKeys.detail(connectionId)`, or `invalidateQueries` when the `done` frame carried no html (`:578-595`);
   - failure: bubble content becomes `` `⚠️ ${err?.message || 'Dashboard generation failed.'}` `` and `refetchSessions()` still runs (`:596-611`).
4. **Pending inquiry auto-dispatch**: a `pendingInquiry` prop (from an insight "Why?" click) is consumed and sent automatically once nothing is generating — `useSidePanelChat.ts:628-633`. The prompt is assembled by `formatInsightWhyPrompt` (`DataExplorerLayout.tsx:51-107`), which appends the panel's SQL under a ```` ```sql ```` fence when available (`:98-100`) and closes with a fixed instruction (`:102-104`). If the dashboard is already generating the click is refused with `toast.info('Dashboard AI is currently analyzing. Please wait for it to complete.')` — `DataExplorerLayout.tsx:226-229`.

---

## 4. Dashboard data model

### 4.1 Query keys (`dashboardKeys`, `dashboard.ts:37-49`)

| Key | Value | Purpose |
| --- | --- | --- |
| `all` | `['dashboard']` | invalidate everything |
| `detail(connectionId)` | `['dashboard', connectionId]` | dashboard document for a connection |
| `meta(dashboardId)` | `['dashboard','meta',dashboardId]` | freshness poll |
| `sessions(connectionId)` | `['dashboard','sessions',connectionId]` | durable run list |
| `sessionRoot` | `['dashboard','session']` | prefix for every run, any connection |
| `session(runId)` | `['dashboard','session',runId]` | one run |

The `string | null | undefined` parameter type is deliberate — the original inline literals
produced a real `['dashboard', null]` key that invalidation matched on, so the looseness is
preserved and documented — `dashboard.ts:31-35`.

### 4.2 Types

**`DashboardSection`** (`dashboard.ts:52-58`)

| Field | Type | Required |
| --- | --- | --- |
| `id` | `string` | yes |
| `title` | `string` | yes |
| `icon` | `string` | no |
| `is_pulse` | `boolean` | no |
| `summary` | `string` | no |

**`DashboardPanel`** (`dashboard.ts:60-70`)

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | yes | |
| `panel_key` | `string` | yes | DOM/registry key; falls back to `key` at `DashboardView.tsx:89` |
| `key` | `string` | no | legacy alias |
| `section_id` | `string` | yes | |
| `title` | `string` | yes | |
| `chart_type` | union of 10 | yes | see §8 |
| `sql` | `string` | yes | consumed by `formatInsightWhyPrompt` (`DataExplorerLayout.tsx:235`) |
| `config` | `Record<string, unknown>` | yes | read for `is_hidden` (`DashboardView.tsx:88`, `DashboardSidebar.tsx:150`) and by the engine |
| `sort_order` | `number` | yes | |

**`Dashboard`** (`dashboard.ts:72-86`)

| Field | Type | Required |
| --- | --- | --- |
| `id` | `string` | yes |
| `title` | `string` | yes |
| `description` | `string` | yes |
| `sections` | `DashboardSection[]` | yes |
| `panelCount` | `number` | yes |
| `panels` | `DashboardPanel[]` | no |
| `version` | `number` | no |
| `refreshedAt` | `string` | no |
| `createdAt` | `string` | no |
| `isShared` | `boolean` | no |
| `sharedBy` | `string \| null` | no |

**`GetDashboardResponse`** (`:88-92`): `{ dashboard: Dashboard | null; html: string; panelData: Record<string, PanelData> }`.
**`RefreshResult`** (`:94-98`): `{ html; panelData; refreshedAt }`.
**`PanelRefreshResult`** (`:100-104`): `{ panelKey; data: PanelData; refreshedAt }`.

**`DashboardProgressEvent`** (`:106-133`) — 26 optional fields grouped as: generation
(`phase`, `message`, `dashboard_id`, `title`, `html`, `panelData`, `error`, `run_id`,
`session_id`, `type`, `text`, `mutation`, `version`, `delta`), tool execution (`id`, `name`,
`input`, `success`, `summary`, `latency_ms`), warnings/budget (`dimension`, `pct`, `reason`,
`eventType`).

**`DashboardRunSummary`** (`:135-146`): `run_id`, `status`, `session_id`, `message` required;
`created_at`, `completed_at`, `completion_reason`, `completion_message`, `context`, `turn_count`
optional.

**`DashboardRunState`** (`:148-160`): `id`, `status`, `session_id`, `message` required;
`completion_reason`, `completion_message`, `error`, `transcript`, `conversation`, `created_at`,
`completed_at` optional.

**`GenerateDashboardOptions`** (`:162-171`): `message?`, `resumeOf?`, `sessionId?`, `agentMode?`,
`thinking?`, `clientTime?`, `clientTimezone?`, `fileIds?`.

**`PanelData`** (re-exported, defined in the engine) — `contract.ts:12-16`: `{ columns: Array<{ name: string; dataTypeID?: number }>; rows: unknown[][]; error?: string }`.

**`InsightEvidence`** (re-exported) — `contract.ts:18-28`: `title?`, `classification?`,
`current_value?`, `previous_value?`, `delta_pct?`, `comparison_period?`, `interpretation?`,
`recommendation?`, `confidence?` (all `| null` except `title`/`classification`/`interpretation`/
`recommendation` which are plain optionals).

**`SessionHistoryItem`** (`side-panel/types.ts:12-19`): `id`, `title` required; `sessionId?`,
`status?`, `createdAt?`, `turnCount?`, `isActive?`.

**`SidePanelMessage`** (`ResonaAIMessageItem.tsx:24-36`): `id`, `role: 'user' | 'assistant'`,
`content` required; `sql?`, `isStreaming?`, `toolSteps?`, `thinking?`, `warnings?`, `files?`,
`attachments?`, `timestamp?`.
**`SidePanelAttachment`** (`:17-22`): `name` required; `fileId?`, `sizeBytes?`, `downloadUrl?`.

**`GenerationProgress`** (`useDashboard.ts:32-39`): `phase`, `message`, `percent` required;
`text?`, `toolSteps?`, `warnings?`.

### 4.3 React Query options

| Hook | Key | Enabled when | staleTime | retry | Other | Citation |
| --- | --- | --- | --- | --- | --- | --- |
| `useDashboard` | `detail` | `Boolean(connectionId)` | `5 * 60 * 1000` | `1` | — | `useDashboard.ts:52-58` |
| `useDashboardLiveVersion` | `meta` | `Boolean(connectionId && dashboardId && isShared)` | `Infinity` | default | `refetchInterval: 60 * 1000`, `refetchIntervalInBackground: true` | `useDashboard.ts:74-81` |
| `useDashboardSessions` | `sessions` | `Boolean(connectionId)` | `30 * 1000` | default | `refetchOnWindowFocus: true` | `useDashboard.ts:342-351` |
| `useDashboardRunState` | `session` | `Boolean(runId)` | `5 * 1000` | default | `refetchOnWindowFocus: true` | `useDashboard.ts:358-364` |

Mutation hooks and their cache effects:

| Hook | Mutation | `onSuccess` cache write | Citation |
| --- | --- | --- | --- |
| `useRefreshDashboard` | `refreshDashboard` | `setQueryData(detail)` — keeps existing `html` when present to avoid an iframe white-flash remount, replaces `panelData`, updates `refreshedAt` | `useDashboard.ts:277-289`, comment `:281` |
| `useRefreshPanel` | `refreshPanel` | merges one `panelData[panelKey]` | `useDashboard.ts:305-314` |
| `useDeleteDashboard` | `deleteDashboard` | blanks to `{ dashboard: null, html: '', panelData: {} }` then invalidates | `useDashboard.ts:325-330` |
| `useDeletePanel` | `deletePanel` | decrements `panelCount` (`Math.max(0, count - 1)`), adopts `version` | `useDashboard.ts:469-482` |
| `useReorderPanels` | `reorderPanels` | adopts `panels` + `version`; no `srcDoc` reload because the iframe already moved the DOM | `useDashboard.ts:495-508`, comment `:494` |
| `useResizePanel` | `resizePanel` | adopts `panels` + `version` | `useDashboard.ts:520-533` |
| `useSetPanelVisibility` | `setPanelVisibility` | adopts `panels` + `version` | `useDashboard.ts:545-558` |
| `useDeleteDashboardSession` | `deleteDashboardSession` | optimistic filter out of `sessions`; rollback in `onError`; invalidate in `onSettled` | `useDashboard.ts:373-394` |

---

## 5. Dashboard layout — widgets, grid, drag, persistence

### 5.1 Grid and positioning

- Layout is pure CSS grid on `.sw-grid`; **there is no absolute/freestyle positioning system and no widget-coordinate store in the frontend** — `tokens.css:245-255`.
- Three fixed column templates exist: `.sw-grid-3` = `repeat(3, minmax(0,1fr))`, `.sw-grid-2` = `repeat(2, …)`, `.sw-grid-1` = `minmax(0,1fr)` — `tokens.css:252-254`.
- Column span classes: `.sw-col-span-1` = `span 1`, `.sw-col-span-2` = `span 2`, `.sw-col-span-3` = `1 / -1` — `tokens.css:257-259`.
- Responsive overrides collapse 3→2 and then to a single column, forcing every span to 1 — `tokens.css:262-268`.
- Container: `max-width: 1400px; margin: 0 auto; padding: 20px 24px 40px` — `tokens.css:167-169`.
- The engine assumes **3 columns** when computing drag widths: `colWidth = gridWidth / 3` — `init.ts:244`. On a `.sw-grid-2` layout this is wrong (see §Dead Code).

### 5.2 Per-card widget chrome

`decorateCardActions()` (`init.ts:21-208`) runs on `DOMContentLoaded` over every `.sw-card` and
injects:

- A refresh button (`.sw-refresh-btn`, title `'Refresh this panel'`) bound to `swRuntime.refreshPanel(panelKey)` — `init.ts:36-58`.
- Removal of any other loose direct-child button of `.sw-card-actions` that is not `.sw-refresh-btn` or `.sw-menu-btn` — `init.ts:61`.
- A `.sw-card-menu-wrap` three-dot menu plus `.sw-card-dropdown` with seven items — `init.ts:64-104`.

| Menu item | Class | Handler | Label |
| --- | --- | --- | --- |
| Focus Mode | `.sw-expand-btn` | `expandPanel(key)` | `init.ts:73-76`, `:116-123` |
| Resize Width | `.sw-resize-btn` | `resizePanel(key)` | `init.ts:77-80`, `:125-132` |
| Collapse | `.sw-collapse-btn` | `collapsePanel(key)` | `init.ts:81-84`, `:134-141` |
| Move Left | `.sw-move-btn[data-dir="up"]` | `movePanel(key,'up')` | `init.ts:86-89`, `:143-150` |
| Move Right | `.sw-move-btn[data-dir="down"]` | `movePanel(key,'down')` | `init.ts:90-93`, `:152-159` |
| Hide Card | `.sw-hide-btn` | `hidePanel(key)` | `init.ts:95-98`, `:161-168` |
| Delete Card | `.sw-delete-btn.sw-dropdown-danger` | `deletePanel(key)` | `init.ts:99-102`, `:170-177` |

- A corner resize handle `.sw-card-resize-handle` with title `'Drag to resize card width and height'` — `init.ts:183-189`. **This is a real, working drag handle, not a dead grip icon.**
- Initial `col_span`, `height`, `is_hidden` are applied from the element's embedded `data-config` JSON — `init.ts:192-206`. Only spans `2` and `3` are honoured (`:196`).
- Section headers get a chevron and a click-to-collapse handler that ignores clicks landing on a `button, a` — `init.ts:391-405`.
- `is_pulse: true` sections get `sw-is-pulse`, a `Pulse` badge and a summary block — `init.ts:362-388`.
- Read-only mode (team members) hides the edit affordances via `body.sw-read-only` — `tokens.css:560-565`, toggled by the `SET_PERMISSIONS` message at `bridge.ts:366-376`.

### 5.3 Drag-and-drop: what is real

**Card reordering is real but is not free-form DnD.** `movePanel` physically moves the DOM node
among its siblings (`parentGrid.insertBefore(...)`) so the iframe does not flicker, applies a
400 ms `sw-card-reordered` highlight, and only then posts `PANEL_MOVE_REQUEST` —
`bridge.ts:51-68` (timeouts at `:60` and `:65`). The parent persists it —
`DashboardView.tsx:167-182`. **There is no drag-to-reorder pointer handler anywhere in the
engine**; reordering is menu-driven only.

**2D corner-drag resize is real pointer-drag.** `attachCardResizeHandler` (`init.ts:214-279`):

| Rule | Value | Citation |
| --- | --- | --- |
| Height clamp | `Math.max(200, Math.min(850, …))` | `init.ts:240` |
| Width column unit | `gridWidth / 3` | `init.ts:244` |
| Span snap to 3 | `projectedWidth > colWidth * 2.15` | `init.ts:246-247` |
| Span snap to 2 | `projectedWidth > colWidth * 1.25` | `init.ts:248-249` |
| Span otherwise | `1` | `init.ts:250-251` |
| Persist on `pointerup` | `resizePanel(key, { colSpan, height })` | `init.ts:271-274` |
| Live chart reflow attempt | `(window as any).chartInstances?.[canvasId]?.resize()` | `init.ts:259-262` — **dead, see §Dead Code** |

**"Resize Width" menu button cycles spans** when called with no arguments: `1 → 2 → 3 → 1`,
derived from the current `sw-col-span-*` class — `bridge.ts:130-135`, button title rewritten to
`` `Width: ${targetSpan}x (Click to cycle 1x/2x/3x)` `` at `bridge.ts:142`. Programmatic height
is clamped to `200 … 900` — `bridge.ts:147` (note: 900 here vs 850 during drag, `init.ts:240`).

### 5.4 Layout persistence

Server-side, one endpoint per verb (§3.1 rows 7–10). The client applies each mutation
optimistically to `dashboard.panels` + `dashboard.version` and deliberately does **not** reload
the iframe `srcDoc` — comments at `useDashboard.ts:468`, `:494`. The iframe's DOM was already
mutated locally for reorder/resize/hide. Hidden state is additionally reflected in local
component state `hiddenPanels`, derived from `panels[].config.is_hidden` —
`DashboardView.tsx:82-93` — and broadcast to the sidebar over a window `CustomEvent`
`'sw:hidden-panels-changed'` (`DashboardView.tsx:95-101`) which `DashboardSidebar` listens for
(`DashboardSidebar.tsx:159-167`). Unhiding is driven back into the iframe by
`UNHIDE_PANEL` (`DashboardView.tsx:138-148`).

Auto-refresh is a client-side `setInterval` over `0 / 60 / 300 / 900` seconds, defaulting to
`0` (off), suspended while `isRefreshing` or `isGenerating` —
`DashboardSidebar.tsx:141`, `:178-186`, menu at `:412-455`.

---

## 6. The dashboard engine

### 6.1 What it is — precise verdict

**Both.** It is a *dispatch-and-render engine* that is primarily a thin abstraction layer over
Chart.js for two artefact families, and a fully custom (non-library) DOM/Canvas renderer for six.

- Chart.js is **not** an npm dependency of this app (`package.json:20-77`). It is loaded from a
  CDN by the backend's HTML composer: `https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js`
  — `../backend/services/de-dashboard/swchart-runtime.js:25`, injected as a `<script src>` before
  the engine IIFE (`:45-49`). The engine reaches it only through `declare const Chart: any` —
  `renderers/chart.ts:18`, `renderers/donut.ts:11` — and the global is declared on `Window` at
  `contract.ts:102`.
- Chart.js is used by exactly two renderers: `renderers/chart.ts` and `renderers/donut.ts`.
- The other six artefact types (`kpi`, `insight`, `table`, `cohort`, `funnel`, `geo`) are **custom**:
  four emit hand-built HTML strings, one (`geo`) draws directly onto a raw 2D canvas context with
  an equirectangular projection and an embedded 78-country centroid table
  (`renderers/geo.ts:55-77`), explicitly "NO GIS library" (`renderers/geo.ts:3`).
- So: a **Chart.js abstraction for charts/parts, plus a bespoke renderer set for everything else**,
  with a uniform `PanelData` + `PanelRuntimeConfig` contract in front of both.

### 6.2 `contract.ts` — the public contract

Type-only module; every export is erased at build time — `contract.ts:5-7`.

| Export | Shape | Citation |
| --- | --- | --- |
| `SwTheme` | `'light' \| 'dark' \| 'dark-black' \| 'blue-gray'` | `contract.ts:10` |
| `PanelData` | `columns[{name, dataTypeID?}]`, `rows: unknown[][]`, `error?` | `contract.ts:12-16` |
| `InsightEvidence` | 9 optional fields | `contract.ts:18-28` |
| `PanelRuntimeConfig` | `panel_key?`, `type?`, `title?`, `color?` + `[key: string]: unknown` index signature | `contract.ts:30-36` |
| `SectionRuntime` | `id` required; `title?`, `is_pulse?`, `summary?`, `icon?` | `contract.ts:38-44` |
| `EngineGlobals` | `__SW_DATA__`, `__SW_PANELS__`, `__SW_SECTIONS__`, `__SW_THEME__` — all optional | `contract.ts:47-52` |
| `SwChartApi` | `render(selector, config?)` | `contract.ts:54-56` |
| `SwRuntimeApi` | 11 required methods + 2 optional menu methods + `_updatePanel` | `contract.ts:58-72` |
| `BridgeMessage` | 17-variant discriminated union on `type` | `contract.ts:79-96` |
| `declare global` | `Window` extended with `swChart?`, `swRuntime?`, `Chart?` | `contract.ts:98-103` |

`SwRuntimeApi` methods: `refreshPanel`, `whyPanel`, `deletePanel`, `movePanel(key,'up'|'down')`,
`expandPanel`, `resizePanel`, `collapsePanel`, `hidePanel`, `unhidePanel`, `toggleSection`,
optional `toggleCardMenu` / `closeAllCardMenus`, plus `_updatePanel(key, data)` —
`contract.ts:59-72`.

`BridgeMessage` variants (all at `contract.ts:80-96`): `DASHBOARD_LOADED`, `PANEL_REFRESH_REQUEST`,
`INSIGHT_WHY_REQUEST`, `PANEL_DATA_UPDATED`, `GLOBAL_REFRESH_START`, `GLOBAL_REFRESH_DONE`,
`GLOBAL_REFRESH_ERROR`, `SCROLL_TO_SECTION`, `SECTION_VISIBLE`, `THEME_SYNC`,
`PANEL_DELETE_REQUEST`, `PANEL_MOVE_REQUEST`, `PANEL_DELETED`, `PANEL_RESIZE_REQUEST`,
`PANEL_HIDE_REQUEST`, `UNHIDE_PANEL`, `SET_PERMISSIONS`.

**Contract drift:** `INSIGHT_WHY_REQUEST` is typed as
`{ panelKey: string; evidence?: InsightEvidence }` (`contract.ts:82`) but `bridge.ts:34-42` also
sends `title`, and `DashboardView.tsx:251` destructures `msg.title`. The extra field is outside
the declared union.

### 6.3 `bridge.ts` — how the React app talks to the engine

There is **no direct React↔engine call**. Everything crosses `window.postMessage`:

- Outbound (engine → parent): `parent.postMessage(msg, '*')` — always target `'*'`. The security
  posture is stated in the file header: the sandbox has no `allow-same-origin`, so the only valid
  origin is the parent, and inbound messages are gated on `event.source === window.parent` —
  `bridge.ts:4-5`, `:292-294`.
- Inbound (parent → engine): `window.addEventListener('message', …)` switch over
  `PANEL_DATA_UPDATED`, `GLOBAL_REFRESH_START`, `GLOBAL_REFRESH_DONE`, `GLOBAL_REFRESH_ERROR`,
  `THEME_SYNC`, `SCROLL_TO_SECTION`, `PANEL_DELETED`, `UNHIDE_PANEL`, `SET_PERMISSIONS` —
  `bridge.ts:300-377`. Note there is **no handler for `DASHBOARD_LOADED`** inbound — that message
  flows engine→parent only.
- Escape closes Focus Mode — `bridge.ts:380-389`.
- `window.swRuntime = swRuntime` at `bridge.ts:281`; `window.swChart = { render: renderPanel }` at
  `render.ts:80`.

Parent side, `DashboardView.tsx:151-258`: inbound messages are accepted only when
`event.source === iframeRef.current?.contentWindow` (`:154`). Handled: `DASHBOARD_LOADED` →
re-push theme (`:159-160`), `PANEL_DELETE_REQUEST` → confirm dialog (`:161-166`),
`PANEL_MOVE_REQUEST` → reorder (`:167-182`), `PANEL_RESIZE_REQUEST` → resize (`:183-192`),
`PANEL_HIDE_REQUEST` → visibility + toast (`:193-211`), `PANEL_REFRESH_REQUEST` → await
`onRefreshPanel` then `PANEL_DATA_UPDATED` back (`:212-244`), `SECTION_VISIBLE` →
`onSectionVisible` (`:245-248`), `INSIGHT_WHY_REQUEST` → `onInsightWhy` (`:249-253`).

Iframe sandbox attribute is `sandbox="allow-scripts"` — `DashboardView.tsx:313`; content is
injected via `srcDoc={html}` (`:311`).

**Notable timeouts in the bridge** (all `setTimeout`, no constants):

| Action | Delay | Citation |
| --- | --- | --- |
| Reorder highlight removal | 400 ms | `bridge.ts:60`, `:65` |
| Focus backdrop removal | 200 ms | `bridge.ts:80` |
| Chart `resize()` after focus toggle | 60 ms | `bridge.ts:113` |
| Chart `resize()` after resizePanel | 40 ms | `bridge.ts:156` |
| Chart `resize()` after expand-collapse | 40 ms | `bridge.ts:184` |
| Hide animation before class swap | 240 ms | `bridge.ts:197` |
| Unhide highlight removal | 450 ms | `bridge.ts:206` |
| Chart `resize()` after unhide | 60 ms | `bridge.ts:213` |
| `PANEL_DELETED` node removal | 260 ms | `bridge.ts:354` |
| Timestamp text after `_updatePanel` | set to the literal `'Updated just now'` | `bridge.ts:261` |

Refresh spinner helpers: `sw-refresh-btn` class toggling per card (`bridge.ts:16-23`), plus
`setAllRefreshing(true/false)` over a three-selector list (`:283-290`).

### 6.4 `init.ts` — initialisation, wrapped library, instance registry

- `index.ts` is the IIFE entry: imports `./theme`, `./render`, `./bridge`, `./init`, then applies
  `window.__SW_THEME__ || 'dark'` **immediately** so the palette is set before first paint —
  `index.ts:7-12`.
- Build: `npm run build:engine` → `node scripts/build-dashboard-engine.mjs`
  (`package.json:9`), which esbuild-bundles `src/dashboard-engine/index.ts` to
  `format: 'iife'`, `target: 'es2020'`, output `dashboard-runtime.bundle.js`, and copies
  `tokens.css` to `dashboard-runtime.tokens.css` — both into
  `../backend/services/de-dashboard/generated` — `scripts/build-dashboard-engine.mjs:17-36`.
- `resolveInitialConfig(panelKey, domConfig)` merges precedence
  `{...domConfig, ...window.__SW_PANELS__[key], panel_key: key}` — fresh server config wins over
  the stale embedded `data-config` — `init.ts:16-19`, rationale `:4-9`.
- `DOMContentLoaded` sequence (`init.ts:360-448`):
  1. Auto-decorate `is_pulse` sections from `__SW_SECTIONS__` (`:361-388`).
  2. Add chevrons + collapse handlers to every `.sw-section` (`:390-405`).
  3. `decorateCardActions()` (`:408`).
  4. Pass 1 — render every `[data-config]` element, resolving config first (`:410-425`); parse
     failure logs `[swChart] Failed to parse config for` (`:423`).
  5. Pass 2 — render any remaining `[id^="chart-"]` not yet marked `data-rendered="true"` that has
     an entry in `__SW_PANELS__` (`:427-433`).
  6. `parent.postMessage({ type: 'DASHBOARD_LOADED', panelCount: <count of .sw-card>, height: document.body.scrollHeight })` (`:436-444`).
  7. `setupSectionVisibilitySpy()` (`:447`).
- Global delegated listeners: click-outside closes card menus; Escape closes them —
  `init.ts:450-461`.
- **Instance registry** is `chartInstances: Record<string, any>` keyed by
  `'<containerId>-canvas'` — `chart-instances.ts:6`. Lifecycle rule is *destroy-then-create*:
  `chartInstances[canvasId].destroy()` before `new Chart(...)` —
  `chart.ts:89-91` and `:217`, `donut.ts:37-39` and `:51`. The registry exists precisely so
  re-renders destroy rather than stack, per its header comment (`chart-instances.ts:2-4`).
  Resize callers reach it through the module import (`bridge.ts:110`, `:153`, `:181`, `:210`) —
  **not** through `window`.
- `COLOR_PALETTE` is 10 hard-coded hex values —
  `#6366f1, #10b981, #f59e0b, #0284c7, #f43f5e, #8b5cf6, #06b6d4, #ec4899, #14b8a6, #f97316` —
  `chart-instances.ts:8-19`. Indexed modulo 10: `COLOR_PALETTE[i % COLOR_PALETTE.length]`
  (`chart.ts:106`, `funnel.ts:73`, `geo.ts:187`, `:237`, `chart.ts:147`).
- Scroll-spy: `setupSectionVisibilitySpy` (`init.ts:299-358`) — activation marker `MARKER_Y = 96`
  px (`:309`), bottom-of-page override when `scrollY + innerHeight >= scrollHeight - 4`
  (`:316-319`), otherwise "last section whose top crossed the marker" (`:321-329`), rAF-throttled
  scroll+resize listeners (`:342-350`), posts `SECTION_VISIBLE` only on change (`:333-340`).
  Singleton with teardown (`:297`, `:352-357`). Justified in-comment: the sandbox has no
  `allow-same-origin`, so the parent cannot observe scroll — `init.ts:289-292`.

### 6.5 Renderer architecture — `render.ts` + `renderers/`

`renderPanel(selector, config?)` (`render.ts:25-77`) is the single dispatch point:

1. `document.querySelector(selector)`; bail if absent (`:26-27`).
2. `panelKey = container.id.replace(/^chart-/, '')` (`:29`).
3. Cache write to `panelConfigs[panelKey]` — but **only when `Object.keys(config).length > 1` and
   no existing entry has more than one key** (`:32-37`), so a thin config never overwrites a rich one.
4. Effective config = `Object.assign({}, __SW_PANELS__[key] || {}, panelConfigs[key] || {}, config)`
   — later sources win (`:39-44`).
5. Data = `__SW_DATA__[panelKey] || null` (`:46`).
6. If `data.error` → `renderError(container, data.error)` once (guarded by
   `container.dataset.rendered !== 'true'`), then return (`:48-52`).
7. Type resolution: `String(effective.type || effective.chart_type || '').toLowerCase() || 'line'`
   (`:54`) — **an absent type silently renders as a line chart**.
8. Chain of `if/else` (`:56-74`), then `container.dataset.rendered = 'true'` (`:76`).

| Renderer | Renders | Selected when | Output technology | Selection site |
| --- | --- | --- | --- | --- |
| `renderKpi` | Headline metric, change badge, SVG sparkline, progress-to-target bar | `type === 'kpi'` | hand-built HTML string | `render.ts:56-57`; `renderers/kpi.ts:52` |
| `renderInsight` | Single quantified signal + delta arrow + classification/confidence tags + "Why?" button | `type === 'insight'` | hand-built HTML string | `render.ts:58-59`; `renderers/insight.ts:22` |
| `renderTable` | Sortable / searchable / paginated table | `type === 'table'` | hand-built HTML + rebound DOM handlers | `render.ts:60-61`; `renderers/table.ts:74` |
| `renderCohort` | Cohort retention heat grid | `type === 'cohort'` | hand-built HTML string | `render.ts:62-63`; `renderers/cohort.ts:88` |
| `renderFunnel` | Cascade funnel with % of first and drop-off | `type === 'funnel'` | hand-built HTML string | `render.ts:64-65`; `renderers/funnel.ts:58` |
| `renderGeo` | Equirectangular map, dots or regions | `type === 'geo' \|\| 'map' \|\| 'world'` | raw Canvas2D + optional HTML legend | `render.ts:66-67`; `renderers/geo.ts:263` |
| `renderDonut` | Doughnut / pie | `type === 'donut' \|\| 'doughnut' \|\| 'pie'` | Chart.js `doughnut` / `pie` | `render.ts:68-69`; `renderers/donut.ts:19` |
| `renderChart` | Line / bar / area, optional combo right axis | `['line','bar','area'].includes(type)` | Chart.js `line` / `bar` | `render.ts:70-71`; `renderers/chart.ts:58` |
| `renderUnsupported` | "Unsupported chart type" card + raw rows | any other type | hand-built HTML | `render.ts:72-73`; `renderers/error.ts:22` |
| `renderError` | "Query Failed" card | `data.error` is truthy | hand-built HTML | `render.ts:48-52`; `renderers/error.ts:8` |

Renderer-specific config keys, all read from `PanelRuntimeConfig`:

| Renderer | Keys |
| --- | --- |
| `chart` | `x_col`, `y_cols[]`, `y_col`, `stacked`, `horizontal`, `index_axis` (`'y'`), `y2_col`, `color`, `currency` (via `fmtNumber`) — `chart.ts:5-10`, `:28`, `:36`, `:46`, `:81-82`, `:106`, `:144` |
| `donut` | `label_col`, `value_col`, `chart_type === 'pie'` switches to a solid pie — `donut.ts:26-27`, `:41` |
| `kpi` | `value_col`, `change_col`, `spark_col` (alias `trend_col`), `target`, `target_col`, `label` — `kpi.ts:5-9`, `:59`, `:64`, `:80`, `:75`, `:89-93` |
| `insight` | `current_value`, `previous_value`, `delta_pct`, `unit`, `classification`, `confidence`, `is_headline`, `comparison_period`, `recommendation`, `interpretation`, `title` — `insight.ts:29-53`, `:84-101` |
| `table` | `currency` only, via `fmtNumber` — `table.ts:138` |
| `cohort` | `cohort_col`, `age_col`, `value_col`, `age_sort` (`'desc'` → -1) — `cohort.ts:27-37`, `:53` |
| `funnel` | `stage_col`, `value_col`, `stage_sort` (`'asc'` / `'desc'`), `show_pct` (default `'on'`), `show_drop` (default `'on'`) — `funnel.ts:25-29`, `:41-43`, `:67-68` |
| `geo` | `lat_col`, `lon_col`, `region_col`, `value_col`, `mode` (`'regions'`), `dot_style` (`'fixed'`), `currency` — `geo.ts:7-8`, `:134-137`, `:143`, `:166-167`, `:252` |
| layout | `col_span`, `height`, `is_hidden` (read by `init.ts:196-204`) |

Chart.js specifics worth recording (`chart.ts:164-215`): `maintainAspectRatio: false`;
`animation.duration = 400`; `interaction { mode: 'index', intersect: false }`; legend shown only
when `datasets.length > 1` (`:162`), `boxWidth/boxHeight = 10`, `padding = 12`, `font.size = 11`;
tooltip `padding 10`, `cornerRadius 6`; bar datasets get `borderRadius 4`, `maxBarThickness 32`,
alpha suffix `'cc'` unstacked / `'d9'` stacked (`:114-119`); line datasets get `tension 0.35`,
`pointRadius 2`, `pointHoverRadius 4`, `borderWidth 2` (`:130-133`); area fills use alpha `'33'`,
stacked area `'55'` (`:128`, `:138`); `beginAtZero` only for bar (`:207`); `y1` is a right-hand
axis with `grid.drawOnChartArea: false` (`:209-213`). `donut.ts:68` sets `cutout: '62%'`,
`hoverOffset: 6` (`:61`), `layout.padding: 8` (`:69`), legend at `bottom` (`:72`).

### 6.6 `theme.ts` + `tokens.css`

`theme.ts` (27 lines total):

- `resolveTheme(theme)` returns `'light'`, `'dark-black'` or `'blue-gray'` verbatim; **everything
  else, including `undefined`, `null`, `'dark'` and any unknown string, resolves to `'dark'`** —
  `theme.ts:10-13`.
- `applyTheme` writes `document.documentElement.dataset.theme` — `theme.ts:15-17`. Because
  `tokens.css` scopes palettes to `:root[data-theme='…']`, this single attribute swaps the entire
  palette.
- `getThemeColor(varName, fallback)` resolves a CSS custom property to a literal string for
  Canvas, which cannot evaluate `var(--…)` — `theme.ts:19-26`. Call sites and fallbacks:
  `--sw-text-muted` / `#8b8ba0`, `--sw-border` / `#1e1e2a`, `--sw-tooltip-bg` /
  `rgba(10, 10, 15, 0.95)`, `--sw-tooltip-title` / `#ffffff`, `--sw-tooltip-text` / `#e4e4ed`,
  `--sw-tooltip-border` / `rgba(255, 255, 255, 0.1)` — `chart.ts:96-101`; `--sw-bg-card` /
  `#111118` — `donut.ts:44`; `--sw-primary` / `#6366f1` — `geo.ts:232`; `--sw-emerald` / `#10b981`
  and `--sw-rose` / `#f43f5e` — `kpi.ts:31-32`.

`tokens.css` — 1444 lines, one file, **not** dumped here. Characterisation:

- External font import: Google Fonts `Inter` (400/500/600/700) + `JetBrains Mono` (400/500) —
  `tokens.css:4`.
- **Four palettes**, each a flat list of `--sw-*` custom properties:
  `:root, :root[data-theme='dark']` (`:6-42`, default), `:root[data-theme='light']` (`:94-115`),
  `:root[data-theme='dark-black']` (`:118-139`, OLED: `--sw-bg: #000000`),
  `:root[data-theme='blue-gray']` (`:142-163`).
- Token families: background (`--sw-bg`, `--sw-bg-card`, `--sw-bg-card-hover`), border, text
  (`--sw-text`, `--sw-text-muted`, `--sw-text-dim`), accent + soft variants for
  `primary / emerald / amber / rose / sky / violet`, radii (`--sw-radius: 12px`,
  `--sw-radius-sm: 8px`), two shadows, two font stacks, tooltip quartet, scrollbar pair.
- Reset + globals: universal box-sizing reset (`:44`), `html` scrollbar styling (`:46-49`),
  `html, body` typography and `overflow-x: hidden` (`:51-59`), globalised 5 px WebKit scrollbar
  (`:62-83`), link styling (`:85-91`).
- Component layer, roughly in DOM order: dashboard shell (`:166-190`), sections + chevron +
  collapse (`:191-244`), grid + spans + responsive overrides (`:245-268`), card + corner resize
  handle + header + title + actions + dropdown menu + item states (`:272-565`), read-only gating
  `body.sw-read-only` (`:560-565`), collapsed / hidden / deleting / reordered states (`:569-679`),
  card body (`:685-688`), KPI (`:690-784`), insight (`:786-898`), pulse sections (`:900-948`),
  chart container (`:950-961`), table (`:963-1132`), error / unsupported / unrenderable
  (`:1134-1207`), **skeleton** (`:1209-1218`), card footer + timestamp (`:1226-1235`), cohort
  (`:1237-1315`), funnel (`:1317-1398`), geo (`:1400-1444`).
- Notable numeric values: `--sw-radius: 12px` (`:33`), `--sw-radius-sm: 8px` (`:34`), scrollbar
  width/height `5px !important` (`:63-64`), cohort heat classes `sw-cohort-h1…h6` at
  `rgba(99,102,241, 0.08 / 0.18 / 0.32 / 0.50 / 0.72)` and `var(--sw-primary)` (`:1296-1301`),
  insight tag colour variants `--trend / --anomaly / --risk / --opportunity / --change`
  (`:868-872`).

Theme handoff from React: `DashboardView` maps `next-themes` `theme`/`resolvedTheme` (resolving
`'system'`) into a `SwTheme`, defaulting to `'dark'` — `DashboardView.tsx:64-70`, and pushes it
as `THEME_SYNC` on mount, on dependency change, on `DASHBOARD_LOADED` and on `iframe.onLoad`
(`:110-117`, `:159-160`, `:315`). `THEME_SYNC` also forces a full re-render of every
`[data-config]` element so Canvas charts pick up recomputed colours — `bridge.ts:323-339`.

### 6.7 `format.ts` — value formatting rules

| Function | Rule | Citation |
| --- | --- | --- |
| `escHtml` | Sets `textContent` on a detached `div` and reads `innerHTML` | `format.ts:13-17` |
| `fmtNumber` | `null`/`undefined` → `'—'`; `NaN` → `String(val)` | `format.ts:20-22` |
| `fmtNumber` (currency) | `Intl.NumberFormat('en-US', { style:'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: num >= 1000 ? 0 : 2 })` | `format.ts:23-31` |
| `fmtNumber` (compact) | `>= 1e9` → `(n/1e9).toFixed(1)+'B'`; `>= 1e6` → `M`; **`>= 1e4` → `K`** (note the 10 000 threshold, not 1 000) | `format.ts:32-34` |
| `fmtNumber` (plain) | `num.toLocaleString('en-US', { maximumFractionDigits: 2 })` | `format.ts:35` |
| `fmtDate` | `toLocaleDateString('en-US', { month:'short', day:'numeric' })` | `format.ts:38-43` |
| `fmtDateShort` | `toLocaleDateString('en-US', { month:'short', year:'2-digit' })` | `format.ts:45-50` |
| `isDateCol` | Lowercased name contains any of `date, month, day, week, year, time, created, period` | `format.ts:52-64` |
| `isNumericVal` | Not null/undefined/`''` and `!isNaN(Number(v))` | `format.ts:66-68` |

All are pure apart from `escHtml`, which needs a DOM. Callers: `chart.ts:74-77` (x labels),
`donut.ts:94` (tooltip), `error.ts:35-36`, `table.ts:138-140`, `cohort.ts:108-110`,
`funnel.ts:76-79`, `geo.ts:192`, `kpi.ts:61`, `insight.ts:65`.

---

## 7. Stat tiles / KPI cards

**All rendering is client-side; no statistic is computed by the React app and none is computed by
a dedicated server "stat tile" endpoint.** The numbers come from the panel's SQL via
`PanelData`, and every derived figure is computed in the engine renderers.

| Artefact | Computed where | Inputs | Citation |
| --- | --- | --- | --- |
| KPI headline value | Client, engine | first row of `PanelData.rows[0]`, column `value_col` (default index 0) | `kpi.ts:57-61` |
| KPI % change badge | Client, engine | `change_col`; class `sw-badge-positive` if `> 0`, `-negative` if `< 0`, `-neutral` if `0`; rendered `'+' + change.toFixed(1) + '%'` | `kpi.ts:64-72`, `:68-70` |
| KPI sparkline | Client, engine | `spark_col` or `trend_col`; inline SVG polyline, `viewBox="0 0 120 32"`, `preserveAspectRatio="none"`, stroke-width 2, terminal circle `r=2.5`; stroke is `--sw-emerald` if last `>=` first else `--sw-rose`; **returns `''` when fewer than 2 points** | `kpi.ts:16-43`, thresholds `:17`, `:29-32`, `:38-41` |
| KPI progress-to-target | Client, engine | `target` (config literal) else `target_col` (row 0); `pct = Math.min(100, value / target * 100)`; class `--done` at `>= 100`, default at `>= 70`, `--low` below; label `` `${pct.toFixed(0)}% of target` `` | `kpi.ts:85-104`, thresholds `:96` |
| Insight current / previous | Client, engine | config literals, overridden by first-row columns matched case-insensitively against `['current_value','current','value']` and `['previous_value','previous','prev_value','prior_value']` | `insight.ts:29-30`, `:42-45` |
| Insight delta % | Client, engine | `config.delta_pct`, else derived as `((current - previous) / Math.abs(previous)) * 100` when both present and previous `!== 0` | `insight.ts:48-51` |
| Insight direction glyph | Client, engine | `▲` if `> 0`, `▼` if `< 0`, `•` if `0`; badge shown `+N.N%` | `insight.ts:58-71` |
| Insight classification / confidence | Client, engine | defaults `'trend'` / `'low'` | `insight.ts:54-55` |
| Cohort retention % | Client, engine | `pct = count / baseline` where baseline is the first non-zero age bucket in that cohort's row | `cohort.ts:57-67`, baseline scan `:60-64` |
| Cohort heat level | Client, engine | `>=0.8 → 6`, `>=0.5 → 5`, `>=0.3 → 4`, `>=0.15 → 3`, `>0 → 2`, else `1` | `cohort.ts:79-86` |
| Funnel % of first / drop-off | Client, engine | `pctOfFirst = count / first`; `dropoff = 1 - count / prev` | `funnel.ts:46-55` |
| Geo region / dot magnitude | Client, engine | `regions` mode aggregates by alias-resolved country key, sorted value-desc; circle radius `3 + 20 * sqrt(v/maxV)`; dots radius `2 + 6 * sqrt(v/maxV)` or fixed `2.6` | `geo.ts:142-163`, `:238`, `:255` |
| Table row count | Client, engine | `total` after the search filter; footer reads `` `${total} rows` `` | `table.ts:99`, `:153` |

**Server-side statistics exist but are not used by any of these tiles.** `PanelData.columns[i].dataTypeID`
carries a PG type OID (`contract.ts:13`) that the engine never reads. Nothing in
`useDashboard.ts` or `api/dashboard.ts` computes an aggregate; `/api/de/dashboards/:id/refresh`
re-runs the stored panel SQL server-side (`dashboard.ts:210-214`) and the same for one panel
(`:219-224`).

---

## 8. Widget / metric types the code can render

Every distinct artefact type the engine can produce, with the transport type that selects it:

| # | Artefact | Type key(s) accepted | Renderer |
| --- | --- | --- | --- |
| 1 | KPI card (value, change badge, sparkline, target bar) | `kpi` | `renderers/kpi.ts:52` |
| 2 | Insight / single-signal card with "Why?" | `insight` | `renderers/insight.ts:22` |
| 3 | Interactive data table | `table` | `renderers/table.ts:74` |
| 4 | Cohort retention heat grid | `cohort` | `renderers/cohort.ts:88` |
| 5 | Cascade funnel | `funnel` | `renderers/funnel.ts:58` |
| 6 | Geo map (dots) | `geo`, `map`, `world` (without `region_col`) | `renderers/geo.ts:263` |
| 7 | Geo map (regions, centroid bubbles + legend) | `geo` / `map` / `world` **with** `region_col`, or `mode: 'regions'` | `renderers/geo.ts:135`, `:234-250` |
| 8 | Doughnut | `donut`, `doughnut` | `renderers/donut.ts:19` |
| 9 | Pie | `pie` | `renderers/donut.ts:41-42` |
| 10 | Line chart | `line` (also the fallback for an empty type) | `render.ts:54`, `render.ts:70-71` |
| 11 | Bar chart (vertical or horizontal) | `bar` | `render.ts:70-71`, `chart.ts:82` |
| 12 | Area chart | `area` | `render.ts:70-71`, `chart.ts:79` |
| 13 | Combo chart (bar/area + `y2_col` line on a right axis) | any of `line`/`bar`/`area` **with** `y2_col` | `chart.ts:143-160` |
| 14 | Error card ("Query Failed") | any, when `PanelData.error` is set | `renderers/error.ts:8` |
| 15 | Unsupported-type card + raw result table (capped at 200 rows) | any unrecognised type | `renderers/error.ts:22`, cap at `:31` |
| 16 | "Cannot Render Chart" card (no numeric column) | `line`/`bar`/`area` with zero series | `chart.ts:67-72` |
| 17 | "No Data" card (empty result set) | any of the eight data renderers | `chart.ts:59-62`, `donut.ts:20-23`, `table.ts:75-78`, `cohort.ts:90-94`, `funnel.ts:60-65`, `geo.ts:265-271` |
| 18 | Section container with pulse badge + summary | driven by `__SW_SECTIONS__[*].is_pulse` | `init.ts:362-388` |

`DashboardPanel.chart_type` in the TypeScript union declares **10** of these — `'kpi' | 'line' |
'bar' | 'donut' | 'area' | 'table' | 'insight' | 'cohort' | 'funnel' | 'geo'` —
`dashboard.ts:66`. The runtime additionally accepts `pie`, `doughnut`, `map`, `world`
(`render.ts:66`, `:68`) which the type does not.

---

## 9. Dashboard empty state

`DashboardEmptyState.tsx` renders when `!dashboard || !html` — `DashboardView.tsx:280-293`. Copy
is reproduced verbatim.

### 9.1 Owner heading (verbatim, `DashboardEmptyState.tsx:75-77`)

> `Welcome {cleanName}, Generate {dbLabel} analytics quickly`

`cleanName` strips email/dot suffixes via `.replace(/\.[a-zA-Z0-9_-]+/g, '')` — `:53`. `dbLabel`
falls back to the literal `'database'` — `:54`.

### 9.2 Owner 5-step timeline (verbatim, `DashboardEmptyState.tsx:20-41`)

| Step | Text |
| --- | --- |
| `01` | `AI understands your database structure, tables, and relationships to map how your business data is organized.` |
| `02` | `AI identifies your core business metrics, revenue drivers, customer behavior, and growth trends across your data.` |
| `03` | `AI safely analyzes your live production data using controlled, read-only queries with zero database modifications.` |
| `04` | `AI transforms complex data into executive KPIs, growth trends, segment insights, and actionable business insights.` |
| `05` | `Get a live view of your business with interactive dashboards, critical KPIs, key trends, and AI recommendations.` |

### 9.3 Owner CTA (verbatim, `DashboardEmptyState.tsx:123-138`)

| State | Label |
| --- | --- |
| generating | `Generating {databaseName} Dashboard...` (trailing space inside the template, `:126`) |
| no connection | `Connect Database to Generate` |
| ready | `Generate {databaseName} Dashboard` (trailing space inside the template, `:135`) |

### 9.4 Team-member variants (verbatim)

| Element | Copy | Citation |
| --- | --- | --- |
| Heading | `Team dashboard for {dbLabel} is on the way` | `DashboardEmptyState.tsx:71-73` |
| Body | `This database is shared with your team. The connection owner generates the AI dashboard once, and it is shared with everyone automatically — members can view it and refresh it free, without spending AI credits.` | `DashboardEmptyState.tsx:85-89` |
| Follow-up | `As soon as the connection owner generates it, it will appear here for your whole team.` | `DashboardEmptyState.tsx:92` |
| Footer (no button) | `No dashboard yet — the connection owner will be able to generate one here.` | `DashboardEmptyState.tsx:114-116` |

### 9.5 Sidebar empty states (verbatim, `DashboardSidebar.tsx`)

| Copy | Citation |
| --- | --- |
| `Select a database to view its dashboard.` | `:212` |
| `Generating sections...` (while generating) | `:311` |
| `No sections defined` | `:311` |
| `No sections match "{sectionFilter}"` | `:307` |
| `No dashboard yet — the connection owner will generate it once and it will be shared with your team automatically.` | `:501-502` |
| `Shared dashboard (View-only)` | `:493` |

Section search toggle only appears when `sectionsCount > 6` — `DashboardSidebar.tsx:231`.

### 9.6 Side-panel empty state (verbatim, `ResonaAIEmptyState.tsx`)

- Greeting: `Hi {cleanFirstName}, I'm Resona Dashboard AI.` / fallback
  `Hi, I'm Resona Dashboard AI.` — `:20`.
- Subtitle: `Your dedicated live dashboard analytics & visualization partner.` — `:44`.
- Suggestion pills (verbatim, `:22-26`):
  1. `What are our primary revenue drivers and growth trends?`
  2. `Summarize overall business health and customer retention`
  3. `Highlight key executive KPIs and weekly performance`

`ResonaAIEmptyState` also declares a `databaseName` prop (`:10`) that it never reads — the prop is
passed by `ResonaAIMessageList.tsx:141` and dropped.

---

## 10. Panels documented elsewhere

`ArtifactPanel`, the AI-chat `DashboardPanel` component and `WorkspacePanel` render inside the
**full Resona AI chat**, not inside the dashboard side panel. They are covered in **Section 09 —
Artifact System**. This section documents only the dashboard-mode iframe renderers
(§6.5) and the dashboard data types `DashboardPanel` / `DashboardSection`
(`api/dashboard.ts:52-70`), which are a different thing from the chat components of similar name.

---

## Dead / Unused Code

### High severity

1. **`init.ts:259` live chart reflow during pointer drag is dead.**
   `const chartInst = (window as any).chartInstances?.[canvasId];` reads a **global** that is never
   written. `chartInstances` is a module-scoped export (`chart-instances.ts:6`) and nothing ever
   assigns it to `window.chartInstances` — the only other accessors use the module import
   (`bridge.ts:110`, `:153`, `:181`, `:210`). Consequence: dragging a card corner changes
   `minHeight` and the `sw-col-span-*` class but never calls `Chart.resize()`, so a live canvas
   does not reflow until the subsequent `resizePanel` → 40 ms `chartInstances[...].resize()`
   at `bridge.ts:151-156`.

2. **`useDashboard.ts:221` hard-codes `panelCount: 5`.**
   The optimistic post-generation cache write uses
   `panelCount: typeof result.html === 'string' ? 5 : (prev?.dashboard?.panelCount || 0)`.
   Any generated dashboard that is not exactly 5 panels briefly (until the `invalidateQueries` at
   `:229` refetches) reports `panelCount: 5`.

3. **`GenerateProgress` phase chips do not cover 4 of the 7 progress phases.**
   `PHASES` contains 5 entries (`GenerateProgress.tsx:19-25`); `PHASE_PROGRESS` contains 7
   (`useDashboard.ts:41-49`), and the `delta`, `thinking*`, `tool_*`, `status`, `warning`,
   `thinking_clear` phases produce none of the 5 ids. For `mutate`, `done`, `delta` and all tool
   phases `currentIdx === -1`, so **no chip is highlighted** and only `percent >= 100` can mark a
   chip done (`GenerateProgress.tsx:98-99`). The file header nevertheless says
   "Visual feedback during 5-phase AI dashboard generation" (`:3`).

4. **Column-span snapping assumes a 3-column grid.** `init.ts:244` hard-codes
   `const colWidth = gridWidth / 3;` even though `.sw-grid-1` and `.sw-grid-2` exist
   (`tokens.css:252-254`) and `.sw-grid-2` redefines `.sw-col-span-3` as `span 2`
   (`tokens.css:263`). Drag-resize snapping thresholds (`colWidth * 2.15`, `colWidth * 1.25`,
   `init.ts:246-249`) will therefore snap to the wrong span on a 2-column section.

### Unused exports / props / config keys

5. **`fmtDateShort`** — `format.ts:45-50`. Zero callers anywhere in `src/dashboard-engine`.
6. **`decorateRefreshButtons`** — `init.ts:283`. A "backwards-compatible alias" for
   `decorateCardActions` with zero callers, including tests.
7. **`ResonaAIMessageItem.onInsightWhy`** — `ResonaAIMessageItem.tsx:42`. Declared on the props
   interface; the component destructures only `{ message, onTableClick, connectionId }`
   (`:63-67`) and never calls it. No caller in the tree passes it (only `DashboardView.tsx:41` and
   `DataExplorerLayout.tsx:707` declare a same-named prop, for a different component).
8. **`SidePanelMessage.sql`** — `ResonaAIMessageItem.tsx:29`. Never read or written by any code
   in this section.
9. **`ResonaAISidePanel.onExpandFullScreen`** — `ResonaAISidePanel.tsx:23`. `DataExplorerLayout`
   never passes it (`DataExplorerLayout.tsx:717-727`), so the Maximize button
   (`ResonaAIHeader.tsx:111-123`) and the `'Pop-out chat'` dropdown item
   (`ResonaAIHeader.tsx:145-155`) are permanently unreachable in the current wiring.
10. **`config.projection`** — documented as a geo config key at `renderers/geo.ts:8`
    (`projection ('equirect' default)`) but never read anywhere in `projectGeo`
    (`geo.ts:131-181`). Only the equirectangular projection exists.
11. **`GeoBounds`** — `geo.ts:30-40`. Computed and returned by `projectGeo`
    (`:163`, `:180`) but never read by the draw path (`drawGeo`, `:215-261`) or by
    `renderGeo` (`:263-300`); only `__tests__/geo-project.test.ts:51-53` reads it.
12. **`SwRuntimeApi.toggleCardMenu` / `closeAllCardMenus` optional markers** —
    `contract.ts:69-70` declare them optional (`?`), but `bridge.ts:225-246` always defines them.
    The optionality forces optional-chaining at every call site (`init.ts:112`, `:120`, `:126`,
    `:135`, `:144`, `:153`, `:162`, `:171`, `:453`, `:459`).
13. **`useSidePanelSessions` option `onCancelGeneration`** — `useSidePanelSessions.ts:24`,
    invoked at `:158`. `ResonaAISidePanel.tsx:59-65` never passes it, so `handleNewChat`'s cancel
    call is a no-op.
14. **`isGenerating: false` hard-coded** at `ResonaAISidePanel.tsx:64`. This makes the optimistic
    pending history entry's `status` always `'pending'`, never `'running'`
    (`useSidePanelSessions.ts:77`), so a brand-new in-flight chat shows a grey dot rather than the
    pulsing sky dot (`ResonaAIHeader.tsx:55`).
15. **`_isResuming` parameter** of `transcriptToMessages` — `transcriptMapper.ts:47`. Declared and
    never read; `isResumingRef` is tracked separately by the caller
    (`useSidePanelChat.ts:96`, `:236`, `:449`).
16. **`generateDashboard`'s `DashboardProgressEvent.type` and `.delta` aliases** —
    `dashboard.ts:115`, `:120`. `type` is never read; `delta` is read
    (`useDashboard.ts:163`, `useSidePanelChat.ts:360`) but never written by the SSE parser, which
    only sets `delta` on the synthesised `delta` / `thinking` events
    (`dashboard.ts:370`, `:372`).
17. **`DashboardSection.icon` plumbing is half-used.** `getSectionIcon` accepts it
    (`DashboardSidebar.tsx:99-104`) and normalises `_`→`-`, but `ICON_MAP` keys use the
    dash-normalised names (`:74-85`) while `SectionRuntime.icon` in the engine is typed as a plain
    `string` (`contract.ts:43`) — the engine never reads `icon`.
18. **`ResonaAIEmptyState.databaseName`** — declared at `ResonaAIEmptyState.tsx:10`, passed at
    `ResonaAIMessageList.tsx:141`, never destructured by the component (`:14-16`).
19. **CSS-only classes with no emitter in this repo** (they may come from the backend's
    `composeHtml`, which is outside the assigned files): `.sw-skeleton`, `.sw-skeleton-value`,
    `.sw-skeleton-badge`, `.sw-skeleton-chart` — `tokens.css:1209-1218`;
    `.sw-pulse-header`, `.sw-pulse-title` — `tokens.css:909`, `:918` (the engine injects
    `.sw-pulse-badge` and `.sw-pulse-summary`, `init.ts:372-384`, but never these two);
    `.sw-chart-container` — `tokens.css:950`, `:957`, referenced only from within the stylesheet.

### Type / contract drift

20. **`DashboardPanel.chart_type` union omits four accepted runtime values.** The type lists 10
    values (`dashboard.ts:66`); `renderPanel` also accepts `pie`, `doughnut`, `map`, `world`
    (`render.ts:66`, `:68`). A panel typed as `DashboardPanel` therefore cannot legally declare a
    value the renderer supports.
21. **`INSIGHT_WHY_REQUEST` payload exceeds its declared type.** Declared as
    `{ panelKey; evidence? }` (`contract.ts:82`); sent with an extra `title`
    (`bridge.ts:34-42`) and read as `msg.title` (`DashboardView.tsx:251`).
22. **`panelConfigs` caching rule is order-dependent and surprising.** `renderPanel` only caches
    when `Object.keys(config).length > 1` and refuses to overwrite an existing multi-key entry
    (`render.ts:32-37`). The engine test suite has to `delete panelConfigs['test_panel']` to test a
    second type on the same panel key (`__tests__/renderers.test.ts:197-198`), which documents
    the behaviour rather than the intent.

---

## Open Questions

UNVERIFIED: What backend composes the dashboard HTML (`composeHtml`) — specifically which
`sw-*` class names, section markup and `data-config` JSON it emits, and whether it emits
`sw-skeleton`, `sw-pulse-header`, `sw-pulse-title` or `sw-chart-container`. `composeHtml` itself
lives in `backend/services/de-dashboard/` and was outside the assigned file list; only the four
`__SW_*` global injections and the Chart.js CDN tag were confirmed.

UNVERIFIED: Whether the backend honours `colSpan` / `height` bounds. The engine clamps programmatic
heights to `200…900` (`bridge.ts:147`) and drag heights to `200…850` (`init.ts:240`), but the
client sends `height` straight through in `resizePanel` (`dashboard.ts:280-283`) with no client-side
clamp; server-side validation could not be read.

UNVERIFIED: Whether `/api/de/dashboards/generate/sessions` is routed before `/api/de/dashboards/:id`
server-side. The client emits both shapes (`dashboard.ts:190` vs `:465`) and any shadowing would be
a backend routing concern.

UNVERIFIED: What `status` values a `DashboardRunSummary` can actually take. The header maps
`completed / running / failed / cancelled / queued / pending` (`ResonaAIHeader.tsx:52-59`) and
`transcriptMapper` branches on `completed / running / failed` (`transcriptMapper.ts:246`, `:254`,
`:262`), but no `status` union is declared in the frontend types (`dashboard.ts:137`,
`dashboard.ts:150`).

UNVERIFIED: The exact set of tools the dashboard agent can call. `transcriptMapper` special-cases
`edit_panel`, `add_panel`, `remove_panel`, `save_dashboard` and matches `run_query` / any name
containing `query` (`transcriptMapper.ts:286`, `:288-290`); no allowlist for this endpoint exists
in the frontend.

UNVERIFIED: Whether the `mutate` phase (60 %, `useDashboard.ts:44`) is actually emitted by the
backend. It appears in `PHASE_PROGRESS` but not in the `GenerateProgress` chip list, so it is never
displayed.

UNVERIFIED: The default agent mode when the *backend* has no persisted preference.
`useSidePanelChat.ts:60` defaults the client to `'deep'`, and `useDashboard.ts:201` hard-codes
`agentMode: 'deep'`, but the server-side default is not visible from this repo.

UNVERIFIED: Whether `PanelData.columns[].dataTypeID` is populated in practice and whether any
server-side type-specific formatting depends on it. The engine never reads it
(`contract.ts:13` declares it; no reader exists).

UNVERIFIED: `Analytics` sidebar icon mapping intent. `getSectionIcon` falls back to `Layers` for
unmatched sections (`DashboardSidebar.tsx:110`), but which titles the backend actually emits is
unknown.