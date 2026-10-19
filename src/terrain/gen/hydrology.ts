import { cellAreaKm2, dxKm, dyKm, type Grid } from './grid';

/** Binary min-heap of cell indices keyed by height. */
class Heap {
  private idx: Int32Array;
  private key: Float64Array;
  size = 0;
  constructor(cap: number) {
    this.idx = new Int32Array(cap);
    this.key = new Float64Array(cap);
  }
  push(i: number, k: number) {
    let n = this.size++;
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (this.key[p] <= k) break;
      this.idx[n] = this.idx[p];
      this.key[n] = this.key[p];
      n = p;
    }
    this.idx[n] = i;
    this.key[n] = k;
  }
  pop(): number {
    const top = this.idx[0];
    const li = this.idx[--this.size];
    const lk = this.key[this.size];
    let n = 0;
    for (;;) {
      let c = 2 * n + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && this.key[c + 1] < this.key[c]) c++;
      if (this.key[c] >= lk) break;
      this.idx[n] = this.idx[c];
      this.key[n] = this.key[c];
      n = c;
    }
    this.idx[n] = li;
    this.key[n] = lk;
    return top;
  }
}

/** Scratch buffers for drain(), reused across erosion iterations on big grids. */
export class DrainWork {
  rcv: Int32Array;
  order: Int32Array;
  closed: Uint8Array;
  heap: Heap;
  pit: Int32Array;
  A: Float32Array;
  readonly N: number;
  constructor(N: number) {
    this.N = N;
    this.rcv = new Int32Array(N);
    this.order = new Int32Array(N);
    this.closed = new Uint8Array(N);
    this.heap = new Heap(N);
    this.pit = new Int32Array(N);
    this.A = new Float32Array(N);
  }
}

/** Deterministic pseudo-random value in [0, 1) for a cell index. */
function cellJitter(k: number): number {
  let x = Math.imul(k ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

export interface Drainage {
  /** downstream neighbour of every land cell; -1 for sea and outlets */
  rcv: Int32Array;
  /** land cells, every cell listed after its receiver (outlets first) */
  order: Int32Array;
  count: number;
}

/**
 * Priority-Flood (Barnes et al. 2014) from the coast inwards. Every land cell
 * gets a receiver that leads to the sea, even out of closed basins. With
 * `fill`, basins are filled to their spill level with a tiny gradient, which
 * turns them into flat alluvial plains.
 */
export function drain(g: Grid, h: Float32Array, fill: boolean, work?: DrainWork): Drainage {
  const { w, h: gh } = g;
  const N = w * gh;
  const ws = work ?? new DrainWork(N);
  const { rcv, order, closed, heap, pit } = ws;
  rcv.fill(-1);
  closed.fill(0);
  heap.size = 0;
  let pitHead = 0;
  let pitTail = 0;
  let count = 0;
  for (let k = 0; k < N; k++) {
    if (h[k] <= 0) closed[k] = 1;
  }
  // seeds: sea cells next to land, and land on the edge of a regional grid
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      const edge = !g.wrap && (i === 0 || j === 0 || i === w - 1 || j === gh - 1);
      if (h[k] > 0 && !edge) continue;
      if (h[k] > 0) {
        closed[k] = 1;
        heap.push(k, h[k]);
        continue;
      }
      let coast = false;
      for (let dj = -1; dj <= 1 && !coast; dj++)
        for (let di = -1; di <= 1; di++) {
          const jj = j + dj;
          let ii = i + di;
          if (jj < 0 || jj >= gh) continue;
          if (ii < 0 || ii >= w) {
            if (!g.wrap) continue;
            ii = (ii + w) % w;
          }
          if (h[jj * w + ii] > 0) {
            coast = true;
            break;
          }
        }
      if (coast) heap.push(k, h[k]);
    }
  }
  const eps = 0.02;
  while (heap.size > 0 || pitHead < pitTail) {
    const c = pitHead < pitTail ? pit[pitHead++] : heap.pop();
    const j = (c / w) | 0;
    const i = c - j * w;
    for (let dj = -1; dj <= 1; dj++) {
      const jj = j + dj;
      if (jj < 0 || jj >= gh) continue;
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        let ii = i + di;
        if (ii < 0 || ii >= w) {
          if (!g.wrap) continue;
          ii = (ii + w) % w;
        }
        const n = jj * w + ii;
        if (closed[n]) continue;
        closed[n] = 1;
        rcv[n] = h[c] > 0 || h[n] > 0 ? c : -1;
        order[count++] = n;
        if (h[n] <= h[c] + eps) {
          if (fill) {
            // a slightly uneven fill, so drainage across the flats meanders instead of running in straight lines
            h[n] = h[c] + eps * (0.2 + cellJitter(n));
            heap.push(n, h[n]);
          } else pit[pitTail++] = n;
        } else heap.push(n, h[n]);
      }
    }
  }
  return { rcv, order, count };
}

