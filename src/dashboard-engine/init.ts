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

export function decorateCardActions(root: Document | HTMLElement = document): void {
  root.querySelectorAll<HTMLElement>('.sw-card').forEach((card) => {
    let actions = card.querySelector<HTMLElement>('.sw-card-actions');
    const header = card.querySelector<HTMLElement>('.sw-card-header');
    if (!actions && header) {
      actions = document.createElement('div');
      actions.className = 'sw-card-actions';
      header.appendChild(actions);
    }
    if (!actions) return;

    const panelKey = (card.id || '').replace(/^card-/, '') || card.getAttribute('data-panel-key') || '';
    if (!panelKey) return;

    // 1. Refresh button (always visible in card header next to menu)
    let refreshBtn = actions.querySelector<HTMLButtonElement>(
      '.sw-refresh-btn, button[onclick*="refreshPanel"]'
    );
    if (!refreshBtn) {
      refreshBtn = document.createElement('button');
      refreshBtn.className = 'sw-card-action-btn sw-refresh-btn';
      refreshBtn.title = 'Refresh this panel';
      refreshBtn.onclick = () => window.swRuntime?.refreshPanel(panelKey);
      refreshBtn.innerHTML = REFRESH_SVG;
    } else {
      if (!refreshBtn.classList.contains('sw-refresh-btn')) {
        refreshBtn.classList.add('sw-refresh-btn');
      }
      if (!refreshBtn.classList.contains('sw-card-action-btn')) {
        refreshBtn.classList.add('sw-card-action-btn');
      }
      if (!refreshBtn.getAttribute('title')) {
        refreshBtn.setAttribute('title', 'Refresh this panel');
      }
      if (!refreshBtn.querySelector('.sw-refresh-icon')) {
        refreshBtn.innerHTML = REFRESH_SVG;
      }
    }

    // 2. Remove any loose legacy buttons from .sw-card-actions root
    actions.querySelectorAll(':scope > button:not(.sw-refresh-btn):not(.sw-menu-btn)').forEach((b) => b.remove());

    // 3. Three-dot menu button & dropdown container
    let menuWrap = actions.querySelector<HTMLElement>('.sw-card-menu-wrap');
    if (!menuWrap) {
      menuWrap = document.createElement('div');
      menuWrap.className = 'sw-card-menu-wrap';
      menuWrap.innerHTML = `
        <button class="sw-card-action-btn sw-menu-btn" title="More options">
          <svg class="sw-btn-icon" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/><circle cx="5" cy="12" r="1.5"/></svg>
        </button>
        <div class="sw-card-dropdown" id="menu-${panelKey}">
          <button class="sw-dropdown-item sw-expand-btn">
            <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><path d="M15 3h6v6m-6 5 6 6m0-6v6h-6M9 21H3v-6m6-5L3 4m0 6V4h6"/></svg>
            <span>Focus Mode</span>
          </button>
          <button class="sw-dropdown-item sw-resize-btn">
            <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><path d="m8 7-5 5 5 5m8-10 5 5-5 5M3 12h18"/></svg>
            <span>Resize Width</span>
          </button>
          <button class="sw-dropdown-item sw-collapse-btn">
            <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><path d="m18 15-6-6-6 6"/></svg>
            <span>Collapse</span>
          </button>
          <div class="sw-dropdown-divider"></div>
          <button class="sw-dropdown-item sw-move-btn" data-dir="up">
            <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><path d="m15 18-6-6 6-6"/></svg>
            <span>Move Left</span>
          </button>
          <button class="sw-dropdown-item sw-move-btn" data-dir="down">
            <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><path d="m9 18 6-6-6-6"/></svg>
            <span>Move Right</span>
          </button>
          <div class="sw-dropdown-divider"></div>
          <button class="sw-dropdown-item sw-hide-btn">
            <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            <span>Hide Card</span>
          </button>
          <button class="sw-dropdown-item sw-delete-btn sw-dropdown-danger">
            <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2m-6 5v6m4-6v6"/></svg>
            <span>Delete Card</span>
          </button>
        </div>
      `;
    }

    // Attach click handlers
    const menuBtn = menuWrap.querySelector<HTMLButtonElement>('.sw-menu-btn');
    if (menuBtn) {
      menuBtn.onclick = (e) => {
        e.stopPropagation();
        window.swRuntime?.toggleCardMenu?.(menuBtn, panelKey);
      };
    }

    const expandBtn = menuWrap.querySelector<HTMLButtonElement>('.sw-expand-btn');
    if (expandBtn) {
      expandBtn.onclick = (e) => {
        e.stopPropagation();
        window.swRuntime?.closeAllCardMenus?.();
        window.swRuntime?.expandPanel(panelKey);
      };
    }

    const resizeBtn = menuWrap.querySelector<HTMLButtonElement>('.sw-resize-btn');
    if (resizeBtn) {
      resizeBtn.onclick = (e) => {
        e.stopPropagation();
        window.swRuntime?.closeAllCardMenus?.();
        window.swRuntime?.resizePanel(panelKey);
      };
    }

    const collapseBtn = menuWrap.querySelector<HTMLButtonElement>('.sw-collapse-btn');
    if (collapseBtn) {
      collapseBtn.onclick = (e) => {
        e.stopPropagation();
        window.swRuntime?.closeAllCardMenus?.();
        window.swRuntime?.collapsePanel(panelKey);
      };
    }

    const moveUpBtn = menuWrap.querySelector<HTMLButtonElement>('.sw-move-btn[data-dir="up"]');
    if (moveUpBtn) {
      moveUpBtn.onclick = (e) => {
        e.stopPropagation();
        window.swRuntime?.closeAllCardMenus?.();
        window.swRuntime?.movePanel(panelKey, 'up');
      };
    }

    const moveDownBtn = menuWrap.querySelector<HTMLButtonElement>('.sw-move-btn[data-dir="down"]');
    if (moveDownBtn) {
      moveDownBtn.onclick = (e) => {
        e.stopPropagation();
        window.swRuntime?.closeAllCardMenus?.();
        window.swRuntime?.movePanel(panelKey, 'down');
      };
    }

    const hideBtn = menuWrap.querySelector<HTMLButtonElement>('.sw-hide-btn');
    if (hideBtn) {
      hideBtn.onclick = (e) => {
        e.stopPropagation();
        window.swRuntime?.closeAllCardMenus?.();
        window.swRuntime?.hidePanel(panelKey);
      };
    }

    const deleteBtn = menuWrap.querySelector<HTMLButtonElement>('.sw-delete-btn');
    if (deleteBtn) {
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        window.swRuntime?.closeAllCardMenus?.();
        window.swRuntime?.deletePanel(panelKey);
      };
    }

    actions.appendChild(refreshBtn);
    actions.appendChild(menuWrap);

    // Attach interactive 2D corner drag resize handle
    if (!card.querySelector('.sw-card-resize-handle')) {
      const handle = document.createElement('div');
      handle.className = 'sw-card-resize-handle';
      handle.title = 'Drag to resize card width and height';
      card.appendChild(handle);
      attachCardResizeHandler(card, handle, panelKey);
    }

    // Check config for initial col_span, height, or hidden status
    const chartEl = card.querySelector<HTMLElement>('[id^="chart-"]');
    if (chartEl && chartEl.dataset.config) {
      try {
        const cfg = JSON.parse(chartEl.dataset.config);
        if (cfg.col_span && (cfg.col_span === 2 || cfg.col_span === 3)) {
          card.classList.add(`sw-col-span-${cfg.col_span}`);
        }
        if (cfg.height && typeof cfg.height === 'number') {
          card.style.minHeight = `${cfg.height}px`;
        }
        if (cfg.is_hidden === true) {
          card.classList.add('sw-card-hidden');
        }
      } catch {}
    }
  });
}

