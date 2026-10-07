---
title: Billing, Credits & Agent Modes
section: 14
area: billing
sources: 34
status: rough
---

# 14. Billing, Credits & Agent Modes

Internal reference for the commercial surface of the Data Explorer: the two agent
modes, the AI credit quota model, plan gating, the credit displays, and the
Razorpay purchase flow.

Two facts frame everything below:

1. **No plan, price, credit limit, or model identifier is defined client-side.**
   Every number that matters commercially arrives over HTTP. This document
   therefore contains no prices and no limits, because none exist in this repo's
   source.
2. **`src/components/billing/**` is NOT empty.** The task brief stated the
   directories appeared to hold only subdirectories. That is true only of the
   top level of `components/billing/` itself, which contains exactly three
   subdirectories and no files (`api`, `components`, `hooks`). Recursively it
   holds **7 files totalling ~106 KB**, including the largest component in the
   settings tree (`PlansSettings.tsx`, 63,688 bytes / 1072 lines). Verified by
   recursive directory listing; see the file map.

## Component / File Map

| Path | Role |
|---|---|
| `src/lib/modes.ts` | Canonical `AgentMode` union + `MODE_META` display table (56 lines) |
| `src/lib/queryClient.ts` | Query-key factory incl. `payments.*`, `legacySubscription`, `aiUsage` (81 lines) |
| `src/lib/api/index.ts` | Transport-only barrel; no billing exports (25 lines) |
| `src/shared/lib/format.ts` | All money/compact/date formatters used by billing UI (165 lines) |
| `src/components/auth/api/index.ts` | `AIQuotaStatus` + `AIModelInfo` types, `getAIUsage()`, `getAIModels()` (147 lines) |
| `src/components/auth/hooks/useUserProfile.ts` | Profile + the legacy duplicate subscription fetch (53 lines) |
| `src/components/auth/AuthProvider.tsx` | Session lifecycle, activity-tracking start/stop (443 lines) |
| `src/components/auth/activity.ts` | 45 s heartbeat + sparse event tracker (115 lines) |
| `src/components/ai/hooks/useAIUsage.ts` | Quota poll + `getProactiveQuotaError` / `getQuotaWarning` (137 lines) |
| `src/components/ai/models/ModeSelector.tsx` | Flash/Deep + Thinking popover (156 lines) |
| `src/components/billing/api/payments.ts` | 13 typed billing endpoints + `Plan`/`Subscription`/`Invoice` shapes (226 lines) |
| `src/components/billing/api/razorpay.ts` | Razorpay modal opener + body `pointer-events` unlock (96 lines) |
| `src/components/billing/hooks/usePayments.ts` | 4 queries + 4 mutations + `invalidateBillingData()` (125 lines) |
| `src/components/billing/hooks/useCheckout.ts` | Order → checkout → verify orchestration (116 lines) |
| `src/components/billing/components/PlansSettings.tsx` | Plans & Billing section (1072 lines) |
| `src/components/billing/components/UsageSettings.tsx` | AI Usage section (381 lines) |
| `src/components/billing/components/PremiumAvatar.tsx` | Plan-tier avatar ring (90 lines) |
| `src/components/settings/SettingsModal.tsx` | Section switch incl. `usage` / `plans` (93 lines) |
| `src/components/settings/SettingsSidebar.tsx` | Section nav list (67 lines) |
| `src/components/settings/ProfileSettings.tsx` | Profile + plan badge (263 lines) |
| `src/components/settings/types.ts` | `SettingsSection` union (15 lines) |
| `src/pages/DataExplorerPage.tsx` | `?plan=` deep link, settings-section wiring (lines 62, 262-271, 379-386, 468-480) |
| Supporting (grep-verified) | `components/ai/AIChatMain.tsx`, `ai/chat/ChatInput.tsx`, `ai/chat/ChatMessage.tsx`, `ai/hooks/useAIAgent.ts`, `ai/hooks/useAgentStream.ts`, `ai/api/index.ts`, `ai/types.ts`, `ai/messages/AgentStatusBar.tsx`, `dashboard/side-panel/useSidePanelChat.ts`, `dashboard/side-panel/ResonaAIInput.tsx`, `components/collaboration/api/collaboration.ts`, `src/lib/__tests__/queryKeys.test.ts`, `index.html` |

---

## 1. Agent modes as a commercial concept

`src/lib/modes.ts:27` declares the canonical union:

```ts
export type AgentMode = 'flash' | 'deep';
```

`MODE_META` (`src/lib/modes.ts:41-56`) is the only client-side description of
what a mode costs. Four fields per mode:

| Field | `flash` | `deep` | Citation |
|---|---|---|---|
| `id` | `'flash'` | `'deep'` | `src/lib/modes.ts:43`, `:50` |
| `name` (display) | `Flash` | `Deep` | `src/lib/modes.ts:44`, `:51` |
| `primaryModel` | `DeepSeek V4 Flash` | `DeepSeek V4 Pro` | `src/lib/modes.ts:45`, `:52` |
| `rateTier` | `2x` | `7x` | `src/lib/modes.ts:46`, `:53` |
| `creditRate` | `~29 credits` | `~88 credits` | `src/lib/modes.ts:47`, `:54` |

These are the **only** model names and the **only** credit figures in the
client source. They are strings, not numbers — nothing computes against them.

### Where `MODE_META` is actually read

Exactly one consumer: `formatModes()` in
`src/components/billing/components/PlansSettings.tsx:98-102`, which maps
`Plan.allowed_modes` → display names for the current-plan card
(`PlansSettings.tsx:533`) and each plan card (`PlansSettings.tsx:820`).

`formatModes` **fails open**:

```ts
const list = modes?.length ? modes : ['flash', 'deep'];   // PlansSettings.tsx:99
```

If `allowed_modes` is `undefined` **or an empty array**, the UI renders
`Flash & Deep` — the maximum tier. A plan with zero permitted modes is displayed
as having both. The companion pluralisation at `PlansSettings.tsx:821`
(`(plan.allowed_modes?.length ?? 2) === 1 ? 'mode' : 'modes'`) has the same
default.

`rateTier`, `creditRate` and `primaryModel` have **no readers at all**. Verified:
`MODE_META` appears only at `src/lib/modes.ts:41` (definition),
`PlansSettings.tsx:72` (import) and `PlansSettings.tsx:100` (`.name` access).
So the model labels, the 2x/7x multipliers and the `~29`/`~88` credit figures
are dead data in the client — they are never shown to a user.

### Maintenance hazard: the four-way sync

`src/lib/modes.ts:6-9` states the coupling explicitly:

> Keep in sync with `backend-ai/src/agents/data_explorer/config.py`
> (`DATA_EXPLORER_MODES`) and the per-model credit rates in
> `backend-ai/src/usage` (mirrored in
> `backend/routes/ai/handlers/usage.js` `MODEL_META_JS`).

Documented coupling surface:

| Concern | Client location | Declared backend counterpart |
|---|---|---|
| Mode identity | `src/lib/modes.ts:27` | `backend-ai/.../config.py` `DATA_EXPLORER_MODES` (`src/lib/modes.ts:7`) |
| Model labels | `src/lib/modes.ts:45`, `:52` | per-model credit rates in `backend-ai/src/usage` (`src/lib/modes.ts:8`) |
| Credit rates | `src/lib/modes.ts:47`, `:54` | `backend/routes/ai/handlers/usage.js` `MODEL_META_JS` (`src/lib/modes.ts:9`) |
| Plan availability | `AIQuotaStatus.allowed_modes` (`src/components/auth/api/index.ts:64`) | `billing.sw_plans.allowed_modes` (`src/lib/modes.ts:4`) |

There is **no compile-time or runtime link** between any of these four. The
client copy is hand-maintained prose. Because the three credit-bearing fields
are unread, a drift between `creditRate` and the backend rate produces no visible
symptom — the stale string simply sits in the bundle. This is the single
highest-risk maintenance item in this section: the file that looks like the
source of truth for pricing is authoritative for nothing.

The `AgentMode` union itself was recently consolidated. `src/lib/modes.ts:15-19`
records that the union was previously written out four times (here, in
`ModeSelector.tsx`, and inline in `lib/api/ai/index.ts` and `lib/api/dashboard.ts`)
and now has one declaration, with `ModeSelector.tsx:10` re-exporting it so its
four importers are unchanged. That consolidation is sound; the pricing data
alongside it is not.

### Mode defaults (inconsistent by surface)

| Surface | Default mode | Default thinking | Citation |
|---|---|---|---|
| Resona AI full chat | `'flash'` | `false` | `src/components/ai/AIChatMain.tsx:74`, `:75` |
| Dashboard side panel (persisted) | `'deep'` (fallback when no stored value) | `true` | `src/components/dashboard/side-panel/useSidePanelChat.ts:56-63`, `:66-71` |
| Dashboard side panel input default prop | `'flash'` | — | `src/components/dashboard/side-panel/ResonaAIInput.tsx:90` |
| Dashboard agent calls | hardcoded `'deep'` | — | `src/components/dashboard/hooks/useDashboard.ts:201` |
| Plans card fallback | `['flash','deep']` | — | `src/components/billing/components/PlansSettings.tsx:99` |