/** Upstream area in km², weighted by local rainfall. */
export function accumulate(g: Grid, d: Drainage, rain: Float32Array | null, out?: Float32Array): Float32Array {
  const A = out ?? new Float32Array(g.w * g.h);
  A.fill(0);
  for (let n = 0; n < d.count; n++) {
    const k = d.order[n];
    A[k] = cellAreaKm2(g, (k / g.w) | 0) * (rain ? rain[k] : 1);
  }
  for (let n = d.count - 1; n >= 0; n--) {
    const k = d.order[n];
    const r = d.rcv[k];
    if (r >= 0) A[r] += A[k];
  }
  return A;
}

function stepKm(g: Grid, a: number, b: number): number {
  const ja = (a / g.w) | 0;
  const jb = (b / g.w) | 0;
  const di = Math.abs((a % g.w) - (b % g.w));
  const dx = di === 0 ? 0 : dxKm(g, ja);
  return ja === jb ? dx : Math.hypot(dx, dyKm(g, ja));
}

/**
 * Fluvial erosion with the implicit stream-power solver of Braun & Willett
 * (2013): every iteration lowers each cell towards its receiver in proportion
 * to √(upstream area) / distance. Big rivers cut deep valleys; ridges stay.
 */
export function erode(g: Grid, h: Float32Array, rain: Float32Array | null, iterations: number, K: number, onIter?: (i: number) => void) {
  const N = g.w * g.h;
  const work = h.slice();
  const ws = new DrainWork(N);
  for (let it = 0; it < iterations; it++) {
    const d = drain(g, work, false, ws);
    const A = accumulate(g, d, rain, ws.A);
    for (let n = 0; n < d.count; n++) {
      const k = d.order[n];
      const r = d.rcv[k];
      if (r < 0 || work[k] <= work[r]) continue;
      const F = (K * Math.sqrt(A[k])) / stepKm(g, k, r);
      work[k] = (work[k] + F * work[r]) / (1 + F);
    }
    onIter?.(it);
  }
  for (let k = 0; k < N; k++) if (h[k] > 0) h[k] = Math.max(2, work[k]);
}

/**
 * Relief in equilibrium between uplift and river incision: the steady state
 * of the stream-power law (Cordonnier et al. 2016; Tzathas et al. 2024). With
 * n = 1, every reach climbs from its receiver by S = U · A^(−θ) (Flint's law),
 * so big rivers run nearly flat and the land between them rises into ridges
 * where uplift is high. `uplift` is the channel steepness in m/km at 1 km² of
 * upstream area (A in km², rain-weighted when `rain` is given). Flow is routed
 * over `h`, then again over the result, `passes` times, so the river network
 * adapts to the relief it creates. Returns metres above the coast.
 */
export function steadyState(
  g: Grid,
  h: Float32Array,
  uplift: Float32Array,
  rain: Float32Array | null,
  o: { theta: number; maxSlope: number; passes: number },
  onPass?: (i: number) => void,
): Float32Array {
  const N = g.w * g.h;
  const ws = new DrainWork(N);
  const out = new Float32Array(N);
  // routing surface: jittered a little so flow over even ground wanders
  // instead of running in the grid's eight straight directions
  const route = new Float32Array(N);
  const jitter = (src: Float32Array, seed: number) => {
    for (let k = 0; k < N; k++) route[k] = src[k] > 0 ? src[k] * (1 + 0.04 * (cellJitter(k * 7 + seed) - 0.5)) + 6 * cellJitter(k + seed * 977) + 1e-3 : h[k];
  };
  jitter(h, 0);
  for (let pass = 0; pass < o.passes; pass++) {
    const d = drain(g, route, true, ws);
    const A = accumulate(g, d, rain, ws.A);
    out.fill(0);
    for (let n = 0; n < d.count; n++) {
      const k = d.order[n];
      if (h[k] <= 0) continue;
      const r = d.rcv[k];
      const base = r >= 0 && h[r] > 0 ? out[r] : 0;
      // hillslopes steeper than about 35° fail in landslides, whatever the uplift
      const slope = Math.min(o.maxSlope, uplift[k] * Math.pow(Math.max(A[k], 1e-3), -o.theta));
      out[k] = base + slope * (r >= 0 ? stepKm(g, k, r) : dyKm(g, (k / g.w) | 0));
    }
    onPass?.(pass);
    // the next pass routes over this relief (sea stays sea)
    if (pass + 1 < o.passes) jitter(out, pass + 1);
  }
  return out;
}

