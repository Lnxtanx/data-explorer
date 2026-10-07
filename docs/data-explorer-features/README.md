---
title: Data Explorer — Complete Feature Reference
section: 0
area: index
sources: 265
status: rough
generated: internal-codebase-analysis
---

# Data Explorer — Complete Feature Reference

Internal, code-derived reference for the **`sw-data-explorer`** frontend. Fifteen sections covering every feature surface in the app, written by reading the source — not from the published docs, and not from memory.

**Scope analysed:** `sw-data-explorer/src` — 265 TypeScript/TSX files, ~47,080 lines (tests excluded), React 18 + Vite + Tailwind + Radix/shadcn, TanStack Query, Recharts.

**Total:** 15 documents, **131,191 words**, **4,933 source citations** (99.6% mechanically verified in-bounds).

---

## How to read these docs

Every factual claim carries a `path/File.tsx:LINE` citation. If a statement has no citation, treat it as an interpretation, not a finding.

Three markers are used throughout:

| Marker | Meaning |
|---|---|
| `UNVERIFIED: <question>` | Could not be determined from the frontend. **Requires a backend answer.** 179 total. |
| `## Dead / Unused Code` | Exported, typed or rendered but never reached. 15 sections have one. |
| `## Security-Relevant Observations` | Mechanism described factually, neutrally. |

Citations into sibling repos (`C:\schema-weaver\backend`, `backend-ai`, `sw-agent`) and into `node_modules` (`@tanstack/*`) appear where behaviour depends on them.

---

## The three top-level modes

Defined in `src/lib/view-mode.ts:1`. These are the app's primary navigation axis.

| Mode | Label | Primary files |
|---|---|---|
| `explorer` | Data Explorer | `TableGrid.tsx`, `TableSidebar.tsx`, `ConnectionSelector.tsx` |
| `ai` | Resona AI | `AIChatMain.tsx`, `AIChatSidebar.tsx`, `chat/ChatInput.tsx` |
| `dashboard` | Dashboard | `DashboardView.tsx`, `dashboard-engine/` |

Mode resolution precedence on mount: URL `?view=` → `default-view-mode` key → session key → legacy `is-ai-mode` boolean → hardcoded `explorer` (`DataExplorerPage.tsx:73-89`). Mode is mirrored into the URL and broadcast over a `CustomEvent`.

**There is no `popstate` listener anywhere in `src/`** — browser back/forward changes the URL without changing the rendered mode.

---

## The three AI surfaces

Not the same axis as the modes. Voice is deliberately global.

| Surface | Where | Scope |
|---|---|---|
| **Dashboard AI** | Resizable side panel, `Ctrl+J`, dashboard mode only | Dashboard generation + panel chat |
| **Resona AI** | Full-screen chat, `ai` mode | Deep analysis, agentic tool loop |
| **Voice** | `FloatingVoiceOrb` portaled to `<body>` | Live conversational session |

`VoiceSessionProvider` is mounted **above** the view switch on purpose, so a live call survives mode changes (`DataExplorerPage.tsx:364-369`).

Separately, **two agent modes** — `flash` (DeepSeek V4 Flash, `2x`, ~29 credits) and `deep` (V4 Pro, `7x`, ~88 credits) — from `src/lib/modes.ts:41-55`.

---

## Section index