Persistence keys: `sw-data-explorer:resona-ai-mode` and
`sw-data-explorer:resona-ai-thinking` (`useSidePanelChat.ts:59`, `:69`); only
values exactly `'flash'`/`'deep'` are accepted on read (`useSidePanelChat.ts:60`).

Selecting `deep` force-sets thinking `true`; selecting `flash` force-sets it
`false` (`src/components/ai/models/ModeSelector.tsx:39-46`). The Thinking toggle
is separately and manually overridable for both modes
(`ModeSelector.tsx:126-152`), so the force-set is a default, not a constraint.

On chat reload the mode is restored from the server record: `storedMode` of
`'flash'`/`'deep'` sets the mode and `storedMode === 'deep'` re-enables thinking
(`AIChatMain.tsx:400-409`). The wire field is `agent_mode`
(`src/components/ai/hooks/useAgentStream.ts:148`) and the request also carries a
camelCase duplicate `agentMode` (`useAgentStream.ts:149`), defaulting to `''`
when unset.

**Naming collision warning:** inside `AIChatMain.tsx`, `agentMode` is a *boolean*
meaning "the agent path is active" — `Boolean(connectionId)`
(`AIChatMain.tsx:82`) — while the actual `AgentMode` value is the separate
`mode` state (`AIChatMain.tsx:74`). The same shadowing appears in
`useChatSendOrchestrator.ts:25` and `ChatInput.tsx:145`. Do not assume
`agentMode === 'deep'` anywhere.

---

## 2. Quota / usage model

`AIQuotaStatus` is declared once, at `src/components/auth/api/index.ts:48-67`,
and re-exported as `AIUsageStatus` by `src/components/ai/hooks/useAIUsage.ts:13`.
Every field is non-optional except `allowed_modes`.

| # | Field | Type | Consumed by the UI? | Reader citations |
|---|---|---|---|---|
| 1 | `plan_id` | `string` | Yes | `UsageSettings.tsx:98` → `PLAN_META` lookup / `'free'` fallback |
| 2 | `is_lifetime_cap` | `boolean` | Yes | `useAIUsage.ts:70`, `:116` — suppresses the monthly error/warning |
| 3 | `credit_limit_monthly` | `number` | Yes | `useAIUsage.ts:70`, `:71`, `:116`, `:122`, `:128`; `UsageSettings.tsx:82`, `:84`, `:85`, `:316` |
| 4 | `credit_limit_daily` | `number` | Yes | `useAIUsage.ts:64`, `:66`, `:97`, `:98`, `:104`, `:110`; `UsageSettings.tsx:87`, `:89`, `:90`, `:344` |
| 5 | `credits_used_month` | `number` | Yes | `useAIUsage.ts:71`; `UsageSettings.tsx:83`, `:84`, `:85` |
| 6 | `credits_used_day` | `number` | Yes | `useAIUsage.ts:66`, `:98`; `UsageSettings.tsx:88`, `:89`, `:90` |
| 7 | `credits_used_week` | `number` | **No — dead** | declaration only, `src/components/auth/api/index.ts:55` |
| 8 | `credits_remaining` | `number` | Yes | `useAIUsage.ts:70`, `:71`, `:122`, `:128`; `UsageSettings.tsx:85` |
| 9 | `daily_remaining` | `number` | Yes (banner only) | `useAIUsage.ts:64`, `:104`, `:110` |
| 10 | `credits_balance` | `number` | **No — dead** | declaration only, `src/components/auth/api/index.ts:58` |
| 11 | `max_tokens_per_run` | `number` | **No — dead** | declaration only, `src/components/auth/api/index.ts:59` |
| 12 | `max_agent_duration_secs` | `number` | **No — dead** | declaration only, `src/components/auth/api/index.ts:60` |
| 13 | `concurrent_slots` | `number` | Yes | `UsageSettings.tsx:363` |
| 14 | `concurrent_limit` | `number` | Yes | `UsageSettings.tsx:363` |
| 15 | `allowed_models` | `string[]` | **No — dead** | declaration only, `src/components/auth/api/index.ts:63` |
| 16 | `allowed_modes` | `string[] \| undefined` | **No — dead** | declaration only, `src/components/auth/api/index.ts:64` |
| 17 | `monthly_pct` | `number` | Yes (banner only) | `useAIUsage.ts:117` |
| 18 | `weekly_reset_at` | `string` | **No — dead** | declaration only, `src/components/auth/api/index.ts:66` |

**Seven of eighteen fields (39%) are fetched every 60 s and never read.** Field
declaration sites were confirmed by repo-wide search: `credits_used_week`,
`credits_balance`, `max_tokens_per_run`, `max_agent_duration_secs`,
`weekly_reset_at` and `allowed_models` appear nowhere outside their type
declarations.

The three dead *limit* fields (11, 12 and, effectively, 15) are the expensive
ones: `max_tokens_per_run` and `max_agent_duration_secs` are plan entitlements
the UI never surfaces, so a user cannot see why a long agent run stopped.
`weekly_reset_at` is dead while the UI instead hardcodes a UTC-midnight daily
reset (`useAIUsage.ts:38-44`) — see §5.

### Parallel, looser shape

`UsageQuota` (`src/components/billing/api/payments.ts:127-140`) mirrors 9 of
these fields as all-optional, plus an index signature
(`[key: string]: unknown`, `payments.ts:128`), and is returned as an **array**
(`UsageResponse.quota: UsageQuota[]`, `payments.ts:144`). It belongs to
`/api/payments/usage`, whose client wrapper `getUsage()`
(`payments.ts:215-217`) has **zero callers**. See §7 Dead Code.

### The legacy `Usage` shape

`Usage` (`src/components/auth/api/index.ts:24-28`) carries
`requests_count`, `quota_limit`, `plan_id`, returned inside
`UserProfileResponse` from `/api/auth/me` (`auth/api/index.ts:43-46`,
`:123-125`). Only `plan_id` is read, at
`src/components/auth/hooks/useUserProfile.ts:35` (as the fallback when the
subscription query has no `plan_id`). `requests_count` and `quota_limit` are
never read anywhere.

---

## 3. Usage polling

### Endpoint

`GET /api/ai/usage` — `src/components/auth/api/index.ts:130-132`.

### Query configuration

`useAIUsage` (`src/components/ai/hooks/useAIUsage.ts:15-24`):

| Option | Value | Line |
|---|---|---|
| `queryKey` | `queryKeys.aiUsage` = `['ai-usage']` | `useAIUsage.ts:17`; `src/lib/queryClient.ts:80` |
| `staleTime` | `30_000` (30 s) | `useAIUsage.ts:20` |
| `refetchInterval` | `60_000` (60 s) | `useAIUsage.ts:21` |
| `retry` | `1` | `useAIUsage.ts:22` |

**The 60 s interval reported by Section 08 is confirmed** at
`src/components/ai/hooks/useAIUsage.ts:21`, with the comment
`// background refresh every 60 s`.

### What triggers a refetch

1. **The 60 s timer** while the query is enabled and the tab is live.
2. **Invalidation after a successful payment.** `invalidateBillingData()`
   (`src/components/billing/hooks/usePayments.ts:77-82`) invalidates
   `queryKeys.aiUsage` at line 81. This is the only *explicit* trigger, and it
   fires from `useVerifyPayment.onSuccess` (`usePayments.ts:99`) and
   `useRetryActivation.onSuccess` (`usePayments.ts:106`).
3. **Team purchase.** `invalidateTeamPurchase()` invalidates `queryKeys.aiUsage`
   at `src/components/billing/components/PlansSettings.tsx:303`.
4. **Manual.** The refresh button in `UsageSettings` calls `refetch()`
   (`src/components/billing/components/UsageSettings.tsx:259`, `:293`).
5. **Remount**, subject to the 30 s `staleTime` and the global
   `refetchOnWindowFocus: false` (`src/lib/queryClient.ts:16`).

### What does *not* trigger a refetch — a real gap

The agent SSE stream emits a `quota_update` frame
(`src/components/ai/types.ts:539`:
`{ credits_used, credits_remaining, daily_remaining, monthly_pct }`). Its
handler at `src/components/ai/hooks/useAIAgent.ts:515-519` copies **only**
`credits_used` into the per-run `creditsUsed` state:

```ts
case 'quota_update': {
    const evt = data as QuotaUpdateEvent;
    setState(prev => ({ ...prev, creditsUsed: evt.credits_used }));
    break;
}
```

It does **not** call `queryClient.invalidateQueries({ queryKey: queryKeys.aiUsage })`,
despite `useAIAgent` already holding a `queryClient` (it invalidates other keys in
the same file). The frame's `credits_remaining`, `daily_remaining` and
`monthly_pct` are therefore **discarded**. Consequence: after a run that crosses
the 75% or 90% threshold, the banner does not update until the next 60 s poll.
The live figure the server pushes is thrown away in favour of a poll.

