import { riverNet, riverShape, type RiverNet, type RiverShape } from '../model/rivers';
import { waterNear } from '../terrain/lakes';
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

/** One river as drawn: what it depends on, its shape and the cells it reaches. */
interface Drawn {
  key: string;
  shape: RiverShape;
  box: CellRect;
}

const union = (a: CellRect | null, b: CellRect | null): CellRect | null =>
  !a ? b : !b ? a : { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
const meets = (a: CellRect, b: CellRect) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;

export class RiverField {
  readonly grid: TileGrid<Float32Array>;
  private model: TerrainModel;
  private drawn = new Map<string, Drawn>();

  constructor(model: TerrainModel) {
    this.model = model;
    this.grid = new TileGrid(model.W, model.H, model.TS, RIVER_CHANNELS, (n) => new Float32Array(n), 0, 1, model.height.wrap);
  }

  /**
   * Draw what changed: rivers edited, added or removed, rivers whose tributaries or main river
   * changed, and mouths that now meet water or no longer do (a lake filled or removed). Only the
   * cells those rivers reach are drawn again. Returns the area that changed, or null.
   */
  /** Whether a point lies on a river's water (or within half a cell of its bank). */
  covers(x: number, y: number): boolean {
    const g = this.grid;
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (cy < 0 || cy >= g.H) return false;
    const h = g.get(cx, cy, 2);
    if (h === 0) return false;
    const px = cx + 0.5 + g.get(cx, cy, 0);
    const py = cy + 0.5 + g.get(cx, cy, 1);
    return Math.hypot(x - px, y - py) <= Math.abs(h) + 0.5;
  }

  sync(paths: Record<string, PathFeature>): CellRect | null {
    const rivers = Object.values(paths).filter((p) => p.kind === 'river' && !p.hidden && p.points.length >= 2);
    const net = riverNet(paths);
    const next = new Map<string, Drawn>();
    let dirty: CellRect | null = null;
    for (const p of rivers) {
      const key = this.keyOf(p, paths, net);
      const old = this.drawn.get(p.id);
      if (old && old.key === key) {
        next.set(p.id, old);
        continue;
      }
      const shape = riverShape(p, paths, net, STEP, key.endsWith('|open'));
      if (!shape) continue;
      const d = { key, shape, box: boxOf(shape) };
      next.set(p.id, d);
      dirty = union(dirty, union(old?.box ?? null, d.box));
    }
    for (const [id, d] of this.drawn) if (!next.has(id)) dirty = union(dirty, d.box);
    this.drawn = next;
    if (!dirty) return null;
    this.clear(dirty);
    for (const d of next.values()) if (meets(d.box, dirty)) this.draw(d.shape, dirty);
    return dirty;
  }

  /** What a river's drawing depends on: itself, the tributaries joining it, the river it joins, whether its mouth meets water. */
  private keyOf(p: PathFeature, paths: Record<string, PathFeature>, net: RiverNet): string {
    const o = p.outlet;
    const from = (net.inflows.get(p.id) ?? []).map((f) => `${f.t.toFixed(5)}:${f.q.toFixed(4)}`).join(',');
    let into = '';
    if (o?.kind === 'path') {
      const main = paths[o.id];
      into = main ? `${idOf(main)}:${(net.inflows.get(main.id) ?? []).map((f) => f.q.toFixed(4)).join(',')}` : '-';
    }
    let mouth = '';
    if (o?.kind === 'water') {
      const end = p.points[p.points.length - 1];
      mouth = waterNear(this.model, end[0], end[1], 2) ? '|open' : '|shut';
    }
    return `${idOf(p)}|${from}|${into}${mouth}`;
  }

  /** Forget the rivers in a rect (the cells there are drawn again). */
  private clear(r: CellRect) {
    const g = this.grid;
    const { W } = this.model;
    const TS = g.TS;
    const C = RIVER_CHANNELS;
    for (let y = Math.max(0, r.y0); y <= Math.min(this.model.H - 1, r.y1); y++)
      for (let x = r.x0; x <= r.x1; x++) {
        let wx = x;
        if (g.wrap) wx = ((x % W) + W) % W;
        else if (x < 0 || x >= W) continue;
        const t = g.getTile((wx / TS) | 0, (y / TS) | 0);
        if (!t) continue;
        const o = ((y % TS) * TS + (wx % TS)) * C;
        t[o] = t[o + 1] = t[o + 2] = t[o + 3] = 0;
      }
    // tiles left empty are dropped, so the map stops drawing rivers there
    const keys = new Set<number>();
    for (let ty = Math.max(0, Math.floor(r.y0 / TS)); ty <= Math.min(g.NY - 1, Math.floor(r.y1 / TS)); ty++)
      for (let tx = Math.floor(r.x0 / TS); tx <= Math.floor(r.x1 / TS); tx++) keys.add(g.key(g.wrapTileX(tx), ty));
    for (const k of keys) {
      const t = g.tiles.get(k);
      if (!t) continue;
      let any = false;
      for (let i = 2; i < t.length; i += C)
        if (t[i] !== 0) {
          any = true;
          break;
        }
      if (!any) g.tiles.delete(k);
    }
  }

  /** Write a river's cells inside `clip`. */
  private draw(shape: RiverShape, clip: CellRect) {
    const g = this.grid;
    const { W, H } = this.model;
    const TS = g.TS;
    const C = RIVER_CHANNELS;
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
      const x0 = Math.max(clip.x0, Math.floor(qx - R));
      const x1 = Math.min(clip.x1, Math.floor(qx + R));
      const y0 = Math.max(clip.y0, 0, Math.floor(qy - R));
      const y1 = Math.min(clip.y1, H - 1, Math.floor(qy + R));
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
    }
  }
}

/** The cells a river's shape reaches. */
function boxOf(shape: RiverShape): CellRect {
  const { pts, hw } = shape;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let k = 0; k < hw.length; k++) {
    const r = hw[k] + REACH + 1;
    x0 = Math.min(x0, pts[2 * k] - r);
    x1 = Math.max(x1, pts[2 * k] + r);
    y0 = Math.min(y0, pts[2 * k + 1] - r);
    y1 = Math.max(y1, pts[2 * k + 1] + r);
  }
  return { x0: Math.floor(x0), y0: Math.floor(y0), x1: Math.ceil(x1), y1: Math.ceil(y1) };
}
