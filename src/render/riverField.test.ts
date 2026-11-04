import { describe, expect, it } from 'vitest';
import { flatMap } from '../core/planet';
import type { PathFeature, Vec2 } from '../model/types';
import { TerrainModel } from '../terrain/TerrainModel';
import { riverNet, riverShape } from '../model/rivers';
import { packOffset, packWidth, riverDistance, RiverField, slopeBits, slopeOf, unpackOffset, unpackWidth } from './riverField';

const river = (id: string, points: Vec2[], extra: Partial<PathFeature> = {}): PathFeature => ({
  id,
  kind: 'river',
  points,
  width: 3,
  color: '#4f86ad',
  style: 'solid',
  taper: true,
  name: '',
  hidden: false,
  locked: false,
  ...extra,
});

/** Land at 100 m with the sea west of x = 300. */
function coast() {
  const model = new TerrainModel({ ...flatMap(100, 100, 'standard'), seaLevel: 0 });
  for (let y = 0; y < 1024; y++) for (let x = 0; x < 1024; x++) model.height.ensureTile((x / 256) | 0, (y / 256) | 0)[(y % 256) * 256 + (x % 256)] = x < 300 ? -50 : 100;
  return model;
}

/** The river data of a cell (the nearest river's half width; 0 where no river is near). */
const at = (f: RiverField, x: number, y: number) => {
  const v = f.grid.get(x, y, 2);
  return v === 0 ? 0 : unpackWidth(v)[0];
};