### Two consumers, different enablement

| Call site | `enabled` | Consequence |
|---|---|---|
| `src/components/ai/AIChatMain.tsx:88` — `useAIUsage()` | default `true` (`useAIUsage.ts:15`) | polls `/api/ai/usage` every 60 s **even when signed out** |
| `src/components/billing/components/UsageSettings.tsx:71` — `useAIUsage(!!user)` | gated on auth | no unauthenticated poll from settings |

Both share the single `['ai-usage']` cache entry, so the unauthenticated poll and
the authenticated one contend for one key.

### Local clock tick (not a fetch)

`UsageSettings` runs its own `setInterval` at `30_000` ms to re-render the
"resets in" countdown (`UsageSettings.tsx:75-78`). Purely cosmetic; no network.

---

## 4. Plan gating

### The intended mechanism

`src/lib/modes.ts:4-6` states:

> Availability is decided by the DB: `billing.sw_plans.allowed_modes` (surfaced
> via `/api/ai/usage` as `AIQuotaStatus.allowed_modes`).

### What is actually implemented: nothing

`AIQuotaStatus.allowed_modes` is declared at
`src/components/auth/api/index.ts:64` and **read nowhere**. Confirmed by
repo-wide search for `allowed_modes`: the only reads are
`Plan.allowed_modes` — a *different* field from a *different* endpoint
(`/api/payments/plans`) — at `PlansSettings.tsx:533`, `:820`, `:821` and
`payments.ts:30`.

`ModeSelector` receives no plan or quota input at all. Its props are exactly
`mode`, `thinking`, `disabled`, `onModeChange`, `onThinkingChange`
(`src/components/ai/models/ModeSelector.tsx:13-19`). The `disabled` prop is
passed as `isStreaming` at **both** call sites:

- `src/components/ai/chat/ChatInput.tsx:454` and `:655` — `disabled={isStreaming}`
- `src/components/dashboard/side-panel/ResonaAIInput.tsx:204-210` — `disabled={isStreaming}`

The popover body renders two unconditional buttons, `Flash`
(`ModeSelector.tsx:93-105`) and `Deep` (`ModeSelector.tsx:107-119`), with no
`disabled` attribute and no lock icon.

### Where the gate actually lives

Not in the UI. The mode is passed to the backend as a request parameter and the
backend is the only enforcement point:

- `src/components/ai/hooks/useAgentStream.ts:148-149` — `agent_mode` / `agentMode`
- `src/components/ai/chat/hooks/useChatSendOrchestrator.ts:157`, `:305` — `agentMode: mode`
- `src/components/dashboard/api/dashboard.ts:326` — spread only when set

There is **no request-level client guard either** — `useChatSendOrchestrator`
does not check quota or entitlement before dispatching. So the gate is entirely
server-side, and the client's contribution to plan gating is limited to the
read-only text in the Plans & Billing section.

### User-facing behaviour when a mode is unavailable

**None, client-side.** A user on a plan whose `allowed_modes` is `['flash']`
still sees an enabled, clickable `Deep` option in the mode popover
(`ModeSelector.tsx:107-119`) with no lock, tooltip, toast or upgrade prompt. The
only place the restriction is visible at all is the `Modes` metric on the plan
card (`PlansSettings.tsx:531-534`) — and that is driven by `Plan.allowed_modes`
from the plans list, not by the user's own quota.

Worse, per §1, `formatModes` defaults an absent or empty `allowed_modes` to
`Flash & Deep` (`PlansSettings.tsx:99`), so the one display surface that claims
to describe mode availability can also over-report it.

### Plan × client-side-branching table

No numeric entitlement is client-side, so this table maps only the branches that
**are** keyed on plan id literals. The five literals below are the complete set
of plan ids appearing in this repo's source; all other plan data is
server-supplied from `GET /api/payments/plans` (`payments.ts:167-169`).

| `plan_id` literal | Premium avatar ring (`PremiumAvatar.tsx:50-52`) | Usage badge (`UsageSettings.tsx:40-46`) | Plans card icon (`PlansSettings.tsx:87-92`) | Profile badge (`ProfileSettings.tsx:128-135`) |
|---|---|---|---|---|
| `free` | no | `Free` (slate) | `Layers3` | `Free` |
| `starter` | no | `Starter` (blue) | `Zap` | `Starter` |
| `pro_monthly` | **yes** | `Pro` (primary) | `ShieldCheck` | `Pro` |
| `power_monthly` | no | `Power` (amber) | `Activity` | `Power` |
| `team_monthly` | **yes** | `Team` (violet) | *falls back to `PLAN_META.free` styling* | *falls back to `"Team"` via `planId.split('_')[0]`* |
| unknown / unrecognised | no | *label = raw `planKey`* (`:99`) | free styling | first segment, capitalised |

Inconsistencies in that table, all verifiable in-source:

- **Three divergent plan-id → label maps** exist: `UsageSettings.tsx:40-46`
  (5 entries, badge colours), `PlansSettings.tsx:87-92` (4 entries, icons — no
  `team_monthly`), `ProfileSettings.tsx:128-133` (4 entries — no
  `team_monthly`). A team subscriber therefore gets a `Team` badge in Usage, a
  Free-styled card in Plans, and a `Team` badge in Profile.
- **`power_monthly` and `starter` are paid but not "premium."** `isPaid` is
  `currentPlanId !== 'free'` (`PlansSettings.tsx:202`), yet
  `PremiumAvatar`'s implicit check is only `pro_monthly || team_monthly`
  (`PremiumAvatar.tsx:52`). `PlansSettings.tsx:444` passes
  `isPremium={isPaid}` explicitly so it is correct there; `ProfileSettings.tsx:141-147`
  does **not** pass `isPremium`, so a `power_monthly` subscriber sees no premium
  ring in their profile while seeing one on the billing card.
- A fifth id, `power`, appears only in the retired-plan name map
  (`PlansSettings.tsx:104-108`: `starter`→`Starter`, `power`→`Power`,
  `power_monthly`→`Power`), used to label historical payment rows whose plan is
  no longer in the plans list (`PlansSettings.tsx:595`).

---

## 5. Credit display

### Server-reported vs client-estimated

| Figure | Source | Citation |
|---|---|---|
| Monthly credits used | server (`credits_used_month`) | `UsageSettings.tsx:83` |
| Monthly limit | server (`credit_limit_monthly`) | `UsageSettings.tsx:82` |
| Monthly remaining | **server** (`credits_remaining`), with client fallback | `UsageSettings.tsx:85` |
| Monthly % (Usage page) | **client-computed**, `Math.min(100, used/limit*100)` | `UsageSettings.tsx:84` |
| Monthly % (banner) | **server** (`monthly_pct`) | `useAIUsage.ts:117` |
| Daily used / limit | server | `UsageSettings.tsx:88`, `:87` |
| Daily remaining | **client-computed** `Math.max(0, dayLimit - dayUsed)` | `UsageSettings.tsx:90` |
| Daily % | **client-computed** | `UsageSettings.tsx:89`; `useAIUsage.ts:98` |
| Concurrent slots / limit | server | `UsageSettings.tsx:363` |
| Per-message credits burned | server, from SSE `done` frame | `useAIAgent.ts:410`, `:425`; `ChatMessage.tsx:348-350` |
| Plan card credits | server (`Plan.credit_limit_monthly`) | `PlansSettings.tsx:521`, `:811` |

Three places where the client recomputes a number the server already sent:

1. **Two different monthly percentages.** The chat banner uses server
   `monthly_pct` (`useAIUsage.ts:117`); the Usage page recomputes from
   used/limit (`UsageSettings.tsx:84`). Nothing forces them to agree. The banner
   additionally has no `Math.min(100, …)` clamp, so a server pct above 100 would
   render as e.g. "Monthly credits at 140%" (`useAIUsage.ts:122`).
2. **Daily remaining is computed in one place and taken from the server in the
   other.** `UsageSettings.tsx:90` derives it from `dayLimit - dayUsed`; the
   banner uses `usage.daily_remaining` (`useAIUsage.ts:64`, `:104`, `:110`). The
   "N credits remaining" line under the Usage page's daily bar can disagree with
   the banner's "N of M credits left".
3. **`monthRemaining` prefers the server but silently falls back**
   (`UsageSettings.tsx:85`: `usage?.credits_remaining ?? Math.max(0, monthLimit - monthUsed)`),
   so a missing field is indistinguishable from a genuinely-zero balance.

`UsageSettings` also ignores `is_lifetime_cap`, so a lifetime-capped user still
sees monthly and daily progress bars rendered as if a monthly allowance existed.

### Formatting rules

Credit/limit numbers — `fmtNum` (`UsageSettings.tsx:18-24`), local duplicate:

