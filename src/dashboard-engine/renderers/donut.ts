// =============================================================================
// Dashboard Render Engine — donut / pie chart renderer
// Chart.js is injected by the backend's composeHtml glue (chart.umd.min.js CDN).
// =============================================================================

import { fmtNumber } from '../format';
import { chartInstances, COLOR_PALETTE } from '../chart-instances';
import { getThemeColor } from '../theme';
import type { PanelData, PanelRuntimeConfig } from '../contract';

declare const Chart: any;

function buildDonutColorArray(n: number): string[] {
  const arr: string[] = [];
  for (let i = 0; i < n; i++) arr.push(COLOR_PALETTE[i % COLOR_PALETTE.length]);
  return arr;
}

export function renderDonut(container: HTMLElement, data: PanelData | null, config: PanelRuntimeConfig): void {
  if (!data || !data.rows || data.rows.length === 0) {
    container.innerHTML = '<div class="sw-error-card"><div class="sw-error-title">No Data</div><div class="sw-error-message">This query returned no results.</div></div>';
    return;
  }

  const cols = data.columns || [];
  const labelIdx = config.label_col ? cols.findIndex((c) => c.name === config.label_col) : 0;
  const valueIdx = config.value_col ? cols.findIndex((c) => c.name === config.value_col) : cols.length > 1 ? 1 : 0;
  const labels = data.rows.map((r) => String(r[labelIdx >= 0 ? labelIdx : 0] ?? ''));
  const values = data.rows.map((r) => Number(r[valueIdx >= 0 ? valueIdx : 0]) || 0);
  const backgroundColors = buildDonutColorArray(values.length);

  const canvasId = container.id + '-canvas';
  container.innerHTML = '<canvas id="' + canvasId + '"></canvas>';
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
  }

  const isDonut = String(config.chart_type || 'donut') !== 'pie';
  const type = isDonut ? 'doughnut' : 'pie';

  const cardBgColor = getThemeColor('--sw-bg-card', '#111118');
  const textMutedColor = getThemeColor('--sw-text-muted', '#8b8ba0');
  const tooltipBg = getThemeColor('--sw-tooltip-bg', 'rgba(10, 10, 15, 0.95)');
  const tooltipTitle = getThemeColor('--sw-tooltip-title', '#ffffff');
  const tooltipText = getThemeColor('--sw-tooltip-text', '#e4e4ed');
  const tooltipBorder = getThemeColor('--sw-tooltip-border', 'rgba(255, 255, 255, 0.1)');

  chartInstances[canvasId] = new Chart(canvas, {
    type,
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: backgroundColors,
          borderColor: cardBgColor,
          borderWidth: 2,
          hoverOffset: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: isDonut ? '62%' : 0,
      layout: { padding: 8 },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: textMutedColor,
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            padding: 12,
            font: { size: 11 },
          },
        },
        tooltip: {
          backgroundColor: tooltipBg,
          titleColor: tooltipTitle,
          bodyColor: tooltipText,
          borderColor: tooltipBorder,
          borderWidth: 1,
          padding: 10,
          cornerRadius: 6,
          callbacks: {
            label: (context: { label?: string; parsed?: number }) => {
              const label = context.label || '';
              const value = context.parsed || 0;
              return ' ' + label + ': ' + fmtNumber(value, config);
            },
          },
        },
      },
    },
  });
}