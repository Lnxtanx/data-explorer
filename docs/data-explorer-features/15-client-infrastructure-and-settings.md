---
title: Client Infrastructure, Storage & Settings
section: 15
area: infrastructure
sources: 67
status: rough
---

# 15. Client Infrastructure, Storage & Settings

## Component / File Map

| File | Lines | Role |
|---|---|---|
| `src/shared/storage/store.ts` | 212 | Versioned, self-healing `localStorage` store primitive (`createStore`) |
| `src/shared/storage/registry.ts` | 59 | Key→owner index (`registerKey` and friends) |
| `src/shared/storage/__tests__/store.test.ts` | 205 | Unit tests for both of the above |
| `src/shared/lib/format.ts` | 165 | Shared formatting primitives (time, filenames, numbers, money) |
| `src/shared/lib/queryRoots.ts` | 26 | Single source of the `'data-explorer'` query-key root |
| `src/shared/lib/__tests__/format.test.ts` | 163 | Tests for the format primitives |
| `src/lib/queryClient.ts` | 81 | The one `QueryClient` + `queryKeys` factory |
| `src/lib/persist.ts` | 143 | IndexedDB persister for the explorer query namespace |
| `src/lib/api/client.ts` | 276 | Shared HTTP transport, CSRF, `ApiError`, verb helpers |
| `src/lib/api/index.ts` | 25 | Transport barrel (`lib/` no longer re-exports features) |
| `src/lib/api/feedback.ts` | 27 | `/api/feedback` endpoints |
| `src/lib/logger.ts` | 26 | DEV-only console wrapper |
| `src/lib/utils.ts` | 61 | `cn()`, canvas text measurement, SQL type labels, tag stripping |
| `src/lib/view-mode.ts` | 15 | `ViewMode` union + two `localStorage` key constants |
| `src/lib/modes.ts` | 56 | `AgentMode` union + `MODE_META` |
| `src/main.tsx` | 17 | React root; conditional `GoogleOAuthProvider` |
| `src/App.tsx` | 80 | Provider tree, `DarkClassSync`, `CacheHydrationGate`, routes |
| `src/vite-env.d.ts` | 1 | `/// <reference types="vite/client" />` only |
| `src/components/settings/SettingsModal.tsx` | 93 | Modal shell + section switch |
| `src/components/settings/SettingsSidebar.tsx` | 67 | Section nav (8 entries) |
| `src/components/settings/types.ts` | 15 | `SettingsSection` union (9 members) |
| `src/components/settings/AppearanceSettings.tsx` | 206 | Theme picker + default launch mode |
| `src/components/settings/ShortcutsSettings.tsx` | 83 | Read-only shortcut reference table |
| `src/components/settings/MemorySettings.tsx` | 530 | AI Memory markdown editor (2 scopes) |
| `src/components/settings/DocumentationSettings.tsx` | 128 | Static links + product copy + footer |
| `src/components/settings/FeedbackSettings.tsx` | 220 | Feedback form + image attachments |
| `src/components/settings/ProfileSettings.tsx` | 263 | Account card, provider connections, sign-out |
| `src/components/ui/sonner.tsx` | 33 | Themed `Toaster` + `toast` re-export |
| `vite.config.ts` | 99 | Plugins, proxy, manual chunks, PWA |
| `vitest.config.ts` | 35 | App-layer test config (jsdom + setup + `@` alias) |
| `vitest.engine.config.ts` | 9 | Dashboard-engine test config |
| `eslint.config.js` | 326 | Flat config + architecture rules |
| `tsconfig.app.json` | 30 | The typecheck gate |
| `tsconfig.json` | 16 | Solution-style root (inert `compilerOptions`) |
| `package.json` | 100 | Scripts + dependencies |
| `postcss.config.js` | 6 | tailwindcss + autoprefixer |
| `bundle-baseline.json` | 140 | Recorded chunk/gzip baseline (36 chunks) |
| `index.html` | 394 | SEO shell, meta/JSON-LD, no theme bootstrap script |
| `scripts/check-bundle-size.mjs` | 166 | Bundle budget gate |
| `.env.example` | 11 | Variable names only (values not reproduced here) |

---

## 1. The Storage Layer

### 1.1 `createStore` — the single envelope format

`src/shared/storage/store.ts:108` exports `createStore<T>(options)`, returning `{ key, read, write, clear }` (`src/shared/storage/store.ts:65-70`).

**Backend.** There is no IndexedDB path here. `storage` defaults to `localStorage`, or `undefined` when `typeof localStorage === 'undefined'` (`src/shared/storage/store.ts:111`). IndexedDB is used only by `src/lib/persist.ts` (§3). A caller may pass any `Storage`-shaped object; the test suite passes a deliberately hostile one (`src/shared/storage/__tests__/store.test.ts:156-166`).

**Envelope.** `{ v: number, ts: number, data: T }` (`src/shared/storage/store.ts:28-34`). Written at `src/shared/storage/store.ts:195-197` as `JSON.stringify({ v: version, ts: Date.now(), data: value })`.

**Envelope detection does not key on `v`.** A parsed value is treated as an envelope only if it is a non-null object with **both** `data` and `ts` present (`src/shared/storage/store.ts:146-150`). The comment explains why: the pre-Phase-3 stores also wrote a top-level `v`, so detecting on `v` would classify legacy payloads as current envelopes whose `data` is `undefined` (`src/shared/storage/store.ts:139-145`).

**Namespacing.** There is none built in. `StoreOptions.key` is documented as "Full storage key, including any namespace prefix" (`src/shared/storage/store.ts:37-38`). Namespacing is the caller's responsibility; all three live stores hand-build prefixes (`src/components/data-explorer/storage/grid-storage.ts:21-22`, `src/components/data-explorer/storage/explorer-preferences.ts:19-20`, `src/components/ai/storage/chatDrafts.ts:18`).

**Serialization.** `JSON.stringify` / `JSON.parse`, nothing else. No structured clone, no compression, no encryption.

**Read order (all failure modes → discard + fallback).** `src/shared/storage/store.ts:99-192`:
1. `getItem` throws → fallback, no discard (`:126-128`).
2. `raw === null` → fallback (`:129`).
3. `JSON.parse` throws → `discard()` + fallback (`:132-137`).
4. Not an envelope → `migrate?.(parsed, 0)`; `undefined` ⇒ discard + fallback; else TTL-check the settled `ts` and return (`:152-164`).
5. `envelope.v !== version` → `migrate?.(parsed, Number(envelope.v))`, same TTL check (`:167-179`).
6. `ttlMs != null && typeof envelope.ts === 'number' && Date.now() - envelope.ts > ttlMs` → discard + fallback (`:181-184`).
7. `validate && !validate(envelope.data)` → discard + fallback (`:186-189`).
8. Otherwise `envelope.data ?? resolveFallback(...)` (`:191`).

`discard()` is a `try { storage?.removeItem(key) } catch {}` (`src/shared/storage/store.ts:114-120`), so a poisoned value is repaired rather than re-parsed on every render.

**Fallback factories.** `fallback` may be a value or a `() => T`; `resolveFallback` calls it when it is a function (`src/shared/storage/store.ts:96-97`), so object defaults are not shared across reads (`src/shared/storage/__tests__/store.test.ts:30-33`).

**TTL.** `ttlMs` is opt-in; omit it for no expiry (`src/shared/storage/store.ts:44-45`, asserted at `src/shared/storage/__tests__/store.test.ts:73-77`). The check is `Date.now() - ts > ttlMs`, i.e. strictly greater.

**Migration is the reason the primitive is deploy-safe.** `migrate(raw, fromVersion)` may return a bare value, `{ data, ts }`, or `undefined` (`src/shared/storage/store.ts:60`, `:72-77`). `settleMigration` (`src/shared/storage/store.ts:80-87`) normalises it: the object form preserves the original write time; a bare return is treated as written *now*, which the header explicitly calls out as TTL-granting (`src/shared/storage/store.ts:55-59`). A migrated value is **not** rewritten to disk — the next `write()` upgrades the format (`src/shared/storage/__tests__/store.test.ts:114-116`).

**`onWrite`.** Fired after a successful `setItem` and after `clear()`, never on read (`src/shared/storage/store.ts:198`, `:206`; asserted `src/shared/storage/__tests__/store.test.ts:147-154`).

**Error handling.** Every storage call is individually wrapped. `write` swallows quota-exceeded / storage-disabled errors entirely (`src/shared/storage/store.ts:196-201`); `clear` too (`:204-207`). Nothing is re-thrown and nothing is reported to `logger`.

**Side effect.** `createStore` adds its key to the module-level `liveKeys` set at construction time (`src/shared/storage/store.ts:209`, set declared at `:90`), exposed by `registeredStoreKeys()` (`:92-94`).

### 1.2 The three live `createStore` consumers

| Store | Key pattern | `version` | `ttlMs` | `validate` | `migrate` | Registered owner |
|---|---|---|---|---|---|---|
| Grid column widths | `sw-data-explorer-cols-{cid}-{schema}-{table}` | 1 | 30 days | `isColumnWidthCache` | legacy `{v,ts,cols}` → `{data,ts}` | `data-explorer` |
| Hidden columns | `sw-data-explorer-hidden-cols-{cid}-{schema}-{table}` | 1 | **none** | none | bare JSON array | `data-explorer` |
| Last viewed table | `sw-explorer-last-table` | 1 | 30 days | `isLastViewedTable` (or `null`) | legacy flat record | `data-explorer` |
| Page size | `sw-explorer-page-size` | 1 | **none** | `isAllowedPageSize` | bare decimal string | `data-explorer` |
| Chat draft | `sw_draft:chat:{id}` / `sw_draft:new:{cid}` | 1 | 7 days | `isStoredDraft` | legacy `{text,updatedAt}` or bare string | `ai-agent` |

Citations: `src/components/data-explorer/storage/grid-storage.ts:17-22` (constants), `:48-65` (width store), `:149-156` (hidden store), `src/components/data-explorer/storage/explorer-preferences.ts:17-20`, `:35-63`, `:87-103`, `src/components/ai/storage/chatDrafts.ts:18-21`, `:31-49`.

### 1.3 LRU / eviction — the index lives in the *consumers*, not the registry

`src/shared/storage/registry.ts` contains **no LRU index**. The header's claim at `src/shared/storage/registry.ts:14-16` that it "is populated by createStore() and by registerKey()" is only half true: `createStore` populates a *different* set (`liveKeys` in `store.ts:90`), and never calls `registerKey`. There are three independent eviction mechanisms:

1. **Grid column widths — `sw-grid-cache-index`.** A `string[]` LRU list, `MAX_TABLES_CACHED = 50` (`src/components/data-explorer/storage/grid-storage.ts:19`). `manageLRUCache` reads the index, moves the new key to the end, `shift()`s and `removeItem`s the oldest while `length > 50`, then rewrites the index (`src/components/data-explorer/storage/grid-storage.ts:124-147`). Corrupt index → `registry = []` (`:129-131`). All wrapped in `try/catch` with the comment "losing it only costs eviction accuracy" (`:144-146`). Called **before** the write (`:114-115`).
2. **Chat drafts — prefix sweep.** `MAX_STORED_DRAFTS = 30`, `MAX_DRAFT_AGE_MS = 7 days` (`src/components/ai/storage/chatDrafts.ts:20-21`). `pruneDrafts()` iterates every `sw_draft:` key, deletes anything whose `readUpdatedAt` returns 0 (unparseable or legacy-without-`updatedAt`, `:155-159`) or is older than the TTL (`:160-161`), sorts survivors by timestamp and drops the oldest excess (`:169-175`). `readUpdatedAt` accepts both the envelope `ts` and the legacy `updatedAt` (`:62-73`). Runs on every `saveDraft` (`:105`).
3. **AI dataset cache — sessionStorage.** `MAX_ENTRIES = 50`, `DEFAULT_TTL_MS = 30 min`, `MAX_ROWS_PER_ENTRY = 500` (`src/components/ai/hooks/useDatasetCache.ts:29-31`); on a `QuotaExceededError` it evicts the 5 oldest and retries once (`:57-66`, `:69-80`).

