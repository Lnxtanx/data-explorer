# Client-Side Implementation Plan — Shared Billing/Checkout for SQL Editor + Data Explorer

> **Decision (confirmed):** Checkout happens **inside the product apps** (SQL Editor + Data Explorer),
> NOT on the marketing site. Both product apps share the same backend, the same billing, and one plan
> unlocks BOTH products. This plan builds **one shared billing module** so we don't write/maintain the
> payment code twice.
>
> Companion references:
> - Server contract: `sw-data-explorer/docs/billing-audit/PAYMENTS_API_CONTRACT.md`
> - Client audit & gaps: `sw-data-explorer/docs/billing-audit/CLIENT_SIDE_AUDIT_PLAN.md`
>
> **Verified current facts** (2026-08-27):
> - No root `package.json` / no npm workspaces → no existing shared package boundary.
> - Both apps use path alias `@/*` → `./src/*`.
> - Billing files (overlapping/duplicated across both apps):
>   - `frontend`: `src/lib/api/payments.ts`, `src/hooks/usePayments.ts`, `src/hooks/useSubscription.ts`,
>     `src/hooks/useAIUsage.ts`, `src/components/settings/PlansSettings.tsx`,
>     `src/components/settings/UsageSettings.tsx`, `src/components/payment/UsageFooter.tsx` (orphaned)
>   - `sw-data-explorer`: `src/lib/api/payments.ts`, `src/hooks/usePayments.ts`,
>     `src/hooks/useAIUsage.ts`, `src/components/settings/PlansSettings.tsx`,
>     `src/components/settings/UsageSettings.tsx`
> - Shared backend endpoints already used by BOTH apps: `GET /plans`, `GET /subscription`,
>   `POST /create-order`, `POST /verify`, `GET /history/:userId`, `GET /api/ai/usage`.
> - Both load Razorpay via `<script …/checkout/v1/checkout.js>` in their `index.html:6` → global `window.Razorpay`.
> - Backend endpoints with **no client UI yet** (ready to build): `POST /renew`, `POST /cancel`,
>   `POST /reactivate`, `GET /invoices`, `/invoices/:id`, `POST /attempts/:id/retry`.

---

## 0. Goal & architecture

**Goal:** A single-billing-codebase so a plan works identically in SQL Editor and Data Explorer,
with no login/session code on the marketing site and no duplicated payment logic.

**Architecture (3 layers):**
1. **Shared billing package** — pure/organic code (API fns + types + React Query hooks + the
   Razorpay checkout helper + payment UI) consumed by BOTH apps.
2. **Both product apps mount** the shared UI/hooks into their existing Settings modal.
3. **Marketing page** stays presentational: fetch live pricing, deep-link into the product with a
   working `?plan=` handler. (No checkout, no auth.)

Because there is **no npm workspace**, choose one packaging option (recommend **Option 1**).

### Packaging options for the shared module
- **Option 1 (RECOMMENDED): repo-local shared folder + alias.**
  Put shared billing code in `C:\schema-weaver\shared\billing` (JS/TS, no build step), and add a
  path alias `@billing` in **both** `tsconfig.app.json` files AND `vite.config.ts` resolve aliases
  pointing to it. Vite bundles it directly — no workspace/npm publish needed. Zero tooling risk.
- **Option 2: npm workspace.** Convert the repo to workspaces and publish a private `@schema-weaver/billing`
  package. Cleaner boundaries but requires root `package.json`, install/lockfile changes across 3 apps —
  heavier lift; only choose if you already want a monorepo toolchain.

This plan assumes **Option 1**.

---

## 1. Phase A — Create the shared billing module

New folder: `shared/billing/`

