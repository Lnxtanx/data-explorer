# Billing Schema Remediation Plan

**Created:** 2026-08-27
**Updated:** 2026-08-27 — moved all billing tables to dedicated `billing` schema
**Depends on:** BILLING_INFRASTRUCTURE_AUDIT.md (same directory)
**Status:** PLANNING — not started
**Scope:** Database schema only (Supabase Postgres). Backend API and frontend changes follow separately.
**Prerequisite:** Pre-production — no real user data. All existing billing tables will be dropped and recreated from scratch.

---

## 0. Decision: Dedicated `billing` Schema

### Why

All billing tables currently live in `public` alongside unrelated app tables (`ai_projects`, `ai_chats`, `teams`, etc.). This creates:
- Visual clutter — 10+ `sw_*` tables mixed with unrelated tables
- Security ambiguity — RLS policies for billing mixed with app-level policies
- No clear ownership — anyone can see billing tables exist
- Harder reasoning — `public.sw_plans` vs `billing.sw_plans` is a meaningful distinction

### What changes

| Object | Current Location | New Location |
|--------|-----------------|--------------|
| `sw_plans` | `public` | `billing` |
| `sw_subscriptions` | `public` | `billing` |
| `sw_payments` | `public` | `billing` |
| `sw_topups` | `public` | **DROP** (dead) |
| `sw_plan_versions` | — (new) | `billing` |
| `sw_subscription_history` | — (new) | `billing` |
| `sw_invoices` | — (new) | `billing` |
| `sw_refunds` | — (new) | `billing` |
| `sw_webhook_events` | — (new) | `billing` |
| `ai_meta.ai_user_quota` | `ai_meta` | `ai_meta` (unchanged) |
| `ai_meta.ai_quota_events` | `ai_meta` | `ai_meta` (unchanged) |

### Consequence for backend code

Every `FROM sw_plans` becomes `FROM billing.sw_plans`. Every RPC referencing billing tables needs `search_path` updated. Since the backend is being rewritten in phase 2 anyway, this is the right time.

---

## 1. Current Schema Inventory

### Tables to drop from `public`

| Table | Reason to drop |
|-------|---------------|
| `public.sw_plans` | Recreate in `billing` with proper schema |
| `public.sw_subscriptions` | Recreate in `billing` with new columns |
| `public.sw_payments` | Recreate in `billing` with proper constraints |
| `public.sw_topups` | Dead — no code references it |

### Triggers/functions to drop from `public`

| Object | Reason |
|--------|--------|
| `public.sw_set_updated_at()` | Recreate in `billing` schema |
| `public.handle_new_user_billing()` | Recreate — references `billing.*` tables |
| `public.upgrade_user_quota()` | Recreate — references `billing.*` tables |

### Tables to keep (NOT part of billing schema)

| Table | Location | Why unchanged |
|-------|----------|---------------|
| `ai_meta.ai_user_quota` | ai_meta | AI quota, not billing — but RPCs reference billing tables |
| `ai_meta.ai_quota_events` | ai_meta | Quota audit log |

### RPCs in `public` that reference billing tables

These need to be recreated with `search_path = billing`:

| Function | Fix |
|----------|-----|
| `public.upgrade_user_quota(UUID, TEXT)` | Recreate — REVOKE from authenticated |
| `public.handle_new_user_billing()` | Recreate — seed into `billing.*` |

### RPCs in `ai_meta` that reference billing tables

These reference `ai_user_quota` (not billing tables) — **no changes needed**:

| Function | Status |
|----------|--------|
| `ai_meta.get_quota_status(UUID)` | No change |
| `ai_meta.acquire_agent_slot(UUID)` | No change |
| `ai_meta.release_agent_slot(UUID)` | No change |
| `ai_meta.deduct_credits(UUID, INTEGER, TEXT)` | REVOKE from authenticated |
| `ai_meta.cleanup_stale_slots()` | REVOKE from authenticated |
| `ai_meta.top_up_credits(UUID, BIGINT, TEXT)` | DROP (dead) |

---

## 2. Migration: Clean Drop

**WARNING:** This is irreversible. Only run in development/staging. No real user data exists.

