import { describe, expect, it } from 'vitest';
import { catmullRom } from './math';

describe('smooth lines through points', () => {
  it('passes through every point', () => {
    const pts: [number, number][] = [
      [0, 0],
      [10, 5],
      [20, -3],
      [35, 0],
    ];
    const c = catmullRom(pts, 8);
    for (const p of pts) expect(c.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-6)).toBe(true);
  });

  it('never loops back where points are unevenly spaced (a river with a join point added on it)', () => {
    // a river drawn with a few far-apart points and one added close to another where a tributary joins
    const pts: [number, number][] = [
      [700, 1300],
      [900, 1250],
      [1283.3, 962.5],
      [1300, 950],
      [1509.1, 688.6],
    ];
    const c = catmullRom(pts, 32);
    for (let i = 1; i < c.length; i++) expect(c[i][0]).toBeGreaterThanOrEqual(c[i - 1][0] - 1e-6);
  });

  it('closes a loop smoothly', () => {
    const sq: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    const c = catmullRom(sq, 8, true);
    expect(c.length).toBe(32);
    for (const [x, y] of c) {
      expect(x).toBeGreaterThan(-2);
      expect(x).toBeLessThan(12);
      expect(y).toBeGreaterThan(-2);
      expect(y).toBeLessThan(12);
    }
  });
});
