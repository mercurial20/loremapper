/*
 * Fine relief from real land. The library (scripts/build-relief-library.mjs) holds patches of
 * real relief detail (the land less a smooth version of itself) of three kinds of land, at two
 * sizes of cell. Laid over a map's broad land, they give it the valleys, spurs, cirques and
 * scarps of real ground instead of anything a formula would draw:
 *
 * - the map is covered by patches laid on a jittered lattice, overlapping by half;
 * - each patch is of the kind of land where it lies (high relief: young ranges; high and level:
 *   tablelands; the rest: hills and old ranges), one of many, mirrored at random and turned so that
 *   the way its own land fell runs the way the map's land falls (gullies run downhill);
 * - its detail is as strong, next to the map's broad relief around it, as it was next to its own;
 * - patches blend with weights that keep the detail's strength where they overlap.
 *
 * It depends only on the map's broad land and the seed: the same at every resolution.
 */

export type ReliefKind = 'alpine' | 'hills' | 'plateau';

export interface ReliefPatch {
  kind: ReliefKind;
  scale: number;
  name: string;
  /** Strength of the detail, m (standard deviation). */
  std: number;
  /** Strength of the broad relief the detail sat on, m. */
  relief: number;
  /** Mean height, m. */
  height: number;
  /** Which way the broad land fell over the patch, radians (x right, y down). */
  downhill: number;
  data: Int8Array;
  /** The detail at half, a quarter … of the resolution (averaged), for grids coarser than the patch. */
  mips: Float32Array[];
}

export interface ReliefLibrary {
  size: number;
  unit: number;
  /** Cell of each scale, metres. */
  scales: number[];
  patches: ReliefPatch[];
  /** The patches of each scale and kind. */
  byKind: Map<string, ReliefPatch[]>;
}

/** Read the library file. */
export function parseReliefLibrary(buf: ArrayBuffer): ReliefLibrary {
  const dv = new DataView(buf);
  const len = dv.getUint32(0, true);
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, len))) as Omit<ReliefLibrary, 'byKind' | 'patches'> & { patches: Omit<ReliefPatch, 'data'>[] };
  const n = meta.size * meta.size;
  let o = 4 + len;
  const patches = meta.patches.map((p) => {
    const data = new Int8Array(buf.slice(o, o + n));
    o += n;
    // averaged copies: 64², 32², … 4²
    const mips: Float32Array[] = [];
    let src = Float32Array.from(data);
    for (let S = meta.size; S >= 8; S >>= 1) {
      const H = S >> 1;
      const m = new Float32Array(H * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < H; x++) m[y * H + x] = (src[2 * y * S + 2 * x] + src[2 * y * S + 2 * x + 1] + src[(2 * y + 1) * S + 2 * x] + src[(2 * y + 1) * S + 2 * x + 1]) / 4;
      mips.push(m);
      src = m;
    }
    return { ...p, data, mips };
  });
  const byKind = new Map<string, ReliefPatch[]>();
  for (const p of patches) {
    const k = `${p.scale}:${p.kind}`;
    const list = byKind.get(k);
    if (list) list.push(p);
    else byKind.set(k, [p]);
  }
  return { size: meta.size, unit: meta.unit, scales: meta.scales, patches, byKind };
}

let library: ReliefLibrary | null = null;

/** The library the generator uses (loaded once, where the generator runs). */
export const setReliefLibrary = (lib: ReliefLibrary | null) => (library = lib);
export const reliefLibrary = () => library;

