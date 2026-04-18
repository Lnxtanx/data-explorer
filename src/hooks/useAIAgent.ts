// =============================================================================
// useAIAgent — Composition root.
//
// Wires together:
//   useAgentStream   — SSE fetch + line parsing
//   useAgentArtifacts — artifact_start / artifact / artifact_rows reducers
//   useAgentPlan      — plan / plan_update reducers
//
// All public types are re-exported from agentTypes.ts for backward compat.
// =============================================================================

export type {
    AgentToolStep, AgentArtifact, AgentState, AgentRequest, UseAIAgentResult,
    AgentStatus, AgentPhase, PlanStep, ContextMeta,
    ColumnStat, AnomalyEntry, QualityIssue, JoinPath,
    CorrelationPair, FunnelStage, SeasonalityPeriod,
    StatBlockKind, ColumnStatistic, CardinalityColumn,
    RegressionCoefficient, TableDiffResult, TextAnalysis,
    ReportSection, AnalysisSuggestion,
} from './agentTypes';

import { useCallback, useRef, useState } from 'react';
import type {
    AgentState, AgentRequest, UseAIAgentResult,
    ThinkingEvent, ThinkingChunkEvent, ThinkingClearEvent, ToolCallEvent, ToolResultEvent,
    DeltaEvent, DoneEvent, ErrorEvent, ChatIdEvent, StatusEvent,
    ArtifactStartEvent, ArtifactEvent, ArtifactRowsEvent,
    PlanEvent, PlanUpdateEvent, ContextMetaEvent,
    QuotaExceededEvent, QuotaUpdateEvent,
} from './agentTypes';
import { startAgentStream } from './useAgentStream';
import { applyArtifactStart, applyArtifact, applyArtifactRows } from './useAgentArtifacts';
import { applyPlan, applyPlanUpdate } from './useAgentPlan';

// ─── Initial state ─────────────────────────────────────────────────────────────

const INITIAL_STATE: AgentState = {
    status:      'idle',
    phase:       'idle',
    phaseDetail: '',
    thinkingText: '',
    planSteps:   [],
    toolSteps:   [],
    artifacts:   [],
    streamedText: '',
    chatId:      null,
    error:       null,
    tokenCount:  null,
    creditsUsed: null,
    model:       null,
    iterations:  0,
    contextMeta: null,
};

// =============================================================================
// Hook
// =============================================================================