| Range | Output | Line |
|---|---|---|
| `null` / `NaN` | `'0'` | `:19` |
| `>= 1_000_000` | `(n/1e6).toFixed(n % 1e6 === 0 ? 0 : 1)` + `M` | `:20` |
| `>= 10_000` | `(n/1e3).toFixed(n % 1e3 === 0 ? 0 : 1)` + `K` | `:21` |
| `>= 1_000` | `(n/1e3).toFixed(n % 1e3 === 0 ? 0 : 1)` + `K` | `:22` |
| else | `n.toLocaleString()` | `:23` |

Money and counts in `src/shared/lib/format.ts`:

| Function | Rule | Line |
|---|---|---|
| `formatMoneyFromPaise` | `<= 0` → `'₹0'`; else `₹` + `(paise/100).toLocaleString('en-IN')` | `:135-138` |
| `formatUSD` | `<= 0` → `'$0'`; else `$` + `toLocaleString('en-US', {min:0, max:2})` | `:141-144` |
| `formatAmount` | `'INR'` → `₹`+`en-IN`; else `` `${currency} ` ``+`en-IN` | `:147-150` |
| `formatCompact` | `>=1e6` → `.toFixed(v >= 1e7 ? 0 : 1)`+`M`; `>=1e3` → `.toFixed(v >= 1e4 ? 0 : 1)`+`K`; else `toLocaleString('en-IN')` | `:153-157` |
| `formatDate` | `en-US` `{day:'numeric', month:'short', year:'numeric'}`; `'-'` for nullish/unparseable | `:160-165` |

Percentages are rendered as `Math.round(pct)` + `% used`
(`UsageSettings.tsx:308`, `:336`).

### Thresholds (exact)

| Threshold | Meaning | Citation |
|---|---|---|
| `>= 90` | `critical`; bar `bg-rose-500`; text rose | `useAIUsage.ts:101`, `:119`; `UsageSettings.tsx:49`, `:55` |
| `>= 75` | `warning`; bar `bg-amber-500`; text amber | `useAIUsage.ts:107`, `:125`; `UsageSettings.tsx:50`, `:56` |
| `< 75` | no banner; bar `bg-primary` | `UsageSettings.tsx:51` |

Priority is daily over monthly (`useAIUsage.ts:88` comment, implemented by
early-return at `:101-112`). Warning is suppressed entirely once the exhaustion
error is present (`useAIUsage.ts:94`).

### Exhaustion messages (verbatim)

Daily — `useAIUsage.ts:66`, gated on `credit_limit_daily > 0 && daily_remaining <= 0`:

```
Daily credit limit reached ({credits_used_day} / {credit_limit_daily} credits used). Resets in {resetIn} or upgrade your plan.
```

Monthly — `useAIUsage.ts:71`, gated on `credit_limit_monthly > 0 &&
credits_remaining <= 0 && !is_lifetime_cap`:

```
Monthly credit limit reached ({credits_used_month} / {credit_limit_monthly} credits). Upgrade your plan to continue.
```

### Reset-time handling — a documented contradiction

`useAIUsage.ts:56-58` states:

> Daily resets at UTC midnight — NOT at the weekly Sunday 5:30 PM IST reset.
> The weekly reset time is for the weekly credits tracker only.

`nextDailyReset()` computes UTC midnight (`useAIUsage.ts:39-44`) and
`msUntilDailyReset()` derives the countdown (`:47-49`).
`UsageSettings` computes the same boundary differently — `setUTCHours(24, 0, 0, 0)`
(`UsageSettings.tsx:94`) — equivalent in result but a second implementation of
the same rule.

The UI says "**Resets in X**" (`UsageSettings.tsx:355`), a promise about the
server's reset behaviour, derived entirely from a hardcoded client assumption.
`AIQuotaStatus.weekly_reset_at` exists (`src/components/auth/api/index.ts:66`)
and would carry the server's real value, but is never read.

### Reactive (post-hoc) quota errors

Because the proactive banner is poll-driven, `AIChatMain` also string-matches
runtime errors as a backstop (`AIChatMain.tsx:212-220`). The keyword list is 8
literal strings, lowercased-compared (`:212-216`):

```
'credit limit', 'quota', 'limit reached', 'upgrade',
'quota exceeded', 'token quota', 'daily limit', 'monthly limit'
```

Precedence: proactive error wins over reactive (`quotaError = proactiveQuotaError
?? reactiveQuotaError`, `AIChatMain.tsx:220`). The generic error banner is
suppressed when a quota error is showing (`AIChatMain.tsx:645`).

Banner copy and affordances:

| Banner | Placement | Action | Citation |
|---|---|---|---|
| Exhaustion | amber, input **disabled** | "View plans" → `onOpenPlans` | `ChatInput.tsx:256-269`; disable `:494`, `:695`; placeholder `:381`, `:582` |
| Warning | yellow (`warning`) / orange (`critical`), input enabled | "Upgrade" → `onOpenPlans`, plus a dismiss ✕ | `ChatInput.tsx:271-297` |
| Send blocked when exhausted | `disabled={... \|\| !!quotaError}` | — | `ChatInput.tsx:494`, `:695` |
| Send-gate in orchestrator | early return | — | `useChatSendOrchestrator.ts:214` |

The warning banner's dismiss key is
`` `${level}-${message.slice(0, 20)}` `` (`ChatInput.tsx:208`), so a changed
message re-shows a previously dismissed banner.

`onOpenPlans` is threaded `DataExplorerPage.tsx:383-386` →
`DataExplorerLayout.tsx:665` (`onOpenPlans={onOpenPlans ?? onOpenSettings}`) →
`AIChatMain.tsx:522` → `ChatInput.tsx:196`. The fallback means a host that omits
`onOpenPlans` sends the user to the **profile** section, not to plans.

### Per-message credit readout

`src/components/ai/chat/ChatMessage.tsx:348-350`:

```jsx
{msg.creditsUsed} credit{msg.creditsUsed !== 1 ? 's' : ''} used
```

Rendered only when `!msg.isStreaming && msg.creditsUsed != null && msg.creditsUsed > 0`
(`ChatMessage.tsx:348`). Value provenance is the SSE `done` frame, accepting both
camelCase and snake_case: `evt.usage?.creditsUsed ?? evt.usage?.credits_used`
(`src/components/ai/hooks/useAIAgent.ts:410`, `:425`), with the history path
`m.usage?.credits_used ?? m.usage?.creditsUsed`
(`src/components/ai/chat/utils/messageMapper.ts:175`). `creditsUsed` is also
overwritten by the `quota_update` frame (`useAIAgent.ts:517`), which carries a
*cumulative* `credits_used` — so the per-message figure can be overwritten by a
period-to-date total depending on frame ordering.

---

## 6. Purchase / upgrade flow

### The `?plan=` deep link

`src/pages/DataExplorerPage.tsx:262-271`:

```ts
useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('plan')) {
        setSettingsSection('plans');
        setShowSettings(true);
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}, []);
```

Behaviour, precisely:

- The test is `params.has('plan')` — **the value is never read**. `?plan=`,
  `?plan=pro_monthly` and `?plan=anything` are identical. There is no way to
  deep-link a *specific* plan; the user always lands on the Plans & Billing
  section and must pick a card themselves.
- Runs once on mount (`[]` deps, `:271`). A `?plan=` added later by
  `history.pushState` is ignored.
- Strips the param with `replaceState(..., window.location.pathname)`
  (`:269`), which discards **all** query params, not just `plan`.
