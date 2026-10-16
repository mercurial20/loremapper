import { describe, expect, it } from 'vitest';
import { flatMap } from '../core/planet';
import { riverSnapAt, snapRiver } from '../editor/riverSnap';
import { setLake } from '../terrain/lakes';
import { TerrainModel } from '../terrain/TerrainModel';
import { alongCurve, riverCurve, riverNet, widthAt } from './rivers';
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
  const main = river('main', [
    [100, 500],
    [300, 500],
    [500, 500],
  ], 4);
  const trib = river('trib', [
    [300, 300],
    [300, 400],
    [300, 498],
  ], 3, { kind: 'path', id: 'main', t: 0.5 });
  const paths = { main, trib };

  it('adds a tributary’s water to its river below the join, smoothly', () => {
    const net = riverNet(paths);
    expect(net.inflows.get('main')?.map((f) => f.id)).toEqual(['trib']);
    const len = 400;
    const above = widthAt(main, 0.49, net, len);
    const below = widthAt(main, 0.6, net, len);
    // well below the join: both rivers' discharge (w ∝ √Q)
    expect(widthAt(main, 1, net, len)).toBeCloseTo(Math.sqrt(4 * 4 + 3 * 3), 5);
    expect(below).toBeGreaterThan(above + 1);
    // no step at the join itself
    expect(widthAt(main, 0.5005, net, len) - widthAt(main, 0.4995, net, len)).toBeLessThan(0.05);
  });

  it('carries a tributary’s own tributaries down to the river it joins', () => {
    const small = river('small', [
      [200, 300],
      [298, 350],
    ], 2, { kind: 'path', id: 'trib', t: 0.3 });
    const net = riverNet({ main, trib, small });
    expect(net.mouthQ.get('trib')).toBeCloseTo(3 * 3 + 2 * 2, 5);
    expect(net.mouthQ.get('main')).toBeCloseTo(4 * 4 + 3 * 3 + 2 * 2, 5);
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
});
