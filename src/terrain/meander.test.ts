import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../model/types';
import { meander, oxbowsFrom, sinuosity } from './meander';

/** A straight course 300 cells long. */
const straight = (): Vec2[] => Array.from({ length: 301 }, (_, i) => [i, 0] as Vec2);
const free = (s: number) => Math.min(1, s / 10, (300 - s) / 10);

describe('meanders', () => {
  it('wind a river on a flat floodplain about as much as lowland rivers wind', () => {
    for (const seed of [1, 2, 3]) {
      const r = meander({ points: straight(), width: () => 1, mobility: free, allowed: () => true, seed });
      expect(sinuosity(r.points)).toBeGreaterThan(1.5);
      expect(sinuosity(r.points)).toBeLessThan(2.6);
    }
  });

  it('leave a river that is held where it is', () => {
    const r = meander({ points: straight(), width: () => 1, mobility: () => 0, allowed: () => true, seed: 1 });
    expect(sinuosity(r.points)).toBeCloseTo(1, 5);
  });

  it('wind a river less where it is less free (a steeper reach)', () => {
    const r = meander({ points: straight(), width: () => 1, mobility: (s) => 0.4 * free(s), allowed: () => true, seed: 1 });
    expect(sinuosity(r.points)).toBeGreaterThan(1.05);
    expect(sinuosity(r.points)).toBeLessThan(1.5);
  });

  it('keep a river on its floodplain and its ends in place', () => {
    const r = meander({ points: straight(), width: () => 1, mobility: free, allowed: (_x, y) => Math.abs(y) < 4, seed: 2 });
    for (const [, y] of r.points) expect(Math.abs(y)).toBeLessThan(4);
    expect(r.points[0]).toEqual([0, 0]);
    expect(r.points[r.points.length - 1]).toEqual([300, 0]);
    // and how far along its first course each point was runs from end to end
    expect(r.along[0]).toBe(0);
    expect(r.along[r.along.length - 1]).toBeCloseTo(300, 5);
  });

  it('make wide rivers wind in wide loops', () => {
    const turns = (pts: Vec2[]) => {
      let n = 0;
      for (let i = 2; i < pts.length; i++) {
        const a = Math.sign(pts[i][1] - pts[i - 1][1]);
        const b = Math.sign(pts[i - 1][1] - pts[i - 2][1]);
        if (a && b && a !== b) n++;
      }
      return n;
    };
    const narrow = meander({ points: straight(), width: () => 1, mobility: free, allowed: () => true, seed: 4 });
    const wide = meander({ points: straight(), width: () => 3, mobility: free, allowed: () => true, seed: 4 });
    expect(turns(wide.points)).toBeLessThan(turns(narrow.points));
  });

  it('leave oxbow lakes beside the river, clear of it', () => {
    let found = 0;
    for (const seed of [1, 2, 3, 4]) {
      const now = meander({ points: straight(), width: () => 1, mobility: free, allowed: () => true, seed });
      const former = meander({ points: straight(), width: () => 1, mobility: free, allowed: () => true, seed: seed + 100, sinuosity: 2.8 });
      for (const o of oxbowsFrom(former, now.points, () => 1)) {
        found++;
        for (const p of o.points) for (const q of now.points) expect(Math.hypot(p[0] - q[0], p[1] - q[1])).toBeGreaterThan(1.2);
      }
    }
    expect(found).toBeGreaterThan(0);
  });
});
