// =============================================================================
// Dashboard Render Engine — line / bar / area chart renderer
// Chart.js is injected by the backend's composeHtml glue (chart.umd.min.js CDN).
//
// Expressiveness flags (all optional, supplied via the panel `config` dict):
//   y_cols: string[]        — explicit list of value columns → multi-series
//   y_col : string          — single value column (default: first numeric col)
//   stacked: boolean        — stack multiple series (bar / area)
//   horizontal: boolean     — horizontal bar chart (or index_axis: 'y')
//   y2_col: string          — extra column drawn as a line on its own right axis
// =============================================================================

import { fmtDate, isDateCol, isNumericVal } from '../format';
import { chartInstances, COLOR_PALETTE } from '../chart-instances';
import { getThemeColor } from '../theme';
import type { PanelData, PanelRuntimeConfig } from '../contract';

declare const Chart: any;

interface SeriesDef {
  name: string;
  idx: number;
}

/** Resolve the x-axis index and the list of value-series columns. */
function resolveSeries(data: PanelData, config: PanelRuntimeConfig): { xI: number; series: SeriesDef[] } {
  const cols = data.columns || [];
  const xIdx = config.x_col ? cols.findIndex((c) => c.name === config.x_col) : 0;
  const xI = xIdx >= 0 ? xIdx : 0;

  const numericIdxs = cols
    .map((c, i) => ({ name: c.name, i }))
    .filter((c) => c.i !== xI)
    .filter((c) => data.rows.some((r) => isNumericVal(r[c.i])));

  if (Array.isArray(config.y_cols)) {
    const defs: SeriesDef[] = [];
    const names = config.y_cols as string[];
    names.forEach((n) => {
      const i = cols.findIndex((c) => c.name === n);
      if (i >= 0) defs.push({ name: String(n), idx: i });
    });
    if (defs.length > 0) return { xI, series: defs };
  }

  if (config.y_col) {
    const i = cols.findIndex((c) => c.name === config.y_col);
    if (i >= 0) return { xI, series: [{ name: String(config.y_col), idx: i }] };
    // Explicit y_col missing from result set → fall through to auto-detect.
  }

  const numerical = numericIdxs.filter((c) => isNumericVal(data.rows[0]?.[c.i]));
  if (numerical.length >= 2) return { xI, series: numerical.map((c) => ({ name: c.name, idx: c.i })) };
  if (numerical.length === 1) return { xI, series: [{ name: numerical[0].name, idx: numerical[0].i }] };
  return { xI, series: [] };
}

export function renderChart(container: HTMLElement, data: PanelData | null, config: PanelRuntimeConfig, type: string): void {
  if (!data || !data.rows || data.rows.length === 0) {
    container.innerHTML = '<div class="sw-error-card"><div class="sw-error-title">No Data</div><div class="sw-error-message">This query returned no results.</div></div>';
    return;
  }

  const cols = data.columns || [];
  const { xI, series } = resolveSeries(data, config);

  if (series.length === 0) {
    container.innerHTML =
      '<div class="sw-unrenderable"><div class="sw-unrenderable-title">Cannot Render Chart</div>' +
      '<div class="sw-unrenderable-message">No numeric value column was found for this data.</div></div>';
    return;
  }

  const labels = data.rows.map((r) => {
    const v = r[xI];
    return isDateCol(cols[xI]?.name) ? fmtDate(v) : String(v ?? '');
  });

  const isArea = type === 'area';
  const isBar = type === 'bar';
  const stacked = config.stacked === true;
  const horizontal = config.horizontal === true || String(config.index_axis || '').toLowerCase() === 'y';

  const canvasId = container.id + '-canvas';
  container.innerHTML = '<canvas id="' + canvasId + '"></canvas>';
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  if (!canvas) return;

  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const textMutedColor = getThemeColor('--sw-text-muted', '#8b8ba0');
  const borderColor = getThemeColor('--sw-border', '#1e1e2a');
  const tooltipBg = getThemeColor('--sw-tooltip-bg', 'rgba(10, 10, 15, 0.95)');
  const tooltipTitle = getThemeColor('--sw-tooltip-title', '#ffffff');
  const tooltipText = getThemeColor('--sw-tooltip-text', '#e4e4ed');
  const tooltipBorder = getThemeColor('--sw-tooltip-border', 'rgba(255, 255, 255, 0.1)');

  const baseType = isArea ? 'line' : isBar ? 'bar' : 'line';

  const datasets = series.map((s, i) => {
    const color = config.color ? String(config.color) : COLOR_PALETTE[i % COLOR_PALETTE.length];
    const values = data.rows.map((r) => Number(r[s.idx]) || 0);
    const isLineStyle = !isBar;

    if (isBar) {
      return {
        label: s.name,
        data: values,
        backgroundColor: color + (stacked ? 'd9' : 'cc'),
        borderColor: color,
        borderWidth: 1,
        borderRadius: 4,
        maxBarThickness: 32,
        stack: stacked ? 'main' : undefined,
        yAxisID: 'y',
      };
    }

    const ds: Record<string, any> = {
      label: s.name,
      data: values,
      borderColor: color,
      backgroundColor: isArea ? color + '33' : 'transparent',
      fill: isArea,
      tension: 0.35,
      pointRadius: isLineStyle ? 2 : 0,
      pointHoverRadius: 4,
      borderWidth: 2,
    };
    if (isArea && stacked) {
      ds.stack = 'main';
      ds.backgroundColor = color + '55';
      ds.borderColor = color;
    }
    return ds;
  });

  // Optional secondary-axis overlay (combo chart: bar/line + line on right axis)
  if (config.y2_col) {
    const i = cols.findIndex((c) => c.name === config.y2_col);
    if (i >= 0) {
      const color = COLOR_PALETTE[series.length % COLOR_PALETTE.length];
      datasets.push({
        label: String(config.y2_col),
        data: data.rows.map((r) => Number(r[i]) || 0),
        borderColor: color,
        backgroundColor: 'transparent',
        pointRadius: 2,
        borderWidth: 2,
        tension: 0.3,
        yAxisID: 'y1',
        type: 'line',
      });
    }
  }

  const showLegend = datasets.length > 1;

  const options: Record<string, any> = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: horizontal ? 'y' : 'x',
    animation: { duration: 400 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: showLegend
        ? {
            display: true,
            position: 'top',
            align: 'start',
            labels: {
              color: textMutedColor,
              boxWidth: 10,
              boxHeight: 10,
              usePointStyle: true,
              pointStyle: 'circle',
              padding: 12,
              font: { size: 11 },
            },
          }
        : { display: false },
      tooltip: {
        backgroundColor: tooltipBg,
        titleColor: tooltipTitle,
        bodyColor: tooltipText,
        borderColor: tooltipBorder,
        borderWidth: 1,
        padding: 10,
        cornerRadius: 6,
      },
    },
    scales: {
      x: {
        grid: { color: borderColor },
        ticks: { color: textMutedColor, font: { size: 11 } },
        stacked: stacked && isBar,
      },
      y: {
        grid: { color: 'rgba(128, 128, 128, 0.1)' },
        ticks: { color: textMutedColor, font: { size: 11 } },
        stacked: stacked && (isBar || isArea),
        beginAtZero: isBar,
      },
      y1: {
        position: 'right',
        grid: { drawOnChartArea: false },
        ticks: { color: textMutedColor, font: { size: 11 } },
      },
    },
  };

  chartInstances[canvasId] = new Chart(ctx, {
    type: baseType,
    data: { labels, datasets },
    options,
  });
}