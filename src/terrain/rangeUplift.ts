import { clamp, fbm } from '../core/math';
import { upliftRelief } from './upliftErosion';

/*
 * The uplift of mountain ranges drawn as crest lines, and the relief rivers carve
 * from it.
 *
 * Real ranges are pushed up along a belt and carved by rivers; what makes them look
 * like the Alps or the Andes rather than a comb is that nothing is even: the crest
 * wanders, summits come in clusters and saddles, one flank is often short and steep
 * (the front of a thrust) and the other long, and patches of harder rock make
 * valleys bunch and spread. Each of these is a smooth field here, anchored to the
 * map so a range keeps its character when it is reshaped.
 */

/** The part of the range's half width over which uplift falls off at its edges. */
const EDGE = 0.45;

export interface RangeJobLine {
  /** Points along the crest, x/y pairs in window cells. */
  pts: Float32Array;
  /** Height factor at the first and the last point (branches fall towards their tips). */
  h0: number;
  h1: number;
  /** Whether the line's ends are free (they round off) or join another line. */
  freeStart: boolean;
  freeEnd: boolean;
}

export interface RangeJobRange {
  /** Highest summits, as a fraction of the highest range in the job. */
  height: number;
  /** The range's own seed: it carves the same way whatever is drawn around it. */
  seed: number;
  /** Half the range's width, window cells. */
  halfWidth: number;
  irregularity: number;
  asymmetry: number;
  lines: RangeJobLine[];
}

export interface RangeJob {
  w: number;
  h: number;
  /** Ground size of a window cell, km. */
  cellKm: number;
  /** World cell of the window's origin, and world cells per window cell (noise stays on the map). */
  ox: number;
  oy: number;
  scale: number;
  ranges: RangeJobRange[];
  /** Height of the highest summits, metres. */
  peakM: number;
  seed: number;
}

/** The uplift of all ranges in the window, 0 … 1. */
export function rangeUplift(job: RangeJob): Float32Array {
  const { w, h, ox, oy, scale } = job;
  const U = new Float32Array(w * h);
  for (const r of job.ranges) {
    const hw = Math.max(2, r.halfWidth);
    // smooth fields across the map, a feature every couple of range widths
    const L = hw * 2 * scale;
    const wander = (x: number, y: number) => (fbm((ox + x * scale) / L, (oy + y * scale) / L, job.seed + 11, 3) * 2 - 1) * 0.35 * hw * r.irregularity;
    const swell = (x: number, y: number) => clamp(1 + (fbm((ox + x * scale) / L, (oy + y * scale) / L, job.seed + 23, 3) * 2 - 1) * 0.9 * r.irregularity, 0.25, 1.4);
    const reach = hw * (1 + 0.5 * Math.abs(r.asymmetry)) + 0.35 * hw * r.irregularity + 1;
    for (const line of r.lines) {
      const p = line.pts;
      const n = p.length / 2;
      if (n < 2) continue;
      // lengths along the line, for its height and for rounding its free ends
      const cum = new Float32Array(n);
      for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(p[2 * i] - p[2 * i - 2], p[2 * i + 1] - p[2 * i - 1]);
      const total = Math.max(1e-6, cum[n - 1]);
      for (let i = 0; i < n - 1; i++) {
        const ax = p[2 * i];
        const ay = p[2 * i + 1];
        const bx = p[2 * i + 2];
        const by = p[2 * i + 3];
        const dx = bx - ax;
        const dy = by - ay;
        const len2 = Math.max(1e-9, dx * dx + dy * dy);
        const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - reach));
        const x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + reach));
        const y0 = Math.max(0, Math.floor(Math.min(ay, by) - reach));
        const y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by) + reach));
        for (let y = y0; y <= y1; y++)
          for (let x = x0; x <= x1; x++) {
            const px = x + 0.5;
            const py = y + 0.5;
            const tt = clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
            const qx = px - (ax + tt * dx);
            const qy = py - (ay + tt * dy);
            // signed distance from the crest (left of the line positive), shifted as the crest wanders
            const side = dx * qy - dy * qx >= 0 ? 1 : -1;
            const sd = side * Math.hypot(qx, qy) - wander(x, y);
            const s = sd >= 0 ? 1 : -1;
            // the steep side of an asymmetric range is narrower
            const half = hw * (1 - 0.5 * r.asymmetry * s);
            const q = Math.abs(sd) / half;
            if (q >= 1) continue;
            const along = cum[i] + tt * Math.sqrt(len2);
            const a = along / total;
            // uplift is broad across the belt and falls off near its edges, as in real orogens;
            // the rivers, not the uplift, make the crest and the valleys
            const e = clamp((1 - q) / EDGE, 0, 1);
            let u = e * e * (3 - 2 * e);
            u *= r.height * (line.h0 + (line.h1 - line.h0) * a) * swell(x, y);
            // free ends round off over about half a width
            const e0 = line.freeStart ? clamp(along / (0.6 * hw), 0, 1) : 1;
            const e1 = line.freeEnd ? clamp((total - along) / (0.6 * hw), 0, 1) : 1;
            u *= Math.sqrt(Math.min(e0, e1) * (2 - Math.min(e0, e1)));
            const o = y * w + x;
            if (u > U[o]) U[o] = u;
          }
      }
    }
  }
  return U;
}

/** Patches of harder and softer rock, around 1. */
export function rangeErodibility(job: RangeJob, irregularity: number, halfWidth: number): Float32Array {
  const { w, h, ox, oy, scale } = job;
  const K = new Float32Array(w * h);
  const L = Math.max(4, halfWidth * 0.7) * scale;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) K[y * w + x] = Math.exp((fbm((ox + x * scale) / L, (oy + y * scale) / L, job.seed + 31, 3) * 2 - 1) * (0.4 + 0.8 * irregularity));
  return K;
}

/**
 * The ranges' relief in the window (metres), and their uplift (0 … 1). Each range is carved on
 * its own, so it reaches its own height whatever its neighbours are; where they meet, the
 * higher land wins.
 */
export function rangeRelief(job: RangeJob): { relief: Float32Array; uplift: Float32Array } {
  const n = job.w * job.h;
  const relief = new Float32Array(n);
  const uplift = new Float32Array(n);
  for (const r of job.ranges) {
    const one: RangeJob = { ...job, ranges: [{ ...r, height: 1 }], peakM: job.peakM * r.height, seed: r.seed };
    const u = rangeUplift(one);
    const z = upliftRelief({
      w: job.w,
      h: job.h,
      uplift: u.slice(),
      cellKm: job.cellKm,
      peakM: one.peakM,
      seed: r.seed,
      erodibility: rangeErodibility(one, r.irregularity, r.halfWidth),
      roughness: 0.02 + 0.08 * r.irregularity,
      origin: [job.ox, job.oy, job.scale],
    });
    for (let k = 0; k < n; k++) {
      if (z[k] > relief[k]) relief[k] = z[k];
      if (u[k] > uplift[k]) uplift[k] = u[k];
    }
  }
  return { relief, uplift };
}