- Fires **unconditionally, including when signed out.** `showSettings` is set
  regardless of auth; `PlansSettings` then renders its signed-out panel
  (`PlansSettings.tsx:261-270`: "Sign in to manage your plan and view billing
  history.").
- The comment at `:262-263` states the intent: "the marketing site deep-links
  here". The counterpart marketing code is not in this repo.
- **Latent ordering dependency:** `replaceState` also drops `?view=`, but the
  view mode was already captured in the `useState` initialiser during render
  (`DataExplorerPage.tsx:73-89`), which runs before effects. The stripping is
  safe today only because of that ordering.

`setSettingsSection` has four call sites: `:267` (deep link), `:328` (connector
while signed out), `:380` (`onOpenSettings`), `:384` (`onOpenPlans`), `:440`
(Sign In button). All open the same modal; only the section differs.

### Settings-section wiring

`DataExplorerPage.tsx:62` declares a **narrower** local union than
`src/components/settings/types.ts:6-15`:

```ts
useState<'profile' | 'usage' | 'plans' | 'appearance' | 'shortcuts' |
         'documentation' | 'collaboration'>('profile')
```

It omits `memory` and `feedback`. Those two sections are implemented
(`SettingsModal.tsx:55-56`, `:62-66`) and importable via `initialSection`, but
`DataExplorerPage` cannot name them — so they are unreachable from the only host
page. `shortcuts` is in the local union and handled by
`SettingsModal.tsx:59-60`, but is **absent from the sidebar nav array**
(`SettingsSidebar.tsx:19-28`), so it has no UI entry point at all.

`SettingsModal` re-syncs on reopen via
`useEffect(() => { if (isOpen && initialSection) setActiveSection(initialSection) }, [isOpen, initialSection])`
(`SettingsModal.tsx:43-45`), which is what makes the `?plan=` route work after a
prior session left the modal on another section. Unknown ids fall through to
`ProfileSettings` (`SettingsModal.tsx:67-68`).

### Checkout

**No redirect-based checkout exists.** The Razorpay SDK is loaded by a static
script tag in `index.html:6`
(`<script src="https://checkout.razorpay.com/v1/checkout.js">`), and the modal
is opened in-page by `openRazorpayCheckout()`
(`src/components/billing/api/razorpay.ts:60-96`), which throws
`'Payment provider is not loaded. Please refresh and try again.'` if
`window.Razorpay` is absent (`razorpay.ts:62-65`).

`razorpay.ts:8-12` documents a Radix workaround: Radix Dialogs set
`pointer-events: none` on `<body>`, which would make the checkout iframe
unclickable, so `unlockPointerEvents()` (`razorpay.ts:51-53`) force-resets
`document.body.style.pointerEvents = 'auto'` before opening and on **every**
exit path — success (`:77`), dismiss (`:82`), failure (`:89`) and the
SDK-missing throw (`:63`).

Sequence, per `src/components/billing/hooks/useCheckout.ts:43-113`:

1. `kind === 'upgrade' && planId` → `createOrder({planId, currency})`, else
   `renew({currency})` (`useCheckout.ts:60-62`).
2. Checkout description is `Upgrade to {planName}` or
   `Renew your current plan` (`:64-66`).
3. Theme colour hardcoded `'#0f172a'` (`:77`); `name: 'Schema Weaver'` (`:73`).
4. On success → `toast.loading('Verifying payment...', {id:'payment-verify'})`
   (`:79`), then `verifyPayment` (`:81-85`), then
   `Payment successful — plan renewed!/plan activated!` (`:86-89`).
5. `settle(true|false)` drives `isBusy` and the returned promise
   (`:51-56`, `:90`, `:93`, `:99`, `:101`).
6. `invalidateBillingData()` runs from `useVerifyPayment.onSuccess`
   (`usePayments.ts:99`).

`openRazorpayCheckout` throws synchronously (`:60`), so
`useCheckout`'s `try/catch` at `:58`/`:105` covers SDK-absence and order-creation
failure and settles `false` with a toast.

### Billing endpoints (all in `src/components/billing/api/payments.ts`)

| Function | Method + path | Line |
|---|---|---|
| `getPlans` | `GET /api/payments/plans` | `:167-169` |
| `getSubscription` | `GET /api/payments/subscription` | `:171-173` |
| `createOrder` | `POST /api/payments/create-order` `{planId, currency='INR'}` | `:175-177` |
| `renewSubscription` | `POST /api/payments/renew` `{currency='INR'}` | `:179-181` |
| `verifyPayment` | `POST /api/payments/verify` | `:183-185` |
| `cancelSubscription` | `POST /api/payments/cancel` | `:187-189` |
| `reactivateSubscription` | `POST /api/payments/reactivate` | `:191-193` |
| `getPaymentHistory` | `GET /api/payments/history/{userId}` | `:195-197` |
| `getInvoices` | `GET /api/payments/invoices` | `:199-201` |
| `getInvoiceHtml` | `GET /api/payments/invoices/{id}/html` (text) | `:208-213` |
| `getUsage` | `GET /api/payments/usage` | `:215-217` |
| `getPaymentStatus` | `GET /api/payments/status/{paymentId}` | `:219-221` |
| `retryActivation` | `POST /api/payments/attempts/{paymentRowId}/retry` | `:223-225` |

Team billing (separate module, `src/components/collaboration/api/collaboration.ts`):

| Function | Path | Line |
|---|---|---|
| `getTeamBillingStatus` | `GET /api/teams/{teamId}/billing` | `:200-202` |
| `createTeamSeatOrder` | `POST /api/teams/{teamId}/billing/orders` | `:204-209` |
| `createTeam` | used with `intent: 'team_plan_purchase'` | `PlansSettings.tsx:361` |

### Query keys, stale times and invalidation

| Query | Key | staleTime | gcTime | Line |
|---|---|---|---|---|
| `usePlans` | `['payments','plans']` | `60 * 60 * 1000` (1 h) | `24 * 60 * 60 * 1000` (24 h) | `usePayments.ts:34-41` |
| `useSubscription` | `['payments','subscription']` | `5 * 60 * 1000` | default 5 min | `usePayments.ts:43-50` |
| `usePaymentHistory` | `['payments','history',userId]` | `2 * 60 * 1000` | default | `usePayments.ts:52-59` |
| `useInvoices` | `['payments','invoices']` | `5 * 60 * 1000` | default | `usePayments.ts:61-68` |
| `useAIUsage` | `['ai-usage']` | `30_000` | default | `useAIUsage.ts:15-24` |
| `useUserProfile` | `['user','profile']` | `5 * 60 * 1000`, `retry: false` | default | `useUserProfile.ts:20-26` |
| teams (inline) | `collabQueryKeys.teams` | `30_000` | default | `PlansSettings.tsx:148-153` |
| team billing (inline) | `collabQueryKeys.teamBilling(id \|\| '')` | `30_000` | default | `PlansSettings.tsx:170-175` |

`refetchOnWindowFocus: false` globally (`src/lib/queryClient.ts:16`), so
returning to the tab does not refresh billing state. `retry: 2` globally
(`queryClient.ts:14`) with exponential backoff capped at `10_000` ms
(`queryClient.ts:15`).

`invalidateBillingData()` (`usePayments.ts:77-82`) invalidates four roots:
`payments.all`, `user.profile`, `legacySubscription`, `aiUsage`.

### The duplicate subscription fetch — CONFIRMED

Section 01's flag is real and still live. Two React Query entries fetch the
**same** endpoint under **different** keys:

| Consumer | Endpoint | Key | Line |
|---|---|---|---|
| `useUserProfile` → `subQuery` | `GET /api/payments/subscription` | `['subscription']` (`queryKeys.legacySubscription`) | `useUserProfile.ts:28-33` |
| `usePayments.useSubscription` | `GET /api/payments/subscription` | `['payments','subscription']` | `usePayments.ts:43-50` |

`src/lib/queryClient.ts:56-70` documents this at length, including the reason
the duplicate key has not simply been renamed:

> Phase 3: `useUserProfile` queries `/api/payments/subscription` under the bare
> key `['subscription']` while `usePayments` queries the SAME endpoint under
> `['payments','subscription']` — so the subscription is fetched and cached
> twice, under two keys, with no invalidation path keeping them in sync.
> …
> Until then this key must stay exactly `['subscription']` so the existing
> invalidations keep matching, which is why it lives here rather than being
> renamed.

Consequences, all verifiable:

- **Two network requests for one resource** whenever both hooks mount.
  `useUserProfile` is called by `PlansSettings` (`PlansSettings.tsx:128`) and by
  `ProfileSettings` (`ProfileSettings.tsx:47`), and `useSubscription` is called
  by `PlansSettings` (`PlansSettings.tsx:131`). Opening Plans & Billing issues
  both.
- **Three writers, one stale twin.** `legacySubscription` is invalidated from
  `usePayments.ts:80` and `PlansSettings.tsx:302`. It is **never** invalidated
  anywhere else, and nothing reads `useUserProfile().subscription` for anything
  other than `plan_id` (`useUserProfile.ts:35`, `:40`). `PlansSettings` reads its
  plan from `useSubscription`, i.e. the *other* key
  (`PlansSettings.tsx:131`, `:196`).
- **The reconciliation is scheduled, not done.** `queryClient.ts:65-67` and
  `useUserProfile.ts:35` both defer it to a "Phase 4".
- A unit test pins the new key only —
  `expect(queryKeys.payments.subscription).toEqual(['payments','subscription'])`
  (`src/lib/__tests__/queryKeys.test.ts:209`). Nothing asserts the legacy key is
  unused, so the duplication can silently persist.

### The plan-change lock (paid plans are frozen)

`handleUpgrade` (`PlansSettings.tsx:277-294`) refuses any plan switch while on a
paid plan:

```ts
if (isPaid && plan.id !== currentPlanId) { ...toast.info(...); return; }   // :283-291
```

Toast text (`:288`): "Your current plan is active until {date} and is
non-refundable. Plan changes and cancellation are only available after this
period ends — no partial refunds."

Enforced in three places, consistently:

- Card button label becomes `Locked until period end` and `disabled`
  (`PlansSettings.tsx:849-853`, `:846`).
- `handleUpgrade` guard (`PlansSettings.tsx:283`).
- The `Change Plan` button is always present for paid users
  (`PlansSettings.tsx:479-487`) but only opens the modal; every card inside is
  locked.

Consequence: **`cancelSubscription` and `reactivateSubscription` are
unreachable.** Both API functions exist (`payments.ts:187-193`) and both had
their hooks removed as zero-consumer (`usePayments.ts:72-75`); the UI comment
confirms the intent: "paid plans are non-refundable and locked until the billing
period ends: no cancel, no reactivate" (`PlansSettings.tsx:476-477`). Since the
only cancel path is deleted and `handleUpgrade` blocks downgrades, a paid user
cannot leave the paid tier in-app. `cancel_at_period_end` is read
(`PlansSettings.tsx:203`, `:1029`) but nothing can set it.

`Renew` is offered unconditionally to paid users (`PlansSettings.tsx:488-495`,
`handleRenew` at `:296`) regardless of `subscription.status` — the client does
not check whether renewal is warranted.

### Currency: collected in INR, displayed in USD

A high-severity commercial inconsistency, fully verifiable in-source:

| Concern | Value | Citation |
|---|---|---|
| Order currency (personal) | `'INR'` default | `usePayments.ts:86`, `:92` |
| Order currency (team seats) | hardcoded `'INR'` | `PlansSettings.tsx:370`, `:395` |
| Plan card price | `formatUSD(plan.price_usd)` | `PlansSettings.tsx:798` |
| Current-plan price | `formatUSD(currentPlan.price_usd)` + `/mo` | `PlansSettings.tsx:514-515` |
| Seat unit price | `` `$${seatPriceUsd}` `` | `PlansSettings.tsx:881` |
| Seat total | `` `$${teamTotalUsd.toFixed(2)}` `` + `/mo` | `PlansSettings.tsx:973-974` |
| Team total estimate | `seatCount * seat_price_usd`, **client-computed** | `PlansSettings.tsx:194` |
| Payment history rows | `formatAmount(amount, currency)` — INR-aware | `PlansSettings.tsx:604` |
| Invoice rows | `formatMoneyFromPaise(net_paise \|\| amount_paise)` — INR-only | `PlansSettings.tsx:689` |

`Plan` carries both `price_inr` ("integer paise", `payments.ts:21`) and
`price_usd` ("decimal dollars", `payments.ts:22`). Every purchase path posts
`currency: 'INR'`; every plan/seat price is rendered in USD; the seat total is
multiplied on the client. `createOrder`'s signature does accept other currencies
(`currency = 'INR'`, `payments.ts:175`) and `createTeamSeatOrder` types
`currency?: 'INR' | 'USD'` (`collaboration.ts:206`), but no UI path ever passes
`USD`.

### Team / seat purchase

Constants: `TEAM_PLAN_ID = 'team_monthly'`, `TEAM_SEAT_MIN = 2`,
`TEAM_SEAT_MAX = 1000` (`PlansSettings.tsx:83-85`). Seat stepper presets
`[2, 5, 10, 25]` (`:954`). Default seat count `TEAM_SEAT_MIN` (`:144`). Team name
is truncated to 60 chars (`:359`).

`teamPricingKnown` requires `seat_price_usd` to be a `number` **and** `> 0`
(`PlansSettings.tsx:192-193`); the buy/add buttons are disabled otherwise
(`:1006`, `:1038`) and the price renders `'$—'` (`:881`, `:973`). This is the one
place the UI guards against a missing server value rather than inventing one.

The `ACTIVE` badge requires status in `['active','trialing']`
(`PlansSettings.tsx:178`). A member-view card (as opposed to owner purchase
controls) is chosen by `memberTeam && !ownedTeam` (`:168`, `:886`).

### History, invoices, retry

- History table columns: Date, Plan, Amount, Method, Reference, Status
  (`PlansSettings.tsx:573-578`). Empty state "No payment history yet." (`:567`).
  Tabs are labelled with live counts: `History ({payments.length})`,
  `Invoices ({invoices.length})` (`:548`, `:551`).
- **Reference is truncated to 14 characters** plus an ellipsis:
  `String(reference).slice(0, 14)…` (`PlansSettings.tsx:610`), where
  `reference = payment.paymentId ?? payment.orderId ?? payment.id` (`:585`).
  The full id is therefore unreachable in the UI.
- Status → label/icon map `statusMeta` (`PlansSettings.tsx:111-124`):
  `success`→Paid, `pending`→Pending, `processing`→Processing,
  `refunded`→Refunded, **default→Failed**. Since `PaymentHistoryItem.status` is
  a closed union (`payments.ts:90`), the default branch is unreachable for
  well-formed data — but any new server status renders as **Failed** rather than
  as unknown.
- Retry is offered when `status === 'failed' || status === 'processing'`
  (`:586`) and calls `retry({ paymentRowId: payment.id })` (`:623`), i.e. it
  passes the **history row's `id`** into a parameter the API names
  `paymentRowId` and interpolates into
  `/api/payments/attempts/{paymentRowId}/retry` (`payments.ts:224`).
  `PaymentHistoryItem` has no `paymentRowId` field (`payments.ts:83-95`); that
  field exists only on `Order` (`payments.ts:57`). See Open Questions.
- **"PDF" does not produce a PDF.** Both the `View` and the `PDF` buttons call
  the same `openInvoice(inv.id)` (`PlansSettings.tsx:699` and `:714`), which
  fetches server-rendered HTML and `document.write`s it into a new window
  (`:210-227`). Printing to PDF is left to the browser's print dialog — which is
  what the `payments.ts:205-207` comment describes.
- Invoices show `net_paise || amount_paise` (`PlansSettings.tsx:689`), so a zero
  net silently falls back to gross.

---

## 7. Billing components — `components/billing/**` inventory

**The directories are not empty.** Recursive listing of
`C:\schema-weaver\sw-data-explorer\src\components\billing`:

| Path | Bytes | Lines | Live? |
|---|---|---|---|
| `api/payments.ts` | 7,081 | 226 | yes — 10 of 13 functions consumed |
| `api/razorpay.ts` | 3,289 | 96 | yes — via `useCheckout` + `PlansSettings` team flow |
| `components/PlansSettings.tsx` | 63,688 | 1,072 | yes — settings section `plans` |
| `components/PremiumAvatar.tsx` | 2,917 | 90 | yes — `PlansSettings` + `ProfileSettings` |
| `components/UsageSettings.tsx` | 19,239 | 381 | yes — settings section `usage` |
| `hooks/useCheckout.ts` | 4,536 | 116 | yes — `PlansSettings` (`:136`) |
| `hooks/usePayments.ts` | 3,962 | 125 | yes — `PlansSettings` (`:53-61`) |

Nothing here is a stub. `PlansSettings.tsx` at 1,072 lines is the largest
component in the settings tree and carries the whole purchase surface.

Stale path references inside comments (documentation defects, not code defects):

- `src/components/billing/api/payments.ts:6-7` — "The Razorpay checkout flow
  itself lives in `lib/razorpay.ts`". No such file exists; it is
  `components/billing/api/razorpay.ts`. Verified: a recursive search for
  `*razorpay*` under `src/lib` returns nothing.
- `src/components/billing/hooks/usePayments.ts:74-75` — "Their API functions …
  remain in `lib/api/payments.ts`". The actual path is
  `components/billing/api/payments.ts`.

---

## 8. Activity history

`src/components/auth/activity.ts` is a self-hosted engagement tracker. Header
states the goal: per-user engaged time ("10 min today", "1 hour last week")
computed server-side (`activity.ts:4-6`). It is **not** displayed anywhere in
this app — there is no activity UI in the Data Explorer; the values are consumed
by the backend. What is recorded:

| Signal | Value | Interval / trigger | Citation |
|---|---|---|---|
| Heartbeat | `POST /api/activity/heartbeat` `{device_id}` | every `HEARTBEAT_INTERVAL_MS = 45_000` ms, plus an immediate beat on start | `activity.ts:18`, `:83-85`, `:100-101` |
| Sparse event | `POST /api/activity/event` `{kind, device_id, meta}` | on demand | `activity.ts:66-72` |
| Device id | `crypto.randomUUID()`, else `dev-${Date.now()}-${rand}` | once, localStorage key `sw_device_id` | `activity.ts:19`, `:33-39` |
| Min beat gap | `MIN_BEAT_GAP_MS = 10_000` ms | suppresses rapid visibility toggles | `activity.ts:20`, `:80` |

Visibility rules: beats are skipped unless
`document.visibilityState === 'visible'` (`activity.ts:78`); a beat fires on
`visibilitychange`→visible (`:91-93`) and on `pagehide` (`:94`), so closing the
tab still records time. `startActivityTracking` is idempotent via a module-level
`started` flag (`activity.ts:89`, `:97`).

Transport is deliberately never-throwing: `apiRequestFetch` (the non-throwing
variant) with `keepalive: true` so it survives tab close, wrapped so rejections
are swallowed (`activity.ts:45-63`), with `navigator.sendBeacon` as the
fallback (`:56-61`). The comment at `:47-48` gives the reason: telemetry must
never log errors or dispatch 401 events. Cross-subdomain credential carriage is
noted at `activity.ts:9-10`.

`ActivityKind` (`activity.ts:22`):

| Kind | Emitted? | Where |
|---|---|---|
| `login` | yes | `AuthProvider.tsx:62` (google), `:117` (github) |
| `logout` | yes | `AuthProvider.tsx:191` |
| `export` | yes | `src/components/export/ExportButton.tsx:720`, with `{scope, format, table}` |
| `pageview` | **never** | declaration only, `activity.ts:22` |
| `connection_open` | **never** | declaration only, `activity.ts:22` |

Lifecycle: started/stopped by an effect keyed on `user`
(`AuthProvider.tsx:403-410`) — so heartbeats run only while signed in.

---

## 9. Auth-adjacent billing state

### The documented billing model

`src/components/billing/api/payments.ts:9-12` states the commercial rule:

> Billing model = PAY-FIRST, NO AUTO-DEBIT. A subscription is active only up to
> `current_period_end`; when it lapses the server expires it to free, and the
> user re-pays via `/renew` (same plan) or `/create-order` (a different plan).

**This contradicts the UI copy.** The current-plan card renders
`Renews on {formatDate(current_period_end)}` (`PlansSettings.tsx:470`). Under a
no-auto-debit model nothing renews by itself. The string implies a charge the
user has not authorised.

### Subscription status handling

`Subscription.status` is a 5-value union (`payments.ts:41`):
`'active' | 'canceled' | 'past_due' | 'trialing' | 'paused'`.

`statusBadge` (`PlansSettings.tsx:418-424`) resolves a display label in this
order:

| Condition | Label |
|---|---|
| `!isPaid` (plan is `free`) | `Active` (grey) |
| `cancel_at_period_end` | `Cancels Soon` (amber) |
| `status === 'past_due'` | `Past Due` (red) |
| **everything else** | `Active` (primary) |

Only `past_due` is distinguished. `canceled`, `paused` and `trialing` all fall
into the final branch and render **"Active"**. `subStatus` is read at exactly
one place (`PlansSettings.tsx:422`) and defaults to `'active'` when the
subscription object is absent (`:204`). The status union's five members produce
three distinct badges.

A separate, stricter branch exists for the badge *border* only: `team_monthly`
and `pro_monthly` get an emerald ring regardless of status
(`PlansSettings.tsx:457-458`), still showing `statusBadge.label` as the text.

### What happens when a subscription lapses

**The app degrades; it never hard-fails.** No code path throws, blocks a route, or
shows an error on a lapsed subscription. The behaviour is entirely emergent:

1. The server expires the subscription to free (`payments.ts:10`).
2. On the next fetch of `['payments','subscription']`, `plan_id` becomes `free`.
3. `currentPlanId = subscription?.plan_id ?? 'free'` (`PlansSettings.tsx:196`)
   → `'free'`.
4. `currentPlan` resolves to the free plan from the plans list, or
   `subscription?.sw_plans`, or `null` (`:200-201`).
5. `isPaid` becomes `false` (`:202`) → status badge turns grey `Active`
   (`:418-419`), the action buttons switch from `Change Plan`/`Renew` to a single
   `Upgrade Plan` (`:498-504`), and the plan-change lock at `:283` no longer
   fires.
6. `UsageSettings` independently re-reads `usage.plan_id` from
   `/api/ai/usage` (`:98`) and shows the free badge (`:99`).

Credit exhaustion, by contrast, *is* enforced client-side — but only after the
poll lands, and only for the chat input (`ChatInput.tsx:494`, `:695`). The
explorer, dashboard, export and connector surfaces have no credit gate.

### Failure mode indistinguishable from free tier

If the subscription query **errors** (network, 5xx), `subscription` is
`undefined`, so `currentPlanId` falls back to `'free'` (`:196`) and
`current_period_end` is absent, rendering `No active subscription`
(`PlansSettings.tsx:471`). A paying customer whose subscription request failed is
shown the free-plan screen with no error, no toast and no retry — `PlansSettings`
never inspects the query's `error` or `isError` (`:131` destructures only `data`).
There is also **no subscription polling**: `useSubscription` sets
`staleTime: 5 * 60 * 1000` with no `refetchInterval` (`usePayments.ts:43-50`),
and `refetchOnWindowFocus` is `false` (`queryClient.ts:16`). A lapse occurring
mid-session is therefore invisible until a 5-minute staleness boundary plus a
trigger, or an explicit invalidation from a payment.

### Session lifetime (the only thing that hard-fails)

Billing state is destroyed wholesale on sign-out: `queryClient.clear()`
(`AuthProvider.tsx:201`) plus `purgeExplorerCacheDb()` (`:205`) and
`clearAllClientData()` (`:213`). Cross-tab logout repeats all three
(`:327-331`). The 401 handler is deliberately conservative — it re-verifies with
`/api/auth/session` before destroying the session, retains the session when
`navigator.onLine` is false (`AuthProvider.tsx:359-362`), and on network error or
429 (`:372-376`). Sign-out has a 1500 ms re-entry cooldown (`:223-225`); the 401
handler has a 2000 ms cooldown (`:381-383`). Session refresh is attempted hourly
(`AuthProvider.tsx:392-400`) and only when `sessionNeedsRefresh()`.

---

## 10. Settings modal structure

Shell: `Dialog` at `max-w-4xl h-[90vh] max-h-[600px]`
(`src/components/settings/SettingsModal.tsx:74`), a `VisuallyHidden`
`DialogTitle` (`:75-77`), a fixed `w-48` sidebar (`:32`, `SettingsSidebar.tsx:32`)
and a `ScrollArea` content pane (`SettingsModal.tsx:86-88`).

`SettingsSection` union — `src/components/settings/types.ts:6-15` — 9 members.
The sidebar renders 8 (`SettingsSidebar.tsx:19-28`). The router
(`SettingsModal.tsx:48-70`) handles all 9.

| Section | Label | Icon | Sidebar | Router | Component |
|---|---|---|---|---|---|
| `profile` | Profile | `User` | ✅ `:20` | ✅ `:49-50` | `ProfileSettings` |
| `memory` | AI Memory | `NotebookPen` | ✅ `:21` | ✅ `:55-56` | `MemorySettings` |
| `usage` | **AI Usage** | `BarChart3` | ✅ `:22` | ✅ `:51-52` | `UsageSettings` (billing) |
| `plans` | **Plans & Billing** | `CreditCard` | ✅ `:23` | ✅ `:53-54` | `PlansSettings` (billing) |
| `collaboration` | Collaboration | `Users` | ✅ `:24` | ✅ `:63-64` | `CollaborationSettings` |
| `appearance` | Appearance | `Palette` | ✅ `:25` | ✅ `:57-58` | `AppearanceSettings` |
| `documentation` | Documentation | `BookOpen` | ✅ `:26` | ✅ `:61-62` | `DocumentationSettings` |
| `feedback` | Feedback | `MessageSquare` | ✅ `:27` | ✅ `:65-66` | `FeedbackSettings` |
| `shortcuts` | **absent** | — | ❌ | ✅ `:59-60` | `ShortcutsSettings` |

**Billing/usage-related sections: `usage` and `plans`** — 2 of 9. Both live in
`components/billing/components/`, not in `components/settings/`, and are the only
two billing sections the modal renders.

Routing is local `useState`, not a router
(`SettingsModal.tsx:40`); the `initialSection` prop seeds it (`:40`) and a
reopen re-syncs (`:43-45`). Unknown ids fall back to `ProfileSettings`
(`:67-68`).

Cross-section link: `PlansSettings` receives
`onOpenCollaboration={() => setActiveSection('collaboration')}`
(`SettingsModal.tsx:54`) and renders it as "Manage in Collaboration" in two
places (`PlansSettings.tsx:902-912`, `:1043-1053`).

Dead prop: `SettingsSidebarProps` declares `user?: any`
(`SettingsSidebar.tsx:16`) and `SettingsModal` passes `user={user}`
(`SettingsModal.tsx:83`), but `SettingsSidebar` never destructures `user`
(`:30`). Same pattern for `ProfileSettingsProps.onNavigate`
(`ProfileSettings.tsx:20`), which is never destructured (`:46`).

---

## Dead / Unused Code

### `AIQuotaStatus` fields fetched but never read (7 of 18)

`credits_used_week` (`src/components/auth/api/index.ts:55`),
`credits_balance` (`:58`), `max_tokens_per_run` (`:59`),
`max_agent_duration_secs` (`:60`), `allowed_models` (`:63`),
`allowed_modes` (`:64`), `weekly_reset_at` (`:66`). See §2.

### `MODE_META` fields with no readers (3 of 4)

`primaryModel`, `rateTier`, `creditRate` (`src/lib/modes.ts:34-38`, values at
`:45-47`, `:52-54`). Only `.name` is read, at `PlansSettings.tsx:100`. See §1.

### `MODE_META` itself is unreachable for gating

Despite `src/lib/modes.ts:4-6` describing `allowed_modes` as the availability
mechanism, `PlansSettings` reads `allowed_modes` from `Plan` (the plans list), not
from the user's own quota. The advertised mechanism is unwired. See §4.

### Billing API functions with zero callers (4 of 13)

| Function | Endpoint | Line |
|---|---|---|
| `cancelSubscription` | `POST /api/payments/cancel` | `src/components/billing/api/payments.ts:187-189` |
| `reactivateSubscription` | `POST /api/payments/reactivate` | `:191-193` |
| `getUsage` | `GET /api/payments/usage` | `:215-217` |
| `getPaymentStatus` | `GET /api/payments/status/{paymentId}` | `:219-221` |

Deliberate: `usePayments.ts:72-75` records that the hooks for the first two were
removed in Phase 1 as zero-consumer, and that the transport is retained "so they
can be re-wired without a transport change". `getUsage`/`getPaymentStatus` have
no hooks and no callers at all. Cancellation is also blocked by the plan-change
lock (`PlansSettings.tsx:283-291`, `:476-477`).

### `AIModelInfo` + `getAIModels` — entirely unused

`src/components/auth/api/index.ts:69-77` defines a 7-field model-metadata shape
(`id`, `name`, `provider`, `color`, `tier`, `multiplier`, `creditRate`) and
`:137-139` defines `getAIModels()` → `GET /api/ai/models`. Repo-wide search finds
**no consumers of either**. This is the only place in the client where a
`multiplier` and a numeric `creditRate` exist per model — i.e. the model/price
catalogue the app fetches and never renders.

### `Usage.requests_count` and `Usage.quota_limit`

Declared at `src/components/auth/api/index.ts:25-26`; no readers. Only
`plan_id` is consumed (`useUserProfile.ts:35`).

### Query keys with no consumers

| Key | Declaration | Status |
|---|---|---|
| `queryKeys.payments.usage` | `src/lib/queryClient.ts:52` | never referenced — `getUsage()` has no caller |
| `queryKeys.user.all` | `src/lib/queryClient.ts:45` | only referenced by its own test, `src/lib/__tests__/queryKeys.test.ts:217` |
| `queryKeys.legacySubscription` | `src/lib/queryClient.ts:71` | **live but duplicated** — see §6; the duplicate fetch is the defect, not the key |
| `queryKeys.aiUsage` | `src/lib/queryClient.ts:80` | live; but `quota_update` SSE frames do not invalidate it (`useAIAgent.ts:515-519`) |

### `ActivityKind` members never emitted

`'pageview'` and `'connection_open'` (`src/components/auth/activity.ts:22`) are
never passed to `trackEvent`. See §8.

### Settings sections with no entry point

- `shortcuts` — routed (`SettingsModal.tsx:59-60`) but absent from the sidebar
  array (`SettingsSidebar.tsx:19-28`).
- `memory` and `feedback` — routed and in the sidebar, but unreachable from
  `DataExplorerPage`, whose local union omits both (`DataExplorerPage.tsx:62`).

### Dead props

- `SettingsSidebarProps.user` (`SettingsSidebar.tsx:16`, passed at
  `SettingsModal.tsx:83`, never read).
- `ProfileSettingsProps.onNavigate` (`ProfileSettings.tsx:20`, never read).
- `RazorpayCheckoutOptions.prefill.contact` (`razorpay.ts:26`) — no caller
  populates it; `useCheckout`'s `CheckoutInput.prefill` carries only
  `name`/`email` (`useCheckout.ts:27`).
- `useCheckout`'s returned `error` and `resetError` (`useCheckout.ts:33-34`,
  returned at `:115`) — `PlansSettings.tsx:136` destructures only `checkout`, and
  per-outcome messaging is done with toasts inside the hook
  (`useCheckout.ts:79`, `:86`, `:92`, `:98`, `:109`).