```sql
-- =============================================================================
-- STEP 0: DROP everything from public schema
-- =============================================================================

-- Drop triggers first (they depend on functions)
DROP TRIGGER IF EXISTS sw_subscriptions_updated_at ON public.sw_subscriptions;
DROP TRIGGER IF EXISTS sw_plans_updated_at ON public.sw_plans;
DROP TRIGGER IF EXISTS on_pgtooluser_billing ON public.pgtooluser;

-- Drop functions
DROP FUNCTION IF EXISTS public.sw_set_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user_billing() CASCADE;
DROP FUNCTION IF EXISTS public.upgrade_user_quota(UUID, TEXT) CASCADE;

-- Drop tables (order matters: dependents first)
DROP TABLE IF EXISTS public.sw_topups CASCADE;
DROP TABLE IF EXISTS public.sw_payments CASCADE;
DROP TABLE IF EXISTS public.sw_subscriptions CASCADE;
DROP TABLE IF EXISTS public.sw_plans CASCADE;
```

---

## 3. Migration: Create `billing` Schema + Tables

```sql
-- =============================================================================
-- STEP 1: Create the billing schema
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS billing;

-- Grant usage to service_role (for Node backend)
GRANT USAGE ON SCHEMA billing TO service_role;

-- Deny direct access from authenticated role (all writes go through service_role)
-- authenticated can only read (via RLS)
REVOKE ALL ON SCHEMA billing FROM authenticated;
GRANT USAGE ON SCHEMA billing TO authenticated;
```

### 3.1 `billing.sw_plans` — plan catalog

```sql
CREATE TABLE billing.sw_plans (
    id                      TEXT PRIMARY KEY,
    name                    TEXT NOT NULL,
    price_inr               INTEGER NOT NULL DEFAULT 0,           -- paise (Razorpay minor units)
    price_usd               NUMERIC(8,2) NOT NULL DEFAULT 0,      -- USD major units (display only)
    billing_interval        TEXT NOT NULL DEFAULT 'month'
                                CHECK (billing_interval IN ('month', 'year', 'lifetime')),
    ai_pool_fraction        NUMERIC(4,3) NOT NULL DEFAULT 0.55,
    margin_rate             NUMERIC(4,3) NOT NULL DEFAULT 0.70,
    credit_limit_monthly    INTEGER NOT NULL,
    credit_limit_daily      INTEGER NOT NULL,
    concurrent_limit        INTEGER NOT NULL DEFAULT 1,
    max_tokens_per_run      INTEGER NOT NULL DEFAULT 50000,
    max_agent_duration_secs INTEGER NOT NULL DEFAULT 120,
    allowed_models          JSONB NOT NULL DEFAULT '[]'::jsonb,
    features                JSONB NOT NULL DEFAULT '[]'::jsonb,
    max_team_members        INTEGER DEFAULT 1,
    is_active               BOOLEAN NOT NULL DEFAULT true,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION billing.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER sw_plans_updated_at
    BEFORE UPDATE ON billing.sw_plans
    FOR EACH ROW EXECUTE FUNCTION billing.set_updated_at();
```

### 3.2 `billing.sw_subscriptions` — one active row per user (UNIQUE enforced)

```sql
CREATE TABLE billing.sw_subscriptions (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     UUID NOT NULL REFERENCES public.pgtooluser(id) ON DELETE CASCADE,
    plan_id                     TEXT NOT NULL REFERENCES billing.sw_plans(id),
    status                      TEXT NOT NULL DEFAULT 'active'
                                    CHECK (status IN ('active', 'canceled', 'past_due', 'trialing', 'paused')),
    provider                    TEXT NOT NULL DEFAULT 'razorpay'
                                    CHECK (provider IN ('razorpay', 'stripe', 'manual')),
    provider_order_id           TEXT,
    provider_payment_id         TEXT,
    current_period_start        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_end          TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    cancel_at_period_end        BOOLEAN NOT NULL DEFAULT false,
    canceled_at                 TIMESTAMPTZ,
    previous_subscription_id    UUID REFERENCES billing.sw_subscriptions(id),
    created_by_payment_id       UUID REFERENCES billing.sw_payments(id),  -- FK added after sw_payments created
    metadata                    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT sw_subscriptions_user_unique UNIQUE (user_id)
);

CREATE INDEX idx_sw_subscriptions_plan ON billing.sw_subscriptions (plan_id);
CREATE INDEX idx_sw_subscriptions_status ON billing.sw_subscriptions (status) WHERE status = 'active';

CREATE TRIGGER sw_subscriptions_updated_at
    BEFORE UPDATE ON billing.sw_subscriptions
    FOR EACH ROW EXECUTE FUNCTION billing.set_updated_at();
```

### 3.3 `billing.sw_payments` — immutable payment log

