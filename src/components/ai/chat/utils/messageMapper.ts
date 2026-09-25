// =============================================================================
// src/components/ai/chat/utils/messageMapper.ts
// Message transformation, XML stripping, artifact deduplication & sanitization
// =============================================================================

import type { AIMessage } from '../../api/index';
import type { LocalMessage } from '../types';
import type { AgentArtifact, AgentToolStep } from '../../hooks/useAIAgent';
import { sanitizeToolInput, sanitizeToolSummary } from '../../tools/toolSanitize';

/** Strip model-generated XML wrapper tags that some LLMs add to their output. */
export function stripXmlTags(text: string): string {
    if (!text) return text;
    const responseMatch = text.match(/<response>([\s\S]*?)<\/response>/);
    if (responseMatch) return responseMatch[1].trim();
    return text
        .replace(/<thinking>[\s\S]*?<\/thinking>/g, '')
        .replace(/<\/?(thinking|response|answer)>/g, '')
        .trim();
}

export function hasArtifactData(a: NonNullable<AIMessage['artifacts']>[number]): boolean {
    if (!a.type) return !!(a.rows && a.columns);
    switch (a.type) {
        case 'table':
        case 'sample':
        case 'search': return !!(a.rows && a.columns);
        case 'stats':
        case 'stat_block': return !!((a as any).stats || (a as any).stat_block || a.summary || (a as any).columnStats);
        case 'diagram': return !!a.mermaid;
        case 'file': return !!((a as any).download_url || (a as any).downloadUrl || (a as any).url || (a as any).filename);
        case 'attachment': return !!((a as any).download_url || (a as any).downloadUrl || (a as any).url || (a as any).filename || (a as any).fileName || (a as any).file_id);
        case 'chart': return true;
        case 'query': return !!(a.sql || (a.rows && a.columns));
        case 'report': return !!((a as any).sections || (a as any).insights);
        case 'suggestions': return !!((a as any).suggestions);
        case 'analysis_plan': return !!((a as any).planStepsData || (a as any).plan_steps);
        case 'slide_deck': return !!((a as any).content);
        case 'clarification': return !!((a as any).question || (a as any).options);
        case 'tool_call': return false; // Handled separately in toolSteps
        case 'thinking': return false; // Handled separately in toolSteps
        default: return !!(a.rows && a.columns);
    }
}

