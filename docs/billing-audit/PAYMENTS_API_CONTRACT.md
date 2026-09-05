# Payments / Billing — Server-Side API Contract

> Reference for building the **client-side** (frontend) API layer.
> All shapes below are copied directly from the current backend implementation
> (`backend/routes/payment/payments.js`, `backend/routes/service/cron.routes.js`,
> and the billing services under `backend/services/billing/*`). Verified 2026-08-27.
>
> **Billing model = PAY-FIRST, NO AUTO-DEBIT.** A subscription stays active only
> for its paid `current_period_end`. When the period lapses, a cron job expires it
> to the free plan. The user must pay again before features come back.

---

## 1. Base paths & auth model

- Backend mounts (see `backend/index.js:126`):
  - Billing/payments: `POST/GET …/api/payments/*`
  - Cron/service endpoints: `POST …/api/service/cron/*`
- Auth is **cookie-session** based (`session_id` httpOnly cookie). The middleware
  resolves the session and sets `req.userId`.
- `requireAuth` → returns `401 { error: "Unauthorized - Please log in" }` if no
  valid session. Send cookies automatically (fetch `credentials: 'include'`).
- `requireAdminSecret` → requires header `X-Admin-Secret`, compares (constant-time)
  against `ADMIN_SECRET`. Returns `401` on mismatch, `503` if env not set. **Not
  user-facing** — internal admin tooling only.
- Rate limiters (on money-mutating routes): `paymentLimiter`, `verifyLimiter`,
  `webhookLimiter` from `backend/middleware/rateLimit.js`.

### Emails
Emails are **always** sent to the user's **DB email** (resolved from `pgtooluser`) —
never to a client-supplied address. They are best-effort and deduped (a failed send
is retried by reconciliation; duplicates suppressed).

---

## 2. Public / low-auth endpoints

### 2.1 `GET /api/payments/plans` — PUBLIC
List active plans (paginated/ordered by price asc).
- **Response 200:**
```json
{ "plans": [ { "id": "pro", "name": "Pro", "price_inr": 149900, "price_usd": 1999.00,
  "billing_interval": "month", "is_active": true, "credit_limit_monthly": 500000,
  "credit_limit_daily": 10000, "concurrent_limit": 5, "allowed_models": [...],
  "features": [...] } ] }
```
- `price_inr` is integer **paise**, `price_usd` is a decimal **dollars**. See §3.2 for
  how the client must pass the amount back.

### 2.2 `POST /api/payments/webhook` — PUBLIC (Razorpay → server)
Razorpay posts payment events here. **Not called by the client.** Server verifies
HMAC over the raw body with `RAZORPAY_WEBHOOK_SECRET`, dedupes on
`x-razorpay-event-id`, and persists to `sw_webhook_events`.

---

## 3. User-facing money endpoints (PROTECTED — `requireAuth`)

### 3.1 `GET /api/payments/subscription`
Current subscription for the logged-in user (projection of `sw_subscriptions`).
- **Response 200** (fresh or downgraded-to-free fallback):
```json
{ "plan_id": "pro", "status": "active", "provider": "razorpay",
  "current_period_start": "2026-08-15T00:00:00.000Z", "current_period_end": "2026-09-15T00:00:00.000Z",
  "cancel_at_period_end": false, "canceled_at": null, "sw_plans": { "id": "pro", "name": "Pro" } }
```
- If no row: returns `plan_id:"free"`, `status:"active"`, `sw_plans:null`.
- **Client use:** render current plan, period dates, downgraded-to-free banner.

### 3.2 `POST /api/payments/create-order`
Create a Razorpay order + `pending` payment row for a plan.
- **Body:** `{ "planId": "pro", "currency": "INR" }` (`currency` optional, defaults INR).
- **Response 200:**
```json
{ "success": true, "order": { "id": "order_...", "amount": 149900, "currency": "INR",
  "keyId": "rzp_live_...", "planId": "pro", "planName": "Pro", "paymentRowId": "uuid" } }
```
- On 15-min dedup reuse, response includes `order.reused: true`.
- **Errors:** `400` unknown/inactive plan or no USD price (when USD); `503` payments not configured.
- **Client flow:** call this → open Razorpay checkout with `order.id` + `keyId` →
  on success read `razorpay_payment_id` + `razorpay_signature` from the checkout
  handler → call `/verify`.
