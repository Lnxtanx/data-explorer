// =============================================================================
// Dashboard Render Engine — initialization
// Renders every panel on DOMContentLoaded and notifies the parent.
//
// Config precedence fix: resolveInitialConfig() merges the data-config that is
// embedded in the CURRENT html snapshot with the FRESH __SW_PANELS__ map that
// composeHtml injects (which reflects the latest DB state). __SW_PANELS__ wins,
// so a stale data-config can never shadow newer panel settings.
// =============================================================================

import type { PanelRuntimeConfig, SectionRuntime } from './contract';
import { panelConfigs, renderPanel } from './render';
import { REFRESH_SVG } from './format';

export function resolveInitialConfig(panelKey: string, domConfig?: PanelRuntimeConfig): PanelRuntimeConfig {
  const fresh = window.__SW_PANELS__?.[panelKey];
  return { ...(domConfig || {}), ...(fresh || {}), panel_key: panelKey };
}

export function decorateRefreshButtons(root: Document | HTMLElement = document): void {
  root.querySelectorAll('.sw-card').forEach((card) => {
    const btn = card.querySelector<HTMLButtonElement>(
      'button[onclick*="refreshPanel"], .sw-card-actions button, .sw-refresh-btn'
    );
    if (btn) {
      if (!btn.classList.contains('sw-refresh-btn')) {
        btn.classList.add('sw-refresh-btn');
      }
      if (!btn.getAttribute('title')) {
        btn.setAttribute('title', 'Refresh this panel');
      }
      // Replace plain text ('R', '↻', etc.) with the official SVG icon
      if (!btn.querySelector('.sw-refresh-icon')) {
        btn.innerHTML = REFRESH_SVG;
      }
    }
  });
}

window.addEventListener('DOMContentLoaded', () => {
  // Auto-decorate Executive Pulse sections (from __SW_SECTIONS__)
  const pulseSections: Record<string, SectionRuntime> = window.__SW_SECTIONS__ || {};
  Object.keys(pulseSections).forEach((sid) => {
    const sec = pulseSections[sid];
    if (!sec || sec.is_pulse !== true) return;
    const sectionEl = document.getElementById('section-' + sid);
    if (!sectionEl) return;
    sectionEl.classList.add('sw-is-pulse');

    const header = sectionEl.querySelector('.sw-section-header');
    if (header && !header.querySelector('.sw-pulse-badge')) {
      const badge = document.createElement('span');
      badge.className = 'sw-pulse-badge';
      badge.textContent = 'Pulse';
      header.insertBefore(badge, header.firstChild);
    }
    if (sec.summary) {
      const existing = sectionEl.querySelector('.sw-pulse-summary');
      if (!existing) {
        const headerEl = sectionEl.querySelector('.sw-section-header');
        const summary = document.createElement('div');
        summary.className = 'sw-pulse-summary';
        summary.textContent = sec.summary;
        if (headerEl && headerEl.parentNode) headerEl.parentNode.insertBefore(summary, headerEl.nextSibling);
        else sectionEl.insertBefore(summary, sectionEl.firstChild);
      }
    }
  });

  // Auto-decorate any refresh buttons missing SVG icon or .sw-refresh-btn class
  decorateRefreshButtons();

  // 1. Auto-discover and render containers with data-config
  document.querySelectorAll<HTMLElement>('[data-config]').forEach((el) => {
    try {
      const domConfig = JSON.parse(el.dataset.config || '{}') as PanelRuntimeConfig;
      const panelKey = domConfig.panel_key || (el.id || '').replace(/^chart-/, '') || '';
      if (panelKey) {
        const config = resolveInitialConfig(panelKey, domConfig);
        panelConfigs[panelKey] = config;
        renderPanel('#' + el.id, config);
      } else {
        renderPanel('#' + el.id, domConfig);
      }
    } catch (e) {
      console.warn('[swChart] Failed to parse config for', el.id, e);
    }
  });

  // 2. Discover any remaining chart containers from window.__SW_PANELS__
  document.querySelectorAll<HTMLElement>('[id^="chart-"]').forEach((el) => {
    if (el.dataset.rendered === 'true') return;
    const panelKey = (el.id || '').replace(/^chart-/, '');
    const panelConfig = window.__SW_PANELS__ && window.__SW_PANELS__[panelKey];
    if (panelConfig) renderPanel('#' + el.id, panelConfig);
  });

  // Notify parent that dashboard is loaded so it can reply with THEME_SYNC.
  const panelCount = document.querySelectorAll('.sw-card').length;
  parent.postMessage(
    {
      type: 'DASHBOARD_LOADED',
      panelCount,
      height: document.body.scrollHeight,
    },
    '*'
  );
});