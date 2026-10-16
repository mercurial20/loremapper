import type { RasterArray } from './TileGrid';
import { isLake, NO_WATER, type TerrainModel, type TileChange } from './TerrainModel';

/*
 * Lakes: water with a level of its own. A lake fills a hollow up to the lowest point
 * of its rim, where it would spill over, so its surface is flat. The lake layer holds
 * the level on the cells under water; the map draws the shore where the smoothed ground
 * meets that level, so it follows the land's curves and not the cells.
 */

/** Lakes larger than this many cells are refused (the water is running off to the sea). */
const MAX_CELLS = 3_000_000;

/** Binary min-heap of cell keys by height. */
class Heap {
  private k: number[] = [];
  private v: number[] = [];
  get size() {
    return this.k.length;
  }
  /** The lowest value in the heap. */
  top(): number {
    return this.v[0];
  }
  push(key: number, val: number) {
    const k = this.k;
    const v = this.v;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (v[p] <= val) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  pop(): number {
    const k = this.k;
    const v = this.v;
    const top = k[0];
    const lk = k.pop()!;
    const lv = v.pop()!;
    const n = k.length;
    if (n) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && v[c + 1] < v[c]) c++;
        if (v[c] >= lv) break;
        k[i] = k[c];
        v[i] = v[c];
        i = c;
      }
      k[i] = lk;
      v[i] = lv;
    }
    return top;
  }
}

function neighbours(model: TerrainModel, key: number, out: number[]) {
  const W = model.W;
  const H = model.H;
  const x = key % W;
  const y = (key / W) | 0;
  out.length = 0;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const ny = y + dy;
      if (ny < 0 || ny >= H) continue;
      let nx = x + dx;
      if (nx < 0 || nx >= W) {
        if (!model.height.wrap) continue;
        nx = (nx + W) % W;
      }
      out.push(ny * W + nx);
    }
}

const isEdge = (model: TerrainModel, key: number) => {
  const x = key % model.W;
  const y = (key / model.W) | 0;
  return y === 0 || y === model.H - 1 || (!model.height.wrap && (x === 0 || x === model.W - 1));
};

export type BasinResult = { cells: number[]; level: number } | { reason: 'drains' | 'too-big' };

/** Half the size of the window searched for a hollow's outlet, cells. */
const BASIN_REACH = 512;

/**
 * The lake that would fill the hollow at (x, y). Water comes in from the outlets (the sea and
 * the edges of a window around the click) and rises over the land, lowest first: every hollow
 * then holds water up to the lowest way out of it (depression filling, as in hydrology). The lake
 * is the hollow's cells under that level, so its shore is always land. None when the water at
 * (x, y) runs off instead.
 */