export function useAIAgent(): UseAIAgentResult {
    const [state, setState] = useState<AgentState>(INITIAL_STATE);
    const abortRef = useRef<AbortController | null>(null);
    // Stable UUID for this hook instance — used as session_id on every request
    const sessionIdRef = useRef<string>(crypto.randomUUID());

    const reset = useCallback(() => setState(INITIAL_STATE), []);

    const abort = useCallback(() => {
        abortRef.current?.abort();
        abortRef.current = null;
        setState(prev => ({ ...prev, status: 'aborted' }));
    }, []);

    const send = useCallback(async (request: AgentRequest) => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setState({ ...INITIAL_STATE, status: 'running', chatId: request.chatId ?? null });

        try {
            await startAgentStream(
                { ...request, sessionId: request.sessionId ?? sessionIdRef.current },
                (event, data) => {
                switch (event) {
                    case 'chat_id': {
                        const evt = data as ChatIdEvent;
                        setState(prev => ({ ...prev, chatId: evt.chat_id }));
                        break;
                    }
                    case 'plan': {
                        const evt = data as PlanEvent;
                        setState(prev => ({ ...prev, planSteps: applyPlan(evt) }));
                        break;
                    }
                    case 'plan_update': {
                        const evt = data as PlanUpdateEvent;
                        setState(prev => ({ ...prev, planSteps: applyPlanUpdate(prev.planSteps, evt) }));
                        break;
                    }
                    case 'status': {
                        const evt = data as StatusEvent;
                        setState(prev => ({ ...prev, phase: evt.phase, phaseDetail: evt.detail, iterations: evt.iteration }));
                        break;
                    }
                    case 'thinking_chunk': {
                        const evt = data as ThinkingChunkEvent;
                        setState(prev => ({ ...prev, liveThinking: (prev.liveThinking || '') + evt.text }));
                        break;
                    }
                    case 'thinking': {
                        const evt = data as ThinkingEvent;
                        const cleanText = evt.text.replace(/<\/?thinking>/g, '').trim();
                        if (cleanText) {
                            setState(prev => ({
                                ...prev,
                                toolSteps: [...prev.toolSteps, {
                                    id: `thinking-${prev.toolSteps.length}`,
                                    name: 'thinking',
                                    type: 'thinking',
                                    label: 'Thinking...',
                                    input: {},
                                    result: { success: true, summary: cleanText },
                                    status: 'done',
                                }],
                                liveThinking: '',
                            }));
                        } else {
                            setState(prev => ({ ...prev, liveThinking: '' }));
                        }
                        break;
                    }
                    case 'thinking_clear': {
                        setState(prev => ({ ...prev, liveThinking: '' }));
                        break;
                    }
                    case 'tool_call': {
                        const evt = data as ToolCallEvent;
                        setState(prev => ({
                            ...prev,
                            toolSteps: [...prev.toolSteps, { id: evt.id, name: evt.name, input: evt.input ?? {}, status: 'calling' }],
                        }));
                        break;
                    }
                    case 'tool_result': {
                        const evt = data as ToolResultEvent;
                        setState(prev => ({
                            ...prev,
                            toolSteps: prev.toolSteps.map(s =>
                                s.id === evt.id
                                    ? { ...s, result: { success: evt.success, summary: evt.summary }, status: evt.success ? 'done' : 'error' }
                                    : s
                            ),
                        }));
                        break;
                    }
                    case 'artifact_start': {
                        const evt = data as ArtifactStartEvent;
                        setState(prev => ({ ...prev, artifacts: applyArtifactStart(prev.artifacts, evt) }));
                        break;
                    }
                    case 'artifact': {
                        const evt = data as ArtifactEvent;
                        setState(prev => ({ ...prev, artifacts: applyArtifact(prev.artifacts, evt) }));
                        break;
                    }
                    case 'artifact_rows': {
                        const evt = data as ArtifactRowsEvent;
                        setState(prev => ({ ...prev, artifacts: applyArtifactRows(prev.artifacts, evt) }));
                        break;
                    }
                    case 'delta': {
                        const evt = data as DeltaEvent;
                        setState(prev => ({
                            ...prev,
                            streamedText: prev.streamedText + (evt.text ?? ''),
                            chatId: evt.chat_id ?? prev.chatId,
                        }));
                        break;
                    }
                    case 'done': {
                        const evt = data as DoneEvent;
                        setState(prev => ({
                            ...prev,
                            status:      'done',
                            phase:       'done',
                            phaseDetail: '',
                            tokenCount:  (evt.usage?.outputTokens ?? evt.usage?.output_tokens) ?? prev.tokenCount,
                            creditsUsed: evt.usage?.creditsUsed ?? prev.creditsUsed,
                            iterations:  evt.iterations ?? prev.iterations,
                            chatId:      evt.chat_id ?? prev.chatId,
                            model:       evt.usage?.synthesisModel ?? prev.model ?? null,
                            // Drop any artifact_start placeholders that never got a
                            // matching artifact event (tool failed / ran out of iterations).
                            artifacts:   prev.artifacts.filter(a => !a.loading),
                        }));
                        return true; // stop stream
                    }
                    case 'context_meta': {
                        const evt = data as ContextMetaEvent;
                        setState(prev => ({ ...prev, contextMeta: evt }));
                        break;
                    }
                    case 'error': {
                        const evt = data as ErrorEvent;
                        setState(prev => ({ ...prev, status: 'error', error: evt.message ?? 'Unknown AI error' }));
                        return true; // stop stream
                    }
                    case 'quota_exceeded': {
                        const evt = data as QuotaExceededEvent;
                        const msg = evt.reason === 'monthly_limit'
                            ? 'Monthly credit limit reached. Upgrade your plan to continue.'
                            : evt.reason === 'daily_limit'
                            ? 'Daily credit limit reached. Try again tomorrow or upgrade your plan.'
                            : (evt.message ?? 'Credit limit reached.');
                        setState(prev => ({ ...prev, status: 'error', error: msg }));
                        return true; // stop stream
                    }
                    case 'quota_update': {
                        const evt = data as QuotaUpdateEvent;
                        setState(prev => ({ ...prev, creditsUsed: evt.credits_used }));
                        break;
                    }
                }
            }, controller.signal);

            setState(prev => prev.status === 'running' ? { ...prev, status: 'done' } : prev);

        } catch (err: unknown) {
            if (err instanceof Error && err.name === 'AbortError') {
                setState(prev => ({ ...prev, status: 'aborted' }));
            } else {
                const message = err instanceof Error ? err.message : 'AI request failed';
                setState(prev => ({ ...prev, status: 'error', error: message }));
            }
        } finally {
            if (abortRef.current === controller) abortRef.current = null;
        }
    }, []);

    return { ...state, send, abort, reset };
}
