// =============================================================================
// Agent modes.
//
// Availability is decided by the DB: billing.sw_plans.allowed_modes (surfaced
// via /api/ai/usage as AIQuotaStatus.allowed_modes). These constants only
// describe the modes themselves. Keep in sync with
// backend-ai/src/agents/data_explorer/config.py (DATA_EXPLORER_MODES) and the
// per-model credit rates in backend-ai/src/usage (mirrored in
// backend/routes/ai/handlers/usage.js MODEL_META_JS).
//
// REFACTOR PHASE 2 — this file was the only module under lib/ that imported a
// UI library (`lucide-react`, for Zap/Brain icons), and the header called the
// whole thing "DISPLAY metadata only". Two changes:
//
//   1. `AgentMode` is now the CANONICAL declaration. The same union was
//      previously written out four times: here, in ai/models/ModeSelector.tsx,
//      and inline as `agentMode?: 'flash' | 'deep'` in lib/api/ai/index.ts and
//      lib/api/dashboard.ts. All four now resolve to this one. ModeSelector
//      re-exports it, so its 4 importers are unchanged.
//
//   2. The unused presentation fields are gone. `icon` (a Lucide component),
//      `accent`, `tagline`, `description` and `thinkingNote` had no readers —
//      PlansSettings only ever read `.name`. Dropping `icon` is what removes the
//      lucide-react dependency; the rest is plain dead weight removed with it.
// =============================================================================

export type AgentMode = 'flash' | 'deep';

export interface ModeMeta {
    id: AgentMode;
    /** Display name, e.g. "Flash". */
    name: string;
    /** Underlying model label, mirrored in the billing UI. */
    primaryModel: string;
    /** Multiplier vs. the base tier, e.g. "2x". */
    rateTier: string;
    /** Approximate credit cost, e.g. "~29 credits". */
    creditRate: string;
}

export const MODE_META: Record<AgentMode, ModeMeta> = {
    flash: {
        id: 'flash',
        name: 'Flash',
        primaryModel: 'DeepSeek V4 Flash',
        rateTier: '2x',
        creditRate: '~29 credits',
    },
    deep: {
        id: 'deep',
        name: 'Deep',
        primaryModel: 'DeepSeek V4 Pro',
        rateTier: '7x',
        creditRate: '~88 credits',
    },
};
