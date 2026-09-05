# Billing/Email/Payment Infrastructure — Audit Findings (Consolidated)

**Date:** 2026-08-27
**Method:** Three parallel subagent audits (email infra, payment routes/money-flow, subscription processing) across `C:\schema-weaver\backend` + the billing migration.
**Status:** Findings below. Awaiting scope decision before applying fixes.

---

## A. CRITICAL — Money/data integrity bugs

### A1. `sw_payments.status` never becomes `'success'` on a normal activation
`provisioning.service.js:44-48` sets only `activation_state='completed'`, never `status='success'`.
- **Refunds broken**: `refund.service.js:99-102` and `webhook.service.js:238-241` mark a payment `'refunded'` only `.eq('status','success')` → 0 rows matched.
- **Analytics revenue = $0**: `analytics.js:88,340` filter on `status==='success'`.
- **User history stuck "processing"**: `payments.js:191-211`.
- Direct fix: set `status:'success'` alongside `activation_state:'completed'`.

### A2. Webhook `handleRefund` downgrades to free on ANY refund (incl. partial)
`webhook.service.js:238-244` unconditionally marks `'refunded'` + `downgradeToFree`, unlike `refund.service.js:96-106` which only downgrades on full refund. Partial refund → user wrongly downgraded.

### A3. Duplicate refund email + duplicate downgrade
Admin `refund.service.js` and webhook `handleRefund` both `sendRefundProcessed` and both `downgradeToFree` for the same refund. Idempotency only on the `sw_refunds` row, not email/downgrade.

### A4. `order.paid` writes the ORDER id into `razorpay_payment_id`
`webhook.service.js:102-107` — for `order.paid`, `payment.id` is the order id, not payment id. Real payment id is at `payload.order.entity.payments[0].id`. Collides with the unique partial index `idx_sw_payments_payment_unique` (`migration:182`).

### A5. Invoice generated but NEVER emailed (your key question)
`issueInvoice` (`activation.service.js:159-198`) inserts into `sw_invoices` on both /verify and /webhook, but **no email is ever sent for an invoice**. `sendInvoiceIssued` does not exist. Legacy `invoicePaidTemplate` stub is broken (hardcodes USD, discards tx id). No PDF/download route. Invoices only visible via `GET /invoices`.

### A6. `expireSubscriptions` never invalidates entitlements cache
`maintenance.service.js:28-67` runs the RPC but never `invalidateEntitlements` → ≤60s stale PAID/seat window after expiry (only the provisioning/downgrade paths invalidate).

## B. Email-specific gaps (from email audit)

- **B1. `payment.authorized` is treated as a payment FAILURE** → emails a bogus "Action Required: Payment failed" + kills a pending row. Should be a no-email branch.
- **B2. Confirmation email lost on failure** — activation_state flipped to `'completed'` before the email fires; reconcile only retries `'failed'` payments, so a failed confirmation email is never retried. Wrong tx id on retries (`maintenance.service.js:110` uses `pay.id`, `payments.js:374` uses `''`).
- **B3. No user_keyed email_logs** — no caller passes `user_id`, so `email_logs.user_id` is always NULL; the RLS policy (user sees own logs) matches nothing.
- **B4. `sendDowngradedToFree` is dead code** — nothing triggers it; refund/expiry downgrades never announce the downgrade (but see A3 duplicate concern).
- **B5. Reminder/usage warning spam** — `remindExpiringSubscriptions` and `sendUsageLimitWarnings` email every cron run with no dedup/cooldown.
- **B6. Welcome email essentially broken** — gated on `created_at === updated_at` (`auth.js:94,168`) which almost never equals due to differing precision.
- **B7. `notification_preferences` table never read** — emails ignore user marketing/subscription prefs.

## C. Subscription/architecture gaps