**Verdict: the registry owns no eviction and no ordering.** The header comment at `src/shared/storage/store.ts:23-25` claiming the `register` side-effect "is how clearAllClientData can wipe by prefix" is not what the code does — see §1.5.

### 1.4 Complete registry API surface

`src/shared/storage/registry.ts` exports exactly four functions over a single `Map<string,string>` (`owned`, `:19`):

| Function | Line | Behaviour | Live in production? |
|---|---|---|---|
| `registerKey(key, owner)` | `:22-24` | `owned.set(key, owner)` | **LIVE** — 5 call sites |
| `registeredKeys()` | `:27-29` | Returns the live `ReadonlyMap` (not a copy) | **DEAD** — tests only |
| `keysForOwner(owner)` | `:32-38` | Linear scan, exact `===` match on owner | **DEAD** — tests only |
| `clearRegistered(except = [])` | `:47-59` | Removes every registered key from `localStorage` except exact matches or prefix matches (any `except` entry ending in `:` is treated as a prefix, `:49`) | **DEAD** — tests only |

`registerKey` call sites:
- `src/components/data-explorer/storage/grid-storage.ts:106` (on every width save)
- `src/components/data-explorer/storage/grid-storage.ts:176` (on every hidden-column save)
- `src/components/data-explorer/storage/explorer-preferences.ts:65` (module load)
- `src/components/data-explorer/storage/explorer-preferences.ts:105` (module load)
- `src/components/ai/storage/chatDrafts.ts:98` (inside `saveDraft`)

### 1.5 Definitive verdict: which registry functions are live

**LIVE (1 of 4):** `registerKey(key, owner)`.

**DEAD (3 of 4):** `registeredKeys()`, `keysForOwner(owner)`, `clearRegistered(except)`. The only importer of any of the three is `src/shared/storage/__tests__/store.test.ts:10`, which uses all three at `:176`, `:180-183`, `:191`, `:201`. No application module imports them.

**Additionally dead:** `registeredStoreKeys()` in `src/shared/storage/store.ts:92-94`, and therefore the `liveKeys` set at `:90` it returns. `liveKeys.add(key)` at `:209` still executes on every `createStore` construction, so the set grows, but nothing reads it outside the test at `src/shared/storage/__tests__/store.test.ts:170`. `registerKey` calls are effectively write-only bookkeeping.

**The reason they are dead is a factual contradiction in the source.** `src/shared/storage/registry.ts:3-17` states the registry exists because `clearAllClientData()` "used to wipe EVERY localStorage key except a hardcoded `['theme']` allowlist… This registry … gives the sweep something better than a key allowlist to reason about." `src/components/auth/clearAllClientData.ts:23-28` repeats it and then says "The exhaustive sweep below is retained, because failing to clear something on logout is far worse than clearing something we did not need to." The actual sweep (`src/components/auth/clearAllClientData.ts:30-50`) iterates `localStorage.length` and removes every key not in `PRESERVED_LOCAL_STORAGE_KEYS = new Set(['theme'])` (`:12`). **`clearRegistered` is never called from `clearAllClientData`** — the registry is documentation, not mechanism. The registry also does not track the *majority* of keys (see the inventory in §2: 15+ keys are written directly via `localStorage.setItem` and never registered).

---

## 2. Authoritative Storage-Key Inventory

Every key literal reachable in `src/` (production code). "Registered" = passes through `registerKey`.

### 2.1 localStorage

| # | Key | Owner module | Purpose | Write | Read | Registered | Section |
|---|---|---|---|---|---|---|---|
| 1 | `theme` | `next-themes` via `src/App.tsx:56-61` | Active theme name; the **only** key preserved across logout | *(no `setItem('theme')` in `src/`)* | *(no `getItem('theme')` in `src/`)* | no | 15 |
| 2 | `sw-explorer-last-table` | `src/components/data-explorer/storage/explorer-preferences.ts:19` | Last viewed `{connectionId, schemaName, tableName}`; TTL 30 d (`:18`) | `:73` | `:78` | `data-explorer` (`:65`) | 03 |
| 3 | `sw-explorer-page-size` | `src/components/data-explorer/storage/explorer-preferences.ts:20` | Rows per page; whitelist `[100,250,500,1000,2000]`, default `500` (`:81-82`); no TTL | `:119` | `:111` | `data-explorer` (`:105`) | 03 |
| 4 | `sw-data-explorer-cols-{cid}-{schema}-{table}` | `src/components/data-explorer/storage/grid-storage.ts:21,34-36` | Per-column `{w,r}` geometry; TTL 30 d (`:18`) | `:115` | `:78` | `data-explorer` (`:106`) | 03 |
| 5 | `sw-data-explorer-hidden-cols-{cid}-{schema}-{table}` | `src/components/data-explorer/storage/grid-storage.ts:22,38-40` | Hidden-column `string[]`; **no TTL** | `:180` (`:178` removes when empty) | `:164` | `data-explorer` (`:176`) | 03 |
| 6 | `sw-grid-cache-index` | `src/components/data-explorer/storage/grid-storage.ts:20` | LRU index of key family #4, cap 50 (`:19`) | `:143` | `:126` | no | 03 |
| 7 | `sw_draft:chat:{chatId}` | `src/components/ai/storage/chatDrafts.ts:18,54-59` | Unsent chat input; TTL 7 d, LRU 30 (`:20-21`) | `:103` (`:100` removes) | `:81` | `ai-agent` (`:98`) | 07-09 |
| 8 | `sw_draft:new:{connectionId}` / `sw_draft:new:default` | `src/components/ai/storage/chatDrafts.ts:58` | Unsent draft for a not-yet-created chat | `:103` | `:81` | `ai-agent` (`:98`) | 07-09 |
| 9 | `sw-data-explorer:connection-id` | `src/pages/DataExplorerPage.tsx:53` | Active connection id | `:125` (`:127` removes) | `:59`; also `src/components/settings/MemorySettings.tsx:191` | no | 01 / 02 |
| 10 | `sw-data-explorer:default-view-mode` | `src/lib/view-mode.ts:3` | User's chosen default launch mode (`explorer\|ai\|dashboard`) | `src/components/settings/AppearanceSettings.tsx:40` | `AppearanceSettings.tsx:34`; `src/pages/DataExplorerPage.tsx:79` | no | 01 / 15 |
| 11 | `sw-data-explorer:view-mode` | `src/lib/view-mode.ts:4` | Last-used mode for this browser | `src/pages/DataExplorerPage.tsx:132` | `src/pages/DataExplorerPage.tsx:82` | no | 01 |
| 12 | `sw-data-explorer:is-ai-mode` | *(none)* | Legacy boolean `"true"` → `ai` mode | **never written** | `src/pages/DataExplorerPage.tsx:86` | no | 01 |
| 13 | `sw-data-explorer:dashboard-ai-panel-open` | `src/pages/DataExplorerPage.tsx:54` | Dashboard AI side panel open (`'true'`/`'false'`) | `:155`, `:164`, `:171` | `:68`, `:178` | no | 11 |
| 14 | `sw-data-explorer:active-chat-id` | `src/components/data-explorer/DataExplorerLayout.tsx:131` | Active Resona AI chat id | `:298` (removes `:300`,`:331`,`:347`) | `:172` | no | 07 |
| 15 | `sw-data-explorer:ai-active-view` | `src/components/data-explorer/DataExplorerLayout.tsx:132` | AI panel sub-view (`chat\|library\|projects\|artifacts\|project_detail`) | `:316` | `:161` | no | 07-09 |
| 16 | `sw-data-explorer:active-project-id` | `src/components/data-explorer/DataExplorerLayout.tsx:133` | Active AI project id | `:322`, `:348` (removes `:324`,`:332`) | `:178` | no | 07-09 |
| 17 | `sw-data-explorer:resona-ai-mode` | `src/components/dashboard/side-panel/useSidePanelChat.ts:59,79` | Agent mode (`flash`\|`deep`); default `'deep'` (`:57`,`:60`) | `:79` | `:59` | no | 11 / 14 |
| 18 | `sw-data-explorer:resona-ai-thinking` | `src/components/dashboard/side-panel/useSidePanelChat.ts:69,86` | Live thinking-steps toggle; default `true` (`:70`) | `:86` | `:69` | no | 11 |
| 19 | `sw-data-explorer:resona-ai-panel-width` | `src/components/dashboard/side-panel/useSidePanelResize.ts:11` | Side-panel pixel width; clamp `[340, 750]`, default `400` (`:8-10`) | `:52`, `:69` | `:17` | no | 11 |
| 20 | `sw-data-explorer:voice-orb-position` | `src/components/voice/orbs/orb-position.ts:18` | Floating orb `{x,y}`; orb 64 px, snap margin 16 px (`:11-12`) | `:50` | `:42` | no | 12 |
| 21 | `sw_device_id` | `src/components/auth/activity.ts:19` | Stable per-browser device id for engagement telemetry | `:38` | `:28` | no | 15 |
| 22 | `sw_sync_channel` | `src/components/auth/crossTab.ts:22` | Cross-tab broadcast channel; removed 100 ms after write (`:39-43`) | `:36` | **never via `getItem`** — `StorageEvent` only (`:51`) | no | 15 |
| 23 | `dismissed_notifications` | `src/components/notifications/NotificationBanner.tsx:25,47,48` | Array of dismissed notification ids; polled every 5 min (`:38`) | `:48` | `:25`, `:47` | no | 15 |
| 24 | `sw_active_team_id` | `src/components/collaboration/useTeamData.ts:25,47,49,77` | Selected team id | `:47` (removes `:49`) | `:25`, `:77` | no | 13 |
| 25 | `sw_pinned_{chatId}` | `src/components/ai/chat/hooks/usePinnedArtifacts.ts:29,42,55` | Pinned dashboard artifacts per chat | `:55` | `:29`, `:42` | no | 11 |
| 26 | `sw_google_drive_token_v3` | `src/components/export/api/google-sheets.ts:18` | Google Drive OAuth access token, **unscoped** fallback copy | `:73` | `:41` | no | 06 |
| 27 | `sw_google_drive_token_v3_{email}` | `src/components/export/api/google-sheets.ts:20-25` | Same token, per-user; 60 s expiry buffer (`:46`); default lifetime 3600 s (`:63`) | `:72` | `:39` | no | 06 |
| 28 | `sw_recent_google_sheets_v1` | `src/components/export/api/google-sheets.ts:180` | Last 10 sheet exports (`:202`) | `:203` | `:187` (removes `:215`) | no | 06 |
| 29 | `schema_weaver_user` | `src/components/auth/AuthProvider.tsx:297` | Legacy pre-cookie session blob, migrated to a cookie then deleted | **never written** | `:297` (removes `:307`, `:311`) | no | 15 |

### 2.2 sessionStorage

| # | Key | Owner module | Purpose | Write | Read | Section |
|---|---|---|---|---|---|---|
| 30 | `sw.pendingInvite` | `src/components/auth/inviteToken.ts:5` | `{t, k}` invite token surviving the OAuth redirect | `:14` | `:23` (removes `:37`) | 13 |
| 31 | `sw_ds_{base36-djb2}` | `src/components/ai/hooks/useDatasetCache.ts:28,42` | AI artifact dataset cache keyed by `djb2(sql::connectionId)`; TTL 30 min, ≤50 entries, ≤500 rows/entry (`:29-31`) | `:57`, `:62` | `:47`, `:152` (removes `:115`,`:158`,`:168`,`:195`) | 08-09 |
| 32 | `sw_durable_pending_run` | `src/components/ai/hooks/useAIAgent.ts:88` | In-flight durable AI run `{runId, eventIndex, request, at}` | `:174`, `:581` | `:159`, `:743` (removes `:147`) | 08 |
| 33 | `sw_google_drive_token_v1` | `src/components/export/api/google-sheets.ts:87` | Legacy token location, **remove-only** | **never written** | **never read** | 06 |
| 34 | `sw_google_drive_token_v2` | `src/components/export/api/google-sheets.ts:86` | Legacy token location, **remove-only** | **never written** | **never read** | 06 |