export function fillBasin(model: TerrainModel, x: number, y: number): BasinResult {
  const W = model.W;
  const H = model.H;
  const hg = model.height;
  const sea = model.seaLevel;
  const px = ((Math.floor(x) % W) + W) % W;
  const py = Math.floor(y);
  // the window, in unwrapped columns around the click
  const wx0 = model.height.wrap ? px - BASIN_REACH : Math.max(0, px - BASIN_REACH);
  const wx1 = model.height.wrap ? px + BASIN_REACH : Math.min(W - 1, px + BASIN_REACH);
  const wy0 = Math.max(0, py - BASIN_REACH);
  const wy1 = Math.min(H - 1, py + BASIN_REACH);
  const ww = Math.min(W, wx1 - wx0 + 1);
  const wh = wy1 - wy0 + 1;
  const col = (i: number) => (((wx0 + i) % W) + W) % W;
  const h = (i: number, j: number) => hg.get(col(i), wy0 + j);
  const filled = new Float32Array(ww * wh);
  const done = new Uint8Array(ww * wh);
  const heap = new Heap();
  // outlets: the window's edge (unless it is the map's own edge that wraps) and the sea
  for (let j = 0; j < wh; j++)
    for (let i = 0; i < ww; i++) {
      const v = h(i, j);
      const rim = i === 0 || j === 0 || i === ww - 1 || j === wh - 1;
      if (rim || v < sea) {
        const o = j * ww + i;
        done[o] = 1;
        filled[o] = v;
        heap.push(o, v);
      }
    }
  while (heap.size) {
    const o = heap.pop();
    const i = o % ww;
    const j = (o / ww) | 0;
    const f = filled[o];
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= ww || nj >= wh) continue;
        const n = nj * ww + ni;
        if (done[n]) continue;
        done[n] = 1;
        const v = h(ni, nj);
        filled[n] = Math.max(v, f);
        heap.push(n, filled[n]);
      }
  }
  // the hollow under the click: its cells where the water stands above the ground
  const ci = Math.min(ww - 1, Math.max(0, px - wx0 < 0 ? px - wx0 + W : px - wx0));
  const cj = py - wy0;
  let start = cj * ww + ci;
  const wet = (o: number) => filled[o] > h(o % ww, (o / ww) | 0) + 1e-3;
  if (!wet(start)) {
    // clicked just beside the water: take the wettest neighbour
    let best = -1;
    for (let dj = -2; dj <= 2; dj++)
      for (let di = -2; di <= 2; di++) {
        const ni = ci + di;
        const nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= ww || nj >= wh) continue;
        const n = nj * ww + ni;
        if (wet(n) && (best < 0 || filled[n] - h(ni, nj) > filled[best] - h(best % ww, (best / ww) | 0))) best = n;
      }
    if (best < 0) return { reason: 'drains' };
    start = best;
  }
  const level = filled[start];
  const cells: number[] = [];
  const seen = new Uint8Array(ww * wh);
  const stack = [start];
  seen[start] = 1;
  while (stack.length) {
    const o = stack.pop()!;
    const i = o % ww;
    const j = (o / ww) | 0;
    // a hollow reaching the window's edge is larger than the window: too big to fill
    if (i === 0 || j === 0 || i === ww - 1 || j === wh - 1) return { reason: 'too-big' };
    cells.push((wy0 + j) * W + col(i));
    if (cells.length > MAX_CELLS) return { reason: 'too-big' };
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const n = (j + dj) * ww + i + di;
        if (!seen[n] && filled[n] === level && wet(n)) {
          seen[n] = 1;
          stack.push(n);
        }
      }
  }
  return { cells, level };
}

/** Records tiles of a layer before they change, for one undo step. */
class Recorder {
  readonly before = new Map<number, RasterArray | null>();
  private model: TerrainModel;
  readonly layer: 'height' | 'lake';
  constructor(model: TerrainModel, layer: 'height' | 'lake') {
    this.model = model;
    this.layer = layer;
  }
  /** The tile holding world cell key, recorded and allocated. */
  tile(key: number): { t: Float32Array; i: number } {
    const g = this.model.grid(this.layer);
    const x = key % this.model.W;
    const y = (key / this.model.W) | 0;
    const TS = g.TS;
    const tk = g.key((x / TS) | 0, (y / TS) | 0);
    if (!this.before.has(tk)) {
      const t = g.tiles.get(tk);
      this.before.set(tk, t ? t.slice() : null);
    }
    return { t: g.ensureTile((x / TS) | 0, (y / TS) | 0) as Float32Array, i: (y % TS) * TS + (x % TS) };
  }
  finish(): TileChange | null {
    if (!this.before.size) return null;
    const g = this.model.grid(this.layer);
    const after = new Map<number, RasterArray | null>();
    for (const k of this.before.keys()) {
      const t = g.tiles.get(k);
      if (t && g.isTileDefault(t)) {
        g.tiles.delete(k);
        after.set(k, null);
      } else after.set(k, t ? t.slice() : null);
      const TS = g.TS;
      const tx = k % g.NX;
      const ty = Math.floor(k / g.NX);
      this.model.changed(this.layer, { x0: tx * TS, y0: ty * TS, x1: tx * TS + TS - 1, y1: ty * TS + TS - 1 });
    }
    return { layer: this.layer, before: this.before, after };
  }
}

