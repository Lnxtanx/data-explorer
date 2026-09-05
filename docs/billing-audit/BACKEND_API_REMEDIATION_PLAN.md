# Backend Billing API Remediation Plan

**Created:** 2026-08-27
**Depends on:** BILLING_INFRASTRUCTURE_AUDIT.md + SCHEMA_REMEDIATION_PLAN.md (same directory), migration `20260827000000_billing_schema_rebuild.sql` (already applied)
**Status:** IMPLEMENTED (backend API refactor complete; frontend UI follows separately)
**Scope:** Backend server-side API (Node/Express). Frontend UI changes follow separately.

---

## 1. Current State After Schema Migration

The `billing` schema is live with all 8 tables, RPCs, and RLS. The backend is **BROKEN** until updated — every `from('sw_*')` call now fails because those tables only exist in the `billing` schema (Supabase default search path is `public, extensions`).

The backend must be migrated to reference `billing.*` tables and `billing.*` RPCs.

---

## 2. Files to Change — Inventory

### 2.1 Files that query billing tables (MUST update table names)

| # | File | Lines | Tables Queried | Change Type |
|---|------|-------|----------------|--------------|
| 1 | `routes/payment/payments.js` | 655 | `sw_plans`, `sw_subscriptions`, `sw_payments` | **REWRITE** (split into services) |
| 2 | `services/plans/planService.js` | 90 | `sw_plans` | PREFIX + inject supabase |
| 3 | `services/team-sharing/entitlements.service.js` | 123 | `sw_subscriptions`, `sw_plans` | PREFIX + expiry enforcement |
| 4 | `routes/admin/handlers/analytics.js` | 414 | `sw_payments`, `sw_subscriptions`, `sw_plans` | PREFIX (`.schema('billing')`) |

### 2.2 Files that call RPCs (MUST update RPC schema-qualified name)

| # | File | Lines | RPC | Change |
|---|------|-------|-----|--------|
| 1 | `routes/payment/payments.js` | 109, 519 | `upgrade_user_quota` | → `billing.upgrade_user_quota` |

### 2.3 Files with only comment references (NO change needed functionally)

| # | File | Notes |
|---|------|-------|
| 1 | `services/team-sharing/invitations.service.js` | References `sw_plans` only in comments; uses `isPaidUser()` from entitlements |
| 2 | `services/razorpay/service.js` | References `sw_plans` only in comment |
| 3 | `services/resend/*` | Email templates — no table access |

---

## 3. Decision: Rewrite vs Reuse

### `payments.js` → **REWRITE + SPLIT**

The 655-line route file does controller + service + repository work. It also contains every critical audit bug:

| Bug | Location | Fix requires |
|-----|----------|--------------|
| C2 — non-atomic activation, errors swallowed | `activateSubscription` :53-133 | Atomic claims + retry/outbox |
| C4 — verify/webhook TOCTOU race | :302, :460 | Atomic `UPDATE ... WHERE status='pending'` |
| C3 — provider status unchecked | :340-366 | Fail-closed provider fetch + status check |
| C5 — refund state machine wrong | :487-528, :583-628 | sw_refunds table + idempotency |
| H2 — no cancellation | (missing) | `POST /api/payments/cancel` |
| H6 — webhook unpersisted | :411-536 | sw_webhook_events + 4xx on bad signature |
| H1 — dead usage endpoint | (client only) | delete client fn or add endpoint |

A surgical find-replace would preserve these bugs. **Split into the layered services** the audit recommended (see §5).

### `planService.js` → **REUSE** (minimal edit)
- Already well-factored with 5-min cache
- Change `.from('sw_plans')` → `.from('plans')` via a `billing` schema client (see §6)
- Keep `invalidateCache` export

### `entitlements.service.js` → **REUSE** (minimal edit + expiry fix)
- Change `.from('sw_subscriptions')` → schema-qualified
- Change `.from('sw_plans')` → schema-qualified
- **Fix C1**: enforce `current_period_end > now()` for active paid plans (`:59-61`)
- Uses `requireDb()` — must pass billing schema

