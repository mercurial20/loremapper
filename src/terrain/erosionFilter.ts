/*
 * Erosion detail: the gullies, spurs and branching valleys that water cuts into a slope, finer
 * than the grid that holds the land, synthesised from the slope alone.
 *
 * Real hillsides are not bumpy at random: every small valley runs downhill and joins a bigger
 * one, and the ridges between them run downhill too. This draws that pattern with waves that run
 * down the slope (Clay John's and Rune Skovbo Johansen's "erosion noise"): around every point of
 * a jittered lattice a wave whose crests run straight downhill, the waves of the lattice points
 * nearby blended with weights that fall off with distance. Each finer octave runs down the slope
 * as the coarser ones have bent it, so the small gullies turn to meet the larger ones, as
 * tributaries do. The deeper the slope, the deeper the cuts; flat ground stays flat.
 *
 * It is a pure function of a point on the map and the slope there: the same at any resolution
 * and on any tile, so the land can be drawn finer than it is stored and still match itself.
 */

export interface ErosionOptions {
  /** Wavelength of the coarsest gullies, in map cells. */
  wavelength: number;
  /** Octaves, each half the wavelength and `gain` the depth of the one before. */
  octaves: number;
  gain?: number;
  /** How strongly each octave bends the next (branching), 0 … 2. */
  branch?: number;
  seed: number;
}

/** A pseudo-random pair in [0, 1)² for a lattice point (and a seed). */
function hash2(ix: number, iy: number, seed: number, out: [number, number]) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  out[0] = ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  h = Math.imul(h ^ 0x9e3779b9, 2654435761);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  out[1] = ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

const TAU = Math.PI * 2;
const tmp: [number, number] = [0, 0];
const res = new Float64Array(3);

/**
 * One octave: at point (x, y) in lattice units, waves running along `(dx, dy)` (downhill).
 * Writes (value −1 … 1, derivative along x, along y) into `res`.
 */
function gullies(x: number, y: number, dx: number, dy: number, seed: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  let v = 0;
  let gx = 0;
  let gy = 0;
  let wt = 0;
  // waves run downhill: crests are lines along the slope, so the phase goes across it
  const ax = -dy;
  const ay = dx;
  for (let j = -1; j <= 2; j++)
    for (let i = -1; i <= 2; i++) {
      hash2(ix + i, iy + j, seed, tmp);
      const px = fx - i - (tmp[0] - 0.5) * 0.9;
      const py = fy - j - (tmp[1] - 0.5) * 0.9;
      const d2 = px * px + py * py;
      const w = Math.exp(-2 * d2);
      wt += w;
      const ph = (px * ax + py * ay) * TAU;
      const c = Math.cos(ph);
      const s = Math.sin(ph);
      v += c * w;
      gx -= s * ax * TAU * w;
      gy -= s * ay * TAU * w;
    }
  res[0] = v / wt;
  res[1] = gx / wt;
  res[2] = gy / wt;
}

/**
 * The erosion detail at map point (x, y) (cells) on land whose slope there is (sx, sy) (rise
 * per cell, metres). Returns the change of height, metres: ridges up, gullies down, about as
 * deep as the slope falls over a gully's width (so steep land is cut deeply and flats not at all).
 */
export function erosionDetail(x: number, y: number, sx: number, sy: number, o: ErosionOptions): number {
  const gain = o.gain ?? 0.5;
  const branch = o.branch ?? 1;
  const slope = Math.hypot(sx, sy);
  if (slope < 1e-9) return 0;
  // downhill, as a unit vector; the octaves below bend it
  let dx = -sx / slope;
  let dy = -sy / slope;
  let h = 0;
  let amp = 1;
  let freq = 1 / o.wavelength;
  let norm = 0;
  // the slope of the detail so far, in units of the base slope
  let bx = 0;
  let by = 0;
  for (let k = 0; k < o.octaves; k++) {
    gullies(x * freq, y * freq, dx, dy, o.seed + k * 7919);
    h += res[0] * amp;
    norm += amp;
    // the detail's own slope, per cell, relative to its depth: a gully's sides are steep
    bx += res[1] * amp * freq;
    by += res[2] * amp * freq;
    // the next octave runs down the slope as this one has bent it
    const tx = -sx / slope + branch * -bx * o.wavelength * 0.25;
    const ty = -sy / slope + branch * -by * o.wavelength * 0.25;
    const tl = Math.hypot(tx, ty) || 1;
    dx = tx / tl;
    dy = ty / tl;
    amp *= gain;
    freq *= 2;
  }
  // depth: the base slope over a quarter of the coarsest wavelength
  return (h / norm) * slope * o.wavelength * 0.25;
}
