import { clamp, fbm, smoothstep } from '../core/math';
import { cellNoise, upliftRelief } from './upliftErosion';

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
/** How much stronger the uplift is on the crest than across the rest of the belt. */
const CREST = 0.25;
/** How much a range's width changes along it, by default. */
export const WIDTH_VARIATION = 0.35;
/**
 * Beyond the belt, foothills: the uplift tails off over this many half widths more, so the
 * range comes down to the plains through hill country instead of ending at a line.
 */
const FOOTHILLS = 0.9;
/** The foothills' uplift, next to the crest's. */
const FOOT_UPLIFT = 0.16;

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
  /** 0 … 1: how much the width changes along the range (default WIDTH_VARIATION). */
  widthVariation?: number;
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
  /** Erosion steps (the default settles the drainage of a drawn range fully). */
  steps?: number;
  /**
   * Carve coarse to fine: the drainage settles on a grid half as fine, then the full grid takes
   * that relief and only cuts its small valleys (`refineSteps` steps). Much faster on big grids.
   */
  coarseToFine?: boolean;
  refineSteps?: number;
}

/** The uplift of all ranges in the window, 0 … 1. */
export function rangeUplift(job: RangeJob, strike?: Float32Array): Float32Array {
  const { w, h, ox, oy, scale } = job;
  const U = new Float32Array(w * h);
  for (const r of job.ranges) {
    const hw = Math.max(2, r.halfWidth);
    // smooth fields across the map, a feature every couple of range widths
    const L = hw * 2 * scale;
    // (the smooth fields are worked out once a cell, as they are asked for: the boxes of the
    // crest's segments overlap, and a cell is visited many times)
    const cached = (f: (x: number, y: number) => number) => {
      const a = new Float32Array(w * h).fill(NaN);
      return (x: number, y: number) => {
        const k = y * w + x;
        let v = a[k];
        if (v !== v) v = a[k] = f(x, y);
        return v;
      };
    };
    const wander = cached((x, y) => (fbm((ox + x * scale) / L, (oy + y * scale) / L, job.seed + 11, 3) * 2 - 1) * 0.35 * hw * r.irregularity);
    // summits higher and lower along the crest, but the main divide runs on (a chain, not a
    // scatter of peaks)
    const swell = cached((x, y) => clamp(1 + (fbm((ox + x * scale) / L, (oy + y * scale) / L, job.seed + 23, 3) * 2 - 1) * 0.45 * r.irregularity, 0.6, 1.3));
    const wv = clamp(r.widthVariation ?? WIDTH_VARIATION, 0, 1);
    // along the range: its width swells and narrows smoothly, a swell every few widths
    // (both tabulated along the line, a value a cell)
    const tab = (f: (a: number) => number) => {
      const m = new Map<number, number>();
      return (a: number) => {
        const k = Math.round(a);
        let v = m.get(k);
        if (v === undefined) m.set(k, (v = f(k)));
        return v;
      };
    };
    const widthAt = tab((a) => Math.exp(wv * 1.4 * (fbm(a / (5 * hw * scale), r.seed % 997, job.seed + 41, 3) * 2 - 1)));
    // the edge of the belt is ragged: spurs run out into the land, bays between them
    const ragged = cached((x, y) => (fbm((ox + x * scale) / (0.7 * hw * scale), (oy + y * scale) / (0.7 * hw * scale), job.seed + 53, 3) * 2 - 1) * (0.15 + 0.3 * r.irregularity));
    // and which side is the steep one wanders along it too
    // the rock lies in bands along the range (its folds and thrust sheets), each band bending and
    // giving way to the next en échelon; rivers wear the soft ones into valleys along it
    const bandL = Math.max(5, 0.5 * hw);
    const bandPhase = tab((a) => fbm(a / (3 * hw * scale), r.seed % 983, job.seed + 71, 2) * 2 * Math.PI * 2);
    // (in stretches a few widths long, with gaps between: folds die out and others take over)
    const bandOn = tab((a) => smoothstep(0.38, 0.62, fbm(a / (2.5 * hw * scale), r.seed % 977, job.seed + 73, 2)));
    const asymAt = tab((a) => clamp(r.asymmetry + (fbm(a / (8 * hw * scale), r.seed % 991, job.seed + 61, 2) * 2 - 1) * 0.5 * r.irregularity, -0.9, 0.9));
    const reach = hw * Math.exp(wv * 1.4) * (1 + 0.5 * Math.abs(r.asymmetry) + 0.45 * r.irregularity) * (1 + FOOTHILLS) + 0.35 * hw * r.irregularity + 1;
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
            const along = cum[i] + tt * Math.sqrt(len2);
            const a = along / total;
            // the width here (the wider the lower, so a broad stretch spreads rather than towers);
            // the steep side of an asymmetric range is narrower
            const wf = widthAt(ox + along * scale);
            const half = hw * wf * (1 - 0.5 * asymAt(ox + along * scale) * s);
            const q = (Math.abs(sd) / half) * (1 + ragged(x, y));
            if (q >= 1 + FOOTHILLS) continue;
            // uplift is broad across the belt and falls off near its edges, as in real orogens;
            // the rivers, not the uplift, make the crest and the valleys
            const e = clamp((1 - q) / EDGE, 0, 1);
            // a gentle rise towards the drawn crest keeps the main divide on it, and leaves a
            // lower trough between two chains for a valley along them; beyond the belt, the
            // foothills tail off into the land around
            const qq = Math.min(q, 1);
            const foot = q > 1 - EDGE ? FOOT_UPLIFT * (1 - smoothstep(1 - EDGE, 1 + FOOTHILLS, q)) : FOOT_UPLIFT;
            let u = Math.max(e * e * (3 - 2 * e) * (1 - CREST + CREST * (1 - qq)), foot);
            u *= r.height * (line.h0 + (line.h1 - line.h0) * a) * swell(x, y) / Math.sqrt(wf);
            // free ends round off over about half a width
            const e0 = line.freeStart ? clamp(along / (0.6 * hw), 0, 1) : 1;
            const e1 = line.freeEnd ? clamp((total - along) / (0.6 * hw), 0, 1) : 1;
            u *= Math.sqrt(Math.min(e0, e1) * (2 - Math.min(e0, e1)));
            const o = y * w + x;
            if (u > U[o]) {
              U[o] = u;
              // (fading out toward the range's ends, where they would wrap round it in rings)
              const ends = smoothstep(0, 1, Math.min(along, total - along) / (1.5 * hw));
              if (strike) strike[o] = Math.cos((2 * Math.PI * sd) / bandL + bandPhase(ox + along * scale)) * (1 - smoothstep(0.75, 1.05, q)) * bandOn(ox + along * scale) * ends;
            }
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
 * The ranges' relief in the window (metres), and their belts (0 … 1).
 *
 * Ranges that touch are carved together, as one landscape: water from both runs into one
 * river, so two parallel chains get a valley along their length between them (as the Indus and
 * the Tsangpo run between the ranges of the Himalaya) and a branch meets its range at a fork,
 * not a seam. Each range still reaches its own height: a first, coarse pass measures how high
 * each one came out, and the second pass scales each one's uplift to match (the relief grows
 * in proportion to the uplift).
 */
export function rangeRelief(job: RangeJob): { relief: Float32Array; uplift: Float32Array } {
  const { w, h } = job;
  const n = w * h;
  const R = job.ranges;
  // each range's own belt, and the land it would make on its own
  const one = R.map((r) => ({ ...job, ranges: [{ ...r, height: 1 }], seed: r.seed }) as RangeJob);
  // a belt and its rock change over many cells: on a big window they are worked out on a grid
  // twice as coarse and scaled up
  const sub = n > 1_000_000 ? 2 : 1;
  const sw = Math.ceil(w / sub);
  const sh = Math.ceil(h / sub);
  const coarse = (j: RangeJob): RangeJob =>
    sub === 1
      ? j
      : {
          ...j,
          w: sw,
          h: sh,
          cellKm: j.cellKm * sub,
          scale: j.scale * sub,
          ranges: j.ranges.map((r) => ({ ...r, halfWidth: r.halfWidth / sub, lines: r.lines.map((l) => ({ ...l, pts: l.pts.map((v) => v / sub) })) })),
        };
  const up = (a: Float32Array) => (sub === 1 ? a : upsample(a, sw, sh, w, h, sub));
  const strikes = one.map(() => new Float32Array(sw * sh));
  const belts = one.map((j, i) => up(rangeUplift(coarse(j), strikes[i])));
  const strikeUp = strikes.map((a) => up(a));
  // (soft bands wear down about four times as fast as the hard ones beside them)
  const rock = one.map((j, i) => {
    const k = up(rangeErodibility(coarse(j), R[i].irregularity, R[i].halfWidth / sub));
    const st = strikeUp[i];
    // (on coarse cells, where the small valleys that dissect the bands cannot show, the bands
    // alone would stand as smooth ribbons: weaker there)
    const bandK = clamp(0.6 - 0.5 * (job.cellKm - 0.3), 0.15, 0.6);
    for (let q = 0; q < k.length; q++) k[q] *= Math.exp(bandK * st[q]);
    return k;
  });
  const belt = new Float32Array(n);
  for (const b of belts) for (let k = 0; k < n; k++) if (b[k] > belt[k]) belt[k] = b[k];

  /** The combined uplift for some scale of each range, with the range that leads in each cell. */
  const fields = (scale: number[], W: number, H: number, f: number) => {
    const N = W * H;
    const uplift = new Float32Array(N);
    const owner = new Int16Array(N).fill(-1);
    const erod = new Float32Array(N).fill(1);
    const initial = new Float32Array(N);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const o = y * W + x;
        const k = Math.min(h - 1, y * f) * w + Math.min(w - 1, x * f);
        for (let i = 0; i < R.length; i++) {
          const v = belts[i][k] * R[i].height * scale[i];
          if (v > uplift[o]) {
            uplift[o] = v;
            owner[o] = i;
          }
        }
        const i = owner[o];
        if (i < 0) continue;
        erod[o] = rock[i][k];
        // the leading range's own roughness, so "another variant" of one range changes it alone
        initial[o] = uplift[o] * (0.02 + 0.08 * R[i].irregularity) * cellNoise(Math.round(job.ox + x * f * job.scale), Math.round(job.oy + y * f * job.scale), R[i].seed);
      }
    return { uplift, owner, erod, initial };
  };

  let scale = R.map(() => 1);
  /** The first pass's relief, each range's part scaled as asked (where a finer pass can start). */
  let first: { z: Float32Array; W: number; H: number; f: number } | null = null;
  if (R.length > 1) {
    // first pass, coarse: how high does each range come out?
    const f = n > 1_000_000 ? 4 : n > 40_000 ? 2 : 1;
    const W = Math.ceil(w / f);
    const H = Math.ceil(h / f);
    const c = fields(scale, W, H, f);
    const z = upliftRelief({ w: W, h: H, uplift: c.uplift, cellKm: job.cellKm * f, peakM: 1, erodibility: c.erod, initial: c.initial, raw: true, steps: job.steps });
    const top = R.map(() => 0);
    for (let o = 0; o < W * H; o++) if (c.owner[o] >= 0 && z[o] > top[c.owner[o]]) top[c.owner[o]] = z[o];
    // relief per unit of asked height; ranges that came out short are pushed up harder
    const eff = top.map((t, i) => t / R[i].height);
    const best = Math.max(...eff);
    scale = eff.map((e) => (e > 0 ? best / e : 1));
    for (let o = 0; o < W * H; o++) if (c.owner[o] >= 0) z[o] *= scale[c.owner[o]];
    first = { z, W, H, f };
  }
  const c = fields(scale, w, h, 1);
  if (job.coarseToFine && w * h > 40_000) {
    // the drainage settles on a grid half as fine; scaled up, it is where the full grid starts
    const W = Math.ceil(w / 2);
    const H = Math.ceil(h / 2);
    const cc = fields(scale, W, H, 2);
    // (from the first pass if it was coarser still: then only its smaller valleys are left to cut)
    let init0: Float32Array = cc.initial;
    let steps = job.steps;
    if (first && first.f === 4) {
      const zf = upsample(first.z, first.W, first.H, W, H, 2);
      for (let o = 0; o < W * H; o++) zf[o] = cc.uplift[o] > 0 ? zf[o] + cc.initial[o] * 0.05 : 0;
      init0 = zf;
      steps = 12;
    }
    // (soil creep over about 1.7 km whatever the cell: valleys sit a few km apart, as in real
    // ranges, not in every other fine cell; passes spread it as their square root)
    const zc = upliftRelief({ w: W, h: H, uplift: cc.uplift, cellKm: job.cellKm * 2, peakM: 1, erodibility: cc.erod, initial: init0, raw: true, steps, creep: creepFor(job.cellKm * 2) });
    const init = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const fx = Math.min(W - 1, Math.max(0, (x + 0.5) / 2 - 0.5));
        const fy = Math.min(H - 1, Math.max(0, (y + 0.5) / 2 - 0.5));
        const ix = Math.min(W - 2, Math.floor(fx));
        const iy = Math.min(H - 2, Math.floor(fy));
        const tx = fx - Math.max(0, ix);
        const ty = fy - Math.max(0, iy);
        const at = (a: number, b: number) => zc[Math.max(0, b) * W + Math.max(0, a)];
        const v = (at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty) + (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty;
        // (with the full grid's own roughness, so its small channels pick their own ways)
        init[y * w + x] = c.uplift[y * w + x] > 0 ? v + c.initial[y * w + x] * 0.05 : 0;
      }
    const relief = upliftRelief({ w, h, uplift: c.uplift, cellKm: job.cellKm, peakM: job.peakM, erodibility: c.erod, initial: init, steps: job.refineSteps ?? 10, creep: creepFor(job.cellKm) });
    return { relief, uplift: belt };
  }
  const relief = upliftRelief({ w, h, uplift: c.uplift, cellKm: job.cellKm, peakM: job.peakM, erodibility: c.erod, initial: c.initial, steps: job.steps });
  return { relief, uplift: belt };
}

/** A field scaled up `f` times (bilinear), from sw × sh cells to w × h. */
function upsample(a: Float32Array, sw: number, sh: number, w: number, h: number, f: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(sh - 1, Math.max(0, (y + 0.5) / f - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(sh - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(sw - 1, Math.max(0, (x + 0.5) / f - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(sw - 1, x0 + 1);
      const tx = fx - x0;
      const r0 = a[y0 * sw + x0] * (1 - tx) + a[y0 * sw + x1] * tx;
      const r1 = a[y1 * sw + x0] * (1 - tx) + a[y1 * sw + x1] * tx;
      out[y * w + x] = r0 * (1 - ty) + r1 * ty;
    }
  }
  return out;
}

/** Passes of soil creep that spread it over about 1.7 km on cells of `cellKm` (4 … 12). */
const creepFor = (cellKm: number) => Math.max(4, Math.min(12, Math.round((1.7 / cellKm) ** 2)));