### 2.3 IndexedDB

| Store | Owner | Purpose | Citation |
|---|---|---|---|
| DB `sw-explorer-query-cache`, version `1`, object store `queries` | `src/lib/persist.ts:13-14,53-59` | Persisted React Query cache for the `data-explorer` namespace | see §3 |
| Key prefix `sw-explorer-query`, buster `v1`, maxAge 24 h | `src/lib/persist.ts:15-16,62-64` | Cache-busting and expiry | see §3 |

### 2.4 Read-only / write-only / delete-only classification

- **Read-only (read in current source, never written): 1 key** — `sw-data-explorer:is-ai-mode` (`src/pages/DataExplorerPage.tsx:86`). A legacy backward-compat branch (`:85`).
- **Read-and-delete only (read, then removed; never written): 1 key** — `schema_weaver_user` (`src/components/auth/AuthProvider.tsx:297`, `:307`, `:311`).
- **Write-only (written, never read via `getItem`): 1 key** — `sw_sync_channel` (`src/components/auth/crossTab.ts:36`); consumed only through the `storage` event (`:50-51`).
- **Delete-only (removed, never read, never written): 2 keys** — `sw_google_drive_token_v1` (`src/components/export/api/google-sheets.ts:87`), `sw_google_drive_token_v2` (`:86`).
- **No in-app writer or reader: 1 key** — `theme`. The name is asserted only by the logout allowlist (`src/components/auth/clearAllClientData.ts:12`); `ThemeProvider` is configured without a `storageKey` prop (`src/App.tsx:56-61`), so the key name comes from the `next-themes` default.
- **Registered vs unregistered:** 5 of 29 `localStorage` key families are registered (`sw-explorer-last-table`, `sw-explorer-page-size`, `sw-data-explorer-cols-*`, `sw-data-explorer-hidden-cols-*`, `sw_draft:*`). **24 are not.** No `sessionStorage` key is registered.

### 2.5 Logout sweep

`clearAllClientData()` (`src/components/auth/clearAllClientData.ts:120-130`) runs four steps in order: the `localStorage` sweep (`:121`), `sessionStorage.clear()` (`:122`), cookie deletion + `clearCsrfToken()` (`:123`), `clearAllDrafts()` (`:127`, explicitly noted as redundant with the blanket sweep at `:124-126`), then `clearSwCacheStorage()` (`:128`). It is called from `signOut()` (`src/components/auth/AuthProvider.tsx:213`) and from the cross-tab logout handler path (`src/components/auth/AuthProvider.tsx:327-329` region). Query-cache teardown happens separately and before it: `queryClient.clear()` (`src/components/auth/AuthProvider.tsx:201`) and `purgeExplorerCacheDb()` (`:205`).

---

## 3. Cache Persistence (`src/lib/persist.ts`)

### 3.1 Storage

IndexedDB via `idb`'s `openDB('sw-explorer-query-cache', 1)` with a single object store `queries` created in `upgrade` (`src/lib/persist.ts:13-14`, `:53-59`). The persister is given a hand-rolled `AsyncStorage` adapter (`src/lib/persist.ts:66-83`); `getItem` coerces non-strings to `undefined` (`:69`), `entries` zips `getAllKeys`/`getAll` (`:77-82`).

### 3.2 Configuration

| Setting | Value | Line |
|---|---|---|
| `buster` | `'v1'` | `:15`, `:62` |
| `maxAge` | `24 * 60 * 60 * 1000` = **86 400 000 ms (24 h)** | `:16`, `:63` |
| `prefix` | `'sw-explorer-query'` | `:64` |
| `refetchOnRestore` | `true` | `:65` |
| `filters.queryKey` | `[PERSISTED_ROOT]` | `:87-89` |

`PERSISTED_ROOT` is **derived**, not literal: `const PERSISTED_ROOT = DATA_EXPLORER_QUERY_ROOT` (`src/lib/persist.ts:32`), imported from `@/shared/lib/queryRoots` (`:11`), which is the single `export const DATA_EXPLORER_QUERY_ROOT = 'data-explorer'` (`src/shared/lib/queryRoots.ts:26`). The `dataExplorerKeys` factory reads the same constant (`src/components/data-explorer/api/hooks.ts:6`, `:21`). Two independent tests pin both ends: `src/__tests__/featureLayout.test.ts:152-186` and `src/lib/__tests__/persist.test.ts:54-58`, `:163-174`.

### 3.3 The allowlist / denylist

`shouldPersistQuery(queryKey)` is a **denylist of one segment** plus a root allowlist (`src/lib/persist.ts:47-51`):

```
Array.isArray(queryKey) && queryKey[0] === PERSISTED_ROOT && queryKey[1] !== 'rows'
```

**Persisted** (`:48-50`, asserted `src/lib/__tests__/persist.test.ts:31-36`): `dataExplorerKeys.schemas`, `.tables`, `.schema`, `.stats`.
**Excluded** — `rows` (unbounded; `:35-36`, `:38-40` in the test) and every other root (`['connections',…]`, `['connectors',…]`, `['dashboard',…]`, `['ai',…]`, `['payments',…]` — `src/lib/__tests__/persist.test.ts:42-47`, `:185-208`).

The coarse `filters.queryKey` is the only negation the library can express (`QueryFilters` has no `predicate`; `src/lib/persist.ts:84-89`). The fine predicate is therefore applied in a wrapper around `persisterFn`:

```
export const explorerQueryPersister = (queryFn, ctx, query) =>
  shouldPersistQuery(query.queryKey) ? innerPersister(queryFn, ctx, query)
                                      : Promise.resolve(queryFn(ctx));
```
(`src/lib/persist.ts:107-114`.) The header records the regression this fixes: `filters: { predicate }` was a silent no-op that matched **every** query, so unbounded row data and every other domain were being written to IndexedDB (`src/lib/persist.ts:38-46`).

The excluded branch returns the untouched `queryFn(ctx)` promise, so excluded queries neither persist nor restore (`src/lib/persist.ts:104-105`) — asserted by `src/lib/__tests__/persist.test.ts:176-183` and `:210-225`.

### 3.4 Hydration and the rehydration gate

- Wired as `defaultOptions.queries.persister` (`src/lib/queryClient.ts:17`) — **not** as a top-level `QueryClient({ persister })`, which react-query silently ignores (documented at `src/lib/__tests__/persist.test.ts:118-122`).
- `restoreExplorerCache(queryClient)` calls `restoreQueries(queryClient, { queryKey: [PERSISTED_ROOT] })` then `persisterGc()` (`src/lib/persist.ts:125-128`). The scope is deliberate: earlier buggy builds may have written other domains into the same DB, so the scoped restore acts as an opportunistic cleanup (`:118-123`).
- **The gate.** `CacheHydrationGate` in `src/App.tsx:26-46` holds `cacheReady=false`, calls `restoreExplorerCache(queryClient).finally(() => setCacheReady(true))` guarded by a `cancelled` flag (`:29-35`), and renders a full-screen spinner (`h-screen` flex-centred `w-5 h-5` spinner, `border-2 border-primary/30 border-t-primary animate-spin`) until ready (`:37-43`). It **wraps `QueryClientProvider`** (`src/App.tsx:54-55`), so the whole app tree is blocked on IndexedDB. There is no timeout and no error branch — `restoreExplorerCache` failing still flips `cacheReady` via `.finally`, so the gate cannot deadlock.

### 3.5 Purge

- `purgeExplorerCache()` → `explorerPersister.removeQueries()` (`src/lib/persist.ts:130-132`). Safe with no DB open (`src/lib/__tests__/persist.test.ts:239-241`).
- `purgeExplorerCacheDb()` → purge, then `db.close()` + `deleteDB(...)`, swallowing the "other tabs hold the DB open" case (`src/lib/persist.ts:134-143`). Called on logout (`src/components/auth/AuthProvider.tsx:205`) and on cross-tab logout (`:329`).

---

## 4. Query Client and Query-Key Roots

### 4.1 Defaults (`src/lib/queryClient.ts:9-23`)

| Option | Value | Line |
|---|---|---|
| `staleTime` | `60 * 1000` = **60 000 ms** | `:12` |
| `gcTime` | `5 * 60 * 1000` = **300 000 ms** | `:13` |
| `retry` (queries) | `2` | `:14` |
| `retryDelay` | `(attempt) => Math.min(1000 * 2 ** attempt, 10_000)` → 1 s, 2 s (capped 10 s) | `:15` |
| `refetchOnWindowFocus` | `false` — comment: "focus is not a data-change signal; prevents refetch storms on infinite lists" | `:16` |
| `persister` | `explorerQueryPersister` | `:17` |
| `retry` (mutations) | `1` | `:20` |

Per-query overrides exist in `data-explorer`: `useSchemas` uses `staleTime: 60_000` and `retryDelay` capped at **5 000 ms** (`src/components/data-explorer/api/hooks.ts:42-45`); `useTableList` uses `staleTime: 30_000`, same retry shape (`:58-61`). Both set `refetchOnReconnect: true`.

**There is no error handler.** No `QueryCache({ onError })`, no `MutationCache`, no `logger` import — `src/lib/queryClient.ts` imports only `QueryClient` and the persister (`:6-7`). Errors surface through per-hook handling only.

### 4.2 Complete root inventory

Ten roots exist. `DATA_EXPLORER_QUERY_ROOT = 'data-explorer'` (`src/shared/lib/queryRoots.ts:26`).

| Root | Factory | Location | Shapes |
|---|---|---|---|
| `data-explorer` | `dataExplorerKeys` | `src/components/data-explorer/api/hooks.ts:20-31` | `all`, `schemas(cid)`, `tables(cid,schema)`, `rows(cid,table)`, `stats(cid,table,schema)`, `schema(cid,table,schema)` |
| `connections` | `connectionKeys` | `src/components/connector/api/useConnections.ts` | `all`, `listRoot`, `list(userId)` — falls back to `'anonymous'` (`src/lib/__tests__/queryKeys.test.ts:131-141`) |
| `connectors` | `connectorKeys` | `src/components/connector/api/index.ts` | `all`, `list`, `detail(a1)`, `databases(a1)`, `logs()`, `logs(c1)`, `health()`, `health(c1,'7d')` (`src/lib/__tests__/queryKeys.test.ts:186-202`) |
| `dashboard` | `dashboardKeys` | `src/components/dashboard/api/dashboard.ts` | `all`, `detail(c1)`, `meta(d1)`, `sessions(c1)`, `sessionRoot`, `session(r1)` (`src/lib/__tests__/queryKeys.test.ts:84-105`) |
| `ai` | `aiQueryKeys` / `projectQueryKeys` / `chartQueryKeys` | `src/components/ai/hooks/useAIChats.ts`, `useProjects.ts`, `useCharts.ts` | `['ai','chats']`, `['ai','projects']`, `['ai','charts']` (`src/lib/__tests__/queryKeys.test.ts:108-127`) |
| `collaboration` | `queryKeys` (second factory, same name) | `src/components/collaboration/types.ts:1-9` | `teams`, `members(teamId)`, `invites(teamId)`, `projects`, `seats(teamId)`, `teamBilling(teamId)`, `agentShares(teamId)` |
| `user` | `queryKeys.user` | `src/lib/queryClient.ts:44-47` | `all`, `profile` |
| `payments` | `queryKeys.payments` | `src/lib/queryClient.ts:48-55` | `all`, `plans`, `subscription`, `usage`, `history(userId)`, `invoices` |
| `subscription` | `queryKeys.legacySubscription` | `src/lib/queryClient.ts:71` | `['subscription']` — **documented duplicate** |
| `ai-usage` | `queryKeys.aiUsage` | `src/lib/queryClient.ts:80` | `['ai-usage']` |

### 4.3 Documented duplicate

