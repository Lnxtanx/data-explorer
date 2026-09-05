# Frontend Client-Side Audit Plan — Payments & Subscriptions (SW Data Explorer / Schema Weaver)

> Prepared to settle the "where should payment be processed?" confusion and drive a clean,
> consistent client-side implementation.
> Companion doc: `PAYMENTS_API_CONTRACT.md` (the verified server contract).
>
> **Audited 2026-08-27.** Everything below is grounded in the actual code across the three
> frontend repos. Findings were verified directly (not assumed).

---

## 0. Executive summary

There are **three** client web apps, and the billing/payment code is **duplicated**
and **inconsistent** across them. The core confusion the user raised is real and is
caused by a **broken redirect loop** + **three separate Razorpay integrations**:

1. **`schema-weaver`** — marketing/landing site (`schemaweaver.vivekmind.com`). Has the
   `/pricing` page but **zero checkout logic**. Its plan CTAs `window.open` the SQL Editor
   with `?plan=<id>`.
2. **`frontend`** — SQL Editor (`sql-editor.schemaweaver.vivekmind.com`). **Fully integrated**
   Razorpay checkout inside a "Plans & Billing" settings modal.
3. **`sw-data-explorer`** — Data Explorer (`data-explorer.schemaweaver.vivekmind.com`).
   A **near-identical fork** of the same Razorpay "Plans & Billing" modal.

**The redirect loop (why users get confused):** The billing "Upgrade" button *inside* both
product apps opens the marketing pricing page `schemaweaver.vivekmind.com/pricing` in a new
tab; the pricing page's CTAs open `?plan=<id>` links back to the SQL Editor. **But neither
product app reads the `?plan=` query param** (verified: they only parse `?invite=` /
`?teamInvite=` / OAuth `?code=`), so a user who follows the loop must manually re-navigate to
Settings → Plans & Billing → click the right plan. Net effect: purchase UX bounces between
two domains with no auto-continuation.

---

## 1. Current state (verified)

### 1.1 The three apps & their roles

