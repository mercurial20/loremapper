import { describe, expect, it } from 'vitest';
import { flatMap } from '../core/planet';
import { riverSnapAt, snapRiver } from '../editor/riverSnap';
import { setLake } from '../terrain/lakes';
import { TerrainModel } from '../terrain/TerrainModel';
import { alongCurve, ownWidth, riverCurve, riverNet, widthAt, widthForFlow } from './rivers';
import type { PathFeature, Vec2 } from './types';

const river = (id: string, points: Vec2[], width: number, outlet?: PathFeature['outlet']): PathFeature => ({
  id,
  kind: 'river',
  points,
  width,
  color: '#4f86ad',
  style: 'solid',
  taper: true,
  name: '',
  hidden: false,
  locked: false,
  ...(outlet ? { outlet } : {}),
});

/** Land rising from a sea in the west (x < 400), 0.5 m per cell. */
function coast() {
  const model = new TerrainModel({ ...flatMap(100, 100, 'standard'), seaLevel: 0 });
  for (let y = 0; y < 1024; y++) for (let x = 0; x < 1024; x++) model.height.ensureTile((x / 256) | 0, (y / 256) | 0)[(y % 256) * 256 + (x % 256)] = (x - 400) * 0.5;
  return model;
}

describe('river network', () => {
  const main = { ...river('main', [
    [100, 500],
    [300, 500],
    [500, 500],
  ], 4), widenBelowTributaries: true };
  const trib = river('trib', [
    [300, 300],
    [300, 400],
    [300, 498],
  ], 3, { kind: 'path', id: 'main', t: 0.5 });
  const paths = { main, trib };

  it('widens a river below a tributary’s join, smoothly, to the width it was set to at its mouth', () => {
    const net = riverNet(paths);
    expect(net.inflows.get('main')?.map((f) => f.id)).toEqual(['trib']);
    const len = 400;
    const above = widthAt(main, 0.49, net, len);
    const below = widthAt(main, 0.6, net, len);
    // at the mouth: the width the river was set to, its tributary's water included
    expect(widthAt(main, 1, net, len)).toBeCloseTo(4, 5);
    expect(below).toBeGreaterThan(above + 0.5);
    // no step at the join itself
    expect(widthAt(main, 0.5005, net, len) - widthAt(main, 0.4995, net, len)).toBeLessThan(0.05);
  });

  it('lets the width of a river with many tributaries be set, and keeps it no thinner than half above them', () => {
    const feeders: Record<string, PathFeature> = {};
    for (let i = 0; i < 6; i++)
      feeders['f' + i] = river('f' + i, [
        [120 + i * 60, 300],
        [120 + i * 60, 498],
      ], 3, { kind: 'path', id: 'main', t: 0.1 + i * 0.15 });
    for (const w of [2, 4, 12]) {
      const m = { ...main, width: w, taper: false, widenBelowTributaries: true };
      const net = riverNet({ main: m, ...feeders });
      expect(widthAt(m, 1, net, 400)).toBeCloseTo(w, 5);
      // above every join the river carries its own water: at least half its width
      const top = widthAt(m, 0.05, net, 400);
      expect(top).toBeGreaterThanOrEqual(w / 2 - 1e-9);
      expect(top).toBeLessThan(w);
      // and it only widens downstream
      let last = 0;
      for (let t = 0; t <= 1; t += 0.05) {
        const x = widthAt(m, t, net, 400);
        expect(x).toBeGreaterThanOrEqual(last - 1e-9);
        last = x;
      }
    }
  });

  it('keeps a river from a source as wide as the water it carries, tributaries added', () => {
    const src = { ...main, flow: [1, 5, 10], widenBelowTributaries: true };
    const tr = { ...trib, flow: [1, 2, 4] };
    const net = riverNet({ main: src, trib: tr });
    expect(widthAt(src, 1, net, 400)).toBeCloseTo(Math.sqrt(ownWidth(src, 1) ** 2 + ownWidth(tr, 1) ** 2), 5);
  });

  it('keeps a river as wide as it is set whatever joins it, unless set to widen', () => {
    const plain = { ...main, widenBelowTributaries: undefined, taper: false };
    const net = riverNet({ main: plain, trib });
    for (const t of [0, 0.3, 0.5, 0.7, 1]) expect(widthAt(plain, t, net, 400)).toBeCloseTo(4, 9);
    const src = { ...plain, flow: [1, 5, 10] };
    const tr = { ...trib, flow: [1, 2, 4] };
    const net2 = riverNet({ main: src, trib: tr });
    expect(widthAt(src, 1, net2, 400)).toBeCloseTo(ownWidth(src, 1), 9);
  });

  it('carries a tributary’s own tributaries down to the river it joins', () => {
    const small = river('small', [
      [200, 300],
      [298, 350],
    ], 2, { kind: 'path', id: 'trib', t: 0.3 });
    const net = riverNet({ main, trib, small });
    // drawn rivers reach their mouths as wide as they were set
    expect(net.mouthQ.get('trib')).toBeCloseTo(3 * 3, 5);
    expect(net.mouthQ.get('main')).toBeCloseTo(4 * 4, 5);
    expect(net.inflows.get('main')?.[0].q).toBeCloseTo(9, 5);
  });

  it('ignores a loop of rivers flowing into each other', () => {
    const a = river('a', [
      [0, 0],
      [10, 0],
    ], 2, { kind: 'path', id: 'b', t: 0.5 });
    const b = river('b', [
      [5, -5],
      [5, 5],
    ], 2, { kind: 'path', id: 'a', t: 0.5 });
    const net = riverNet({ a, b });
    expect(Number.isFinite(net.mouthQ.get('a'))).toBe(true);
  });
});