| File | Contents (moved from the per-app copies) |
|---|---|
| `types.ts` | `SwPlan`, `Subscription`, `PaymentHistoryItem`, `AIQuotaStatus`, `OrderResult`, `VerifyResult`. Source = current `frontend/src/lib/api/payments.ts` + `useSubscription.ts` types. |
| `payments.api.ts` | `getPlans`, `getSubscription`, `createOrder({planId,currency})`, `verifyPayment({razorpay_order_id,razorpay_payment_id,razorpay_signature})`, `getPaymentHistory(userId)`, `getPaymentStatus`, **+ NEW**: `renewSubscription`, `cancelSubscription`, `reactivateSubscription`, `getInvoices`, `getInvoice(id)`, `retryActivation(paymentRowId)`. All call the existing `@/*` fetch wrapper (`client.ts`). |
| `quota.api.ts` | `getAIUsage()` → `GET /api/ai/usage` (replace the stale `GET /api/payments/usage/:userId`). |
| `usePayments.ts` | React Query hooks: `usePlans`, `useSubscription`, `usePaymentHistory`, `useCreateOrder`, `useVerifyPayment`, `useRenewal`, `useCancel`, `useReactivate`, `useInvoices`, `useRetry`. Unify `queryKeys.payments`. |
| `useAIUsage.ts` | `useAIUsage` + proactive quota-exceeded handling (one copy). |
| `checkout.ts` | `openRazorpayCheckout({ order, plan, user, onCapture })` — isolates the `window.Razorpay` bootstrap, the `pointerEvents` Radix-Dialog workaround, and the onSuccess→`verifyPayment` + cache-invalidation wiring. Fixes the duplicate fragile hack. |
| `BillingSettings.tsx` | The consolidated Settings tab: current plan card (with **Renew / Cancel / Reactivate** controls), plan cards (upgrade), Razorpay checkout trigger, billing history table, invoices list. One component used by both apps. |
| `UsageSettings.tsx` | Usage/quota dashboard (one copy). |
| `index.ts` | Barrel export. |

Notes:
- Delete per-app duplicates after wiring (Phase C) — see cleanup list in §5.
- The shared module must not import app-specific components (no Radix `Dialog` from the app shell);
  keep it self-contained (accept an `onClose`/`user` prop) so both apps can mount it identically.

---

## 2. Phase B — Configure BOTH apps to consume the shared module

For **each** of `frontend` and `sw-data-explorer`:

1. **TS path alias** — add to `tsconfig.app.json` `compilerOptions.paths`:
   ```jsonc
   "paths": { "@/*": ["./src/*"], "@billing/*": ["../../../shared/billing/*"] }
   ```
   (Adjust relative depth from `src/` to the repo root `shared/`.)
2. **Vite resolve alias** — in each `vite.config.ts` add:
   ```ts
   resolve: { alias: { '@billing': fileURLToPath(new URL('../../shared/billing', import.meta.url)) } }
   ```
   (Vite resolves it; no build step in the shared folder expected.)
3. **Mount the UI** — replace each app's `PlansSettings`/`UsageSettings` usage in
   `SettingsModal.tsx` (`frontend` lines ~83-84, `sw-data-explorer` lines ~50-53) with the shared
   `<BillingSettings user={...} />` / `<UsageSettings />`.
4. **Checkout entry** — keep both `index.html` Razorpay `<script>` tags (checkout SDK stays global;
   the shared `checkout.ts` references `window.Razorpay`).
5. **CSP** — both `public/_headers` already allow `*.razorpay.com`; verify `connect-src` includes the
   shared backend host (it does today).

**Session/account note:** Both apps already authenticate to the SAME backend cookie-session, so a plan
bought in Data Explorer already appears in SQL Editor (and vice-versa) via the shared `GET /subscription`
+ `GET /api/ai/usage`. Confirm this with a cross-app test in Phase E.

---

## 3. Phase C — New subscription-management features (both apps via shared module)

These are server-ready but have NO client UI today. Add them to `BillingSettings.tsx`:
- **Renew:** "Renews <date>" + "Renew now" → `POST /api/payments/renew` → open Razorpay checkout → `/verify`.
- **Cancel:** "Cancel subscription" → `POST /api/payments/cancel` (cancel_at_period_end) → show expiry date + "canceled" state.
- **Reactivate:** when `cancel_at_period_end` → "Keep my plan" → `POST /api/payments/reactivate`.
- **Invoices:** list from `GET /api/payments/invoices`; detail `GET /api/payments/invoices/:id`.
- **Retry:** after a `failed` payment → `POST /api/payments/attempts/:id/retry` (surfaced from the
  billing history table where `status==='failed'`).
- **Payment history:** already present; add the retry + status links on failure rows.

---

## 4. Phase D — Fix the funnel gaps (cross-app)

