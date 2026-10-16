/*
 * Mountains from uplift and erosion.
 *
 * Real mountains are not bumps: the crust is pushed up broadly and smoothly, and
 * rivers carve that uplift into the ridges and branching valleys we see. A river
 * cuts down faster the more water it carries and the steeper its bed (the stream
 * power law, E = K·A^m·S^n, A the area it drains, S its slope). Where uplift and
 * erosion balance, the land settles into a steady state: steep, narrow
 * headwaters, gentle trunk valleys, and sharp ridges along the divides between
 * drainage basins.
 *
 * This solves that balance on a window of the map with the implicit scheme of
 * Braun & Willett (2013, "FastScape"), which is stable for any time step and
 * linear in the number of cells per step:
 *
 * 1. A priority flood from the window's outlets (cells without uplift) gives
 *    every cell its receiver, the neighbour its water flows to, and an order
 *    from the outlets upstream. Pits are flooded on the way, so all water
 *    reaches an outlet.
 * 2. Drainage area accumulates from the sources down that order.
 * 3. Heights update from the outlets up, each cell implicitly against its
 *    already-updated receiver:
 *      z ← (z + dt·U + F·z_receiver) / (1 + F),  F = K·dt·A^m / distance.
 *
 * With n = 1 the steady state is proportional to U/K, so the solution is
 * computed without units and scaled at the end to the highest summit asked
 * for. Hillslopes are then kept below a threshold angle, as in real ranges,
 * where slopes steeper than about 30–40° give way in landslides.
 */

/** Concavity of river profiles (m/n in the stream power law). */
const M = 0.45;
/** Steepest hillslope, as rise over run (about 35°). */
const MAX_SLOPE = 0.7;
/**
 * Time step (without units). The scheme is stable for any step; this one lets the cuts from the
 * outlets reach the divides within the default number of steps.
 */
const DT = 5;
/**
 * Hillslope creep per step, in passes of a gentle diffusion. It rounds the hills between channels
 * and sets the closest spacing of valleys (several cells), instead of a channel in every cell.
 */
const CREEP = 4;

export interface UpliftInput {
  /** Window size in cells. */
  w: number;
  h: number;
  /** How strongly each cell is pushed up, 0 … 1 (0 = an outlet at the window's base level). */
  uplift: Float32Array;
  /** Ground size of a cell, km (cells are square). */
  cellKm: number;
  /** Seed for the slight initial roughness that decides where the first channels run. */
  seed?: number;
  /** Time steps; the drainage pattern settles within several dozen. */
  steps?: number;
  /** Height of the highest summit above the window's outlets, metres. */
  peakM: number;
  /** Passes of hillslope creep per step (see CREEP). */
  creep?: number;
  /**
   * How easily each cell's rock erodes, around 1 (optional). Patches of harder and softer rock
   * keep valleys from being evenly spaced: rivers cut faster through soft rock and capture
   * their neighbours.
   */
  erodibility?: Float32Array;
  /** Initial roughness, as a fraction of the uplift (decides where the first channels run). */
  roughness?: number;
  /**
   * The window's place on the map (world cell of its origin, world cells per window cell), so
   * the initial roughness belongs to the ground and not to the window: the same range carves
   * the same way when its window grows or shifts.
   */
  origin?: [number, number, number];
  /** Initial heights (without units), instead of the seeded roughness. */
  initial?: Float32Array;
  /** Return the relief without units and before slopes give way (to measure it, not to keep it). */
  raw?: boolean;
}