### Unreachable status branch

`statusMeta`'s `default:` → `Failed` (`PlansSettings.tsx:121-122`) is unreachable
for any value in the `PaymentHistoryItem.status` union (`payments.ts:90`), yet
would mislabel any future server status. See §6.

### Non-bug, but dead-looking: the "Popular" ribbon

`isFeatured = plan.id === 'pro_monthly'` (`PlansSettings.tsx:750`) drives a
`Popular` ribbon (`:764-773`) — a hardcoded merchandising decision in code,
independent of server plan data.

---

## Open Questions

UNVERIFIED: what are the actual credit limits, prices, seat prices, or plan names? None are defined client-side; only the plan **ids** `free`, `starter`, `pro_monthly`, `power_monthly`, `team_monthly` appear as literals (`PlansSettings.tsx:83-92`, `UsageSettings.tsx:40-46`, `ProfileSettings.tsx:128-133`, `PremiumAvatar.tsx:52`).

UNVERIFIED: is `billing.sw_plans.allowed_modes` actually enforced on the backend for the `flash`/`deep` agent run, and what does the server return when a plan's `allowed_modes` excludes the requested mode? The repo contains only the client half of this contract.

UNVERIFIED: what does `/api/ai/usage` return for each of the 7 unread `AIQuotaStatus` fields, and are any of them intended for UI display that was never built (`credits_used_week`, `credits_balance`, `max_tokens_per_run`, `max_agent_duration_secs`, `allowed_models`, `weekly_reset_at`)?

