// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { pivotCohortMatrix, renderCohort } from '../renderers/cohort';
import { computeFunnel, renderFunnel } from '../renderers/funnel';
import { renderPanel, panelConfigs } from '../render';
import type { PanelData, PanelRuntimeConfig } from '../contract';

describe('Cohort Renderer', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    container.id = 'chart-cohort_test';
    document.body.appendChild(container);
  });

  it('handles empty or invalid data gracefully', () => {
    expect(pivotCohortMatrix(null, {})).toBeNull();
    expect(pivotCohortMatrix({ columns: [], rows: [] }, {})).toBeNull();

    renderCohort(container, null, {});
    expect(container.innerHTML).toContain('sw-error-card');
    expect(container.innerHTML).toContain('No Data');
  });

  it('computes cohort matrix with retention percentages and heat levels', () => {
    const data: PanelData = {
      columns: [{ name: 'cohort' }, { name: 'period' }, { name: 'users' }],
      rows: [
        ['2026-01', '0', 100],
        ['2026-01', '1', 45],
        ['2026-01', '2', 30],
        ['2026-02', '0', 80],
        ['2026-02', '1', 40],
      ],
    };
    const config: PanelRuntimeConfig = {
      cohort_col: 'cohort',
      age_col: 'period',
      value_col: 'users',
    };

    const matrix = pivotCohortMatrix(data, config);
    expect(matrix).not.toBeNull();
    expect(matrix?.cohorts).toEqual(['2026-01', '2026-02']);
    expect(matrix?.ages).toEqual(['0', '1', '2']);

    // 2026-01, period 0 = 100/100 = 1.0 (100%)
    expect(matrix?.cells[0][0]).toEqual({ count: 100, pct: 1.0 });
    // 2026-01, period 1 = 45/100 = 0.45 (45%)
    expect(matrix?.cells[0][1]).toEqual({ count: 45, pct: 0.45 });
    // 2026-01, period 2 = 30/100 = 0.30 (30%)
    expect(matrix?.cells[0][2]).toEqual({ count: 30, pct: 0.30 });

    renderCohort(container, data, config);
    expect(container.querySelector('.sw-cohort-table')).not.toBeNull();
    expect(container.innerHTML).toContain('2026-01');
    expect(container.innerHTML).toContain('100%');
    expect(container.innerHTML).toContain('45%');
    expect(container.innerHTML).toContain('sw-cohort-h6'); // 100% is heat level 6
  });
});

describe('Funnel Renderer', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    container.id = 'chart-funnel_test';
    document.body.appendChild(container);
  });

  it('handles empty or invalid data gracefully', () => {
    expect(computeFunnel(null, {})).toBeNull();
    expect(computeFunnel({ columns: [], rows: [] }, {})).toBeNull();

    renderFunnel(container, null, {});
    expect(container.innerHTML).toContain('sw-error-card');
    expect(container.innerHTML).toContain('No Data');
  });

  it('computes cascade funnel stages with pctOfFirst and dropoff', () => {
    const data: PanelData = {
      columns: [{ name: 'step' }, { name: 'visitors' }],
      rows: [
        ['Homepage', 1000],
        ['Signup', 400],
        ['Onboarding', 200],
        ['Paid', 50],
      ],
    };
    const config: PanelRuntimeConfig = {
      stage_col: 'step',
      value_col: 'visitors',
    };

    const stages = computeFunnel(data, config);
    expect(stages).not.toBeNull();
    expect(stages).toHaveLength(4);

    // Stage 1: Homepage (1000) -> 100% of first, 0% dropoff
    expect(stages![0]).toEqual({
      label: 'Homepage',
      count: 1000,
      pctOfFirst: 1.0,
      dropoff: 0,
    });

    // Stage 2: Signup (400) -> 40% of first, 60% dropoff from 1000
    expect(stages![1]).toEqual({
      label: 'Signup',
      count: 400,
      pctOfFirst: 0.4,
      dropoff: 0.6,
    });

    // Stage 3: Onboarding (200) -> 20% of first, 50% dropoff from 400
    expect(stages![2]).toEqual({
      label: 'Onboarding',
      count: 200,
      pctOfFirst: 0.2,
      dropoff: 0.5,
    });

    // Stage 4: Paid (50) -> 5% of first, 75% dropoff from 200
    expect(stages![3]).toEqual({
      label: 'Paid',
      count: 50,
      pctOfFirst: 0.05,
      dropoff: 0.75,
    });

    renderFunnel(container, data, config);
    expect(container.querySelector('.sw-funnel-list')).not.toBeNull();
    expect(container.innerHTML).toContain('Homepage');
    expect(container.innerHTML).toContain('Signup');
    expect(container.innerHTML).toContain('40%');
    expect(container.innerHTML).toContain('-60%');
  });
});

