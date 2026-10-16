import { clamp } from '../core/math';
import type { MountainRange, Vec2 } from '../model/types';
import { sampleSpline } from '../render/vectorGeometry';
import type { RasterArray } from './TileGrid';
import type { TerrainModel, TileChange } from './TerrainModel';
import type { RangeJob, RangeJobRange } from './rangeUplift';

/*
 * Mountain ranges drawn as crest lines. Their relief lives in the model's relief
 * layer and is part of the height; rebuilding a range takes its old relief out
 * and puts the new one in, so the land under it and any sculpting on top stay.
 * Ranges whose belts overlap are carved together, as one landscape: their
 * rivers meet, and each can still be reshaped or removed on its own.
 */

/** Windows larger than this many cells are carved at a coarser resolution, then scaled up. */
const MAX_CELLS = 500_000;
/** Where a range rises from the sea, its foothills stand at least this far above it, metres. */
const SHORE = 30;
/** Spacing of the points along a crest curve, cells. */
const STEP = 2;

/** A crest line as a smooth curve through its points (world cells, unwrapped). */
export function crestCurve(points: Vec2[]): Vec2[] {
  return points.length < 2 ? points.slice() : sampleSpline(points, 1, false, STEP);
}

/** Where along a curve (0 … 1 of its length) a point lies, and the point itself. */
export function pointAt(curve: Vec2[], t: number): Vec2 {
  if (curve.length < 2) return curve[0];
  const cum = [0];
  for (let i = 1; i < curve.length; i++) cum.push(cum[i - 1] + Math.hypot(curve[i][0] - curve[i - 1][0], curve[i][1] - curve[i - 1][1]));
  const target = clamp(t, 0, 1) * cum[cum.length - 1];
  for (let i = 1; i < curve.length; i++)
    if (cum[i] >= target) {
      const f = (target - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
      return [curve[i - 1][0] + f * (curve[i][0] - curve[i - 1][0]), curve[i - 1][1] + f * (curve[i][1] - curve[i - 1][1])];
    }
  return curve[curve.length - 1];
}

/** The nearest point of a curve to p, with how far along it lies (0 … 1) and the distance. */
export function nearestOnCurve(curve: Vec2[], p: Vec2): { t: number; d: number; at: Vec2 } {
  let best = { t: 0, d: Infinity, at: curve[0] };
  let total = 0;
  const lens: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    const l = Math.hypot(curve[i][0] - curve[i - 1][0], curve[i][1] - curve[i - 1][1]);
    lens.push(l);
    total += l;
  }
  let run = 0;
  for (let i = 1; i < curve.length; i++) {
    const [ax, ay] = curve[i - 1];
    const [bx, by] = curve[i];
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = Math.max(1e-9, dx * dx + dy * dy);
    const f = clamp(((p[0] - ax) * dx + (p[1] - ay) * dy) / l2, 0, 1);
    const at: Vec2 = [ax + f * dx, ay + f * dy];
    const d = Math.hypot(p[0] - at[0], p[1] - at[1]);
    if (d < best.d) best = { t: total > 0 ? (run + f * lens[i - 1]) / total : 0, d, at };
    run += lens[i - 1];
  }
  return best;
}

/** Half a range's width, in cells. */
export const halfWidthCells = (model: TerrainModel, r: MountainRange) => r.widthKm / 2 / model.geo.kmPerCellY;

type Box = { x0: number; y0: number; x1: number; y1: number };

/** The cells a range's belt can reach, with room for a wandering crest and an asymmetric flank. */
function rangeBox(model: TerrainModel, r: MountainRange): Box | null {
  const pts = r.lines.flatMap((l) => crestCurve(l.points));
  if (!pts.length) return null;
  const pad = halfWidthCells(model, r) * (1.6 + 0.4 * r.irregularity) + 4;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x0: Math.floor(x0 - pad), y0: Math.max(0, Math.floor(y0 - pad)), x1: Math.ceil(x1 + pad), y1: Math.min(model.H - 1, Math.ceil(y1 + pad)) };
}

const overlaps = (a: Box, b: Box) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;

let worker: Worker | null = null;

function carve(job: RangeJob): Promise<{ relief: Float32Array; uplift: Float32Array }> {
  worker ??= new Worker(new URL('./range.worker.ts', import.meta.url), { type: 'module' });
  const w = worker;
  return new Promise((resolve, reject) => {
    w.onmessage = (e: MessageEvent<{ relief: Float32Array; uplift: Float32Array }>) => resolve(e.data);
    w.onerror = (e) => {
      // a failed worker is started afresh next time
      worker = null;
      w.terminate();
      reject(e);
    };
    w.postMessage(job);
  });
}

