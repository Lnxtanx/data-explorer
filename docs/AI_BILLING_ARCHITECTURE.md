# Schema Weaver — AI Billing & Credits Architecture

> **Scope:** End-to-end analysis of the AI credit/quota/billing system (how credits are issued, priced, spent, maintained, and guarded), the billing/mode config files, and a recommendation to move from the current **daily + weekly + monthly** triple-limit model to a **monthly-usage + rate-limit** model aligned with OpenAI/Anthropic.
>
> **Status:** Analysis + documentation only. No production code was changed as part of this document.
>
> **Last verified:** 2026-08-30.

---

## 1. TL;DR

- Users are billed in **credits**. `1 credit = $0.0001` of user-facing value; every provider cost is marked up by a target **70% margin**.
- **Credits get granted** on plan activation inside a single atomic PostgreSQL RPC (`billing.upsert_active_subscription`), and lazily seeded with the free plan on first use (`ai_meta.get_quota_status`).
- **Credits get spent** per token, **input and output billed at separate rates**, after every agent run via an atomic `ai_meta.consume_quota` RPC. Internal (planning/tool) LLM calls are metered for cost but **not billed** to the user.
- **Abuse protection is layered**: request rate-limit middleware (`rateLimit.js`), a gateway quota middleware (`ai-quota.js`), a Python pre-flight `UsageGuard` (model allow-list → concurrency slot → credit headroom), and an in-loop `AgentBudget` (credits / steps / wall-clock).
- **Weaknesses found**: the **weekly limit is display-only (never enforced)**, the **daily hard cap is blunt and non-standard** (OpenAI/Anthropic don't hard-block paid usage daily), **top-up credits (`credits_balance`) are dormant** (infra exists, nothing wires them to payments/UI), and **model access has two sources of truth** (Python `PLAN_ALLOWED_MODELS` vs `billing.sw_plans.allowed_models`).
- **Recommended target:** one **monthly credit allowance** as the only hard credit cap, **rate-limit tiers per plan** (RPM/TPM style) for abuse control, **soft threshold alerts** instead of daily/weekly hard stops, and optional **auto top-up via `credits_balance`** for paid users — the OpenAI "limits → credits decision waterfall" pattern.

---

## 2. The Credit System (how it works end-to-end)

| Phase | Where | What happens |
|---|---|---|
| **1. Rate definition** | `backend-ai/src/usage/pricing_config.py` | Every provider $/1K token cost is converted to a per-1K **credit rate** with a fixed margin |
| **2. Grant** | Node services + `billing.upsert_active_subscription` RPC | On payment success the user's `ai_meta.ai_user_quota` row gets plan limits + models |
| **3. Gate** | `backend/middleware/ai-quota.js` + `backend-ai/src/usage/guard.py` | Pre-request check: plan allowed, concurrency slot free, credit headroom |
| **4. Spend** | `AgentBudget` in the agent loop + `ai_meta.consume_quota` RPC | Tokens billed at real I/O split rates, atomic deduction after the run |
| **5. Ledger** | `ai_meta.ai_usage`, `ai_meta.ai_user_quota`, `ai_quota_events` | Per-call audit rows, counters, and 80%/100% alert events |
| **6. Maintain** | Date-driven resets inside RPCs + Node computed weekly | Daily/monthly counters reset inline; weekly is computed, not stored |
| **7. Surface** | `GET /api/ai/usage` + Settings → Usage page | Live remaining credits, mode access, alerts in chat |

---

## 3. Credits: how they are calculated

**Single source of the pricing math:** `backend-ai/src/usage/pricing_config.py`.

### 3.1 Master constants

```
MARGIN_RATE       = 0.70   # you charge user ≈ 3.33× provider cost
CREDIT_USD_VALUE  = 0.0001 # 1 credit = $0.0001 of user-facing value
AI_POOL_FRACTION  = 0.55   # share of subscription price that becomes the AI budget
```

### 3.2 Provider cost → per-1K credit rate (split billing)

Every model has separate input and output `$`/1K costs (`PROVIDER_COSTS_PER_1K`). At import time these are derived into `INPUT_CREDIT_RATES` and `OUTPUT_CREDIT_RATES`:

```
user_cost_per_1k   = provider_cost_per_1k / (1 - MARGIN_RATE)
credits_per_1k     = round(user_cost_per_1k / CREDIT_USD_VALUE)
```

Example — `amazon.nova-lite-v1:0` (input $0.00006 / output $0.00024):
- input → `round(0.00006 / 0.30 / 0.0001) = 2` credits/1K
- output → `round(0.00024 / 0.30 / 0.0001) = 8` credits/1K

`DEFAULT_CREDIT_RATE` (gpt-4o-mini) = 4 credits/1K is the fallback for unknown models.

### 3.3 Billing functions — which one to use

| Function | Purpose | Used by |
|---|---|---|
| `credit_cost_split(model, in, out)` | **Real billing** — input + output at separate rates; guarantees the 70% margin regardless of I/O mix | `recorder.py`, `AgentBudget.consume_synthesis` / `consume_tool` |
| `credit_cost(model, tokens)` | **Blended** 50/50 estimate (legacy / pre-flight only, where I/O split is unknown) | `guard.py` headroom estimate |
| `subscription_credits(price)` | Formula for plan credits (see below) | pricing analysis only |

### 3.4 How plan credit allowances are decided

Two things exist:

1. **The formula** (`subscription_credits`): `credits = floor(price × AI_POOL_FRACTION / (1 - MARGIN_RATE) / CREDIT_USD_VALUE)`.
2. **The real numbers** (`PLAN_CREDITS`) are **hardcoded below the formula output** — the gap is intentional extra margin buffer:

| Plan | Price | Formula output | **Actually granted (PLAN_CREDITS)** | Daily (10% floor) |
|---|---|---|---|---|
| free | $0 | — | 3,000 | 300 |
| starter | $15 | ≈275K | 100,000 | 10,000 |
| pro_monthly | $29 | ≈532K | 200,000 | 20,000 |
| power_monthly | $79 | ≈1.45M | 500,000 | 50,000 |

> **Runtime truth:** the numbers that matter are in **`billing.sw_plans`** (`credit_limit_monthly`, `credit_limit_daily`, `concurrent_limit`, `allowed_models`, `allowed_modes`, `max_tokens_per_run`, `max_agent_duration_secs`). The RPCs (`get_quota_status`, `upsert_active_subscription`) read from `sw_plans`; Python maps above are fallback-overrides (see §9 findings).

### 3.5 USD ↔ credits round-trip

```
credits_to_usd_user(credits)  = credits × 0.0001        # what user "paid" (marked up)
credits_to_usd_cost(credits)  = credits × 0.0001 × 0.30 # your real provider cost
```

---

## 4. How credits are given to users (grant)

**Nobody writes `ai_meta.ai_user_quota` from application code.** All provisioning goes through SECURITY DEFINER RPCs.

### 4.1 Free plan (lazy seed)

- `ai_meta.get_quota_status(p_user_id)` auto-inserts a **free** quota row on the user's first request if none exists. No cron or trigger needed.

### 4.2 Paid plan (payment → activation)

Razorpay flow (Node `:3000`):

```
create-order → checkout → POST /api/payments/verify
  → claimPayment (row locked 'pending'→'processing',
                  atomic so only one path wins)
  → activateSubscription
      → billing.upsert_active_subscription RPC
          (one transaction: subscription upsert +
           quota upgrade (limits/models from billing.sw_plans) +
           subscription history +
           payment marked success)
```

- **Webhook path** (`payment.captured` / `order.paid` / recovered `payment.authorized`) calls the **same** `activateSubscription` after its own `claimPayment`.
- **Downgrade / refund / expiry:** `billing.upgrade_user_quota({plan:'free'})` and `billing.expire_subscriptions` (cron) reset the quota back to free.
- **Self-healing:** `billing.backfill_missing_billing` seeds free subscription + quota for users missing either (`POST /api/payments/admin/backfill`).
- Rejected/`activation_state='failed'` payments are retried by a reconciliation cron.

### 4.3 Top-up credits (`credits_balance`) — **currently dormant**

- `ai_meta.top_up_credits(user_id, credits, note)` RPC **exists** and is implemented.
- It is only callable from the Python internal route `POST /usage/top-up` (guarded by `X-Internal-Secret`).
- **Node never calls it** and there is **no frontend UI** to buy credits.
- So `credits_balance` only appears as: a read-only field in `get_quota_status`, an additional headroom factor in `guard.py` (daily `daily_remaining + credits_balance`), and the "monthly exhausted AND no balance" block in `ai-quota.js`.
- **Effect:** once a paid user exhausts their monthly 200K/500K they are hard-stopped with no way to continue — a core UX gap versus OpenAI/Anthropic.

---

## 5. How credits are spent (deduction)

### 5.1 Pre-flight gate — `backend-ai/src/usage/guard.py` (`UsageGuard.check`)

Ordered checks (all fail-closed when a DB quota record is missing):

1. **Load quota** from `get_quota_status` RPC — if `None` → hard error `reason="rpc_failed"` (no fallback).
2. **Model access** — `model ∉ quota.allowed_models` → `ModelNotAllowed`.
3. **Concurrency slot** — `ai_meta.acquire_agent_slot` RPC (atomic, `SELECT FOR UPDATE`), backed by an in-memory per-user counter fast-path. Full → `ConcurrentLimitReached`.
4. **Credit headroom** — estimated cost = `credit_cost(model, estimated_tokens) + 21` (internal overhead), then:
   - `credits_remaining < estimate` → block `monthly_limit`
   - `daily_remaining + credits_balance < estimate` → block `daily_limit`
5. **Budget** — `AgentBudget` with `credits_allocated = min(daily_available, monthly remaining)`, plus `max_tokens_per_run` and `max_agent_duration_secs`.

Every block writes an `ai_quota_events` row (`event_type='quota_exceeded'`, `% used`, context) and releases the slot before raising.

### 5.2 In-loop budget — `AgentBudget` (`backend-ai/src/usage/models.py`)

| Method | Billed to user? | Rate used |
|---|---|---|
| `consume_synthesis(in, out)` | **Yes** — only for the final answer | user's chosen model (`credit_cost_split`) |
| `consume_tool(in, out, model)` | **Yes** — planning + tool calls | actual internal model used |
| `step(count)` | — | enforces `max_steps = 25` |
| `check_timeout()` | — | enforces `max_duration_secs` (10 min default) |

- Runs over the credit budget → `AgentQuotaExceeded` → early termination (`termination_reason='credit_budget' | 'step_limit' | 'timeout'`).
- Emits wall-clock warnings at 50% and 80%.
- All internal + synthesis calls count toward **one aggregate** cost (this is the "all-token billing" path).

### 5.3 Post-run deduction — `UsageRecorder.record` (`backend-ai/src/usage/recorder.py`)

1. `ai_meta.consume_quota({ p_user_id, p_cost, p_model })` — **atomic deduction** (no double-spend under concurrency).
2. Fire-and-forget `ai_meta.ai_usage` row (model, provider, tokens, `credits_used`, `cost_usd`, `operation`, metadata).
3. Alert check → if monthly ≥ **80%** emit `quota_warning`; if `credits_remaining == 0` or `daily_remaining == 0` emit `quota_exceeded`; both write `ai_quota_events`.

### 5.4 Internal calls are free to the user — `UsageEmitter`

Every internal model call (`tool_llm`, `cheap_llm`, planner) writes an `ai_usage` row with `credits_used = 0` and real `cost_usd` (observability only), so the admin panel shows true provider cost without billing the user.

---

## 6. How the ledger is maintained

### 6.1 Core tables (`backend/supabase.schema.sql`)

| Table | Purpose | Key columns |
|---|---|---|
| `ai_meta.ai_user_quota` | Per-user runtime ledger | `plan_id`, `credit_limit_monthly/daily`, `credits_used_month/day`, `credits_remaining`, `daily_remaining`, `credits_balance`, `concurrent_slots/limit`, `allowed_models` (jsonb), `max_tokens_per_run`, `max_agent_duration_secs`, `is_lifetime_cap` |
| `billing.sw_plans` | **Authoritative plan definitions** | price, `credit_limit_monthly/daily`, `concurrent_limit`, `allowed_models`, **`allowed_modes` (new)**, `features`, `is_active` |
| `ai_meta.ai_usage` | Per-call audit log | model, provider, operation, in/out tokens, `cost_usd`, `credits_used`, `metadata` |
| `ai_meta.ai_quota_events` | Quota audit + alerts | event_type (`quota_warning`/`quota_exceeded`), remaining/used/%, context |

### 6.2 RPC inventory & responsibilities

| RPC | Schema | Caller | Role |
|---|---|---|---|
| `get_quota_status(user_id)` | `ai_meta` | Node middleware, `/api/ai/usage`, `/api/auth/me`, Python guard | Snapshot + **auto-reset daily/monthly** + auto-seed free row |
| `consume_quota(user_id, cost, model)` | `ai_meta` | Python recorder | Atomic deduction + reset + returns remaining/% |
| `acquire_agent_slot` / `release_agent_slot` | `ai_meta` | Python guard | Atomic concurrency slots (release always in `finally`) |
| `top_up_credits(user_id, credits, note)` | `ai_meta` | Python internal route (only) | Adds to `credits_balance` — **not wired to payments/UI** |
| `upsert_active_subscription(...)` | `billing` | Node activation | One-transaction: subscription + quota + history + payment |
| `upgrade_user_quota(user_id, plan_id)` | `billing` | Node (legacy + downgrade) | Rewrites quota limits/models from plan |
| `expire_subscriptions()` | `billing` | Cron | Downgrade expired subs to free |
| `backfill_missing_billing` | `billing` | Node admin | Seed missing free quota/subs |
| `increment_rate_limit(...)` | (public) | Node `rateLimit.js` | Atomic rolling-window request counter |

### 6.3 Reset semantics

| Counter | Reset | Where |
|---|---|---|
| `credits_used_day` | First request of new day | Inside `get_quota_status` / `consume_quota` (`last_daily_reset < CURRENT_DATE`) |
| `credits_used_month` | First request of new month | Same (`last_monthly_reset < date_trunc('month', now())`) |
| **Weekly** | — | **Never stored/enforced.** Computed on the fly in Node `usage.js` for display (Sunday 17:30 IST window) |
| `concurrent_slots` | `release_agent_slot`; stale rows via `cleanup_stale_slots()` | Agent `finally` / cron |

### 6.4 What the frontends read

- `GET /api/ai/usage` → spreads the full `get_quota_status` row + `credits_used_week`, `weekly_reset_at`, and (new) `allowed_modes` (read from `billing.sw_plans`).
  - Data Explorer polls this every 60 s (`useAIUsage`).
  - Settings → Usage renders daily / weekly / monthly bars from it.
- `GET /api/ai/models` → enriched model list (`/usage/models` → `build_model_list`) with Node `MODEL_META_JS` fallback.
- `GET /api/auth/me` → minimal `{plan_id, requests_count (= monthly used), quota_limit (= monthly limit)}`.

---

## 7. Safety guards — abuse / unusual access protection

The system is a **defense-in-depth stack**:

| Layer | Where | What it blocks | Failure mode |
|---|---|---|---|
| Request rate limit | `backend/middleware/rateLimit.js` (atomic `increment_rate_limit` RPC) | `aiLimiter` 20 req/min on AI endpoints; payment/verify/webhook/auth limiters | **Fail-open** to in-memory counters if DB is down |
| Gateway quota | `backend/middleware/ai-quota.js` | `429` when `daily_remaining === 0`; `429` when `credits_remaining === 0 && credits_balance === 0` | **Fail-open** sentinel `-1` on DB errors (deliberate: don't lock out users during DB outage) |
| Python pre-flight | `guard.py` | model allow-list, concurrency slot, monthly + daily headroom | **Fail-closed** if quota record missing (`rpc_failed`) |
| In-loop budget | `AgentBudget` | credit ceiling, `max_steps=25`, wall-clock timeout | Early termination w/ SSE |
| Slots hygiene | `acquire/release_agent_slot` + `cleanup_stale_slots()` | concurrent abuse / zombie slots | Release always in `finally`; stale cleanup cron |
| Alerting | `recorder._check_and_emit_alerts` | 80% warning, 100% exceeded | `ai_quota_events` rows + SSE |
| Provider resilience | `backend-ai/src/providers/circuit_breaker.py`, mode-chain fallbacks | provider failures / unusual provider errors | chains retry next model, emits `provider_fallback` |

**SSE surface to the chat UI:**
- `quota_update` — live credit counter (Python emits; also synthesized by agent). Frontend handles it (`useAIAgent.ts`).
- `quota_exceeded` — Node synthesizes this from the agent 429 path AND Python may emit it. Frontend handles it and shows an upgrade CTA.
- `quota_warning` (80%) — Python emits, **Node passes it through verbatim, but the frontend has no handler** → users never see the 80% warning. **Gap.**

---

## 8. Config files — deep dive

### 8.1 `backend-ai/src/usage/pricing_config.py` (the billing config)

- Master knobs: `MARGIN_RATE` (0.70), `CREDIT_USD_VALUE` (0.0001), `AI_POOL_FRACTION` (0.55). Changing margin auto-recomputes **every** model's credit rates.
- `PROVIDER_COSTS_PER_1K` — real provider `$`/1K input/output for ~50 models (Bedrock, OpenAI, Anthropic, Google, DeepSeek direct).
- Derived: `INPUT_CREDIT_RATES`, `OUTPUT_CREDIT_RATES`, `MODEL_CREDIT_RATES` (blended), `DEFAULT_CREDIT_RATE`.
- `subscription_credits()` — plan-credit formula (advisory).
- `PLAN_CREDITS` / `PLAN_DAILY_CREDITS` — the real granted allowances (daily = 10% of monthly, min 300).

### 8.2 `backend-ai/src/usage/plans.py` (plan routing / model access)

- `INTERNAL_*` models (cheapest, never user-facing) for planning/tool calls.
- `PLAN_ALLOWED_MODELS` — per-plan model allow-lists, **pushed into `QuotaStatus.allowed_models`** by `guard.get_quota_status()` (Python overrides the DB value).
- `get_model_multiplier_label()` — display "×" multiplier relative to gpt-4o-mini.

### 8.3 `backend-ai/src/usage/model_meta.py` (display metadata)

- `MODEL_META` name/provider/color per model; `model_tier()` maps credit rate → `Fast/Smart/Advanced/Powerful` (relative to base rate 4); `build_model_list()` sorts Powerful→Fast for `/usage/models`.

### 8.4 Node mirror — `backend/routes/ai/handlers/usage.js`

- `MODEL_META_JS` duplicates Python metadata as a **fallback** when the Python backend is down (`/api/ai/models` → Python → DB `get_quota_status` → static free list).
- Also hosts the weekly display computation for `/api/ai/usage`.

### 8.5 Modes (new) — display vs enforcement split

- Chains: `backend-ai/src/agents/data_explorer/config.py` `DATA_EXPLORER_MODES` (flash / deep). **Enforcement** is model-based: chains are filtered by `quota.allowed_models`.
- Availability: **DB-driven** — `billing.sw_plans.allowed_modes` → `/api/ai/usage.allowed_modes` → Settings → Usage "Your Modes" card (`sw-data-explorer/src/lib/modes.ts` `MODE_META` is *display only*).

### 8.6 Frontend plumbing

- `sw-data-explorer/src/lib/api/auth` — `AIQuotaStatus` (+`allowed_modes`), `AIModelInfo`, `getAIUsage`/`getAIModels`.
- `sw-data-explorer/src/hooks/useAIUsage.ts` — polls `/api/ai/usage` every 60 s.
- `sw-data-explorer/src/components/settings/UsageSettings.tsx` — Daily / Weekly / Monthly bars + Modes card (new).
- `sw-data-explorer/src/components/data-explorer/ai/chat/ChatInput.tsx` + `AIChatMain.tsx` — quota-exhaustion & warning banners; send blocked on quota error.
- `sw-data-explorer/src/hooks/useAIAgent.ts` — SSE reducer for `quota_update` / `quota_exceeded` (no `quota_warning` handler).

---

## 9. Findings & gaps

1. **Weekly limit is fictional.** No column, no RPC, no enforcement — just a computed number in Node for the Settings page. It gives users a false sense of a limit.
2. **Daily hard cap is blunt and non-standard.** The industry (OpenAI/Anthropic paid tiers) does not hard-stop a paying user every 24 h based on credits. The daily cap exists to stop "whole month burned in one day", but it makes heavy-but-legitimate users hit artificial walls. It also adds the awkward `daily_remaining + credits_balance` arithmetic.
3. **Top-up / `credits_balance` is dormant.** RPC + Python route exist; Node payments and any UI don't touch it. Exhausted paying users are stuck until next period.
4. **Two sources of truth for model access.** Python `PLAN_ALLOWED_MODELS` overrides the DB in `guard.get_quota_status()`; Node/frontend read the DB. They can drift (that's exactly the "code vs DB as source of truth" problem). Recommendation: make `billing.sw_plans` the single source (as done for `allowed_modes`).
5. **`quota_warning` is emitted but never rendered.** 80% alerts silently die at the SSE boundary (`useAIAgent` has no handler).
6. **Stale docs.** Legacy docs reference `deduct_credits` (actual RPC is `consume_quota`), `pgtoolplans/pgtoolusage` (now `billing.sw_plans` / `ai_meta.ai_user_quota`), and `AI_POOL_FRACTION = 0.60` (now 0.55).
7. **Minor:** `recorder.record` hardcodes `credits_balance: 0` in its return even though `consume_quota` may know the balance; plan credit numbers are deliberately below the formula (fine as a product choice, but opaque in the UI).
8. **Fail-open in `ai-quota.js`** means a DB outage lets everyone through (deliberate). Paired with the Python guard's fail-closed posture, the *effective* protection during DB outage is weaker on the Node gateway.

---

## 10. The industry model (OpenAI / Anthropic) — what we should mirror

### 10.1 OpenAI API (usage-based)

- **Payment model:** prepaid credits; every call bills real input/output tokens (output ≈ 2–4× input). Monthly invoice with per-model/per-day detail.
- **Limits:** the clever bit —
  - **Spend/usage limits: monthly** (alert threshold + optional hard cap). Hard limit reached → `429`, resets next calendar month.
  - **Rate limits (RPM / TPM): per model**, auto-increased by **usage tier** (Free → Tier 5 from cumulative spend + account age). 429 returns `Retry-After`.
  - **No daily credit cap** for paid usage. Protection comes from rate limits + monthly spend cap + concurrency.
- **Prepaid credits:** manual "Add to balance", optional **auto-recharge** when balance < threshold, credits valid ~1 year, non-refundable. Exhausted balance → `429` `credit_balance_exhausted` → add credits.
- **Hybrid "decision waterfall"** (OpenAI's documented model for Codex/Sora): rate limits until reached → seamlessly continue by spending **credits** within the same request. Limits, free tiers, credits, promotions and enterprise entitlements are all layers of one access decision; debits are idempotent and auditable (usage events → monetization events → balance updates).

### 10.2 Anthropic

- Usage-based with prepaid credits / monthly billing; per-token rates, monthly spend visibility, per-model rate limits, and budget alerts (email) rather than daily hard caps for paid usage. 429 on limits with `retry-after`.

### 10.3 What this means for us

The industry pattern = **"money" limits are monthly (or balance), "machine" limits are rate limits.** Daily/weekly *credit* walls are not how billing-grade products protect themselves; they protect with speed limits (RPM/TPM/concurrency) and a monthly spend ceiling. We already have the ingredients: `rateLimit.js`, concurrency slots, and a monthly ledger. We only misuse a *daily credit wall* on top.

---

## 11. Recommended target model — "remove weekly/daily/monthly triple"

### 11.1 The new model

```
1. Monthly credit allowance  → the ONLY hard credit cap (already exists & works).
   - Reached → 429 with clear reason + upgrade/top-up CTA.
   - (Optional) soft alerts at 50/75/90% via SSE + email — never a hard stop.

2. Rate-limit tier per plan   → the abuse shield (mirrors OpenAI RPM/TPM):
   - per-user rolling window request throttle (infra exists),
   - optional token-rate ceiling per window for premium safety,
   - keep concurrency slots (already enforced).

3. Weekly & daily credit limits → REMOVED.
   - daily counter can remain as telemetry (informational), never enforced.
   - weekly virtual counter deleted from Node + UI.

4. Paid users who hit the monthly cap → seamless continue by spending credits
   (OpenAI waterfall): wire top-up credits (`credits_balance`), optional
   auto-recharge, so a heavy user isn't hard-stopped mid-work.

5. Usage page → ONE remaining-balance meter + per-run estimate + monthly
   progress ring (no 3 blunt bars).
```

### 11.2 Why it's better for users and for us

- **Users:** predictable, no artificial 24 h walls; heavy legit usage just spends credits; clear single "how much left this month" number. Matches what users see on OpenAI/Anthropic.
- **We:** simpler enforcement (one credit path instead of daily+monthly arithmetic), simpler UI, and abuse is still controlled by rate limits + concurrency (not credit walls).
- **Free tier:** can keep a *daily* soft cap if we prefer (product decision), but it should be a clearly-labeled free-tier restriction, not a global billing mechanic.

---

## 12. Migration roadmap (phased — implementation pending approval)

| Phase | Change | Files |
|---|---|---|
| **P1 — Remove weekly display** | Drop weekly bar + `credits_used_week`/`weekly_reset_at` from `/api/ai/usage` and Settings UI | `backend/routes/ai/handlers/usage.js`, `UsageSettings.tsx` |
| **P2 — Stop enforcement of daily for paid** | `guard.py`: delete daily headroom check (keep monthly); keep daily telemetry. `ai-quota.js`: remove daily 429; keep monthly+balance. Keep free-tier daily cap optional via a features flag | `guard.py`, `middleware/ai-quota.js` |
| **P3 — Soft alerts** | Render `quota_warning` in `useAIAgent.ts`; add 50/75/90% thresholds + email hook | `useAIAgent.ts`, `recorder.py`, Node mailer |
| **P4 — Top-up + auto-recharge** | Node payment route for credits → `top_up_credits` RPC; `credits_balance` spend in `consume_quota`; UI "Add credits" + auto-recharge toggle (OpenAI-style) | Node payments service, `usage.js`, Billing UI |
| **P5 — Rate-limit tiers per plan** | Store `rate_limit_rpm`/`tpm` on `billing.sw_plans`; `rateLimit.js` reads plan for window limits; surface in plans API | `sw_plans` column, `rateLimit.js`, `planService.js` |
| **P6 — Single source for model access** | Make `billing.sw_plans.allowed_models` authoritative everywhere; retire Python `PLAN_ALLOWED_MODELS` (or keep as cache only); regenerate snapshot | `plans.py`, `guard.py`, migrations |

> **Suggested guardrails before any enforcement change:** duplicate-dashboard on paid users, keep `ai_quota_events` writes, and validate against the admin analytics ("plan-economics" endpoint) that revenue per model stays within margin targets.

---

## 13. Key file map

| Concern | File |
|---|---|
| Pricing math / credit rates | `backend-ai/src/usage/pricing_config.py` |
| Plan allowances & model allow-list | `backend-ai/src/usage/plans.py` |
| Model display metadata | `backend-ai/src/usage/model_meta.py` |
| Data models (QuotaStatus, AgentBudget, exceptions) | `backend-ai/src/usage/models.py` |
| Pre-flight guard / slots | `backend-ai/src/usage/guard.py` |
| Post-run deduction / alerts / SSE | `backend-ai/src/usage/recorder.py` |
| Internal-call observability (not billed) | `backend-ai/src/usage/emitter.py` |
| Node `/api/ai/usage` + `/api/ai/models` (+ weekly calc + MODEL_META_JS) | `backend/routes/ai/handlers/usage.js` |
| Node gateway quota middleware | `backend/middleware/ai-quota.js` |
| Request rate limiting | `backend/middleware/rateLimit.js` |
| Plan activation / payment RPCs | `backend/services/billing/*`, `backend/routes/payment/payments.js` |
| Plans service (SW source) | `backend/services/plans/planService.js` |
| Frontend quota hooks | `sw-data-explorer/src/hooks/useAIUsage.ts`, `useAIAgent.ts` |
| Settings → Usage UI | `sw-data-explorer/src/components/settings/UsageSettings.tsx` |
| Modes display metadata | `sw-data-explorer/src/lib/modes.ts` |
| Old (partially stale) architecture doc | `docs/BILLING_ARCHITECTURE.md` |

---

## 14. Glossary

- **Credit** — the user-facing currency unit; `1 credit = $0.0001` (marked-up value).
- **Margin** — target gross margin (70%); provider cost is divided by `(1 - margin)`.
- **Allowed models** — the model allow-list a plan may use (enforcement).
- **Allowed modes** — the Flash/Deep availability (DB-driven, display/entitlement; new).
- **AgentBudget** — per-run credit/time/step budget enforced inside the agent loop.
- **consume_quota** — the atomic credit-deduction RPC (mislabeled `deduct_credits` in older docs).
- **credits_balance** — top-up credits; infrastructure exists but is not wired to payments/UI.
- **Rate limit** — rolling-window request throttle (RPM-style), distinct from credit caps.