- **C1. NO recurring/renewal at all.** All orders are one-time Razorpay orders. `current_period_end` → silent downgrade to free. History enum has `'renewed'/'reactivated'` but nothing emits them. Product mismatch: "monthly subscription" pricing but no auto-renewal.
- **C2. Subscription row + quota row updated NON-atomically** (two HTTP calls). Failure window leaves user billed-but-free-quota. No compensation/rollback.
- **C3. Main-migration backfill is a no-op** (`PERFORM handle_new_user_billing()` on a trigger fn). Only fixed by the separate `20260827000001` (runs?) — if not run, existing users have no/incorrect rows.
- **C4. `downgradeToFree` doesn't log a history event** (`downgraded`/`refunded`/`expired` enum values unused).
- **C5. `previous_subscription_id` never populated** (dead column).

## D. Route gaps (from route audit)

- No invoice download (PDF) / no "email my invoice" action.
- No reactivate / undo-cancel / resume endpoint (`cancel_at_period_end=false`).
- No endpoint to read webhook/refund records for reconciliation.
- `/verify` failure email can fire even when the row was already claimed (M-7).

---

## Proposed fix phases

**Phase 1 — Email + money correctness (do now):**
1. A1: set `status:'success'` on successful provisioning (fixes refund/analytics/history).
2. A2: webhook `handleRefund` full-refund-aware (only downgrade+mark refunded on full).
3. A3: suppress duplicate refund email (notify only when the refund was newly inserted / not admin-initiated).
4. B1: remove `payment.authorized` from the failure-email set.
5. A5: build the invoice email — new `invoiceIssuedTemplate` + `sendInvoiceIssued` + trigger in `issueInvoice` (return the generated `invoice_number`).
6. B3: propagate `user_id` into `sendEmail`/`logEmail` for billing emails.
7. A6: invalidate entitlements in `expireSubscriptions`.

**Phase 2 — Recommended hardening:**
- B4 wire downgrade email (idempotently), B5 dedup reminders/usage, B2 retryable confirmation email, A4 order.paid payment-id fix, C4 history logging, D route gaps.

**Phase 3 — Product decisions (need your input):**
- C1 renewal architecture (real recurring vs one-time + manual renewal).
- C3 backfill confirmation, C2 atomic activation TOC, C5 dead column cleanup.

---

## Open questions for you (decide before/with Phase 1)
1. **Invoice email**: send an invoice email on every paid activation? (Payment-confirmation already emails the user; would you want BOTH a payment-receipt AND a separate invoices email, or have the invoice email double as the receipt?) Format: HTML only, or also PDF download link?
2. Scope: fix all of Phase 1 now, or just the email-specific items (B1, A5, B3, A3) and defer money-flow (A1, A2)?
3. Renewal: real recurring billing, or keep one-time + rename plans? (Biggest product decision.)

---

## Appendices (2026-08-27)

### Appendix A — Razorpay docs verification (current as of 2026)
Cross-checked against official Razorpay docs + SDK (v2.9.x) and current community guides. Our integration is **correct and current**:

- **Webhook signature**: HMAC-SHA256 (hex) over the **raw body**, keyed with the **webhook secret** (separate from the API key secret), delivered in `X-Razorpay-Signature`. We verify against `req.rawBody` (captured via the `express.json({verify})` callback) → correct. Manual HMAC == official `validateWebhookSignature`.
- **Two distinct signatures** (easy to mix up): webhook = raw body + webhook secret; checkout payment = `order_id|payment_id` + API key secret. We keep these separate (`verifyWebhookSignature` vs `verifyPaymentSignature`) → correct.
- **Raw-body trap**: `express.raw()` is recommended; our global `express.json({verify})` sets `req.rawBody` before parsing, which is functionally equivalent for signing. `req.rawBody || JSON.stringify(req.body)` fallback is only a safety net.
- **Events handled**: `payment.captured`/`order.paid` (capture), `payment.failed`/`order.failed` (failure), `refund.created` (+ processed/failed) — matches our `PROCESSABLE_*` sets and refund branch.
- **Dedup**: Razorpay best practice says to use the **`x-razorpay-event-id` HTTP header** (unique per event) for de-duplication. **Implemented**: `handleWebhook` now prefers `x-razorpay-event-id` over payload body ids for `sw_webhook_events.razorpay_event_id` (`webhook.service.js`, wired in `payments.js`).
- **Retries/backoff**: Razorpay retries non-2xx with exponential backoff for 24h. Our persistent, idempotent `sw_webhook_events` table (unique `razorpay_event_id`, atomic claim + `processed` flag) handles this safely.
- **Amounts**: smallest currency unit (paise for INR: 5000 = ₹50). We send `price_inr` (already paise) for INR and `price_usd*100` for USD → correct.
- **Webhook secret fail-closed**: `verifyWebhookSignature` now throws if the secret is missing (was silently returning `false`), per the analysis fix.

