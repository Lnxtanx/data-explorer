# Billing Infrastructure Audit — Schema Weaver Data Explorer

**Audit date:** 2026-08-26
**Scope:** Complete billing/payment infrastructure serving the Data Explorer product (backend `backend/`, frontend `sw-data-explorer/`, shared Supabase Postgres, Razorpay integration, plus the parallel consumer in `frontend/`).
**Method:** Full code trace of every billing-related execution path. All findings reference exact files and lines. No production code was modified.

---

## Executive Summary

### Overall assessment

The billing system is a **thin, one-time-payment collector**, not a subscription engine. The happy path works: a user picks a plan, pays via Razorpay Checkout, the backend verifies the HMAC signature server-side, marks a payment row successful, upserts a single subscription row, and upgrades an AI-quota row via RPC. A webhook provides a fallback path.

However, tracing every state transition reveals that **the core promises of a billing system are not kept**:

1. **Paid plans never expire.** Nothing enforces `current_period_end` for entitlements, no renewal flow exists, and no cron job downgrades lapsed subscriptions. A user who pays once for "Pro ₹2,499/month" keeps Pro indefinitely. This is a confirmed revenue leak, not a hypothetical.
2. **Activation can silently fail after money is taken.** The activation routine swallows database errors (`console.error` only) and still returns success to the user. There is no transaction, no retry queue, no reconciliation job. Paid-but-not-upgraded users are discovered via support tickets.
3. **There is exactly one subscription row per user, overwritten on every purchase.** Subscription history, prior periods, upgrade/downgrade trail — all destroyed on each new payment. No invoices exist at all.
4. **Cancellation does not exist as a product capability** (no endpoint, no UI), despite the UI displaying a renewal date and the marketing site linking a cancellation policy. The only exit paths are an admin-only refund or waiting for a period end that never arrives.
5. **Zero automated tests** cover payments, verification, webhooks, or plan changes.

### Production readiness

**NOT ready.** The payment capture path is reasonably secure against the common attacks (server-side price derivation, ownership checks, HMAC verification, CSRF on state-changing routes, rate limiting on order creation). But the system cannot answer basic financial questions ("what did this user owe, pay, and receive?"), cannot expire or renew entitlements, can lose activations to silent partial failures, and has no audit trail for webhooks.

### Verdict (see §Production Readiness Verdict)

**CRITICAL SECURITY/BILLING RISKS** — driven by the confirmed pay-once-keep-forever flaw and non-atomic paid-but-maybe-not-activated activation.

### Biggest risks (top of the register)

| # | Risk | Where |
|---|------|-------|
| 1 | Subscriptions never expire; no renewals → monthly plans are lifetime | `entitlements.service.js:59-61`, `cron.routes.js`, absence of any expiry job |
| 2 | Activation partial failures swallowed; user charged without upgrade | `payments.js:66-116` |
| 3 | Verify/webhook race (check-then-act on `status='pending'`) allows duplicate processing | `payments.js:302, 460` |
| 4 | `order.paid` fallback can write the **order id into `razorpay_payment_id`** | `payments.js:438-441, 476` |
| 5 | Refund webhook fully downgrades on *partial* refunds; refund events have no idempotency guard | `payments.js:487-528` |

### Highest-priority fixes

