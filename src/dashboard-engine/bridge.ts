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
import { chartInstances } from './chart-instances';

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
    const card = document.getElementById('card-' + panelKey);
    const title = card?.querySelector('.sw-card-title')?.textContent?.trim() || '';
    const evidence = getInsightEvidence(panelKey);
    if (evidence && title && !evidence.title) {
      evidence.title = title;
    }
    parent.postMessage(
      {
        type: 'INSIGHT_WHY_REQUEST',
        panelKey,
        title: title || evidence?.title || undefined,
        evidence: evidence || undefined,
      },
      '*'
    );
  },

  deletePanel(panelKey: string): void {
    const card = document.getElementById('card-' + panelKey);
    const title = card?.querySelector('.sw-card-title')?.textContent?.trim() || panelKey;
    parent.postMessage({ type: 'PANEL_DELETE_REQUEST', panelKey, title }, '*');
  },

  movePanel(panelKey: string, direction: 'up' | 'down'): void {
    const card = document.getElementById('card-' + panelKey);
    if (!card) return;
    const parentGrid = card.parentElement;
    if (!parentGrid) return;

    if (direction === 'up' && card.previousElementSibling) {
      parentGrid.insertBefore(card, card.previousElementSibling);
      card.classList.add('sw-card-reordered');
      setTimeout(() => card.classList.remove('sw-card-reordered'), 400);
      parent.postMessage({ type: 'PANEL_MOVE_REQUEST', panelKey, direction }, '*');
    } else if (direction === 'down' && card.nextElementSibling) {
      parentGrid.insertBefore(card.nextElementSibling, card);
      card.classList.add('sw-card-reordered');
      setTimeout(() => card.classList.remove('sw-card-reordered'), 400);
      parent.postMessage({ type: 'PANEL_MOVE_REQUEST', panelKey, direction }, '*');
    }
  },

  expandPanel(panelKey: string): void {
    const card = document.getElementById('card-' + panelKey);
    if (!card) return;
    const isCurrentlyFocused = card.classList.contains('sw-card-focused');

    let backdrop = document.getElementById('sw-focus-backdrop');
    if (isCurrentlyFocused) {
      card.classList.remove('sw-card-focused');
      if (backdrop) {
        backdrop.classList.remove('sw-visible');
        setTimeout(() => backdrop?.remove(), 200);
      }
      const expandBtn = card.querySelector<HTMLButtonElement>('.sw-expand-btn');
      if (expandBtn) {
        expandBtn.title = 'Expand to Focus Mode';
        expandBtn.innerHTML = `<svg class="sw-btn-icon" viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><path d="M15 3h6v6m-6 5 6 6m0-6v6h-6M9 21H3v-6m6-5L3 4m0 6V4h6"/></svg>`;
      }
    } else {
      // Remove focus from any other card
      document.querySelectorAll('.sw-card.sw-card-focused').forEach((c) => {
        c.classList.remove('sw-card-focused');
      });
      if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'sw-focus-backdrop';
        backdrop.className = 'sw-focus-backdrop';
        backdrop.onclick = () => swRuntime.expandPanel(panelKey);
        document.body.appendChild(backdrop);
        requestAnimationFrame(() => backdrop?.classList.add('sw-visible'));
      }
      card.classList.add('sw-card-focused');
      const expandBtn = card.querySelector<HTMLButtonElement>('.sw-expand-btn');
      if (expandBtn) {
        expandBtn.title = 'Close Focus Mode (Esc)';
        expandBtn.innerHTML = `<svg class="sw-btn-icon" viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><path d="M4 14h6v6m0-6-7 7m17-7h-6v6m0-6 7 7M10 4v6H4m6 0L3 3m17 7h-6V4m0 6 7-7"/></svg>`;
      }
    }

    const canvasId = 'chart-' + panelKey + '-canvas';
    setTimeout(() => {
      if (chartInstances[canvasId]?.resize) {
        chartInstances[canvasId].resize();
      }
    }, 60);
  },

  resizePanel(panelKey: string, options?: (1 | 2 | 3) | { colSpan?: 1 | 2 | 3; height?: number }): void {
    const card = document.getElementById('card-' + panelKey);
    if (!card) return;

    let targetSpan: 1 | 2 | 3 | undefined;
    let targetHeight: number | undefined;

    if (typeof options === 'number') {
      targetSpan = options;
    } else if (typeof options === 'object' && options !== null) {
      targetSpan = options.colSpan;
      targetHeight = options.height;
    }

    if (targetSpan === undefined && targetHeight === undefined) {
      let currentSpan: 1 | 2 | 3 = 1;
      if (card.classList.contains('sw-col-span-3')) currentSpan = 3;
      else if (card.classList.contains('sw-col-span-2')) currentSpan = 2;
      targetSpan = currentSpan === 1 ? 2 : currentSpan === 2 ? 3 : 1;
    }

    if (targetSpan !== undefined) {
      card.classList.remove('sw-col-span-1', 'sw-col-span-2', 'sw-col-span-3');
      card.classList.add(`sw-col-span-${targetSpan}`);
      const resizeBtn = card.querySelector<HTMLButtonElement>('.sw-resize-btn');
      if (resizeBtn) {
        resizeBtn.title = `Width: ${targetSpan}x (Click to cycle 1x/2x/3x)`;
      }
    }

    if (typeof targetHeight === 'number') {
      const clamped = Math.max(200, Math.min(900, Math.round(targetHeight)));
      card.style.minHeight = `${clamped}px`;
    }

    const canvasId = 'chart-' + panelKey + '-canvas';
    setTimeout(() => {
      if (chartInstances[canvasId]?.resize) {
        chartInstances[canvasId].resize();
      }
    }, 40);

    parent.postMessage({
      type: 'PANEL_RESIZE_REQUEST',
      panelKey,
      colSpan: targetSpan,
      height: targetHeight,
    }, '*');
  },

  collapsePanel(panelKey: string): void {
    const card = document.getElementById('card-' + panelKey);
    if (!card) return;
    const isCollapsed = card.classList.toggle('sw-card-collapsed');
    const collapseBtn = card.querySelector<HTMLButtonElement>('.sw-collapse-btn');
    if (collapseBtn) {
      collapseBtn.title = isCollapsed ? 'Expand panel' : 'Collapse panel';
      collapseBtn.innerHTML = isCollapsed
        ? `<svg class="sw-btn-icon" viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><path d="m6 9 6 6 6-6"/></svg>`
        : `<svg class="sw-btn-icon" viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><path d="m18 15-6-6-6 6"/></svg>`;
    }

    if (!isCollapsed) {
      const canvasId = 'chart-' + panelKey + '-canvas';
      setTimeout(() => {
        if (chartInstances[canvasId]?.resize) {
          chartInstances[canvasId].resize();
        }
      }, 40);
    }
  },

  hidePanel(panelKey: string): void {
    const card = document.getElementById('card-' + panelKey);
    if (!card) return;
    const title = card.querySelector('.sw-card-title')?.textContent?.trim() || panelKey;
    card.classList.add('sw-card-deleting');
    setTimeout(() => {
      card.classList.remove('sw-card-deleting');
      card.classList.add('sw-card-hidden');
      parent.postMessage({ type: 'PANEL_HIDE_REQUEST', panelKey, isHidden: true, title }, '*');
    }, 240);
  },

  unhidePanel(panelKey: string): void {
    const card = document.getElementById('card-' + panelKey);
    if (!card) return;
    card.classList.remove('sw-card-hidden');
    card.classList.add('sw-card-reordered');
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => card.classList.remove('sw-card-reordered'), 450);

    const canvasId = 'chart-' + panelKey + '-canvas';
    setTimeout(() => {
      if (chartInstances[canvasId]?.resize) {
        chartInstances[canvasId].resize();
      }
    }, 60);

    parent.postMessage({ type: 'PANEL_HIDE_REQUEST', panelKey, isHidden: false }, '*');
  },

  toggleSection(sectionId: string): void {
    const section = document.getElementById('section-' + sectionId);
    if (section) {
      section.classList.toggle('sw-section-collapsed');
    }
  },

  toggleCardMenu(btnOrKey: HTMLElement | string, panelKey?: string): void {
    const key = typeof btnOrKey === 'string' ? btnOrKey : panelKey || '';
    const card = document.getElementById('card-' + key);
    if (!card) return;
    const dropdown = card.querySelector<HTMLElement>('.sw-card-dropdown');
    if (!dropdown) return;
    const wasOpen = dropdown.classList.contains('sw-show');
    swRuntime.closeAllCardMenus();
    if (!wasOpen) {
      dropdown.classList.add('sw-show');
      card.classList.add('sw-card-menu-open');
    }
  },

  closeAllCardMenus(): void {
    document.querySelectorAll('.sw-card-dropdown.sw-show').forEach((d) => {
      d.classList.remove('sw-show');
    });
    document.querySelectorAll('.sw-card.sw-card-menu-open').forEach((c) => {
      c.classList.remove('sw-card-menu-open');
    });
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
    case 'PANEL_DELETED': {
      const { panelKey } = msg as { panelKey?: string };
      if (panelKey) {
        const card = document.getElementById('card-' + panelKey);
        if (card) {
          card.classList.add('sw-card-deleting');
          setTimeout(() => {
            card.remove();
          }, 260);
        }
      }
      break;
    }
    case 'UNHIDE_PANEL': {
      const { panelKey } = msg as { panelKey?: string };
      if (panelKey) {
        swRuntime.unhidePanel(panelKey);
      }
      break;
    }
    case 'SET_PERMISSIONS': {
      const { canEdit } = msg as { canEdit?: boolean };
      if (canEdit) {
        document.body.classList.remove('sw-read-only');
        document.body.classList.add('sw-can-edit');
      } else {
        document.body.classList.add('sw-read-only');
        document.body.classList.remove('sw-can-edit');
      }
      break;
    }
  }
});

window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    const focusedCard = document.querySelector('.sw-card.sw-card-focused');
    if (focusedCard) {
      const panelKey = (focusedCard.id || '').replace(/^card-/, '') || focusedCard.getAttribute('data-panel-key') || '';
      if (panelKey) {
        swRuntime.expandPanel(panelKey);
      }
    }
  }
});