```sql
CREATE TABLE billing.sw_payments (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL REFERENCES public.pgtooluser(id) ON DELETE CASCADE,
    subscription_id         UUID REFERENCES billing.sw_subscriptions(id),
    plan_id                 TEXT NOT NULL REFERENCES billing.sw_plans(id),
    razorpay_order_id       TEXT NOT NULL,
    razorpay_payment_id     TEXT,
    razorpay_signature      TEXT,
    amount_paise            INTEGER NOT NULL,
    currency                TEXT NOT NULL DEFAULT 'INR',
    status                  TEXT NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'processing', 'success', 'failed', 'refunded')),
    activation_state        TEXT NOT NULL DEFAULT 'none'
                                CHECK (activation_state IN (
                                    'none',         -- not yet activated
                                    'processing',   -- activation in progress (atomic claim)
                                    'completed',    -- activation succeeded
                                    'failed'        -- activation failed, needs retry
                                )),
    payment_method          TEXT,
    failure_reason          TEXT,
    refund_id               TEXT,
    refunded_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_sw_payments_order_unique ON billing.sw_payments (razorpay_order_id);
CREATE UNIQUE INDEX idx_sw_payments_payment_unique ON billing.sw_payments (razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL;
CREATE INDEX idx_sw_payments_user ON billing.sw_payments (user_id, created_at DESC);
CREATE INDEX idx_sw_payments_status ON billing.sw_payments (status);

CREATE TRIGGER sw_payments_updated_at
    BEFORE UPDATE ON billing.sw_payments
    FOR EACH ROW EXECUTE FUNCTION billing.set_updated_at();

-- Now add the FK from sw_subscriptions.created_by_payment_id
ALTER TABLE billing.sw_subscriptions
    ADD CONSTRAINT fk_sw_subscriptions_payment
    FOREIGN KEY (created_by_payment_id) REFERENCES billing.sw_payments(id);
```

### 3.4 `billing.sw_subscription_history` — append-only event log

```sql
CREATE TABLE billing.sw_subscription_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES public.pgtooluser(id) ON DELETE CASCADE,
    subscription_id UUID NOT NULL REFERENCES billing.sw_subscriptions(id) ON DELETE CASCADE,
    event_type      TEXT NOT NULL CHECK (event_type IN (
        'created',
        'upgraded',
        'downgraded',
        'renewed',
        'canceled',
        'expired',
        'refunded',
        'reactivated'
    )),
    from_plan_id    TEXT,
    to_plan_id      TEXT NOT NULL,
    from_status     TEXT,
    to_status       TEXT NOT NULL,
    payment_id      UUID REFERENCES billing.sw_payments(id),
    amount_paise    INTEGER,
    reason          TEXT,
    metadata        JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sw_sub_history_user ON billing.sw_subscription_history (user_id, created_at DESC);
CREATE INDEX idx_sw_sub_history_sub ON billing.sw_subscription_history (subscription_id);
```

### 3.5 `billing.sw_invoices` — numbered invoices

```sql
CREATE TABLE billing.sw_invoices (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number      TEXT NOT NULL UNIQUE,
    user_id             UUID NOT NULL REFERENCES public.pgtooluser(id) ON DELETE CASCADE,
    payment_id          UUID NOT NULL REFERENCES billing.sw_payments(id) ON DELETE CASCADE,
    subscription_id     UUID NOT NULL REFERENCES billing.sw_subscriptions(id),
    plan_id             TEXT NOT NULL REFERENCES billing.sw_plans(id),
    amount_paise        INTEGER NOT NULL,
    tax_paise           INTEGER NOT NULL DEFAULT 0,
    net_paise           INTEGER NOT NULL,
    currency            TEXT NOT NULL DEFAULT 'INR',
    buyer_name          TEXT,
    buyer_email         TEXT,
    buyer_gstin         TEXT,
    status              TEXT NOT NULL DEFAULT 'issued'
                            CHECK (status IN ('issued', 'void', 'credit_note')),
    issued_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    period_start        TIMESTAMPTZ,
    period_end          TIMESTAMPTZ,
    metadata            JSONB DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sw_invoices_user ON billing.sw_invoices (user_id, created_at DESC);
CREATE INDEX idx_sw_invoices_payment ON billing.sw_invoices (payment_id);

-- Invoice number sequence
CREATE SEQUENCE billing.invoice_seq START 1;

CREATE OR REPLACE FUNCTION billing.generate_invoice_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.invoice_number := 'SW-' || to_char(NOW(), 'YYYY') || '-' || lpad(nextval('billing.invoice_seq')::TEXT, 6, '0');
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sw_invoices_number
    BEFORE INSERT ON billing.sw_invoices
    FOR EACH ROW EXECUTE FUNCTION billing.generate_invoice_number();
```

### 3.6 `billing.sw_refunds` — normalized refund entity

