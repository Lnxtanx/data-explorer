// =============================================================================
// Dashboard Render Engine - lightweight geo map renderer (chart_type 'geo')
// NO GIS library. Drop-in equirectangular projection on a 2:1 canvas, two modes:
//   dots    - one dot per lat/lon row, sized/colored by value (dot_style)
//   regions - aggregate by region_col, centroid circles from a tiny embedded
//             country centroid table (no GeoJSON needed)
// Config: lat_col+lon_col OR region_col, value_col, mode ('dots'|'regions'),
//         projection ('equirect' default), dot_style ('scale'|'fixed').
// =============================================================================

import { escHtml, fmtNumber, isNumericVal } from '../format';
import { COLOR_PALETTE } from '../chart-instances';
import { getThemeColor } from '../theme';
import type { PanelData, PanelRuntimeConfig } from '../contract';

export interface GeoPoint {
  x: number; // 0..1 canvas space (lon -> x)
  y: number; // 0..1 canvas space, inverted (north at top)
  v: number;
  label?: string;
}

export interface GeoRegion {
  region: string;
  x: number;
  y: number;
  v: number;
}

export interface GeoBounds {
  n: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  lonMin: number;
  lonMax: number;
  latMin: number;
  latMax: number;
}

export interface GeoProjection {
  mode: 'dots' | 'regions';
  points: GeoPoint[];
  regions: GeoRegion[];
  bounds: GeoBounds;
}

/** Equirectangular for a 2:1 canvas. x = (lon+180)/360, y = (90-lat)/180. */
export function projectLatLon(lat: number, lon: number): { x: number; y: number } {
  return { x: (lon + 180) / 360, y: (90 - lat) / 180 };
}

// Compact country centroids [lat, lon]; lowercase keys. Kept tiny on purpose.
const REGION_CENTROIDS: Record<string, [number, number]> = {
  afghanistan: [33, 65], algeria: [28, 3], argentina: [-38, -64], australia: [-25, 134],
  austria: [47.5, 14.5], belarus: [53.5, 28], belgium: [50.5, 4.5], bolivia: [-17, -65],
  brazil: [-10, -52], bulgaria: [42.7, 25.5], canada: [56, -106], chile: [-35, -71],
  china: [35, 105], colombia: [4, -72], 'costa rica': [10, -84], croatia: [45.5, 16.5],
  cuba: [21.5, -79.5], 'czech republic': [49.8, 15.5], denmark: [56, 10],
  'dominican republic': [19, -71], ecuador: [-1.5, -78], egypt: [26, 30],
  finland: [64, 26], france: [46, 2.5], germany: [51, 10], ghana: [7.5, -1],
  greece: [39, 22], guatemala: [15.8, -90.5], hungary: [47.2, 19.5], iceland: [65, -18],
  india: [21, 78], indonesia: [-2, 118], iran: [32, 53], iraq: [33, 43.5],
  ireland: [53, -8], israel: [31, 34.8], italy: [42.8, 12.8], japan: [36, 138],
  kazakhstan: [48, 67], kenya: [0.5, 38], malaysia: [3.5, 101.5], morocco: [31.8, -7],
  myanmar: [21, 96], netherlands: [52.3, 5.5], 'new zealand': [-41, 172], nigeria: [9, 8],
  'north korea': [40, 127], norway: [62, 10], pakistan: [30, 69], panama: [8.5, -80],
  paraguay: [-23, -58], peru: [-9.5, -75], philippines: [12.5, 121.5], poland: [52, 19.5],
  portugal: [39.5, -8], romania: [45.9, 24.9], russia: [61, 80], 'saudi arabia': [24, 45],
  serbia: [44.2, 20.9], singapore: [1.35, 103.8], slovakia: [48.7, 19.5],
  'south africa': [-29, 24], 'south korea': [36, 128], spain: [40, -3.5],
  'sri lanka': [7, 81], sweden: [62, 15], switzerland: [46.8, 8.2], taiwan: [23.5, 121],
  thailand: [15.5, 101], turkey: [39, 35], ukraine: [49, 31.5],
  'united arab emirates': [24, 54], 'united kingdom': [54, -3], 'united states': [39.8, -98.6],
  vietnam: [16, 107],
};