describe('river field', () => {
  it('draws again only what changed', () => {
    const f = new RiverField(coast());
    const a = river('a', [
      [400, 200],
      [600, 200],
    ]);
    const b = river('b', [
      [400, 600],
      [600, 600],
    ]);
    expect(f.sync({ a, b })).not.toBeNull();
    expect(at(f, 500, 200)).not.toBe(0);
    expect(at(f, 500, 600)).not.toBe(0);
    // nothing changed: nothing drawn
    expect(f.sync({ a, b })).toBeNull();
    // a moved: only around a
    const a2 = { ...a, points: [[400, 260], [600, 260]] as Vec2[] };
    const r = f.sync({ a: a2, b })!;
    expect(r.y1).toBeLessThan(400);
    expect(at(f, 500, 200)).toBe(0);
    expect(at(f, 500, 260)).not.toBe(0);
    expect(at(f, 500, 600)).not.toBe(0);
    // a removed: nothing of it stays
    f.sync({ b });
    expect(at(f, 500, 260)).toBe(0);
  });

  it('opens a mouth only while it meets water', () => {
    const model = coast();
    const f = new RiverField(model);
    const r = river('r', [
      [600, 500],
      [301, 500],
    ], { outlet: { kind: 'water' } });
    f.sync({ r });
    const open = Math.abs(at(f, 303, 500));
    // the sea filled in: the same river's mouth no longer opens
    for (let y = 0; y < 1024; y++) for (let x = 0; x < 300; x++) model.height.ensureTile((x / 256) | 0, (y / 256) | 0)[(y % 256) * 256 + (x % 256)] = 100;
    expect(f.sync({ r })).not.toBeNull();
    expect(Math.abs(at(f, 303, 500))).toBeLessThan(open);
  });

  it('runs a thin tributary on into its river, without a gap at the join', () => {
    const f = new RiverField(coast());
    const main = river('main', [
      [400, 500],
      [500, 500],
      [600, 500],
    ], { width: 1.2, taper: false });
    // a tributary a tenth of a cell wide, joining from the north
    const trib = river('trib', [
      [500.3, 470],
      [499.6, 485],
      [500, 500],
    ], { width: 0.1, taper: false, outlet: { kind: 'path', id: 'main', t: 0.5 } });
    const paths = { main, trib };
    f.sync(paths);
    // along the tributary's line down to the main river's bank (at y = 499.4) it is water all the way
    const shape = riverShape(trib, paths, riverNet(paths), 0.05)!;
    let checked = 0;
    for (let k = 0; k < shape.hw.length; k++) {
      const [x, y] = [shape.pts[2 * k], shape.pts[2 * k + 1]];
      if (y < 490 || y > 499.4) continue;
      expect(riverDistance(f.grid, x, y)).toBeLessThan(0);
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
    // and it ends in the main river: nothing pokes out of its far bank
    for (let x = 499.6; x <= 500.4; x += 0.05) expect(riverDistance(f.grid, x, 500.75)).toBeGreaterThan(0);
    // the main river keeps its bank beside the join: no notch
    for (let x = 497; x <= 503; x += 0.25) expect(riverDistance(f.grid, x, 500.55)).toBeLessThan(0);
    for (let x = 497; x <= 503; x += 0.25) expect(riverDistance(f.grid, x, 500.7)).toBeGreaterThan(0);
  });

  it('follows a river thinner than a cell round a tight bend', () => {
    const f = new RiverField(coast());
    // a half circle of radius 2 cells, a river 0.1 cells wide
    const pts: Vec2[] = [];
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI + (i / 12) * Math.PI;
      pts.push([500 + 2 * Math.cos(a), 500 + 2 * Math.sin(a)]);
    }
    f.sync({ r: river('r', pts, { width: 0.1, taper: false }) });
    let worstIn = -Infinity;
    let worstOut = Infinity;
    for (let i = 1; i < 60; i++) {
      const a = Math.PI + (i / 60) * Math.PI;
      // on the river's line: water; a third of a cell beside it, either side: land
      worstIn = Math.max(worstIn, riverDistance(f.grid, 500 + 2 * Math.cos(a), 500 + 2 * Math.sin(a)));
      for (const dr of [-0.15, 0.15]) worstOut = Math.min(worstOut, riverDistance(f.grid, 500 + (2 + dr) * Math.cos(a), 500 + (2 + dr) * Math.sin(a)));
    }
    expect(worstIn).toBeLessThan(0);
    expect(worstOut).toBeGreaterThan(0);
  });

  it('draws winding rivers of any width where they are, and nowhere else', () => {
    // the true distance to a river's bank: to its centre line, less its half width there
    const trueDist = (shape: { pts: Float32Array; hw: Float32Array }, x: number, y: number) => {
      let best = Infinity;
      const n = shape.hw.length;
      for (let k = 1; k < n; k++) {
        const ax = shape.pts[2 * k - 2], ay = shape.pts[2 * k - 1], bx = shape.pts[2 * k], by = shape.pts[2 * k + 1];
        const dx = bx - ax, dy = by - ay;
        const f = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / Math.max(1e-12, dx * dx + dy * dy)));
        const h = shape.hw[k - 1] + f * (shape.hw[k] - shape.hw[k - 1]);
        best = Math.min(best, Math.hypot(x - ax - f * dx, y - ay - f * dy) - h);
      }
      return best;
    };
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const width of [0.1, 0.4, 1.5, 6]) {
      const f = new RiverField(coast());
      // a meandering river, about 12 cells of it, bends tighter for thin rivers as drawn close up
      const pts: Vec2[] = [];
      let a = 0;
      for (let i = 0; i <= 10; i++) {
        pts.push([500 + i * 1.6 * Math.max(1, width / 1.5), 500 + Math.sin(a) * 2.2 * Math.max(1, width / 1.5)]);
        a += 0.9 + rnd() * 0.6;
      }
      const r = river('r', pts, { width, taper: false });
      f.sync({ r });
      const shape = riverShape(r, { r }, riverNet({ r }), 0.02)!;
      // the band at the bank where water and land may differ: a little of the width, or a 25th of a cell
      const tol = Math.max(0.04, 0.06 * width);
      let wrong = 0;
      let checked = 0;
      const span = 20 * Math.max(1, width / 1.5);
      for (let i = 0; i < 6000; i++) {
        const x = 499 + rnd() * span;
        const y = 494 + rnd() * 12 * Math.max(1, width / 1.5);
        const t = trueDist(shape, x, y);
        if (Math.abs(t) < tol || t > 3) continue;
        checked++;
        if (Math.sign(riverDistance(f.grid, x, y)) !== Math.sign(t)) wrong++;
      }
      expect(checked).toBeGreaterThan(1000);
      expect(wrong / checked).toBeLessThan(0.002);
    }
  });

  it('ends a tributary joining at a slant inside its river', () => {
    const f = new RiverField(coast());
    const main = river('main', [
      [400, 500],
      [500, 500],
      [600, 500],
    ], { width: 0.6, taper: false });
    const trib = river('trib', [
      [490, 490],
      [495, 495],
      [500, 500],
    ], { width: 0.08, taper: false, outlet: { kind: 'path', id: 'main', t: 0.5 } });
    f.sync({ main, trib });
    // beyond the main river's far bank (y > 500.3), on the tributary's line carried on: land
    for (let s2 = 0.45; s2 <= 1.4; s2 += 0.05) expect(riverDistance(f.grid, 500 + s2, 500 + s2)).toBeGreaterThan(0);
  });

  it('packs widths, curvatures and offsets into numbers a float keeps exactly, and back', () => {
    for (const hw of [0.001, 0.05, 0.3, 1, 7.5, 60])
      for (const k of [-16, -4, -0.7, 0, 0.002, 1.3, 16]) {
        const v = packWidth(hw, k);
        expect(v).toBeGreaterThan(0);
        expect(Number.isInteger(v) && v < 2 ** 24).toBe(true);
        const [h, kk] = unpackWidth(Math.fround(v));
        expect(Math.abs(h / Math.max(hw, 1 / 1024) - 1)).toBeLessThan(0.003);
        expect(Math.abs(kk - k)).toBeLessThan(0.005);
      }
    for (const off of [-31.9, -2.3, -0.0004, 0, 0.71, 31.9])
      for (const r of [0, 0.03, 0.5, 0.999, 1])
        for (const bits of [0, 3, 7]) {
          const v = packOffset(off, r, bits);
          expect(Number.isInteger(v) && v >= 0 && v < 2 ** 24).toBe(true);
          const [o, rr, bb] = unpackOffset(Math.fround(v));
          expect(Math.abs(o - off)).toBeLessThanOrEqual(0.5 / 1024 + 1e-9);
          // a reach is kept rounded down (never further than it was)
          expect(rr).toBeLessThanOrEqual(r + 1e-9);
          expect(r - rr).toBeLessThan(1 / 31 + 1e-9);
          expect(bb).toBe(bits);
        }
    expect(slopeOf(slopeBits(0))).toBe(0);
    for (const rel of [-8, -2, -0.5, 0.01, 0.3, 2, 8]) expect(Math.abs(slopeOf(slopeBits(rel)) - rel)).toBeLessThanOrEqual(Math.max(0.004, 0.15 * Math.abs(rel)));
  });

});