/** Catmull-Rom weights, so a relief carved coarser scales up without creases. */
function cubic(a: number, b: number, c: number, d: number, t: number) {
  return b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
}

/** The ranges carved together with `ids` (their belts overlap, directly or through others), with their belts. */
function rangeGroup(model: TerrainModel, ranges: Record<string, MountainRange>, ids: string[], removed: MountainRange[] = []) {
  const all = new Map<string, { r: MountainRange; box: Box | null }>();
  for (const r of Object.values(ranges)) all.set(r.id, { r, box: rangeBox(model, r) });
  for (const r of removed) all.set(r.id, { r, box: rangeBox(model, r) });
  const group = new Set<string>([...ids, ...removed.map((r) => r.id)].filter((id) => all.get(id)?.box));
  for (let grew = true; grew; ) {
    grew = false;
    for (const [id, { box }] of all)
      if (!group.has(id) && box && [...group].some((g) => overlaps(all.get(g)!.box!, box))) {
        group.add(id);
        grew = true;
      }
  }
  return { group, boxes: [...group].map((id) => all.get(id)!.box!) };
}

/**
 * Turn a range (and those carved with it) into plain terrain: the mountains stay as they are,
 * but stop being lines. Returns the ranges left and the undo record of the relief layer.
 */
export function bakeRanges(model: TerrainModel, ranges: Record<string, MountainRange>, id: string): { after: Record<string, MountainRange>; changes: TileChange[] } {
  const { group, boxes } = rangeGroup(model, ranges, [id]);
  const after = { ...ranges };
  for (const g of group) delete after[g];
  const rg = model.relief;
  const TS = rg.TS;
  const before = new Map<number, RasterArray | null>();
  const next = new Map<number, RasterArray | null>();
  for (const [k, tile] of [...rg.tiles]) {
    const tx = k % rg.NX;
    const ty = Math.floor(k / rg.NX);
    let changedTile = false;
    const copy = tile.slice();
    for (let j = 0; j < TS; j++)
      for (let i = 0; i < TS; i++) {
        const y = ty * TS + j;
        const li = j * TS + i;
        if (copy[li] === 0) continue;
        // planets: a belt may sit across the antimeridian, at x ± W
        const inside = [0, -model.W, model.W].some((sh) => boxes.some((b) => tx * TS + i + sh >= b.x0 && tx * TS + i + sh <= b.x1 && y >= b.y0 && y <= b.y1));
        if (inside) {
          copy[li] = 0;
          changedTile = true;
        }
      }
    if (!changedTile) continue;
    before.set(k, tile.slice());
    const empty = copy.every((v) => v === 0);
    next.set(k, empty ? null : copy);
    if (empty) rg.tiles.delete(k);
    else rg.tiles.set(k, copy);
    model.changed('relief', { x0: tx * TS, y0: ty * TS, x1: tx * TS + TS - 1, y1: ty * TS + TS - 1 });
  }
  return { after, changes: before.size ? [{ layer: 'relief', before, after: next }] : [] };
}

/**
 * Rebuild ranges after `changed` ranges were drawn or reshaped and `removed` ones deleted.
 * Every range whose belt overlaps them is carved again with them. Returns the undo records of
 * the height and relief layers, or nothing when no land changed.
 */
