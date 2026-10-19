import { describe, expect, it } from 'vitest';
import { flatMap } from '../core/planet';
import type { PathFeature, Vec2 } from '../model/types';
import { TerrainModel } from '../terrain/TerrainModel';
import { RiverField } from './riverField';

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

/** The river data of a cell (half width; 0 where no river is near). */
const at = (f: RiverField, x: number, y: number) => f.grid.get(x, y, 2);

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
});