`queryKeys.legacySubscription = ['subscription']` (`src/lib/queryClient.ts:71`) and `queryKeys.payments.subscription = ['payments','subscription']` (`:51`) fetch **the same endpoint** `/api/payments/subscription` (`src/components/auth/hooks/useUserProfile.ts:30` and `src/components/billing/api/payments.ts:172`). `useUserProfile` keys its query on the bare literal (`:29`); `usePayments` keys the endpoint on the namespaced one. The header records the consequence: "the subscription is fetched and cached twice, under two keys, with no invalidation path keeping them in sync" (`src/lib/queryClient.ts:56-70`). It is still live — `useUserProfile.ts:29`, invalidated at `src/components/billing/hooks/usePayments.ts:80` and `src/components/billing/components/PlansSettings.tsx:302`.

A second, structural naming hazard: **two different modules both export a symbol named `queryKeys`** — `src/lib/queryClient.ts:43` (user/payments/ai-usage/subscription) and `src/components/collaboration/types.ts:1` (collaboration). Import sites disambiguate explicitly (`src/components/collaboration/useTeamData.ts:14` imports from `./types`; `src/components/ai/hooks/useAIUsage.ts:11` from `@/lib/queryClient`), but nothing prevents a wrong-path import.

### 4.4 A guard test that forbids inline keys

`src/lib/__tests__/queryKeys.test.ts:58-77` walks every non-test `.ts`/`.tsx` under `src/` and fails on any line matching `queryKey: ['…`, `invalidateQueries({ queryKey: ['…`, or `cancelQueries({ queryKey: ['…`. Zero offenders currently.

---

## 5. The HTTP Client (`src/lib/api/client.ts`)

### 5.1 Base URL

```
export const API_BASE_URL = import.meta.env.VITE_API_URL || '';   // :7
```
Empty string means "same origin, use the Vite dev proxy" (`:6`). Every entry point prefixes it: `:121`, `:136`, `:186`.

### 5.2 CSRF

| Function | Line | Behaviour |
|---|---|---|
| `getCsrfToken()` | `:18-28` | Reads the `_csrf` cookie with `/(?:^|;\s*)_csrf=([^;]*)/`, `decodeURIComponent`s it, caches it in the module variable `_csrfTokenInMemory` (`:16`). Falls back to the in-memory value (`:27`). |
| `clearCsrfToken()` | `:34-36` | Nulls `_csrfTokenInMemory`. Called by `clearAllClientData` (`src/components/auth/clearAllClientData.ts:80`). |
| `initCsrfToken()` | `:43-56` | Early-returns if a token already exists (`:44`). Otherwise `GET ${API_BASE_URL}/api/csrf-token` with `credentials:'include'` (`:46`), stores `data.csrfToken` in memory (`:49-51`). All errors swallowed (`:53-55`). |

Called exactly once, on `App` mount (`src/App.tsx:49-51`). There is **no 403-triggered refresh** and no periodic refresh; the token is refreshed only by a fresh `initCsrfToken()` after `clearCsrfToken()`.

### 5.3 Credentials and header policy

`buildRequestConfig` (`src/lib/api/client.ts:80-93`):
- `credentials: 'include'` is **unconditional** (`:86`) and is applied *after* the `...options` spread, so a caller cannot override it.
- `Content-Type: application/json` unless `options.body instanceof FormData` (`:82`, `:88`).
- `X-CSRF-Token` added only when a token exists (`:89`).
- `...options.headers` is spread **last** (`:90`), so caller headers win over both.

### 5.4 401 handling

`AUTH_ENDPOINTS` (`:73-78`): `/api/auth/session`, `/api/auth/google`, `/api/auth/github`, `/api/auth/logout`. `announceUnauthorized` (`:99-103`) skips those and otherwise dispatches `new Event('auth:unauthorized')` on `window`.

**Asymmetry:** `apiRequestFetch` (`:117-122`) is the lowest-level primitive and **does not call `announceUnauthorized`** — it only builds and awaits the fetch. So every caller using it is exempt from global sign-out, including all three `MemorySettings` calls (`:94`, `:301`, `:341`), the AI durable-run endpoints (`src/components/ai/hooks/useAgentStream.ts:129`, `useAIAgent.ts:542`, `:668`) and the activity telemetry (`src/components/auth/activity.ts:49`). `apiRequestRaw` and `apiRequest` do call it (`:140`, `:194`, `:205`).

### 5.5 Response variants

| Function | Line | Returns | Non-OK handling |
|---|---|---|---|
| `apiRequestFetch` | `:117-122` | `Response` | **none** |
| `apiRequestRaw` | `:132-160` | `Response` | JSON body → `ApiError` with parsed body (`:143-154`); else `ApiError` with `response.text()` (`:156`) |
| `apiRequestText` | `:163-168` | `string` | delegates to `apiRequestRaw` |
| `apiRequestBlob` | `:171-176` | `Blob` | delegates to `apiRequestRaw` |
| `apiRequest<T>` | `:182-210` | `T` (JSON) | **Non-JSON success → `{} as T`**, documented as a limitation (`:197-199`). Non-JSON failure → `ApiError(status, text)` (`:193-196`). JSON failure → `ApiError(status, data.message \|\| data.error \|\| 'Request failed', data)` (`:206`). |

### 5.6 `ApiError` (`:216-249`)

Constructor extracts `status`, `data`, `limitReached`, `code` (`payload.code ?? payload.error`) and `hint` (`payload.hint ?? payload.details?.hint`) (`:223-232`). Getters: `isUnauthorized` = 401, `isForbidden` = 403, `isRateLimited` = 429, `isServerError` = `status >= 500` (`:234-248`).

### 5.7 Timeout, abort, retry

**None.** There is no `AbortController`, no `AbortSignal.timeout`, no `signal` plumbing and no retry loop anywhere in `src/lib/api/client.ts`. Timeout and retry are not the transport's concern: retry lives in React Query (`src/lib/queryClient.ts:14-15`). Any caller needing cancellation must supply its own `signal` via `RequestInit`.

### 5.8 Verb helpers (`:255-275`)

`get` → `{ method:'GET' }`; `post`/`patch` → `JSON.stringify(body)` unless the body is `FormData` (`:262`, `:270`); `del` → `{ method:'DELETE' }`.

### 5.9 Barrel (`src/lib/api/index.ts`)

Re-exports only `API_BASE_URL`, `ApiError`, `apiRequest`, `get`, `post`, `patch`, `del` (`:14-22`) plus `export * from './feedback'` (`:24`). The domain re-exports (auth/ai/projects) were removed in Phase 4 because a `lib/` barrel must not reach into `components/` (`:4-11`). Consumers import `apiRequestFetch`/`apiRequestRaw`/`API_BASE_URL` directly from `@/lib/api/client` (e.g. `src/components/settings/MemorySettings.tsx:38`).

### 5.10 Endpoint-prefix table

**Prefixes are not centralised.** Every endpoint is an inline literal at its call site; `client.ts` has no prefix table (only the 4-entry `AUTH_ENDPOINTS` exemption list, `:73-78`). The distinct top-level prefixes actually present in `src/`:

| Prefix | Example endpoints | Cited owner |
|---|---|---|
| `/api/csrf-token` | CSRF bootstrap | `src/lib/api/client.ts:46` |
| `/api/auth/*` | `/session`, `/google`, `/github`, `/logout`, `/me`, `/refresh` | `src/lib/api/client.ts:74-77`; `src/components/auth/api/index.ts:87,94,101,109,124,145` |
| `/api/activity/*` | `/event`, `/heartbeat` | `src/components/auth/activity.ts:67,83` |
| `/api/ai/*` | `/chat`, `/runs`, `/runs/:id/stream`, `/runs/:id/cancel`, `/runs/:id/resume`, `/chats`, `/chats/:id/messages`, `/query/run`, `/queries/save`, `/artifacts`, `/charts*`, `/projects*`, `/health`, `/files/upload`, `/memory/document`, `/memory/document/recompile`, `/usage`, `/models`, `/exports/download-url` | `src/components/ai/api/index.ts:206-369`; `src/components/ai/api/charts.ts:54-97`; `src/components/ai/api/projects.ts:55-91`; `src/components/ai/hooks/useAgentStream.ts:129,226`; `src/components/ai/hooks/useAIAgent.ts:542,668`; `src/components/settings/MemorySettings.tsx:94,301,341` |
| `/api/data/*` | `/{cid}/schemas`, `/{cid}/tables`, `/{cid}/tables/{t}/rows\|stats\|schema\|export`, `/{cid}/export-all*` | `src/components/data-explorer/api/api.ts:50-248` |
| `/api/de/*` | `/dashboards`, `/dashboards/:id`, `/meta`, `/refresh`, `/panels/*`, `/generate`, `/generate/sessions*` | `src/components/dashboard/api/dashboard.ts:180-481` |
| `/api/agent/*` | `/status`, `/register/token`, `/revoke/:id`, `/:id`, `/:id/databases`, `/events`, `/health` | `src/components/connector/api/crud.ts:20-84` |
| `/api/teams/*`, `/api/files/projects/*` | teams, members, invites, seats, billing, shares; invite-info fallback | `src/components/collaboration/api/collaboration.ts:70-285` |
| `/api/payments/*` | `/plans`, `/subscription`, `/create-order`, `/renew`, `/verify`, `/cancel`, `/reactivate`, `/history/:uid`, `/invoices`, `/invoices/:id/html`, `/usage`, `/status/:pid`, `/attempts/:id/retry` | `src/components/billing/api/payments.ts:168-224` |
| `/api/workspace/*` | `/`, `/:id`, `/download/:id` | `src/components/ai/artifacts/WorkspacePanel.tsx:80,98,120` |
| `/api/notifications` | single active-notification fetch | `src/components/notifications/NotificationBanner.tsx:23` |
| `/api/feedback`, `/api/feedback/my` | POST submit, GET own | `src/lib/api/feedback.ts:19,26` |
| `/api/voice/session` | WebSocket upgrade (not HTTP) | `src/components/voice/voice-socket-client.ts:51` |

**Deliberate bypasses of the shared client** (raw `fetch`):
- `/ai-api/ai/*` — the AI backend's second base path, proxied in dev at `vite.config.ts:73-77`. Used at `src/components/ai/artifacts/views/FilePreviewView.tsx:101,104,110,410`, `src/components/ai/artifacts/views/FileView.tsx:154`, `src/components/ai/chat/utils/fileValidation.ts:59-60`, `src/pages/PublicReportViewer.tsx:69`. The header at `src/lib/api/client.ts:65` names this as "one hit a second, undocumented base path".
- `googleapis.com` — no session cookie, no CSRF, no 401 semantics (`src/components/export/api/google-sheets.ts:8-11`).
- Public report share endpoint (`src/pages/PublicReportViewer.tsx:55`).

### 5.11 Feedback API (`src/lib/api/feedback.ts`)

- `submitFeedback(data: FeedbackSubmission | FormData)` → `POST /api/feedback` (`:18-20`). Live: `src/components/settings/FeedbackSettings.tsx:93`.
- `getMyFeedback()` → `GET /api/feedback/my` (`:25-27`). **No caller anywhere in `src/` — dead.**
- `FeedbackSubmission.attachments?: string[]` (`:6`) is declared but never populated; the component sends `images` as repeated `FormData` parts instead (`src/components/settings/FeedbackSettings.tsx:88`).

---

## 6. Settings

### 6.1 Section list — declared vs reachable

`SettingsSection` is a 9-member union (`src/components/settings/types.ts:6-15`): `profile | usage | plans | memory | appearance | shortcuts | collaboration | documentation | feedback`.

`SettingsSidebar` renders **8** entries (`src/components/settings/SettingsSidebar.tsx:19-28`), in this order: Profile (`User`), AI Memory (`NotebookPen`), AI Usage (`BarChart3`), Plans & Billing (`CreditCard`), Collaboration (`Users`), Appearance (`Palette`), Documentation (`BookOpen`), Feedback (`MessageSquare`). Footer reads `Data Explorer v1.0` (`:62`).