export async function rebuildRanges(model: TerrainModel, ranges: Record<string, MountainRange>, changed: string[], removed: MountainRange[] = []): Promise<TileChange[]> {
  const { group, boxes } = rangeGroup(model, ranges, changed, removed);
  if (!group.size) return [];
  const live = [...group].filter((id) => ranges[id]).map((id) => ranges[id]);

  // the window, in whole cells (x unwrapped on planets)
  const X0 = Math.min(...boxes.map((b) => b.x0));
  const Y0 = Math.min(...boxes.map((b) => b.y0));
  const X1 = Math.max(...boxes.map((b) => b.x1));
  const Y1 = Math.max(...boxes.map((b) => b.y1));
  const W = X1 - X0 + 1;
  const H = Y1 - Y0 + 1;

  // the new relief of the group across the window
  const relief = new Float32Array(W * H);
  const uplift = new Float32Array(W * H);
  if (live.length) {
    let f = 1;
    while (Math.ceil(W / f) * Math.ceil(H / f) > MAX_CELLS) f++;
    const w = Math.ceil(W / f);
    const h = Math.ceil(H / f);
    const peakM = Math.max(...live.map((r) => r.heightM));
    const jobRanges: RangeJobRange[] = live.map((r) => ({
      height: r.heightM / peakM,
      seed: r.seed % 1_000_003,
      halfWidth: halfWidthCells(model, r) / f,
      irregularity: r.irregularity,
      asymmetry: r.asymmetry,
      lines: r.lines.map((l) => {
        const c = crestCurve(l.points);
        const pts = new Float32Array(c.length * 2);
        c.forEach(([x, y], i) => {
          pts[2 * i] = (x - X0) / f;
          pts[2 * i + 1] = (y - Y0) / f;
        });
        // a branch whose parent crest is gone starts free, like any line
        const joined = !!l.from && (l.from.range ? !!ranges[l.from.range]?.lines.some((x) => x.id === l.from!.line) : r.lines.some((x) => x.id === l.from!.line));
        return { pts, h0: 1, h1: joined ? 0.8 : 1, freeStart: !joined, freeEnd: true };
      }),
    }));
    const small = await carve({ w, h, cellKm: model.geo.kmPerCellY * f, ox: X0, oy: Y0, scale: f, ranges: jobRanges, peakM, seed: 0 });
    for (const [src, dst] of [
      [small.relief, relief],
      [small.uplift, uplift],
    ] as const) {
      const at = (x: number, y: number) => src[clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)];
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          if (f === 1) {
            dst[y * W + x] = src[y * w + x];
            continue;
          }
          const fx = (x + 0.5) / f - 0.5;
          const fy = (y + 0.5) / f - 0.5;
          const ix = Math.floor(fx);
          const iy = Math.floor(fy);
          const tx = fx - ix;
          const ty = fy - iy;
          const row = (j: number) => cubic(at(ix - 1, j), at(ix, j), at(ix + 1, j), at(ix + 2, j), tx);
          dst[y * W + x] = Math.max(0, cubic(row(iy - 1), row(iy), row(iy + 1), row(iy + 2), ty));
        }
    }
  }

  // swap the group's old relief for the new one, only inside the group's belts (other ranges'
  // relief in the same tiles stays)
  const hg = model.height;
  const rg = model.relief;
  const TS = hg.TS;
  const NX = hg.NX;
  const inGroup = (x: number, y: number) => boxes.some((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1);
  const hBefore = new Map<number, RasterArray | null>();
  const rBefore = new Map<number, RasterArray | null>();
  const hAfter = new Map<number, RasterArray | null>();
  const rAfter = new Map<number, RasterArray | null>();
  for (let ty = Math.floor(Y0 / TS); ty <= Math.floor(Y1 / TS); ty++)
    for (let ux = Math.floor(X0 / TS); ux <= Math.floor(X1 / TS); ux++) {
      let tx = ux;
      if (hg.wrap) tx = ((ux % NX) + NX) % NX;
      else if (ux < 0 || ux >= NX) continue;
      const k = ty * NX + tx;
      const oldR = rg.tiles.get(k);
      let touched = false;
      for (let j = 0; j < TS && !touched; j++)
        for (let i = 0; i < TS; i++) {
          const x = ux * TS + i;
          const y = ty * TS + j;
          if (x < X0 || x > X1 || y < Y0 || y > Y1 || !inGroup(x, y)) continue;
          const o = (y - Y0) * W + (x - X0);
          if ((oldR?.[j * TS + i] ?? 0) !== 0 || relief[o] !== 0 || uplift[o] !== 0) {
            touched = true;
            break;
          }
        }
      if (!touched) continue;
      const hOld = hg.tiles.get(k);
      hBefore.set(k, hOld ? hOld.slice() : null);
      rBefore.set(k, oldR ? oldR.slice() : null);
      const ht = hg.ensureTile(tx, ty);
      const rt = rg.ensureTile(tx, ty);
      let any = false;
      for (let j = 0; j < TS; j++)
        for (let i = 0; i < TS; i++) {
          const x = ux * TS + i;
          const y = ty * TS + j;
          const li = j * TS + i;
          if (x >= X0 && x <= X1 && y >= Y0 && y <= Y1 && inGroup(x, y)) {
            const o = (y - Y0) * W + (x - X0);
            // a range drawn over the sea first lifts the sea floor under it to the shore, as an island arc
            const base = ht[li] - rt[li];
            const s = clamp(uplift[o] / 0.4, 0, 1);
            const nr = relief[o] + Math.max(0, model.seaLevel + SHORE - base) * s * s * (3 - 2 * s);
            ht[li] = base + nr;
            rt[li] = nr;
          }
          if (rt[li] !== 0) any = true;
        }
      hAfter.set(k, ht.slice());
      if (any) rAfter.set(k, rt.slice());
      else {
        rg.tiles.delete(k);
        rAfter.set(k, null);
      }
      const rect = { x0: tx * TS, y0: ty * TS, x1: tx * TS + TS - 1, y1: ty * TS + TS - 1 };
      model.changed('relief', rect);
      model.changed('height', rect);
    }
  if (!hBefore.size) return [];
  return [
    { layer: 'height', before: hBefore, after: hAfter },
    { layer: 'relief', before: rBefore, after: rAfter },
  ];
}