describe('Engine Render Dispatch', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    container.id = 'chart-test_panel';
    document.body.appendChild(container);
  });

  it('dispatches to cohort renderer for chart_type cohort', () => {
    const data: PanelData = {
      columns: [{ name: 'cohort' }, { name: 'period' }, { name: 'users' }],
      rows: [['2026-01', '0', 50]],
    };
    (window as any).__SW_DATA__ = { test_panel: data };

    renderPanel('#chart-test_panel', { chart_type: 'cohort' });
    expect(container.querySelector('.sw-cohort-table')).not.toBeNull();
  });

  it('dispatches to funnel renderer for chart_type funnel', () => {
    const data: PanelData = {
      columns: [{ name: 'stage' }, { name: 'count' }],
      rows: [['Step 1', 100]],
    };
    (window as any).__SW_DATA__ = { test_panel: data };

    renderPanel('#chart-test_panel', { chart_type: 'funnel' });
    expect(container.querySelector('.sw-funnel-list')).not.toBeNull();
  });

  it('dispatches to geo renderer for chart_type geo (dots)', () => {
    const data: PanelData = {
      columns: [{ name: 'latitude' }, { name: 'longitude' }, { name: 'users' }],
      rows: [[40.7, -74, 500]],
    };
    (window as any).__SW_DATA__ = { test_panel: data };

    renderPanel('#chart-test_panel', { chart_type: 'geo' });
    expect(container.querySelector('.sw-geo-canvas')).not.toBeNull();
    expect(container.querySelector('.sw-geo-wrap')).not.toBeNull();
  });

  it('accepts "map" and "world" as geo aliases', () => {
    const data: PanelData = {
      columns: [{ name: 'region_name' }, { name: 'value' }],
      rows: [['USA', 42]],
    };
    (window as any).__SW_DATA__ = { test_panel: data };
    renderPanel('#chart-test_panel', { chart_type: 'map', region_col: 'region_name', value_col: 'value' });
    expect(container.querySelector('.sw-geo-wrap')).not.toBeNull();

    // Reset the persistent session cache so the world alias starts clean.
    delete panelConfigs['test_panel'];
    (window as any).__SW_DATA__ = {
      test_panel: { columns: [{ name: 'lat' }, { name: 'lon' }], rows: [[0, 0]] },
    };
    renderPanel('#chart-test_panel', { chart_type: 'world' });
    expect(container.querySelector('.sw-geo-wrap')).not.toBeNull();
  });

  it('renders an explicit unsupported card for unknown chart types', () => {
    const data: PanelData = { columns: [{ name: 'a' }, { name: 'b' }], rows: [[1, 'x']] };
    (window as any).__SW_DATA__ = { test_panel: data };

    renderPanel('#chart-test_panel', { chart_type: 'hologram' });
    expect(container.querySelector('.sw-unsupported-card')).not.toBeNull();
    expect(container.innerHTML).toContain('Unsupported chart type');
    expect(container.innerHTML).toContain('hologram');
  });
});