/** Put a lake at `level` over `cells`. Returns the lake layer's undo record. */
export function setLake(model: TerrainModel, cells: Iterable<number>, level: number): TileChange | null {
  const rec = new Recorder(model, 'lake');
  for (const k of cells) {
    const { t, i } = rec.tile(k);
    t[i] = level;
  }
  return rec.finish();
}

/** Remove the water from cells (the ground stays as it is). */
export function clearLake(model: TerrainModel, cells: Iterable<number>): TileChange | null {
  const rec = new Recorder(model, 'lake');
  for (const k of cells) {
    const { t, i } = rec.tile(k);
    t[i] = NO_WATER;
  }
  return rec.finish();
}

const lakeValue = (model: TerrainModel, k: number) => {
  const v = model.lake.get(k % model.W, (k / model.W) | 0);
  return isLake(v) ? v : NO_WATER;
};

/** The cell of the lake at (x, y), or of one right beside it (within two cells); -1 if none. */
function lakeCellNear(model: TerrainModel, x: number, y: number): number {
  const W = model.W;
  const cx = ((Math.floor(x) % W) + W) % W;
  const cy = Math.floor(y);
  let best = -1;
  let bd = Infinity;
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const yy = cy + dy;
      if (yy < 0 || yy >= model.H) continue;
      const xx = model.height.wrap ? (cx + dx + W) % W : cx + dx;
      if (xx < 0 || xx >= W) continue;
      const k = yy * W + xx;
      const d = dx * dx + dy * dy;
      if (d < bd && lakeValue(model, k) !== NO_WATER) {
        bd = d;
        best = k;
      }
    }
  return best;
}

/** The cells of the lake at (x, y) (or right beside it): those holding its level, joined to it. */
export function lakeAt(model: TerrainModel, x: number, y: number): number[] {
  const start = lakeCellNear(model, x, y);
  if (start < 0) return [];
  const level = lakeValue(model, start);
  const out: number[] = [];
  const seen = new Set([start]);
  const stack = [start];
  const nb: number[] = [];
  while (stack.length) {
    const k = stack.pop()!;
    out.push(k);
    neighbours(model, k, nb);
    for (const n of nb)
      if (!seen.has(n) && lakeValue(model, n) === level) {
        seen.add(n);
        stack.push(n);
      }
  }
  return out;
}

/**
 * Lakes that `cells` (or the cells next to them) already hold: they join the new lake as one
 * water body, at the higher of the levels.
 */
export function touchingLakes(model: TerrainModel, cells: Iterable<number>): { cells: Set<number>; level: number } {
  const W = model.W;
  const found = new Set<number>();
  let level = -Infinity;
  const nb: number[] = [];
  const look = (k: number) => {
    if (found.has(k)) return;
    const v = lakeValue(model, k);
    if (v === NO_WATER) return;
    for (const c of lakeAt(model, k % W, (k / W) | 0)) found.add(c);
    level = Math.max(level, v);
  };
  for (const k of cells) {
    look(k);
    neighbours(model, k, nb);
    for (const n of nb) look(n);
  }
  return { cells: found, level };
}

/**
 * The highest a lake can stand before it spills: the lowest way out of its hollow, to the sea,
 * the map's edge or a lower lake. Water rising from the lake crosses the land lowest first, so
 * the level at which it first reaches a way out is the spill level.
 */
export function spillLevel(model: TerrainModel, cells: number[], level: number): number {
  const W = model.W;
  const hg = model.height;
  const sea = model.seaLevel;
  const heap = new Heap();
  const seen = new Set<number>();
  for (const k of cells) {
    seen.add(k);
    heap.push(k, level);
  }
  const nb: number[] = [];
  while (heap.size) {
    const top = heap.top();
    const k = heap.pop();
    // a hollow this large spills somewhere far off; its shore is as good as level there
    if (seen.size > MAX_CELLS) return top;
    neighbours(model, k, nb);
    for (const n of nb) {
      if (seen.has(n)) continue;
      seen.add(n);
      const v = hg.get(n % W, (n / W) | 0);
      const other = lakeValue(model, n);
      // the sea and a lower lake take the water as soon as it reaches them; off the map's edge, once it is up on it
      if (v < sea || (other !== NO_WATER && other < level)) return top;
      if (isEdge(model, n)) return Math.max(top, v);
      heap.push(n, Math.max(top, v));
    }
  }
  return level;
}

