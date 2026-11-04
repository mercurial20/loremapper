import { describe, expect, it } from 'vitest';
import { flatMap } from '../core/planet';
import { nearestOnCurve, riverCurve, riverNet, riverShape } from '../model/rivers';
import type { PathFeature, Vec2 } from '../model/types';
import { TerrainModel } from '../terrain/TerrainModel';
import { riverDistance, RiverField } from './riverField';

/*
 * The rivers as drawn against their true shapes (each the union of discs along its centre line),
 * over random networks: winding rivers of any width, tributaries joining at any angle, close up.
 * Water where there is none, or land in a river, beyond a thin band at the banks, is a fault.
 */

const river = (id: string, points: Vec2[], width: number, outlet?: PathFeature['outlet']): PathFeature => ({
  id,
  kind: 'river',
  points,
  width,
  color: '#4f86ad',
  style: 'solid',
  taper: false,
  name: '',
  hidden: false,
  locked: false,
  ...(outlet ? { outlet } : {}),
});

export function land() {
  const model = new TerrainModel({ ...flatMap(100, 100, 'standard'), seaLevel: 0 });
  for (let y = 256; y < 768; y++) for (let x = 256; x < 768; x++) model.height.ensureTile((x / 256) | 0, (y / 256) | 0)[(y % 256) * 256 + (x % 256)] = 100;
  return model;
}

/** True distance to the nearest bank among shapes sampled finely (negative inside). */
export function trueDistance(shapes: { pts: Float32Array; hw: Float32Array }[], x: number, y: number): number {
  let best = Infinity;
  for (const s of shapes)
    for (let k = 1; k < s.hw.length; k++) {
      const ax = s.pts[2 * k - 2];
      const ay = s.pts[2 * k - 1];
      if (Math.abs(ax - x) > 4 || Math.abs(ay - y) > 4) continue;
      const dx = s.pts[2 * k] - ax;
      const dy = s.pts[2 * k + 1] - ay;
      const f = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / Math.max(1e-12, dx * dx + dy * dy)));
      const h = s.hw[k - 1] + f * (s.hw[k] - s.hw[k - 1]);
      best = Math.min(best, Math.hypot(x - ax - f * dx, y - ay - f * dy) - h);
    }
  return best;
}

export function network(seed: number) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const width = Math.exp(Math.log(0.04) + rnd() * Math.log(2 / 0.04));
  // a winding main river through (500, 500)
  const main: Vec2[] = [];
  let a = rnd() * Math.PI * 2;
  let x = 500 - Math.cos(a) * 8;
  let y = 500 - Math.sin(a) * 8;
  const step = 0.8 + rnd() * 2.5;
  for (let i = 0; i < 12; i++) {
    main.push([x, y]);
    a += (rnd() - 0.5) * 1.6;
    x += Math.cos(a) * step;
    y += Math.sin(a) * step;
  }
  const paths: Record<string, PathFeature> = { main: river('main', main, width) };
  const mc = riverCurve(main);
  // tributaries, as the river tool makes them: their last point moved onto the main river
  // (joins at least two cells apart along it: a cell keeps two rivers, see crowded joins below)
  const nt = 1 + Math.floor(rnd() * 3);
  const len0 = mc.reduce((a, q, i) => (i ? a + Math.hypot(q[0] - mc[i - 1][0], q[1] - mc[i - 1][1]) : 0), 0);
  const ts: number[] = [];
  for (let i = 0; i < nt; i++) {
    const t = 0.25 + rnd() * 0.5;
    if (ts.some((u) => Math.abs(u - t) * len0 < 2)) continue;
    ts.push(t);
    const n = nearestOnCurve(mc, mc[Math.floor(t * (mc.length - 1))]);
    const ang = rnd() * Math.PI * 2;
    const len = 2 + rnd() * 8;
    const pts: Vec2[] = [];
    const m = 3 + Math.floor(rnd() * 4);
    for (let k = 0; k < m; k++) {
      const f = 1 - k / (m - 1);
      pts.push([n.at[0] + Math.cos(ang) * len * f + (rnd() - 0.5) * len * 0.3 * f, n.at[1] + Math.sin(ang) * len * f + (rnd() - 0.5) * len * 0.3 * f]);
    }
    pts[pts.length - 1] = n.at;
    // (spikes sharper than a river is wide: see the test of them below)
    for (let k = pts.length - 2; k > 0; k--) if (Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]) < 0.6) pts.splice(k, 1);
    paths['t' + i] = river('t' + i, pts, width * (0.15 + rnd() * 0.7), { kind: 'path', id: 'main', t: n.t });
  }
  return { paths, rnd, width };
}

