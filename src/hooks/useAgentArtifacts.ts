// =============================================================================
// useAgentArtifacts.ts — Pure state reducers for artifact streaming events.
//
// The 3-event artifact pattern:
//   artifact_start → placeholder { loading: true }
//   artifact       → replace placeholder with real data  (may include streaming flag)
//   artifact_rows  → append row batches until { done: true }
// =============================================================================

import type { AgentArtifact, ArtifactStartEvent, ArtifactEvent, ArtifactRowsEvent } from './agentTypes';

export function applyArtifactStart(
    artifacts: AgentArtifact[],
    evt: ArtifactStartEvent,
): AgentArtifact[] {
    return [...artifacts, { type: evt.type, title: evt.title, loading: true }];
}

export function applyArtifact(
    artifacts: AgentArtifact[],
    evt: ArtifactEvent,
): AgentArtifact[] {
    // Search backwards for the nearest loading placeholder with a matching type.
    // Searching only the last index breaks when a parallel tool batch emits
    // multiple artifact_start events before any artifact events arrive — the
    // earlier placeholders would never get replaced and stay as empty containers.
    for (let i = artifacts.length - 1; i >= 0; i--) {
        if (artifacts[i]?.loading && artifacts[i].type === evt.type) {
            const updated = [...artifacts];
            updated[i] = { ...evt, streaming: evt.streaming };
            return updated;
        }
    }
    return [...artifacts, evt];
}

export function applyArtifactRows(
    artifacts: AgentArtifact[],
    evt: ArtifactRowsEvent,
): AgentArtifact[] {
    const lastIdx = artifacts.length - 1;
    if (lastIdx < 0) return artifacts;
    const last    = artifacts[lastIdx];
    const updated = [...artifacts];
    updated[lastIdx] = {
        ...last,
        rows:      [...(last.rows ?? []), ...evt.rows],
        streaming: !evt.done,
    };
    return updated;
}