/** Relief carved from the uplift, metres above the outlets; cells without uplift stay at 0. */
export function upliftRelief(input: UpliftInput): Float32Array {
  const { w, h, uplift, cellKm } = input;
  const n = w * h;
  const steps = input.steps ?? 50;
  const creep = input.creep ?? CREEP;
  // double precision: pits are filled by a hair above their outlet, finer than a float's step
  const z = new Float64Array(n);
  // a little roughness, so the first channels pick their own ways instead of the grid's axes
  const seed = (input.seed ?? 1) | 0;
  const [ox, oy, sc] = input.origin ?? [0, 0, 1];
  const rough = input.roughness ?? 1e-3;
  for (let i = 0; i < n; i++) {
    if (uplift[i] <= 0) continue;
    if (input.initial) {
      z[i] = input.initial[i];
      continue;
    }
    z[i] = uplift[i] * rough * cellNoise(Math.round(ox + (i % w) * sc), Math.round(oy + Math.floor(i / w) * sc), seed);
  }

  const rec = new Int32Array(n);
  const order = new Int32Array(n);
  const area = new Float32Array(n);
  const dist = new Float32Array(n);
  const heap = new MinHeap(n);
  const seen = new Uint8Array(n);
  const tmp = new Float64Array(n);
  // the window's rim drains out of it, like the cells without uplift
  const seenRim = new Uint8Array(n);
  for (let x = 0; x < w; x++) seenRim[x] = seenRim[(h - 1) * w + x] = 1;
  for (let y = 0; y < h; y++) seenRim[y * w] = seenRim[y * w + w - 1] = 1;
  const DX = [1, -1, 0, 0, 1, 1, -1, -1];
  const DY = [0, 0, 1, -1, 1, -1, 1, -1];
  const DD = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];

  // Nondimensional erodibility and time step: a step lets a channel of the size of the window
  // cut through about as much as the uplift adds, so the pattern settles in tens of steps.
  const K = 1;
  const erod = input.erodibility;
  const dt = DT;

  for (let step = 0; step < steps; step++) {
    // 1. receivers and order: flood from the outlets (no uplift, or the window's rim)
    seen.fill(0);
    let count = 0;
    for (let i = 0; i < n; i++) {
      const x = i % w;
      const y = (i / w) | 0;
      if (uplift[i] <= 0 || x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        seen[i] = 1;
        rec[i] = i;
        dist[i] = 1;
        heap.push(i, z[i]);
      }
    }
    while (heap.size) {
      const c = heap.pop();
      order[count++] = c;
      const cx = c % w;
      const cy = (c / w) | 0;
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k];
        const ny = cy + DY[k];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nb = ny * w + nx;
        if (seen[nb]) continue;
        seen[nb] = 1;
        rec[nb] = c;
        dist[nb] = DD[k];
        // a pit fills up to its outlet (plus a hair), so water always finds its way out
        if (z[nb] <= z[c]) z[nb] = z[c] + 1e-7;
        heap.push(nb, z[nb]);
      }
    }
    // Water takes the steepest way down to a strictly lower neighbour, which keeps channels from
    // following the flood's order; on flats it keeps the flood's way. Neither can make a loop: a
    // loop would have to come back up, and the flood's ways form a tree.
    for (let o = 0; o < count; o++) {
      const c = order[o];
      if (rec[c] === c) continue;
      const cx = c % w;
      const cy = (c / w) | 0;
      let best = Math.max(0, (z[c] - z[rec[c]]) / dist[c]);
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k];
        const ny = cy + DY[k];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nb = ny * w + nx;
        const sl = (z[c] - z[nb]) / DD[k];
        if (sl > best && z[nb] < z[c]) {
          best = sl;
          rec[c] = nb;
          dist[c] = DD[k];
        }
      }
    }
    // every receiver before its donors
    topoOrder(order, rec, n);

    // 2. drainage area, from the sources down
    for (let i = 0; i < n; i++) area[i] = 1;
    for (let o = n - 1; o >= 0; o--) {
      const c = order[o];
      const r = rec[c];
      if (r !== c) area[r] += area[c];
    }

    // 3. uplift and implicit stream power erosion, from the outlets up
    for (let o = 0; o < n; o++) {
      const c = order[o];
      const r = rec[c];
      if (r === c) continue;
      const F = (K * (erod ? erod[c] : 1) * dt * Math.pow(area[c], M)) / dist[c];
      z[c] = (z[c] + dt * uplift[c] + F * z[r]) / (1 + F);
    }

    // 4. hillslope creep: soil slowly moves downslope, rounding the hills between channels and
    // setting how closely valleys can sit (Perron et al. 2009); outlets keep their level
    for (let it = 0; it < creep; it++) {
      for (let y = 1; y < h - 1; y++)
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          tmp[i] = z[i] + 0.2 * (z[i - 1] + z[i + 1] + z[i - w] + z[i + w] - 4 * z[i]);
        }
      for (let i = 0; i < n; i++) if (uplift[i] > 0 && seenRim[i] === 0) z[i] = tmp[i];
    }
  }

  // scale to the summit, then let slopes steeper than the threshold give way: from the outlets
  // up, each cell settles against its already-settled receiver
  if (input.raw) return Float32Array.from(z);
  let top = 0;
  for (let i = 0; i < n; i++) top = Math.max(top, z[i]);
  const out = new Float32Array(n);
  if (top <= 0) return out;
  const peak = input.peakM;
  const cellM = cellKm * 1000;
  // Slopes steeper than the threshold give way, along the way water runs: from the outlets up,
  // each cell settles against its already-settled receiver. (Limiting every pair of neighbours
  // instead cuts the land into flat, eight-sided facets.)
  for (let o = 0; o < n; o++) {
    const c = order[o];
    const r = rec[c];
    const v = (z[c] / top) * peak;
    out[c] = r === c ? v : Math.min(v, out[r] + MAX_SLOPE * dist[c] * cellM);
  }
  return out;
}

