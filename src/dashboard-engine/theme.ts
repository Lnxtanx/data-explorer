// =============================================================================
// Dashboard Render Engine — theme resolution
// The engine only understands { dark, light }. The parent app decides the
// theme (via next-themes) and either injects __SW_THEME__ (backend compose) or
// pushes THEME_SYNC. Anything other than 'light' resolves to 'dark'.
// =============================================================================

import type { SwTheme } from './contract';

export function resolveTheme(theme?: string | null): SwTheme {
  if (theme === 'light' || theme === 'dark-black' || theme === 'blue-gray') return theme;
  return 'dark';
}

export function applyTheme(theme?: string | null): void {
  document.documentElement.dataset.theme = resolveTheme(theme);
}

/**
 * Resolve a CSS variable into a concrete Hex/RGB color string for HTML5 Canvas
 * rendering contexts (Chart.js), which cannot evaluate var(--...) natively.
 */
export function getThemeColor(varName: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return val || fallback;
}