// =============================================================================
// Dashboard Render Engine — interactive table renderer
// Sortable columns (click header to cycle asc/desc), live search, pagination
// (10 / 25 / 50 / All), and a sticky header. Per-panel state is reset whenever
// refreshed data arrives (detected via a cheap data signature).
// =============================================================================

import { escHtml, fmtDate, fmtNumber, isDateCol, isNumericVal } from '../format';
import type { PanelData, PanelRuntimeConfig } from '../contract';

interface TableState {
  sig: string;
  sortIdx: number;
  sortDir: 1 | -1 | 0;
  search: string;
  page: number;
  pageSize: number;
}

const stateMap = new Map<string, TableState>();

const DEFAULTS: Omit<TableState, 'sig'> = { sortIdx: -1, sortDir: 0, search: '', page: 0, pageSize: 10 };
const PAGE_SIZES = [10, 25, 50, 'All'];

function dataSignature(data: PanelData): string {
  const head = data.rows[0]
    ? JSON.stringify(data.rows.slice(0, 3).map((r) => (r && r[0] !== undefined ? r[0] : null)))
    : '[]';
  return (data.columns || []).map((c) => c.name).join(',') + '|' + data.rows.length + '|' + head;
}

function getState(panelKey: string, data: PanelData): TableState {
  const sig = dataSignature(data);
  const existing = stateMap.get(panelKey);
  if (existing && existing.sig === sig) return existing;
  const fresh: TableState = { ...DEFAULTS, sig };
  stateMap.set(panelKey, fresh);
  return fresh;
}

function compareValues(a: unknown, b: unknown, numeric: boolean, date: boolean): number {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : -1;
  if (b === null || b === undefined) return 1;
  if (numeric) {
    const na = Number(a);
    const nb = Number(b);
    if (isNaN(na)) return isNaN(nb) ? String(a).localeCompare(String(b)) : 1;
    if (isNaN(nb)) return -1;
    return na - nb;
  }
  if (date) {
    const da = new Date(String(a)).getTime();
    const db = new Date(String(b)).getTime();
    if (!isNaN(da) && !isNaN(db)) return da - db;
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function rowSortKey(rows: unknown[][], idx: number): boolean {
  // A column is "numeric" if most of its values parse as numbers.
  if (rows.length === 0) return false;
  let numeric = 0;
  rows.forEach((r) => {
    if (isNumericVal(r[idx])) numeric += 1;
  });
  return numeric / rows.length >= 0.7;
}

function searchFilter(row: unknown[], search: string): boolean {
  if (!search) return true;
  return row.some((v) => String(v ?? '').toLowerCase().includes(search));
}

export function renderTable(container: HTMLElement, data: PanelData | null, config: PanelRuntimeConfig): void {
  if (!data || !data.rows || data.rows.length === 0) {
    container.innerHTML = '<div class="sw-error-card"><div class="sw-error-title">No Data</div><div class="sw-error-message">This query returned no results.</div></div>';
    return;
  }

  const cols = data.columns || [];
  const panelKey = (container.id || '').replace(/^chart-/, '');
  const state = getState(panelKey, data);

  // ── Filter / sort ─────────────────────────────────────────────────────
  const search = state.search.trim().toLowerCase();
  let rows = data.rows.filter((r) => searchFilter(r, search));

  if (state.sortIdx >= 0 && state.sortDir !== 0) {
    const idx = state.sortIdx;
    const numeric = rowSortKey(data.rows, idx);
    const date = !numeric && cols[idx] && isDateCol(cols[idx].name);
    rows = rows.slice().sort((a, b) => {
      const res = compareValues(a[idx], b[idx], numeric, date);
      return state.sortDir === 1 ? res : -res;
    });
  }

  // ── Pagination ────────────────────────────────────────────────────────
  const total = rows.length;
  const pageSize = state.pageSize === -1 ? total : state.pageSize;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (state.page >= pageCount) state.page = pageCount - 1;
  const pageRows = pageSize >= total ? rows : rows.slice(state.page * pageSize, (state.page + 1) * pageSize);

  const headerBtn = (i: number, name: string): string => {
    const arrow = state.sortIdx === i ? (state.sortDir === 1 ? ' ▲' : state.sortDir === -1 ? ' ▼' : '') : '';
    return '<th class="sw-table-th sw-table-th-sortable" data-idx="' + i + '" role="button" tabindex="0">' +
      escHtml(name) + '<span class="sw-table-sort">' + arrow + '</span></th>';
  };

  // ── Build HTML ────────────────────────────────────────────────────────
  let html =
    '<div class="sw-table-toolbar">' +
    '<input class="sw-table-search" type="search" placeholder="Search…" aria-label="Search" value="' +
    escHtml(state.search) + '">' +
    '<select class="sw-table-pagesize" aria-label="Rows per page">' +
    PAGE_SIZES.map((s) => {
      const v = s === 'All' ? -1 : s;
      return '<option value="' + v + '"' + (state.pageSize === v ? ' selected' : '') + '>' + s + '</option>';
    }).join('') +
    '</select></div>';

  html += '<div class="sw-table-wrapper"><table class="sw-table"><thead><tr>';
  cols.forEach((c, i) => {
    html += headerBtn(i, c.name);
  });
  html += '</tr></thead><tbody>';

  if (pageRows.length === 0) {
    html += '<tr><td class="sw-table-empty" colspan="' + cols.length + '">No matching rows.</td></tr>';
  }

  pageRows.forEach((row) => {
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

  // ── Pagination footer ─────────────────────────────────────────────────
  html +=
    '<div class="sw-table-footer">' +
    '<span class="sw-table-count">' + total + ' rows</span>' +
    '<div class="sw-table-pagination">' +
    '<button class="sw-table-pager" data-action="prev"' + (state.page === 0 ? ' disabled' : '') + '>‹ Prev</button>' +
    '<span class="sw-table-pageinfo">Page ' + (state.page + 1) + ' of ' + pageCount + '</span>' +
    '<button class="sw-table-pager" data-action="next"' + (state.page >= pageCount - 1 ? ' disabled' : '') + '>Next ›</button>' +
    '</div></div>';

  container.innerHTML = html;

  // ── Bind events ───────────────────────────────────────────────────────
  const searchInput = container.querySelector<HTMLInputElement>('.sw-table-search');
  if (searchInput) {
    searchInput.oninput = () => {
      state.search = searchInput.value;
      state.page = 0;
      renderTable(container, data, config);
    };
  }

  const pageSizeSel = container.querySelector<HTMLSelectElement>('.sw-table-pagesize');
  if (pageSizeSel) {
    pageSizeSel.onchange = () => {
      state.pageSize = Number(pageSizeSel.value) || -1;
      state.page = 0;
      renderTable(container, data, config);
    };
  }

  container.querySelectorAll<HTMLElement>('.sw-table-th-sortable').forEach((th) => {
    const idx = Number(th.dataset.idx);
    const onSort = () => {
      if (state.sortIdx === idx) {
        state.sortDir = state.sortDir === 1 ? -1 : state.sortDir === -1 ? 0 : 1;
      } else {
        state.sortIdx = idx;
        state.sortDir = 1;
      }
      state.page = 0;
      renderTable(container, data, config);
    };
    th.onclick = onSort;
    th.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSort();
      }
    };
  });

  container.querySelectorAll<HTMLButtonElement>('.sw-table-pager').forEach((btn) => {
    btn.onclick = () => {
      if (btn.dataset.action === 'prev') state.page = Math.max(0, state.page - 1);
      else state.page = Math.min(pageCount - 1, state.page + 1);
      renderTable(container, data, config);
    };
  });
}