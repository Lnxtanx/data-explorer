// =============================================================================
// Dashboard Render Engine — KPI renderer
// =============================================================================

import { escHtml, fmtNumber } from '../format';
import type { PanelData, PanelRuntimeConfig } from '../contract';

export function renderKpi(container: HTMLElement, data: PanelData | null, config: PanelRuntimeConfig): void {
  if (!data || !data.rows || data.rows.length === 0) {
    container.innerHTML = '<div class="sw-kpi-metric"><div class="sw-kpi-value">—</div></div>';
    return;
  }
  const row = data.rows[0];
  const cols = data.columns || [];
  const valIdx = config.value_col ? cols.findIndex((c) => c.name === config.value_col) : 0;
  const val = row[valIdx >= 0 ? valIdx : 0];
  const formatted = fmtNumber(val, config);

  let badgeHtml = '';
  if (config.change_col) {
    const changeIdx = cols.findIndex((c) => c.name === config.change_col);
    if (changeIdx >= 0 && row[changeIdx] !== null && row[changeIdx] !== undefined) {
      const change = Number(row[changeIdx]);
      const cls = change > 0 ? 'sw-badge-positive' : change < 0 ? 'sw-badge-negative' : 'sw-badge-neutral';
      const sign = change > 0 ? '+' : '';
      badgeHtml = '<div class="sw-kpi-badge ' + cls + '">' + sign + change.toFixed(1) + '%</div>';
    }
  }

  let labelHtml = '';
  if (config.label) {
    labelHtml = '<div class="sw-kpi-label">' + escHtml(config.label) + '</div>';
  }

  container.innerHTML =
    '<div class="sw-kpi-metric">' +
    '<div class="sw-kpi-value">' + escHtml(formatted) + '</div>' +
    badgeHtml +
    '</div>' +
    labelHtml;
}