/** Gentle hillslope diffusion on land (softens knife-edge noise between valleys). */
export function diffuse(g: Grid, h: Float32Array, passes: number, rate = 0.18) {
  const { w } = g;
  const tmp = new Float32Array(h.length);
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < g.h; j++)
      for (let i = 0; i < w; i++) {
        const k = j * w + i;
        if (h[k] <= 0) {
          tmp[k] = h[k];
          continue;
        }
        const l = g.wrap ? j * w + ((i - 1 + w) % w) : j * w + Math.max(0, i - 1);
        const r = g.wrap ? j * w + ((i + 1) % w) : j * w + Math.min(w - 1, i + 1);
        const u = Math.max(0, j - 1) * w + i;
        const d = Math.min(g.h - 1, j + 1) * w + i;
        const avg = (h[l] + h[r] + h[u] + h[d]) / 4;
        tmp[k] = Math.max(2, h[k] + rate * (avg - h[k]));
      }
    h.set(tmp);
  }
}

export interface River {
  /** source → mouth, world cells, x unwrapped (continuous across the antimeridian) */
  points: [number, number][];
  /** upstream area at the mouth / junction, km² (rain-weighted) */
  area: number;
}

/**
 * Trace up to `max` rivers: the biggest basins first (main stem followed
 * upstream along the largest tributary), then their largest side branches,
 * each ending where it joins its parent.
 */
export function traceRivers(g: Grid, d: Drainage, A: Float32Array, h: Float32Array, max: number, minArea: number): River[] {
  if (max <= 0) return [];
  const { w } = g;
  const N = w * g.h;
  // children lists
  const head = new Int32Array(N).fill(-1);
  const next = new Int32Array(N).fill(-1);
  for (let n = 0; n < d.count; n++) {
    const k = d.order[n];
    const r = d.rcv[k];
    if (r >= 0) {
      next[k] = head[r];
      head[r] = k;
    }
  }
  const used = new Uint8Array(N);
  // candidates: [area, start cell, junction cell or -1]
  const cand: [number, number, number][] = [];
  for (let n = 0; n < d.count; n++) {
    const k = d.order[n];
    if (h[k] > 0 && (d.rcv[k] < 0 || h[d.rcv[k]] <= 0) && A[k] >= minArea) cand.push([A[k], k, d.rcv[k]]);
  }
  const rivers: River[] = [];
  const world = (k: number): [number, number] => {
    const j = (k / w) | 0;
    return [g.x0 + (k - j * w + 0.5) * g.step, g.y0 + (j + 0.5) * g.step];
  };
  while (rivers.length < max && cand.length) {
    let bi = 0;
    for (let c = 1; c < cand.length; c++) if (cand[c][0] > cand[bi][0]) bi = c;
    const [area, start, join] = cand.splice(bi, 1)[0];
    if (used[start]) continue;
    // walk upstream along the largest child, queueing big side branches
    const cells: number[] = [];
    let k = start;
    const stop = Math.max(minArea, area * 0.015);
    for (;;) {
      cells.push(k);
      used[k] = 1;
      let best = -1;
      for (let c = head[k]; c >= 0; c = next[c]) if (!used[c] && (best < 0 || A[c] > A[best])) best = c;
      if (best < 0 || A[best] < stop) break;
      for (let c = head[k]; c >= 0; c = next[c]) if (c !== best && !used[c] && A[c] >= Math.max(minArea * 2, area * 0.06)) cand.push([A[c], c, k]);
      k = best;
    }
    if (cells.length < 4) continue;
    cells.reverse();
    if (join >= 0) cells.push(join);
    // unwrap x so the polyline is continuous
    const pts: [number, number][] = [];
    let prev = world(cells[0]);
    pts.push(prev);
    for (let c = 1; c < cells.length; c++) {
      const p = world(cells[c]);
      let x = p[0];
      if (g.wrap) {
        while (x - prev[0] > g.W / 2) x -= g.W;
        while (x - prev[0] < -g.W / 2) x += g.W;
      }
      prev = [x, p[1]];
      pts.push(prev);
    }
    rivers.push({ points: pts, area });
  }
  return rivers;
}
