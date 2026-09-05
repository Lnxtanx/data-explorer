# Billing Three-Area Audit & Remediation Plan

**Created:** 2026-08-27
**Depends on:** `BACKEND_API_REMEDIATION_PLAN.md` (backend API refactor, status IMPLEMENTED)
**Status:** AWAITING APPROVAL — no code changes made from this audit
**Scope:** The three areas the user asked to audit BEFORE further implementation:
  1. **Authorization** on all billing routes + service files
  2. **End-to-end DB logic flow** across all new billing tables
  3. **Full billing email flow** analysis / build plan

---

## PART 1 — AUTHORIZATION AUDIT

### 1.1 Root cause: `req.userRole` is NEVER set anywhere in production code

- Assignments to `req.userRole` exist ONLY in `backend/test/middleware/permissionCheck.test.js`.
- Reads/defaults: `middleware/rbac.js:43` (`req.userRole || 'viewer'`), `middleware/permissionCheck.js:44`, `payments.js:38`.
- Middleware applied to `/api/payments` (from `index.js`): `sessionMiddleware` (sets `req.session`/`req.userId` only), `apiLimiter`, CSRF (skipped on `/payments/webhook`), `requireAuth`. **None set `req.userRole`.**
- `requireRole('admin')` always evaluates `req.userRole || 'viewer'` → hierarchy 0 < 2 → **always 403 for everyone, including real admins.**

### 1.2 Route-by-route table

| Route | Method | Protection today | Verdict |
|---|---|---|---|
| `/readiness` (payments.js:37) | GET | `requireAuth` + inline `req.userRole` check | ❌ Broken — never passes |
| `/plans` (payments.js:56) | GET | Public | ✅ OK |
| `/subscription` (payments.js:71) | GET | `requireAuth` + own-user query | ✅ OK |
| `/create-order` (payments.js:105) | POST | `requireAuth` + `paymentLimiter` + own-user scope | ✅ Mostly OK |
| `/verify` (payments.js:130) | POST | `requireAuth` + own-user check in service | ⚠️ No rate limiter |
| `/webhook` (payments.js:167) | POST | Public; sole auth = HMAC signature | ⚠️ Storage-DoS risk |
| `/history/:userId` (payments.js:183) | GET | `requireAuth` + inline own-user check | ✅ OK |
| `/refund` (payments.js:222) | POST | `requireAuth` + `requireRole('admin')` | ❌ BROKEN (always 403) + latent escalation risk |
| `/status/:paymentId` (payments.js:246) | GET | `requireAuth` + own-user filter | ✅ OK |
| `/cancel` (payments.js:271) | POST | `requireAuth` + own-user scope | ✅ OK |
| `/invoices` (payments.js:285) | GET | `requireAuth` + own-user filter | ✅ OK |
| `/invoices/:id` (payments.js:305) | GET | `requireAuth` + own-user filter | ✅ OK |
| `/usage` (payments.js:328) | GET | `requireAuth` + RPC scoped to user | ✅ OK |
| `/attempts/:id/retry` (payments.js:346) | POST | `requireAuth` + own-user filter | ⚠️ Re-runs privileged provisioning |

### 1.3 Findings

- **[CRITICAL] `/refund` is dead code + latent privilege-escalation hazard.**
  `processRefund` (refund.service.js:27) refunds ANY `paymentId` and `downgradeToFree` that user. ONLY protection is the broken route gate. If a naive fix sets `req.userRole='admin'` for authenticated users, any user could refund another user's payment. Must use `requireAdminSecret`.
- **[CRITICAL] `/readiness` never authorizes and, if fixed naively, leaks config presence** (`RAZORPAY_KEY_ID`, webhook secret, service-role presence). Gate with `requireAdminSecret`.
- **[HIGH] Service-layer functions have NO internal authorization** — `createOrder`, `verifyPayment`, `activateSubscription`, `runProvisioning`, `processRefund`, `downgradeToFree`, `cancelAtPeriodEnd`, `getUserProfile` all operate on any passed `userId`. Only route-level checks protect them.
- **[HIGH] Webhook storage-DoS**: event persisted BEFORE signature check (webhook.service.js:42-52); public unratelimited endpoint → attacker floods `sw_webhook_events`.
- **[HIGH] `/verify` no rate limiter** → unbounded provider fetches + failure-email spam (verification.service.js:66,76).
- **[MED] Non-constant-time secret compare** in `admin-auth.js:16` and `cron.routes.js:29` (plain `!==`).
- **[MED] Unsigned session cookie fallback** in auth.js:395.
- **[MED] Same broken `requireRole('admin')` pattern** in `routes/telemetry/telemetry.js:96,131` and `routes/email/email.js:68`.