export function mapDbMessageToLocal(m: AIMessage, index?: number, allMessages?: AIMessage[]): LocalMessage {
    const rawArtifacts = m.artifacts ?? [];
    const mappedArtifacts: AgentArtifact[] = rawArtifacts
        .filter(hasArtifactData)
        .map(a => ({
            type: a.type ?? 'table',
            downloadUrl: (a as any).download_url || (a as any).downloadUrl || (a as any).url,
            filename: (a as any).filename || (a as any).fileName,
            fileSize: (a as any).file_size || (a as any).size_bytes || (a as any).fileSize,
            rowCount: (a as any).row_count ?? (a as any).rowCount,
            question: (a as any).question,
            options: (a as any).options,
            preview: (a as any).preview,
            rawContent: (a as any).text_content || (a as any).rawContent,
            ...a,
        } as AgentArtifact));

    // Deduplicate file artifacts by canonical filename: group versions together under latest
    const fileArtifactMap = new Map<string, { latest: AgentArtifact; previousVersions: AgentArtifact[] }>();
    const nonFileArtifacts: AgentArtifact[] = [];

    for (const a of mappedArtifacts) {
        if (a.type === 'file') {
            const canonicalName = ((a as any).fileName || (a as any).filename || a.title || '').trim().toLowerCase();
            if (canonicalName) {
                if (!fileArtifactMap.has(canonicalName)) {
                    fileArtifactMap.set(canonicalName, { latest: a, previousVersions: [] });
                } else {
                    const existing = fileArtifactMap.get(canonicalName)!;
                    existing.previousVersions.push(existing.latest);
                    existing.latest = a;
                }
                continue;
            }
        }
        nonFileArtifacts.push(a);
    }

    const consolidatedFileArtifacts = Array.from(fileArtifactMap.values()).map(({ latest, previousVersions }) => ({
        ...latest,
        ...(previousVersions.length > 0 ? { previousVersions } : {}),
    }));

    const artifacts: AgentArtifact[] = [...nonFileArtifacts, ...consolidatedFileArtifacts];

    // If an assistant message has a clarification artifact, check if it was answered in history
    if (m.role === 'assistant' && allMessages && index !== undefined) {
        const clarIdx = artifacts.findIndex(a => a.type === 'clarification');
        if (clarIdx !== -1) {
            const nextUserMsg = allMessages.slice(index + 1).find(msg => msg.role === 'user');
            if (nextUserMsg && nextUserMsg.content) {
                artifacts[clarIdx] = {
                    ...artifacts[clarIdx],
                    answered: true,
                    answer: nextUserMsg.content,
                };
            }
        }
    }

    // Restore tool steps from execution_trace if available, or fall back to tool_call artifacts
    const rawSteps = (m as any).execution_trace?.toolSteps ?? [];
    let toolSteps: AgentToolStep[] | undefined = undefined;

    if (rawSteps.length > 0) {
        toolSteps = rawSteps.map((s: any) => ({
            id: s.id,
            name: s.name,
            input: sanitizeToolInput(s.name, s.input ?? {}),
            status: s.status === 'done' ? ('done' as const) : s.status === 'error' ? ('error' as const) : ('calling' as const),
            result: s.result
                ? { ...s.result, summary: sanitizeToolSummary(s.result.summary ?? '') }
                : undefined,
            latencyMs: s.latency_ms ?? s.latencyMs,
            startedAt: s.startedAt,
            downloadUrl: s.downloadUrl ?? s.download_url,
            filename: s.filename,
        }));
    } else {
        const toolArtifacts = rawArtifacts.filter(a => (a as any).type === 'tool_call');
        if (toolArtifacts.length > 0) {
            toolSteps = toolArtifacts.map((a: any, idx: number) => {
                const toolName = a.tool || a.name || 'tool';
                const rawResult =
                    a.result || (a.summary ? { success: true, summary: a.summary } : undefined);
                return {
                    id: a.id || `step-${idx}`,
                    name: toolName,
                    input: sanitizeToolInput(toolName, a.input ?? {}),
                    status: (a.status === 'error' ? 'error' : 'done') as 'calling' | 'done' | 'error',
                    result: rawResult
                        ? { ...rawResult, summary: sanitizeToolSummary(rawResult.summary ?? '') }
                        : undefined,
                    latencyMs: a.latency_ms ?? a.latencyMs,
                    downloadUrl: a.download_url ?? a.downloadUrl,
                    filename: a.filename,
                };
            });
        }
    }

    // Check if there is a thinking artifact and prepend as a thinking step if not already present
    const thinkingArtifact = rawArtifacts.find(a => (a as any).type === 'thinking');
    if (thinkingArtifact && (thinkingArtifact as any).text) {
        const thinkingText = (thinkingArtifact as any).text;
        const thinkingStep: AgentToolStep = {
            id: 'thinking-rehydrated',
            name: 'thinking',
            type: 'thinking',
            label: 'Thinking Process',
            input: {},
            status: 'done',
            latencyMs: (thinkingArtifact as any).latency_ms ?? (thinkingArtifact as any).latencyMs ?? (thinkingArtifact as any).duration_ms,
            result: { success: true, summary: thinkingText },
        };
        toolSteps = [thinkingStep, ...(toolSteps ?? [])];
    }

    return {
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        sql: m.artifacts?.[0]?.sql ?? undefined,
        artifacts: artifacts.length > 0 ? artifacts : undefined,
        toolSteps,
        tokenCount: m.token_count,
        userId: m.user_id ?? null,
        isMine: m.isMine ?? true,
        authorName: m.authorName ?? null,
        authorEmail: m.authorEmail ?? null,
    };
}