/** A pseudo-random number in [0, 1) for a lattice point, a seed and a stream. */
function hash(i: number, j: number, seed: number, k: number): number {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(seed, 2246822519) ^ Math.imul(k, 3266489917);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export interface DetailInput {
  /** Grid size, cells. */
  w: number;
  h: number;
  /** Ground size of a cell, metres. */
  cellM: number;
  /** World position of the grid's origin, in its own cells (so the pattern belongs to the map). */
  ox: number;
  oy: number;
  /** The broad land, metres above sea level (sea: ≤ 0). */
  base: Float32Array;
  seed: number;
  /** Which scales of the library to use (indices); by default every scale the grid can hold. */
  scales?: number[];
}

/** Box blur in place (radius r), rows then columns, `passes` times. */
function boxBlur(a: Float32Array, w: number, h: number, r: number, passes: number) {
  const line = new Float32Array(Math.max(w, h));
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < h; j++) {
      let s = 0;
      for (let i = -r; i <= r; i++) s += a[j * w + Math.min(w - 1, Math.max(0, i))];
      for (let i = 0; i < w; i++) {
        line[i] = s / (2 * r + 1);
        s += a[j * w + Math.min(w - 1, i + r + 1)] - a[j * w + Math.max(0, i - r)];
      }
      a.set(line.subarray(0, w), j * w);
    }
    for (let i = 0; i < w; i++) {
      let s = 0;
      for (let j = -r; j <= r; j++) s += a[Math.min(h - 1, Math.max(0, j)) * w + i];
      for (let j = 0; j < h; j++) {
        line[j] = s / (2 * r + 1);
        s += a[Math.min(h - 1, j + r + 1) * w + i] - a[Math.max(0, j - r) * w + i];
      }
      for (let j = 0; j < h; j++) a[j * w + i] = line[j];
    }
  }
}

/**
 * The scales of the library that add what a grid of `cellM` metres lacks: patches at least 8
 * cells across, of cells no coarser than the grid's (coarser detail the grid's own land already
 * holds: laid over it, it would blur its ranges into lumps).
 */
export function usableScales(lib: ReliefLibrary, cellM: number): number[] {
  return lib.scales
    .map((c, i) => [c, i] as const)
    .filter(([c]) => lib.size * c >= 8 * cellM && c <= cellM * 1.5)
    .map(([, i]) => i);
}