`SettingsModal.renderContent()` handles all 9 (`:47-70`), with `default:` falling back to `ProfileSettings` (`:67-68`). Container is `max-w-4xl h-[90vh] max-h-[600px]` (`:74`), with a `VisuallyHidden` `DialogTitle` (`:75-77`) and the section body inside a `ScrollArea` (`:86`).

| Section | Sidebar | `initialSection` settable from `DataExplorerPage`? | Component |
|---|---|---|---|
| `profile` | yes | yes (`:328`, `:380`, `:440`) | `src/components/settings/ProfileSettings.tsx` |
| `memory` | yes | **no** (type at `src/pages/DataExplorerPage.tsx:62` omits it) | `src/components/settings/MemorySettings.tsx` |
| `usage` | yes | no (default only) | `../billing/components/UsageSettings` (`SettingsModal.tsx:52`) |
| `plans` | yes | yes (`:267`, `:384`) | `../billing/components/PlansSettings` (`:54`) |
| `collaboration` | yes | type allows it, never set | `src/components/settings/CollaborationSettings.tsx` (`:64`) |
| `appearance` | yes | type allows it, never set | `src/components/settings/AppearanceSettings.tsx` (`:58`) |
| `documentation` | yes | type allows it, never set | `src/components/settings/DocumentationSettings.tsx` (`:62`) |
| `feedback` | yes | **no** (type omits it) | `src/components/settings/FeedbackSettings.tsx` (`:66`) |
| `shortcuts` | **NO** | **NO** — never set | `src/components/settings/ShortcutsSettings.tsx` (`:60`) |

**`shortcuts` is unreachable dead UI.** It is absent from `SECTIONS` (`SettingsSidebar.tsx:19-28`) and `setSettingsSection` is only ever called with `'profile'` or `'plans'` (`src/pages/DataExplorerPage.tsx:267,328,380,384,440`). The `ShortcutsSettings` component, the `KEYBOARD_SHORTCUTS` table, and the `case 'shortcuts'` branch (`SettingsModal.tsx:59-60`) are all unreachable.

`DataExplorerPage.tsx:62` also types `settingsSection` as a **narrower 7-member union** than `SettingsSection`, omitting `memory` and `feedback` — those two are reachable only by clicking the sidebar after the modal opens.

### 6.2 What each section persists

| Section | Persists | Where |
|---|---|---|
| Profile | nothing client-side; reads `useUserProfile()` (`ProfileSettings.tsx:47`) and calls `signOut` (`:249`) | server / cookie |
| AI Memory | `MEMORY.md` / `USER_PROFILE.md` documents | server, via `PUT /api/ai/memory/document` (`MemorySettings.tsx:301`) |
| AI Usage | nothing | server |
| Plans & Billing | nothing client-side | server (Razorpay) |
| Collaboration | `sw_active_team_id` | `src/components/collaboration/useTeamData.ts:47` |
| Appearance | theme name + `sw-data-explorer:default-view-mode` | `next-themes` `theme` key; `AppearanceSettings.tsx:40` |
| Documentation | nothing | static links |
| Feedback | nothing (in-memory `images[]`/`content`) | `POST /api/feedback` |
| Shortcuts | nothing (read-only reference) | — |

### 6.3 `ProfileSettings` details

Renders a sign-in gate when `!user && !isLoggingIn` with Google/GitHub buttons (`:51-85`), a skeleton while `isLoading || isLoggingIn` (`:87-99`), then the account card. Display name is sanitised with `/[^\w\s\-.À-ſ]/gu` and falls back to `'User'` (`:101-104`). `githubUsername`/`auth_provider === 'github'`/`app_metadata.provider === 'github'` determine the GitHub badge (`:109-110`). Initials = first char of up to 2 name parts, uppercased, else `'U'` (`:112-118`). `PLAN_LABELS` maps `free|starter|pro_monthly|power_monthly` → `Free|Starter|Pro|Power`, with a capitalised first-segment fallback (`:128-135`). `createdAt` falls back to `'Joined recently'` (`:126`). Props `onNavigate` (`:20`) is declared but never destructured (`:46`).

### 6.4 `MemorySettings.tsx` — the notable AI surface

**What "memory" means.** A persistent markdown document injected into agent context (`MemorySettings.tsx:4-6`), in one of two scopes (`type MemoryScope = 'database' | 'global_user'`, `:41`):

| Scope | UI label | Backend document name | Cache key |
|---|---|---|---|
| `database` | "Database" (`:434`) | `MEMORY.md` (`:494`) | `database:{connectionId}` (`:60`) |
| `global_user` | "Profile" (`:447`) | `USER_PROFILE.md` (`:494`) | `global_user:account` (`:60`) |

**Wire shape** (`MemoryDocumentData`, `:46-57`): `id`, `scope`, `title`, `connector_id`, `database_name`, `connection_id`, `markdown_content`, `version`, `last_modified_by`, `updated_at`.

**Endpoints** (all via `apiRequestFetch`, so **no 401 sign-out event** — §5.4):
- `GET /api/ai/memory/document?scope=&connection_id=` (`:94-96`); non-`ok` → `throw new Error('memory document request failed ({status})')` (`:97`).
- `PUT /api/ai/memory/document` with `{scope, connection_id, connector_id, database_name, markdown_content, title, user_id}` (`:291-304`).
- `POST /api/ai/memory/document/recompile` with `{scope:'database', connection_id, user_id}` (`:335-344`). A `409` is surfaced distinctly: "Memory was changed elsewhere — reload and retry" (`:359-360`).

**Who can write it.** Both. The user edits the markdown in place and presses Save (`:404-416`); the agent recompiles it from the live schema via the Recompile button, which is gated on `scope === 'database'` (`:328`, `:502`) and behind a `confirm()` dialog: "Recompile memory from live database schema and dashboard? This will refresh metric formulas and table definitions." (`:329`). A recompile therefore **overwrites hand-written content**; the only protection is the 409 conflict branch. The Save toast states the blast radius: "Live for Data Explorer, Dashboard AI, and Voice Agent." (`:313`) — a single document is shared by all three AI surfaces.

**In-memory caches (module-level, not persisted).**
- `docCache = new Map<string, MemoryDocumentData>()` (`:70`) — last-known documents, painted before the network answers (`:244-248`). Cleared only by a new document.
- `inflight = new Map<string, Promise<…>>()` (`:73`) — de-duplicates concurrent GETs per key (`:85-86`, `:103`).

**Revalidation guard.** The fetch effect (`:229-283`) skips clobbering an unsaved buffer: it reads `isDirty` through `isDirtyRef` (`:226-227`, `:261`) so typing never re-fires the effect (`:282`), and additionally skips when `cached.version === next.version && cached.markdown_content === next.markdown_content` (`:262-268`). A failed load toasts only when there was no cached copy (`:273`).

**Connection seeding.** Reads `localStorage.getItem('sw-data-explorer:connection-id')` at mount (`:191`, key declared `:44`) to avoid serialising behind `useConnections` (`:184-189`), then falls back to the first `is_online` connection or `connections[0]` (`:202-207`). Connections are shown as `{database || db_alias || name} · {agent_id}` with an online dot (`:463-479`).

**Editing UX.** `MemorySurface` (`:112-176`) renders markdown and swaps to a `Textarea` on click — no editor/preview toggle. Autofocus + caret-to-end on entering edit mode (`:124-130`). `Escape` exits edit mode (`:152-154`); clicking outside exits via `onBlur` + `relatedTarget` containment check (`:143-145`). `spellCheck={false}`, `min-h-[300px]`, `font-mono text-xs` (`:156-157`). Placeholder: `'# Write markdown rules, verified metric definitions, and domain caveats…'` (`:155`). Empty state: "Click to write memory in markdown." (`:169`).

**Other controls.** Discard (`X`) appears only while dirty (`:392-403`, `:378`). Copy uses `navigator.clipboard.writeText` with a 2 000 ms confirmation timer (`:372-376`). Token estimate is `Math.ceil(markdownText.length / 4)` (`:285`) — an approximation, not a tokenizer; rendered as `~{n} tokens` (`:496`). Save is disabled unless `isDirty && !isSaving && !isLoadingDoc` (`:407`).

**Load-bearing local `useConnections` claim.** The comment at `:186-188` states "`useConnections` polls every 4-8s". Verify against Section 02 before relying on it.

---

## 7. Appearance Settings

### 7.1 Theme list (5 themes)

`THEMES` (`src/components/settings/AppearanceSettings.tsx:22-28`), matching `ThemeProvider themes` (`src/App.tsx:60`) exactly:

| id | Label | Icon | Preview classes |
|---|---|---|---|
| `light` | Light | `Sun` | `bg-white border-slate-200` |
| `dark` | Dark | `Moon` | `bg-[#1e1e1e] border-[#404040]` |
| `dark-black` | Dark Black | `Moon` | `bg-[#09090b] border-[#262626]` |
| `blue-gray` | Blue Gray | `Monitor` | `bg-[#0f172a] border-[#1e293b]` |
| `system` | System | `Monitor` | `bg-gradient-to-r from-white to-[#1e1e1e] border-slate-400` |

Rendered as a 3-column grid (`:63`); active card gets `border-primary bg-primary/5` plus a `Check` badge (`:75`, `:89-93`).

### 7.2 Persistence and application

- `ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}` (`src/App.tsx:56-61`). `enableSystem={false}` means the `system` theme id is selectable but next-themes will not auto-resolve the OS preference for it at the provider level.
- No `storageKey` prop is passed, so the persisted key is the library default `theme` — the name the logout allowlist hardcodes (`src/components/auth/clearAllClientData.ts:12`).
- **`DarkClassSync`** (`src/App.tsx:14-24`) is required because `attribute="class"` only toggles a `theme`-named class for single themes. It toggles `dark` on `<html>` when `resolvedTheme` is `'dark'`, `'dark-black'`, or `'blue-gray'` (`:19-20`). The same three-value set is duplicated in two more places: `src/components/data-explorer/DataExplorerLayout.tsx:190` and `src/components/dashboard/DashboardView.tsx:67`, plus the engine contract (`src/dashboard-engine/contract.ts:10`, `src/dashboard-engine/theme.ts:11`).
- The theme is forwarded to the dashboard engine and reconciled as: `light | dark-black | blue-gray` pass through, anything else becomes `'dark'` (`src/components/data-explorer/DataExplorerLayout.tsx:188-193`).
- `sonner`'s `Toaster` reads `theme` from `useTheme()` in a `useLayoutEffect` and defaults to `"system"` (`src/components/ui/sonner.tsx:8-13`) — so the `'dark-black'` / `'blue-gray'` ids are **not** valid sonner themes and will not match sonner's built-in theme classes.
- `index.html` contains **no** pre-paint theme bootstrap script (the only `<script>` tags are the Razorpay CDN loader at `:6`, three JSON-LD blocks, and the module entry at `:392`), so a dark-theme user gets a light first paint before React mounts.

### 7.3 Second appearance option: default launch mode

Three cards — Data Explorer, Resona AI (`/resona.png` avatar, `:158`), Dashboard (`BarChart3`) — mapping to `ViewMode` (`src/lib/view-mode.ts:1`). Selection writes `localStorage.setItem(DEFAULT_VIEW_MODE_KEY, mode)` (`:40`), dispatches `CustomEvent(VIEW_MODE_CHANGED_EVENT, { detail: mode })` (`:41`, event name `'sw-default-mode-changed'` at `src/lib/view-mode.ts:5`), and toasts `Default mode set to ${VIEW_MODE_LABEL[mode]}` (`:42`; labels at `src/lib/view-mode.ts:7-11`).

It is **local-component state only** — `useState` initialised from `localStorage` (`:32-36`), with no listener for `VIEW_MODE_CHANGED_EVENT`. Changing the default in a second open Settings modal does not update the already-mounted instance. Resolution precedence at app start (`src/pages/DataExplorerPage.tsx:73-89`): `?view=` URL param → `sw-data-explorer:default-view-mode` → `sw-data-explorer:view-mode` → legacy `sw-data-explorer:is-ai-mode` → `'explorer'`.