UNVERIFIED: is the `2x` / `7x` `rateTier` and `~29` / `~88 credits` `creditRate` in `src/lib/modes.ts:46-54` still accurate against `MODEL_META_JS` and `backend-ai/src/usage`? Nothing reads them, so drift is silent.

UNVERIFIED: does `GET /api/payments/attempts/{paymentRowId}/retry` expect the payment-history row `id` (what `PlansSettings.tsx:623` sends) or a distinct `paymentRowId` column? `PaymentHistoryItem` has no `paymentRowId` field (`payments.ts:83-95`).

UNVERIFIED: what currency does the server actually charge? Orders are created with `currency: 'INR'` (`usePayments.ts:86`, `PlansSettings.tsx:370`) but all plan and seat prices are displayed in USD via `price_usd` (`PlansSettings.tsx:514`, `:798`, `:881`, `:973`). Whether the server converts, or whether the displayed figure is simply wrong, cannot be determined from this repo.

UNVERIFIED: is `Plan.price_usd` maintained alongside `price_inr` (`payments.ts:21-22`), or can they drift? The UI reads only `price_usd` for plan/seat pricing but history and invoices are rendered INR-aware (`PlansSettings.tsx:604`, `:689`).

UNVERIFIED: what is the daily credit reset boundary actually enforced by the backend? The client hardcodes UTC midnight (`useAIUsage.ts:39-44`, `UsageSettings.tsx:94`) and explicitly contrasts it with a "weekly Sunday 5:30 PM IST reset" (`useAIUsage.ts:56-58`), but `AIQuotaStatus.weekly_reset_at` (`:66`) is never read, so the server's true schedule is unverified.

