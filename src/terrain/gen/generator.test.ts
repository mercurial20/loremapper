import { describe, expect, it } from 'vitest';
import { Simplex3 } from '../../core/noise3';
import { carveRivers, generate, type GenParams } from '../generator';
import { cellAreaKm2, components, makeGrid, sampleAt } from './grid';
import { drain, steadyState } from './hydrology';

const params = (o: Partial<GenParams>): GenParams => ({
  type: 'continents',
  seed: 4242,
  W: 512,
  H: 256,
  landFraction: 0.29,
  mountains: 0.75,
  roughness: 0.4,
  seaLevel: 0,
  maxElevation: 10000,
  minElevation: -11000,
  oceanFloor: -3800,
  region: null,
  biomes: true,
  rivers: 20,
  ...o,
});

/** Landmass areas as shares of all land, largest first. */
function landmasses(p: GenParams, height: Float32Array): number[] {
  const g = makeGrid(p.W, p.H, 7410, 1);
  const mask = new Uint8Array(height.length);
  for (let k = 0; k < mask.length; k++) mask[k] = height[k] > p.seaLevel ? 1 : 0;
  const c = components(g, mask);
  const total = c.area.reduce((a, b) => a + b, 0);
  return [...c.area].map((a) => a / total).sort((a, b) => b - a);
}

describe('noise and grids', () => {
  it('simplex noise stays within [-1, 1]', () => {
    const n = new Simplex3(1);
    for (let i = 0; i < 20000; i++) {
      const v = n.noise(Math.sin(i) * 7, Math.cos(i * 1.3) * 7, i * 0.01);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
    }
  });

  it('cell areas add up to the whole sphere', () => {
    const g = makeGrid(1024, 512, 7410, 4);
    let total = 0;
    for (let j = 0; j < g.h; j++) total += cellAreaKm2(g, j) * g.w;
    expect(total / (4 * Math.PI * 7410 * 7410)).toBeCloseTo(1, 6);
  });

  it('joins land across the antimeridian', () => {
    const g = makeGrid(64, 32, 7410, 1);
    const mask = new Uint8Array(64 * 32);
    for (let j = 10; j < 20; j++) mask[j * 64] = mask[j * 64 + 63] = 1;
    expect(components(g, mask).count).toBe(1);
  });
});

describe('world generator', () => {
  it('is deterministic: same version, settings and seed give the same world', () => {
    const a = generate(params({ realism: 'medium' }));
    const b = generate(params({ realism: 'medium' }));
    expect(a.height).toEqual(b.height);
    expect(a.biome).toEqual(b.biome);
    expect(a.rivers.length).toBe(b.rivers.length);
  });

  it('honours the world type', () => {
    const pangaea = landmasses(params({ type: 'pangaea' }), generate(params({ type: 'pangaea' })).height);
    expect(pangaea[0]).toBeGreaterThan(0.6);
    const conts = landmasses(params({}), generate(params({})).height);
    expect(conts.filter((a) => a > 0.05).length).toBeGreaterThanOrEqual(2);
    const ocean = params({ type: 'archipelago', landFraction: 0.08 });
    const isles = landmasses(ocean, generate(ocean).height);
    expect(isles[0]).toBeLessThan(0.2);
    expect(isles.length).toBeGreaterThan(20);
  });

  it('lets every river run downhill to the sea', () => {
    const p = params({ W: 1024, H: 512, realism: 'medium', rivers: 25 });
    const r = generate(p);
    const g = makeGrid(p.W, p.H, 7410, 1);
    expect(r.rivers.length).toBeGreaterThan(5);
    for (const river of r.rivers) {
      let prev = Infinity;
      for (const [x, y] of river.points) {
        const v = sampleAt(r.height, g, x, y);
        if (v <= p.seaLevel) break;
        expect(v).toBeLessThanOrEqual(prev + 5);
        prev = Math.min(prev, v);
      }
    }
  });

  it('cuts a shallow bed into a plain, not a trench', () => {
    const g = makeGrid(256, 128, 7410, 1);
    const h = new Float32Array(256 * 128).fill(180);
    for (let i = 0; i < 256 * 8; i++) h[i] = -100; // sea along the top edge
    const river = { points: Array.from({ length: 100 }, (_, k): [number, number] => [40 + k, 100 - k * 0.9]), widthKm: 10, widthCells: 0.6 };
    carveRivers(g, h, [river], (2 * Math.PI * 7410) / 256);
    const mid = sampleAt(h, g, 90, 55);
    expect(mid).toBeGreaterThan(150);
    expect(mid).toBeLessThan(180);
    expect(sampleAt(h, g, 90, 75)).toBe(180); // land away from the river is untouched
  });

  it('paints a biome on every land cell', () => {
    const p = params({});
    const r = generate(p);
    let bare = 0;
    let land = 0;
    for (let j = 0; j < r.biomeRegion.h; j++)
      for (let i = 0; i < r.biomeRegion.w; i++) {
        if (r.height[(j * 2 + 1) * p.W + i * 2 + 1] <= 0) continue;
        land++;
        let sum = 0;
        for (let c = 0; c < 8; c++) sum += r.biome![(j * r.biomeRegion.w + i) * 8 + c];
        if (sum < 100) bare++;
      }
    expect(bare / land).toBeLessThan(0.01);
  });

  it('generates flat maps on a rectangle, without wrapping, surrounded by water', () => {
    const p = params({ W: 768, H: 512, landFraction: 0.35, flat: { spanLonDeg: 90, climateLatDeg: 45, climateSpanDeg: 5 } });
    const r = generate(p);
    expect(r.height.length).toBe(768 * 512);
    let land = 0;
    for (const v of r.height) if (v > 0) land++;
    expect(land / r.height.length).toBeGreaterThan(0.3);
    expect(land / r.height.length).toBeLessThan(0.4);
    // the map's edges are sea, so nothing is cut off at the border
    let edgeLand = 0;
    for (let i = 0; i < 768; i++) edgeLand += (r.height[i] > 0 ? 1 : 0) + (r.height[511 * 768 + i] > 0 ? 1 : 0);
    expect(edgeLand).toBe(0);
    for (const rv of r.rivers) for (const [x] of rv.points) expect(x).toBeGreaterThanOrEqual(0);
  });
});

