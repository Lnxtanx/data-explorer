import type { AgentToolStep, AgentArtifact, PlanStep } from '@/hooks/useAIAgent';

export type LocalMessage = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    sql?: string;
    isStreaming?: boolean;
    files?: string[];
    mentionedTable?: string;
    planSteps?: PlanStep[];
    toolSteps?: AgentToolStep[];
    artifacts?: AgentArtifact[];
    isAgent?: boolean;
    tokenCount?: number | null;
    creditsUsed?: number | null;
    model?: string | null;
};