### Appendix B — Currency/price model (verified + decision)
- **Default currency is INR** (`routes/payment/payments.js`: `currency = 'INR'`).
- **NO runtime conversion exists.** `billing.sw_plans` stores `price_inr` (INTEGER paise) and `price_usd` (NUMERIC dollars) as **two hand-set values**:
  - Free 0 / $0 · Starter ₹1,199 / $15 · Pro ₹2,499 / $29 · Power ₹6,999 / $79.
- Razorpay charges exactly the amount+currency we send; it does **not** convert for us.
- Order picks the column matching the requested currency; the currency is validated (a `price_usd` missing/0 for a USD request → 400, no NaN).
- **Decision (2026-08-27): keep the two hand-set price model, no conversion.** Admin maintains INR and USD independently in `billing.sw_plans`. A DB-driven exchange-rate table was considered but declined (predictability + no stale-rate risk).

### Appendix C — Phase 2 hardening (EXECUTED 2026-08-27)
All Phase 2 items implemented + verified (`node --check` all pass, imports smoke-tested, full `npm test` green at 135/135 / 11 suites — only the pre-existing, unrelated `agent-connection` load failure remains):

- **A4 — `order.paid` payment-id fix.** `webhook.service.js` `handleCapture`/`handlePaymentFailed` now derive the real provider payment id from `payload.order.entity.payments[0].id` for `order.*` events (was using the ORDER id, which collided with the unique partial index on `razorpay_payment_id`). The real payment id is now also **persisted** onto `billing.sw_payments` (guarded `IS NULL`) so the confirmation email + reconciliation carry the correct transaction id.
- **B2 — retryable confirmation email.** `reconcileActivations` (`maintenance.service.js`) gained a `resendMissingConfirmations()` pass that re-sends `paymentConfirmationTemplate` for `activation_state='completed'` payments whose confirmation email was never logged as `sent` in `email_logs` (deduped per window). Previously email-only failures were never retried because `activation_state` had already flipped to `'completed'`.
- **B4 — idempotent downgrade email.** `sendDowngradedToFree` is now wired into `downgradeToFree` (`subscription.service.js`) and fires only when the user was actually on a paid plan; a new `hasRecentEmailLog` helper dedupes it via `email_logs` (so admin-refund + webhook-refund + retries cannot double-notify).
- **B5 — dedup reminders/usage emails.** `remindExpiringSubscriptions` (cooldown 6 days) and `sendUsageLimitWarnings` (cooldown 3 days) now skip users who already got that template via `hasRecentEmailLog`. Returns a `skippedDedup` count.
- **C4 — history logging.** `downgradeToFree` now logs a `sw_subscription_history` row (`downgraded`/`refunded`) using the passed `eventType`. Refund paths pass `'refunded'`; expiry already logged `'expired'` in the RPC.
- **D — route gaps.**
  - New `POST /api/payments/reactivate` (`reactivateSubscription` in `subscription.service.js`) → undo-cancel (`cancel_at_period_end=false`, clears `canceled_at`, logs `reactivated`).
  - New admin read endpoints: `GET /api/payments/admin/webhook-events` and `GET /api/payments/admin/refunds` (admin-secret guarded) for reconciliation.
  - M-7: `/verify` no longer marks/sends a failure email when the payment row was already claimed/activated/refunded (`verification.service.js`).
