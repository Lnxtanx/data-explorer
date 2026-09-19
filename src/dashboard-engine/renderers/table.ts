// =============================================================================
// Dashboard Render Engine — table renderer
// =============================================================================

import { escHtml, fmtDate, fmtNumber, isDateCol, isNumericVal } from '../format';
import type { PanelData, PanelRuntimeConfig } from '../contract';

export function renderTable(container: HTMLElement, data: PanelData | null, config: PanelRuntimeConfig): void {
  if (!data || !data.rows || data.rows.length === 0) {
    container.innerHTML = '<div class="sw-error-card"><div class="sw-error-title">No Data</div><div class="sw-error-message">This query returned no results.</div></div>';
    return;
  }

  const cols = data.columns || [];
  let html = '<div class="sw-table-wrapper"><table class="sw-table"><thead><tr>';
  cols.forEach((c) => {
    html += '<th>' + escHtml(c.name) + '</th>';
  });
  html += '</tr></thead><tbody>';

  data.rows.forEach((row) => {
    html += '<tr>';
    row.forEach((v, i) => {
      const colName = cols[i]?.name || '';
      if (isNumericVal(v)) {
        html += '<td class="sw-num">' + escHtml(fmtNumber(v, config)) + '</td>';
      } else if (isDateCol(colName)) {
        html += '<td>' + escHtml(fmtDate(v)) + '</td>';
      } else {
        html += '<td>' + escHtml(String(v ?? '')) + '</td>';
      }
    });
    html += '</tr>';
  });

  html += '</tbody></table></div>';
  container.innerHTML = html;
}