describe('river snapping', () => {
  it('pulls a mouth near the sea onto the shore', () => {
    const model = coast();
    const s = snapRiver(model, {}, [
      [600, 500],
      [500, 510],
      [408, 520],
    ], 16);
    expect(s.outlet).toEqual({ kind: 'water' });
    const end = s.points[s.points.length - 1];
    expect(Math.abs(end[0] - 400)).toBeLessThan(0.6);
  });

  it('turns around a river drawn from its mouth upstream, and cuts a course drawn on into the sea', () => {
    const model = coast();
    const s = snapRiver(model, {}, [
      [380, 500],
      [450, 500],
      [600, 520],
    ], 16);
    expect(s.outlet).toEqual({ kind: 'water' });
    expect(s.points[0]).toEqual([600, 520]);
    const end = s.points[s.points.length - 1];
    expect(end[0]).toBeGreaterThan(399);
    expect(end[0]).toBeLessThan(401);
  });

  it('ends a river at the shore of a lake', () => {
    const model = coast();
    // a lake at 160 m over a hollow around (700, 500)
    const cells: number[] = [];
    for (let y = 480; y < 520; y++)
      for (let x = 680; x < 720; x++) {
        model.height.ensureTile((x / 256) | 0, (y / 256) | 0)[(y % 256) * 256 + (x % 256)] = 120;
        cells.push(y * model.W + x);
      }
    setLake(model, cells, 160);
    const s = snapRiver(model, {}, [
      [700, 300],
      [700, 400],
      [700, 495],
    ], 16);
    expect(s.outlet).toEqual({ kind: 'water' });
    const end = s.points[s.points.length - 1];
    expect(end[1]).toBeGreaterThan(477);
    expect(end[1]).toBeLessThan(482);
  });

  it('makes a river ending near another river its tributary, joining along its flow', () => {
    const model = coast();
    const main = river('main', [
      [900, 300],
      [700, 400],
      [500, 450],
    ], 4);
    const at = riverSnapAt(model, { main }, [702, 392], 16);
    expect(at?.kind).toBe('path');
    const s = snapRiver(model, { main }, [
      [800, 150],
      [720, 300],
      [705, 390],
    ], 16);
    expect(s.outlet?.kind).toBe('path');
    if (s.outlet?.kind !== 'path') return;
    const { at: join, dir } = alongCurve(riverCurve(main.points), s.outlet.t);
    const end = s.points[s.points.length - 1];
    expect(Math.hypot(end[0] - join[0], end[1] - join[1])).toBeLessThan(1e-6);
    // drawn points close to the join are dropped, so the last stretch has no tight bend
    const prev = s.points[s.points.length - 2];
    expect(Math.hypot(end[0] - prev[0], end[1] - prev[1])).toBeGreaterThan(16);
    expect(dir[0]).toBeLessThan(0);
  });

  it('turns a river drawn on through a lake into one flowing in and one flowing out', () => {
    const model = coast();
    const cells: number[] = [];
    for (let y = 480; y < 520; y++)
      for (let x = 680; x < 720; x++) {
        model.height.ensureTile((x / 256) | 0, (y / 256) | 0)[(y % 256) * 256 + (x % 256)] = 120;
        cells.push(y * model.W + x);
      }
    setLake(model, cells, 160);
    const s = snapRiver(model, {}, [
      [700, 300],
      [700, 450],
      [700, 560],
      [690, 700],
    ], 8);
    expect(s.outlet).toEqual({ kind: 'water' });
    expect(s.points[s.points.length - 1][1]).toBeLessThan(482);
    expect(s.more?.length).toBe(1);
    const out = s.more![0];
    expect(out.points[0][1]).toBeGreaterThan(518);
    expect(out.points[out.points.length - 1]).toEqual([690, 700]);
  });
});

describe('rivers from a source', () => {
  it('are as wide as the water they carry', () => {
    const p = { ...river('s', [[0, 0], [10, 0], [20, 0]], widthForFlow(400, 1)), taper: false, flow: [25, 100, 400] };
    // widest where it carries the most, narrower upstream by Q^0.4
    expect(ownWidth(p, 1)).toBeCloseTo(p.width, 5);
    expect(ownWidth(p, 0.5)).toBeCloseTo(p.width * 0.25 ** 0.4, 5);
    expect(ownWidth(p, 0)).toBeLessThan(ownWidth(p, 0.5));
  });

  it('are drawn wider for more water, and never thinner than they are', () => {
    expect(widthForFlow(1000, 1)).toBeGreaterThan(widthForFlow(100, 1));
    // on a map of 10 m cells a river of 10,000 m³/s (about 450 m wide) is drawn as wide as it is
    expect(widthForFlow(10000, 0.01)).toBeCloseTo(45, 0);
  });
});