1. Enforce period expiry + build renewal (Razorpay Subscriptions API) or explicit re-purchase flow; add a reconciliation/expiry cron.
2. Make activation atomic-or-recoverable: conditional status transitions (`UPDATE ... WHERE status='pending'`), persist webhook events, add a retry/outbox path for quota upgrades.
3. Add subscription history (don't overwrite), invoices/refunds tables, unique constraints on provider ids.
4. Handle `payment.failed`; fix the `order.paid` payload extraction; stop returning 200 for invalid webhook signatures.
5. Add a payment test suite before touching any of the above.

---

## Current Architecture (as found)

```
┌────────────────────────────── Frontends ──────────────────────────────┐
│ sw-data-explorer (Vite+React+TS, TanStack Query)                      │
│   index.html:6           → loads https://checkout.razorpay.com/v1/…   │
│   components/settings/PlansSettings.tsx  → checkout orchestration     │
│   hooks/usePayments.ts, lib/api/payments.ts → API clients             │
│ frontend/ (main site)     → same backend APIs, parallel client lib    │
└───────────────┬───────────────────────────────────────────────────────┘
                │ fetch (credentials: include, X-CSRF-Token)
                ▼
┌────────────────────────── Node/Express backend ───────────────────────┐
│ backend/index.js                                                      │
│   :93-98   express.json verify hook → req.rawBody (needed for HMAC)   │
│   :106     apiLimiter (100 req/min/IP)                                │
│   :112-120 CSRF double-submit; '/payments/webhook' exempted (:117)    │
│   :127     app.use('/api/payments', paymentRoutes)                    │
│                                                                       │
│ routes/payment/payments.js                                            │
│   GET  /plans            public                                       │
│   GET  /subscription     requireAuth                                  │
│   POST /create-order     requireAuth + paymentLimiter (10/hour/user)  │
│   POST /verify           requireAuth (no rate limiter)                │
│   POST /webhook          public + HMAC-SHA256(rawBody, webhookSecret) │
│   GET  /history/:userId  requireAuth (self only)                      │
│   POST /refund           requireAuth + requireRole('admin')           │
│   GET  /status/:paymentId requireAuth (self only)                     │
│   GET  /readiness        requireAuth                                  │
│                                                                       │
│ services/razorpay/service.js   SDK wrapper + HMAC helpers             │
│ services/plans/planService.js  sw_plans reader w/ 5-min cache         │
│ services/resend/*              payment emails (confirmation/failed/…) │
│ services/team-sharing/entitlements.service.js  seat entitlement cache │
└───────────────┬───────────────────────────────────────────────────────┘
                │ @supabase/supabase-js with SERVICE_ROLE key (bypasses RLS)
                ▼
┌────────────────────────── Supabase Postgres ──────────────────────────┐
│ public.sw_plans            plan catalog (price_inr paise, price_usd)  │
│ public.sw_subscriptions    ONE row per user (UNIQUE user_id)          │
│ public.sw_payments         append-mostly payment log                  │
│ public.sw_topups           DEAD (no code references it)               │
│ ai_meta.ai_user_quota      effective limits/usage (billing target)    │
│ RPC upgrade_user_quota     SECURITY DEFINER quota upsert              │
│ Trigger handle_new_user_billing  seeds free sub + quota on signup     │
│ RLS: users read own rows; ALL writes go through service role        │
└───────────────────────────────────────────────────────────────────────┘
                ▲
                │ HTTPS callbacks
┌───────────────┴───────────────────────────────────────────────────────┐
│ Razorpay (external)                                                   │
│   Orders API (one-time orders only — Subscriptions API NOT used)      │
│   Checkout.js (frontend)                                              │
│   Webhooks → POST /api/payments/webhook                               │
└───────────────────────────────────────────────────────────────────────┘
```

**Authentication:** custom cookie sessions (`user_sessions` table, httpOnly cookie, 7-day TTL, LRU cache) — `backend/middleware/auth.js`. `req.userId` is derived from the session, never from client input on billing routes. Good foundation.

**Authorization:** `requireAuth` on all billing routes except `/plans` and `/webhook`; `requireRole('admin')` on refund; object-level ownership checks in `/verify` (`payments.js:297`), `/history` (`:546`), `/status` (`:640`). RLS exists but is inert for these apps because browsers hold no Supabase JWTs (service-role used server-side).

**Background jobs:** `routes/service/cron.routes.js` contains ONLY session-cleanup and invitation-cleanup. **There is no billing cron** — no expiry sweep, no pending-payment reconciliation, no stale-order cleanup.

---

## Database Schema

Source of truth: `supabase/migrations/20260409000000_rebuild_billing_system.sql` (replaces legacy pgtool* tables), amended by `20260422000000_update_plan_pricing.sql` (current prices) and `backend/migrations/048_team_sharing_v2.sql` (`sw_plans.max_team_members`).

### `public.sw_plans` — plan catalog (mutable)

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | `'free'`, `'starter'`, `'pro_monthly'`, `'power_monthly'` |
| `name` | TEXT NOT NULL | display name |
| `price_inr` | INTEGER NOT NULL | **paise** (minor units) ✔ e.g. 249900 = ₹2,499 |
| `price_usd` | NUMERIC(8,2) NOT NULL | major units ✖ inconsistent representation vs INR |
| `billing_interval` | TEXT CHECK month/year/lifetime | only 'month' used; backend ignores it |
| `credit_limit_monthly/daily`, `concurrent_limit`, `max_tokens_per_run`, `max_agent_duration_secs`, `allowed_models`, `features` | — | entitlement template |
| `ai_pool_fraction`, `margin_rate` | NUMERIC | revenue-model metadata |
| `max_team_members` | INTEGER | added by migration 048 |
| `is_active` | BOOLEAN | soft-disable |
| `created_at` | TIMESTAMPTZ | **no `updated_at`** |

Gaps: prices are mutable with no versioning/history — a price change silently re-prices historical analysis (admin analytics divides stored `amount_paise`, which is fine, but "expected amount" comparisons in `/verify` read *today's* price, so an in-flight checkout started before a price change fails verification with "Potential tampering detected"). No provider-side plan ids (moot today since Razorpay Subscriptions isn't used).

### `public.sw_subscriptions` — one active row per user

```
id                      UUID PK
user_id                 UUID NOT NULL FK→pgtooluser ON DELETE CASCADE
plan_id                 TEXT NOT NULL FK→sw_plans
status                  CHECK IN ('active','canceled','past_due','trialing','paused')
                        DEFAULT 'active'      ← 'past_due','trialing','paused' never set by any code
provider                CHECK IN ('razorpay','stripe','manual') DEFAULT 'razorpay'
provider_order_id       TEXT      -- order that activated CURRENT row (overwritten each purchase)
provider_payment_id     TEXT
current_period_start    TIMESTAMPTZ DEFAULT NOW()
current_period_end      TIMESTAMPTZ DEFAULT NOW()+INTERVAL '30 days'   ('infinity' for free)
cancel_at_period_end    BOOLEAN DEFAULT false       ← never set true anywhere
canceled_at             TIMESTAMPTZ                 ← set only by refund webhook
metadata                JSONB
created_at / updated_at TIMESTAMPTZ (trigger-maintained)
CONSTRAINT sw_subscriptions_user_unique UNIQUE (user_id)   ← hard limit: 1 row/user
```

Indexes: `(plan_id)`, partial `(status) WHERE status='active'`.

**Consequence of `UNIQUE(user_id)` + `upsert({onConflict:'user_id'})` (`payments.js:84-99`):** every purchase overwrites the previous subscription. There is no subscription history table, so questions like "what plan was this user on in March?" are unanswerable. Historical data preservation: **none**.

### `public.sw_payments` — payment attempt log

```
id                    UUID PK
user_id               UUID NOT NULL FK→pgtooluser
subscription_id       UUID FK→sw_subscriptions   ← NEVER populated by any code
plan_id               TEXT NOT NULL FK→sw_plans
razorpay_order_id     TEXT NOT NULL              ← NO UNIQUE constraint
razorpay_payment_id   TEXT                       ← NO UNIQUE constraint
razorpay_signature    TEXT
amount_paise          INTEGER NOT NULL           ← minor units ✔ (INTEGER caps ≈ ₹21.4M/order)
currency              TEXT NOT NULL DEFAULT 'INR'
status                CHECK IN ('pending','success','failed','refunded') DEFAULT 'pending'
payment_method        TEXT
failure_reason        TEXT
refund_id             TEXT
refunded_at           TIMESTAMPTZ
created_at            TIMESTAMPTZ DEFAULT NOW()  ← no updated_at
```

Indexes: `(user_id, created_at DESC)`, `(razorpay_order_id)` (non-unique), `(status)`.

Gaps: duplicate-payment protection relies entirely on app-level status checks (see §Concurrency); `razorpay_payment_id` uniqueness is not DB-enforced; no `updated_at`; `subscription_id` dead column; refunds tracked as flags on the payment rather than a normalized refund entity (partial refunds impossible to represent); no invoice linkage (no invoice table exists).

### `public.sw_topups` — DEAD TABLE

Defined (`20260409000000_rebuild_billing_system.sql:293-306`) with RLS, but **no route, service, or frontend code references it**. `ai_meta.top_up_credits()` RPC exists (`20260409000002_fix_quota_rpcs.sql:208`) and is likewise uncalled from this codebase. Dead infrastructure shipped to production.

### Supporting objects

- `upgrade_user_quota(UUID, TEXT)` — SECURITY DEFINER upsert of `ai_meta.ai_user_quota` from plan defaults (`20260409000000:317-380`). Preserves usage counters. **Granted EXECUTE to `authenticated`** (`:384`) — see finding H5.
- Trigger `handle_new_user_billing` on `pgtooluser` INSERT seeds free subscription (`period_end='infinity'`) + free quota; exceptions swallowed by design (`:464-468`).
- RLS: plans readable by all; subscriptions/payments/topups readable by owner only; **no INSERT/UPDATE policies for clients** (writes are service-role only). Correct for current architecture.

### ER sketch

```
pgtooluser 1───∞ sw_payments ∞───1 sw_plans
     │ 1                │
     │                  │ (subscription_id: declared, never written)
     1                  
sw_subscriptions 1 (UNIQUE user_id) ∞───1 sw_plans
     ▲ overwrite-on-every-purchase; no history table

[missing] invoices, refunds, webhook_events, plan_versions,
          subscription_history, coupon/discount entities
```

---

## API Inventory (backend ↔ frontend contract)

Mount point: `backend/index.js:127`. All responses JSON. Errors `{ error: string }`.

| # | Method & Route | Auth | Rate limit | Purpose | Backend location | FE consumer (Data Explorer) | Contract status |
|---|---|---|---|---|---|---|---|
| 1 | GET `/api/payments/plans` | public | apiLimiter | list active plans | `payments.js:140` | `payments.ts:78`, `PlansSettings.tsx:152` | ✔ aligned |
| 2 | GET `/api/payments/subscription` | session | apiLimiter | current subscription (+joined plan); synthesizes free-plan object when row missing (`payments.js:166-176`) | `payments.js:155` | `useUserProfile.ts:29`, `PlansSettings.tsx:158` | ✔ aligned |
| 3 | POST `/api/payments/create-order` | session | apiLimiter+paymentLimiter 10/h | create Razorpay order + pending `sw_payments` row; returns `{order:{id,amount,currency,keyId,…}}` | `payments.js:190` | `payments.ts:82`, `PlansSettings.tsx:183` | ✔ aligned (no idempotency key; `currency` accepted but FE never sends it) |
| 4 | POST `/api/payments/verify` | session | apiLimiter only | HMAC verify → activate | `payments.js:271` | `PlansSettings.tsx:205-213` | ⚠ FE sends dead fields `user_id`,`plan_id` (`payments.ts:34-36`); BE ignores both (good security, stale contract) |
| 5 | POST `/api/payments/webhook` | HMAC | none | async events | `payments.js:411` | n/a (server-to-server) | ⚠ see findings H6/C3/C5 |
| 6 | GET `/api/payments/history/:userId` | session (self only, `:546`) | apiLimiter | last 50 payments | `payments.js:542` | `PlansSettings.tsx:167` | ✔ aligned |
| 7 | POST `/api/payments/refund` | admin role | apiLimiter | initiate Razorpay refund + mark refunded | `payments.js:583` | only in `frontend/` (`payments.ts:137-145`); **no admin UI found** | ⚠ endpoint exists, no first-party consumer |
| 8 | GET `/api/payments/status/:paymentId` | session (self only) | apiLimiter | proxy Razorpay payment fetch | `payments.js:634` | only in `frontend/` (`payments.ts:130`); unused by DE | ⚠ orphaned consumer-side |
| 9 | GET `/api/payments/readiness` | session | apiLimiter | config booleans | `payments.js:34` | none found | ⚠ info disclosure (M3) |
| 10 | **GET `/api/payments/usage/:userId`** | — | — | — | **DOES NOT EXIST** | `payments.ts:90-92` + `usePayments.ts:26-34` (`useUsage`) | ✖ **dead API: client calls nonexistent route** (H1) |
| — | ~~POST cancel~~ / ~~upgrade~~ / ~~downgrade~~ / ~~invoices~~ | — | — | — | **do not exist** | UI shows "Renews <date>" implying manageability | ✖ H2 |

Undocumented/internal: `/readiness` (9). Also note `frontend/src/hooks/useSubscription.ts` duplicates query #2 for the main site.

### Request/response schema notes

- `/verify` request type includes `user_id: string; plan_id: string` (`payments.ts:31-39`). The backend deliberately derives identity from the session and plan from its own DB row (`payments.js:286-306`) — correct — but the shared TypeScript contract still advertises client-controllable identity, inviting future misuse.
- `/verify` response returns `{success, plan:{id,name,credit_limit_monthly}}`; FE interface matches (`payments.ts:41-49`). The optional `message` field is never sent by BE.
- Error shape inconsistency: most errors are `{error}`, but `ApiError` prefers `data.message || data.error` (`client.ts:86`) — harmless today, fragile tomorrow.
- `/create-order` failure returns `err.message` verbatim to the client (`payments.js:260`) — internal-detail leakage risk (M-class).

---

## Payment Flow (actual implemented lifecycle)

```
FE PlansSettings.handleUpgrade (PlansSettings.tsx:177)
 1. POST /create-order {planId}                       [session+CSRF]
    BE: load sw_plans row (is_active=true)            payments.js:200-205
        amount = currency==='USD' ? price_usd*100 : price_inr   :211
        razorpay.orders.create(amount,currency,receipt,notes{plan_id,user_id})
        INSERT sw_payments(status='pending', amount_paise, currency)  :227-238
    → {order:{id, amount, currency, keyId, …}}
 2. FE opens Razorpay Checkout with returned order    :230-239
 3a. SUCCESS handler → POST /verify                   :200-213
     {razorpay_order_id, razorpay_payment_id, razorpay_signature,
      user_id(ignored), plan_id(ignored), email, name}
     BE:
       a. load payment row by razorpay_order_id      :286-290
       b. ownership check (row.user_id === session)  :297
       c. status must be 'pending' else 409          :302
       d. verifyPaymentSignature HMAC(orderId|paymentId, KEY_SECRET) :309
          invalid → mark failed + failure email + 400
       e. getPaymentDetails(paymentId):
          - orderId mismatch → 400                   :345-348
          - amount !== expected(plan price today)    :350-363  → 400
          - **fetch failure = NON-FATAL, all above skipped** :364-366
          - **payment.status never checked**
       f. activateSubscription():                    :369 → :53-133
          - update sw_payments → success (by order_id)   :66-74   [errors logged only]
          - upsert sw_subscriptions (onConflict user_id),
            period_end = now+30d hardcoded               :81-103  [errors logged only]
          - invalidateEntitlements(userId)               :106
          - rpc upgrade_user_quota                       :109-116 [errors logged only]
          - send confirmation email (best-effort)        :119-129
       g. second confirmation email if body.email present :379-388  (double email when webhook also fires)
 3b. FAILURE → rzp.on('payment.failed') toast only    :231-235
     sw_payments row stays 'pending' FOREVER (payment.failed webhook unhandled)
 4. Webhook (parallel path) POST /webhook             :411
     rawBody captured via express.json verify hook (index.js:95-97) ✔
     HMAC verify vs RAZORPAY_WEBHOOK_SECRET            :422-428
       secret unset → 200 {received:true}  (events silently dropped) :416-419
       bad signature  → 200 {received:true} (attack invisible)       :425-428
     'payment.captured' | 'order.paid':
       payment = payload.payment.entity || payload.order.entity    :438
       orderId   = payment.order_id || payload.order.entity.id     :439
       paymentId = payment.id                                      :440
         ⚠ if only order entity present, paymentId := ORDER ID      → C3
       skip unless local row status='pending' (TOCTOU race)         :460
       activateSubscription(... razorpaySignature:'' ...)           :472-481
     'refund.created': full cancel + downgrade to free               :487-527
     everything else: ignored (payment.failed NOT handled)
```

**Trust boundaries:** amounts/plan/currency are derived server-side from `sw_plans` ✔; identity from session ✔; authenticity from HMAC ✔ (when provider fetch succeeds); **provider payment status never authoritative** ✖; email recipient/name client-supplied ✖.

---

## Subscription Lifecycle (as implemented)

Derived state machine — there is exactly one writer pattern:

```
                 purchase (verify or webhook)
   [free] ─────────────────────────────────▶ [active planX]   (row overwritten)
                                               │      ▲
                                 refund.created│      │ next purchase
                                 OR admin refund│      │ (any plan, incl. downgrade-by-repurchase)
                                               ▼      │
                                            [canceled]┘   quota reset to 'free' (refund paths only)

Never produced: past_due, trialing, paused, expired
Never enforced: current_period_end (except admin analytics reporting, analytics.js:109)
cancel_at_period_end: column exists, no writer
Renewal: does not exist (one-time orders; Razorpay Subscriptions API unused)
Proration: does not exist (upgrades charge full price immediately; remainder forfeited)
Downgrade: only via buying nothing-and-waiting (never expires) or admin refund
Failed payment: no state change; payment row stuck 'pending'; user sees toast
Free tier: seeded by trigger with period_end='infinity', provider='manual'
```

**Entitlement enforcement points:**

- AI features: `ai_meta.ai_user_quota` (limits/models/concurrency) written once by `upgrade_user_quota`. It has **no concept of time** — quotas persist until another RPC call changes them.
- Team seats: `getActiveSubscription` (`entitlements.service.js:44-66`) treats `status='active'` as valid **regardless of `current_period_end`** (`inGrace` check applies only to `canceled`, line 60).

Combined effect: **expiry is unenforced everywhere** → Critical finding C1.

---

## Security Findings

Severity scale: CRITICAL / HIGH / MEDIUM / LOW. "Confirmed" = demonstrated from code paths; "potential" = requires conditions.

### CRITICAL

**C1 — Paid plans never expire; no renewal mechanism (confirmed revenue leak)**
- Location: `services/team-sharing/entitlements.service.js:59-61` (active subs ignore `current_period_end`); `ai_meta.ai_user_quota` (no time concept); `routes/service/cron.routes.js` (no billing job); absence of any Razorpay Subscriptions usage; `payments.js:81-82` sets a 30-day window nobody enforces.
- Exploitation scenario: none needed — default behavior. Pay ₹1,199 once → Starter forever.
- Impact: direct recurring-revenue loss; metrics mislead (analytics counts "active" correctly by date, `analytics.js:109`, so dashboards under-report while entitlements over-deliver).
- Fix: either adopt Razorpay Subscriptions (auth-link, webhooks drive renewal/past_due) or implement paid-period enforcement: expiry sweep job flipping expired subs → free (`upgrade_user_quota(user,'free')`) + enforce `period_end > now()` in `getActiveSubscription` and a SQL-level guard in quota reads.

**C2 — Non-atomic activation with silent partial failures; user charged without upgrade (confirmed)**
- Location: `payments.js:53-133`. `sw_payments` update (`:66-78`), `sw_subscriptions` upsert (`:84-103`), `upgrade_user_quota` RPC (`:109-116`) each log-and-continue on error; function returns success; `/verify` responds 200 with plan info (`:390-397`).
- Failure modes: DB blip between payment and quota write ⇒ money taken, free-tier limits remain. No outbox, no retry, no reconciliation job to detect `status='success'` payments lacking matching active subscriptions/quota rows.
- Fix: make the sequence recoverable — record activation steps (e.g., `activation_state` column or outbox row), return 502-with-reference when critical writes fail instead of success, add a reconciliation job comparing `sw_payments(status='success')` ⇄ `sw_subscriptions` ⇄ `ai_user_quota.plan_id`, and alert on drift.

**C3 — Entitlement granted without verifying provider payment status; `order.paid` can corrupt payment id (confirmed logic flaws)**
- Location: `payments.js:340-366`: `getPaymentDetails` wrapped in try/catch marked "non-fatal"; on SDK/network failure the amount-match AND any status validation are skipped; `paymentDetails.status` is never checked even on success (authorized-but-not-captured would pass). Webhook branch `:438-441`: fallback `payment = payload.order.entity; paymentId = payment.id` writes an **order id** into `sw_payments.razorpay_payment_id` and `provider_payment_id` (`:476`).
- Risk: signature proves Razorpay signed `order|payment` pair, but combined with C4's non-atomic claim and empty-signature webhook writes (`:477`), the ledger can contain fabricated-looking pairs; refunds later match on `razorpay_payment_id` and will miss corrupted rows.
- Fix: treat provider fetch as mandatory (fail closed, or queue for async confirmation), assert `status === 'captured'` (or map authorized explicitly), fix payload extraction (`payment.captured` → payment entity; `order.paid` → use `payload.payment.entity.id`), and reject empty `paymentId`.

**C4 — Verify/webhook TOCTOU race; duplicate activation possible (confirmed race, bounded impact)**
- Location: `payments.js:302` and `:460` — both do read-status-then-write without an atomic claim. Two concurrent deliveries (user's `/verify` racing Razorpay's webhook — normal case, not exotic) both observe `pending`.
- Consequences: duplicate activation sequences, duplicate confirmation emails (`:119-129` and `:379-388` both fire), last-writer-wins subscription row. Not directly money-losing (same plan), but demonstrates absence of the one invariant a payment system must have.
- Fix: single-statement atomic claim: `UPDATE sw_payments SET status='processing' WHERE razorpay_order_id=$1 AND status='pending' RETURNING *` (check affected rows); same pattern guarding every terminal transition. Add UNIQUE(`razorpay_order_id`) and UNIQUE(`razorpay_payment_id`) WHERE NOT NULL at the DB.

**C5 — Refund handling unsafe for partial refunds and replay; refund state machine wrong (confirmed)**
- Location: `payments.js:487-528` (webhook) and `:583-628` (admin). Any `refund.created` — including partial — flips payment to `refunded`, cancels subscription immediately (`:512-516`), resets quota to free, with **no amount tracking** and **no idempotency guard** (repeat deliveries re-run everything; only symptom is repeat emails/downgrade RPC calls). Admin route marks `refunded` synchronously although Razorpay refunds are asynchronous (`processed` may arrive later via webhook); a failed-in-flight refund leaves DB saying refunded. Partial-refund representation is impossible in current schema (boolean-ish status + single `refund_id`).
- Impact: support-driven goodwill refunds of ₹100 cause total entitlement loss; financial records cannot represent reality.
- Fix: `refunds` table (id, payment_id, amount_minor, currency, status, created_at), sum refunds vs payment amount for state derivation, gate cancellation on full-refund threshold, make webhook processing idempotent on `refund.id`.

### HIGH

**H1 — Dead/broken API: `GET /api/payments/usage/:userId` (confirmed)**
- Client implementations: `sw-data-explorer/src/components/billing/api/payments.ts:90-92`, `src/hooks/usePayments.ts:26-34`; identical in `frontend/src/lib/api/payments.ts:116-118`. No such backend route exists (full inventory above). Currently unused by rendered components, so it's dormant breakage — the moment someone wires `useUsage` into UI, they ship a permanent 404.
- Fix: delete the client functions or implement the endpoint backed by `ai_meta.get_quota_status` (which already returns richer data than the invented `UsageResponse` shape).

**H2 — No cancellation capability despite renewal UX (confirmed)**
- Schema supports `cancel_at_period_end`/`canceled_at` (migration `:226-227`) and the UI displays "Renews <date>" (`PlansSettings.tsx:293`) plus links the marketing cancellation policy. No endpoint, no service, no UI. Combined with C1 (nothing ever expires), users cannot leave without an admin refund.
- Compliance angle: Indian auto-renewal/RBI e-mandate norms expect accessible cancellation; even absent legal exposure, this is churn/support-cost poison.
- Fix: implement `POST /api/payments/cancel` setting `cancel_at_period_end=true` (+ provider-side cancellation once Subscriptions adopted), honor grace in entitlements (already supported for `canceled`, `entitlements.service.js:60`), surface state in `/subscription`.

**H3 — Currency model incoherent end-to-end (confirmed)**
- `PlansSettings.tsx:424-428` shows USD as the primary price with INR as "≈", but `createOrder` never sends currency (`payments.ts:82-83`) and the backend defaults INR (`payments.js:192`) — Indian users are shown "$29" then charged ₹2,499. The USD branch (`price_usd * 100`, `:211` and `:358`) is float arithmetic over NUMERIC(8,2): exact for whole dollars today (15.00×100=1500), latent rounding bug for any future cents-bearing price (e.g., 19.99×100=1998.9999999999998 → Razorpay rejects/mis-rounds). Domestic Razorpay accounts generally cannot accept USD charges, making the displayed USD-first pricing misleading regardless.
- Fix: pick one display/charge currency for India (INR-first), store minor units uniformly (add `price_usd_paise`/cents integer or compute via integer cents), validate `currency ∈ {supported}` server-side.

**H4 — Period length hardcoded to 30 days; `billing_interval` ignored (confirmed latent)**
- `payments.js:82`: `30 * 24 * 60 * 60 * 1000` for every plan including future `year`/`lifetime` ones. Free uses `'infinity'` only via trigger. If a yearly plan ships, buyers get 30-day windows (or worse, C1 means nobody notices).
- Fix: derive period from `sw_plans.billing_interval` in one shared function; add tests.

**H5 — Over-privileged DB grants create a latent self-upgrade path (potential; conditional exploitability)**
- `20260409000000_rebuild_billing_system.sql:383-384` grants EXECUTE on SECURITY DEFINER `upgrade_user_quota` to `authenticated`; similar grants on `deduct_credits`/`top_up_credits` (`20260409000002:241-246`). RLS policies assume `auth.uid()` sessions. Today neither frontend holds a Supabase anon key (DE imports types only — `AuthProvider.tsx:3`; main site validates `VITE_SUPABASE_ANON_KEY` in `frontend/src/lib/config.ts:12` without creating a browser client found in this audit). But any future exposure of anon key + any Supabase-authenticated JWT lets a user `POST /rest/v1/rpc/upgrade_user_quota` themselves to `power_monthly` for free.
- Fix: `REVOKE EXECUTE ... FROM authenticated` on all billing/quota RPCs; keep service_role only.

**H6 — Webhook channel lacks persistence, replay protection semantics, and fail-visible behavior (confirmed)**
- No `webhook_events` table: event id/type/payload/status/retry-count/error are nowhere recorded (`payments.js:411-536`). Deduplication is the incidental `status!=='pending'` check (C4). Invalid signatures and unset secrets return **200 OK** (`:416-428`), so misconfiguration and attack attempts are invisible and unretryable; comment claims this prevents retries, but Razorpay retries precisely on non-2xx — returning 200 for *invalid signatures* also prevents you from ever noticing forgery attempts. `payment.failed` is unhandled ⇒ failed payments linger `pending` forever (stale-row accumulation; user-facing state never settles).
- Fix: persist every verified event with unique event-id constraint (Razorpay event ids) processed via the atomic-claim pattern; return 400/401 on bad signatures; handle `payment.failed` → mark failed + notify; alert on signature-failure rate.

**H7 — Billing history destroyed by design; no invoices/tax artifacts (confirmed)**
- Single-row subscription overwrite (§Database Schema) + no invoice generation + `subscription_id` never written (`sw_payments.subscription_id`) + refunds denormalized. Cannot produce GST-compliant invoices, cannot answer audits.
- Fix: subscription history table (insert-new-row model or `subscription_events` append log); generate invoice records at activation (numbered series, buyer details, tax breakdown); populate `subscription_id`.

### MEDIUM

**M1 — Client-controlled email recipient/name on money endpoints; `/verify` unrated-limited**
`payments.js:320-335` (failure email) and `:379-388` (confirmation) use body `email`/`name`; `/verify` has only the global 100/min/IP limiter (no `paymentLimiter`). An authenticated user can spam third parties with branded payment emails carrying arbitrary names. Fix: take email/name from the session/profile row (webhook already does, `:466-470`); add limiter.

**M2 — No order idempotency / abandoned-checkout hygiene**
Each click mints a fresh Razorpay order + pending row (`payments.js:218-238`); repeated refreshes accumulate junk; nothing sweeps stale pendings (they'd matter once expiry/renewal exists). Fix: client-generated idempotency key honored server-side (unique index) + periodic cleanup of `pending` orders older than N hours (optionally cancel via Orders API).

**M3 — `/readiness` discloses infrastructure posture to any signed-in user** (`payments.js:34-43`). Restrict to admin or remove.

**M4 — Frontend state-management inconsistencies**
Duplicate subscription queries with divergent keys/staleTimes — `['subscription']` in `useUserProfile.ts:28` (5 min) vs `['subscription', user?.id]` in `PlansSettings.tsx:157` (5 min); invalidation via prefix (`usePayments.ts:57`) works, but two observers with independent freshness produce transient disagreement. `window.Razorpay` used with no guard if checkout.js failed to load (`PlansSettings.tsx:230`); global script tag (`index.html:6`) blocks nothing and has no SRI. `document.body.style.pointerEvents` manual fiddling (`:202, :225, :238`) papers over modal z-index issues — brittle.

**M5 — Observability gaps (see §Observability)** console-only logging, no correlation ids, no metrics/alerts; `err` objects logged raw (`service.js:52`).

**M6 — Plan cache staleness across instances** `planService.js:19-31` 5-minute TTL; `invalidateCache` exported but never called anywhere; multi-instance deployments serve divergent prices briefly; `/verify` expected-amount compares against *current* price, so a mid-checkout price change yields "tampering" false positive (`payments.js:350-363`). Fix: compare against `sw_payments.amount_paise` recorded at order creation (authoritative), not live plan price.

**M7 — History endpoint fixed at 50 rows, float major-unit conversion** (`payments.js:552-571`). Fine for display; insufficient as a billing export.

**M8 — Dead infrastructure shipped**: `sw_topups` + `top_up_credits` unused (see §Database). Remove or feature-gate.

### LOW

**L1** Money formatting duplicated FE/BE with drift already visible (`Rs` prefix vs `₹`, `service.js:158-164` vs `PlansSettings.tsx:90-103`).
**L2** Receipt format `sw_<uuid8>_<ts>` (`service.js:33-37`) not persisted on `sw_payments`, weakening receipt↔row reconciliation.
**L3** No runbook/documentation for billing ops (refunds, manual activation, reconciliation queries).

---

## Reliability Findings (failure-mode matrix)

| Scenario | Current behavior | Recoverable? |
|---|---|---|
| Razorpay API down during create-order | 500 with `err.message` leaked (`payments.js:257-263`) | User retries; fine |
| Razorpay API down during verify | Provider checks skipped ("non-fatal"), signature alone activates (`:364-366`) | Silent degradation — see C3 |
| Razorpay API down during refund | 500; DB not yet touched (update happens after SDK call, `:591-604`) | Yes |
| Webhook delayed / arrives before verify | Skips (status≠pending) or races (C4) | Partially |
| Webhook duplicated | Capture guarded (racily); refund replays freely (C5) | No for refunds |
| Webhook out-of-order (failed then captured) | `payment.failed` ignored entirely; captured processes normally | Accidentally OK |
| Frontend crashes after payment, before verify | Webhook is the safety net — **works only if secret configured**; if secret unset, events dropped silently (`:416-419`), payment stays pending forever | Conditional |
| User closes browser at checkout | Same as above | Conditional |
| Verification succeeds, DB update fails | Success response anyway; permanent paid-but-free state until manual SQL (C2) | **No** |
| DB update succeeds, response lost | State consistent; user retries verify → 409 "already processed"; confusing but safe | Yes (poor UX) |
| Concurrent different-plan purchases (two tabs) | Both orders valid; both activations run; last upsert wins; two successful payments, one surviving subscription — money taken twice with no proration/refund automation | Business gap |
| Subscription expiry | Never happens (C1) | n/a |
| Reconciliation | Does not exist | — |

Required additions: expiry/renewal cron, pending-payment sweeper, success-payment-vs-entitlement drift detector, webhook event store with retry.

---

## Observability & Auditability

Present: `console.log/error/warn` with `[Payments/...]` prefixes (`payments.js` throughout); auth module's `secureLog` structured logger (`auth.js:69-90`) is **not used** by billing code; Razorpay ids stored on rows (order/payment/signature/refund id); Resend email failures warned.

Missing: structured JSON logs with request/correlation ids; payment lifecycle events (created/verified/activated/failed) as queryable records; webhook event store (H6); metrics (conversion, verify-failure rate, activation-failure rate, webhook latency); alerts (signature-validation failures, activation errors, refund anomalies); admin audit trail of who issued refunds beyond `refund.reason` string.

**The question "why does this user have this subscription and where did this payment come from?"** is answerable only partially: `sw_payments` gives the order/payment pair and plan, but the overwritten subscription row hides history, webhooks are unlogged, and activation failures were never recorded. Today's honest answer: *"partly, via SQL archaeology."*

---

## Testing Audit

`backend/test/` contains only `middleware/`. Vitest configured (`vitest.config.js`) and used elsewhere (`services/sw-data-explorer/__tests__/`). **Payment test coverage: zero.** The parallel `frontend/` has no payment tests either.

Highest-value tests to write first (exact scenarios):

1. **Signature unit tests** (`verifyPaymentSignature`, `verifyWebhookSignature`): valid, tampered payload, tampered signature, missing secret, unicode edge.
2. **Verify endpoint (integration, mocked Razorpay SDK):** happy path asserts payment→success, subscription upsert, quota RPC called; ownership mismatch → 403; replay after success → 409; bad signature marks failed; provider fetch failure behavior (currently passes — pin desired fail-closed semantics); amount mismatch → 400; captured-vs-authorized handling.
3. **Webhook:** valid `payment.captured` activates; duplicate delivery is single-effect (after C4 fix: atomic claim test); invalid signature → 4xx (after H6 fix) and nothing processed; `order.paid` extraction produces payment id ≠ order id; `payment.failed` marks row failed; `refund.created` partial vs full; unknown event → 200 no-op.
4. **Race test:** fire verify + webhook concurrently against test DB; assert exactly one activation (requires the atomic-claim fix to pass).
5. **Expiry sweep (after C1 fix):** expired active subscription → flipped to free, quota reset, entitlement cache invalidated.
6. **Authorization/IDOR:** history/status/verify with foreign ids; admin-only refund as regular user.
7. **DB constraints:** duplicate `razorpay_order_id` insert rejected (requires new unique index); refund-sum exceeding payment rejected (post-C5 schema).
8. **Contract test:** generated OpenAPI/zod schemas shared with `sw-data-explorer/src/components/billing/api/payments.ts` to prevent drift like H1.

---

## Architecture Review

**Sound choices worth keeping:** server-derived amounts/plans; session-derived identity; HMAC verification server-side; raw-body capture done correctly; separate webhook secret; service-role-only writes with RLS as defense-in-depth; plan data DB-driven with cache; immutable-ish payments log; free-tier seeding trigger; rate limiting on order creation.

**Wrong-sized pieces:** the system implements "purchase" but pretends to implement "subscription" (schema fields, UI copy, analytics all imply recurrence that doesn't exist). The activation routine is a distributed-transaction-shaped problem solved with sequential best-effort writes. Idempotency is improvised from a status column instead of being a first-class primitive. Three layers (route file doing controller+service+repository work, 655 lines) is acceptable now but should be split along: `orders.service`, `verification.service`, `webhook.consumer`, `entitlements.provisioner` — no rewrite needed, just extraction.

Unnecessary complexity: dual email-sending sites for confirmation (`activateSubscription` + `/verify`); dead `sw_topups` stack; dead `UsageResponse` client; `readiness` route. Missing complexity: transactions/outbox, event store, reconciliation, invoices.

---

## Gap Analysis

| Area | Current implementation | Expected production standard | Gap | Severity | Recommendation |
|---|---|---|---|---|---|
| Database | 3 live billing tables; UNIQUE(user_id) sub; no unique on provider ids | History-preserving subs, unique provider ids, invoices/refunds/event tables | Major | CRITICAL/HIGH | §E below |
| Payments | One-time orders; status machine 4 states; no provider-status check | Captured-authority checks, idempotent claims, refund entity | Major | CRITICAL | C2-C5 |
| Subscriptions | Row overwrite; no expiry/renewal/proration | Enforced periods, renewal, cancel-at-end, proration | Existential | CRITICAL | C1, H2, H4 |
| Plans | Mutable catalog, cached 5 min | Versioned prices, immutable order-price snapshot | Moderate | HIGH/MEDIUM | M6, §E |
| Orders | Created per click, abandoned rows persist | Idempotency keys, stale cleanup | Moderate | MEDIUM | M2 |
| Invoices | None | Numbered invoices, tax fields | Absent | HIGH | §E |
| Webhooks | Stateless handler, 200-always | Persisted events, dedupe by event id, fail-visible | Major | HIGH | H6 |
| Razorpay | Orders API only; keys via env; SDK wrapper clean | Subscriptions API, settlement/settlement-tax config, route/webhook mgmt | Major | CRITICAL | C1, §G |
| API | 9 live routes, 1 phantom, 2 orphan-consumer | Complete CRUD incl. cancel; versioned contracts | Significant | HIGH | H1, H2 |
| Frontend | Works for happy path; dead hooks; dual caches | Guarded SDK load, single source of subscription state, currency-honest pricing | Moderate | MEDIUM | M4, H3 |
| Authentication | Cookie sessions, rotation, fail-closed loader | Meets bar | Minor | LOW | keep |
| Authorization | Ownership checks on billing objects; admin refund | Meets bar for current routes | Minor | LOW | keep; add tests |
| Idempotency | Status-column improvisation | Atomic claims + unique constraints + event-id dedupe | Major | CRITICAL | C4, C5 |
| Transactions | None (sequential writes, errors swallowed) | DB tx where possible + outbox/recovery otherwise | Major | CRITICAL | C2 |
| Security | Strong basics; over-granted RPCs; email spoofing vector; readiness disclosure | Least privilege, no client PII trust, hardened webhook | Moderate | HIGH/MED | H5, M1, M3 |
| Observability | console logs only | Structured logs, metrics, alerts, audit trail | Major | HIGH | §13 |
| Testing | Zero billing tests | Suite per §14 | Absent | HIGH | §14 |
| Reconciliation | None | Drift detector + sweeper crons | Absent | CRITICAL | C1/C2 |
| Documentation | None for billing ops | Runbook + architecture doc (this file) | Minor | LOW | publish this doc |

---

## Required End-to-End Traces (with trust boundaries ★ and failure points ✖)

**Trace A — New payment (happy path)**
UI Choose plan ★plan from DB → `createOrder` (session★, CSRF★, limiter★) → DB plan read★ → Razorpay order create (network✖) → pending row insert (fails→500 after order exists: orphan Razorpay order✖ benign) → Checkout (client-controlled★) → handler POST /verify (session★; body ids cross-checked★; signature HMAC★; provider fetch ✖skipped-if-down; amount vs *live* price ✖mid-price-change false-positive) → activate (3 writes, unguarded ✖C2) → emails (body-controlled ✖M1) → FE invalidates caches ✔. Webhook parallel: races step above ✖C4; corrupt-id edge ✖C3.

**Trace B — Existing subscription view**
UI settings → GET /subscription (session★) → `.single()` on user_id (UNIQUE guarantees ≤1) → missing row synthesized as free ✔ → UI shows plan/renewal date — renewal date is decorative ✖(C1). Two competing React-Query caches ✖M4.

**Trace C — Failed payment**
Checkout emits `payment.failed` → FE toast only (`PlansSettings.tsx:231-235`) → **backend never learns** (event unhandled ✖H6) → `sw_payments` row remains `pending` forever → user retries, creates new order (limiter 10/h eventually bites). No dunning, no notification (template exists — `sendPaymentFailed` — reachable only via signature-failure path).

**Trace D — Duplicate webhook**
Same `payment.captured` twice: first activates (pending→success), second observes non-pending → no-op ✔ (unless concurrent — then C4 race). Same `refund.created` twice: runs full cancel+downgrade twice, sends emails twice ✖C5.

**Trace E — Upgrade/downgrade**
Buy higher plan: new order, full charge, upsert overwrites row mid-period — old plan's remaining value forfeited, no proration ✖; entitlements cache invalidated ✔; quota upgraded ✔. Downgrade: identical mechanics (buy cheaper plan) or impossible-via-time (never expires ✖C1). History erased ✖H7.

**Trace F — Cancellation**
User: **impossible** ✖H2. Admin: refund (full) → immediate revoke (not end-of-period) ✖business-rule choice undocumented; partial refund behaves identically ✖C5. Refund webhook path additionally resets quota to free even if user had a *different, valid* subscription purchased later (matches on payment_id only, cancels whatever row exists now ✖).

---

## Critical Findings (prioritized)

1. **C1** Expiry/renewal absent — confirmed recurring-revenue leak.
2. **C2** Activation non-atomic + errors swallowed — paid-but-not-upgraded is a guaranteed eventual incident.
3. **C5** Refund semantics wrong (partial refunds revoke everything; replayable; async status ignored).
4. **C3** Provider status unchecked; skipped when API unavailable; `order.paid` id-corruption edge.
5. **C4** Non-atomic pending→terminal transition (verify↔webhook race).
6. **H6** Webhook pipeline unpersisted, fail-silent, `payment.failed` unhandled.
7. **H2** No cancellation despite renewal-facing UX/compliance expectations.
8. **H7** Financial history destroyed on each purchase; no invoices/tax artifacts.
9. **H5** Over-broad EXECUTE grants on SECURITY DEFINER billing RPCs (latent self-upgrade).
10. **H1** Client contract references nonexistent `/api/payments/usage/:userId`.

---

## Recommended Architecture (evolutionary, no rewrite)

Keep Express + Supabase + Razorpay. Introduce four seams inside the existing tree:

```
routes/payment/payments.js        ← thin HTTP layer only
services/billing/
   orders.service.js              ← create-order + idempotency-key handling
   verification.service.js        ← signature + provider-status + amount authority
   activation.service.js          ← atomic claim + provision steps + outbox write
   subscription.service.js        ← period math (interval-aware), cancel, expiry sweep
   webhook-ingest.service.js      ← persist event → enqueue → process idempotently
   reconciliation.job.js          ← drift detection (cron via existing /api/service/cron)
```

Rules encoded in these services:
1. Every terminal state change is `UPDATE … WHERE status='<expected>'` (affected-rows checked).
2. Provisioning side-effects (quota RPC, emails) execute only after the claim succeeds, and failures land in an outbox row retried by the reconciliation job — never inline-swallowed.
3. All Razorpay inbound payloads persist first (`webhook_events` with unique event id), process second.
4. Amount authority = `sw_payments.amount_paise` snapshot, compared against fetched provider amount; live plan prices never participate in verification.
5. Provider status `captured` required for activation (authorized handled explicitly if ever enabled).

---

## Remediation Plan

### P0 — Immediate (security & financial integrity)
1. Fix C1 minimal loop: daily cron expiring `active` subs past `current_period_end` → status `canceled`, `upgrade_user_quota(user,'free')`, invalidate entitlements; enforce `period_end > now()` in `getActiveSubscription`. (Blocks the revenue leak even before real renewals exist.)
2. Fix C2: stop swallowing errors — if subscription upsert or quota RPC fails, return 502 + persist a `needs_activation_retry` flag; add drift-detection query + alert (`success` payments without active sub/quota).
3. Fix C3: make `getPaymentDetails` mandatory; assert `status==='captured'` and amount equals `sw_payments.amount_paise`; fix `order.paid` extraction; reject empty payment ids.
4. Fix C4: atomic claim (`UPDATE … WHERE status='pending' RETURNING …`) in both `/verify` and webhook; add UNIQUE(`razorpay_order_id`) and partial UNIQUE(`razorpay_payment_id`) WHERE NOT NULL.
5. Fix C5 (stop-the-bleeding): ignore partial refunds for revocation (compare `refund.amount` vs payment amount — fetch from webhook payload), dedupe on `refund.id` in memory now, proper refunds table in P1; admin refund: don't mark refunded until provider status confirms.
6. REVOKE `authenticated` EXECUTE on `upgrade_user_quota`/`deduct_credits`/`top_up_credits` (H5).
7. Stop returning 200 for invalid webhook signatures; alert on occurrences (H6 partial).

### P1 — Required for production
1. `webhook_events` table + ingest-then-process pipeline; handle `payment.failed`.
2. Subscription history (`subscription_events` append log or insert-per-period rows); populate `sw_payments.subscription_id`.
3. Cancel flow: `POST /api/payments/cancel` (`cancel_at_period_end=true`) + UI + entitlement grace (already coded).
4. Currency honesty: INR-first pricing display; integer minor units for USD; server-side currency whitelist; period math from `billing_interval` (H3/H4).
5. Emails: derive recipient/name from profile (M1); rate-limit `/verify`; remove dead `user_id`/`plan_id` from verify contract.
6. Reconciliation crons: stale pending payments (>24h) → investigate/cancel via API; drift detector from P0.2 wired to alerts.
7. Delete or implement `/api/payments/usage/:userId`; restrict/remove `/readiness` (H1, M3).
8. Invoices table + generation on activation (buyer, amount, tax placeholder, numbered series).

### P2 — Engineering improvements
1. Test suite per §14 (before further refactors of payment logic where feasible).
2. Split `payments.js` into services (§Recommended Architecture); structured logging with correlation ids on all billing paths; metrics + alerts.
3. Frontend: single `useSubscription` source of truth; guard `window.Razorpay`; lazy-load checkout.js with SRI; error-boundary around payment UI; remove pointer-events hacks.
4. Price snapshots: store `unit_amount`/currency on payment row at creation (already stores amount) and compare verification against it (removes M6 false positives).
5. Decide fate of `sw_topups`/`top_up_credits`: ship or delete (M8).

### P3 — Future
1. Razorpay Subscriptions API for true auto-renewal (plans get `razorpay_plan_id`; webhook events `subscription.charged`/`halted`/`completed` replace homegrown renewal), dunning + `past_due` handling, retry mandates (RBI e-mandate compliant).
2. Proration on upgrade (credit unused time), coupons/discounts entity, multi-currency via international checkout.
3. Billing export/CSV for finance, GST-compliant invoice PDFs, admin refund UI consuming existing `/refund`.

---

# Final Output

## A. Overall Score

| Dimension | Score (0-10) | Justification |
|---|---|---|
| Architecture | **4** | Clear layering at HTTP level; activation/webhook logic monolithic; no tx/outbox seams; dead modules shipped |
| Database | **5** | Sensible core tables, minor-units INR, RLS, seeding trigger; but history-destroying UNIQUE(user_id), missing uniques, no invoices/refunds/events |
| API design | **4** | Consistent shapes, ownership checks; phantom endpoint, orphan consumers, no cancel, contract drift |
| Frontend integration | **5** | Working happy path, decent loading/error states; dead hooks, dual caches, unguarded SDK global, dishonest currency display |
| Razorpay integration | **4** | Correct HMAC + raw-body + server-derived amounts; provider status unchecked, Subscriptions API unused, webhook fail-silent |
| Security | **4** | Session-derived identity, CSRF, rate limits, admin gating; over-granted RPCs, email spoof vector, 200-on-bad-signature |
| Reliability | **3** | Webhook fallback good idea; races, swallowed failures, zero recovery jobs |
| Data integrity | **3** | Append-mostly payments helps; overwrite-everything-else design; no constraints backing app invariants |
| Observability | **2** | console.log only; no event store, metrics, alerts, or audit trail |
| Testing | **0** | No billing tests of any kind |
| **Production readiness** | **3** | Captures money correctly on the happy path; cannot expire, renew, reconcile, audit, or prove correctness |

## B. Top 10 Issues (ranked by business/technical risk)

1. Subscriptions never expire; no renewals (C1) — recurring revenue leak.
2. Activation failures swallowed post-charge (C2) — paid-but-free customers.
3. Refund machinery revokes everything on partial refunds; replayable; async-blind (C5).
4. Activation proceeds without verified provider status; skips checks when Razorpay unreachable (C3).
5. verify/webhook race on `pending` (C4) — no atomic financial transitions.
6. Webhooks unpersisted, fail-silent, `payment.failed` unhandled (H6) — unrecoverable payment outcomes.
7. No cancellation product surface (H2) — compliance/churn/support exposure.
8. Purchase destroys subscription history; no invoices/tax records (H7) — audit/GST gap.
9. SECURITY DEFINER RPCs executable by `authenticated` role (H5) — latent plan self-upgrade.
10. Client contract calls nonexistent usage endpoint; broader contract drift (H1) — broken-by-design integrations waiting to ship.

## C. Critical Fix List (exact changes)

1. `supabase/migrations/new`: `REVOKE EXECUTE ON FUNCTION public.upgrade_user_quota(UUID,TEXT) FROM authenticated;` (and same for `ai_meta.deduct_credits/bigint top_up_credits`); add `UNIQUE INDEX sw_payments_order_uidx ON sw_payments(razorpay_order_id);` and `CREATE UNIQUE INDEX sw_payments_pay_uidx ON sw_payments(razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL;`
2. `payments.js:/verify` + webhook: replace status peek with
   `const claimed = await supabase.from('sw_payments').update({status:'processing'}).eq('razorpay_order_id', oid).eq('status','pending').select('id,user_id,plan_id').maybeSingle();` proceed only if `claimed.data`; final states `success|failed` set afterward.
3. `payments.js:340-366`: remove try/catch-around-fetch; require `paymentDetails && paymentDetails.status==='captured' && paymentDetails.amount === paymentRow.amount_paise` (add `amount_paise` to the select at `:288`) before activation.
4. `payments.js:437-441`: `payment.captured` → payment entity only; `order.paid` → `event.payload?.payment?.entity?.id` required, abort event if absent.
5. `payments.js:53-133`: propagate failures — wrap subscription-upsert + quota RPC; on failure set `sw_payments.activation_state='retry'` (new column) and respond 502; add `GET`-less cron `POST /api/service/cron/billing-reconcile` (guard: `requireAdminSecret`, mirroring `cron.routes.js`) that re-runs activation for flagged/success-but-unprovisioned rows and expires overdue subs.
6. New cron `subscription-expiry`: `UPDATE sw_subscriptions SET status='canceled', canceled_at=now() WHERE status='active' AND current_period_end < now() AND plan_id <> 'free'` + `upgrade_user_quota(user,'free')` per affected row + `invalidateEntitlements`.
7. `payments.js:425-428`: return `400` on invalid webhook signature; keep 200 for *valid but unhandled* events only; log signature failures with `secureLog`-style structure.
8. `payments.js:487-528`: extract `refund.amount` from payload; revoke only when cumulative refunds ≥ payment amount; dedupe via `refund_id` existence check (proper table in P1).
9. `entitlements.service.js:59-61`: `const inGrace = (data.status==='canceled' || data.status==='active') ? periodEnd > Date.now() : true;` (free plan exempted via `plan_id==='free'` or infinity timestamp).
10. `sw-data-explorer/src/components/billing/api/payments.ts`: drop `user_id`/`plan_id` from `VerifyPaymentParams`; delete `getUsage`/`UsageResponse` or implement endpoint.

## D. Architecture Diagram (actual → target annotations)

```
 Frontend (sw-data-explorer, frontend/)
   │  PlansSettings.tsx ── checkout.js (index.html:6)
   │  usePayments.ts / lib/api/payments.ts
   ▼  HTTPS · session cookie · CSRF header
 Node/Express  backend/index.js:127
   │  rateLimit(api, payment) · csrf(exempt: webhook)
   ▼
 routes/payment/payments.js ──► services/billing/* (P2 split)
   │                              ├─ verification (HMAC + provider-status + amount snapshot)  [target]
   │                              ├─ activation (atomic claim + outbox)                      [target]
   │                              └─ webhook-ingest (persist → process)                      [target]
   ▼ service-role
 Supabase Postgres
   public.sw_plans ── sw_subscriptions (1/user) ── sw_payments
   ai_meta.ai_user_quota ◄── RPC upgrade_user_quota (SECURITY DEFINER)
   [target+] subscription_history · invoices · refunds · webhook_events · outbox
                ▲                                    ▲
                │ expiry/reconcile crons (target)    │
 Razorpay ◄─────┘ orders.create / payments.fetch / refunds
   │  checkout.js (client)          │
   └── webhooks ───────────────────► POST /api/payments/webhook (rawBody HMAC)
 Entitlements: ai_user_quota (AI features) + entitlements.service.js cache (seats)
```

## E. Database Recommendations

1. Unique indexes on `sw_payments(razorpay_order_id)` and partial-unique `razorpay_payment_id`.
2. `ALTER TABLE sw_subscriptions DROP CONSTRAINT sw_subscriptions_user_unique;` → replace with partial unique `ON (user_id) WHERE status IN ('active','trialing','past_due')` + allow multiple historical rows (or add `subscription_events` append-log: subscription_id, event, payload, actor, at).
3. New `invoices(id, user_id, payment_id FK, number UNIQUE, amount_minor, currency, tax_breakdown jsonb, buyer_snapshot jsonb, issued_at)`.
4. New `refunds(id PK, payment_id FK, provider_refund_id UNIQUE, amount_minor, currency, status CHECK(pending/processed/failed), reason, initiated_by, created_at)`; derive `sw_payments.status='refunded'` from sums.
5. New `webhook_events(id UUID PK, provider TEXT, event_id TEXT UNIQUE, event_type, payload jsonb, status CHECK(received/processed/failed), error, attempts INT, received_at, processed_at)`.
6. Add `updated_at` + `activation_state` (`none|retrying|done`) to `sw_payments`; populate `subscription_id`; consider `receipt` column.
7. Normalize USD to minor units (rename to `price_usd_cents INTEGER`) or drop USD until international billing is real.
8. Plan price versioning: `sw_plan_prices(plan_id, effective_from, price_inr, price_usd)`; orders snapshot their price (already do via `amount_paise` — formalize FK to price version).

## F. API Recommendations

1. Implement or delete `GET /api/payments/usage/:userId` (prefer deletion; `/api/ai/usage` already serves richer quota data — `routes/ai/handlers/usage.js:141`).
2. Add `POST /api/payments/cancel` (sets `cancel_at_period_end`), `GET /api/payments/invoices`, extend `/subscription` response with `will_cancel`, `days_remaining`.
3. `/verify`: accept only the three Razorpay fields (+optional client nonce); document 409-replay semantics; add `paymentLimiter`.
4. Shared zod/OpenAPI schema package consumed by backend routes and `lib/api/payments.ts` (both frontends) to kill drift permanently.
5. Standardize error envelope `{error, code?, reference?}`; include payment-row reference on 5xx so support can find the failure.

## G. Razorpay Recommendations

1. Keep HMAC order-payment verification; add mandatory `payments.fetch` with `status==='captured'` + amount equality against the DB snapshot.
2. Webhooks: configure on Razorpay dashboard restricted to needed events; persist every delivery; dedupe on `event.id`; process asynchronously; return 2xx only for accepted/valid, 4xx on signature failure; monitor retry storms.
3. Adopt Razorpay Subscriptions (P3) for genuine renewals; until then, implement pre-expiry reminder emails (templates already exist: `sendSubscriptionExpiring`, resend service `:186`) + re-purchase nudges.
4. Use `notes` (already sent: `service.js:38-42`) as the authoritative link and echo them back during verification instead of relying solely on local lookup — cheap defense against row-loss scenarios.
5. Refunds: poll or subscribe to refund status transitions; never mark refunded synchronously after initiate.
6. Secrets: keys already env-only ✔ (verified: no key material in frontends or bundles; `.env.example` contains none); add startup assertion that prod requires `RAZORPAY_WEBHOOK_SECRET` (fail loud instead of silently dropping events).

## H. Security Recommendations

1. Revoke `authenticated` grants on billing RPCs (H5).
2. Server-source all email recipients/names (M1); rate-limit `/verify`.
3. Restrict `/readiness` to admins or delete (M3).
4. Add SRI + `defer`/dynamic injection with error handling for checkout.js (M4).
5. Keep and test the existing strong primitives: session rotation, timing-safe comparisons (already used in csrf/service auth), CORS allowlist, fail-closed session loader.
6. Add authorization regression tests for every billing route (IDOR matrix: own vs foreign order/payment/user ids).

## I. Testing Recommendations

Implement the eight suites listed in §Testing Audit verbatim — highest ROI order: (3) webhook matrix, (2) verify matrix, (4) concurrency race, (1) signature units, (6) IDOR, (5) expiry sweep, (7) constraints, (8) contract sync. Gate deploys on them.

## J. Production Readiness Verdict

## CRITICAL SECURITY/BILLING RISKS

Evidence: the system takes real money today while (a) entitlements never expire and no renewal exists — a confirmed structural revenue leak (`entitlements.service.js:59-61`, no expiry cron, no Subscriptions API); (b) post-payment activation can silently fail with a success response (`payments.js:53-133` swallows DB errors); (c) financial transitions lack atomic claims, unique constraints, webhook persistence, or any reconciliation — so duplicate/delayed/failed provider events produce undefined state; and (d) refund handling converts partial refunds into full entitlement revocation. None of these are theoretical hardening items; each is reachable through normal operation. The happy path is genuinely well-guarded (server-derived pricing, session identity, HMAC, CSRF, rate limits), which is why this is salvageable — execute P0 (≈1–2 weeks of focused work) before any increase in paid traffic, then P1 before charging annual plans or enabling auto-renewal.

---

*End of audit. Prepared for the engineering team as a remediation roadmap; every claim is traceable to the cited file:line locations.*