/**
 * Interactive 2D freeform drag resizing for dashboard cards.
 * Controls width (column span snapping) and height (fluid vertical stretch) with live chart reflow.
 */
function attachCardResizeHandler(card: HTMLElement, handle: HTMLElement, panelKey: string): void {
  handle.addEventListener('pointerdown', (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const startHeight = card.offsetHeight;
    const grid = card.closest<HTMLElement>('.sw-grid');
    const gridWidth = grid ? grid.offsetWidth : window.innerWidth;

    let currentSpan: 1 | 2 | 3 = 1;
    if (card.classList.contains('sw-col-span-3')) currentSpan = 3;
    else if (card.classList.contains('sw-col-span-2')) currentSpan = 2;

    let targetSpan: 1 | 2 | 3 = currentSpan;
    let targetHeight = startHeight;

    card.classList.add('sw-card-resizing');
    const canvasId = 'chart-' + panelKey + '-canvas';

    const onPointerMove = (ev: PointerEvent) => {
      const deltaX = ev.clientX - startX;
      const deltaY = ev.clientY - startY;

      // 1. Height adjustment (clamped between 200px and 850px)
      targetHeight = Math.max(200, Math.min(850, Math.round(startHeight + deltaY)));
      card.style.minHeight = `${targetHeight}px`;

      // 2. Width adjustment via column span snapping based on projected width
      const colWidth = gridWidth / 3;
      const projectedWidth = (currentSpan * colWidth) + deltaX;
      if (projectedWidth > colWidth * 2.15) {
        targetSpan = 3;
      } else if (projectedWidth > colWidth * 1.25) {
        targetSpan = 2;
      } else {
        targetSpan = 1;
      }

      if (!card.classList.contains(`sw-col-span-${targetSpan}`)) {
        card.classList.remove('sw-col-span-1', 'sw-col-span-2', 'sw-col-span-3');
        card.classList.add(`sw-col-span-${targetSpan}`);
      }

      const chartInst = (window as any).chartInstances?.[canvasId];
      if (chartInst?.resize) {
        chartInst.resize();
      }
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      card.classList.remove('sw-card-resizing');

      // Persist new 2D dimensions
      window.swRuntime?.resizePanel(panelKey, {
        colSpan: targetSpan,
        height: targetHeight,
      });
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  });
}

// Keep backwards-compatible alias
export const decorateRefreshButtons = decorateCardActions;

/**
 * Scroll-spy: report which section is currently in view to the parent app so
 * the sidebar can highlight the active row (SECTION_VISIBLE reverse channel).
 *
 * The dashboard body lives inside a sandboxed iframe (allow-scripts only), so
 * the parent cannot observe scroll itself — we must postMessage from here.
 * Uses a scroll listener + rAF throttle (predictable "last section above the
 * marker line" semantics, including smooth scrollIntoView and end-of-page).
 *
 * Singleton: calling again tears down the previous instance (safe for tests
 * and for re-init after HTML re-composition).
 */
let teardownSectionSpy: (() => void) | null = null;

export function setupSectionVisibilitySpy(): void {
  teardownSectionSpy?.();
  teardownSectionSpy = null;

  const sections = Array.from(
    document.querySelectorAll<HTMLElement>('section[id^="section-"]')
  );
  if (sections.length === 0) return;

  // Activation line: a few px below the in-iframe dashboard title header.
  const MARKER_Y = 96;
  let lastPostedId: string | null = null;
  let rafId = 0;
  let disposed = false;

  const computeActiveId = (): string => {
    // Scrolled to (or near) the bottom → last section wins even if short.
    const scrollBottom = window.scrollY + window.innerHeight;
    if (scrollBottom >= document.documentElement.scrollHeight - 4) {
      return sections[sections.length - 1].id.replace(/^section-/, '');
    }
    // Last section whose top has crossed the marker line.
    let active = sections[0].id.replace(/^section-/, '');
    for (const sec of sections) {
      const top = sec.getBoundingClientRect().top;
      if (top <= MARKER_Y) {
        active = sec.id.replace(/^section-/, '');
      } else {
        break;
      }
    }
    return active;
  };

  const postIfChanged = () => {
    rafId = 0;
    if (disposed) return;
    const id = computeActiveId();
    if (id === lastPostedId) return;
    lastPostedId = id;
    parent.postMessage({ type: 'SECTION_VISIBLE', sectionId: id }, '*');
  };

  const schedule = () => {
    if (disposed || rafId) return;
    rafId = requestAnimationFrame(postIfChanged);
  };

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  // Initial tick so the first section highlights before any user scroll.
  schedule();

  teardownSectionSpy = () => {
    disposed = true;
    if (rafId) cancelAnimationFrame(rafId);
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
  };
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

  // Decorate all section headers with accordion chevrons
  document.querySelectorAll<HTMLElement>('.sw-section').forEach((sectionEl) => {
    const header = sectionEl.querySelector<HTMLElement>('.sw-section-header');
    const sid = sectionEl.id.replace(/^section-/, '');
    if (header && !header.querySelector('.sw-section-chevron')) {
      const chevron = document.createElement('span');
      chevron.className = 'sw-section-chevron';
      chevron.innerHTML = `<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none"><path d="m6 9 6 6 6-6"/></svg>`;
      header.appendChild(chevron);
      header.onclick = (e) => {
        // Prevent click if clicking inside an action or button in header
        if ((e.target as HTMLElement).closest('button, a')) return;
        window.swRuntime?.toggleSection(sid);
      };
    }
  });

  // Auto-decorate any action buttons
  decorateCardActions();

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

  // Sidebar active-section highlight: post SECTION_VISIBLE on scroll.
  setupSectionVisibilitySpy();
});

if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('.sw-card-menu-wrap')) {
      window.swRuntime?.closeAllCardMenus?.();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      window.swRuntime?.closeAllCardMenus?.();
    }
  });
}