### `analytics.js` → **REUSE** (minimal edit)
- Change `.schema('public')` → `.schema('billing')` on all billing queries (:78, :101, :338, :349, :355)

---

## 4. Critical: Supabase Client Schema Access

Supabase postgrest requires an explicit schema in the client. Two options:

### Option A — per-query schema client (recommended)
```js
// Create a billing-schema client (reuse existing env creds)
const billing = supabase.schema('billing');
// then: await billing.from('sw_payments').select(...)
```

**Problem:** `.schema()` on service-role client may not work if the JWT has `role` claims locked. The service-role key works across schemas. But `.from('billing.sw_payments')` is NOT valid supabase-js syntax — you must use `.schema('billing').from('sw_payments')`.

### Option B — expose billing tables on public schema via a VIEW (NOT recommended)
Would reintroduce the public-schema clutter we just removed. Skip.

### Option C — set `search_path` in a supabase-js client
Supabase-js does not support arbitrary `search_path` on the query builder. You must use `.schema()`.

**CONFIRMED DECISION: Option A.** Every file that touches billing tables creates a `billing` schema client:
```js
const supabase = createClient(url, serviceRoleKey);
const billingDb = supabase.schema('billing');
```

For the service modules, inject a `db` (billing schema client) instead of hardcoding a `public` client — so they're testable.

---

## 5. Target Architectructure (payments.js split)

The audit recommended extracting services; follow that. New structure:

```
backend/services/billing/
   orders.service.js          // POST /create-order
   verification.service.js    // POST /verify (signature + provider + amount authority)
   activation.service.js      // atomic claim + provision steps + outbox
   subscription.service.js    // period math, cancel, expiry sweep
   webhook-ingest.service.js  // persist event → enqueue → process idempotently
   refund.service.js          // partial/full refund logic (sw_refunds)
```

And thin HTTP routes:
```
backend/routes/payment/payments.js   // < 150 lines, delegates to services
```

### Rules encoded (from audit §Recommended Architecture)
1. Every terminal state change: `UPDATE ... WHERE status='<expected>'`, check affected rows.
2. Provisioning side-effects (quota RPC, emails) only after the claim succeeds; failures → outbox row retried by reconciliation job.
3. All Razorpay inbound payloads persist to `sw_webhook_events` (unique event id) first, process second.
4. Amount authority = `sw_payments.amount_paise` snapshot (not live plan price).
5. Provider status `captured` required for activation.

---

## 6. Wiring the billing schema client into services

### `planService.js`
```js
let db = null; // billing schema client
function getDb() {
    if (!db) db = supabase.schema('billing');
    return db;
}
// then: await getDb().from('sw_plans')...
```

### `entitlements.service.js`
Uses `requireDb()` from `./db.js`. Need to check if `db.js` exposes a schema-switchable client. If not, either:
- Add a billing client in `db.js`, or
- Create the schema client locally in entitlements.

### `analytics.js`
Already uses `.schema('ai_meta')`. Change `.schema('public')` → `.schema('billing')` for the 4 billing queries. But NOTE: `plan_economics` view is in `ai_meta` (unchanged, still correct).

---

## 7. Route-by-Route Changes

### Existing routes (change schema + fix bugs)

| Route | Current behavior | New behavior |
|-------|------------------|--------------|
| `GET /plans` | public, planService | Same, billing schema |
| `GET /subscription` | own subscription | Same + billing schema + include **history** count |
| `POST /create-order` | orders + pending row | Same + **idempotency key** (M2) + billing schema |
| `POST /verify` | HMAC + activate | **Split**: verification.service (fail-closed provider + status captured + amount assert) + activation.service (atomic claim + outbox) |
| `POST /webhook` | stateless, 200-always | **Persist event** → idempotent process → handle `payment.failed` → 4xx on bad signature |
| `GET /history/:userId` | last 50 payments | Same + billing schema |
| `POST /refund` | admin, sync refunded | **Refund.service** + sw_refunds table + partial refund + async status |
| `GET /status/:paymentId` | proxied fetch | Same + billing schema |
| `GET /readiness` | info disclose | **Restrict to admin** (M3) or remove |

