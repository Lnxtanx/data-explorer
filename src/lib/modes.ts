// =============================================================================
// Agent modes — DISPLAY metadata only.
//
// Availability is decided by the DB: billing.sw_plans.allowed_modes (surfaced
// via /api/ai/usage as AIQuotaStatus.allowed_modes). These constants only
// describe what each mode looks like in the UI. Keep in sync with
// backend-ai/src/agents/data_explorer/config.py (DATA_EXPLORER_MODES) and the
// per-model credit rates in backend-ai/src/usage (mirrored in
// backend/routes/ai/handlers/usage.js MODEL_META_JS).
// =============================================================================

import { Zap, Brain, type LucideIcon } from 'lucide-react';

export type AgentMode = 'flash' | 'deep';

export interface ModeMeta {
    id: AgentMode;
    name: string;
    tagline: string;
    description: string;
    primaryModel: string;
    rateTier: string;
    creditRate: string;
    thinkingNote: string;
    accent: string;
    icon: LucideIcon;
}

export const MODE_META: Record<AgentMode, ModeMeta> = {
    flash: {
        id: 'flash',
        name: 'Flash',
        tagline: 'Fast answers for everyday tasks',
        description: 'Quick responses for daily queries and simple analysis.',
        primaryModel: 'DeepSeek V4 Flash',
        rateTier: '2x',
        creditRate: '~29 credits',
        thinkingNote: 'Thinking toggle available · off by default',
        accent: '#1e88e5',
        icon: Zap,
    },
    deep: {
        id: 'deep',
        name: 'Deep',
        tagline: 'Deep reasoning for complex analysis',
        description: 'Reasoning-heavy responses for tough, multi-step analysis.',
        primaryModel: 'DeepSeek V4 Pro',
        rateTier: '7x',
        creditRate: '~88 credits',
        thinkingNote: 'Thinking on by default',
        accent: '#6d28d9',
        icon: Brain,
    },
};