- `paymentRowId` is informational (server keys everything off Razorpay ids).

### 3.3 `POST /api/payments/renew` — C1
Renewal order for the user's **current active paid plan** (reuses ownership /
dedup logic of create-order). For pay-first renewals.
- **Body:** `{ "currency": "INR" }` (optional, defaults INR).
- **Response 200:** same shape as create-order.
- **Errors:** `404` no renewable paid subscription (i.e. user is on free).

### 3.4 `POST /api/payments/verify`
Verify a just-completed Razorpay payment and atomically activate the subscription.
- **Body (snake_case, from Razorpay checkout success):**
```json
{ "razorpay_order_id": "order_...", "razorpay_payment_id": "pay_...", "razorpay_signature": "..." }
```
- **Response 200:**
```json
{ "success": true, "plan": { "id": "pro", "name": "Pro", "credit_limit_monthly": 500000 } }
```
- On a duplicate/race (webhook already activated it):
```json
{ "success": true, "alreadyProcessed": true }
```
- **Errors:** `400` invalid/missing fields, bad signature, `payment_not_captured`
  (message: "Payment not yet captured. Please wait and try again."), or amount
  mismatch (potential tampering); `403` order not owned by user; `409` already
  processed in another state.
- Server checks: HMAC signature → provider status must be `captured` → amount matches
  the payment-row snapshot → atomic single-transaction grant (subscription + quota +
  history + payment success).
- **Client flow:** after Razorpay checkout `onSuccess`, call `/verify`, then call
  `/subscription` (and `/usage`) to reflect the upgrade. Best-effort: email + invoice
  are sent server-side.

### 3.5 `GET /api/payments/history/:userId` — own only
Last 50 payments for the user.
- **Response 200:**
```json
{ "success": true, "payments": [ { "id": "uuid", "orderId": "order_...",
  "paymentId": "pay_...", "planId": "pro", "amount": 1499, "currency": "INR",
  "status": "success", "paymentMethod": "upi", "createdAt": "..." } ] }
```
- `amount` is already **divided by 100** (rupees/dollars), `status` in
  `pending|processing|success|failed|refunded`.
- **Errors:** `403` if `:userId !=` logged-in user.

### 3.6 `GET /api/payments/status/:paymentId`
Live provider status for one of your payments (lookup by `razorpay_payment_id`).
- **Response 200:** `{ "success": true, "payment": <Razorpay payment object> }`
- **Errors:** `404` not found / not owned.

### 3.7 `POST /api/payments/cancel` — H2
Graceful cancellation: set `cancel_at_period_end=true` (plan stays active until the
period ends, then expires to free). Sends a cancellation email.
- **Body:** none.
- **Response 200:** `{ "success": true, "alreadyCanceled": false, "subscription": {...} }`
  (or a 200 with `alreadyCanceled:true` if it was already set).
- **Errors:** `404` no active sub; `400` already on free.

### 3.8 `POST /api/payments/reactivate` — D
Undo a scheduled cancellation: `cancel_at_period_end=false`.
- **Body:** none.
- **Response 200:** `{ "success": true, "alreadyActive": false, "subscription": {...} }`
  (or `alreadyActive:true`).
- **Errors:** `404` no sub; `400` already on free.

### 3.9 `GET /api/payments/invoices`
All invoices for the logged-in user, newest first (`sw_invoices`).
- **Response 200:** `{ "success": true, "invoices": [ <sw_invoices row> ] }`

### 3.10 `GET /api/payments/invoices/:id` — own only
- **Response 200:** `{ "success": true, "invoice": <sw_invoices row> }`
- **Errors:** `404` not found / not owned.

