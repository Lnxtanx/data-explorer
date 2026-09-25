// =============================================================================
// Dashboard Render Engine — shared contracts
// Single source of truth for the sandbox runtime <-> parent messaging contract
// and for the globals injected into the sandbox by the backend's composeHtml.
//
// This module is type-only (every export is erased by esbuild during bundling),
// so importing it from app-side React code costs nothing at runtime.
// =============================================================================

export type SwTheme = 'light' | 'dark' | 'dark-black' | 'blue-gray';

export interface PanelData {
  columns: Array<{ name: string; dataTypeID?: number }>;
  rows: unknown[][];
  error?: string;
}

export interface InsightEvidence {
  title?: string;
  classification?: string;
  current_value?: number | null;
  previous_value?: number | null;
  delta_pct?: number | null;
  comparison_period?: string | null;
  interpretation?: string;
  recommendation?: string;
  confidence?: string | null;
}

export interface PanelRuntimeConfig {
  panel_key?: string;
  type?: string;
  title?: string;
  color?: string;
  [key: string]: unknown;
}

export interface SectionRuntime {
  id: string;
  title?: string;
  is_pulse?: boolean;
  summary?: string;
  icon?: string;
}

/** Globals injected into the sandbox document by the backend's composeHtml. */
export interface EngineGlobals {
  __SW_DATA__?: Record<string, PanelData>;
  __SW_PANELS__?: Record<string, PanelRuntimeConfig>;
  __SW_SECTIONS__?: Record<string, SectionRuntime>;
  __SW_THEME__?: SwTheme;
}

export interface SwChartApi {
  render: (selector: string, config?: PanelRuntimeConfig) => void;
}

export interface SwRuntimeApi {
  refreshPanel: (panelKey: string) => void;
  whyPanel: (panelKey: string) => void;
  deletePanel: (panelKey: string) => void;
  movePanel: (panelKey: string, direction: 'up' | 'down') => void;
  expandPanel: (panelKey: string) => void;
  resizePanel: (panelKey: string, options?: (1 | 2 | 3) | { colSpan?: 1 | 2 | 3; height?: number }) => void;
  collapsePanel: (panelKey: string) => void;
  hidePanel: (panelKey: string) => void;
  unhidePanel: (panelKey: string) => void;
  toggleSection: (sectionId: string) => void;
  toggleCardMenu?: (btnOrKey: HTMLElement | string, panelKey?: string) => void;
  closeAllCardMenus?: () => void;
  _updatePanel: (panelKey: string, data: PanelData) => void;
}

/**
 * postMessage contract between the sandboxed iframe and the parent app.
 * Messages travel both ways; see bridge.ts (sandbox side) and
 * de-DashboardView.tsx / DataExplorerLayout.tsx (parent side).
 */
export type BridgeMessage =
  | { type: 'DASHBOARD_LOADED'; panelCount: number; height: number }
  | { type: 'PANEL_REFRESH_REQUEST'; panelKey: string }
  | { type: 'INSIGHT_WHY_REQUEST'; panelKey: string; evidence?: InsightEvidence }
  | { type: 'PANEL_DATA_UPDATED'; panelKey: string; data: PanelData }
  | { type: 'GLOBAL_REFRESH_START' }
  | { type: 'GLOBAL_REFRESH_DONE'; dataMap: Record<string, PanelData> }
  | { type: 'GLOBAL_REFRESH_ERROR'; error?: string }
  | { type: 'SCROLL_TO_SECTION'; sectionId: string }
  | { type: 'SECTION_VISIBLE'; sectionId: string }
  | { type: 'THEME_SYNC'; theme: SwTheme }
  | { type: 'PANEL_DELETE_REQUEST'; panelKey: string; title?: string }
  | { type: 'PANEL_MOVE_REQUEST'; panelKey: string; direction: 'up' | 'down' }
  | { type: 'PANEL_DELETED'; panelKey: string }
  | { type: 'PANEL_RESIZE_REQUEST'; panelKey: string; colSpan?: 1 | 2 | 3; height?: number }
  | { type: 'PANEL_HIDE_REQUEST'; panelKey: string; isHidden: boolean; title?: string }
  | { type: 'UNHIDE_PANEL'; panelKey: string }
  | { type: 'SET_PERMISSIONS'; canEdit: boolean };

declare global {
  interface Window extends EngineGlobals {
    swChart?: SwChartApi;
    swRuntime?: SwRuntimeApi;
    Chart?: any;
  }
}