### 1.4 Proposed fixes (auth)

1. Add `requireAdminSecret` to `/refund` and `/readiness` (from `middleware/admin-auth.js`), replacing the broken `req.userRole` gates.
2. Add a rate limiter to `/verify` mirroring `paymentLimiter` on `/create-order`.
3. Add a rate limiter + size guard to `/webhook`; optionally persist events only after signature validation.
4. Use `crypto.timingSafeEqual` in `admin-auth.js` and `cron.routes.js`.
5. Add internal-ownership/role checks inside money-moving service functions as defense-in-depth, OR document all external entry points.
6. Fix same broken-gate pattern in telemetry.js/email.js (or leave out of scope, per user).

---

## PART 2 — END-TO-END DB LOGIC FLOW AUDIT

### 2.1 Lifecycle trace

| Step | Path | Works? |
|---|---|---|
| Signup → free sub + quota | `public.pgtooluser` INSERT → `on_pgtooluser_billing` trigger → `handle_new_user_billing` | ✅ Trigger correctly recreated in migration (line 506-507). Backfill fix confirmed applied by user. |
| create-order | orders.service.js:15 → `sw_payments.pending` + Razorpay order | ✅ |
| verify/webhook claim | activation.service.js:20-42 atomic claim (`UPDATE...WHERE status='pending'`) | ✅ C2/C4 fixed |
| activate → subscription + history + quota + email | activation.service.js:58-132 | ✅ upsert on `user_id`; history logged |
| **Invoice generation** | — | ❌ **NOTHING inserts into `sw_invoices`.** `trg_sw_invoices_number` only numbers rows. `/invoices` routes (payments.js:289,309) return empty forever. |
| **`sw_payments.subscription_id` populated** | — | ❌ **NEVER set.** `subscription.service.js:37` sets `subscription_id` only in `sw_subscription_history`, not `sw_payments`. FK stays NULL. |
| **Renewal / recurring billing** | — | ❌ **NONE.** `orders.service.js` creates a single one-time order, not a Razorpay subscription. `expire_subscriptions` RPC downgrades to free but nothing renews. `payment.failed`/`subscription.charged` webhook events ignored. |
| Refund flow | refund.service.js:27 + webhook `refund.created` | ✅ state machine + `sw_refunds` + partial ceiling (C5) |
| Quota upgrade | `upgrade_user_quota` RPC — signature `(p_user_id, p_plan_id)` matches calls | ✅ |
| Expiry | `expire_subscriptions` RPC via cron | ✅ downgrade; **no email, no renewal** |
| RLS vs service-role | backend uses service_role → RLS bypassed | ✅ (note only) |

### 2.2 Findings

- **[CRITICAL] No invoice generation.** `sw_invoices` exists + numbered, but nothing ever creates a row. `/invoices` & `/invoices/:id` are permanently empty.
- **[CRITICAL] No renewal/recurring model.** One-time orders only. Users whose subscription "expires" are downgraded to free with no renewal path. No `subscription.charged`/`payment.failed` handling.
- **[HIGH] `sw_payments.subscription_id` never populated** — the FK designed to link a payment to the subscription created by it is always NULL.
- **[MED] `sw_subscription_history` correct** (from/to plan/status populated).

### 2.3 Proposed fixes (DB logic)

1. **Generate invoices on payment activation** — after `activateSubscription` succeeds (activation.service.js), insert a `sw_invoices` row linked to `subRow.id` and `paymentRowId` (the `trg_sw_invoices_number` trigger will number it).
2. **Set `sw_payments.subscription_id`** during activation — update the claimed payment row with the new `subRow.id`.
3. **Decide renewal architecture** — either (a) adopt Razorpay recurring subscriptions + handle `subscription.charged`/`subscription.auth_failed` webhooks, or (b) build an in-app renewal cron that issues a new one-time order before `current_period_end`. This is a decision point for the user.

---

## PART 3 — BILLING EMAIL FLOW AUDIT

### 3.1 Current send status

