import type { PathFeature, Vec2 } from '../model/types';
import { isOpenWater, lakeAt } from '../terrain/lakes';
import { isLake, type TerrainModel } from '../terrain/TerrainModel';

/*
 * How the waters of the map connect, read off the map itself (not stored, so it never goes
 * stale): where a river ends, which rivers flow into a lake and which one leaves it.
 */

/** How close (cells) a river's end must be to water to flow into it. */
const NEAR = 2;

export type RiverEnd = { kind: 'sea' } | { kind: 'lake'; cell: number } | { kind: 'river'; id: string } | { kind: 'land' };

/** A cell of open water within NEAR cells of a point: -2 for the sea, a lake cell, or -1 for none. */
function waterBeside(model: TerrainModel, p: Vec2): number {
  const W = model.W;
  for (const r of [0, 0.75, 1.5, NEAR])
    for (let k = 0; k < (r ? 12 : 1); k++) {
      const a = (k / 12) * Math.PI * 2;
      const x = p[0] + Math.cos(a) * r;
      const y = p[1] + Math.sin(a) * r;
      if (!isOpenWater(model, x, y)) continue;
      const cx = Math.floor(model.geo.wrapX(x));
      const cy = Math.floor(y);
      return isLake(model.lake.get(cx, cy)) ? cy * W + cx : -2;
    }
  return -1;
}

/** Where a river ends: in the sea, a lake, another river, or on land. */
export function riverEnd(model: TerrainModel, paths: Record<string, PathFeature>, p: PathFeature): RiverEnd {
  const o = p.outlet;
  if (o?.kind === 'path' && paths[o.id]?.kind === 'river') return { kind: 'river', id: o.id };
  const w = waterBeside(model, p.points[p.points.length - 1]);
  if (w === -2) return { kind: 'sea' };
  if (w >= 0) return { kind: 'lake', cell: w };
  return { kind: 'land' };
}

export interface LakeLinks {
  /** Rivers flowing into the lake. */
  inflows: PathFeature[];
  /** Rivers flowing out of it (a river that starts at its shore). */
  outflows: PathFeature[];
  /** Open: water flows on out of it; closed: rivers end in it; still: neither. */
  kind: 'open' | 'closed' | 'still';
}

/** The rivers that flow into and out of a lake (its cells). */
export function lakeLinks(model: TerrainModel, paths: Record<string, PathFeature>, cells: number[]): LakeLinks {
  const W = model.W;
  const set = new Set(cells);
  const touches = (p: Vec2) => {
    const cx = Math.floor(model.geo.wrapX(p[0]));
    const cy = Math.floor(p[1]);
    for (let dy = -NEAR; dy <= NEAR; dy++)
      for (let dx = -NEAR; dx <= NEAR; dx++) {
        const x = (((cx + dx) % W) + W) % W;
        if (set.has((cy + dy) * W + x)) return true;
      }
    return false;
  };
  const inflows: PathFeature[] = [];
  const outflows: PathFeature[] = [];
  for (const p of Object.values(paths)) {
    if (p.kind !== 'river' || p.oxbow || p.points.length < 2) continue;
    if (p.outlet?.kind !== 'path' && touches(p.points[p.points.length - 1])) inflows.push(p);
    else if (touches(p.points[0])) outflows.push(p);
  }
  return { inflows, outflows, kind: outflows.length ? 'open' : inflows.length ? 'closed' : 'still' };
}

/** The lake a cell of it belongs to (its cells). */
export const lakeCells = (model: TerrainModel, cell: number) => lakeAt(model, cell % model.W, (cell / model.W) | 0);

/** Rivers that flow into a river, upstream first. */
export function tributaries(paths: Record<string, PathFeature>, id: string): PathFeature[] {
  return Object.values(paths)
    .filter((p) => p.kind === 'river' && p.outlet?.kind === 'path' && p.outlet.id === id)
    .sort((a, b) => (a.outlet as { t: number }).t - (b.outlet as { t: number }).t);
}
