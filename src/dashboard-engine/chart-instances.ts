// =============================================================================
// Dashboard Render Engine — shared Chart.js instance registry
// Keep references to live charts so re-renders can destroy instead of stacking.
// =============================================================================

export const chartInstances: Record<string, any> = {};

export const COLOR_PALETTE = [
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#0284c7',
  '#f43f5e',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#14b8a6',
  '#f97316',
];