const REGION_ALIASES: Record<string, string> = {
  us: 'united states',
  usa: 'united states',
  america: 'united states',
  'united states of america': 'united states',
  uk: 'united kingdom',
  britain: 'united kingdom',
  england: 'united kingdom',
  'great britain': 'united kingdom',
  'russian federation': 'russia',
  'russia federation': 'russia',
  czechia: 'czech republic',
  uae: 'united arab emirates',
};

function findCol(
  cols: Array<{ name: string }>,
  name: unknown,
  hints: string[],
  fallback: number
): number {
  if (typeof name === 'string' && name) {
    const exact = cols.findIndex((c) => c.name === name);
    if (exact >= 0) return exact;
  }
  const lc = cols.map((c) => c.name.toLowerCase());
  for (const hint of hints) {
    const i = lc.findIndex((c) => c.includes(hint));
    if (i >= 0) return i;
  }
  return fallback;
}

function numericBounds(items: Array<{ x: number; y: number }>): GeoBounds {
  if (items.length === 0) {
    return { n: 0, xMin: 0, xMax: 0, yMin: 0, yMax: 0, lonMin: -180, lonMax: 180, latMin: -90, latMax: 90 };
  }
  let xMin = 1, xMax = 0, yMin = 1, yMax = 0;
  for (const p of items) {
    xMin = Math.min(xMin, p.x);
    xMax = Math.max(xMax, p.x);
    yMin = Math.min(yMin, p.y);
    yMax = Math.max(yMax, p.y);
  }
  return {
    n: items.length,
    xMin, xMax, yMin, yMax,
    lonMin: xMin * 360 - 180, lonMax: xMax * 360 - 180,
    latMin: 90 - yMax * 180, latMax: 90 - yMin * 180,
  };
}

export function projectGeo(data: PanelData | null, config: PanelRuntimeConfig): GeoProjection | null {
  if (!data || !data.rows || !data.columns || data.rows.length === 0 || data.columns.length === 0) return null;
  const cols = data.columns;
  const hasRegion = typeof config.region_col === 'string' && config.region_col.length > 0;
  const mode: 'dots' | 'regions' = config.mode === 'regions' || hasRegion ? 'regions' : 'dots';

  let valueI = findCol(cols, config.value_col, [], -1);
  if (valueI < 0) {
    valueI = cols.findIndex((_, i) => data.rows.some((r) => isNumericVal(r[i])));
  }

  if (mode === 'regions') {
    const regionI = findCol(cols, config.region_col, ['country', 'region', 'state', 'nation'], 0);
    const sums = new Map<string, number>();
    const display = new Map<string, string>();
    for (const r of data.rows) {
      const raw = String(r[regionI] ?? '').trim();
      if (!raw) continue;
      const key = (REGION_ALIASES[raw.toLowerCase()] || raw.toLowerCase()).trim();
      if (!REGION_CENTROIDS[key]) continue;
      const v = valueI >= 0 ? Number(r[valueI]) : 1;
      sums.set(key, (sums.get(key) || 0) + (isNumericVal(v) ? v : 1));
      if (!display.has(key)) display.set(key, raw);
    }
    const regions: GeoRegion[] = [];
    for (const [key, v] of sums) {
      const c = REGION_CENTROIDS[key];
      const { x, y } = projectLatLon(c[0], c[1]);
      regions.push({ region: display.get(key) || key, x, y, v });
    }
    if (regions.length === 0) return null;
    regions.sort((a, b) => b.v - a.v);
    return { mode, points: [], regions, bounds: numericBounds(regions) };
  }

  const latI = findCol(cols, config.lat_col, ['latitude', 'lat'], -1);
  const lonI = findCol(cols, config.lon_col, ['longitude', 'lon', 'lng', 'long'], -1);
  if (latI < 0 || lonI < 0 || latI === lonI) return null;

  const points: GeoPoint[] = [];
  for (const r of data.rows) {
    const lat = Number(r[latI]);
    const lon = Number(r[lonI]);
    if (!isNumericVal(lat) || !isNumericVal(lon)) continue;
    const v = valueI >= 0 ? Number(r[valueI]) : 1;
    const { x, y } = projectLatLon(lat, lon);
    points.push({ x, y, v: isNumericVal(v) ? v : 1 });
  }
  if (points.length === 0) return null;
  return { mode, points, regions: [], bounds: numericBounds(points) };
}

