import type { RasterArray } from './TileGrid';
import { lakeLevel, NO_WATER, SHORE_MARK, type TerrainModel, type TileChange } from './TerrainModel';

/*
 * Lakes: water with a level of its own. A lake fills a hollow up to the lowest point
 * of its rim, where it would spill over, so its surface is flat and every shore is
 * above it; the lake layer holds that level and the map shows water wherever it
 * stands above the ground.
 */

/** Lakes larger than this many cells are refused (the water is running off to the sea). */
const MAX_CELLS = 3_000_000;
/** The level is kept on a ring of shore cells around the water too, so the shore is drawn smooth. */
const SHORE_RING = 2;

/** Binary min-heap of cell keys by height. */
class Heap {
  private k: number[] = [];
  private v: number[] = [];
  get size() {
    return this.k.length;
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

/** Put a lake at `level` over `cells` (and a ring of shore). Returns the lake layer's undo record. */
export function setLake(model: TerrainModel, cells: Iterable<number>, level: number): TileChange | null {
  const rec = new Recorder(model, 'lake');
  const set = new Set(cells);
  let ring = [...set];
  const nb: number[] = [];
  for (const k of set) {
    const { t, i } = rec.tile(k);
    t[i] = level;
  }
  // shore cells take the level too where they hold none, so the shore follows the land
  for (let r = 0; r < SHORE_RING; r++) {
    const next: number[] = [];
    for (const k of ring) {
      neighbours(model, k, nb);
      for (const n of nb) {
        if (set.has(n)) continue;
        set.add(n);
        // only dry shore: beyond a spill point the ground falls below the level again, and water
        // there would end in a cut along the cells
        if (model.height.get(n % model.W, (n / model.W) | 0) < level) continue;
        const { t, i } = rec.tile(n);
        // a shore keeps the highest level around it; water already there stays water
        if (t[i] === NO_WATER || (t[i] > SHORE_MARK / 2 && t[i] - SHORE_MARK < level)) t[i] = level + SHORE_MARK;
        next.push(n);
      }
    }
    ring = next;
  }
  return rec.finish();
}

/**
 * The water of the lake at (x, y): cells under water at its level, connected to it. With
 * `shore`, also the dry cells around it that carry its level (to remove a lake completely).
 */
export function lakeAt(model: TerrainModel, x: number, y: number, shore = false): number[] {
  const W = model.W;
  const lg = model.lake;
  const hg = model.height;
  const at = (k: number) => lakeLevel(lg.get(k % W, (k / W) | 0));
  const wet = (k: number, level: number) => lg.get(k % W, (k / W) | 0) === level && hg.get(k % W, (k / W) | 0) < level;
  let start = Math.floor(y) * W + (((Math.floor(x) % W) + W) % W);
  const level = at(start);
  if (level === NO_WATER) return [];
  const nb: number[] = [];
  // clicked on its shore: start from the water next to it
  if (!wet(start, level)) {
    neighbours(model, start, nb);
    const w = nb.find((n) => wet(n, level));
    if (w === undefined) return shore ? [start] : [];
    start = w;
  }
  const out: number[] = [];
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    const k = stack.pop()!;
    out.push(k);
    neighbours(model, k, nb);
    for (const n of nb)
      if (!seen.has(n) && wet(n, level)) {
        seen.add(n);
        stack.push(n);
      }
  }
  if (shore) {
    let ring = out.slice();
    for (let r = 0; r <= SHORE_RING; r++) {
      const next: number[] = [];
      for (const k of ring) {
        neighbours(model, k, nb);
        for (const n of nb)
          if (!seen.has(n) && at(n) === level) {
            seen.add(n);
            out.push(n);
            next.push(n);
          }
      }
      ring = next;
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
  const lg = model.lake;
  const found = new Set<number>();
  let level = -Infinity;
  const nb: number[] = [];
  const look = (k: number) => {
    if (found.has(k)) return;
    const v = lg.get(k % W, (k / W) | 0);
    if (v === NO_WATER || v > SHORE_MARK / 2) return;
    // only cells actually under water belong to a lake (shore cells just carry its level)
    if (model.height.get(k % W, (k / W) | 0) >= v) return;
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

/** Remove the water from cells (the ground stays as it is). */
export function clearLake(model: TerrainModel, cells: Iterable<number>): TileChange | null {
  const rec = new Recorder(model, 'lake');
  for (const k of cells) {
    const { t, i } = rec.tile(k);
    t[i] = NO_WATER;
  }
  return rec.finish();
}

/**
 * A lake painted over `cells`: its level is the lowest point of its shore, where it would spill;
 * the bed is cut below that level, deepest in the middle (down to `maxDepth` metres), and the
 * spill point is raised a little so the water stays in. Returns the undo records.
 */
export function paintLake(model: TerrainModel, cells: Set<number>, maxDepth: number): TileChange[] {
  if (!cells.size) return [];
  const W = model.W;
  const hg = model.height;
  const h = (k: number) => hg.get(k % W, (k / W) | 0);
  const nb: number[] = [];
  // the shore: cells next to the lake, and the distance of each lake cell from it
  const dist = new Map<number, number>();
  let frontier: number[] = [];
  let level = Infinity;
  const shore = new Set<number>();
  for (const k of cells) {
    neighbours(model, k, nb);
    for (const n of nb)
      if (!cells.has(n)) {
        shore.add(n);
        if (!dist.has(k)) {
          dist.set(k, 1);
          frontier.push(k);
        }
      }
  }
  for (const s of shore) level = Math.min(level, h(s));
  // a lake reaching the sea is the sea
  level = Math.max(level, model.seaLevel + 1);
  // lakes it touches join it, at the higher level
  const joined = touchingLakes(model, cells);
  if (joined.cells.size) level = Math.max(level, joined.level);
  for (let d = 2; frontier.length; d++) {
    const next: number[] = [];
    for (const k of frontier) {
      neighbours(model, k, nb);
      for (const n of nb)
        if (cells.has(n) && !dist.has(n)) {
          dist.set(n, d);
          next.push(n);
        }
    }
    frontier = next;
  }
  let far = 1;
  for (const d of dist.values()) far = Math.max(far, d);
  // the bed: below the level everywhere, shelving towards the middle. A lower lake it joins
  // spreads over its hollow up to the new level, as rising water would, unless the water would
  // then run off to the sea; only then does its rim hold it in.
  const spread = new Set(joined.cells);
  let dam = false;
  if (spread.size) {
    const queue = [...spread];
    while (queue.length && !dam) {
      const k = queue.pop()!;
      neighbours(model, k, nb);
      for (const n of nb) {
        if (spread.has(n) || cells.has(n) || h(n) >= level) continue;
        if (h(n) < model.seaLevel || isEdge(model, n) || spread.size > MAX_CELLS) {
          dam = true;
          break;
        }
        spread.add(n);
        queue.push(n);
      }
    }
    if (dam) {
      spread.clear();
      for (const c of joined.cells) spread.add(c);
    }
  }
  const all = new Set([...cells, ...spread]);
  const target = new Map<number, number>();
  for (const k of cells) {
    const f = Math.min(1, (dist.get(k) ?? 1) / Math.max(2, far * 0.6));
    const depth = Math.max(1, maxDepth * f * f * (3 - 2 * f));
    target.set(k, Math.min(h(k), level - depth));
  }
  // the painted lake's rim holds it in (and a joined lake's, where it had to be dammed)
  const rim = new Set<number>();
  for (const k of dam ? all : cells) {
    neighbours(model, k, nb);
    for (const n of nb) if (!all.has(n)) rim.add(n);
  }
  for (const r of rim) target.set(r, Math.max(h(r), level + 1));
  // The painted shape is made of whole cells; the change is softened over a couple of cells so
  // the shore runs smoothly instead of following their steps.
  const outer = new Set<number>();
  for (const r of rim) {
    neighbours(model, r, nb);
    for (const n of nb) if (!all.has(n) && !rim.has(n)) outer.add(n);
  }
  const zone = [...target.keys(), ...outer];
  let delta = new Map<number, number>(zone.map((k) => [k, (target.get(k) ?? h(k)) - h(k)]));
  for (let pass = 0; pass < 2; pass++) {
    const next = new Map<number, number>();
    for (const k of zone) {
      neighbours(model, k, nb);
      let sum = 2 * (delta.get(k) ?? 0);
      let wsum = 2;
      for (const n of nb) {
        sum += delta.get(n) ?? 0;
        wsum++;
      }
      next.set(k, sum / wsum);
    }
    delta = next;
  }
  const height = new Recorder(model, 'height');
  for (const k of zone) {
    let v = h(k) + (delta.get(k) ?? 0);
    // the deep water stays under the level, the outer shore above it
    if (cells.has(k) && (dist.get(k) ?? 1) >= 2) v = Math.min(v, level - 1);
    if (outer.has(k)) v = Math.max(v, level + 0.5);
    if (v === h(k)) continue;
    const { t, i } = height.tile(k);
    t[i] = v;
  }
  const changes = [height.finish(), setLake(model, all, level)];
  return changes.filter((c): c is TileChange => !!c);
}
