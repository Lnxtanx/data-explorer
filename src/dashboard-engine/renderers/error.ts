// =============================================================================
// Dashboard Render Engine — error card renderer
// =============================================================================

import { ERROR_SVG, escHtml } from '../format';

export function renderError(container: HTMLElement, error: unknown): void {
  container.innerHTML =
    '<div class="sw-error-card">' +
    ERROR_SVG +
    '<div class="sw-error-title">Query Failed</div>' +
    '<div class="sw-error-message">' + escHtml(String(error || 'Unknown error')) + '</div>' +
    '</div>';
}