/**
 * The cells water at `level` covers when it rises (or falls) from `seeds`: the ground under
 * the level joined to them. Null when it runs off (to the sea, the map's edge, too far).
 */
function floodUnder(model: TerrainModel, seeds: Iterable<number>, level: number): number[] | null {
  const W = model.W;
  const hg = model.height;
  const h = (k: number) => hg.get(k % W, (k / W) | 0);
  const out: number[] = [];
  const seen = new Set<number>();
  const stack: number[] = [];
  for (const k of seeds)
    if (!seen.has(k) && h(k) < level) {
      seen.add(k);
      stack.push(k);
    }
  const nb: number[] = [];
  while (stack.length) {
    const k = stack.pop()!;
    out.push(k);
    if (out.length > MAX_CELLS || isEdge(model, k) || h(k) < model.seaLevel) return null;
    neighbours(model, k, nb);
    for (const n of nb) {
      if (seen.has(n)) continue;
      seen.add(n);
      // a higher lake next door keeps its own water
      const other = lakeValue(model, n);
      if (other !== NO_WATER && other > level) continue;
      if (h(n) < level) stack.push(n);
    }
  }
  return out;
}

export interface LakeInfo {
  cells: number[];
  level: number;
  /** Bounds, world cells. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  areaKm2: number;
  /** Metres. */
  maxDepth: number;
  meanDepth: number;
  volumeKm3: number;
  /** The level at which it would spill over its rim. */
  spill: number;
  /** The lowest point of its bed. */
  floor: number;
}

/** The lake at (x, y) (or right beside it) and its figures, or null. */
export function lakeInfo(model: TerrainModel, x: number, y: number): LakeInfo | null {
  const cells = lakeAt(model, x, y);
  if (!cells.length) return null;
  const W = model.W;
  const level = lakeValue(model, cells[0]);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let area = 0;
  let vol = 0;
  let floor = Infinity;
  for (const k of cells) {
    const cx = k % W;
    const cy = (k / W) | 0;
    x0 = Math.min(x0, cx);
    x1 = Math.max(x1, cx);
    y0 = Math.min(y0, cy);
    y1 = Math.max(y1, cy);
    const g = model.height.get(cx, cy);
    floor = Math.min(floor, g);
    const a = model.geo.cellAreaKm2(cy);
    area += a;
    vol += a * Math.max(0, level - g);
  }
  return {
    cells,
    level,
    x0,
    y0,
    x1,
    y1,
    areaKm2: area,
    maxDepth: Math.max(0, level - floor),
    meanDepth: area > 0 ? vol / area : 0,
    volumeKm3: vol / 1000,
    spill: Math.max(level, spillLevel(model, cells, level)),
    floor,
  };
}

/**
 * Set a lake to another level: lower, it shrinks into the deepest parts of its bed; higher (up to
 * where it would spill), it spreads over the land around. Returns the undo record and the cells.
 */
export function relevelLake(model: TerrainModel, cells: number[], level: number): { change: TileChange | null; cells: number[] } {
  const now = floodUnder(model, cells, level) ?? [];
  const keep = new Set(now);
  const rec = new Recorder(model, 'lake');
  for (const k of cells)
    if (!keep.has(k)) {
      const { t, i } = rec.tile(k);
      t[i] = NO_WATER;
    }
  for (const k of now) {
    const { t, i } = rec.tile(k);
    t[i] = level;
  }
  return { change: rec.finish(), cells: now };
}

/** How far the band outside a painted lake reaches into the land around it, cells. */
const PAINT_BAND = 2.5;
/** How steeply a painted lake's bed falls away from the shore at first, and the bank rises behind it (metres per cell). */
const SHELF = 3;
/** How far from a stroke the bed of the water it joins blends into the new bed, cells. */
const BLEND = 4;