| # | Section | Words | Docs |
|---|---|---|---|
| 01 | [Application Shell, View Modes & Navigation](01-app-shell-and-view-modes.md) | 6,072 | [`01`](01-app-shell-and-view-modes.md) |
| 02 | [Connections & Connector Management](02-connections-and-connector.md) | 9,358 | [`02`](02-connections-and-connector.md) |
| 03 | [Data Grid Core](03-data-grid-core.md) | 7,860 | [`03`](03-data-grid-core.md) |
| 04 | [Filtering, Sorting & Column Visibility](04-filtering-sorting-columns.md) | 9,400 | [`04`](04-filtering-sorting-columns.md) |
| 05 | [Cell Interaction, Inspection & Column Statistics](05-cell-inspection-and-stats.md) | 6,386 | [`05`](05-cell-inspection-and-stats.md) |
| 06 | [Export System](06-export-system.md) | 8,766 | [`06`](06-export-system.md) |
| 07 | [Resona AI Chat Surface](07-resona-ai-chat-surface.md) | 8,456 | [`07`](07-resona-ai-chat-surface.md) |
| 08 | [Agent Runtime & Streaming](08-agent-runtime-and-streaming.md) | 10,118 | [`08`](08-agent-runtime-and-streaming.md) |
| 09 | [Artifact System](09-artifact-system.md) | 9,823 | [`09`](09-artifact-system.md) |
| 10 | [Reports, File Previews & Public Sharing](10-reports-and-public-sharing.md) | 10,083 | [`10`](10-reports-and-public-sharing.md) |
| 11 | [Dashboard & Dashboard AI](11-dashboard-and-dashboard-ai.md) | 10,596 | [`11`](11-dashboard-and-dashboard-ai.md) |
| 12 | [Voice Agent](12-voice-agent.md) | 7,873 | [`12`](12-voice-agent.md) |
| 13 | [Projects, Library & Team Collaboration](13-projects-and-collaboration.md) | 8,373 | [`13`](13-projects-and-collaboration.md) |
| 14 | [Billing, Credits & Agent Modes](14-billing-credits-and-modes.md) | 8,007 | [`14`](14-billing-credits-and-modes.md) |
| 15 | [Client Infrastructure, Storage & Settings](15-client-infrastructure-and-settings.md) | 10,020 | [`15`](15-client-infrastructure-and-settings.md) |

---

## Drift from the published docs

The public docs in `sw-docs/docs/05-data-explorer/` materially misdescribe the product. Verified divergences:

| Published claim | Reality | Ref |
|---|---|---|
| Export supports **CSV, JSON, NDJSON, Excel, SQL** | NDJSON **does not exist** — one dead type member, no UI, no icon. **Google Sheets** is new and undocumented | [`06`](06-export-system.md) |
| "Monaco editor" in Data Explorer | No query editor in the app; Monaco is the SQL Editor's | — (no basis in code) |
| "model selection" on the AI Chat Interface page | Model selection lives on `/resona-ai/models`; the chat page has no such section | [`07`](07-resona-ai-chat-surface.md) |
| "40+ specialized tools" | 38 documented; Data Explorer tool count is server-side | [`08`](08-agent-runtime-and-streaming.md) |
| ~16 named artifact / stat-block types | Most **do not exist**. Verified absent: boxplot, violin, histogram, waterfall, gauge, radar, combo, bubble, candlestick, sankey, treemap, correlation matrix, cohort, retention, seasonality, pareto, pivot, map/geo, insight | [`09`](09-artifact-system.md) |
| Filtering is **server-side** | **Both.** Three-valued `filterScope` switches paths, and they are not semantically equivalent (whitespace-only, `%`/`_` wildcards, unknown operators all diverge) | [`04`](04-filtering-sorting-columns.md) |
| "your row-level data never leaves your infrastructure" | Contradicted by the Data Explorer chat surface; the connector security doc describes query results traversing a transient cloud plane | [`07`](07-resona-ai-chat-surface.md), [`10`](10-reports-and-public-sharing.md) |
| Dashboard AI described as optional sidebar | It is a full third mode with its own agent and its own chart engine | [`11`](11-dashboard-and-dashboard-ai.md) |

---

## Cross-cutting findings

Highest-impact items, each detailed in its section.

### Correctness

- **`maxPages: 5` renumbers rows mid-scroll.** The grid drops the oldest page; row numbers derive from `virtualRow.index + 1`, so the `#` column restarts at 1 and cannot scroll back. No backward pagination exists (`prevCursor` has zero readers). [`03`](03-data-grid-core.md)
- **No request cancellation in the grid.** `fetchTableRows` accepts no `AbortSignal`, so React Query's `AbortController` never fires. Switching tables leaves the old request running. No mounted-ref or request-sequence guard. [`03`](03-data-grid-core.md)
- **Sidebar prefetch is a no-op.** Prefetch and grid query keys differ (`hashKey` drops `undefined`), so every hover-prefetch issues a request the grid discards. [`03`](03-data-grid-core.md)
- **Stale rows stay interactive.** The dimming overlay only engages for filters, so sort or page-size changes paint previous-order rows fully clickable. [`03`](03-data-grid-core.md)
- **Esc-to-stop is advertised but absent.** Both stop buttons declare `shortcut="Esc"`; abort is button-only. [`07`](07-resona-ai-chat-surface.md)
- **Enter submits during IME composition** — no `isComposing` guard. [`07`](07-resona-ai-chat-surface.md)
- **`NULL` cells render `NULL` but copy an empty string.** [`05`](05-cell-inspection-and-stats.md)
- **Boolean cells have no copy and no expand affordance** — the branch omits both. [`05`](05-cell-inspection-and-stats.md)
- **`Copied` is shown unconditionally** while the clipboard error is swallowed by an empty `catch`. [`05`](05-cell-inspection-and-stats.md)

