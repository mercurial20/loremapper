import { describe, expect, it } from 'vitest';
import { flatMap } from '../core/planet';
import { fillBasin, paintLake } from './lakes';
import { NO_WATER, TerrainModel } from './TerrainModel';

/** Land at 200 m with a round hollow 60 m deep, whose rim dips to a saddle at 180 m on the east. */
function hollow() {
  const model = new TerrainModel({ ...flatMap(100, 100, 'standard'), seaLevel: 0 });
  const g = model.height;
  const cx = 500;
  const cy = 500;
  for (let y = 380; y < 620; y++)
    for (let x = 380; x < 620; x++) {
      const r = Math.hypot(x - cx, y - cy);
      let h = 200 - 60 * Math.max(0, 1 - (r / 60) ** 2);
      // a notch in the rim to the east, down to 180 m, then falling away beyond it
      if (x > cx && Math.abs(y - cy) < 4 && r > 50) h = Math.min(h, 180 - Math.max(0, r - 62) * 2);
      g.ensureTile((x / 256) | 0, (y / 256) | 0)[(y % 256) * 256 + (x % 256)] = h;
    }
  return model;
}

describe('lakes', () => {
  it('fills a hollow up to where it would spill over its rim', () => {
    const model = hollow();
    const basin = fillBasin(model, 510, 495);
    expect('reason' in basin).toBe(false);
    if ('reason' in basin) return;
    expect(basin.level).toBeGreaterThan(178);
    expect(basin.level).toBeLessThanOrEqual(181);
    // every cell of the lake is under water
    for (const k of basin.cells) expect(model.height.get(k % model.W, (k / model.W) | 0)).toBeLessThan(basin.level);
  });

  it('fills the same hollow the same way however often it is clicked', async () => {
    const { setLake, touchingLakes } = await import('./lakes');
    const model = hollow();
    let count = 0;
    for (let i = 0; i < 6; i++) {
      const b = fillBasin(model, 510, 495);
      if ('reason' in b) throw new Error(b.reason);
      const j = touchingLakes(model, b.cells);
      setLake(model, [...b.cells, ...j.cells], Math.max(b.level, j.level));
      let n = 0;
      for (const t of model.lake.tiles.values()) for (const v of t) if (v !== NO_WATER) n++;
      if (i === 0) count = n;
      else expect(n).toBe(count);
    }
  });

  it('finds no lake on a slope', () => {
    const model = new TerrainModel({ ...flatMap(100, 100, 'standard'), seaLevel: 0 });
    for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) model.height.ensureTile((x / 256) | 0, (y / 256) | 0)[(y % 256) * 256 + (x % 256)] = 50 + x * 0.5;
    expect(fillBasin(model, 300, 300)).toEqual({ reason: 'drains' });
  });

  it('paints a lake whose bed is under the water and whose shore is above it', () => {
    const model = new TerrainModel({ ...flatMap(100, 100, 'standard'), seaLevel: 0 });
    for (let y = 300; y < 700; y++) for (let x = 300; x < 700; x++) model.height.ensureTile((x / 256) | 0, (y / 256) | 0)[(y % 256) * 256 + (x % 256)] = 100 + x * 0.05;
    const cells = new Set<number>();
    for (let y = 470; y < 530; y++) for (let x = 450; x < 550; x++) cells.add(y * model.W + x);
    paintLake(model, cells, 30);
    const level = model.lake.get(500, 500);
    expect(level).not.toBe(NO_WATER);
    // deep in the middle, under water at every cell of the shape's inside
    expect(level - model.height.get(500, 500)).toBeGreaterThan(20);
    for (let y = 475; y < 525; y++) for (let x = 455; x < 545; x++) expect(model.height.get(x, y)).toBeLessThan(level);
    // and a closed rim around it holds the water in (on the downhill side, as a low bank)
    for (let x = 448; x < 552; x++) {
      expect(model.height.get(x, 468)).toBeGreaterThan(level);
      expect(model.height.get(x, 531)).toBeGreaterThan(level);
    }
    for (let y = 468; y < 532; y++) {
      expect(model.height.get(448, y)).toBeGreaterThan(level);
      expect(model.height.get(551, y)).toBeGreaterThan(level);
    }
  });
});