| Event | Sent? | Template exists? |
|---|---|---|
| Payment confirmed | ✅ provisioning.service.js:55-69 + reconcile retry | ✅ |
| Payment failed (HMAC bad sig) | ⚠️ ONLY on signature tamper (verification.service.js:66); NOT on genuine card/capture failure | ✅ |
| Refund processed | ⚠️ Admin path only (refund.service.js:110-122); **webhook refund path sends NONE** (webhook.service.js:142-186) | ✅ |
| Subscription expiring soon | ❌ `sendSubscriptionExpiring` defined+exported but ZERO callers | ✅ (unused) |
| Subscription canceled (period end) | ❌ `cancelAtPeriodEnd` sends none | ❌ |
| Downgrade to free | ❌ `downgradeToFree` sends none (used by refund + webhook + expiry) | ❌ |
| Subscription expired | ❌ `expireSubscriptions` returns only a count, never sends | ❌ |
| Renewal success / failure | ❌ no recurring model | ❌ |
| Invoice issued | ❌ `sw_invoices` never generated | ⚠️ legacy stub |
| Usage limit warning | ❌ `sendUsageLimitWarning` ZERO callers | ✅ (unused) |
| Dunning/payment retry | ❌ `payment.failed`/`payment.authorized` ignored in webhook | ❌ |
| Welcome (free signup) | ✅ auth.js:96,170 / email.js:43 | ✅ |

### 3.2 Findings

- `sendSubscriptionExpiring` and `sendUsageLimitWarning` are fully implemented but **dead code** (never wired to any cron).
- Webhook refund path (`handleRefund`) does not send `sendRefundProcessed` nor even import it → refunds originating from Razorpay's side produce no email.
- `email_logs` not user-keyed in any billing flow (wrappers pass `user_id=null`).
- sendEmail is fire-and-forget / `.catch()`-swallowed at all billing call sites; only the confirmation email has an outbox-style retry (via `activation_state='failed'` + reconcile cron). All other billing emails are one-shot and can be lost.
- `payment.failed` webhook events silently ignored → no genuine-failure/dunning emails.
- M1 (resolve recipient from DB via `getUserProfile`) is correctly applied in provisioning/refund, but NOT used in webhook refund path.

### 3.3 Proposed fixes (email)

1. **Wire `sendSubscriptionExpiring`** into a NEW cron (`remind-expiring`, N days before `current_period_end`) registered in `cron.routes.js`.
2. **Add `sendRefundProcessed` to webhook `handleRefund`** (resolve recipient via `getUserProfile(payRow.user_id)` — M1).
3. **Send `sendPaymentFailed` on genuine capture failure** (verification.service.js and webhook `payment.failed`).
4. **Add templates + senders** for: subscription canceled (`subscriptionCanceledTemplate`), downgrade to free (`downgradeToFreeTemplate`), subscription expired (`subscriptionExpiredTemplate`), invoice issued (replace `invoicePaidTemplate` stub), and (if renewal adopted) renewal success/failure.
5. **Disambiguate renewal emails** based on Part 2's renewal architecture decision.
6. **Persist `user_id` in email logs** for all billing senders (audit trail + RLS visibility).
7. (Optional) Add a durable outbox/queued-send layer + cron worker so billing emails are reliably delivered/retried.

---

## CONSOLIDATED IMPLEMENTATION ORDER (proposed)

| Phase | Area | Work |
|---|---|---|
| A1 | Auth | `requireAdminSecret` on `/refund` + `/readiness`; rate limiter on `/verify`; webhook rate limit + persist-after-verify; timing-safe secret compare |
| B1 | DB logic | Generate invoices on activation; set `sw_payments.subscription_id`; **decide renewal architecture** |
| E1 | Email | Wire `sendSubscriptionExpiring` cron; `sendRefundProcessed` in webhook; genuine `sendPaymentFailed` |
| B2 | DB/Email | If renewal adopted: subscription lifecycle emails |
| E2 | Email | New templates (cancel, downgrade, expired, invoice); user-keyed email logs; optional outbox |

---

## OPEN DECISIONS FOR USER

1. **Renewal architecture**: Razorpay recurring subscriptions (webhook-driven) vs in-app renewal cron (new one-time order before period end) vs defer renewal entirely for now? This determines B2/E1-subset.
2. **Scope of auth fixes**: fix only billing routes, or also the identical broken-gate pattern in `telemetry.js`/`email.js`?
3. **Email depth**: ship the minimal set (expiring + webhook refund + genuine failure) now, or the full set (cancel/downgrade/expired/invoice) including outbox durability?
4. Execution order preference for A1 / B1 / E1 phases.
