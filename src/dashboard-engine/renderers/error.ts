// =============================================================================
// Dashboard Render Engine — error card renderer
// =============================================================================

import { ERROR_SVG, escHtml, fmtDate, fmtNumber, isDateCol, isNumericVal } from '../format';
import type { PanelData, PanelRuntimeConfig } from '../contract';

export function renderError(container: HTMLElement, error: unknown): void {
  container.innerHTML =
    '<div class="sw-error-card">' +
    ERROR_SVG +
    '<div class="sw-error-title">Query Failed</div>' +
    '<div class="sw-error-message">' + escHtml(String(error || 'Unknown error')) + '</div>' +
    '</div>';
}

/**
 * Explicit "unsupported chart type" card. Replaces the old silent fallback that
 * rendered unknown types as a line chart. The raw rows are still shown in a
 * plain table so the returned data is never lost.
 */
export function renderUnsupported(
  container: HTMLElement,
  type: string,
  data: PanelData | null,
  config: PanelRuntimeConfig
): void {
  const cols = data?.columns || [];
  let rowsHtml = '';
  if (data && data.rows && data.rows.length > 0) {
    data.rows.slice(0, 200).forEach((row) => {
      rowsHtml += '<tr>';
      row.forEach((v, i) => {
        const colName = cols[i]?.name || '';
        if (isNumericVal(v)) rowsHtml += '<td class="sw-num">' + escHtml(fmtNumber(v, config)) + '</td>';
        else if (isDateCol(colName)) rowsHtml += '<td>' + escHtml(fmtDate(v)) + '</td>';
        else rowsHtml += '<td>' + escHtml(String(v ?? '')) + '</td>';
      });
      rowsHtml += '</tr>';
    });
  }

  container.innerHTML =
    '<div class="sw-unsupported-card">' +
    '<div class="sw-error-card">' +
    ERROR_SVG +
    '<div class="sw-error-title">Unsupported chart type</div>' +
    '<div class="sw-error-message">' +
    'The requested chart type <code>' + escHtml(type) + '</code> is not supported. ' +
    'Showing the raw query results instead.</div></div>' +
    '<div class="sw-table-wrapper"><table class="sw-table"><thead><tr>' +
    cols.map((c) => '<th>' + escHtml(c.name) + '</th>').join('') +
    '</tr></thead><tbody>' + rowsHtml + '</tbody></table></div>' +
    '</div>';
}