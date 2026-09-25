// =============================================================================
// Dashboard Render Engine — KPI renderer
// Single metric value, optional change badge, inline SVG sparkline and a
// target / progress bar. All extras are opt-in via config:
//   value_col      — column holding the headline value
//   change_col     — numeric column with the % change (renders badge)
//   spark_col      — numeric column holding the trend series for the sparkline
//   target         — numeric goal (progress % = value / target)
//   target_col     — column holding a per-row goal (row 0 is used)
// =============================================================================

import { escHtml, fmtNumber, isNumericVal } from '../format';
import { getThemeColor } from '../theme';
import type { PanelData, PanelRuntimeConfig } from '../contract';

function buildSparkSvg(series: number[]): string {
  if (series.length < 2) return '';
  const w = 120;
  const h = 32;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const pad = 2;
  const pts = series.map((v, i) => {
    const x = pad + (i / (series.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return x.toFixed(1) + ',' + y.toFixed(1);
  });
  const rising = series[series.length - 1] >= series[0];
  const stroke = rising
    ? getThemeColor('--sw-emerald', '#10b981')
    : getThemeColor('--sw-rose', '#f43f5e');
  const lastX = pts[pts.length - 1].split(',')[0];
  const lastY = pts[pts.length - 1].split(',')[1];

  return (
    '<div class="sw-kpi-sparkline">' +
    '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true">' +
    '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + stroke + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
    '<circle cx="' + lastX + '" cy="' + lastY + '" r="2.5" fill="' + stroke + '"/>' +
    '</svg></div>'
  );
}

function extractSeries(data: PanelData, colName: unknown): number[] {
  if (!colName) return [];
  const i = data.columns.findIndex((c) => c.name === colName);
  if (i < 0) return [];
  return data.rows.map((r) => Number(r[i])).filter((v) => !isNaN(v));
}

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

  let sparkHtml = '';
  const sparkCol = config.spark_col || config.trend_col;
  if (sparkCol) {
    sparkHtml = buildSparkSvg(extractSeries(data, sparkCol));
  }

  let progressHtml = '';
  const valueNum = isNumericVal(val) ? Number(val) : NaN;
  if (!isNaN(valueNum)) {
    let targetNum = NaN;
    if (isNumericVal(config.target)) targetNum = Number(config.target);
    else if (config.target_col) {
      const tIdx = cols.findIndex((c) => c.name === config.target_col);
      if (tIdx >= 0) targetNum = Number(row[tIdx]);
    }
    if (!isNaN(targetNum) && targetNum !== 0) {
      const pct = Math.min(100, (valueNum / targetNum) * 100);
      const cls = pct >= 100 ? 'sw-progress-fill sw-progress-fill--done' : pct >= 70 ? 'sw-progress-fill' : 'sw-progress-fill sw-progress-fill--low';
      progressHtml =
        '<div class="sw-progress">' +
        '<div class="sw-progress-track"><div class="' + cls + '" style="width:' + pct + '%"></div></div>' +
        '<div class="sw-progress-meta"><span>' + pct.toFixed(0) + '% of target</span>' +
        '<span>' + fmtNumber(targetNum, config) + '</span></div>' +
        '</div>';
    }
  }

  container.innerHTML =
    '<div class="sw-kpi-metric">' +
    '<div class="sw-kpi-value">' + escHtml(formatted) + '</div>' +
    badgeHtml +
    '</div>' +
    sparkHtml +
    progressHtml +
    labelHtml;
}