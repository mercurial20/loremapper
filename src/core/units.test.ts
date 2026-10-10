import { describe, expect, it } from 'vitest';
import { Geo } from './geo';
import { defaultPlanet, flatMap, surfaceAreaKm2 } from './planet';
import { displayToKm, displayToM, formatArea, formatHeight, formatLength, KM_PER_MI, kmToDisplay, mToDisplay } from './units';

describe('display units', () => {
  it('formats lengths, areas and heights in both systems', () => {
    expect(formatLength(0.45, 'metric')).toBe('450 m');
    expect(formatLength(12345, 'metric')).toBe('12,345 km');
    expect(formatLength(KM_PER_MI * 3, 'imperial')).toBe('3.0 mi');
    expect(formatLength(0.1, 'imperial')).toBe('328 ft');
    expect(formatArea(510.1e6, 'metric')).toBe('510.1M km²');
    expect(formatArea(510.1e6, 'imperial')).toBe('197.0M mi²');
    expect(formatHeight(8848, 'metric')).toBe('8,848 m');
    expect(formatHeight(8848, 'imperial')).toBe('29,029 ft');
  });

  it('converts inputs both ways without drift', () => {
    let km = 6371;
    let m = 8848;
    for (let i = 0; i < 1000; i++) {
      km = displayToKm(kmToDisplay(km, 'imperial'), 'imperial');
      m = displayToM(mToDisplay(m, 'imperial'), 'imperial');
    }
    expect(km).toBeCloseTo(6371, 9);
    expect(m).toBeCloseTo(8848, 9);
  });
});

describe('flat maps', () => {
  it('snap to whole tiles with the long side exact', () => {
    const sq = flatMap(500, 500);
    expect([sq.gridWidth, sq.gridHeight, sq.cellKm]).toEqual([2048, 2048, 500 / 2048]);
    const wide = flatMap(400 * KM_PER_MI, 250 * KM_PER_MI);
    expect(wide.gridWidth * wide.cellKm!).toBeCloseTo(400 * KM_PER_MI, 6);
    expect(wide.gridHeight % 256).toBe(0);
    expect(surfaceAreaKm2(sq)).toBeCloseTo(250000, 6);
  });

  it('measure on the plane, with no wrapping or poles', () => {
    const g = new Geo(flatMap(500, 500));
    expect(g.flat).toBe(true);
    expect(g.wraps).toBe(false);
    expect(g.wrapX(-10)).toBe(-10);
    expect(g.deltaX(2040, 5)).toBe(-2035);
    expect(g.distanceKm(0, 0, 2048, 0)).toBeCloseTo(500, 9);
    expect(g.distanceKm(0, 0, 3, 4)).toBeCloseTo(5 * (500 / 2048), 9);
    expect(g.kmPerCellX(10)).toBe(g.kmPerCellX(2000));
    expect(g.cellAreaKm2(7) * 2048 * 2048).toBeCloseTo(250000, 6);
  });

  it('leave planets as they were', () => {
    const g = new Geo(defaultPlanet());
    expect(g.wraps).toBe(true);
    expect(g.wrapX(-1)).toBe(4095);
    expect(g.distanceKm(0, 1024, 2048, 1024)).toBeCloseTo(Math.PI * 6371, 6);
  });
});