```sql
CREATE TABLE billing.sw_refunds (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id          UUID NOT NULL REFERENCES billing.sw_payments(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES public.pgtooluser(id) ON DELETE CASCADE,
    razorpay_refund_id  TEXT NOT NULL UNIQUE,
    amount_paise        INTEGER NOT NULL,
    currency            TEXT NOT NULL DEFAULT 'INR',
    status              TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'processed', 'failed')),
    reason              TEXT,
    initiated_by        TEXT DEFAULT 'webhook' CHECK (initiated_by IN ('webhook', 'admin')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at        TIMESTAMPTZ
);

CREATE INDEX idx_sw_refunds_payment ON billing.sw_refunds (payment_id);
CREATE INDEX idx_sw_refunds_user ON billing.sw_refunds (user_id, created_at DESC);
```

### 3.7 `billing.sw_webhook_events` — persistent event log

```sql
CREATE TABLE billing.sw_webhook_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    razorpay_event_id   TEXT NOT NULL UNIQUE,
    event_type          TEXT NOT NULL,
    payload             JSONB NOT NULL,
    signature_valid     BOOLEAN NOT NULL DEFAULT false,
    processed           BOOLEAN NOT NULL DEFAULT false,
    processed_at        TIMESTAMPTZ,
    error               TEXT,
    retry_count         INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_sw_webhook_event_id ON billing.sw_webhook_events (razorpay_event_id);
CREATE INDEX idx_sw_webhook_type ON billing.sw_webhook_events (event_type, created_at DESC);
CREATE INDEX idx_sw_webhook_unprocessed ON billing.sw_webhook_events (created_at) WHERE processed = false;
```

### 3.8 `billing.sw_plan_versions` — immutable price snapshots

```sql
CREATE TABLE billing.sw_plan_versions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id             TEXT NOT NULL REFERENCES billing.sw_plans(id),
    version             INTEGER NOT NULL,
    price_inr           INTEGER NOT NULL,
    price_usd           NUMERIC(8,2) NOT NULL,
    billing_interval    TEXT NOT NULL,
    credit_limit_monthly INTEGER NOT NULL,
    credit_limit_daily  INTEGER NOT NULL,
    allowed_models      JSONB NOT NULL,
    features            JSONB NOT NULL,
    max_team_members    INTEGER,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT sw_plan_versions_unique UNIQUE (plan_id, version)
);

CREATE INDEX idx_sw_plan_versions_plan ON billing.sw_plan_versions (plan_id, version DESC);
```

---

## 4. Seed Data: Plan Catalog

