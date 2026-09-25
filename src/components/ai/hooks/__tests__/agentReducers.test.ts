// =============================================================================
// Characterization tests: agent streaming reducers
//
// WHY: useAgentArtifacts.ts and useAgentPlan.ts export PURE reducers with no
// React dependency, despite the `use*` filename. A later phase moves them to
// components/ai/reducers/ (artifactReducers.ts, planReducers.ts).
//
// They encode the durable streaming protocol, so they are the highest-risk
// pure code in the app. These tests lock the current semantics — including the
// backwards-scan behaviour for parallel tool batches and the file-artifact
// versioning, both of which are easy to break during a move.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { applyArtifactStart, applyArtifact, applyArtifactRows } from '../useAgentArtifacts';
import { applyPlan, applyPlanUpdate } from '../useAgentPlan';
import type { AgentArtifact } from '../../types';

const start = (id: string, type: string) => ({ id, type, title: `T-${id}` });

describe('applyArtifactStart', () => {
  it('appends a loading placeholder', () => {
    const out = applyArtifactStart([], start('a1', 'table') as never);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'a1', type: 'table', loading: true });
  });

  it('does not mutate the input array', () => {
    const input: AgentArtifact[] = [];
    applyArtifactStart(input, start('a1', 'table') as never);
    expect(input).toHaveLength(0);
  });
});

describe('applyArtifact', () => {
  it('replaces the matching loading placeholder', () => {
    const withPlaceholder = applyArtifactStart([], start('a1', 'table') as never);
    const out = applyArtifact(withPlaceholder, { id: 'a1', type: 'table', rows: [1] } as never);
    expect(out).toHaveLength(1);
    expect(out[0].loading).toBeUndefined();
    expect(out[0].rows).toEqual([1]);
  });

  it('replaces the NEAREST matching placeholder when several are pending', () => {
    // Regression guard: a backwards scan is required. A forward/last-only scan
    // leaves the earlier placeholder as an empty container forever.
    let list: AgentArtifact[] = [];
    list = applyArtifactStart(list, start('a1', 'table') as never);
    list = applyArtifactStart(list, start('a2', 'table') as never);
    list = applyArtifact(list, { id: 'a2', type: 'table', rows: [2] } as never);

    expect(list).toHaveLength(2);
    expect(list[0].loading).toBe(true);
    expect(list[1].loading).toBeUndefined();
    expect(list[1].rows).toEqual([2]);
  });

  it('does not match a placeholder of a different type', () => {
    let list: AgentArtifact[] = [];
    list = applyArtifactStart(list, start('a1', 'chart') as never);
    list = applyArtifact(list, { id: 'a2', type: 'table', rows: [1] } as never);
    expect(list).toHaveLength(2);
  });

  it('appends when no placeholder matches', () => {
    const out = applyArtifact([], { id: 'x', type: 'table', rows: [] } as never);
    expect(out).toHaveLength(1);
  });

  it('versions a re-exported file artifact instead of duplicating it', () => {
    const first = { id: 'f1', type: 'file', fileName: 'report.html' } as AgentArtifact;
    const second = { id: 'f2', type: 'file', fileName: 'Report.HTML' } as AgentArtifact;

    const out = applyArtifact([first], second as never);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('f2');
    // the superseded card is retained for the version switcher
    expect((out[0] as unknown as { previousVersions: AgentArtifact[] }).previousVersions)
      .toHaveLength(1);
  });

  it('does not version non-file artifacts that share a title', () => {
    const out = applyArtifact(
      [{ id: 't1', type: 'table', title: 'same' } as AgentArtifact],
      { id: 't2', type: 'table', title: 'same' } as never,
    );
    expect(out).toHaveLength(2);
  });
});

describe('applyArtifactRows', () => {
  const table = (rows: unknown[], streaming = true): AgentArtifact =>
    ({ id: 't', type: 'table', rows, streaming }) as AgentArtifact;

  it('returns the input unchanged when there are no artifacts', () => {
    const out = applyArtifactRows([], { artifactId: 'x', rows: [1] } as never);
    expect(out).toEqual([]);
  });

  it('targets by artifactId when supplied', () => {
    const list = [table([]), { id: 'other', type: 'chart' } as AgentArtifact];
    const out = applyArtifactRows(list, { artifactId: 'other', rows: [1, 2] } as never);
    expect(out[0].rows).toEqual([]);
    expect(out[1].rows).toEqual([1, 2]);
  });

  it('appends row batches across calls', () => {
    let list = [table([])];
    list = applyArtifactRows(list, { artifactId: 't', rows: [1, 2] } as never);
    list = applyArtifactRows(list, { artifactId: 't', rows: [3] } as never);
    expect(list[0].rows).toEqual([1, 2, 3]);
  });

  it('clears the streaming flag once done', () => {
    const out = applyArtifactRows([table([])], { artifactId: 't', rows: [1], done: true } as never);
    expect(out[0].streaming).toBe(false);
  });

  it('falls back to the last streaming/table/query artifact', () => {
    const list = [
      { id: 'c', type: 'chart' } as AgentArtifact,
      table([], false),
    ];
    const out = applyArtifactRows(list, { rows: [1] } as never);
    expect(out[1].rows).toEqual([1]);
  });

  it('does not mutate the input array', () => {
    const list = [table([])];
    applyArtifactRows(list, { artifactId: 't', rows: [1] } as never);
    expect(list[0].rows).toEqual([]);
  });
});

describe('applyPlan / applyPlanUpdate', () => {
  it('maps plan steps and defaults a missing status to pending', () => {
    const out = applyPlan({
      steps: [
        { id: 1, goal: 'Inspect schema', tool: 'get_schema_context' },
        { id: 2, goal: 'Chart it', tool: 'add_panel', status: 'done' },
      ],
    } as never);
    expect(out).toEqual([
      { id: 1, goal: 'Inspect schema', tool: 'get_schema_context', status: 'pending' },
      { id: 2, goal: 'Chart it', tool: 'add_panel', status: 'done' },
    ]);
  });

  it('patches a single step by id and leaves the rest untouched', () => {
    const steps = applyPlan({
      steps: [
        { id: 1, goal: 'a', tool: null, status: 'pending' },
        { id: 2, goal: 'b', tool: null, status: 'pending' },
      ],
    } as never);
    const out = applyPlanUpdate(steps, { id: 2, status: 'running' } as never);
    expect(out[0].status).toBe('pending');
    expect(out[1].status).toBe('running');
  });

  it('is a no-op when the id is not present', () => {
    const steps = applyPlan({ steps: [{ id: 1, goal: 'a', tool: null, status: 'pending' }] } as never);
    expect(applyPlanUpdate(steps, { id: 99, status: 'done' } as never)).toEqual(steps);
  });
});
