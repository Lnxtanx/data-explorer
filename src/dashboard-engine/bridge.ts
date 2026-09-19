// =============================================================================
// Dashboard Render Engine — postMessage bridge
// Exposes window.swRuntime and listens for parent messages.
// Security: messages are only accepted when event.source === window.parent
// (the sandbox has no allow-same-origin, so this is the only valid origin).
// =============================================================================

import type { PanelData, PanelRuntimeConfig } from './contract';
import { panelConfigs, renderPanel } from './render';
import { getInsightEvidence } from './renderers/insight';
import { applyTheme } from './theme';

export const swRuntime = {
  refreshPanel(panelKey: string): void {
    const card = document.getElementById('card-' + panelKey);
    if (card) {
      const btn =
        card.querySelector('.sw-refresh-btn') ||
        card.querySelector('button[onclick*="refreshPanel"]') ||
        card.querySelector('.sw-card-actions button');
      if (btn) btn.classList.add('sw-refreshing');
    }
    parent.postMessage({ type: 'PANEL_REFRESH_REQUEST', panelKey }, '*');
  },

  whyPanel(panelKey: string): void {
    const evidence = getInsightEvidence(panelKey);
    parent.postMessage(
      {
        type: 'INSIGHT_WHY_REQUEST',
        panelKey,
        evidence: evidence || undefined,
      },
      '*'
    );
  },

  _updatePanel(panelKey: string, data: PanelData): void {
    if (!window.__SW_DATA__) window.__SW_DATA__ = {};
    window.__SW_DATA__[panelKey] = data;

    const card = document.getElementById('card-' + panelKey);
    if (card) {
      const btn =
        card.querySelector('.sw-refresh-btn') ||
        card.querySelector('button[onclick*="refreshPanel"]') ||
        card.querySelector('.sw-card-actions button');
      if (btn) btn.classList.remove('sw-refreshing');

      const ts = card.querySelector('.sw-card-timestamp');
      if (ts) ts.textContent = 'Updated just now';
    }

    const chartEl = document.getElementById('chart-' + panelKey);
    if (chartEl) {
      let config: PanelRuntimeConfig | null =
        (window.__SW_PANELS__ && window.__SW_PANELS__[panelKey]) || panelConfigs[panelKey] || null;
      if (!config && chartEl.dataset.config) {
        try {
          config = JSON.parse(chartEl.dataset.config) as PanelRuntimeConfig;
        } catch {
          /* ignore invalid embedded config — falls back below */
        }
      }
      if (!config) config = { panel_key: panelKey };
      renderPanel('#chart-' + panelKey, config);
    }
  },
};

window.swRuntime = swRuntime;

function setAllRefreshing(on: boolean): void {
  document
    .querySelectorAll('.sw-refresh-btn, button[onclick*="refreshPanel"], .sw-card-actions button')
    .forEach((btn) => {
      if (on) btn.classList.add('sw-refreshing');
      else btn.classList.remove('sw-refreshing');
    });
}

window.addEventListener('message', (event: MessageEvent) => {
  // Source-identity check: only the embedding parent may drive the sandbox.
  if (event.source !== window.parent) return;

  const msg: unknown = event.data;
  if (!msg || typeof msg !== 'object' || !('type' in (msg as object))) return;
  const { type } = msg as { type: string };

  switch (type) {
    case 'PANEL_DATA_UPDATED': {
      const { panelKey, data } = msg as { panelKey: string; data: PanelData };
      swRuntime._updatePanel(panelKey, data);
      break;
    }
    case 'GLOBAL_REFRESH_START':
      setAllRefreshing(true);
      break;
    case 'GLOBAL_REFRESH_DONE': {
      const { dataMap } = msg as { dataMap?: Record<string, PanelData> };
      if (dataMap) {
        window.__SW_DATA__ = dataMap;
        Object.keys(dataMap).forEach((key) => {
          swRuntime._updatePanel(key, dataMap[key]);
        });
      }
      setAllRefreshing(false);
      break;
    }
    case 'GLOBAL_REFRESH_ERROR':
      setAllRefreshing(false);
      break;
    case 'THEME_SYNC': {
      const { theme } = msg as { theme?: string };
      applyTheme(theme);
      // Re-render all panels so Canvas charts pick up the newly computed theme colors
      document.querySelectorAll<HTMLElement>('[data-config]').forEach((el) => {
        try {
          const panelKey = el.dataset.panelKey || (el.id || '').replace(/^chart-/, '');
          const cfg = (window.__SW_PANELS__ && window.__SW_PANELS__[panelKey]) || JSON.parse(el.dataset.config || '{}');
          if (window.swChart && window.swChart.render) {
            window.swChart.render('#' + el.id, cfg);
          }
        } catch {
          // ignore parse error
        }
      });
      break;
    }
    case 'SCROLL_TO_SECTION': {
      const { sectionId } = msg as { sectionId?: string };
      const section = sectionId && document.getElementById('section-' + sectionId);
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      break;
    }
  }
});