---

## 8. Keyboard Shortcuts — declaration vs implementation

### 8.1 The declared registry (`src/components/settings/ShortcutsSettings.tsx:10-33`)

| Category | Action | Keys | Line | Real handler? |
|---|---|---|---|---|
| Navigation | Open Settings | `Ctrl` `,` | `:14` | **NO** |
| Navigation | Refresh Data | `Ctrl` `R` | `:15` | **NO** — browser default (hard reload) |
| Data Explorer | Filter Rows | `Ctrl` `F` | `:21` | **NO** — browser default (find) |
| Data Explorer | Export Data | `Ctrl` `E` | `:22` | **NO** |
| Data Explorer | Next Page | `→` | `:23` | **NO** |
| Data Explorer | Previous Page | `←` | `:24` | **NO** |
| Dashboard | Toggle Resona AI | `Ctrl` `J` | `:30` | **YES**, dashboard mode only |

**1 of 7 (14%) declared shortcuts are implemented.**

### 8.2 Cross-check evidence

A repository-wide scan for `ctrlKey|metaKey|shiftKey|altKey` in `src/**/*.ts{,x}` returns exactly four hits:

| Site | Modifier check | Effect |
|---|---|---|
| `src/pages/DataExplorerPage.tsx:190` | `(e.ctrlKey \|\| e.metaKey) && e.key.toLowerCase() === 'j'` | **the only modifier hotkey in the app** — and it calls `e.preventDefault()` and acts **only when `mode === 'dashboard'`** (`:191-194`) |
| `src/components/ai/chat/hooks/useChatInputState.ts:129` | `!e.shiftKey` | Enter-to-send in the chat input |
| `src/components/dashboard/side-panel/ResonaAIInput.tsx:114` | `!e.shiftKey` | Enter-to-send in the side-panel input |
| `src/components/voice/components/FloatingVoiceOrb.tsx:151` | `e.shiftKey ? 40 : 12` | arrow-nudge step for the focused orb |

`ArrowLeft`/`ArrowRight` exist in exactly two non-icon places, neither of them paging: cell-row navigation in `src/components/data-explorer/grid/CellInspectorModal.tsx:65-67`, and orb nudging in `src/components/voice/components/FloatingVoiceOrb.tsx:152-157`.

`Escape` handlers exist in `ImageLightbox.tsx:23`, `CellHoverPreview.tsx:30`, `TurnNavigator.tsx:87`, `MentionPicker.tsx:43`, `MemorySettings.tsx:153`, `dashboard-engine/bridge.ts:381`, `dashboard-engine/init.ts:457`. `Enter` handlers in `AIChatSidebar.tsx:437,621`, `GridFilterPopover.tsx:225`, `ConnectorWizard.tsx:289`, `ModeSelector.tsx:131`, `FloatingVoiceOrb.tsx:149`, `MentionPicker.tsx:37`.

**Conclusion.** `ShortcutsSettings` is a static `KEYBOARD_SHORTCUTS` array with no corresponding handler registry; 6 of its 7 entries document behaviour that does not exist. And per §6.1, the section that renders this table is itself unreachable.

---

## 9. Feedback and Documentation Settings

### 9.1 `FeedbackSettings.tsx`

- **Endpoint:** `POST /api/feedback` via `submitFeedback(formData)` (`src/components/settings/FeedbackSettings.tsx:93` → `src/lib/api/feedback.ts:19`).
- **Category select:** 5 fixed values — `bug` / `support` / `feature` / `ui` / `other`, labelled "Bug Report", "Help & Support Request", "Feature Request", "UI/UX Improvement", "General Feedback" (`:139-143`). Initial state `'bug'` (`:32`).
- **Description:** required `Textarea`, `min-h-[150px]`, submit disabled when blank (`:150-157`, `:203`).
- **Attachments:** `accept="image/*"`, `multiple` (`:186-193`). **Hard cap of 3** enforced twice — the `handleImageUpload` guard `if (images.length + files.length > 3)` toasts "Maximum 3 images allowed" (`:41-44`), and the add-tile is hidden at `images.length < 3` (`:175`) with a "Maximum 3 screenshots allowed." caption (`:194-197`). Previews use `URL.createObjectURL` (`:48`) and `URL.revokeObjectURL` on removal (`:58`). No file-size or dimension validation, no upload progress. Temp ids are `Math.random().toString(36).substring(7)` (`:49`).
- **Metadata sent on every submission** (`:76-83`): `userAgent`, `platform`, `screen` as `${width}x${height}`, `language`, and `url` = `window.location.href`. Note the full current URL is transmitted.
- **Payload shape:** `FormData` with `type`, `content`, `metadata` (JSON string), and one `images` part per file (`:71-90`). Because the body is `FormData`, `buildRequestConfig` omits `Content-Type` (`src/lib/api/client.ts:82`, `:88`) so the browser sets the multipart boundary.
- **Success state** replaces the form with a thank-you panel and a "Submit another report" button that resets `content`/`images` but **not** `isSubmitted` state for `type` (`:105-119`).
- **Header comment is stale:** "Implements real image uploads to Supabase Storage" (`:4`) and `// uploadFile removed - logic moved to backend` (`:22`) — the endpoint receives the files as multipart parts; there is no Supabase client in this component.

### 9.2 `DocumentationSettings.tsx`

Entirely static; no storage, no API. Two resource cards (`RESOURCES`, `:9-22`): General Documentation (`https://docs.schemaweaver.vivekmind.com`) and Data Explorer Guide (`…/data-explorer`). Footer link groups: Products (SQL Editor, Data Explorer), Resources (Documentation, Schema Weaver), Company (VivekMind, Contact) (`:87-109`), plus Privacy / Terms / Support and a remote logo image (`:111-123`). Version string `Data Explorer v1.0.0` (`:37`) — inconsistent with the sidebar's `Data Explorer v1.0` (`SettingsSidebar.tsx:62`) and with `package.json`'s `"version": "0.1.0"` (`package.json:4`).

---

## 10. Build & Tooling

### 10.1 Vite plugins (`vite.config.ts:15-45`)

1. `@vitejs/plugin-react-swc` (`vite.config.ts:2`, `:16`).
2. `VitePWA` from `vite-plugin-pwa` (`:4`, `:17`).

### 10.2 PWA configuration

| Setting | Value | Line |
|---|---|---|
| `registerType` | `'autoUpdate'` | `:18` |
| `devOptions.enabled` | `false` | `:19-21` |
| `workbox.maximumFileSizeToCacheInBytes` | `3 * 1024 * 1024` = **3 145 728** | `:23` |
| `manifest.name` | `'Data Explorer \| Schema Weaver'` | `:26` |
| `manifest.short_name` | `'Data Explorer'` | `:27` |
| `manifest.theme_color` | `'#0f172a'` | `:29` |
| Icons | `resona.png` at `192x192` and `512x512` (`purpose: 'any maskable'`) | `:30-42` |

No `useRegisterSW` / `virtual:pwa-register` import exists in `src/` (only a passing mention at `src/components/auth/clearAllClientData.ts:100`), so registration relies entirely on `registerType: 'autoUpdate'` + `injectRegister`. `index.html:18` matches `theme_color` with its own `<meta name="theme-color" content="#0f172a">`.

### 10.3 Env var handling

`loadEnv(mode, process.cwd(), '')` — **empty prefix**, so *all* env vars are loaded into the config closure, not just `VITE_`-prefixed ones (`vite.config.ts:9`). Only two are consumed, both in the dev server proxy:

| Name | Purpose | Line |
|---|---|---|
| `VITE_PROXY_TARGET` | `/api` dev proxy target, default `http://localhost:3000` | `vite.config.ts:69` |
| `VITE_AI_PROXY_TARGET` | `/ai-api` dev proxy target, default `http://localhost:8001` | `vite.config.ts:74` |
| `VITE_API_URL` | Production base URL; empty ⇒ same origin (`src/lib/api/client.ts:7`) | `src/lib/api/client.ts:7` |
| `VITE_GOOGLE_CLIENT_ID` | Gates `GoogleOAuthProvider`; absent ⇒ rendered without it (`src/main.tsx:7,10-16`) | `src/main.tsx:7` |
| `VITE_GITHUB_CLIENT_ID` | Declared in `.env.example` | `.env.example:10` |

No `envPrefix` override, so the default `VITE_` applies to `import.meta.env` exposure. `src/vite-env.d.ts` is a single `/// <reference types="vite/client" />` line — no `ImportMetaEnv` interface, so every `import.meta.env.X` access is untyped (`string | boolean | undefined`).

### 10.4 Dev server & proxy (`vite.config.ts:64-79`)

`host: true`, `port: 8000`. Proxies: `/api` → `env.VITE_PROXY_TARGET || 'http://localhost:3000'` with `changeOrigin: true` and `ws: true` (comment: "voice session WS (`/api/voice/session`) + agent data channel", `:71`); `/ai-api` → `env.VITE_AI_PROXY_TARGET || 'http://localhost:8001'` with `changeOrigin: true` and a `rewrite` stripping the `/ai-api` prefix (`:76`).

### 10.5 Alias, optimizeDeps

`resolve.alias` maps `@` → `./src` (`vite.config.ts:59-63`), mirrored in `tsconfig.app.json:24-27` and `vitest.config.ts:18-22`. `optimizeDeps.include` pre-bundles 9 packages: `react`, `react-dom`, `react-router-dom`, `@tanstack/react-query`, `lucide-react`, `clsx`, `tailwind-merge`, `sonner`, `next-themes` (`:46-58`).

### 10.6 Build target and chunking

- **`build.target` is not set.** TypeScript targets `ES2020` (`tsconfig.app.json:3`) with lib `["ES2020","DOM","DOM.Iterable"]` (`:5`), and `target` is also `ES2020` in `tsconfig.node.json` context. Vite 6.4.3 is installed. UNVERIFIED below.
- `build.chunkSizeWarningLimit: 650` (kB) (`vite.config.ts:81`).
- `rollupOptions.output.manualChunks(id)` (`vite.config.ts:84-94`) — nine named chunks:

| Chunk | Match | Line |
|---|---|---|
| `vendor-charts` | `/recharts/` \| `/d3-` \| `/victory-` | `:85` |
| `vendor-mermaid` | `/mermaid/` | `:86` |
| `vendor-reports` | `/jspdf` | `:87` |
| `vendor-katex` | `node_modules/katex/` | `:88` |
| `vendor-xlsx` | `node_modules/xlsx/` | `:89` |
| `vendor-motion` | `node_modules/framer-motion/` | `:90` |
| `vendor-react` | `node_modules/react-dom/` \| `node_modules/react/` \| `node_modules/react-router-dom/` | `:91` |
| `vendor-radix` | `node_modules/@radix-ui/` | `:92` |
| `vendor-query` | `node_modules/@tanstack/` | `:93` |

No `default` case — anything unmatched stays in the entry graph. Note the `vendor-katex` matcher requires the literal `node_modules/katex/` path, so a pnpm-style store path would fall through.

### 10.7 TypeScript strictness

`tsconfig.app.json` is the typecheck gate (`package.json:11`):

| Flag | Value | Line |
|---|---|---|
| `strict` | `true` | `:15` |
| `noImplicitReturns` | `true` | `:16` |
| `noImplicitOverride` | `true` | `:17` |
| `noFallthroughCasesInSwitch` | `true` | `:18` |
| `forceConsistentCasingInFileNames` | `true` | `:19` |
| `noUnusedLocals` | `true` | `:21` |
| `noUnusedParameters` | `true` | `:22` |
| `target` / `lib` | `ES2020` / `["ES2020","DOM","DOM.Iterable"]` | `:3`, `:5` |
| `module` / `moduleResolution` | `ESNext` / `bundler` | `:6`, `:8` |
| `allowImportingTsExtensions` | `true` | `:9` |
| `isolatedModules` | `true` | `:10` |
| `moduleDetection` | `force` | `:11` |
| `noEmit` | `true` | `:12` |
| `jsx` | `react-jsx` | `:13` |
| `skipLibCheck` | `true` | `:7` |
| `useDefineForClassFields` | `true` | `:4` |

