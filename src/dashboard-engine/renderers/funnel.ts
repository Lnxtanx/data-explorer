// =============================================================================
// Dashboard Render Engine - cascade funnel renderer (chart_type 'funnel')
// =============================================================================

import { escHtml, fmtNumber, isNumericVal } from '../format';
import { COLOR_PALETTE } from '../chart-instances';
import type { PanelData, PanelRuntimeConfig } from '../contract';

export interface FunnelStage {
  label: string;
  count: number;
  pctOfFirst: number; // 0..1 relative to first (widest) stage
  dropoff: number;    // 0..1 lost vs previous stage (0 for the first stage)
}

export function computeFunnel(data: PanelData | null, config: PanelRuntimeConfig): FunnelStage[] | null {
  if (!data || !data.rows || !data.columns || data.rows.length === 0 || data.columns.length === 0) return null;
  const cols = data.columns;
  const colI = (name: unknown, fallback = 0): number => {
    if (typeof name !== 'string' || !name) return fallback;
    const i = cols.findIndex((c) => c.name === name);
    return i >= 0 ? i : fallback;
  };

  const stageI = colI(config.stage_col, 0);
  let valueI = colI(config.value_col, -1);
  if (valueI < 0 || valueI === stageI) {
    valueI = cols.findIndex((c, i) => i !== stageI && data.rows.some((r) => isNumericVal(r[i])));
    if (valueI < 0) valueI = cols.length - 1;
  }

  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const r of data.rows) {
    const s = String(r[stageI] ?? '');
    if (!order.includes(s)) order.push(s);
    const n = Number(r[valueI]);
    counts.set(s, (counts.get(s) || 0) + (isNumericVal(n) ? n : 0));
  }

  const sort = String(config.stage_sort || '');
  if (sort === 'asc') order.sort((a, b) => (counts.get(a) || 0) - (counts.get(b) || 0));
  else if (sort === 'desc') order.sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0));

  const first = order.length > 0 ? counts.get(order[0]) || 0 : 0;
  return order.map((s, i) => {
    const count = counts.get(s) || 0;
    const prev = i > 0 ? counts.get(order[i - 1]) || 0 : 0;
    return {
      label: s,
      count,
      pctOfFirst: first > 0 ? count / first : 0,
      dropoff: i > 0 && prev > 0 ? 1 - count / prev : 0,
    };
  });
}

export function renderFunnel(container: HTMLElement, data: PanelData | null, config: PanelRuntimeConfig): void {
  const stages = computeFunnel(data, config);
  if (!stages || stages.length === 0) {
    container.innerHTML =
      '<div class="sw-error-card"><div class="sw-error-title">No Data</div>' +
      '<div class="sw-error-message">Funnel requires rows with a stage label column.</div></div>';
    return;
  }
  const max = stages[0].count || 1;
  const showPct = String(config.show_pct || 'on') !== 'off';
  const showDrop = String(config.show_drop || 'on') !== 'off';
  const rows = stages
    .map((st, i) => {
      const wPct = Math.max(3, Math.round((st.count / max) * 100));
      const drop = st.dropoff > 0 ? ' -' + Math.round(st.dropoff * 100) + '%' : ' 0%';
      const color = COLOR_PALETTE[i % COLOR_PALETTE.length];
      return (
        '<li class="sw-funnel-row">' +
        '<span class="sw-funnel-label" title="' + escHtml(st.label + ': ' + fmtNumber(st.count)) + '">' + escHtml(st.label) + '</span>' +
        '<span class="sw-funnel-track">' +
        '<span class="sw-funnel-bar" style="width:' + wPct + '%;background:' + color + '"></span>' +
        '<span class="sw-funnel-value">' + fmtNumber(st.count) + '</span>' +
        (showPct ? '<span class="sw-funnel-pct">' + Math.round(st.pctOfFirst * 100) + '%</span>' : '') +
        (showDrop && i > 0 ? '<span class="sw-funnel-drop">' + drop + '</span>' : '') +
        '</span>' +
        '</li>'
      );
    })
    .join('');
  container.innerHTML = '<div class="sw-funnel-wrap"><ol class="sw-funnel-list">' + rows + '</ol></div>';
}