describe('relief from uplift and erosion', () => {
  // an island of land in the middle of a small regional grid, ringed by sea
  const g = makeGrid(64, 64, 6371, 1, { x0: 0, y0: 0, w: 64, h: 64 });
  const sea = new Float32Array(64 * 64);
  for (let j = 0; j < 64; j++) for (let i = 0; i < 64; i++) sea[j * 64 + i] = Math.hypot(i - 31.5, j - 31.5) < 24 ? 10 + Math.hypot(i - 31.5, j - 31.5) * -0.1 + 30 : -100;
  const solve = (U: number) => steadyState(g, sea, new Float32Array(64 * 64).fill(U), null, { theta: 0.45, maxSlope: 700, passes: 3 });

  it('rises steadily from the coast: every cell sits above the one it drains into', () => {
    const h = solve(100);
    const route = new Float32Array(64 * 64);
    for (let k = 0; k < route.length; k++) route[k] = sea[k] > 0 ? Math.max(1e-3, h[k]) : sea[k];
    const d = drain(g, route, false);
    let checked = 0;
    for (let n = 0; n < d.count; n++) {
      const k = d.order[n];
      const r = d.rcv[k];
      if (sea[k] <= 0 || r < 0 || sea[r] <= 0) continue;
      expect(h[k]).toBeGreaterThanOrEqual(h[r] - 1e-3);
      checked++;
    }
    expect(checked).toBeGreaterThan(1000);
    for (let k = 0; k < h.length; k++) if (sea[k] <= 0) expect(h[k]).toBe(0);
  });

  it('scales with uplift: twice the uplift, twice the relief', () => {
    const a = solve(50);
    const b = solve(100);
    const max = (f: Float32Array) => f.reduce((m, v) => Math.max(m, v), 0);
    expect(max(b) / max(a)).toBeCloseTo(2, 1);
  });

});

describe('built-in world sketches', () => {
  it('puts land where the sketch draws it and sea elsewhere', () => {
    const W = 512;
    const H = 512;
    const p = params({
      W,
      H,
      rivers: 0,
      flat: { spanLonDeg: 90, climateLatDeg: 40, climateSpanDeg: 10 },
      sketch: { land: [[[0.3, 0.3], [0.7, 0.3], [0.7, 0.7], [0.3, 0.7]]], ranges: [{ pts: [[0.4, 0.5], [0.6, 0.5]], width: 0.05, height: 1 }] },
    });
    const r = generate(p);
    let inLand = 0;
    let inside = 0;
    let outLand = 0;
    let outside = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const u = x / W;
        const v = y / H;
        const land = r.height[y * W + x] > 0;
        if (u > 0.38 && u < 0.62 && v > 0.38 && v < 0.62) {
          inside++;
          if (land) inLand++;
        } else if (u < 0.2 || u > 0.8 || v < 0.2 || v > 0.8) {
          outside++;
          if (land) outLand++;
        }
      }
    expect(inLand / inside).toBeGreaterThan(0.98);
    expect(outLand / outside).toBeLessThan(0.01);
    // the drawn range is the high ground
    const at = (u: number, v: number) => r.height[Math.floor(v * H) * W + Math.floor(u * W)];
    expect(Math.max(at(0.45, 0.5), at(0.5, 0.5), at(0.55, 0.5))).toBeGreaterThan(Math.max(at(0.35, 0.35), at(0.65, 0.65)));
  });
});
