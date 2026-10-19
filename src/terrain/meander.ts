import type { Vec2 } from '../model/types';
import { mulberry32 } from '../core/math';
import { Simplex3 } from '../core/noise3';

/** Smooth noise in the plane, about −1 … 1. */
class Simplex2 {
  private n: Simplex3;
  constructor(seed: number) {
    this.n = new Simplex3(seed);
  }
  at(x: number, y: number) {
    return this.n.fbm(x, y, 0.37, 1, 2);
  }
}

/*
 * Meanders. A straight channel on a gentle slope is unstable: where it bends, the current runs
 * faster along the outer bank and wears it away, while the inner bank silts up, so every bend
 * grows and creeps down the valley. Where a loop closes on itself into a narrow neck, the river
 * breaks through and the loop is left behind as an oxbow lake.
 *
 * This follows the kinematic model of Howard & Knutson (1984): the channel moves towards its
 * outer bank at a rate set by its curvature there (Ω·C) and, more strongly, by the curvature
 * upstream, fading with distance (Γ·∫ C(s − ξ) e^(−ξ/L) dξ). Lengths go by the channel's width,
 * so a wide river makes wide loops (about ten widths from one to the next, as rivers do).
 */

/** Local and upstream weights of the bank's migration (Howard & Knutson's Ω and Γ). */
const OMEGA = -1;
const GAMMA = 2.5;
/** How far upstream (widths) the curvature still tells. */
const LAG = 2.5;
/** How far a node moves in one step at unit migration, in widths. */
const RATE = 0.25;
/** Most steps the channel migrates. */
const STEPS = 700;
/** How much longer than its valley a river on a flat floodplain becomes (lowland rivers: 1.5 … 2.5). */
const SINUOSITY = 2.1;
/** The stretch (widths of the course) over which a reach's winding is measured. */
const REACH = 40;
/** A neck narrower than this (widths) is broken through. */
const NECK = 1.6;

export interface MeanderInput {
  /** The course, source to mouth, about a cell or less between points. */
  points: Vec2[];
  /** The channel's width (cells) at a distance along the course. */
  width: (s: number) => number;
  /** How freely it meanders at a distance along the course: 0 (held) … 1 (on a flat floodplain). */
  mobility: (s: number) => number;
  /** Whether the channel may move to a point (on its floodplain: not up a valley side, not into the sea or a lake). */
  allowed: (x: number, y: number, s: number) => boolean;
  /** Picks this river's own pattern of loops. */
  seed: number;
  /** How winding it gets on a flat floodplain (default SINUOSITY). */
  sinuosity?: number;
}

export interface MeanderResult {
  /** The new course. */
  points: Vec2[];
  /** Where each of its points was along the course it started from (for what varies along it). */
  along: number[];
  /** Loops cut off, each with where it was along the original course. */
  oxbows: { points: Vec2[]; along: number }[];
}