### Dead feature paths

- **The Library has no producer.** `setSaveTarget` is only ever set to `null`; `POST /api/ai/charts/save` is never invoked, and the Library view is not navigable. [`09`](09-artifact-system.md), [`13`](13-projects-and-collaboration.md)
- **PNG export of chart artifacts is structurally unreachable.** [`09`](09-artifact-system.md)
- **Scatter renderer is non-functional** — axes read `x`/`y`, data supplies `{_label, value}`. [`09`](09-artifact-system.md)
- **Live Chart.js reflow during drag is dead** — reads a `window` global that is never assigned. [`11`](11-dashboard-and-dashboard-ai.md)
- **`table-export-portal` has no live consumer.** [`01`](01-app-shell-and-view-modes.md)
- **The storage registry's read/clear API is entirely dead** while four source comments describe it as active. [`15`](15-client-infrastructure-and-settings.md)
- **7 of 18 quota fields are dead (39%).** [`14`](14-billing-credits-and-modes.md)
- **`oscillation` and `circuit_breaker` have no producer** in the event dispatcher. [`08`](08-agent-runtime-and-streaming.md)

### Security (mechanisms described neutrally in-section)

- **Unsandboxed render of untrusted report HTML** — `window.open(blobUrl)` with no `sandbox` and no `noopener`; a `blob:` URL inherits the app origin. [`10`](10-reports-and-public-sharing.md)
- **Tool-parameter sanitisation inspects only top-level keys.** For 26 of 33 tools a non-allowlisted param key is rendered in full. `ALWAYS_STRIP` is exact and case-sensitive — `password`, `access_token`, `private_key` are absent. [`08`](08-agent-runtime-and-streaming.md)
- **Google OAuth access token in plaintext `localStorage`**, readable by any script on the origin. [`06`](06-export-system.md)
- **Connection Key renders in cleartext** — plain `<Input>`, no masking, no reveal toggle. [`02`](02-connections-and-connector.md)
- **Team authorisation is button-hiding only.** `canManage` is declared and passed but never destructured; ~22 team endpoints must self-authorise. [`13`](13-projects-and-collaboration.md)
- **Muted voice audio is still transmitted** as same-length silence; `user_name` travels in the WS query string. No client-side audio persistence. [`12`](12-voice-agent.md)

### Build health

`npm run lint` and `npm run test` are **both currently red**: `src/dashboard-engine/init.ts:14` imports `@/lib/logger`, which `vitest.engine.config.ts` does not alias and `eslint.config.js:302-313` bans. `npm run verify` therefore fails. [`15`](15-client-infrastructure-and-settings.md)

---

## Open questions requiring backend answers

179 `UNVERIFIED:` items are recorded in-section. The highest-leverage ones:

1. **Does the backend still implement an `ndjson` export branch?** The frontend type member survives but is unreachable.
2. **Is `sw_plans.allowed_modes` enforced server-side?** Fetched every 60s, read nowhere client-side; `Deep` is always clickable. Gate is server-only.
3. **What generates the HTML served by `/share/r/:shareId`?** The client generators only write local blobs.
4. **What emits `oscillation` / `circuit_breaker`?** No producer exists in the client.
5. **Are agent iteration / token / duration limits enforced anywhere?** No client constant exists; three quota fields are fetched and never read.
6. **Does the team-invite accept path verify the authenticated email matches the invitation?**
7. **Does the backend re-validate or re-limit the filter payload?** `sw-agent/src` has zero `filters` hits.
8. **Is audio retained server-side by `/api/voice/session`?**

---

## Maintenance notes

- Sections 02, 06 and 09 each carry their own `## Drift From Published Docs` section with the full list.
- Section 12 carries `## Prior Analysis Disagreements` against `VOICE_SESSION_ANALYSIS_2026-09-26.md` — 7 points where that document is contradicted by source. Source wins.
- `src/lib/modes.ts:1-25` documents a required 3-way sync with `backend-ai/.../config.py` and `MODEL_META_JS`. Nothing enforces it. Treat as a maintenance hazard.
- Numbers quoted in these docs (credit rates, row caps, timeouts, thresholds) were read from source at the cited line. Re-verify before quoting externally.