```sql
-- =============================================================================
-- Seed current plans into billing.sw_plans
-- =============================================================================

INSERT INTO billing.sw_plans (
    id, name, price_inr, price_usd, billing_interval,
    ai_pool_fraction, margin_rate,
    credit_limit_monthly, credit_limit_daily,
    concurrent_limit, max_tokens_per_run, max_agent_duration_secs,
    max_team_members,
    allowed_models, features
) VALUES
-- FREE
('free', 'Free', 0, 0.00, 'lifetime', 0.55, 0.70,
 3000, 300, 1, 50000, 120, 1,
 '["gpt-4o-mini","gemini-2.5-flash-lite","amazon.nova-lite-v1:0","openai.gpt-oss-20b-1:0","qwen.qwen3-32b-v1:0","google.gemma-3-27b-it","mistral.ministral-3-14b-instruct","nvidia.nemotron-nano-12b-v2"]'::jsonb,
 '["3,000 AI credits/month","8 fast models","1 concurrent agent","50K tokens per run","Community support"]'::jsonb),

-- STARTER
('starter', 'Starter', 119900, 15.00, 'month', 0.55, 0.70,
 100000, 10000, 2, 100000, 600, 5,
 '["gpt-4o-mini","gemini-2.5-flash-lite","claude-haiku-4-5-20251001","gemini-2.5-flash","amazon.nova-lite-v1:0","openai.gpt-oss-20b-1:0","qwen.qwen3-32b-v1:0","google.gemma-3-27b-it","meta.llama3-70b-instruct-v1:0","mistral.ministral-3-14b-instruct","zai.glm-4.7-flash","openai.gpt-oss-120b-1:0","deepseek.v3.2","amazon.nova-pro-v1:0","qwen.qwen3-coder-30b-a3b-v1:0","mistral.magistral-small-2509","nvidia.nemotron-nano-3-30b","minimax.minimax-m2","zai.glm-4.7"]'::jsonb,
 '["100,000 AI credits/month","19 models (Fast + Smart tier)","2 concurrent agents","100K tokens per run","10-minute agent runs","Email support"]'::jsonb),

-- PRO
('pro_monthly', 'Pro', 249900, 29.00, 'month', 0.55, 0.70,
 200000, 20000, 5, 200000, 1200, 15,
 '["gpt-4o-mini","gemini-2.5-flash-lite","claude-haiku-4-5-20251001","gemini-2.5-flash","gpt-4o","gpt-4.1","claude-sonnet-4-6","gemini-2.5-pro","amazon.nova-lite-v1:0","openai.gpt-oss-20b-1:0","qwen.qwen3-32b-v1:0","google.gemma-3-27b-it","meta.llama3-70b-instruct-v1:0","mistral.ministral-3-14b-instruct","zai.glm-4.7-flash","openai.gpt-oss-120b-1:0","deepseek.v3.2","amazon.nova-pro-v1:0","qwen.qwen3-coder-next","qwen.qwen3-next-80b-a3b","qwen.qwen3-coder-30b-a3b-v1:0","mistral.mistral-large-3-675b-instruct","mistral.devstral-2-123b","mistral.magistral-small-2509","nvidia.nemotron-super-3-120b","nvidia.nemotron-nano-3-30b","moonshotai.kimi-k2.5","minimax.minimax-m2.5","minimax.minimax-m2.1","minimax.minimax-m2","zai.glm-5","zai.glm-4.7","ai21.jamba-1-5-large-v1:0","ai21.jamba-1-5-mini-v1:0","anthropic.claude-haiku-4-5-20251001-v1:0","anthropic.claude-sonnet-4-20250514-v1:0"]'::jsonb,
 '["200,000 AI credits/month","36 models (Fast + Smart + Advanced tier)","5 concurrent agents","200K tokens per run","20-minute agent runs","Priority support"]'::jsonb),

-- POWER
('power_monthly', 'Power', 699900, 79.00, 'month', 0.55, 0.70,
 500000, 50000, 5, 500000, 3600, 50,
 '["gpt-4o-mini","gemini-2.5-flash-lite","claude-haiku-4-5-20251001","gemini-2.5-flash","gpt-4o","gpt-4.1","claude-sonnet-4-6","gemini-2.5-pro","claude-opus-4-6","amazon.nova-lite-v1:0","openai.gpt-oss-20b-1:0","qwen.qwen3-32b-v1:0","google.gemma-3-27b-it","meta.llama3-70b-instruct-v1:0","mistral.ministral-3-14b-instruct","zai.glm-4.7-flash","openai.gpt-oss-120b-1:0","deepseek.v3.2","amazon.nova-pro-v1:0","qwen.qwen3-coder-next","qwen.qwen3-next-80b-a3b","qwen.qwen3-coder-30b-a3b-v1:0","mistral.mistral-large-3-675b-instruct","mistral.devstral-2-123b","mistral.magistral-small-2509","nvidia.nemotron-super-3-120b","nvidia.nemotron-nano-3-30b","moonshotai.kimi-k2.5","minimax.minimax-m2.5","minimax.minimax-m2.1","minimax.minimax-m2","zai.glm-5","zai.glm-4.7","ai21.jamba-1-5-large-v1:0","ai21.jamba-1-5-mini-v1:0","moonshot.kimi-k2-thinking","anthropic.claude-haiku-4-5-20251001-v1:0","anthropic.claude-sonnet-4-20250514-v1:0","anthropic.claude-opus-4-6-v1"]'::jsonb,
 '["500,000 AI credits/month","39 models including Claude Opus","5 concurrent agents","500K tokens per run","1-hour agent runs","Priority support"]'::jsonb)
ON CONFLICT (id) DO NOTHING;
```

---

## 5. Seed Current Plan Versions

```sql
-- Snapshot current prices as version 1
INSERT INTO billing.sw_plan_versions
    (plan_id, version, price_inr, price_usd, billing_interval, credit_limit_monthly, credit_limit_daily, allowed_models, features, max_team_members, is_active)
SELECT
    id, 1, price_inr, price_usd, billing_interval, credit_limit_monthly, credit_limit_daily, allowed_models, features, max_team_members, is_active
FROM billing.sw_plans
ON CONFLICT (plan_id, version) DO NOTHING;
```

---

## 6. RLS Policies

