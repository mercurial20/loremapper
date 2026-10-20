import { describe, expect, it } from 'vitest';
import { makeGrid, mercatorPatch } from './grid';
import { regionalRelief } from './region';

/** A region `km` across on a `cells`-cell grid. */
function region(km: number, cells: number, seed: number) {
  const R = 6371;
  const proj = mercatorPatch(cells, cells, R, km / R);
  const g = makeGrid(cells, cells, R, 1, { x0: 0, y0: 0, w: cells, h: cells }, proj);
  return { g, r: regionalRelief(g, { seed, cellKm: km / cells, landFraction: 0.5, mountains: 0.6, roughness: 0.4, maxElevation: 8000, maxDepth: 4000 }) };
}

describe('regions at their true size', () => {
  it('give mountain belts the width of real ones, whatever the size of the map', () => {
    for (const [km, cells] of [
      [500, 256],
      [1500, 384],
    ] as const)
      for (const seed of [1, 2, 3]) {
        const { r } = region(km, cells, seed);
        for (const b of r.ranges) {
          // the Caucasus, the Alps, the Pyrenees: some 60 to 400 km across
          expect(b.widthKm).toBeGreaterThan(50);
          expect(b.widthKm).toBeLessThan(400);
          expect(b.heightM).toBeLessThanOrEqual(8000);
        }
      }
  }, 60_000);

  it('keep seas between nearby islands shallow, as shelves are', () => {
    const { g, r } = region(500, 256, 4);
    let deepest = 0;
    for (let k = 0; k < g.w * g.h; k++) if (!r.land[k]) deepest = Math.min(deepest, r.h[k]);
    // across 500 km of mostly shelf, no ocean abyss
    expect(deepest).toBeGreaterThan(-1500);
  });

  it('leave most land below the mountains: plains and hills', () => {
    let land = 0;
    let low = 0;
    for (const seed of [1, 2, 3, 4]) {
      const { g, r } = region(500, 256, seed);
      for (let k = 0; k < g.w * g.h; k++)
        if (r.land[k]) {
          land++;
          if (r.h[k] < 1000) low++;
        }
    }
    expect(low / land).toBeGreaterThan(0.5);
  }, 60_000);
});
