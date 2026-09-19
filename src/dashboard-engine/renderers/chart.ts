// =============================================================================
// Dashboard Render Engine — line / bar / area chart renderer
// Chart.js is injected by the backend's composeHtml glue (chart.umd.min.js CDN).
// =============================================================================

import { fmtDate, isDateCol } from '../format';
import { chartInstances, COLOR_PALETTE } from '../chart-instances';
import { getThemeColor } from '../theme';
import type { PanelData, PanelRuntimeConfig } from '../contract';

declare const Chart: any;

export function renderChart(container: HTMLElement, data: PanelData | null, config: PanelRuntimeConfig, type: string): void {
  if (!data || !data.rows || data.rows.length === 0) {
    container.innerHTML = '<div class="sw-error-card"><div class="sw-error-title">No Data</div><div class="sw-error-message">This query returned no results.</div></div>';
    return;
  }

  const cols = data.columns || [];
  const xIdx = config.x_col ? cols.findIndex((c) => c.name === config.x_col) : 0;
  const yIdx = config.y_col ? cols.findIndex((c) => c.name === config.y_col) : cols.length > 1 ? 1 : 0;
  const xI = xIdx >= 0 ? xIdx : 0;
  const yI = yIdx >= 0 ? yIdx : cols.length > 1 ? 1 : 0;

  const labels = data.rows.map((r) => {
    const v = r[xI];
    return isDateCol(cols[xI]?.name) ? fmtDate(v) : String(v ?? '');
  });
  const values = data.rows.map((r) => Number(r[yI]) || 0);

  const color = config.color ? String(config.color) : COLOR_PALETTE[0];

  const canvasId = container.id + '-canvas';
  container.innerHTML = '<canvas id="' + canvasId + '"></canvas>';
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  if (!canvas) return;

  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const isArea = type === 'area';
  const isBar = type === 'bar';

  const gradient = ctx.createLinearGradient(0, 0, 0, 280);
  gradient.addColorStop(0, color + '40');
  gradient.addColorStop(1, color + '05');

  const textMutedColor = getThemeColor('--sw-text-muted', '#8b8ba0');
  const borderColor = getThemeColor('--sw-border', '#1e1e2a');
  const tooltipBg = getThemeColor('--sw-tooltip-bg', 'rgba(10, 10, 15, 0.95)');
  const tooltipTitle = getThemeColor('--sw-tooltip-title', '#ffffff');
  const tooltipText = getThemeColor('--sw-tooltip-text', '#e4e4ed');
  const tooltipBorder = getThemeColor('--sw-tooltip-border', 'rgba(255, 255, 255, 0.1)');

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
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
      },
      y: {
        grid: { color: 'rgba(128, 128, 128, 0.1)' },
        ticks: { color: textMutedColor, font: { size: 11 } },
      },
    },
  };

  const label = String(config.label || cols[yI]?.name || '');

  if (isArea) {
    chartInstances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label,
            data: values,
            borderColor: color,
            backgroundColor: gradient,
            fill: true,
            tension: 0.35,
            pointRadius: 2,
            pointHoverRadius: 4,
          },
        ],
      },
      options,
    });
  } else if (isBar) {
    chartInstances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label,
            data: values,
            backgroundColor: color + 'cc',
            borderColor: color,
            borderWidth: 1,
            borderRadius: 4,
            maxBarThickness: 32,
          },
        ],
      },
      options,
    });
  } else {
    chartInstances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label,
            data: values,
            borderColor: color,
            backgroundColor: 'transparent',
            pointRadius: 2,
            borderWidth: 2,
            tension: 0.3,
          },
        ],
      },
      options,
    });
  }
}