```sql
-- =============================================================================
-- billing schema: RLS policies
-- =============================================================================

-- sw_plans: anyone can read (public catalog)
ALTER TABLE billing.sw_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans_select_public"
    ON billing.sw_plans FOR SELECT USING (true);

-- sw_plan_versions: anyone can read
ALTER TABLE billing.sw_plan_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plan_versions_select_public"
    ON billing.sw_plan_versions FOR SELECT USING (true);

-- sw_subscriptions: users read own
ALTER TABLE billing.sw_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscriptions_select_own"
    ON billing.sw_subscriptions FOR SELECT USING (auth.uid() = user_id);

-- sw_payments: users read own
ALTER TABLE billing.sw_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_select_own"
    ON billing.sw_payments FOR SELECT USING (auth.uid() = user_id);

-- sw_subscription_history: users read own
ALTER TABLE billing.sw_subscription_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sub_history_select_own"
    ON billing.sw_subscription_history FOR SELECT USING (auth.uid() = user_id);

-- sw_invoices: users read own
ALTER TABLE billing.sw_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices_select_own"
    ON billing.sw_invoices FOR SELECT USING (auth.uid() = user_id);

-- sw_refunds: users read own
ALTER TABLE billing.sw_refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "refunds_select_own"
    ON billing.sw_refunds FOR SELECT USING (auth.uid() = user_id);

-- sw_webhook_events: NO client access (service-role only)
ALTER TABLE billing.sw_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhook_events_service_only"
    ON billing.sw_webhook_events FOR ALL USING (false);
```

---

## 7. RPCs: Recreate in `billing` Schema

### 7.1 `billing.upgrade_user_quota` — SECURITY DEFINER

```sql
CREATE OR REPLACE FUNCTION billing.upgrade_user_quota(
    p_user_id UUID,
    p_plan_id TEXT
)
RETURNS SETOF ai_meta.ai_user_quota
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = billing, ai_meta, public
AS $$
DECLARE
    v_plan billing.sw_plans%ROWTYPE;
BEGIN
    SELECT * INTO v_plan
    FROM billing.sw_plans
    WHERE id = p_plan_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown plan_id: %', p_plan_id;
    END IF;

    INSERT INTO ai_meta.ai_user_quota (
        user_id, plan_id,
        credit_limit_monthly, credit_limit_daily,
        concurrent_limit, max_tokens_per_run, max_agent_duration_secs,
        allowed_models, is_lifetime_cap, updated_at
    )
    VALUES (
        p_user_id, p_plan_id,
        v_plan.credit_limit_monthly, v_plan.credit_limit_daily,
        v_plan.concurrent_limit, v_plan.max_tokens_per_run, v_plan.max_agent_duration_secs,
        v_plan.allowed_models,
        (p_plan_id = 'free'),
        NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
        plan_id                 = EXCLUDED.plan_id,
        credit_limit_monthly    = EXCLUDED.credit_limit_monthly,
        credit_limit_daily      = EXCLUDED.credit_limit_daily,
        concurrent_limit        = EXCLUDED.concurrent_limit,
        max_tokens_per_run      = EXCLUDED.max_tokens_per_run,
        max_agent_duration_secs = EXCLUDED.max_agent_duration_secs,
        allowed_models          = EXCLUDED.allowed_models,
        is_lifetime_cap         = EXCLUDED.is_lifetime_cap,
        updated_at              = NOW();

    RETURN QUERY
        SELECT * FROM ai_meta.ai_user_quota WHERE user_id = p_user_id;
END;
$$;

-- SECURITY: service_role ONLY — authenticated CANNOT call this
GRANT EXECUTE ON FUNCTION billing.upgrade_user_quota(UUID, TEXT) TO service_role;
REVOKE EXECUTE ON FUNCTION billing.upgrade_user_quota(UUID, TEXT) FROM authenticated;
```

### 7.2 `billing.handle_new_user_billing` — trigger function

```sql
CREATE OR REPLACE FUNCTION billing.handle_new_user_billing()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = billing, ai_meta, public
AS $$
BEGIN
    INSERT INTO billing.sw_subscriptions (
        user_id, plan_id, status, provider,
        current_period_start, current_period_end
    )
    VALUES (
        NEW.id, 'free', 'active', 'manual',
        NOW(), 'infinity'::TIMESTAMPTZ
    )
    ON CONFLICT (user_id) DO NOTHING;

    PERFORM billing.upgrade_user_quota(NEW.id, 'free');

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user_billing failed for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_pgtooluser_billing ON public.pgtooluser;
CREATE TRIGGER on_pgtooluser_billing
    AFTER INSERT ON public.pgtooluser
    FOR EACH ROW EXECUTE FUNCTION billing.handle_new_user_billing();
```

### 7.3 `billing.expire_subscriptions` — cron job