These come from `CLIENT_SIDE_AUDIT_PLAN.md` P2/P3/P1/P6:
- **D1 (`?plan=` deep-link):** in BOTH apps' auth/boot, read `?plan=<id>`; after login open Settings on
  the `plans` tab and pre-highlight/auto-select that plan (ideally auto-open checkout). This makes the
  marketing CTA links functional.
- **D2 (broken `/settings`):** in `frontend`, change `AIPanelShell.tsx:578,598` quota buttons from
  `window.open('/settings')` to open the Settings modal on the `plans` tab (same mechanism as D1).
- **D3 (consistent CTA):** keep in-app checkout as the primary upgrade path; the marketing-pricing
  external link stays as an informational secondary link only.
- **D4 (live pricing on marketing):** `schema-weaver/src/routes/pricing.tsx` fetches plan data from
  `GET /api/payments/plans` instead of hard-coded prices/ids; CTAs keep the `?plan=` deep-link (now
  functional via D1).
- **D5 (align verify body):** drop `user_id`/`plan_id`/`email`/`name` from `/verify` calls (server
  derives from session). Handled automatically by using the shared `payments.api.ts`.

---

## 5. Phase E — Cleanup & verification

**Cleanup (only after BOTH apps are on the shared module):**
- Delete per-app billing files that moved to `shared/billing`:
  - `frontend`: `src/lib/api/payments.ts`, `src/hooks/usePayments.ts`, `src/hooks/useSubscription.ts`,
    `src/hooks/useAIUsage.ts`, `src/components/settings/PlansSettings.tsx`, `UsageSettings.tsx`,
    `src/components/payment/UsageFooter.tsx` (orphaned).
  - `sw-data-explorer`: `src/lib/api/payments.ts`, `src/hooks/usePayments.ts`, `src/hooks/useAIUsage.ts`,
    `src/components/settings/PlansSettings.tsx`, `UsageSettings.tsx`.
- Remove the now-unused `queryKeys.payments` from each app's `queryClient.ts` (moved to shared).

**Verification (must-run):**
1. `npm run build` + `npm run lint` in BOTH `frontend` and `sw-data-explorer`.
2. Cross-app test with Razorpay **test mode**: in Data Explorer buy a plan → confirm the same plan
   shows in SQL Editor's `GET /subscription` and `GET /api/ai/usage` (and vice-versa) — proves the
   shared-backend/single-subscription model.
3. E2E paths (server already covered by tests; client is new):
   - create-order → Razorpay → verify → subscription/usage refresh → confirmation + invoice emails
   - pay-first expiry: run cron `expire-subscriptions`, confirm features drop to free, "Renew now" works
   - cancel → reactivate; renew extending `current_period_end`; invoices list; failed-payment retry
4. Confirm `?plan=` deep-link: marketing pricing → product app → auto-opens Plans tab on chosen plan.

---

## 6. Sequencing / ownership

| Phase | Scope | Deliverable | Depends on |
|---|---|---|---|
| A | Create `shared/billing` | Shared types + API + hooks + checkout + `BillingSettings`/`UsageSettings` | none |
| B | Wire both apps | Aliases + mount shared UI in both Settings modals | A |
| C | New management features | Renew/cancel/reactivate/invoices/retry UI (shared) | B |
| D | Funnel fixes | D1 `?plan=` handler, D2 `/settings` fix, D3 CTA, D4 live pricing, D5 verify body | B |
| E | Cleanup + verify | Remove duplicates, build/lint green, cross-app + E2E tests | A–D |

**Suggested order:** A → B (get both apps on shared code first, so C and D are written once), then C → D → E.

---

## 7. Open decisions for you to confirm
1. **Shared-module location:** `shared/billing/` at repo root with alias `@billing` (Option 1) — OK?
   (If you'd rather introduce real npm workspaces, say so and I'll re-scope.)
2. **New management features scope (Phase C):** ship **all** of renew/cancel/reactivate/invoices/retry
   in the first pass, or start with just **Renew + Cancel + Reactivate** (the pay-first essentials) and
   add invoices/retry after?
3. **`?plan=` behavior (D1):** auto-**open** checkout for the chosen plan, or auto-open the Plans tab
   and just **highlight** it (less aggressive UX)?