**Contradiction:** the root `tsconfig.json` sets `noImplicitAny: false`, `noUnusedLocals: false`, `noUnusedParameters: false`, `strictNullChecks: false` (`tsconfig.json:9-14`) — but it is a solution-style file with `files: []` and only project `references` (`:2-3`), so those flags are inert for the app build. `eslint.config.js:147-151` justifies keeping `@typescript-eslint/no-unused-vars` at `warn` because "`noUnusedLocals` is off in tsconfig (82 pre-existing errors)" — that reasoning applies to the inert root config only. The real gate has `noUnusedLocals: true` and `tsc -p tsconfig.app.json --noEmit` currently exits 0.

### 10.8 ESLint (`eslint.config.js`)

Flat config (ESLint 9). Ignores `dist/**`, `node_modules/**`, `public/**`, `scripts/**`, `*.config.ts`, `*.config.js`, `tailwind.config.ts` (`:114-122`).

Correctness: `js.configs.recommended` (`:125`) plus `...tsPlugin.configs.recommended.rules` (`:139`). `no-undef: 'off'` with the rationale that `tsc` (TS2304) is the real gate (`:141-145`). `react-hooks/rules-of-hooks: 'error'`, `exhaustive-deps: 'warn'` (`:159-160`). `react-refresh/only-export-components: ['warn', { allowConstantExport: true }]` (`:163`). Hygiene: `no-empty: ['warn', { allowEmptyCatch: true }]`, `eqeqeq: ['warn','smart']`, `prefer-const: 'warn'` (`:166-168`). `no-explicit-any: 'warn'` (`:156`).

Architecture rules (all `error`):
- `src/lib/**`, `src/hooks/**` must not import `**/components/*` (`:177-191`) — deliberately **one config object**, because splitting it would let the next object override `no-restricted-imports` (`:172-176`).
- `src/lib/**` must not import `lucide-react | @radix-ui/* | framer-motion | recharts | sonner` (`:199-213`).
- `src/shared/**` must not import `@/features/*` or `@/app/*` (`:217-229`).
- `src/components/voice/{hooks,audio}/**` + `types.ts` + `voice-socket-client.ts` must not import the `../orbs` barrel — uses `paths` (exact match) not `patterns` (gitignore-style) (`:247-272`).
- `src/features/*/api/**` must not import feature components (`:275-287`) — **inert**, no `src/features/` exists.
- `src/dashboard-engine/**` must not import `@/*`, `react`, `react-dom`, or `../../`-and-deeper (`:299-315`).
- Test files: `react-refresh/only-export-components` and `no-explicit-any` off (`:318-324`).

The header claims "BASELINE: 0 `no-restricted-imports` violations (was 11)" (`eslint.config.js:18`). **Currently 1 violation exists** — see §11.4.

### 10.9 npm scripts (`package.json:6-19`)

| Script | Command |
|---|---|
| `dev` | `vite --host` |
| `build` | `npm run typecheck && vite build` |
| `build:engine` | `node scripts/build-dashboard-engine.mjs` |
| `preview` | `vite preview` |
| `typecheck` | `tsc -p tsconfig.app.json --noEmit` |
| `test` | `vitest run --config vitest.engine.config.ts` |
| `test:app` | `vitest run --config vitest.config.ts` |
| `test:all` | `npm run test:app && npm run test` |
| `lint` | `eslint .` |
| `check:bundle` | `node scripts/check-bundle-size.mjs` |
| `check:bundle:update` | `node scripts/check-bundle-size.mjs --update` |
| `verify` | `npm run typecheck && npm run lint && npm run test:all && npm run build && npm run check:bundle` |

Note `test` runs the **engine** config and `test:app` runs the app config — the names are inverted relative to intuition. `verify` currently fails at the `lint` step (§11.4).

### 10.10 Bundle budget gate

`scripts/check-bundle-size.mjs` compares `dist/assets/*.js` against `bundle-baseline.json`. `PER_CHUNK_TOLERANCE = 0.25` (+25% gzip per chunk), `TOTAL_TOLERANCE = 0.1` (+10% gzip total) (`scripts/check-bundle-size.mjs:29-31`). Content hashes are stripped with `/-[A-Za-z0-9_-]{8}\.js$/` (`:36`). A watch-list of 10 `React.lazy` boundary chunks warns if any disappears (`:135-151`). Recorded baseline: 36 chunks, 3 214 806 B raw / 950 743 B gzip (`bundle-baseline.json:2-5`).

---

## 11. Test Setup

### 11.1 Two configs

| | `vitest.config.ts` (app) | `vitest.engine.config.ts` (engine) |
|---|---|---|
| `environment` | `jsdom` (`:24`) | `jsdom` (`:5`) |
| `setupFiles` | `['./src/test/setup.ts']` (`:25`) | **none** |
| `include` | `src/**/__tests__/**/*.test.{ts,tsx}` + `src/**/*.test.{ts,tsx}` (`:26-29`) | `src/dashboard-engine/__tests__/**/*.test.ts` (`:6`) |
| `exclude` | `src/dashboard-engine/**`, `node_modules/**`, `dist/**` (`:32`) | (default) |
| `globals` | `false` (`:33`) | `false` (`:7`) |
| `resolve.alias` | `@` → `./src` (`:18-22`) | **none** |

The split is deliberate: "src/dashboard-engine is a standalone sandbox bundle that must not know about the host app" (`vitest.config.ts:4-8`), and the engine has "its own `declare const Chart` global that only the engine bundle provides" (`:30-31`).

### 11.2 Setup file (`src/test/setup.ts`)

Two documented workarounds, both from a Phase 0 audit:
1. Node ≥ 22 ships its own `localStorage` global (behind `--localstorage-file`); under Node 25 it shadows jsdom's with an object whose `clear` is `undefined`, killing every persistence test. The file constructs a real `JSDOM('', { url: 'http://localhost/' })` and `Object.defineProperty`-replaces both `localStorage` and `sessionStorage` on `globalThis` (`:28-37`).
2. jsdom has no IndexedDB, and `src/lib/persist.ts:53` calls `openDB()` **eagerly at module load** — so merely importing `persist.ts` (which `queryClient.ts:7` does) throws. `import 'fake-indexeddb/auto'` at `src/test/setup.ts:26` supplies a real in-memory implementation.

`fake-indexeddb@^6.2.5` and `jsdom@^29.1.1` are devDependencies (`package.json:91-92`).

### 11.3 Measured results (run locally, 2026-10-03)

| Config | Files | Tests | Outcome |
|---|---|---|---|
| `vitest.config.ts` | **13** | **214** | 13 passed / 214 passed, 59.00 s |
| `vitest.engine.config.ts` | 3 | 18 | **1 file FAILED to collect**, 18 passed, 6.80 s |

App-layer distribution: `persistence.test.ts` 25, `format.test.ts` 22, `store.test.ts` 22, `queryKeys.test.ts` 20, `storageMigration.test.ts` 18, `persist.test.ts` 16, `explorerErrorsAndFilters.test.ts` 19, `agentReducers.test.ts` 17, `toolSanitize.test.ts` 16, `orb-position.test.ts` 14, `sseChunks.test.ts` 10, `deltaBuffer.test.ts` 10, `featureLayout.test.ts` 5. Engine: `renderers.test.ts` 9, `geo-project.test.ts` 9, `section-spy.test.ts` 4.

### 11.4 HIGH-SEVERITY: the engine test suite and lint are both red

`src/dashboard-engine/init.ts:14` imports `@/lib/logger`. That single import breaks two gates:

1. **`npm run test` fails.** `vitest.engine.config.ts` defines no `resolve.alias`, so `@/lib/logger` cannot resolve: `Error: Failed to resolve import "@/lib/logger" from "src/dashboard-engine/init.ts". Does the file exist?` — 1 failed suite.
2. **`npm run lint` fails.** `eslint.config.js:302-313` bans `@/*` from `src/dashboard-engine/**` at `error`. Measured: **1 error, 325 warnings** across the repo. The error is exactly this import: `'@/lib/logger' import is restricted from being used by a pattern. dashboard-engine is a standalone sandbox bundle: it may only import from itself`.

Because `verify` runs `lint` and `test:all` (`package.json:18`), `npm run verify` fails. This directly contradicts `eslint.config.js:18` ("BASELINE: 0 `no-restricted-imports` violations (was 11)") and the engine config's own header claim that the boundary is enforced.

### 11.5 Notable testing patterns

- **Characterization tests as phase gates.** `queryKeys.test.ts:9-12` and `persistence.test.ts:3-14` both explain that the tests exist to make a *file move* provably behaviour-preserving. `featureLayout.test.ts:1-34` is an architecture guard with four properties: `src/hooks/` stays deleted, `src/lib/` matches an 11-entry allowlist (`:96-108`), every local import specifier resolves (`:124-147`, with `stripComments` at `:65-67` to avoid prose false-positives), and the `data-explorer` query root is single-sourced (`:151-186`).
- **Source-scanning tests.** Three tests read the filesystem rather than calling code: the no-inline-query-keys scan (`queryKeys.test.ts:58-77`), the no-hardcoded-root scan (`featureLayout.test.ts:169-185`, which explicitly exempts `registerKey(key, 'data-explorer')` at `:176` because the storage owner label is a different string from the query prefix — see `:163-168`), and the dead-import scan (`featureLayout.test.ts:125-146`).
- **Divergence-pinning tests.** `format.test.ts:1-7` exists specifically to keep `formatCount` (locale separators) and `formatCompactNumber` (`String(num)`) different, and `format.test.ts:124-133` asserts the divergence is load-bearing.
- **Migration fixtures.** `storageMigration.test.ts:12` states the legacy payloads are "byte-for-byte the shapes the previous implementations wrote"; the three legacy formats are `{v, connectionId, schemaName, tableName, ts}`, the bare string `'1000'`, and `{text, updatedAt}` / a bare JSON string.
- **Regression tests for a silent no-op.** `persist.test.ts:100-114` drives the persister through a **real `QueryClient`** rather than asserting on `explorerPersister` alone, precisely because the buggy object "was never filtered at all". A `flush()` helper yields 10 × 1 ms macrotasks (`:148-152`) with a validity argument at `:135-147`: `createQueryPersister` writes through `notifyManager.schedule` and does not await `storage.setItem`, so a too-short flush would make the exclusion tests pass vacuously. The first test is the control.
- **Hostile-object injection.** `store.test.ts:156-166` passes a `Storage` whose every method throws, asserting `read` falls back and `write`/`clear` do not throw.
- **No React component tests.** There is no `@testing-library/react` dependency (`package.json:78-99`); `src/components/voice/orbs/orb-position.ts:4-5` states the maths were extracted precisely because "the repo has no React component-test harness". `MemorySurface` behaviour (edit-on-click, `Escape`, blur-out) is therefore untested.

---

## 12. Logger

`src/lib/logger.ts` in full:

- **Gate:** `const enabled = import.meta.env.DEV` (`src/lib/logger.ts:8`) — a single boolean captured at module load.
- **Levels:** exactly five — `debug`, `info`, `log`, `warn`, `error` (`:11-25`), each a rest-args wrapper gated on `enabled`.
- **Sinks:** the `console` object only. There is no remote sink, no ring buffer, no `sessionStorage` mirror, no error reporter, and no level filtering (no `LOG_LEVEL` env var).
- **Production stripping:** `enabled` is `false` in a production build, so every method is a no-op. Additionally, `vite.config.ts:12-14` sets `esbuild.drop = ['console','debugger']` when `mode === 'production'`, which removes `console.*` calls and `debugger` statements at transform time. Combined, production console output from application code is eliminated twice over.
- **Consequence:** errors are neither logged nor transmitted in production. `clearAllClientData` reports its key counts through `logger.info` (`src/components/auth/clearAllClientData.ts:46`, `:61`, `:108`) and its failures through `logger.warn` (`:48`, `:63`, `:95`, `:112`) — all invisible in production.
- **Adoption:** `@/lib/logger` is imported by auth, settings, export, dashboard-side-panel, AI hooks, notifications and collaboration modules. `console.*` is otherwise not used directly in the modules read for this section.