### 3.11 `GET /api/payments/usage` — H1
Real quota for the user via `ai_meta.get_quota_status(user_id)`.
- **Response 200:** `{ "success": true, "quota": <get_quota_status rows> }`
  (expect fields like credits used / limit, daily / monthly, concurrent, reset dates).

### 3.12 `POST /api/payments/attempts/:id/retry` — own only — C2
Retry activation for a payment left in `failed`/`processing` state
(e.g. a payment captured but provisioning failed). Re-runs the atomic activation.
- **Body:** none. `:id` = `sw_payments.id` (paymentRowId).
- **Response 200:** `{ "success": true, "message": "Activation retried successfully" }`
- **Errors:** `404` payment not found / not yours; `409` payment not in a retryable
  state (`failed`/`processing` only).
- **Client use:** on failure capture, surface a "Retry" action that calls this.

---

## 4. Admin-only endpoints (PROTECTED + `X-Admin-Secret`)

### 4.1 `GET /api/payments/readiness` — M3
Configuration sanity check (no secret leakage).
- **Response 200:**
```json
{ "configured": true }
```
or `{ "configured": false, "missing": ["razorpay"|"razorpay_webhook"|"resend"|"supabase"] }`

### 4.2 `POST /api/payments/refund` — admin only
Refund a payment (full or partial). On a full refund the user is downgraded to free.
- **Body:** `{ "paymentId": "pay_...", "amount": <paise, optional; omit for full refund>, "reason": "string" }`
- **Response 200:** `{ "success": true, "refund": { "id": "rfnd_...", "amount": 149900,
  "currency": "INR", "status": "processed" }, "downgraded": true }`
- **Errors:** `404` payment not found; `400` no refundable amount / invalid status.
- Enforces remaining-refundable ceiling.

### 4.3 `GET /api/payments/admin/webhook-events`
Read persistent webhook log for reconciliation.
- **Query:** `?limit=` (default 100, max 500).
- **Response 200:** `{ "success": true, "events": [ { "id", "razorpay_event_id",
  "event_type", "signature_valid", "processed", "error", "created_at", "processed_at" } ] }`

### 4.4 `GET /api/payments/admin/refunds`
Read normalized refund records.
- **Query:** `?limit=` (default 100, max 500).
- **Response 200:** `{ "success": true, "refunds": [ <sw_refunds row + payments> ] }`

### 4.5 `POST /api/payments/admin/backfill` — C3
Ensure every user has a billing subscription + quota row (idempotent).
- **Body:** `{ "batchSize": 1000 }` (optional).
- **Response 200:** `{ "success": true, "backfilled": 12 }`
- **Failure:** `{ "success": false, "backfilled": 0, "error": "..." }` (500).

---

## 5. Cron endpoints (server-side jobs, `X-Admin-Secret` only)

Not client-facing. Internal scheduler calls these. `POST /api/service/cron/*` all
use `requireAdminSecret`.

| Endpoint | Action |
|---|---|
| `/session-cleanup` | Expire stale sessions |
| `/invitation-cleanup` | Expire stale invites |
| `/billing/expire-subscriptions` | **Downgrade expired paid subs → free** (pay-first enforcement) |
| `/billing/remind-expiring` | Email users expiring within `daysAhead` (body, default 7) |
| `/billing/send-usage-warnings` | Email users over `thresholdPct` (body, default 80) |
| `/billing/reconcile-activations` | Retry failed activations + resend lost confirmation emails |
| `/billing/cleanup-stale-orders` | Fail pending orders older than 24h |
| `/billing/backfill` | Same as `/admin/backfill`, body `{ batchSize }` |

Response shapes (examples): `{ success:true, expired, emailed, failed }`,
`{ success:true, checked, emailed, failed, skippedDedup }`,
`{ success:true, cancelled }`, `{ success:true, backfilled }`.

---

## 6. Authorization summary for the client

