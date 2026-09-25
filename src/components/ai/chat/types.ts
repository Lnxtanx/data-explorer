import type { AgentToolStep, AgentArtifact, PlanStep } from '../hooks/useAIAgent';

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
    /** Author id (team-shared chats attribute messages per member). */
    userId?: string | null;
    /** False when a teammate wrote this message in a shared thread. */
    isMine?: boolean;
    authorName?: string | null;
    authorEmail?: string | null;
    createdAt?: string | number;
};