---

## Dead / Unused Code

### Storage registry (Section 15 verdict)

| Symbol | Location | Status | Evidence |
|---|---|---|---|
| `registeredKeys()` | `src/shared/storage/registry.ts:27-29` | **DEAD** | Only importer is the test (`src/shared/storage/__tests__/store.test.ts:10,176,180-183,191,201`) |
| `keysForOwner(owner)` | `src/shared/storage/registry.ts:32-38` | **DEAD** | Same, `:182-183` |
| `clearRegistered(except)` | `src/shared/storage/registry.ts:47-59` | **DEAD** | Same, `:191`, `:201`; never called by `clearAllClientData` despite `src/shared/storage/registry.ts:3-5` and `src/components/auth/clearAllClientData.ts:23-28` both claiming it is |
| `registeredStoreKeys()` | `src/shared/storage/store.ts:92-94` | **DEAD** | Only importer is `src/shared/storage/__tests__/store.test.ts:170` |
| `liveKeys` set | `src/shared/storage/store.ts:90` | **DEAD (write-only)** | Written at `:209`, never read outside `registeredStoreKeys()` |
| `PRESERVED_LOCAL_STORAGE_KEYS` | `src/components/auth/clearAllClientData.ts:12` | LIVE | used at `:37` |

### Storage keys

| Key / family | Location | Status |
|---|---|---|
| `sw-data-explorer:is-ai-mode` | `src/pages/DataExplorerPage.tsx:86` | **READ-ONLY** — never written |
| `schema_weaver_user` | `src/components/auth/AuthProvider.tsx:297` | **READ-AND-DELETE-ONLY** — never written |
| `sw_sync_channel` | `src/components/auth/crossTab.ts:36` | **WRITE-ONLY** — consumed via `StorageEvent` only (`:51`) |
| `sw_google_drive_token_v1` | `src/components/export/api/google-sheets.ts:87` | **DELETE-ONLY** — never read, never written |
| `sw_google_drive_token_v2` | `src/components/export/api/google-sheets.ts:86` | **DELETE-ONLY** — never read, never written |
| `theme` | `src/App.tsx:56-61` | **NO in-app accessor** — only named by `src/components/auth/clearAllClientData.ts:12` |

### Query keys

| Symbol | Location | Status |
|---|---|---|
| `queryKeys.user.all` | `src/lib/queryClient.ts:45` | **DEAD in app code** — only `src/lib/__tests__/queryKeys.test.ts:217` |
| `queryKeys.payments.usage` | `src/lib/queryClient.ts:52` | **DEAD** — no consumer in `src/` |
| `queryKeys.legacySubscription` | `src/lib/queryClient.ts:71` | LIVE but a documented duplicate of `queryKeys.payments.subscription` (`:56-70`); the same endpoint is fetched twice (`src/components/auth/hooks/useUserProfile.ts:30` vs `src/components/billing/api/payments.ts:172`) |

### Components / functions

| Symbol | Location | Status |
|---|---|---|
| `ShortcutsSettings` + `KEYBOARD_SHORTCUTS` | `src/components/settings/ShortcutsSettings.tsx:10-33,35` | **UNREACHABLE** — absent from `SECTIONS` (`SettingsSidebar.tsx:19-28`) and `setSettingsSection` is never called with `'shortcuts'` (`src/pages/DataExplorerPage.tsx:267,328,380,384,440`) |
| `getMyFeedback()` | `src/lib/api/feedback.ts:25-27` | **DEAD** — no caller |
| `FeedbackSubmission.attachments` | `src/lib/api/feedback.ts:6` | **DEAD field** — never populated; the component sends `images` parts instead (`src/components/settings/FeedbackSettings.tsx:88`) |
| `ProfileSettings` prop `onNavigate` | `src/components/settings/ProfileSettings.tsx:20` | **DEAD prop** — declared in the interface, never destructured (`:46`) |
| `SettingsSidebar` prop `user` | `src/components/settings/SettingsSidebar.tsx:16` | **DEAD prop** — passed at `SettingsModal.tsx:83`, never destructured (`:30`) |
| `SettingsSection` members `'memory'`, `'feedback'` | `src/components/settings/types.ts:10,15` | **UNSETTABLE via `initialSection`** — `src/pages/DataExplorerPage.tsx:62` types the prop with a narrower 7-member union; reachable only via sidebar click |
| `VIEW_MODE_CHANGED_EVENT` dispatch | `src/components/settings/AppearanceSettings.tsx:41` | **NO LISTENER** — dispatched, but no `addEventListener` for `'sw-default-mode-changed'` exists in `src/`; the other component holding the same state (`AppearanceSettings.tsx:32-36`) never subscribes |
| `formatCount` vs `formatCompactNumber` | `src/shared/lib/format.ts:112,128` | BOTH LIVE, intentionally divergent (`src/shared/lib/format.ts:119-127`) — not dead, but a maintenance trap |
| ESLint `features/*` rules | `eslint.config.js:275-287` | **INERT** — no `src/features/` directory; self-documented as dead at `eslint.config.js:94-97` |

### Contradictions found

| Severity | Finding |
|---|---|
| **HIGH** | `src/dashboard-engine/init.ts:14` imports `@/lib/logger`, failing `npm run test` (1 suite, unresolvable alias) **and** `npm run lint` (1 error). `npm run verify` is therefore red. Contradicts `eslint.config.js:18` ("BASELINE: 0 violations") and `vitest.config.ts:4-8`. |
| **HIGH** | The storage registry's entire read/clear API is dead while three source comments (`src/shared/storage/registry.ts:3-5`, `:14-16`; `src/shared/storage/store.ts:23-25`; `src/components/auth/clearAllClientData.ts:23-28`) describe it as the active mechanism. 24 of 29 `localStorage` key families bypass it entirely. |
| **MEDIUM** | `ShortcutsSettings` documents 7 shortcuts; 6 have no handler, and the section itself is unreachable. The only real hotkey in the app is `Ctrl/Cmd+J`, and only in dashboard mode (`src/pages/DataExplorerPage.tsx:190-194`). |
| **MEDIUM** | `src/pages/DataExplorerPage.tsx:62` types `settingsSection` with a 7-member union that omits `'memory'` and `'feedback'` from `SettingsSection` (`types.ts:6-15`) — a widening that TS cannot catch because the narrowed state is only ever assigned to `SettingsModal`'s prop. |
| **MEDIUM** | `MemorySettings.handleRecompile` lets the agent overwrite user-authored markdown from the live schema (`:327-370`), gated only by a `confirm()` dialog and a `409` conflict branch; the Save toast (`:313`) states the document is shared by three AI surfaces. |
| **LOW** | `eslint.config.js:147-151` justifies a `warn`-level `no-unused-vars` by claiming `noUnusedLocals` is off "with 82 pre-existing errors". The real gate (`tsconfig.app.json:21`) has it **on** and `tsc` exits 0. The comment refers to the inert root `tsconfig.json:13`. |
| **LOW** | Version strings disagree: `SettingsSidebar.tsx:62` `v1.0`, `DocumentationSettings.tsx:37` `v1.0.0`, `package.json:4` `0.1.0`, `vite.config.ts:26-27` manifest name. |
| **LOW** | `src/components/ai/hooks/useDatasetCache.ts:4` documents the key as "SHA-256(sql + connectionId)"; the implementation is a djb2 hash (`:35-43`). Comment is wrong. |
| **LOW** | `FeedbackSettings.tsx:4` claims "real image uploads to Supabase Storage"; `:22` says the upload logic moved to the backend. The files go out as `FormData` parts to `POST /api/feedback` (`:88`, `:93`). |
| **LOW** | `dark` class toggling is duplicated in four places for the same 3-value set (`src/App.tsx:19`, `src/components/data-explorer/DataExplorerLayout.tsx:190`, `src/components/dashboard/DashboardView.tsx:67`, `src/dashboard-engine/theme.ts:11`). |
| **LOW** | No FOUC guard: `index.html` has no theme bootstrap script, so `defaultTheme="light"` (`src/App.tsx:58`) paints light before hydration for dark-theme users. |

---

## Open Questions

UNVERIFIED: What is Vite 6.4.3's effective `build.target`? `vite.config.ts:80-97` sets no `target`, and I did not confirm the installed default (`'baseline-widely-available'` vs `'modules'`) from the Vite source.

UNVERIFIED: Does `esbuild.drop: ['console','debugger']` (`vite.config.ts:12-14`) apply to bundled `node_modules` code, or only to files Vite runs through its esbuild transform (`.ts`/`.tsx`/`.js`/`.jsx` in `src/`)? The header at `src/lib/logger.ts:2-5` implies full silencing, but that claim is about `enabled`, not about the drop.

UNVERIFIED: Is there any CSRF token rotation path after `initCsrfToken()`? `src/lib/api/client.ts:43-56` runs once on mount (`src/App.tsx:49-51`) and `clearCsrfToken()` only fires on logout (`src/components/auth/clearAllClientData.ts:80`). I found no 403-triggered refresh, but I did not exhaustively read every mutation hook for a manual re-init.

UNVERIFIED: Is the IndexedDB database version bump strategy for `sw-explorer-query-cache` handled anywhere? `src/lib/persist.ts:53` hardcodes version `1` and `src/lib/persist.ts:38-45` documents busting via the `buster: 'v1'` string (`src/lib/persist.ts:15`), but I did not confirm whether a schema change would use an `upgrade` migration or a buster bump.

UNVERIFIED: What actually writes and reads the `theme` localStorage key? There is no `setItem('theme')` / `getItem('theme')` in `src/`; the name is inferred from `src/components/auth/clearAllClientData.ts:12` plus `ThemeProvider` being configured without a `storageKey` prop (`src/App.tsx:56-61`). The actual writer is inside the `next-themes` package.

UNVERIFIED: Do the `ai/` dashboards, exports or collaboration surfaces write any additional `localStorage` keys through a helper I did not read? My inventory is built from a full-repo scan of `localStorage.*` / `sessionStorage.*` call sites, but I read only ~15 of the ~40 files that matched, and any key produced by a computed template literal in an unread file would not appear. Template-literal keys found: `sw_pinned_${chatId}` (`src/components/ai/chat/hooks/usePinnedArtifacts.ts:29,42,55`), `sw_ds_…` (`src/components/ai/hooks/useDatasetCache.ts:42`), `sw_draft:…` (`src/components/ai/storage/chatDrafts.ts:56,58`), `sw-data-explorer-cols-…` / `-hidden-cols-…` (`src/components/data-explorer/storage/grid-storage.ts:35,39`), `sw_google_drive_token_v3_…` (`src/components/export/api/google-sheets.ts:22`).

UNVERIFIED: Whether the `"useConnections` polls every 4-8s`" claim in `src/components/settings/MemorySettings.tsx:186-188` is accurate — that is Section 02's hook and I did not read its `refetchInterval`.

UNVERIFIED: Whether `/api/ai/memory/document` (GET/PUT) and `/api/ai/memory/document/recompile` enforce any authorisation beyond the session cookie — no client-side code constrains who may write a `global_user` document, and the backend is out of scope for this repo.

UNVERIFIED: The exact behaviour of `src/components/settings/CollaborationSettings.tsx` beyond its first 45 lines (304 lines total) — it is Section 13's surface; I read only enough to confirm the section is wired at `src/components/settings/SettingsModal.tsx:64` and that it owns no storage key of its own.

UNVERIFIED: Whether the `sw-grid-cache-index` LRU list can desynchronise from reality — `manageLRUCache` evicts by `shift()` on a list that may contain keys already removed by a 30-day TTL (`src/components/data-explorer/storage/grid-storage.ts:18`, `:138-141`), so an entry can be removed twice or a live key can be evicted while an index slot is consumed by a dead one. I did not find a test covering index/desync.