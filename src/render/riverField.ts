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
 * The shader needs to know, finer than the cells, how far each pixel is from the nearest river's
 * bank. Each cell near a river holds, for the two rivers whose banks are nearest (a river and a
 * tributary where they join), a small piece of the river near the cell: a point of it, its
 * direction and half width there, its curvature ahead and behind (two arcs meeting smoothly at the
 * point, so a winding river is followed), and how far ahead and behind the arcs stay on the river
 * (to a fraction of a pixel close up). A pixel measures its distance to that arc, and past
 * the arc's ends to the ends themselves, rounded; it keeps the nearest bank among the cells
 * around it. Every point it measures to lies on the river, so no water is ever drawn beside one,
 * however thin the river or tight its bends; the rounded ends make a river's source, its mouth and
 * a tributary's end inside its river.
 */

/**
 * Channels, per cell: for the nearest river (0–3) and the next nearest (4–7), its point's offset
 * from the cell's middle with how far the arcs reach ahead (x) and behind (y), packed (see
 * packOffset); half width and the curvature ahead, packed (see packWidth; 0 = no river); the
 * direction and the curvature behind, packed (see packDirKappa).
 */
export const RIVER_CHANNELS = 8;
/** The longest an arc reaches from its point, cells. */
const ALONG_MAX = 1.0;
/** The largest curvature kept (a bend of a sixteenth of a cell's radius). */
const MAX_CURVATURE = 16;
/** The thinnest half width kept, cells (widths are kept to 0.5 %, up to 64 cells). */
const HW_MIN = 1 / 1024;
/** Offsets are kept to 1/1024 of a cell, up to 32 cells; an arc's reach to 1/31 of ALONG_MAX. */
const OFF_Q = 1024;
const OFF_MID = 32768;
const REACH_Q = 31;
/** The half width's change along the arcs, relative to it, per cell: up to ±8, in six bits on a cubic scale (exactly 0, finely near it), three in each offset. */
const SLOPE_MAX = 8;

/** Pack a direction (−π … π) and a curvature (1/cells) into one float, exactly. */
export const packDirKappa = (ang: number, kappa: number) =>
  Math.round((ang + Math.PI) * 1000) * 2048 + Math.round(((Math.max(-MAX_CURVATURE, Math.min(MAX_CURVATURE, kappa)) + MAX_CURVATURE) / (2 * MAX_CURVATURE)) * 2046);
export function unpackDirKappa(v: number): [number, number] {
  const aq = Math.floor((v + 0.5) / 2048);
  return [aq / 1000 - Math.PI, ((v - aq * 2048) / 2046) * 2 * MAX_CURVATURE - MAX_CURVATURE];
}

/**
 * Pack an offset (cells), how far an arc reaches that way (cells, rounded down) and three bits
 * more (half of the width slope) into one float, exactly.
 */
export function packOffset(off: number, reach: number, bits = 0): number {
  const o = Math.max(-OFF_MID + 1, Math.min(OFF_MID - 1, Math.round(off * OFF_Q))) + OFF_MID;
  return (o * 32 + Math.max(0, Math.min(REACH_Q, Math.floor((reach / ALONG_MAX) * REACH_Q + 1e-6)))) * 8 + bits;
}
/** [offset, reach, the three bits]. */
export function unpackOffset(v: number): [number, number, number] {
  const a = Math.floor((v + 0.5) / 8);
  const o = Math.floor((a + 0.5) / 32);
  return [(o - OFF_MID) / OFF_Q, ((a - o * 32) / REACH_Q) * ALONG_MAX, v - a * 8];
}
/** A width slope (relative, per cell) as six bits, and back. */
export const slopeBits = (rel: number) => 31 + Math.round(Math.cbrt(Math.max(-SLOPE_MAX, Math.min(SLOPE_MAX, rel)) / SLOPE_MAX) * 31);
export const slopeOf = (bits: number) => SLOPE_MAX * ((Math.min(bits, 62) - 31) / 31) ** 3;

