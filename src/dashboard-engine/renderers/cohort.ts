// cohort retention grid renderer (chart_type: cohort)
import { escHtml, fmtNumber, isNumericVal } from '../format';
import { getThemeColor } from '../theme';
import type { PanelData, PanelRuntimeConfig } from '../contract';

export interface CohortCell {
  count: number;
  pct: number;
}

export interface CohortMatrix {
  cohorts: string[];
  ages: string[];
  cells: CohortCell[][];
  cohortColName: string;
  ageColName: string;
  valueColName: string;
}

export function pivotCohortMatrix(data: PanelData | null, config: PanelRuntimeConfig): CohortMatrix | null {
  if (!data || !data.rows || !data.columns || data.rows.length === 0 || data.columns.length === 0) return null;
  const cols = data.columns;
  const colI = (name: unknown, fallback: number): number => {
    if (typeof name !== 'string' || !name) return fallback;
    const i = cols.findIndex((c) => c.name === name);
    return i >= 0 ? i : fallback;
  };
  const cohortI = colI(config.cohort_col, 0);
  let ageI = colI(config.age_col, -1);
  if (ageI < 0 || ageI === cohortI) {
    ageI = cols.findIndex((_, i) => i !== cohortI);
    if (ageI < 0) ageI = 0;
  }
  let valueI = colI(config.value_col, -1);
  if (valueI < 0 || valueI === cohortI || valueI === ageI) {
    valueI = cols.findIndex((c, i) => i !== cohortI && i !== ageI && data.rows.some((r) => isNumericVal(r[i])));
    if (valueI < 0) valueI = cols.length - 1;
  }
  const cohortOrder: string[] = [];
  const ageOrder: string[] = [];
  const longMap = new Map<string, number>();
  const keyOf = (c: string, a: string): string => c + '\u0000' + a;

  for (const r of data.rows) {
    const c = String(r[cohortI] ?? '');
    const a = String(r[ageI] ?? '');
    if (!cohortOrder.includes(c)) cohortOrder.push(c);
    if (!ageOrder.includes(a)) ageOrder.push(a);
    const v = Number(r[valueI]);
    const k = keyOf(c, a);
    longMap.set(k, (longMap.get(k) || 0) + (isNumericVal(v) ? v : 0));
  }

  const sortDir = String(config.age_sort || '') === 'desc' ? -1 : 1;
  const numericAges = ageOrder.length > 0 && ageOrder.every((a) => a !== '' && String(Number(a)) === a && !isNaN(Number(a)));
  if (numericAges) ageOrder.sort((x, y) => (Number(x) - Number(y)) * sortDir);

  const cells: CohortCell[][] = cohortOrder.map((c, ci) =>
    ageOrder.map((a, ai) => {
      const count = longMap.get(keyOf(c, a)) || 0;
      let baseline = 0;
      for (let j = 0; j < ageOrder.length; j++) {
        const b = longMap.get(keyOf(cohortOrder[ci], ageOrder[j])) || 0;
        if (b > 0) { baseline = b; break; }
      }
      return { count, pct: baseline > 0 ? count / baseline : 0 };
    })
  );

  return {
    cohorts: cohortOrder,
    ages: ageOrder,
    cells,
    cohortColName: cols[cohortI]?.name || 'cohort',
    ageColName: cols[ageI]?.name || 'age',
    valueColName: cols[valueI]?.name || 'value',
  };
}

function heatLevel(pct: number): number {
  if (pct >= 0.8) return 6;
  if (pct >= 0.5) return 5;
  if (pct >= 0.3) return 4;
  if (pct >= 0.15) return 3;
  if (pct > 0) return 2;
  return 1;
}

export function renderCohort(container: HTMLElement, data: PanelData | null, config: PanelRuntimeConfig): void {
  const m = pivotCohortMatrix(data, config);
  if (!m || m.cohorts.length === 0 || m.ages.length === 0) {
    container.innerHTML = '<div class="sw-error-card"><div class="sw-error-title">No Data</div>' +
      '<div class="sw-error-message">Cohort requires rows with a cohort and an age bucket.</div></div>';
    return;
  }
  const cellsCss = getThemeColor ? 'color:var(--sw-txt, #20242c);' : '';
  container.innerHTML =
    '<div class="sw-cohort-wrap">' +
    '<table class="sw-cohort-table" style="' + cellsCss + '">' +
    '<thead><tr><th class="sw-cohort-corner">' + escHtml(m.cohortColName) + '</th>' +
    m.ages.map((a) => '<th class="sw-cohort-age">' + escHtml(a) + '</th>').join('') +
    '</tr></thead><tbody>' +
    m.cohorts.map((c, ci) =>
      '<tr><th class="sw-cohort-label">' + escHtml(c) + '</th>' +
      m.cells[ci].map((cell) => {
        const pct = Math.round(cell.pct * 100);
        const empty = cell.count === 0;
        const h = empty ? '' : ' sw-cohort-h' + heatLevel(cell.pct);
        const title = escHtml(c + ' / ' + m.ages?.[0] + ': ' + fmtNumber(cell.count));
        return '<td class="sw-cohort-cell' + h + (empty ? ' sw-cohort-empty' : '') + '" title="' + title + '">' +
          '<span class="sw-cohort-count">' + fmtNumber(cell.count) + '</span>' +
          (empty ? '' : '<span class="sw-cohort-pct">' + pct + '%</span>') +
          '</td>';
      }).join('') +
      '</tr>'
    ).join('') +
    '</tbody></table></div>';
}
