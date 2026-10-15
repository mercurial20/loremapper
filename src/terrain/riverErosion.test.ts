import { describe, expect, it } from 'vitest';
import { flatMap } from '../core/planet';
import { erodeRiver, waterIn } from './riverErosion';
import { TerrainModel, WATER_DETAIL } from './TerrainModel';

/** A flat map with a ridge of hills across a slope that falls to the sea in the east. */
function slopeWithRidge() {
  const model = new TerrainModel({ ...flatMap(100, 50, 'standard'), seaLevel: 0 });
  const g = model.height;
  const ground = (x: number, y: number) => {
    if (x >= 950) return -100;
    const ramp = (1000 * (950 - x)) / 850;
    const ridge = 450 * Math.exp(-(((x - 500) / 40) ** 2));
    const ripple = 30 * Math.sin(y / 9) * Math.sin(x / 13);
    return ramp + ridge + ripple;
  };
  for (let y = 380; y < 620; y++)
    for (let x = 60; x < 1000; x++) {
      const tx = (x / g.TS) | 0;
      const ty = (y / g.TS) | 0;
      g.ensureTile(tx, ty)[(y - ty * g.TS) * g.TS + (x - tx * g.TS)] = ground(x, y);
    }
  return model;
}

/** Paint a straight river along row y from x0 to x1 (terrain cells). */
function paintRiver(model: TerrainModel, y: number, x0: number, x1: number): [number, number][] {
  const w = model.water;
  const k = WATER_DETAIL;
  const cells: [number, number][] = [];
  for (let x = x0; x <= x1; x++) {
    cells.push([x, y]);
    for (let j = 1; j < 3; j++)
      for (let i = 0; i < k; i++) {
        const fx = x * k + i;
        const fy = y * k + j;
        const tx = (fx / w.TS) | 0;
        const ty = (fy / w.TS) | 0;
        w.ensureTile(tx, ty)[(fy - ty * w.TS) * w.TS + (fx - tx * w.TS)] = 255;
      }
  }
  return cells;
}

const snapshot = (model: TerrainModel) => {
  const out = new Float32Array(1000 * 240);
  for (let y = 380; y < 620; y++) for (let x = 0; x < 1000; x++) out[(y - 380) * 1000 + x] = model.height.get(x, y);
  return out;
};

describe('river erosion', () => {
  it('lets the river run downhill to the sea, cutting a gorge through the ridge', () => {
    const model = slopeWithRidge();
    const before = snapshot(model);
    const fresh = paintRiver(model, 500, 100, 960);
    expect(erodeRiver(model, { fresh, wet: (x, y) => waterIn(model, x, y) })).not.toBeNull();
    const after = snapshot(model);
    // the bed never rises downstream
    let prev = Infinity;
    for (let x = 100; x < 950; x++) {
      const b = model.height.get(x, 500);
      expect(b).toBeLessThanOrEqual(prev + 0.02);
      prev = b;
    }
    // the ridge is cut: where it crossed the river the bed is far below the hilltop
    expect(model.height.get(500, 500)).toBeLessThan(before[120 * 1000 + 500] - 300);
    // land is only ever lowered, and never into the sea
    for (let i = 0; i < after.length; i++) {
      expect(after[i]).toBeLessThanOrEqual(before[i] + 1e-3);
      if (before[i] >= 0) expect(after[i]).toBeGreaterThanOrEqual(0);
    }
  });

  it('opens a valley whose sides are no steeper than the hills around', () => {
    const model = slopeWithRidge();
    const before = snapshot(model);
    const fresh = paintRiver(model, 500, 100, 960);
    erodeRiver(model, { fresh, wet: (x, y) => waterIn(model, x, y) });
    const kmY = model.geo.kmPerCellY;
    // across the gorge, ground rises from the bed with the valley side
    const bed = model.height.get(500, 500);
    const side = model.height.get(500, 520);
    expect(side).toBeGreaterThan(bed);
    expect(side).toBeLessThan(before[140 * 1000 + 500]);
    const slope = (side - bed) / (20 * kmY);
    // the steepest the hillsides here are: the ridge's flank
    expect(slope).toBeLessThan(1.3 * (450 * 2 * Math.exp(-0.5) * (1 / Math.SQRT2)) / (40 * kmY) + 20);
    // far from the river nothing changes
    expect(model.height.get(500, 610)).toBeCloseTo(before[230 * 1000 + 500], 3);
  });

  it('changes nothing when run again on the same river', () => {
    const model = slopeWithRidge();
    const fresh = paintRiver(model, 500, 100, 960);
    const wet = (x: number, y: number) => waterIn(model, x, y);
    erodeRiver(model, { fresh, wet });
    const once = snapshot(model);
    erodeRiver(model, { fresh, wet });
    const twice = snapshot(model);
    let maxDiff = 0;
    for (let i = 0; i < once.length; i++) maxDiff = Math.max(maxDiff, Math.abs(once[i] - twice[i]));
    expect(maxDiff).toBeLessThan(0.05);
  });

  it('keeps a deep basin on the way as a lake', () => {
    const model = slopeWithRidge();
    const g = model.height;
    for (let y = 490; y < 510; y++) for (let x = 300; x < 320; x++) g.ensureTile(1, 1)[(y - 256) * 256 + (x - 256)] -= 500;
    const before = snapshot(model);
    const fresh = paintRiver(model, 500, 150, 960);
    erodeRiver(model, { fresh, wet: (x, y) => waterIn(model, x, y) });
    // the basin lies below the river's graded line, so it stays as it was
    expect(g.get(310, 500)).toBeCloseTo(before[120 * 1000 + 310], 3);
  });

  it('ends a river that stops inland at its lowest point, leaving that point as it is', () => {
    const model = slopeWithRidge();
    const before = snapshot(model);
    const fresh = paintRiver(model, 500, 150, 700);
    erodeRiver(model, { fresh, wet: (x, y) => waterIn(model, x, y) });
    let low = 150;
    for (let x = 150; x <= 700; x++) if (before[120 * 1000 + x] < before[120 * 1000 + low]) low = x;
    expect(model.height.get(low, 500)).toBeCloseTo(before[120 * 1000 + low], 3);
    // and the ridge on the way is still cut
    expect(model.height.get(500, 500)).toBeLessThan(before[120 * 1000 + 500] - 200);
  });
});