```sql
CREATE OR REPLACE FUNCTION billing.expire_subscriptions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = billing, ai_meta, public
AS $$
DECLARE
    v_uid UUID;
    v_count INTEGER := 0;
BEGIN
    FOR v_uid IN
        SELECT s.user_id
        FROM billing.sw_subscriptions s
        WHERE s.status = 'active'
          AND s.plan_id != 'free'
          AND s.current_period_end < NOW()
    LOOP
        BEGIN
            -- Record history before overwriting
            INSERT INTO billing.sw_subscription_history
                (user_id, subscription_id, event_type, from_plan_id, to_plan_id, from_status, to_status, reason)
            SELECT
                v_uid, s.id, 'expired', s.plan_id, 'free', 'active', 'active', 'period_end_reached'
            FROM billing.sw_subscriptions s
            WHERE s.user_id = v_uid LIMIT 1;

            -- Downgrade subscription to free
            UPDATE billing.sw_subscriptions
            SET
                plan_id              = 'free',
                status               = 'active',
                current_period_start = NOW(),
                current_period_end   = 'infinity'::TIMESTAMPTZ,
                cancel_at_period_end = false,
                canceled_at          = NULL,
                metadata             = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{expired_from}', to_jsonb(plan_id))
            WHERE user_id = v_uid
              AND status = 'active'
              AND plan_id != 'free';

            -- Reset quota
            PERFORM billing.upgrade_user_quota(v_uid, 'free');

            v_count := v_count + 1;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'expire_subscriptions: failed for user %: %', v_uid, SQLERRM;
        END;
    END LOOP;

    RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION billing.expire_subscriptions() TO service_role;
```

### 7.4 `billing.calculate_refund_amount` — partial refund helper

```sql
CREATE OR REPLACE FUNCTION billing.calculate_refund_amount(
    p_payment_id UUID,
    p_refund_paise INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = billing, public
AS $$
DECLARE
    v_payment RECORD;
    v_total_refunded INTEGER;
    v_remaining INTEGER;
BEGIN
    SELECT * INTO v_payment FROM billing.sw_payments WHERE id = p_payment_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'payment_not_found');
    END IF;

    SELECT COALESCE(SUM(amount_paise), 0) INTO v_total_refunded
    FROM billing.sw_refunds
    WHERE payment_id = p_payment_id AND status = 'processed';

    v_remaining := v_payment.amount_paise - v_total_refunded;

    RETURN jsonb_build_object(
        'payment_amount_paise', v_payment.amount_paise,
        'already_refunded_paise', v_total_refunded,
        'remaining_refundable_paise', v_remaining,
        'requested_paise', p_refund_paise,
        'allowed_paise', LEAST(p_refund_paise, v_remaining),
        'is_full_refund', (v_total_refunded + p_refund_paise) >= v_payment.amount_paise
    );
END;
$$;

GRANT EXECUTE ON FUNCTION billing.calculate_refund_amount(UUID, INTEGER) TO service_role;
```

---

## 8. RPC Security: Fix Grants in `ai_meta`

```sql
-- REVOKE from authenticated (service_role only)
REVOKE EXECUTE ON FUNCTION ai_meta.deduct_credits(UUID, INTEGER, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION ai_meta.cleanup_stale_slots() FROM authenticated;

-- DROP dead code
DROP FUNCTION IF EXISTS ai_meta.top_up_credits(UUID, BIGINT, TEXT);
```

---

## 9. Backfill: Existing Users Get Free Subscriptions

```sql
-- Seed free subscriptions for any existing users
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT u.id
        FROM public.pgtooluser u
        LEFT JOIN billing.sw_subscriptions s ON s.user_id = u.id
        WHERE s.user_id IS NULL
    LOOP
        BEGIN
            PERFORM billing.handle_new_user_billing();
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Backfill failed for user %: %', r.id, SQLERRM;
        END;
    END LOOP;
END;
$$;
```

---

## 10. Migration Order