/**
 * Signed distance from the edge of a painted shape, cells (positive inside), for the shape and a
 * band around it. `cover` is how much of each cell was painted (0 … 1): a cell half painted lies
 * on the edge, which is how the shape keeps the brush's smooth outline finer than the cells.
 * Distances are measured straight to the nearest point on the edge, so they have no corners.
 */
function paintedDistance(model: TerrainModel, cover: Map<number, number>, band = PAINT_BAND): Map<number, number> {
  const W = model.W;
  const c = (k: number) => cover.get(k) ?? 0;
  const at = (x: number, y: number) => {
    if (y < 0 || y >= model.H) return 0;
    if (model.height.wrap) x = ((x % W) + W) % W;
    else if (x < 0 || x >= W) return 0;
    return c(y * W + x);
  };
  /**
   * Per cell: its distance, and the point on the edge it is measured from with the edge's
   * direction there (inwards), so cells beside the edge measure straight across it.
   */
  const d = new Map<number, number>();
  const from = new Map<number, [number, number, number, number]>();
  const heap = new Heap();
  const offer = (k: number, v: number, src: [number, number, number, number]) => {
    const o = d.get(k);
    if (o === undefined || Math.abs(v) < Math.abs(o)) {
      d.set(k, v);
      from.set(k, src);
      heap.push(k, Math.abs(v));
    }
  };
  const seed = (k: number, v: number) => {
    const x = k % W;
    const y = (k / W) | 0;
    // the edge runs across the slope of the painted cover; it lies v from the cell's middle
    let gx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) / 8;
    let gy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)) / 8;
    const gl = Math.hypot(gx, gy);
    if (gl < 1e-6) {
      gx = 0;
      gy = 0;
    } else {
      gx /= gl;
      gy /= gl;
    }
    offer(k, v, [x + 0.5 - v * gx, y + 0.5 - v * gy, gx, gy]);
  };
  const nb: number[] = [];
  for (const [k, v] of cover) {
    if (v > 0 && v < 1) seed(k, v - 0.5);
    if (v < 0.5) continue;
    neighbours(model, k, nb);
    for (const n of nb) if (c(n) <= 0) seed(n, -0.5);
  }
  for (const [k, v] of cover)
    if (v >= 1) {
      neighbours(model, k, nb);
      if (nb.some((n) => c(n) <= 0)) seed(k, 0.5);
    }
  const done = new Set<number>();
  while (heap.size) {
    const k = heap.pop();
    if (done.has(k)) continue;
    done.add(k);
    const v = d.get(k)!;
    const src = from.get(k)!;
    neighbours(model, k, nb);
    for (const n of nb) {
      if (done.has(n)) continue;
      if (c(n) >= 0.5 !== v > 0) continue;
      let dx = (n % W) + 0.5 - src[0];
      if (model.height.wrap) dx -= Math.round(dx / W) * W;
      const dy = ((n / W) | 0) + 0.5 - src[1];
      // straight across the edge next to the point, else straight to it
      const across = Math.abs(dx * src[2] + dy * src[3]);
      const along = Math.abs(dx * src[3] - dy * src[2]);
      const r = (src[2] || src[3]) && along <= 0.75 ? across : Math.hypot(dx, dy);
      if (v <= 0 && r > band) continue;
      offer(n, v > 0 ? Math.max(r, 0.01) : -Math.max(r, 0.01), src);
    }
  }
  return d;
}

/**
 * A lake painted with the brush. `cover` is how much of each cell the brush painted (0 … 1). The
 * shore runs along the painted shape: the ground is cut down under it and, along a narrow band
 * outside, raised to just above the water where it is lower, so the level meets the ground right
 * on the painted edge. The bed shelves gently from the shore, then falls to `maxDepth` metres. A
 * lake the shape touches (or comes right up to) is extended, at its own level, as one water with
 * one shore; otherwise the level is the lowest point of the shore. Returns the undo records and
 * the lake's cells.
 */
