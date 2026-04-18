// Static display metadata for known models.
// Used as a fallback / type reference when the backend is unavailable.

export interface ModelMeta {
    id: string;
    name: string;
    provider: string;
    color: string;
    tier: string;        // 'Fast' | 'Smart' | 'Powerful' | 'Free'
    multiplier: string;  // '1x', '7x', 'Free', etc.
    creditRate: number;
}

export const TIER_STYLE: Record<string, string> = {
    Fast:     'bg-blue-500/10 text-blue-500',
    Smart:    'bg-violet-500/10 text-violet-500',
    Powerful: 'bg-amber-500/10 text-amber-600',
    Free:     'bg-emerald-500/10 text-emerald-600',
};

export const DEFAULT_MODEL_ID = 'gpt-4o-mini';