export function meander(inp: MeanderInput): MeanderResult {
  const src = inp.points;
  if (src.length < 3) return { points: src.slice(), along: src.map((_, i) => i), oxbows: [] };
  const cum = [0];
  for (let i = 1; i < src.length; i++) cum.push(cum[i - 1] + Math.hypot(src[i][0] - src[i - 1][0], src[i][1] - src[i - 1][1]));
  const total = cum[cum.length - 1];
  // the width and freedom along the course, looked up rather than worked out at every step
  const res = 0.25;
  const nt = Math.ceil(total / res) + 1;
  const wTab = new Float64Array(nt);
  const mTab = new Float64Array(nt);
  for (let k = 0; k < nt; k++) {
    wTab[k] = inp.width(Math.min(total, k * res));
    mTab[k] = inp.mobility(Math.min(total, k * res));
  }
  const tab = (t: Float64Array, s: number) => t[Math.min(nt - 1, Math.max(0, Math.round(s / res)))];
  const widthAt = (s: number) => tab(wTab, s);
  let wsum = 0;
  for (let k = 0; k <= 10; k++) wsum += widthAt((k / 10) * total);
  const w0 = wsum / 11;
  const ds = Math.max(0.5, w0);
  let xs: number[] = [];
  let ys: number[] = [];
  let s0: number[] = [];
  {
    const n = Math.max(3, Math.ceil(total / ds) + 1);
    let j = 1;
    for (let k = 0; k < n; k++) {
      const s = (k / (n - 1)) * total;
      while (j < src.length - 1 && cum[j] < s) j++;
      const u = Math.min(1, Math.max(0, (s - cum[j - 1]) / Math.max(1e-9, cum[j] - cum[j - 1])));
      xs.push(src[j - 1][0] + (src[j][0] - src[j - 1][0]) * u);
      ys.push(src[j - 1][1] + (src[j][1] - src[j - 1][1]) * u);
      s0.push(s);
    }
  }
  const mob = (i: number) => tab(mTab, s0[i]);
  // banks wear away more easily in some places than others (sand here, clay there), so no two
  // loops come out alike
  const bank = new Simplex2(inp.seed);
  const soft = (x: number, y: number) => 0.35 + 1.3 * (0.5 + 0.5 * bank.at(x / (9 * w0), y / (9 * w0)));
  const rnd = mulberry32((inp.seed ^ 0x2545f491) >>> 0);
  // a channel is never quite straight: a faint waver of its own, from which the loops grow
  let rest = new Uint8Array(xs.length);
  const waver = (amp: number) => {
    // (of the lengths that grow: from about 14 widths up)
    const waves = [0, 1, 2, 3, 4].map(() => ({ k: (2 * Math.PI) / ((14 + rnd() * 30) * w0), ph: rnd() * 2 * Math.PI, a: 0.3 + rnd() }));
    const off = xs.map((_, i) => (rest[i] ? 0 : amp * w0 * mob(i) * waves.reduce((sum, wv) => sum + wv.a * Math.sin(wv.k * s0[i] + wv.ph), 0)));
    for (let i = 1; i < xs.length - 1; i++) {
      const tx = xs[i + 1] - xs[i - 1];
      const ty = ys[i + 1] - ys[i - 1];
      const l = Math.hypot(tx, ty) || 1;
      const nx = -ty / l;
      const ny = tx / l;
      if (inp.allowed(xs[i] + nx * off[i], ys[i] + ny * off[i], s0[i])) {
        xs[i] += nx * off[i];
        ys[i] += ny * off[i];
      }
    }
  };
  waver(0.15);
  const oxbows: { points: Vec2[]; along: number }[] = [];
  // each reach as winding as its floodplain lets it be (less where it is held: steep reaches,
  // lakes, its ends); a reach that is, rests while the others catch up
  let free = 0;
  for (let i = 0; i < xs.length; i++) free += mob(i);
  if (free <= 0) return { points: src.slice(), along: cum.slice(), oxbows };
  for (let step = 0; step < STEPS; step++) {
    if (step % 10 === 0) {
      rest = resting();
      if (rest.every((r) => r)) break;
    }
    // floods and fallen trees keep nudging it (the current carries every bend downstream, so a
    // reach still straight needs the nudges to start its own)
    if (step % 10 === 5) waver(0.06);
    const n = xs.length;
    // curvature (in widths) at every node
    const C = new Float64Array(n);
    const nx = new Float64Array(n);
    const ny = new Float64Array(n);
    for (let i = 1; i < n - 1; i++) {
      const ax = xs[i] - xs[i - 1];
      const ay = ys[i] - ys[i - 1];
      const bx = xs[i + 1] - xs[i];
      const by = ys[i + 1] - ys[i];
      const la = Math.hypot(ax, ay);
      const lb = Math.hypot(bx, by);
      if (la < 1e-9 || lb < 1e-9) continue;
      const turn = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
      C[i] = (turn / ((la + lb) / 2)) * widthAt(s0[i]);
      const tx = xs[i + 1] - xs[i - 1];
      const ty = ys[i + 1] - ys[i - 1];
      const lt = Math.hypot(tx, ty) || 1;
      // towards the centre of the bend when it turns this way
      nx[i] = -ty / lt;
      ny[i] = tx / lt;
    }
    // the bank moves out by the curvature here and, more, by the curvature upstream
    let up = 0;
    for (let i = 1; i < n - 1; i++) {
      const fade = Math.exp(-(Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]) || ds) / (LAG * widthAt(s0[i])));
      up = fade * up + (1 - fade) * C[i - 1];
      const m = mob(i);
      if (m <= 0 || rest[i]) continue;
      const w = widthAt(s0[i]);
      const r1 = OMEGA * C[i] + GAMMA * up;
      const d = Math.max(-0.1 * ds, Math.min(0.1 * ds, RATE * w * r1 * soft(xs[i], ys[i])));
      // away from the bend's centre: towards the outer bank
      const x = xs[i] - nx[i] * d;
      const y = ys[i] - ny[i] * d;
      if (inp.allowed(x, y, s0[i])) {
        xs[i] = x;
        ys[i] = y;
      }
    }
    // a little smoothing, so no kink of a node or two grows
    for (let i = 1; i < n - 1; i++) {
      if (mob(i) <= 0) continue;
      const x = 0.5 * xs[i] + 0.25 * (xs[i - 1] + xs[i + 1]);
      const y = 0.5 * ys[i] + 0.25 * (ys[i - 1] + ys[i + 1]);
      if (inp.allowed(x, y, s0[i])) {
        xs[i] = 0.85 * xs[i] + 0.15 * x;
        ys[i] = 0.85 * ys[i] + 0.15 * y;
      }
    }
    resample();
    if (step % 4 === 3) cutoffs();
  }
  const points: Vec2[] = xs.map((x, i) => [x, ys[i]]);
  return { points, along: s0.slice(), oxbows };

  /**
   * The nodes whose reach (REACH widths of the course around them) already winds as much as its
   * floodplain lets it: they rest.
   */
  function resting(): Uint8Array {
    const n = xs.length;
    const out = new Uint8Array(n);
    // the channel's length up to each node
    const len = new Float64Array(n);
    for (let i = 1; i < n; i++) len[i] = len[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
    let a = 0;
    let b = 0;
    for (let i = 0; i < n; i++) {
      const half = (REACH / 2) * widthAt(s0[i]);
      while (a < i && s0[a] < s0[i] - half) a++;
      while (b < n - 1 && s0[b] < s0[i] + half) b++;
      const course = s0[b] - s0[a];
      const target = 1 + ((inp.sinuosity ?? SINUOSITY) - 1) * mob(i);
      out[i] = course <= 0 || (len[b] - len[a]) / course >= target ? 1 : 0;
    }
    return out;
  }

  /** Keep the nodes about `ds` apart as the channel lengthens. */
  function resample() {
    const ox = xs;
    const oy = ys;
    const os = s0;
    xs = [ox[0]];
    ys = [oy[0]];
    s0 = [os[0]];
    for (let i = 1; i < ox.length; i++) {
      const lx = xs[xs.length - 1];
      const ly = ys[ys.length - 1];
      const d = Math.hypot(ox[i] - lx, oy[i] - ly);
      if (d < 0.5 * ds && i < ox.length - 1) continue;
      const parts = Math.max(1, Math.round(d / ds));
      const ls = s0[s0.length - 1];
      for (let k = 1; k <= parts; k++) {
        const u = k / parts;
        xs.push(lx + (ox[i] - lx) * u);
        ys.push(ly + (oy[i] - ly) * u);
        s0.push(ls + (os[i] - ls) * u);
      }
    }
  }

  /** Where a loop has closed into a narrow neck, the river breaks through; the loop stays as an oxbow. */
  function cutoffs() {
    const n = xs.length;
    const cell = Math.max(ds, NECK * w0);
    const grid = new Map<string, number[]>();
    const key = (x: number, y: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
    for (let i = 0; i < n; i++) {
      const k = key(xs[i], ys[i]);
      const list = grid.get(k);
      if (list) list.push(i);
      else grid.set(k, [i]);
    }
    for (let i = 0; i < xs.length; i++) {
      const w = widthAt(s0[i]);
      // only around a loop: a neck is two parts of the channel far apart along it
      const gap = Math.ceil((4 * w) / ds);
      const cx = Math.floor(xs[i] / cell);
      const cy = Math.floor(ys[i] / cell);
      let far = -1;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          for (const j of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
            if (j <= i + gap || j >= xs.length) continue;
            if (Math.hypot(xs[j] - xs[i], ys[j] - ys[i]) < NECK * w && j > far) far = j;
          }
      if (far < 0 || mob(i) <= 0 || mob(far) <= 0) continue;
      const loop: Vec2[] = [];
      for (let k = i; k <= far; k++) loop.push([xs[k], ys[k]]);
      oxbows.push({ points: loop, along: s0[(i + far) >> 1] });
      xs.splice(i + 1, far - i - 1);
      ys.splice(i + 1, far - i - 1);
      s0.splice(i + 1, far - i - 1);
      // the indices in the grid no longer hold beyond here: look again next time
      return;
    }
  }
}

/** How much longer a course is than the straight line between its ends. */
export function sinuosity(points: Vec2[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  const a = points[0];
  const b = points[points.length - 1];
  return len / Math.max(1e-9, Math.hypot(b[0] - a[0], b[1] - a[1]));
}

/**
 * Oxbow lakes left by a river's former course (`former`, the same river meandered further, as it
 * once ran): its loops that had nearly closed, where they lie off the course it runs in now
 * (`now`), each well clear of it and of one another.
 */
/** How far (widths) an oxbow lies from the river at least. */
const CLEAR = 1.3;

export function oxbowsFrom(former: MeanderResult, now: Vec2[], width: (s: number) => number): { points: Vec2[]; along: number }[] {
  const P = former.points;
  const S = former.along;
  if (P.length < 8 || now.length < 2) return [];
  // the course as it runs now, in a grid, to tell how far from it a point is
  const w0 = width(S[S.length >> 1]);
  const cell = Math.max(1, 2 * w0);
  const grid = new Map<string, Vec2[]>();
  const put = (g: Map<string, Vec2[]>, p: Vec2) => {
    const k = `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)}`;
    const list = g.get(k);
    if (list) list.push(p);
    else g.set(k, [p]);
  };
  for (const p of now) put(grid, p);
  const near = (g: Map<string, Vec2[]>, p: Vec2, d: number) => {
    const cx = Math.floor(p[0] / cell);
    const cy = Math.floor(p[1] / cell);
    const r = Math.ceil(d / cell);
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) for (const q of g.get(`${cx + dx},${cy + dy}`) ?? []) if (Math.hypot(q[0] - p[0], q[1] - p[1]) < d) return true;
    return false;
  };
  const len = [0];
  for (let i = 1; i < P.length; i++) len.push(len[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const out: { points: Vec2[]; along: number }[] = [];
  // the stretches of the former course that lie off the present one; those that curve round, a
  // few widths long, are its old loops
  let lastAlong = -Infinity;
  let i = 0;
  while (i < P.length) {
    const w = width(S[i]);
    if (near(grid, P[i], CLEAR * w)) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < P.length && !near(grid, P[j + 1], CLEAR * w) && len[j + 1] - len[i] <= 16 * w) j++;
    const arc = len[j] - len[i];
    const chord = Math.hypot(P[j][0] - P[i][0], P[j][1] - P[i][1]);
    if (arc >= 4 * w && chord <= 0.75 * arc && S[i] - lastAlong >= 12 * w) {
      out.push({ points: P.slice(i, j + 1), along: S[(i + j) >> 1] });
      lastAlong = S[i];
    }
    i = j + 1;
  }
  return out;
}