export function paintLake(model: TerrainModel, cover: Map<number, number>, maxDepth: number): { changes: TileChange[]; cells: number[] } {
  const W = model.W;
  const hg = model.height;
  const sea = model.seaLevel;
  const h = (k: number) => hg.get(k % W, (k / W) | 0);
  // the stroke and the land around it
  const near = paintedDistance(model, cover, BLEND);
  // water painted into the sea is the sea: a bay, cut below sea level, with no lake of its own
  for (const [k, v] of near) if (v > 0 && h(k) < sea) return paintBay(model, near, maxDepth);
  const touched: number[] = [];
  for (const [k, v] of near) if (v > -1.5) touched.push(k);
  const joined = touchingLakes(model, touched);
  let level: number;
  if (joined.cells.size) level = joined.level;
  else {
    // the lowest point of the shore, just outside the shape
    level = Infinity;
    for (const [k, v] of near) if (v <= 0 && v >= -1) level = Math.min(level, h(k));
    if (!Number.isFinite(level)) for (const [k, v] of near) if (v > 0) level = Math.min(level, h(k));
    if (!Number.isFinite(level)) return { changes: [], cells: [] };
  }
  // a lake reaching the sea is the sea
  level = Math.max(level, sea + 1);
  // Lakes it joins become one water with it, at the higher level: a lower one rises over its
  // hollow, or where the water would then run off, keeps its shape behind a bank raised to the
  // new level. The shore and the bed are measured from all the water together, so where the
  // stroke overlaps a lake the bed runs on smoothly instead of leaving a ridge along its edge.
  let d = near;
  const old = new Set<number>();
  if (joined.cells.size) {
    for (const k of floodUnder(model, joined.cells, level) ?? joined.cells) old.add(k);
    const all = new Map(cover);
    for (const k of old) all.set(k, 1);
    // the narrow gap between the stroke and the water it comes up to is water too, not a dam:
    // the shapes are closed (grown by two cells and shrunk back), which fills gaps and notches
    // between them without growing anything else
    const nb: number[] = [];
    const water = new Set<number>(old);
    for (const [k, c] of cover) if (c >= 0.5) water.add(k);
    const grow = (from: Set<number>) => {
      const out = new Set(from);
      for (const [k, v] of near)
        if (v > -PAINT_BAND && !out.has(k)) {
          neighbours(model, k, nb);
          if (nb.some((n) => from.has(n))) out.add(k);
        }
      return out;
    };
    const shrink = (from: Set<number>) => {
      const out = new Set<number>();
      for (const k of from) {
        neighbours(model, k, nb);
        if (water.has(k) || nb.every((n) => from.has(n))) out.add(k);
      }
      return out;
    };
    for (const k of shrink(shrink(grow(grow(water))))) if (!water.has(k)) all.set(k, 1);
    d = paintedDistance(model, all);
  }
  const depth = Math.max(1, maxDepth);
  // how fast the bed falls once past the shelf, metres per cell
  const k = Math.max(SHELF, depth / 3);
  const height = new Recorder(model, 'height');
  const set = (c: number, v: number) => {
    const { t, i } = height.tile(c);
    t[i] = v;
  };
  const wet: number[] = [];
  for (const [c, v] of d) {
    const g = h(c);
    if (v > 0) {
      if (g < sea) continue;
      wet.push(c);
      // under the stroke: below the level, shelving from the shore. The ground falls at the same
      // gentle rate on both sides of the edge, so the smoothed ground meets the level right on it
      const fall = SHELF * v + (k - SHELF) * Math.max(0, v - 1) ** 2 * 0.25;
      const t = Math.min(level - 0.1, level - depth * (1 - Math.exp(-fall / depth)));
      // the water already there keeps its bed, blending into the new one over a few cells next
      // to the stroke so no step shows under the water
      let w = 1;
      if (old.has(c) && (cover.get(c) ?? 0) < 0.5) {
        const e = near.get(c);
        w = e === undefined ? 0 : Math.max(0, 1 + e / BLEND);
      }
      if (t < g && w > 0) set(c, g + w * (t - g));
    } else {
      // around it: a low bank just above the level where the land is lower
      if (old.has(c) || v < -PAINT_BAND || g < sea) continue;
      const t = level - SHELF * v;
      const f = Math.min(1, Math.max(0, (v + PAINT_BAND) / (PAINT_BAND - 1.5)));
      // a soft maximum: the bank eases into the land instead of kinking where the two cross
      const top = 0.5 * (g + t + Math.sqrt((g - t) ** 2 + SHELF * SHELF));
      const nv = g + f * (top - g);
      if (nv > g + 0.01) set(c, nv);
    }
  }
  if (!wet.length) return { changes: [], cells: [] };
  // cells that held another lake's water and are now dry land (none, normally) lose it
  const keep = new Set(wet);
  const gone = [...joined.cells].filter((c) => !keep.has(c));
  const changes = [height.finish(), setLake(model, wet, level), gone.length ? clearLake(model, gone) : null].filter((c): c is TileChange => !!c);
  return { changes, cells: wet };
}

