// =============================================================================
// useAgentPlan.ts — Pure state reducers for plan step events.
// =============================================================================

import type { PlanStep, PlanEvent, PlanUpdateEvent } from './agentTypes';

export function applyPlan(evt: PlanEvent): PlanStep[] {
    return evt.steps.map(s => ({
        id:     s.id,
        goal:   s.goal,
        tool:   s.tool,
        status: (s.status as PlanStep['status']) || 'pending',
    }));
}

export function applyPlanUpdate(planSteps: PlanStep[], evt: PlanUpdateEvent): PlanStep[] {
    return planSteps.map(s =>
        s.id === evt.id ? { ...s, status: evt.status as PlanStep['status'] } : s
    );
}