- **New shared helper:** `hasRecentEmailLog({user_id, template, status, withinHours})` in `resend/service.js` (exported) — dedup guard that fail-opens so a DB hiccup never suppresses a legitimate email.

### Appendix D — Phase 3: renewal, atomic activation, backfill, dead column (EXECUTED 2026-08-27)

C1/C2/C3/C5 implemented + verified (`node --check` all pass, full `npm test` still 135/135 / 11 suites — see Appendix C for the only pre-existing failure).

- **C1 — renewal (decision: in-app renewal, one-time Razorpay orders).**
  - `orders.service.js` adds `createRenewalOrder({userId, currency='INR'})` → 404 if no active paid subscription; otherwise reuses `createOrder` (15-min order idempotency, INR default).
  - `activation.service.js` `activateSubscription` is renewal-aware: if the user already holds an active non-free sub on the **same** plan, it extends from the existing `current_period_end` (no lost time) and emits `eventType='renewed'` (previously-unemitted enum value) with `p_previous_subscription_id = existingSub.id`. Plan change → `'upgraded'`. Lifetime → `9999-12-31`.
  - New route `POST /api/payments/renew` (`requireAuth` + `paymentLimiter`).
  - **Deliberately deferred (documented, not built):** true auto-debit via Razorpay Subscriptions API (requires RBI e-mandate, a new checkout UX, and `subscription.charged` webhooks). This is the only path that doesn't require the customer to re-enter payment details.
- **C2 — atomic activation (TOC = one DB transaction).**
  - New SECURITY DEFINER RPC `billing.upsert_active_subscription(...)` (migration `20260827000002_phase3_renewal_atomic.sql`) commits subscription upsert + quota upgrade + history insert + payment success (`status='success'`, `activation_state='completed'`) + `subscription_id` link in **one** transaction. Previously this was 2 HTTP calls → a failure window where the customer was billed but not upgraded.
  - `activateSubscription` now calls the RPC once; `processPaymentFailure`/`attemptActivation` split is gone from the primary path (db.js/tests unaffected).
  - **Recoverability (no billed-but-stuck):** on an atomic-RPC failure the payment is marked `activation_state='failed'` + `failure_reason`, so the reconciliation cron retries it. `reconcileActivations` and the `/attempts/:id/retry` route now re-run the **full atomic** `activateSubscription` (self-healing) instead of `runProvisioning`. Idempotency on retry is guaranteed by dedup guards inside the RPC (history insert only if no row for the payment), `issueInvoice` (skip if invoice exists for the payment), and the confirmation email (`hasRecentEmailLog`).
- **C3 — existing-user backfill (runtime, idempotent).**
  - Root cause of the prior Phase-7 backfill gap: `20260827000000` called `PERFORM billing.handle_new_user_billing()` (a **trigger** function) → silently no-op.
  - New SECURITY DEFINER RPC `billing.backfill_missing_billing(p_batch_size)` (default 1000) creates a `free` subscription + `billing_usage` row only where missing (uniform positive payment = already-provisioned heuristic). Wired as `backfillMissingBilling({batchSize})` in `maintenance.service.js` (fail-open `{backfilled, error}` if the RPC is absent) and exposed via `POST /api/payments/admin/backfill` (admin-secret) and `POST /api/service/cron/billing/backfill`.
  - Old manual `20260827000001_backfill_existing_users_fix.sql` remains valid but is superseded.
- **C5 — dead column un-dead.** `billing.sw_subscriptions.previous_subscription_id` is now populated on renewal/upgrade as the chain-pointer (`existingSub.id`), not dropped.
- **Anti-cost guards:** confirmation email amount/currency read from the payment row (authority), not the plan's INR column; `runProvisioning` remains only in `reconcileActivations`'s legacy output path and is no longer on the primary activation path.
- **Deploy order (required):** run migration `supabase/migrations/20260827000002_phase3_renewal_atomic.sql` in the Supabase SQL editor **before** shipping the RPC-backed code paths. Code is fail-open for backfill and hard-fails (with retry marking) for activation if the RPC is missing.
