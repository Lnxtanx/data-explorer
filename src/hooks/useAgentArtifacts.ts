
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
    return [...artifacts, { id: evt.id, type: evt.type, title: evt.title, loading: true }];
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

    // Deduplicate / version file artifacts with the same canonical filename.
    // If the agent re-exports the same file (e.g. user_chat_ranking.html) across iterations,
    // update the existing card in-place and store superseded versions in `previousVersions`.
    if (evt.type === 'file') {
        const evtName = ((evt as any).fileName || (evt as any).filename || evt.title || '').trim().toLowerCase();
        if (evtName) {
            const existingIdx = artifacts.findIndex(a => {
                if (a.type !== 'file') return false;
                const aName = (a.fileName || (a as any).filename || a.title || '').trim().toLowerCase();
                return aName === evtName;
            });
            if (existingIdx !== -1) {
                const updated = [...artifacts];
                const prev = updated[existingIdx];
                const prevVersions = (prev as any).previousVersions || [];
                updated[existingIdx] = {
                    ...evt,
                    previousVersions: [...prevVersions, prev],
                };
                return updated;
            }
        }
    }

    return [...artifacts, evt];
}

export function applyArtifactRows(
    artifacts: AgentArtifact[],
    evt: ArtifactRowsEvent,
): AgentArtifact[] {
    if (artifacts.length === 0) return artifacts;

    let targetIdx = -1;
    if (evt.artifactId) {
        targetIdx = artifacts.findIndex(a => a.id === evt.artifactId);
    }
    if (targetIdx === -1) {
        for (let i = artifacts.length - 1; i >= 0; i--) {
            if (artifacts[i].streaming || artifacts[i].type === 'table' || artifacts[i].type === 'query') {
                targetIdx = i;
                break;
            }
        }
    }
    if (targetIdx === -1) targetIdx = artifacts.length - 1;

    const target = artifacts[targetIdx];
    const updated = [...artifacts];
    updated[targetIdx] = {
        ...target,
        rows:      [...(target.rows ?? []), ...evt.rows],
        streaming: !evt.done,
    };
    return updated;
}