/** Water painted into the sea: the stroke's ground is cut below sea level, shelving like a lake's bed. */
function paintBay(model: TerrainModel, d: Map<number, number>, maxDepth: number): { changes: TileChange[]; cells: number[] } {
  const W = model.W;
  const sea = model.seaLevel;
  const depth = Math.max(1, maxDepth);
  const k = Math.max(SHELF, depth / 3);
  const height = new Recorder(model, 'height');
  const lake: number[] = [];
  for (const [c, v] of d) {
    if (v <= 0) continue;
    const g = model.height.get(c % W, (c / W) | 0);
    const fall = SHELF * v + (k - SHELF) * Math.max(0, v - 1) ** 2 * 0.25;
    const t = Math.min(sea - 0.1, sea - depth * (1 - Math.exp(-fall / depth)));
    if (t < g) {
      const { t: tile, i } = height.tile(c);
      tile[i] = t;
    }
    if (lakeValue(model, c) !== NO_WATER) lake.push(c);
  }
  // lake water it covers becomes sea too
  const changes = [height.finish(), lake.length ? clearLake(model, lake) : null].filter((c): c is TileChange => !!c);
  return { changes, cells: [] };
}

const bspline = (t: number): [number, number, number, number] => {
  const t2 = t * t;
  const t3 = t2 * t;
  return [(1 - 3 * t + 3 * t2 - t3) / 6, (4 - 6 * t2 + 3 * t3) / 6, (1 + 3 * t + 3 * t2 - 3 * t3) / 6, t3 / 6];
};

/**
 * The depth of lake water at a point as the map draws it (metres; zero or less on dry land), and
 * the lake's level there. The same sum as the terrain shader: the depth of each cell around the
 * point, smoothed with the ground's cubic B-spline; dry ground under the level that is not the
 * lake's counts as standing as far above it.
 */
export function lakeDepthAt(model: TerrainModel, x: number, y: number): { depth: number; level: number } {
  const W = model.W;
  const tx = x - 0.5;
  const ty = y - 0.5;
  const ix = Math.floor(tx);
  const iy = Math.floor(ty);
  const cell = (cx: number, cy: number) => {
    const yy = Math.min(model.H - 1, Math.max(0, cy));
    const xx = model.height.wrap ? ((cx % W) + W) % W : Math.min(W - 1, Math.max(0, cx));
    return yy * W + xx;
  };
  let level = NO_WATER;
  const lv: number[] = [];
  const gh: number[] = [];
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 4; i++) {
      const k = cell(ix + i - 1, iy + j - 1);
      const v = lakeValue(model, k);
      lv.push(v);
      gh.push(model.height.get(k % W, (k / W) | 0));
      if (v !== NO_WATER) level = Math.max(level, v);
    }
  if (level === NO_WATER) return { depth: -Infinity, level };
  const wx = bspline(tx - ix);
  const wy = bspline(ty - iy);
  let s = 0;
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 4; i++) {
      const o = j * 4 + i;
      const c = lv[o] !== NO_WATER ? lv[o] - gh[o] : Math.min(-Math.abs(level - gh[o]), -0.5);
      s += wx[i] * wy[j] * c;
    }
  return { depth: s, level };
}