| Repo folder | pkg name | React | Routing | Host | Payment code present? |
|---|---|---|---|---|---|
| `schema-weaver` | `tanstack_start_ts` | 19 | TanStack Router/Start | `schemaweaver.vivekmind.com` | **No checkout** — only `/pricing`, `/compare`, `/cancellation-policy`, `/refund-policy` |
| `frontend` | `vite_react_shadcn_ts` | 18 | react-router v6 | `sql-editor.schemaweaver.vivekmind.com` | **Full Razorpay checkout** in Settings → Plans & Billing |
| `sw-data-explorer` | `sw-data-explorer` | 18 | react-router v6 | `data-explorer.schemaweaver.vivekmind.com` | **Full Razorpay checkout** (fork of `frontend`'s) |

Backend (single): `backend` → `api-node.schemaweaver.vivekmind.com`, mounted `/api/payments`.

### 1.2 Where payment/subscription UI lives today

- **SQL Editor** (`frontend`): `src/components/settings/PlansSettings.tsx` (483-line
  plans + Razorpay + billing history), mounted in `SettingsModal.tsx:83-84` under the
  "Plans & Billing" sidebar tab. No route — it's inside a modal.
- **Data Explorer** (`sw-data-explorer`): `src/components/settings/PlansSettings.tsx`
  (fork), `SettingsModal.tsx:50-53`. Same story, also inside the Settings modal.
- Both load Razorpay via `<script src="https://checkout.razorpay.com/v1/checkout.js">`
  in `index.html:6` → global `window.Razorpay` (no npm SDK).

### 1.3 Checkout flow (identical in both product apps)

`handleUpgrade(plan)`:
1. `POST /api/payments/create-order { planId }` → `{ order: { id, amount, currency, keyId, planName } }`
2. `new window.Razorpay({ key, amount, currency, order_id, prefill, handler, modal })`
3. `handler` (onSuccess) → `POST /api/payments/verify` with razorpay order/payment/signature
   → invalidate `payments.*`, `user.profile`, `subscription`, `ai-usage` caches.
4. `rzp.on('payment.failed', ...)` → error toast.
5. Workaround hack: toggles `document.body.style.pointerEvents` because Radix Dialog
   locks the body (fragile, duplicated in both apps).

### 1.4 Endpoints the client hits today

| Function | Endpoint | Used by UI? |
|---|---|---|
| `getPlans` | `GET /api/payments/plans` | Yes (PlansSettings) |
| `getSubscription` | `GET /api/payments/subscription` | Yes |
| `createOrder` | `POST /api/payments/create-order` | Yes (checkout) |
| `verifyPayment` | `POST /api/payments/verify` | Yes (checkout) |
| `getPaymentHistory` | `GET /api/payments/history/:userId` | Yes (billing table) |
| `getAIUsage` | `GET /api/ai/usage` | Yes (quotas) |
| `getUsage` | `GET /api/payments/usage/:userId` | **No (dead code)** — and note: backend route is `/usage` (no `:userId`), so this is a stale/broken helper |
| `getPaymentStatus` | `GET /api/payments/status/:paymentId` | No (dead code) |
| `requestRefund` | `POST /api/payments/refund` | No (dead code) |

### 1.5 Backend endpoints with NO client UI yet (built on backend, unused by clients)

`POST /api/payments/renew`, `POST /cancel`, `POST /reactivate`,
`GET /invoices`, `/invoices/:id`, `POST /attempts/:id/retry`. These exist server-side and
are ready, but no client screen calls them. This is the biggest untapped surface for the new
client work.

---

## 2. Confirmed problems / gaps

### P1. Confusing dual purchase path in both product apps
`PlansSettings` has **two** upgrade paths:
- Inline plan cards → **in-app Razorpay modal** (works).
- Header "Upgrade" button → `window.open('https://schemaweaver.vivekmind.com/pricing?plan=<id>', '_blank')` — **external redirect**.
Users see inconsistent behavior between the two buttons in the same screen.

### P2. Broken `?plan=` deep-link (confirmed)
`schema-weaver/src/routes/pricing.tsx` CTAs link to `sql-editor...?plan=starter|pro_monthly|power_monthly`,
but **no code in `frontend` or `sw-data-explorer` reads `?plan=`**. Verified: only `?invite` /
`?teamInvite` / OAuth params are read. Result: clicking a plan on the pricing page does **not**
pre-select that plan or open checkout. The loop is aesthetically complete but functionally dead.

### P3. Broken `/settings` deep-link in SQL Editor AI panel (confirmed)
`frontend/src/components/ai-panel/AIPanelShell.tsx:578,598` — quota-reached "View plans"/"Upgrade"
buttons call `window.open('/settings','_self')`, but **no `/settings` route exists** in
`frontend/src/App.tsx` → hits the `*` NotFound route. Upgrade nudge is broken.

### P4. Duplicated, drifting billing code
`PlansSettings.tsx`, `usePayments.ts`, `useSubscription.ts`, `useUserProfile.ts`, `useAIUsage.ts`,
`UsageSettings.tsx`, `SettingsModal/Sidebar`, `queryKey` factory are **forked** between
`frontend` and `sw-data-explorer`. Any backend contract change must be ported twice; drift is likely.
Also the `src/components/payment/` dir in sw-data-explorer is empty, and `UsageFooter.tsx` in
`frontend` is orphaned (unused).

### P5. Client call / backend contract mismatches
- `verifyPayment` in **sw-data-explorer** still sends `user_id`, `plan_id`, `email`, `name`
  (backend ignores them; SQL Editor already omits `user_id`). Fork drift.
- `getUsage(userId)` → `/api/payments/usage/:userId` but backend route is `/usage` → stale/dead.
- Stale unused helpers (`getPaymentStatus`, `requestRefund`, `usePlans`, `useUsage`,
  `usePaymentHistory`) remain in the API layer.

### P6. Pricing data is hard-coded, not live
`schema-weaver/src/routes/pricing.tsx` hard-codes Starter/Pro/Power prices and plan-ids
(`starter`, `pro_monthly`, `power_monthly`). The actual plan catalog is served by
`GET /api/payments/plans`. Two sources can drift (prices/plan ids/features).

### P7. No subscription-management UX
There is **no cancel / renew / reactivate / invoices UI** anywhere on the client, even though
the backend fully supports it (pay-first model means these matter — renewal and cancel-at-period-end
are core flows). Users currently manage by email or the static legal pages.

---

## 3. The decision: where should payment be processed?

Two viable architectures. Recommended: **App #1 (single source of truth)**.

### Option A (RECOMMENDED): Keep checkout in the product apps; fix the loop
- The authenticated **product apps** (`frontend` SQL Editor and `sw-data-explorer`) are the only
  places that have the session cookie → they **must** call `/create-order` + `/verify`.
- The marketing site stays a **non-transacting** pricing/display layer: it can show plan info
  (fetched from `/api/payments/plans`) but all purchase actions deep-link into the right product
  app and **pre-open checkout** via a real, implemented `?plan=` handler.
- Result: one checkout implementation per product app, no redirect bouncing, no marketing auth needed.
- **Treat `frontend` and `sw-data-explorer` as two instances of the SAME user account**
  (shared backend/session), so a plan bought in either shows in both. Shared module preferred (P8).

### Option B (not recommended, more work): centralize checkout on the marketing site
- Move all purchase/verify to `schemaweaver.vivekmind.com`. Requires the marketing site to obtain a
  session (currently has none) and to share that session with the product apps, or to do a full
  redirect-to-back-with-token dance. High effort, worse UX (auth context split), risk to security
  (session handoff). Only choose this if "billing must live in marketing" is a hard product requirement.

> **Recommendation:** Option A. Fix the redirect loop (P2/P3), make the marketing page fetch live
> pricing (P6), and implement the missing subscription-management UI (P7) inside the product apps'
> Settings. Deprecate the confusing external-pricing "Upgrade" button (P1) or make it consistent.

---

## 4. Proposals / audit actions (drive the client rebuild)

Prioritized work items. Each is scoped to a repo and references the verified server contract.

### 4.1 [P] Shared billing module (fix P4) — `frontend` + `sw-data-explorer`
- Extract a single shared `billing` client module (api fns + hooks + types) used by both product
  apps. Options: a small internal package, or a repo-local shared folder with a copy/lint guard.
  At minimum: a single canonical `payments.ts` + `useSubscription.ts` + `queryKeys`, and a script/CI
  check that the two `PlansSettings.tsx` don't drift (or unify into one component library).
- Remove dead helpers: `getUsage` (point to `/api/ai/usage` instead), `usePlans`/`useUsage`/
  `usePaymentHistory` if unused, `getPaymentStatus`, `requestRefund` (keep only if admin surfaces it).
- Purge the empty `src/components/payment/` dir and orphaned `UsageFooter.tsx` (or wire it up).

### 4.2 [P] Implement `?plan=` deep-link (fix P2) — `frontend` + `sw-data-explorer`
- On boot, read `?plan=<id>`; after login, open the Settings modal directly on the `plans` tab and
  **auto-select / highlight** that plan (or even auto-open checkout). Verified gap → simple, high value.

### 4.3 [P] Fix broken upgrade deep-links (fix P3) — `frontend`
- `AIPanelShell` quota buttons: either add a real `/settings`-style route or change
  `window.open('/settings','_self')` to open the Settings modal on the `plans` tab (same mechanism as 4.2).

### 4.4 [M] Live pricing on marketing page (fix P6) — `schema-weaver`
- Replace hard-coded price/feature/plan-id blocks with data from `GET /api/payments/plans`
  (public endpoint), so `/pricing`, `/compare` can't drift from the real catalog. Keep the page
  presentational (no checkout here).

### 4.5 [M] Consistent upgrade CTA (fix P1) — `frontend` + `sw-data-explorer`
- Decide one behavior for the billing header "Upgrade": either always in-app checkout (preferred,
  keeps the user authenticated) or always external pricing. In-app is the better UX and removes the
  bounce; keep the external link only as an informational "view all plans" secondary link.

### 4.6 [M] Add subscription-management UX (fix P7) — product apps
- **Cancel flow:** button → `POST /api/payments/cancel` (cancel_at_period_end) + show expiry date;
  **Reactivate:** `POST /api/payments/reactivate`.
- **Renewal:** show "Renews <date>"; a "Renew now" → `POST /api/payments/renew` → same Razorpay
  flow, or shallow re-purchase via `/create-order` on the same plan.
- **Invoices:** list `GET /api/payments/invoices`; optional detail `GET /api/payments/invoices/:id`.
- **Retry:** after a failed payment, offer `POST /api/payments/attempts/:id/retry`.
- All of these are ready server-side (see `PAYMENTS_API_CONTRACT.md` §3).

### 4.7 [P] Align `/verify` body and usage endpoint (fix P5) — both apps
- Drop `user_id`/`plan_id`/`email`/`name` from the sw-data-explorer `/verify` call (server derives
  from the session; matches SQL Editor).
- Fix `getUsage` to call `GET /api/payments/usage` (or drop it and rely on `GET /api/ai/usage`).

### 4.8 [M] End-to-end verification harness
- Only after the client exists: run real orders against the live Sandbox (Razorpay test mode) to
  validate `/create-order → Razorpay → /verify → /subscription → /usage → invoice email`, plus the
  pay-first expiry (cron `expire-subscriptions`), renewal, cancel, and refund. Until then the loop
  (**P2**) is exactly why "payment isn't tested" — the two halves (client, server) haven't been
  connected on every path.

---

## 5. Risk register

| # | Risk | Mitigation |
|---|---|---|
| R1 | Billing code drift between `frontend` and `sw-data-explorer` | Shared module (4.1) |
| R2 | `?plan=` loop gives false sense of a working funnel | Implement real deep-link (4.2), verify E2E (4.8) |
| R3 | Pay-first expiry surprises users (features cut at period end) | Show expiry date + reminder + renew button (4.6); backend already sends expiring emails |
| R4 | Marketing pricing drifts from live catalog | Fetch from `/api/payments/plans` (4.4) |
| R5 | Session/auth must be shared across product apps | Confirm both apps use the same backend cookie session (they do — shared account); document that plans bought in one show in both |

---

## 6. Suggested sequencing

1. **Phase A — decision + targeting (now):** confirm Option A; decide whether to build a shared
   billing module (4.1) vs. port fixes twice.
2. **Phase B — unblock the funnel (cheap, high value):** 4.2 (`?plan=` deep-link), 4.3 (fix
   `/settings`), 4.7 (verify-body/usage alignment).
3. **Phase C — consistency:** 4.1 shared module + 4.5 consistent CTA + cleanup dead code.
4. **Phase D — new features:** 4.6 subscription-management UI (cancel/renew/reactivate/invoices/retry).
5. **Phase E — live pricing marketing (4.4)** + **full E2E verification (4.8)**.

## 7. Files/commands to verify during implementation (authoritative sources)
- Server contract: `sw-data-explorer/docs/billing-audit/PAYMENTS_API_CONTRACT.md`
- Server routes: `backend/routes/payment/payments.js` , `backend/routes/service/cron.routes.js`
- Marketing pricing: `schema-weaver/src/routes/pricing.tsx`
- SQL Editor billing: `frontend/src/components/settings/PlansSettings.tsx`, `frontend/src/lib/api/payments.ts`
- Data Explorer billing: `sw-data-explorer/src/components/settings/PlansSettings.tsx`, `sw-data-explorer/src/lib/api/payments.ts`
- Deep-link gap: `frontend/src/pages/Index.tsx:251` , `frontend/src/App.tsx`
- Broken settings link: `frontend/src/components/ai-panel/AIPanelShell.tsx:578,598`