describe('rivers drawn close up', () => {
  it('draw no water outside rivers and no land inside them, over random networks', () => {
    let faults = 0;
    let checked = 0;
    const worst: string[] = [];
    const perSeed: string[] = [];
    const deep: string[] = [];
    for (let seed = 1; seed <= 40; seed++) {
      const { paths, rnd } = network(seed * 7919);
      const f = new RiverField(land());
      f.sync(paths);
      const net = riverNet(paths);
      const shapes = Object.values(paths).map((p) => riverShape(p, paths, net, 0.01)!);
      let bad = 0;
      for (let i = 0; i < 3000; i++) {
        // points near the rivers
        const sh = shapes[Math.floor(rnd() * shapes.length)];
        const k = Math.floor(rnd() * sh.hw.length);
        const r = sh.hw[k] + 0.6;
        const px = sh.pts[2 * k] + (rnd() * 2 - 1) * r;
        const py = sh.pts[2 * k + 1] + (rnd() * 2 - 1) * r;
        const t = trueDistance(shapes, px, py);
        const tol = Math.max(0.012, 0.12 * sh.hw[k]);
        if (Math.abs(t) < tol) continue;
        checked++;
        const d = riverDistance(f.grid, px, py);
        if (Math.sign(d) !== Math.sign(t)) {
          bad++;
          deep.push(`${(t / sh.hw[k]).toFixed(2)}hw/${t.toFixed(3)}/${d.toFixed(3)}@${seed * 7919}:${px.toFixed(3)},${py.toFixed(3)}`);
          if (worst.length < 5) worst.push(`seed ${seed * 7919}: (${px.toFixed(3)}, ${py.toFixed(3)}) true ${t.toFixed(4)} drawn ${d.toFixed(4)}`);
        }
      }
      faults += bad;
      if (bad) perSeed.push(`${seed * 7919}:${bad}`);
    }
    expect(checked).toBeGreaterThan(50000);
    expect(faults, deep.join(' ')).toBe(0);
  }, 120000);

  it('draw no water outside rivers where several join at one place', () => {
    let phantom = 0;
    for (let seed = 1; seed <= 20; seed++) {
      let st = seed * 104729;
      const rnd = () => ((st = (st * 16807) % 2147483647) / 2147483647);
      const w = 0.05 + rnd() * 0.5;
      const main = river('main', [
        [490, 500 + rnd()],
        [500, 500],
        [510, 500 + rnd()],
      ], w);
      const paths: Record<string, PathFeature> = { main };
      const mc = riverCurve(main.points);
      for (let i = 0; i < 4; i++) {
        const n = nearestOnCurve(mc, [500 + (rnd() - 0.5) * 0.6, 500]);
        const a = rnd() * Math.PI * 2;
        paths['t' + i] = river('t' + i, [[n.at[0] + Math.cos(a) * 5, n.at[1] + Math.sin(a) * 5], [n.at[0] + Math.cos(a) * 2, n.at[1] + Math.sin(a) * 2.5], n.at], w * (0.2 + rnd() * 0.6), { kind: 'path', id: 'main', t: n.t });
      }
      const f = new RiverField(land());
      f.sync(paths);
      const net = riverNet(paths);
      const shapes = Object.values(paths).map((p) => riverShape(p, paths, net, 0.01)!);
      for (let y = 497; y <= 503; y += 0.05)
        for (let x = 497; x <= 503; x += 0.05) {
          const t = trueDistance(shapes, x, y);
          if (t > Math.max(0.008, 0.1 * w) && riverDistance(f.grid, x, y) < 0) phantom++;
        }
    }
    expect(phantom).toBe(0);
  }, 120000);

  it('draw no water outside a river that doubles back sharper than it is wide', () => {
    let phantom = 0;
    for (const w of [0.05, 0.13, 0.4]) {
      const r = river('r', [
        [498, 503],
        [500, 500],
        [500.2, 499.9],
        [499.6, 498.8],
        [499.5, 496],
      ], w);
      const f = new RiverField(land());
      f.sync({ r });
      const shapes = [riverShape(r, { r }, riverNet({ r }), 0.01)!];
      for (let y = 495; y <= 504; y += 0.03)
        for (let x = 497; x <= 502; x += 0.03) if (trueDistance(shapes, x, y) > Math.max(0.012, 0.12 * w) && riverDistance(f.grid, x, y) < 0) phantom++;
    }
    expect(phantom).toBe(0);
  }, 120000);
});