/** Pack a half width (cells, on a log scale) and a curvature (1/cells) into one float, exactly; never 0. */
export function packWidth(hw: number, kappa: number): number {
  const hq = Math.max(0, Math.min(2047, Math.round(Math.log2(Math.max(hw, HW_MIN) / HW_MIN) * 128)));
  const kq = Math.round(((Math.max(-MAX_CURVATURE, Math.min(MAX_CURVATURE, kappa)) + MAX_CURVATURE) / (2 * MAX_CURVATURE)) * 4094);
  return hq * 4096 + kq + 1;
}
/** A packed half width and curvature: [half width, curvature]. */
export function unpackWidth(v: number): [number, number] {
  const a = Math.abs(v) - 1;
  const hq = Math.floor((a + 0.5) / 4096);
  return [HW_MIN * Math.pow(2, hq / 128), ((a - hq * 4096) / 4094) * 2 * MAX_CURVATURE - MAX_CURVATURE];
}

/** How far a river must go away from a cell and come back to it to count as another piece of it, cells. */
const PIECE = 0.15;
/** The most pieces of one river kept apart near a cell. */
const PIECES = 4;

/** Scratch for a river's points near one of its points: along, across, half width. */
const SU = new Float64Array(256);
const SV = new Float64Array(256);
const SH = new Float64Array(256);