UNVERIFIED: is the monthly percentage shown in the chat banner (`monthly_pct`, server) intended to equal the one on the Usage page (client-computed at `UsageSettings.tsx:84`)? No code reconciles them.

UNVERIFIED: does the `quota_update` SSE frame's `credits_remaining` / `daily_remaining` / `monthly_pct` (`src/components/ai/types.ts:539`) exist to drive live banner updates that were never wired up? `useAIAgent.ts:515-519` discards all three.

UNVERIFIED: how does a user on a plan restricted to `['flash']` learn that `Deep` is unavailable in-product? No client-side affordance exists (see §4); whether the backend error message surfaces this via the reactive keyword path (`AIChatMain.tsx:212-216`) is undetermined — `'upgrade'` is in the list but no mode-specific keyword is.

UNVERIFIED: is the "Renews on {date}" copy (`PlansSettings.tsx:470`) intended, given the documented pay-first / no-auto-debit model (`payments.ts:9-11`)? Nothing charges automatically, so the string appears to promise a renewal that will not occur.

UNVERIFIED: is there any intended path for a paid user to cancel? `cancelSubscription` exists (`payments.ts:187-189`) but has no hook, no UI, and `cancel_at_period_end` (`PlansSettings.tsx:203`) can be read but never set.

UNVERIFIED: which marketing surface generates the `?plan=` deep link, and does it pass a meaningful value? `DataExplorerPage.tsx:266` tests only `params.has('plan')` and discards the value, so no specific plan can be targeted.

UNVERIFIED: when was Phase 4 (removing the `useUserProfile` subscription fetch) scheduled? `src/lib/queryClient.ts:65-67` defers the duplicate-fetch fix to it; no code reference to Phase 4 exists.

UNVERIFIED: is `shortcuts` intentionally hidden from the sidebar, and are `memory`/`feedback` intentionally unreachable from `DataExplorerPage`? The mismatch between `SettingsSection` (`types.ts:6-15`), the sidebar (`SettingsSidebar.tsx:19-28`) and the page's local union (`DataExplorerPage.tsx:62`) is undocumented.

UNVERIFIED: does the server ever return `status: 'canceled'` or `'paused'` for a subscription this app renders? If so, those states display as "Active" (`PlansSettings.tsx:418-424`); if the server never returns them, the union (`payments.ts:41`) is over-broad. Either way the client cannot distinguish them.