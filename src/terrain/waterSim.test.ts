import { describe, expect, it } from 'vitest';
import { flatMap } from '../core/planet';
import { setLake } from './lakes';
import { TerrainModel } from './TerrainModel';
import { aridityAt, EVAPORATION, simulateSource } from './waterSim';

/** A model whose ground is `f(x, y)` over a 1024-cell square (the sea around it). */
function land(f: (x: number, y: number) => number) {
  const model = new TerrainModel({ ...flatMap(100, 100, 'standard'), seaLevel: 0 });
  for (let y = 0; y < 1024; y++) for (let x = 0; x < 1024; x++) model.height.ensureTile((x / 256) | 0, (y / 256) | 0)[(y % 256) * 256 + (x % 256)] = f(x, y);
  return model;
}

/** Land sloping down to the sea at x < 100, with a bowl 60 m deep around (600, 500). */
const bowl = (x: number, y: number) => {
  if (x < 100) return -50;
  const r = Math.hypot(x - 600, y - 500);
  const plain = (x - 100) * 0.3;
  return r < 60 ? Math.min(plain, plain - 60 * (1 - (r / 60) ** 2) + 0) : plain;
};

const params = (over: Partial<Parameters<typeof simulateSource>[1]> = {}) => ({ at: [900, 500] as [number, number], q: 50, aridity: 600, seepage: 0, carve: 5, ...over });

describe('water from a source', () => {
  it('runs downhill to the sea', () => {
    const model = land((x) => (x < 100 ? -50 : (x - 100) * 0.3));
    const r = simulateSource(model, params());
    expect(r.end).toBe('sea');
    expect(r.rivers.length).toBe(1);
    const pts = r.rivers[0].points;
    expect(pts[pts.length - 1][0]).toBeLessThan(101);
    for (let i = 1; i < pts.length; i++) expect(model.heightAt(pts[i][0], pts[i][1])).toBeLessThanOrEqual(model.heightAt(pts[i - 1][0], pts[i - 1][1]) + 1e-6);
  });

  it('fills a hollow with plenty of water and goes on from its spill point', () => {
    const model = land(bowl);
    const r = simulateSource(model, params({ q: 200 }));
    expect(r.lakes.length).toBe(1);
    expect(r.lakes[0].kind).toBe('open');
    expect(r.end).toBe('sea');
    expect(r.rivers.length).toBe(2);
    expect(r.rivers[1].fromLake).toBe(true);
    // the river out carries what the lake did not take
    expect(r.rivers[1].flow[0]).toBeLessThan(200);
    expect(r.rivers[1].flow[0]).toBeGreaterThan(150);
  });

  it('ends in a closed lake as wide as the climate lets it grow', () => {
    const model = land(bowl);
    // (cells here are 49 m: the whole hollow is about 19 km²)
    const aridity = 2000;
    const q = 0.5;
    const r = simulateSource(model, params({ q, aridity }));
    expect(r.end).toBe('closed-lake');
    const lake = r.lakes[0];
    expect(lake.kind).toBe('closed');
    // evaporation over the lake about balances the inflow
    const km2 = lake.cells.length * model.geo.cellAreaKm2(500);
    expect(km2 * aridity * EVAPORATION).toBeGreaterThan(q * 0.8);
    expect(km2 * aridity * EVAPORATION).toBeLessThan(q * 1.3);
  });

  it('crosses a dip shallower than the carving depth without a lake', () => {
    const model = land((x, y) => {
      if (x < 100) return -50;
      const r = Math.hypot(x - 600, y - 500);
      return (x - 100) * 0.3 - (r < 20 ? 3 * (1 - r / 20) : 0);
    });
    const r = simulateSource(model, params({ carve: 10 }));
    expect(r.lakes.length).toBe(0);
    expect(r.end).toBe('sea');
  });

  it('vanishes into marsh on flat ground in a dry climate, or crosses it with enough water', () => {
    // a long flat plain (5 cm a cell) before the sea
    const f = (x: number) => (x < 100 ? -50 : x < 800 ? 2 + (x - 100) * 0.0005 : 2.35 + (x - 800) * 2);
    const small = simulateSource(land(f), params({ q: 0.2, aridity: 2000 }));
    expect(small.end).toBe('marsh');
    expect(small.marshes.length).toBeGreaterThan(3);
    const big = simulateSource(land(f), params({ q: 3000, aridity: 2000 }));
    expect(big.end).toBe('sea');
    expect(big.marshes.length).toBeGreaterThan(3);
  });

  it('ends in a lake already on the map', () => {
    const model = land(bowl);
    const cells: number[] = [];
    for (let y = 480; y < 520; y++) for (let x = 700; x < 720; x++) cells.push(y * model.W + x);
    setLake(model, cells, 1e4);
    const r = simulateSource(model, params());
    expect(r.end).toBe('lake');
  });

  it('knows the dry belts from the wet tropics', () => {
    expect(aridityAt(25)).toBeGreaterThan(aridityAt(0) * 3);
    expect(aridityAt(-25)).toBe(aridityAt(25));
    expect(aridityAt(45)).toBeLessThan(aridityAt(25));
  });
});