### New routes (from audit findings)

| Method & Route | Auth | Purpose | Fixes |
|----------------|------|---------|-------|
| `POST /api/payments/cancel` | session | Set `cancel_at_period_end=true` | H2 |
| `GET /api/payments/invoices` | session | List own invoices | H7 |
| `GET /api/payments/invoices/:id` | session (self) | Download invoice | H7 |
| `GET /api/payments/usage` | session | Real quota endpoint (replaces dead H1) | H1 |
| `POST /api/payments/attempts/:id/retry` | session | Retry failed activation (outbox) | C2 |

---

## 8. Cron Jobs to Add

In `routes/service/cron.routes.js`, add:

| Job | Function | Schedule | Purpose |
|-----|----------|----------|---------|
| `expire-subscriptions` | `billing.expire_subscriptions()` | daily | C1 — downgrade expired paid subs to free |
| `reconcile-activations` | new SQL/Node job | hourly | C2 — find `status='success'` payments with failed activation (activation_state='failed'), retry outbox |
| `cleanup-stale-orders` | SQL | hourly | M2 — expire `pending` orders older than N hours |

---

## 9. Email handling fix

M1: email recipient/name come from session/profile — never from request body.
- Verify route: take `email`/`name` from `pgtooluser` row (session-derived), **not** `req.body`.

---

## 10. Suggested Implementation Order

```
Step 1: planService.js — billing schema client (smallest, unblocks /plans)
Step 2: entitlements.service.js — billing schema + expiry enforcement (C1)
Step 3: analytics.js — .schema('billing') (read-only)
Step 4: Split payments.js into billing/services/*
Step 5: Wire thin payments.js router to services
Step 6: Webhook ingest service (persist + idempotent + fail-visible)
Step 7: Refund service (sw_refunds + partial refunds)
Step 8: New routes: cancel, invoices, usage, retry
Step 9: Cron jobs (expire, reconcile, cleanup)
Step 10: M1 email fix (session-derived contact)
```

Each step is independently testable and revertible.

---

## 11. Testing Strategy

There are ZERO billing tests today. Add before/when implementing:

| Test file | Covers |
|-----------|--------|
| `__tests__/billing/signature.test.js` | `verifyPaymentSignature`, `verifyWebhookSignature` |
| `__tests__/billing/verify.test.js` | verify happy path, ownership, replay, bad sig, amount, captured-vs-authorized |
| `__tests__/billing/webhook.test.js` | captured, duplicate, invalid sig → 4xx, order.paid extraction, failed, refund partial/full |
| `__tests__/billing/race.test.js` | verify + webhook concurrent → one activation |
| `__tests__/billing/expiry.test.js` | expire_subscriptions cron |
| `__tests__/billing/science.test.js` | activation atomic claim + outbox retry |

---

## 12. Open Questions / Risks

| Risk | Mitigation |
|------|------------|
| `.schema('billing')` client may need service-role key with right JWT claims | Verify in a smoke test immediately after planService change |
| `requireDb()` in entitlements may not expose schema switching | Add billing client to `db.js` or create locally |
| `plan_economics` view in `ai_meta` reads `ai_user_quota` (unchanged) — confirm it still works | It only touches ai_meta, so no change |
| Frontend dead `/usage` endpoint — decide delete vs implement | Recommend implementing real endpoint in Step 8 to avoid breaking FE if wired later |

---

## 13. Summary

| Item | Count |
|------|-------|
| Files rewritten | 1 (`payments.js` → services) |
| Files reused with edits | 3 (`planService`, `entitlements`, `analytics`) |
| New service files | 6 (`services/billing/*`) |
| New routes | ~5 (`cancel`, `invoices`, `usage`, `retry`, readiness-admin) |
| New cron jobs | 3 (`expire`, `reconcile`, `cleanup-orders`) |
| Bugs fixed | C1-C5, H1-H2, H6-H7, M1-M3, M6 |
| Test files to add | ~6 |