```
Phase 1: Clean slate
  ├── 10.1  DROP all billing tables + functions from public schema
  ├── 10.2  CREATE SCHEMA billing
  └── 10.3  GRANT/REVOKE schema permissions

Phase 2: Create all tables (in dependency order)
  ├── 10.4  billing.sw_plans + trigger
  ├── 10.5  billing.sw_subscriptions + trigger (without FK to sw_payments yet)
  ├── 10.6  billing.sw_payments + trigger + unique indexes
  ├── 10.7  ALTER billing.sw_subscriptions ADD created_by_payment_id FK
  ├── 10.8  billing.sw_subscription_history
  ├── 10.9  billing.sw_invoices + sequence + trigger
  ├── 10.10 billing.sw_refunds
  ├── 10.11 billing.sw_webhook_events
  └── 10.12 billing.sw_plan_versions

Phase 3: Seed data
  ├── 10.13 INSERT plan catalog into billing.sw_plans
  └── 10.14 INSERT version snapshots into billing.sw_plan_versions

Phase 4: RLS
  └── 10.15 All RLS policies for billing schema tables

Phase 5: RPCs
  ├── 10.16 billing.upgrade_user_quota (REVOKE from authenticated)
  ├── 10.17 billing.handle_new_user_billing trigger
  ├── 10.18 billing.expire_subscriptions
  └── 10.19 billing.calculate_refund_amount

Phase 6: ai_meta security fixes
  ├── 10.20 REVOKE ai_meta.deduct_credits from authenticated
  ├── 10.21 REVOKE ai_meta.cleanup_stale_slots from authenticated
  └── 10.22 DROP ai_meta.top_up_credits

Phase 7: Backfill
  └── 10.23 Seed free subscriptions for existing users
```

---

## 11. Verification Queries

```sql
-- All billing tables exist in billing schema
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'billing'
ORDER BY table_name;
-- Expected: sw_invoices, sw_payments, sw_plan_versions, sw_plans, sw_refunds,
--           sw_subscription_history, sw_subscriptions, sw_webhook_events

-- No billing tables left in public
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'sw_%';
-- Expected: 0 rows

-- RLS enabled on all billing tables
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'billing';
-- Expected: all true

-- upgrade_user_quota NOT executable by authenticated
SELECT has_function_privilege('authenticated', 'billing.upgrade_user_quota(UUID, TEXT)', 'execute');
-- Expected: false

-- deduct_credits NOT executable by authenticated
SELECT has_function_privilege('authenticated', 'ai_meta.deduct_credits(UUID, INTEGER, TEXT)', 'execute');
-- Expected: false

-- top_up_credits is gone
SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'top_up_credits');
-- Expected: false

-- Plans seeded
SELECT id, name, price_inr FROM billing.sw_plans ORDER BY price_inr;
-- Expected: free (0), starter (119900), pro_monthly (249900), power_monthly (699900)

-- Plan versions seeded
SELECT plan_id, version, price_inr FROM billing.sw_plan_versions ORDER BY plan_id;
-- Expected: 4 rows, version 1 each

-- Users have free subscriptions
SELECT count(*) FROM billing.sw_subscriptions WHERE plan_id = 'free';
-- Expected: matches user count
```

---

## 12. Backend Code Impact

Every file referencing billing tables needs `billing.` prefix:

| File | Change |
|------|--------|
| `routes/payment/payments.js` | All `from('sw_*')` → `from('billing.sw_*')` |
| `routes/payment/payments.js:109` | `rpc('upgrade_user_quota')` → `rpc('billing.upgrade_user_quota')` |
| `services/plans/planService.js` | `from('sw_plans')` → `from('billing.sw_plans')` |
| `services/team-sharing/entitlements.service.js:51` | `from('sw_subscriptions')` → `from('billing.sw_subscriptions')` |
| `services/team-sharing/entitlements.service.js:91` | `from('sw_plans')` → `from('billing.sw_plans')` |
| `supabase/migrations/*` (old) | Do not touch — they reference dropped tables |

---

## 13. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Old migration files reference `public.sw_*` and break fresh Supabase reset | High | Tables not created | Write new migration that replaces old ones |
| Backend `from('sw_plans')` calls fail silently (Supabase returns empty) | High | Empty plan list | Grep all `sw_` references, update to `billing.sw_` |
| `auth.uid()` returns NULL in RLS (no browser Supabase JWT) | None | — | Writes already go through service_role; RLS only matters for client reads |
| `handle_new_user_billing` trigger fires on existing users during backfill | Low | Duplicate inserts | `ON CONFLICT (user_id) DO NOTHING` handles this |

---

## 14. Summary

| Category | Count |
|----------|-------|
| Schema created | 1 (`billing`) |
| Tables created | 8 |
| Tables dropped | 4 (`public.sw_*`) |
| Functions created | 4 (`upgrade_user_quota`, `handle_new_user_billing`, `expire_subscriptions`, `calculate_refund_amount`) |
| Functions dropped | 3 (`sw_set_updated_at`, old `handle_new_user_billing`, `top_up_credits`) |
| RPCs REVOKE'd from authenticated | 4 |
| Unique indexes added | 3 (order_id, payment_id, invoice_number) |
| RLS policies created | 8 |
| Triggers created | 5 |
| Sequences created | 1 (invoice_seq) |
