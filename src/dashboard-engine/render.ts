// =============================================================================
// Dashboard Render Engine — composition core
// Central dispatch + per-panel runtime config cache. Exposes window.swChart.
// =============================================================================

import type { PanelData, PanelRuntimeConfig } from './contract';
import { renderChart } from './renderers/chart';
import { renderDonut } from './renderers/donut';
import { renderError } from './renderers/error';
import { renderInsight } from './renderers/insight';
import { renderKpi } from './renderers/kpi';
import { renderTable } from './renderers/table';

/**
 * Session-level config cache, keyed by panel key.
 * Seeded at init from (stale) data-config + (fresh) __SW_PANELS__; subsequent
 * writes during a session win over __SW_PANELS__ (which only refreshes when the
 * whole html is recomposed via srcDoc swap).
 */
export const panelConfigs: Record<string, PanelRuntimeConfig> = {};

export function renderPanel(selector: string, config?: PanelRuntimeConfig): void {
  const container = document.querySelector<HTMLElement>(selector);
  if (!container) return;

  const panelKey = (container.id || '').replace(/^chart-/, '');
  if (!config) config = {};

  if (panelKey && Object.keys(config).length > 1) {
    const cached = panelConfigs[panelKey];
    if (!cached || Object.keys(cached).length <= 1) {
      panelConfigs[panelKey] = config;
    }
  }

  const effective: PanelRuntimeConfig = Object.assign(
    {},
    (window.__SW_PANELS__ && window.__SW_PANELS__[panelKey]) || {},
    panelConfigs[panelKey] || {},
    config
  );

  const data: PanelData | null = (window.__SW_DATA__ && window.__SW_DATA__[panelKey]) || null;

  if (data && data.error) {
    if (container.dataset.rendered !== 'true') renderError(container, data.error);
    container.dataset.rendered = 'true';
    return;
  }

  const type = String(effective.type || effective.chart_type || '').toLowerCase();

  if (type === 'kpi') {
    renderKpi(container, data, effective);
  } else if (type === 'insight') {
    renderInsight(container, data, effective);
  } else if (type === 'table') {
    renderTable(container, data, effective);
  } else if (type === 'donut' || type === 'doughnut' || type === 'pie') {
    renderDonut(container, data, effective);
  } else {
    renderChart(container, data, effective, ['line', 'bar', 'area'].includes(type) ? type : 'line');
  }

  container.dataset.rendered = 'true';
}

const swChart = { render: renderPanel };
window.swChart = swChart;