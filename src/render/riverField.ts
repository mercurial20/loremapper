import { riverNet, riverShape } from '../model/rivers';
import type { PathFeature } from '../model/types';
import type { CellRect, TerrainModel } from '../terrain/TerrainModel';
import { TileGrid } from '../terrain/TileGrid';

/*
 * Rivers drawn by the terrain shader, as the same water as the sea and lakes: where they meet,
 * the waters merge into one shape with one shore line, and the rivers take the map's water
 * colour, paper and grain.
 *
 * The shader needs to know, finer than the cells, how far each pixel is from the nearest river
 * and how wide that river is there. Each cell near a river holds the point of the river whose
 * bank is nearest to the cell (as an offset from the cell's middle), the river's direction there
 * and half its width; a pixel measures its distance across the river's line through that point,
 * from the few cells around it, and keeps the nearest bank. That is exact for straight reaches
 * and close on bends, at any zoom. A river's ends are rounded: past its source or its mouth a
 * pixel measures straight to the end point.
 */

/**
 * Channels: offset x, offset y (world cells, from the cell's middle); half width (negative at the
 * river's ends); the direction (radians) and how fast the half width changes along the river
 * (cells per cell), packed into one number.
 */
export const RIVER_CHANNELS = 4;

/** Pack a direction (−π … π) and a width slope (−2 … 2) into one float, exactly. */
export const packDirSlope = (ang: number, slope: number) =>
  Math.round((ang + Math.PI) * 1000) * 2048 + Math.round((Math.max(-2, Math.min(2, slope)) + 2) * 500);
/** How far from a river's bank cells keep its data, cells (the shader looks a cell or so around). */
const REACH = 2.5;
/** Sampling step along rivers, cells. */
const STEP = 0.25;

let nextId = 1;
const ids = new WeakMap<object, number>();
const idOf = (o: object) => {
  let n = ids.get(o);
  if (!n) ids.set(o, (n = nextId++));
  return n;
};

export class RiverField {
  readonly grid: TileGrid<Float32Array>;
  private model: TerrainModel;
  private key = '';
  /** The area holding river data now. */
  private area: CellRect | null = null;

  constructor(model: TerrainModel) {
    this.model = model;
    this.grid = new TileGrid(model.W, model.H, model.TS, RIVER_CHANNELS, (n) => new Float32Array(n), 0, 1, model.height.wrap);
  }

  /** Draw the rivers into the field again if they changed; the area that changed, or null. */
  sync(paths: Record<string, PathFeature>): CellRect | null {
    const rivers = Object.values(paths).filter((p) => p.kind === 'river' && !p.hidden && p.points.length >= 2);
    const key = rivers.map((p) => idOf(p)).join(',');
    if (key === this.key) return null;
    this.key = key;
    const old = this.area;
    this.grid.tiles.clear();
    this.area = rivers.length ? this.draw(rivers, paths) : null;
    if (!old) return this.area;
    if (!this.area) return old;
    return { x0: Math.min(old.x0, this.area.x0), y0: Math.min(old.y0, this.area.y0), x1: Math.max(old.x1, this.area.x1), y1: Math.max(old.y1, this.area.y1) };
  }

  private draw(rivers: PathFeature[], paths: Record<string, PathFeature>): CellRect | null {
    const g = this.grid;
    const { W, H } = this.model;
    const TS = g.TS;
    const C = RIVER_CHANNELS;
    const net = riverNet(paths);
    let area: CellRect | null = null;
    for (const p of rivers) {
      const shape = riverShape(p, paths, net, STEP);
      if (!shape) continue;
      const { pts, hw } = shape;
      const n = hw.length;
      for (let k = 0; k < n; k++) {
        const qx = pts[2 * k];
        const qy = pts[2 * k + 1];
        // the river's direction here; at its ends it points into the river, so the shader knows
        // which side the river is on and rounds the end off
        const a = pts[2 * Math.max(0, k - 1)];
        const b = pts[2 * Math.max(0, k - 1) + 1];
        const c = pts[2 * Math.min(n - 1, k + 1)];
        const d = pts[2 * Math.min(n - 1, k + 1) + 1];
        let ang = Math.atan2(d - b, c - a);
        const k0 = Math.max(0, k - 1);
        const k1 = Math.min(n - 1, k + 1);
        let slope = k1 > k0 ? (hw[k1] - hw[k0]) / Math.max(1e-6, Math.hypot(c - a, d - b)) : 0;
        const isEnd = k === 0 || k === n - 1;
        if (k === n - 1) {
          // at the mouth the direction points back into the river
          ang += ang > 0 ? -Math.PI : Math.PI;
          slope = -slope;
        }
        const h = hw[k];
        const R = h + REACH;
        const x0 = Math.floor(qx - R);
        const x1 = Math.floor(qx + R);
        const y0 = Math.max(0, Math.floor(qy - R));
        const y1 = Math.min(H - 1, Math.floor(qy + R));
        for (let y = y0; y <= y1; y++)
          for (let x = x0; x <= x1; x++) {
            const cx = x + 0.5;
            const cy = y + 0.5;
            const score = Math.hypot(qx - cx, qy - cy) - h;
            if (score > REACH) continue;
            let wx = x;
            if (g.wrap) wx = ((x % W) + W) % W;
            else if (x < 0 || x >= W) continue;
            const t = g.ensureTile((wx / TS) | 0, (y / TS) | 0);
            const o = ((y % TS) * TS + (wx % TS)) * C;
            // keep the river whose bank is nearest (inside a river counts as nearer still)
            if (t[o + 2] !== 0 && Math.hypot(t[o], t[o + 1]) - Math.abs(t[o + 2]) <= score) continue;
            t[o] = qx - cx;
            t[o + 1] = qy - cy;
            t[o + 2] = Math.max(h, 1e-3) * (isEnd ? -1 : 1);
            t[o + 3] = packDirSlope(ang, slope);
          }
        area = area
          ? { x0: Math.min(area.x0, x0), y0: Math.min(area.y0, y0), x1: Math.max(area.x1, x1), y1: Math.max(area.y1, y1) }
          : { x0, y0, x1, y1 };
      }
    }
    return area;
  }
}
