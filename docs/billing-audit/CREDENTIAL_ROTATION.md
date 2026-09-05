# Credential Rotation Checklist

Live credentials are present in `backend/.env`. The file is git-ignored and
**not tracked** by git (verified: `git check-ignore backend/.env` → ignored,
`git ls-files backend/.env` → empty). Rotation is a manual, out-of-band ops
task — it cannot be performed from code. Use this checklist when you are ready
to rotate.

## Why rotate
- `backend/.env` contains a live Razorpay API key (`rzp_live_...`) and the
  Razorpay webhook secret. If the machine / repo copy / logs ever leak, these
  could be abused for forged payments or webhook spoofing.

## Prerequisites
- Access to the Razorpay Dashboard at the account that owns the key.

## Steps

### 1. Generate new keys in Razorpay Dashboard
- Dashboard → Settings → API Keys → **Generate new key**.
- Razorpay shows the **Key ID** and **Key Secret** once (secret not shown again).
- Copy both into `backend/.env`:
  - `RAZORPAY_KEY_ID=rzp_live_<new>`
  - `RAZORPAY_KEY_SECRET=<new secret>`
- Keep the old key active until the app has been restarted and a real checkout +
  webhook round-trip passes.

### 2. Regenerate the webhook secret
- Dashboard → Settings → Webhooks → regenerate `X-Razorpay-Signature` secret.
- Update `RAZORPAY_WEBHOOK_SECRET=...` in `backend/.env`.

### 3. Optionally rotate Resend + Supabase
- `RESEND_API_KEY` → Resend Dashboard.
- `SUPABASE_SERVICE_ROLE_KEY` → Supabase Dashboard → Settings → API (rotate the
  `service_role` key; do NOT rotate `anon` for service auth).

### 4. Restart and verify
- Restart the backend.
- `GET /api/payments/readiness` (with admin auth + secret) should now return
  `{ "configured": true }`.
- Run a real checkout, then confirm the webhook `order.paid`/`payment.captured`
  round-trip activates a subscription (check `billing.sw_webhook_events` for
  `signature_valid=true` and a successful activation).

### 5. Deactivate the old key
- Only after the round-trip passes, revoke the old key in the Dashboard.

## Guardrails
- Never commit `.env`. It is already in `backend/.gitignore`.
- Never log key values. The `verifyWebhookSignature` change now throws (fail
  closed) instead of silently rejecting if the webhook secret is missing, so a
  missing secret is loud rather than silent.
- Consider injecting secrets via your host/CI secret store instead of a checked
  file.