/** Scratch for drawing a river: per cell of a 16×16 block, its nearest point for each piece of it. */
const BS = 16;
interface Block {
  seen: Uint8Array;
  cur: Uint8Array;
  min: Float32Array;
  max: Float32Array;
  bestS: Float32Array;
  bestK: Int32Array;
}
const pool: Block[] = [];
function takeBlock(): Block {
  const b = pool.pop();
  if (b) return b;
  const N = BS * BS;
  return { seen: new Uint8Array(N), cur: new Uint8Array(N), min: new Float32Array(N), max: new Float32Array(N), bestS: new Float32Array(N * PIECES), bestK: new Int32Array(N * PIECES) };
}
function giveBlock(b: Block) {
  b.seen.fill(0);
  if (pool.length < 4096) pool.push(b);
}
/** How far from a river's bank cells keep its data, cells (the shader looks a cell or so around). */
const REACH = 2.5;
/** Sampling step along a river (cells): finer for thin rivers, so their bends are followed. */
const stepFor = (p: PathFeature) => Math.max(0.05, Math.min(0.25, p.width * 0.5));

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
      const shape = riverShape(p, paths, net, stepFor(p), key.endsWith('|open'));
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
        const c = (y % TS) * TS + (wx % TS);
        t.fill(0, c * C, c * C + C);
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
      if (!any) {
        g.tiles.delete(k);
      }
    }
  }

  /**
   * Write a river's cells inside `clip`: in each cell it takes the first slot if its bank is the
   * nearest, the second if it is the next nearest after another river's.
   */
  private draw(shape: RiverShape, clip: CellRect) {
    const g = this.grid;
    const { W, H } = this.model;
    const TS = g.TS;
    const C = RIVER_CHANNELS;
    const { pts, hw } = shape;
    const n = hw.length;
    const cum = new Float32Array(n);
    for (let k = 1; k < n; k++) cum[k] = cum[k - 1] + Math.hypot(pts[2 * k] - pts[2 * k - 2], pts[2 * k + 1] - pts[2 * k - 1]);
    const total = cum[n - 1];
    const dirAt = (k: number): [number, number] => {
      const a = Math.max(0, k - 1);
      const b = Math.min(n - 1, k + 1);
      const dx = pts[2 * b] - pts[2 * a];
      const dy = pts[2 * b + 1] - pts[2 * a + 1];
      const l = Math.hypot(dx, dy) || 1;
      return [dx / l, dy / l];
    };
    // the piece of the river a cell keeps of point k: two arcs, ahead and behind, and how far each
    // stays on the river (to `tol`), so every point measured to lies on it
    const pieces = new Map<number, [number, number, number, number, number, number, number]>();
    // scratch: the river's points one way from a point, in its frame
    const pieceOf = (k: number) => {
      let pc = pieces.get(k);
      if (pc) return pc;
      const qx = pts[2 * k];
      const qy = pts[2 * k + 1];
      const [tx, ty] = dirAt(k);
      const h0 = hw[k];
      // how the half width changes along the arcs (over a short stretch around the point), as kept
      const ka0 = Math.max(0, k - 2);
      const kb0 = Math.min(n - 1, k + 2);
      const sb = slopeBits(kb0 > ka0 ? (hw[kb0] - hw[ka0]) / Math.max(1e-6, cum[kb0] - cum[ka0]) / Math.max(h0, HW_MIN) : 0);
      const slope = slopeOf(sb) * h0;
      // how far the arc may stray from the river: half a pixel close up on a big map, a tenth of the
      // river's half width (where it would draw the river too wide or off its line, it stops; too
      // thin it may be, where the river widens: other cells' arcs draw it full)
      const tol = Math.max(0.006, 0.1 * h0);
      // the river's points one way, in the frame of the point: along, across, half width (into the
      // scratch buffers; returns how many)
      const side = (dir: 1 | -1) => {
        let c = 0;
        let last = 0;
        for (let j = k + dir; j >= 0 && j < n && c < SU.length; j += dir) {
          const dx = pts[2 * j] - qx;
          const dy = pts[2 * j + 1] - qy;
          const u = (dx * tx + dy * ty) * dir;
          if (u <= last) break;
          SU[c] = u;
          SV[c] = -dx * ty + dy * tx;
          SH[c] = hw[j];
          c++;
          last = u;
          if (u > ALONG_MAX) break;
        }
        return c;
      };
      let dirSign = 1;
      // how far an arc of curvature `kappa` stays on the river: checked at its points, and between
      // them (the river is straight from one to the next) to where it strays
      const reachWith = (cnt: number, kappa: number) => {
        // (off its line and too wide add up at a bank)
        const ok = (u: number, v: number, h: number) => {
          const ku = kappa * u;
          return Math.abs(v - 0.5 * ku * u) / Math.sqrt(1 + ku * ku) + Math.max(0, h0 + slope * u * dirSign - h) <= tol;
        };
        let pu = 0;
        let pv = 0;
        let ph = h0;
        for (let i = 0; i < cnt; i++) {
          const u = SU[i];
          const v = SV[i];
          const h = SH[i];
          // up to the arc's longest, or this point: the first place on the way it strays
          const end = Math.min(1, (ALONG_MAX - pu) / (u - pu));
          if (!ok(pu + end * (u - pu), pv + end * (v - pv), ph + end * (h - ph))) {
            let lo = 0;
            let hi = end;
            for (let it = 0; it < 7; it++) {
              const mid = (lo + hi) / 2;
              if (ok(pu + mid * (u - pu), pv + mid * (v - pv), ph + mid * (h - ph))) lo = mid;
              else hi = mid;
            }
            return pu + lo * (u - pu);
          }
          if (end < 1) return ALONG_MAX;
          pu = u;
          pv = v;
          ph = h;
        }
        return pu;
      };
      // the curvature that keeps the arc on the river furthest: fitted over a few lengths
      const fit = (cnt: number): [number, number] => {
        let bestK = 0;
        let bestR = reachWith(cnt, 0);
        if (bestR >= ALONG_MAX) return [0, bestR];
        let num = 0;
        let den = 0;
        let i = 0;
        for (const U of [0.25, 0.5, 1]) {
          for (; i < cnt && SU[i] <= U; i++) {
            num += SV[i] * SU[i] * SU[i];
            den += SU[i] ** 4;
          }
          if (den <= 0) continue;
          // (as it will be kept)
          const kq = unpackDirKappa(packDirKappa(0, Math.max(-MAX_CURVATURE, Math.min(MAX_CURVATURE, (2 * num) / den))))[1];
          const r = reachWith(cnt, kq);
          if (r > bestR) {
            bestR = r;
            bestK = kq;
          }
          if (bestR >= ALONG_MAX) break;
        }
        return [bestK, bestR];
      };
      dirSign = 1;
      const [ka, ra] = fit(side(1));
      dirSign = -1;
      const [kb, rb] = fit(side(-1));
      pc = [qx, qy, ra, rb, packWidth(h0, ka), packDirKappa(Math.atan2(ty, tx), kb), sb];
      pieces.set(k, pc);
      return pc;
    };
    // first, per cell this river reaches, its nearest point for each piece of it (a river that goes
    // away and comes back, round a hairpin or a loop, nears a cell again as another piece); then
    // each cell keeps the two nearest pieces among those and what it held, of other rivers
    const blocks = new Map<number, Block>();
    const BW = Math.ceil(W / BS);
    // stamped every eighth of a cell or so: which point a cell keeps hardly matters, its arcs reach
    const stride = Math.max(1, Math.floor(0.12 / Math.max(1e-6, total / Math.max(1, n - 1))));
    for (let k = 0; ; k = Math.min(n - 1, k + stride)) {
      const qx = pts[2 * k];
      const qy = pts[2 * k + 1];
      const h = hw[k];
      const R = h + REACH;
      const x0 = Math.max(clip.x0, Math.floor(qx - R));
      const x1 = Math.min(clip.x1, Math.floor(qx + R));
      const y0 = Math.max(clip.y0, 0, Math.floor(qy - R));
      const y1 = Math.min(clip.y1, H - 1, Math.floor(qy + R));
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          // (inside a river counts as nearer still)
          const score = Math.hypot(qx - x - 0.5, qy - y - 0.5) - h;
          if (score > REACH) continue;
          let wx = x;
          if (g.wrap) wx = ((x % W) + W) % W;
          else if (x < 0 || x >= W) continue;
          const bk = Math.floor(y / BS) * BW + Math.floor(wx / BS);
          let bl = blocks.get(bk);
          if (!bl) blocks.set(bk, (bl = takeBlock()));
          const c = (y % BS) * BS + (wx % BS);
          if (!bl.seen[c]) {
            bl.seen[c] = 1;
            bl.cur[c] = 0;
            bl.min[c] = bl.max[c] = bl.bestS[c * PIECES] = score;
            bl.bestK[c * PIECES] = k;
            continue;
          }
          if (score < bl.min[c]) bl.min[c] = bl.max[c] = score;
          else if (score > bl.max[c]) bl.max[c] = score;
          else if (bl.max[c] - bl.min[c] > PIECE && score < bl.max[c] - PIECE && bl.cur[c] < PIECES - 1) {
            // gone away and coming back: another piece of the river
            const p = ++bl.cur[c];
            bl.min[c] = bl.max[c] = bl.bestS[c * PIECES + p] = score;
            bl.bestK[c * PIECES + p] = k;
            continue;
          }
          const i = c * PIECES + bl.cur[c];
          if (score < bl.bestS[i]) {
            bl.bestS[i] = score;
            bl.bestK[i] = k;
          }
        }
      if (k === n - 1) break;
    }
    // how near the bank of what a slot holds is
    const held = (t: Float32Array, o: number) => (t[o + 2] === 0 ? Infinity : Math.hypot(unpackOffset(t[o])[0], unpackOffset(t[o + 1])[0]) - unpackWidth(t[o + 2])[0]);
    const cands: { score: number; k: number }[] = [];
    for (const [bk, bl] of blocks) {
      const bx = (bk % BW) * BS;
      const by = Math.floor(bk / BW) * BS;
      for (let c = 0; c < BS * BS; c++) {
        if (!bl.seen[c]) continue;
        const wx = bx + (c % BS);
        const y = by + Math.floor(c / BS);
        const t = g.ensureTile((wx / TS) | 0, (y / TS) | 0);
        const o = ((y % TS) * TS + (wx % TS)) * C;
        // the two nearest of this river's pieces and what the slots hold
        cands.length = 0;
        cands.push({ score: held(t, o), k: -1 }, { score: held(t, o + 4), k: -2 });
        for (let p = 0; p <= bl.cur[c]; p++) cands.push({ score: bl.bestS[c * PIECES + p], k: bl.bestK[c * PIECES + p] });
        cands.sort((a, b) => a.score - b.score);
        const o0 = t[o], o1 = t[o + 1], o2 = t[o + 2], o3 = t[o + 3], o4 = t[o + 4], o5 = t[o + 5], o6 = t[o + 6], o7 = t[o + 7];
        for (let s = 0; s < 2; s++) {
          const ck = cands[s].k;
          if (ck === -1 || ck === -2) {
            const first = ck === -1;
            t[o + 4 * s] = first ? o0 : o4;
            t[o + 4 * s + 1] = first ? o1 : o5;
            t[o + 4 * s + 2] = first ? o2 : o6;
            t[o + 4 * s + 3] = first ? o3 : o7;
            continue;
          }
          const pc = pieceOf(ck);
          t[o + 4 * s] = packOffset(pc[0] - wx - 0.5, pc[2], pc[6] >> 3);
          t[o + 4 * s + 1] = packOffset(pc[1] - y - 0.5, pc[3], pc[6] & 7);
          t[o + 4 * s + 2] = pc[4];
          t[o + 4 * s + 3] = pc[5];
        }
      }
      giveBlock(bl);
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

/**
 * How far a point is from the nearest river's bank (world cells, negative inside), worked out from
 * the field as the terrain shader does it (shaders.ts, "rivers"): the same estimate per slot, the
 * same blending. For tests, and for anything that must agree with what is drawn.
 */
export function riverDistance(grid: TileGrid<Float32Array>, wx: number, wy: number, minHw = 0): number {
  const sds: number[] = [];
  const wts: number[] = [];
  const hws: number[] = [];
  let sd = 1e6;
  let rhw = 0;
  const rcx = Math.floor(wx);
  const rcy = Math.floor(wy);
  for (let k = 0; k < 9; k++) {
    const px = rcx + (k % 3) - 1;
    const py = rcy + Math.floor(k / 3) - 1;
    const cx = px + 0.5;
    const cy = py + 0.5;
    const r = Math.max(0, 1 - Math.max(Math.abs(wx - cx), Math.abs(wy - cy)) / 1.5);
    for (let s = 0; s < 2; s++) {
      const hz = grid.get(px, py, 4 * s + 2);
      if (hz === 0) continue;
      const [ox, ahead, sh] = unpackOffset(grid.get(px, py, 4 * s));
      const [oy, behind, sl] = unpackOffset(grid.get(px, py, 4 * s + 1));
      const [hw0, kappa] = unpackWidth(hz);
      const [ang, kappaB] = unpackDirKappa(grid.get(px, py, 4 * s + 3));
      const d = riverSlotDistance(wx - cx - ox, wy - cy - oy, ahead, behind, hw0, slopeOf(sh * 8 + sl) * hw0, kappa, kappaB, ang, minHw);
      sds.push(d);
      wts.push(r * r);
      hws.push(hw0);
      if (d < sd) {
        sd = d;
        rhw = hw0;
      }
    }
  }
  // estimates near the nearest are blended (over about the arcs' tolerance, so where two arcs meet
  // there is no step), the others left out; an average of estimates no nearer than the nearest, it
  // never adds water
  let acc = 0;
  let wsum = 0;
  for (let i = 0; i < sds.length; i++) {
    const fade = Math.max(0.003, Math.min(0.05, 0.1 * Math.min(rhw, hws[i])));
    const wk = wts[i] * Math.exp(-Math.max(0, sds[i] - sd) / fade);
    acc += Math.min(sds[i], sd + 8 * fade) * wk;
    wsum += wk;
  }
  return wsum > 1e-5 ? acc / wsum : sd;
}

/**
 * One cell's estimate: the distance from (dx, dy) (from its point) to the bank of its arcs. The
 * nearest point of the arcs is found by a few Newton steps from straight across, kept within their
 * reach (beyond it: their ends, rounded); the distance is to that point, which lies on the river.
 */
export function riverSlotDistance(dx: number, dy: number, ahead: number, behind: number, hw0: number, slope: number, kappaA: number, kappaB: number, ang: number, minHw: number): number {
  const tx = Math.cos(ang);
  const ty = Math.sin(ang);
  // in the arcs' frame: along them, and across (to the left)
  const x = dx * tx + dy * ty;
  const y = -dx * ty + dy * tx;
  let u = Math.max(-behind, Math.min(ahead, x));
  for (let i = 0; i < 3; i++) {
    const k = u >= 0 ? kappaA : kappaB;
    const e = 0.5 * k * u * u - y;
    const g = u - x + e * k * u;
    const h = 1 + k * k * u * u + e * k;
    u = Math.max(-behind, Math.min(ahead, u - g / Math.max(h, 0.3)));
  }
  const k = u >= 0 ? kappaA : kappaB;
  return Math.hypot(x - u, y - 0.5 * k * u * u) - Math.max(hw0 + slope * u, minHw);
}
