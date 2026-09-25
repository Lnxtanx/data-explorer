// =============================================================================
// Dashboard Render Engine — insight renderer
// An insight is a single quantified signal. It renders from config signal
// fields (current_value/previous_value/delta_pct) and, when the panel's
// refreshed query returns rows with a current/previous value pair, derives
// the delta from the fresh data (free zero-LLM refresh).
// =============================================================================

import { escHtml, fmtNumber } from '../format';
import type { InsightEvidence, PanelData, PanelRuntimeConfig } from '../contract';

const signalEvidence: Record<string, InsightEvidence> = {};

export function setInsightEvidence(key: string, evidence: InsightEvidence): void {
  signalEvidence[key] = evidence;
}

export function getInsightEvidence(key: string): InsightEvidence | null {
  return signalEvidence[key] || null;
}

export function renderInsight(container: HTMLElement, data: PanelData | null, config: PanelRuntimeConfig): void {
  const numeric = (v: unknown, d: number | null): number | null => {
    if (v === null || v === undefined || v === '') return d;
    const n = Number(v);
    return isNaN(n) ? d : n;
  };

  let currentValue = numeric(config.current_value, null);
  let previousValue = numeric(config.previous_value, null);

  if (data && data.rows && data.rows.length > 0 && data.columns) {
    const row = data.rows[0];
    const cols = data.columns || [];
    const pick = (candidates: string[]): number => {
      for (let i = 0; i < candidates.length; i++) {
        const idx = cols.findIndex((c) => (c.name || '').toLowerCase() === candidates[i]);
        if (idx >= 0) return idx;
      }
      return -1;
    };
    const curIdx = pick(['current_value', 'current', 'value']);
    const prevIdx = pick(['previous_value', 'previous', 'prev_value', 'prior_value']);
    if (curIdx >= 0) currentValue = numeric(row[curIdx], currentValue);
    if (prevIdx >= 0) previousValue = numeric(row[prevIdx], previousValue);
  }

  let deltaPct = numeric(config.delta_pct, null);
  if (deltaPct === null && currentValue !== null && previousValue !== null && previousValue !== 0) {
    deltaPct = ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
  }

  const unit = config.unit || '';
  const classification = String(config.classification || 'trend').toLowerCase();
  const confidence = String(config.confidence || 'low').toLowerCase();
  const isHeadline = config.is_headline === true;

  const deltaCls = deltaPct === null
    ? 'sw-badge-neutral'
    : deltaPct > 0
      ? 'sw-badge-positive'
      : 'sw-badge-negative';
  const sign = deltaPct === null ? '' : deltaPct > 0 ? '+' : '';
  const metricHtml = currentValue !== null
    ? escHtml(fmtNumber(currentValue, config)) + (unit ? '<span class="sw-insight-unit">' + escHtml(unit) + '</span>' : '')
    : '<span class="sw-text-dim" style="color: var(--sw-text-dim);">—</span>';

  let deltaHtml = '';
  if (deltaPct !== null) {
    const dirArrow = deltaPct > 0 ? '▲' : deltaPct < 0 ? '▼' : '•';
    deltaHtml = '<span class="sw-insight-delta ' + deltaCls + '">' + dirArrow + ' ' + sign + deltaPct.toFixed(1) + '%</span>';
  }
  if (config.comparison_period) {
    deltaHtml += '<span class="sw-insight-confidence">' + escHtml('vs ' + config.comparison_period) + '</span>';
  }

  let recommendationHtml = '';
  if (config.recommendation) {
    recommendationHtml =
      '<div class="sw-insight-recommendation"><strong>Next step</strong>&nbsp;' +
      escHtml(config.recommendation) + '</div>';
  }

  const headlineAttr = isHeadline ? ' data-headline="true"' : '';

  const panelKey = config.panel_key || container.dataset.panelKey || '';
  const whyLabel = 'Why?';
  container.innerHTML =
    '<div class="sw-insight-card"' + headlineAttr + '>' +
    '<div class="sw-insight-topline">' +
    '<div class="sw-insight-metric">' + metricHtml + '</div>' +
    deltaHtml +
    '</div>' +
    (config.interpretation
      ? '<div class="sw-insight-interpretation">' + escHtml(config.interpretation) + '</div>'
      : '') +
    recommendationHtml +
    '<div class="sw-insight-footer">' +
    '<div class="sw-insight-meta">' +
    '<span class="sw-insight-tag sw-insight-tag--' + classification + '">' + escHtml(classification) + '</span>' +
    '<span class="sw-insight-confidence">' + escHtml(confidence) + ' confidence</span>' +
    '</div>' +
    '<button class="sw-why-btn" data-panel-key="' + escHtml(panelKey) + '" onclick="window.swRuntime && window.swRuntime.whyPanel ? window.swRuntime.whyPanel(this.dataset.panelKey) : parent.postMessage({ type: \'INSIGHT_WHY_REQUEST\', panelKey: this.dataset.panelKey }, \'*\')" title="Ask the AI why this changed">' + whyLabel + '</button>' +
    '</div>' +
    '</div>';

  const whyBtn = container.querySelector<HTMLButtonElement>('.sw-why-btn');
  if (whyBtn) {
    whyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof window !== 'undefined' && (window as any).swRuntime?.whyPanel) {
        (window as any).swRuntime.whyPanel(panelKey);
      } else if (typeof parent !== 'undefined') {
        parent.postMessage({ type: 'INSIGHT_WHY_REQUEST', panelKey }, '*');
      }
    });
  }

  const targetKey = config.panel_key || panelKey;
  if (targetKey) {
    setInsightEvidence(targetKey, {
      title: config.title ? String(config.title) : undefined,
      classification,
      confidence,
      current_value: currentValue,
      previous_value: previousValue,
      delta_pct: deltaPct,
      comparison_period: String(config.comparison_period || '') || null,
      interpretation: String(config.interpretation || ''),
      recommendation: String(config.recommendation || ''),
    });
  }
}