function buildLegend(proj: GeoProjection, config: PanelRuntimeConfig): string {
  const items = proj.regions
    .slice(0, 8)
    .map((r, i) => {
      const color = COLOR_PALETTE[i % COLOR_PALETTE.length];
      return (
        '<li class="sw-geo-legend-item">' +
        '<span class="sw-geo-swatch" style="background:' + color + '"></span>' +
        '<span class="sw-geo-region">' + escHtml(r.region) + '</span>' +
        '<span class="sw-geo-value">' + fmtNumber(r.v, config) + '</span>' +
        '</li>'
      );
    })
    .join('');
  return '<ul class="sw-geo-legend">' + items + '</ul>';
}

function drawGraticule(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.strokeStyle = 'rgba(128, 128, 140, 0.10)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let gx = 0; gx <= 1; gx += 1 / 6) {
    ctx.moveTo(gx * w, 0);
    ctx.lineTo(gx * w, h);
  }
  for (let gy = 0; gy <= 1; gy += 0.25) {
    ctx.moveTo(0, gy * h);
    ctx.lineTo(w, gy * h);
  }
  ctx.stroke();
}

function drawGeo(
  canvas: HTMLCanvasElement,
  proj: GeoProjection,
  config: PanelRuntimeConfig,
  w: number,
  h: number
): void {
  if (!canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawGraticule(ctx, w, h);

  const primary = getThemeColor('--sw-primary', '#6366f1');

  if (proj.mode === 'regions') {
    const maxV = Math.max.apply(null, proj.regions.map((r) => r.v));
    proj.regions.forEach((r, i) => {
      const color = COLOR_PALETTE[i % COLOR_PALETTE.length];
      const radius = 3 + 20 * (maxV > 0 ? Math.sqrt(r.v / maxV) : 0);
      const px = r.x * w;
      const py = r.y * h;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fillStyle = color + 'AA';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = color;
      ctx.stroke();
    });
    return;
  }

  const scaleDots = String(config.dot_style || 'scale') !== 'fixed';
  const maxV = scaleDots ? Math.max.apply(null, proj.points.map((p) => p.v)) : 0;
  proj.points.forEach((p) => {
    const radius = scaleDots ? 2 + 6 * (maxV > 0 ? Math.sqrt(p.v / maxV) : 0) : 2.6;
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, radius, 0, Math.PI * 2);
    ctx.fillStyle = primary + 'CC';
    ctx.fill();
  });
}

export function renderGeo(container: HTMLElement, data: PanelData | null, config: PanelRuntimeConfig): void {
  const proj = projectGeo(data, config);
  if (!proj) {
    container.innerHTML =
      '<div class="sw-error-card"><div class="sw-error-title">No Data</div>' +
      '<div class="sw-error-message">Geo requires rows with lat/lon columns (dots) ' +
      'or a supported country/region column (regions).</div></div>';
    return;
  }

  const id = (container.id || 'geo').replace(/[^a-zA-Z0-9_-]/g, '') + '-geo';
  const legend = proj.mode === 'regions' ? buildLegend(proj, config) : '';
  container.innerHTML =
    '<div class="sw-geo-wrap"><canvas id="' + id + '" class="sw-geo-canvas" aria-label="Geo map"></canvas>' +
    legend + '</div>';

  const canvas = document.getElementById(id) as HTMLCanvasElement | null;
  if (!canvas) return;

  const draw = (): void => {
    const w = Math.max(180, canvas.clientWidth || 320);
    drawGeo(canvas, proj, config, w, w / 2);
  };
  draw();

  if (container.dataset.swGeoBound !== 'true') {
    container.dataset.swGeoBound = 'true';
    let raf = 0;
    window.addEventListener(
      'resize',
      () => {
        if (raf) cancelAnimationFrame(raf);
        raf = window.requestAnimationFrame ? requestAnimationFrame(() => { raf = 0; draw(); }) : 0;
      },
      { passive: true }
    );
  }
}