/** The relief detail over a grid, metres (0 at sea). */
export function reliefDetail(lib: ReliefLibrary, inp: DetailInput): Float32Array {
  const { w, h, cellM, base } = inp;
  const N = w * h;
  const out = new Float32Array(N);
  const scales = inp.scales ?? usableScales(lib, cellM);
  for (const s of scales) {
    const pc = lib.scales[s];
    // a patch's side and the lattice spacing, in grid cells
    const side = (lib.size * pc) / cellM;
    const spacing = side / 2;
    // the broad land around, over about a patch: its height, its relief, which way it falls
    const r = Math.max(1, Math.round(side / 4));
    const mean = Float32Array.from(base, (v) => Math.max(0, v));
    const sq = Float32Array.from(mean, (v) => v * v);
    boxBlur(mean, w, h, r, 2);
    boxBlur(sq, w, h, r, 2);
    const sumWV = new Float32Array(N);
    const sumW2 = new Float32Array(N);
    const n0 = Math.floor(inp.ox / spacing) - 1;
    const m0 = Math.floor(inp.oy / spacing) - 1;
    const n1 = Math.ceil((inp.ox + w) / spacing) + 1;
    const m1 = Math.ceil((inp.oy + h) / spacing) + 1;
    const half = side / 2;
    const S = lib.size;
    for (let m = m0; m <= m1; m++)
      for (let n = n0; n <= n1; n++) {
        // the patch's middle (jittered), in the grid
        const cx = (n + 0.5 + (hash(n, m, inp.seed, 1) - 0.5) * 0.6) * spacing - inp.ox;
        const cy = (m + 0.5 + (hash(n, m, inp.seed, 2) - 0.5) * 0.6) * spacing - inp.oy;
        if (cx < -half || cy < -half || cx > w + half || cy > h + half) continue;
        const ci = Math.min(w - 1, Math.max(0, Math.round(cx)));
        const cj = Math.min(h - 1, Math.max(0, Math.round(cy)));
        const k = cj * w + ci;
        if (mean[k] <= 0) continue;
        const e = mean[k];
        const relief = Math.sqrt(Math.max(0, sq[k] - mean[k] * mean[k]));
        // the kind of land here
        const alpine = smooth(700, 2200, e) * smooth(120, 450, relief);
        const plateau = smooth(400, 1400, e) * (1 - smooth(60, 220, relief)) * (1 - alpine);
        const u = hash(n, m, inp.seed, 3);
        const kind: ReliefKind = u < alpine ? 'alpine' : u < alpine + plateau ? 'plateau' : 'hills';
        const list = lib.byKind.get(`${s}:${kind}`) ?? lib.byKind.get(`${s}:hills`);
        if (!list?.length) continue;
        const p = list[Math.floor(hash(n, m, inp.seed, 4) * list.length)];
        // the way the land falls here (over half a patch), and the patch turned to fall that way
        const gx = sample(base, w, h, cx + side / 4, cy) - sample(base, w, h, cx - side / 4, cy);
        const gy = sample(base, w, h, cx, cy + side / 4) - sample(base, w, h, cx, cy - side / 4);
        const mirror = hash(n, m, inp.seed, 5) < 0.5;
        const own = mirror ? -p.downhill : p.downhill;
        const falls = Math.hypot(gx, gy) > 1e-3 ? Math.atan2(-gy, -gx) : hash(n, m, inp.seed, 6) * Math.PI * 2;
        const ang = falls - own + (hash(n, m, inp.seed, 7) - 0.5) * 0.6;
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        // as strong, next to the broad relief here, as it was next to its own (within reason)
        const ratio = Math.min(1.2, Math.max(0.08, p.std / Math.max(p.relief, 30)));
        const amp = ((ratio * Math.max(relief, 15)) / lib.unit) * 1;
        const i0 = Math.max(0, Math.floor(cx - half));
        const i1 = Math.min(w - 1, Math.ceil(cx + half));
        const j0 = Math.max(0, Math.floor(cy - half));
        const j1 = Math.min(h - 1, Math.ceil(cy + half));
        const toPatch = S / side;
        // a grid coarser than the patch reads its averaged copy (no shimmer of finer detail)
        const level = Math.min(p.mips.length, Math.max(0, Math.floor(Math.log2(toPatch))));
        const src: ArrayLike<number> = level === 0 ? p.data : p.mips[level - 1];
        const LS = S >> level;
        const lf = LS / S;
        for (let j = j0; j <= j1; j++)
          for (let i = i0; i <= i1; i++) {
            const dx = i + 0.5 - cx;
            const dy = j + 0.5 - cy;
            const d = Math.hypot(dx, dy) / half;
            if (d >= 1) continue;
            // into the patch's own frame (turned back, mirrored), in its cells
            let px = (dx * ca + dy * sa) * toPatch;
            const py = (-dx * sa + dy * ca) * toPatch;
            if (mirror) px = -px;
            const v = patchAt(src, LS, (px + S / 2) * lf - 0.5, (py + S / 2) * lf - 0.5);
            const c = Math.cos(d * Math.PI * 0.5);
            const wt = c * c;
            const o = j * w + i;
            sumWV[o] += wt * v * amp;
            sumW2[o] += wt * wt;
          }
      }
    for (let k = 0; k < N; k++) if (sumW2[k] > 0 && base[k] > 0) out[k] += sumWV[k] / Math.sqrt(sumW2[k]);
  }
  return out;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Bilinear sample of a grid at (x, y) cells (cell centres at i + 0.5). */
function sample(a: Float32Array, w: number, h: number, x: number, y: number): number {
  const fx = Math.min(w - 1, Math.max(0, x - 0.5));
  const fy = Math.min(h - 1, Math.max(0, y - 0.5));
  const i = Math.min(w - 2, Math.floor(fx));
  const j = Math.min(h - 2, Math.floor(fy));
  if (i < 0 || j < 0) return a[0];
  const tx = fx - i;
  const ty = fy - j;
  return (a[j * w + i] * (1 - tx) + a[j * w + i + 1] * tx) * (1 - ty) + (a[(j + 1) * w + i] * (1 - tx) + a[(j + 1) * w + i + 1] * tx) * ty;
}

/** Bilinear sample of a patch (clamped at its edges). */
function patchAt(d: ArrayLike<number>, S: number, x: number, y: number): number {
  const fx = Math.min(S - 1.001, Math.max(0, x));
  const fy = Math.min(S - 1.001, Math.max(0, y));
  const i = Math.floor(fx);
  const j = Math.floor(fy);
  const tx = fx - i;
  const ty = fy - j;
  return (d[j * S + i] * (1 - tx) + d[j * S + i + 1] * tx) * (1 - ty) + (d[(j + 1) * S + i] * (1 - tx) + d[(j + 1) * S + i + 1] * tx) * ty;
}
