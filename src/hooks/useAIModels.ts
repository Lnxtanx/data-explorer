import { useQuery } from '@tanstack/react-query';
import type { ModelMeta } from '@/components/data-explorer/ai/models/modelConfig';

async function fetchModels(): Promise<ModelMeta[]> {
    const res = await fetch('/api/ai/models', { credentials: 'include' });
    if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`);
    const data = await res.json() as { models: ModelMeta[] };
    return data.models;
}

export function useAIModels() {
    return useQuery<ModelMeta[]>({
        queryKey: ['ai-models'],
        queryFn: fetchModels,
        staleTime: 5 * 60 * 1000,   // re-fetch after 5 min
        retry: 1,
        // Fallback so the selector always has at least one option
        placeholderData: [
            { id: 'gpt-4o-mini', name: 'GPT-4o mini', provider: 'OpenAI', color: '#10a37f', tier: 'Fast', multiplier: '1x', creditRate: 4 },
        ],
    });
}