| Route | Requires | Notes |
|---|---|---|
| `GET /plans` | none | public |
| `POST /webhook` | none | Razorpay→server only |
| `GET /subscription` | cookie session | logged-in user |
| `POST /create-order` | cookie session | rate-limited |
| `POST /renew` | cookie session | rate-limited |
| `POST /verify` | cookie session | verify-rate-limited |
| `GET /history/:userId` | session + own user | |
| `GET /status/:paymentId` | session + own payment | |
| `POST /cancel` | session | |
| `POST /reactivate` | session | |
| `GET /invoices` / `GET /invoices/:id` | session + own | |
| `GET /usage` | session | |
| `POST /attempts/:id/retry` | session + own | |
| everything under `admin/*`, `refund` | session + `X-Admin-Secret` | internal only |
| `POST /api/service/cron/*` | `X-Admin-Secret` | internal cron only |

**Client auth discovery:** a protected call returning `401 { error: "Unauthorized - Please log in" }`
means the user must sign in; there is no separate "is this session valid" billing
endpoint — use `GET /subscription` or any protected route for that.

---

## 7. Client-side integration map (recommended flow)

### 7.1 Purchase / renewal (pay-first)
1. `GET /plans` → render pricing.
2. `GET /subscription` → know if user is on free (show "Upgrade") or on a paid plan
   (show "Renew"). If `plan_id === 'free'` keep the existing plan's `previous_subscription_id`
   chain is not needed client-side.
3. On **Upgrade** → `POST /create-order { planId, currency }`.
   On **Renew** (active paid) → `POST /renew { currency }`.
4. Use `order.id` + `order.keyId` to open the Razorpay checkout.
5. In the checkout `onSuccess` handler capture `razorpay_order_id`,
   `razorpay_payment_id`, `razorpay_signature`, then `POST /verify`.
6. Refresh `GET /subscription` + `GET /usage`.
   - If `/verify` returns `alreadyProcessed:true`, just refresh state (webhook won).

### 7.2 Cancel → Reactivate
- `POST /cancel` then reflect `cancel_at_period_end:true`.
- Before period end, `POST /reactivate` sets it back to `false`.

### 7.3 Payment failure recovery
- A `failed` payment (user-visible via `GET /history` where `status==='failed'` or on
  `/verify` returning an error) lets the user retry activation via
  `POST /attempts/:paymentRowId/retry` (only valid for `failed`/`processing` states).
- New purchase attempt after a failure → `POST /create-order` again (server dedups).

### 7.4 Usage display
- `GET /usage` for live quotas; `GET /plans` for configured limits to render bars.

---

## 8. Data model notes (what the client reads)

- **`sw_subscriptions`**: one row per user (`UNIQUE(user_id)`), always present after
  the C3 backfill. Purchases UPSERT this row in place; the money/event trail lives in
  `sw_payments`, `sw_subscription_history`, `sw_invoices`, `sw_refunds`.
- **`sw_payments.status`**: `pending → processing → success | failed | refunded`.
  Immutable log — every payment is its own row.
- **`sw_subscription_history.event_type`**: `upgraded | renewed | expired | downgraded |
  refunded | canceled | reactivated`. Renewal chains via `previous_subscription_id`.
- **Currency/amount**: stored as integer paise (`amount_paise`); email/display divide
  by 100. Default currency is `INR` unless a plan has a USD price and the client
  requests `USD`.

---

## 9. Things that still need a real-environment check (not verifiable from code)
1. Migrations `20260827000000`, `20260827000001` (opt-in), `20260827000002` are applied
   to the live Supabase project — `20260827000002` adds the atomic/backfill RPCs used by
   `/verify`, `/renew`, `/attempts/:id/retry`, `/admin/backfill`, and the cron backfill.
2. Env present: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_ID`,
   `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RESEND_API_KEY`, `ADMIN_SECRET`,
   `COOKIE_SECRET` (required in production).
3. Razorpay dashboard webhook URL → this backend's `/api/payments/webhook` with the
   matching secret, and checkout enabled with key + secret.
4. End-to-end execution is only meaningful once the client calls these endpoints; the
   server tests (135 passing) cover services & routing, not live Razorpay/Supabase.
