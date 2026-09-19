// =============================================================================
// Dashboard Render Engine — shared formatting helpers & SVG constants
// =============================================================================

import type { PanelRuntimeConfig } from './contract';

export const REFRESH_SVG =
  '<svg class="sw-refresh-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>';

export const ERROR_SVG =
  '<svg class="sw-error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';

export function escHtml(str: unknown): string {
  const el = document.createElement('div');
  el.textContent = String(str ?? '');
  return el.innerHTML;
}

export function fmtNumber(val: unknown, config?: PanelRuntimeConfig): string {
  if (val === null || val === undefined) return '—';
  const num = Number(val);
  if (isNaN(num)) return String(val);
  const currency = config && typeof config.currency === 'string' ? config.currency : null;
  if (currency) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: num >= 1000 ? 0 : 2,
    }).format(num);
  }
  if (Math.abs(num) >= 1e9) return (num / 1e9).toFixed(1) + 'B';
  if (Math.abs(num) >= 1e6) return (num / 1e6).toFixed(1) + 'M';
  if (Math.abs(num) >= 1e4) return (num / 1e3).toFixed(1) + 'K';
  return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function fmtDate(val: unknown): string {
  if (!val) return '—';
  const d = new Date(String(val));
  if (isNaN(d.getTime())) return String(val);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function fmtDateShort(val: unknown): string {
  if (!val) return '—';
  const d = new Date(String(val));
  if (isNaN(d.getTime())) return String(val);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export function isDateCol(colName: unknown): boolean {
  const n = String(colName || '').toLowerCase();
  return (
    n.includes('date') ||
    n.includes('month') ||
    n.includes('day') ||
    n.includes('week') ||
    n.includes('year') ||
    n.includes('time') ||
    n.includes('created') ||
    n.includes('period')
  );
}

export function isNumericVal(v: unknown): boolean {
  return v !== null && v !== undefined && v !== '' && !isNaN(Number(v));
}