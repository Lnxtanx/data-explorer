// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { projectLatLon, projectGeo } from '../renderers/geo';
import type { PanelData, PanelRuntimeConfig } from '../contract';

describe('Geo equirect projection (pure math)', () => {
  it('maps lon -180..180 to x 0..1', () => {
    expect(projectLatLon(0, -180).x).toBeCloseTo(0);
    expect(projectLatLon(0, 0).x).toBeCloseTo(0.5);
    expect(projectLatLon(0, 180).x).toBeCloseTo(1);
  });

  it('maps lat with y inverted (north at top)', () => {
    expect(projectLatLon(90, 0).y).toBeCloseTo(0);
    expect(projectLatLon(0, 0).y).toBeCloseTo(0.5);
    expect(projectLatLon(-90, 0).y).toBeCloseTo(1);
  });
});

describe('projectGeo — dots mode', () => {
  const data: PanelData = {
    columns: [{ name: 'city' }, { name: 'lat' }, { name: 'lon' }, { name: 'users' }],
    rows: [
      ['NYC', 40.7, -74, 500],
      ['London', 51.5, -0.1, 200],
      ['Sydney', -33.9, 151.2, 100],
    ],
  };
  const config: PanelRuntimeConfig = { lat_col: 'lat', lon_col: 'lon', value_col: 'users' };

  it('projects each row to x/y in 0..1 with the numeric value', () => {
    const proj = projectGeo(data, config);
    expect(proj).not.toBeNull();
    expect(proj!.mode).toBe('dots');
    expect(proj!.points).toHaveLength(3);
    for (const p of proj!.points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
      expect(p.v).toBeGreaterThan(0);
    }
    // NYC (lat 40.7, lon -74) is north of Sydney -> smaller y
    const nyc = proj!.points.find((p) => p.v === 500)!;
    const syd = proj!.points.find((p) => p.v === 100)!;
    expect(nyc.y).toBeLessThan(syd.y);
  });

  it('computes bounds over the projected points', () => {
    const proj = projectGeo(data, config)!;
    expect(proj.bounds.n).toBe(3);
    expect(proj.bounds.xMin).toBeGreaterThanOrEqual(0);
    expect(proj.bounds.yMax).toBeLessThanOrEqual(1);
  });

  it('auto-detects lat/lon columns without config keys', () => {
    const bare: PanelData = {
      columns: [{ name: 'latitude' }, { name: 'longitude' }, { name: 'v' }],
      rows: [[10, 20, 7]],
    };
    const proj = projectGeo(bare, {});
    expect(proj).not.toBeNull();
    expect(proj!.mode).toBe('dots');
  });

  it('returns null when no numeric lat/lon pair exists', () => {
    const noCoord = projectGeo({ columns: [{ name: 'a' }, { name: 'b' }], rows: [[1, 2]] }, {});
    expect(noCoord).toBeNull();
    expect(projectGeo(null, {})).toBeNull();
    expect(projectGeo({ columns: [], rows: [] }, {})).toBeNull();
  });
});

describe('projectGeo — regions mode', () => {
  const data: PanelData = {
    columns: [{ name: 'country' }, { name: 'sales' }],
    rows: [
      ['USA', 300],
      ['US', 200],
      ['Germany', 150],
      ['Nowhere', 999], // unknown region -> skipped
    ],
  };
  const config: PanelRuntimeConfig = { region_col: 'country', value_col: 'sales' };

  it('aggregates values by region and aliases USA -> US centroid', () => {
    const proj = projectGeo(data, config)!;
    expect(proj.mode).toBe('regions');
    expect(proj.regions).toHaveLength(2);
    const us = proj.regions.find((r) => r.region === 'USA')!;
    expect(us.v).toBe(500);
    const de = proj.regions.find((r) => r.region === 'Germany')!;
    expect(de.v).toBe(150);
  });

  it('sorts regions by value descending', () => {
    const proj = projectGeo(data, config)!;
    expect(proj.regions[0].v).toBe(500);
    expect(proj.regions[1].v).toBe(150);
  });

  it('returns null when no supported region matches the embedded table', () => {
    const weird: PanelData = {
      columns: [{ name: 'country' }, { name: 'v' }],
      rows: [['Atlantis', 10]],
    };
    expect(projectGeo(weird, { region_col: 'country' })).toBeNull();
  });
});