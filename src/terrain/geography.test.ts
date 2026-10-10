import { describe, expect, it } from 'vitest';
import { cellAreaKm2, makeGrid } from './gen/grid';
import { analyzeGeography } from './geography';

describe('geography', () => {
  const W = 256;
  const H = 128;
  const R = 7410;
  const h = new Float32Array(W * H).fill(-3000);
  const fill = (x0: number, x1: number, y0: number, y1: number, v: number) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) h[y * W + (((x % W) + W) % W)] = v;
  };
  fill(40, 120, 30, 90, 200); // big landmass
  fill(74, 76, 54, 56, -20); // a small lake inside it
  fill(250, 262, 60, 70, 900); // island across the antimeridian
  const g = analyzeGeography(h, W, H, { kind: 'planet', radiusKm: R }, 0);
  const grid = makeGrid(W, H, R, 1);
  const area = (x0: number, x1: number, y0: number, y1: number) => {
    let a = 0;
    for (let y = y0; y < y1; y++) a += cellAreaKm2(grid, y) * (x1 - x0);
    return a;
  };

  it('finds each landmass, joined across the antimeridian', () => {
    expect(g.land.length).toBe(2);
    expect(g.land[0].areaKm2).toBeCloseTo(area(40, 120, 30, 90) - area(74, 76, 54, 56), 3);
    expect(g.land[1].areaKm2).toBeCloseTo(area(250, 262, 60, 70), 3);
    expect(g.land[1].extreme).toBe(900);
    expect(g.land[1].x1 - g.land[1].x0).toBe(12);
  });

  it('tells the world ocean from a lake', () => {
    expect(g.water.length).toBe(2);
    expect(g.water[0].kind).toBe('ocean');
    expect(g.water[1].kind).toBe('lake');
    expect(g.water[1].areaKm2).toBeCloseTo(area(74, 76, 54, 56), 3);
  });

  it('labels every cell and measures the coast', () => {
    expect(g.labels[60 * W + 100]).toBe(0);
    expect(g.labels[65 * W + 2]).toBe(1);
    expect(g.labels[55 * W + 75]).toBe(-2);
    expect(g.labels[5 * W + 5]).toBe(-1);
    // the island's 12×10-cell outline, scaled from a staircase to a smooth coast
    const cell = (2 * Math.PI * R) / W;
    expect(g.land[1].coastKm).toBeGreaterThan(cell * 30 * 0.6);
    expect(g.land[1].coastKm).toBeLessThan(cell * 44);
  });

  it('outlines each region with closed shorelines', () => {
    const lake = g.water[1];
    expect(lake.outlines.length).toBeGreaterThan(0);
    for (const n of lake.outlines) {
      const o = g.outlines[n];
      expect(o.land).toBe(0);
      expect(o.water).toBe(1);
      for (let i = 0; i < o.pts.length; i += 2) {
        expect(o.pts[i]).toBeGreaterThanOrEqual(73);
        expect(o.pts[i]).toBeLessThanOrEqual(77);
      }
    }
    // the island crosses the seam, so its shoreline comes in pieces on both sides
    const xs = g.land[1].outlines.flatMap((n) => [...g.outlines[n].pts.filter((_, i) => i % 2 === 0)]);
    expect(Math.min(...xs)).toBeLessThan(10);
    expect(Math.max(...xs)).toBeGreaterThan(240);
  });

  it('measures flat maps with uniform cells and no wrapping', () => {
    const f = analyzeGeography(h, W, H, { kind: 'flat', cellKm: 2 }, 0);
    // without wrap, the island at the edges is two islands
    expect(f.land.length).toBe(3);
    expect(f.land[0].areaKm2).toBeCloseTo((80 * 60 - 4) * 4, 6);
    expect(f.mapKm2).toBe(W * H * 4);
    expect(f.water[0].kind).toBe('sea');
  });
});