/** A value in [0, 1) that belongs to a cell of the map (and a seed). */
export function cellNoise(x: number, y: number, seed: number): number {
  let k = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed | 0, 1442695041);
  k = Math.imul(k ^ (k >>> 13), 1274126177);
  k ^= k >>> 16;
  return (k >>> 0) / 4294967296;
}

/** Fill `order` with all cells, every receiver before its donors (breadth-first from the outlets). */
function topoOrder(order: Int32Array, rec: Int32Array, n: number) {
  // count donors, then walk from the outlets
  const donors = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) if (rec[i] !== i) donors[rec[i] + 1]++;
  for (let i = 0; i < n; i++) donors[i + 1] += donors[i];
  const list = new Int32Array(n);
  const fill = donors.slice(0, n);
  for (let i = 0; i < n; i++) if (rec[i] !== i) list[fill[rec[i]]++] = i;
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i++) if (rec[i] === i) order[tail++] = i;
  while (head < tail) {
    const c = order[head++];
    for (let k = donors[c]; k < donors[c + 1]; k++) order[tail++] = list[k];
  }
}

/** Binary min-heap of cell indices keyed by height. */
class MinHeap {
  private idx: Int32Array;
  private key: Float32Array;
  size = 0;
  constructor(n: number) {
    this.idx = new Int32Array(n);
    this.key = new Float32Array(n);
  }
  push(i: number, k: number) {
    let p = this.size++;
    const idx = this.idx;
    const key = this.key;
    while (p > 0) {
      const q = (p - 1) >> 1;
      if (key[q] <= k) break;
      idx[p] = idx[q];
      key[p] = key[q];
      p = q;
    }
    idx[p] = i;
    key[p] = k;
  }
  pop(): number {
    const idx = this.idx;
    const key = this.key;
    const top = idx[0];
    const n = --this.size;
    if (n === 0) return top;
    const li = idx[n];
    const lk = key[n];
    let p = 0;
    for (;;) {
      let c = 2 * p + 1;
      if (c >= n) break;
      if (c + 1 < n && key[c + 1] < key[c]) c++;
      if (key[c] >= lk) break;
      idx[p] = idx[c];
      key[p] = key[c];
      p = c;
    }
    idx[p] = li;
    key[p] = lk;
    return top;
  }
}

