import { mulberry32 } from './math';

// gradient directions: the 12 edge midpoints of a cube
const GRAD = new Float64Array([1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1]);
const F3 = 1 / 3;
const G3 = 1 / 6;

/** Mix two integers into a new 32-bit seed. */
export function subSeed(seed: number, k: number): number {
  let h = Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(k + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Seeded 3D simplex noise (after Stefan Gustavson's public-domain reference),
 * with a kernel radius of 0.5 so the field and its gradient stay continuous.
 * Sampling it at points on the unit sphere gives seamless, undistorted noise
 * for the whole planet: no seam at the antimeridian and no stretching at the poles.
 */
export class Simplex3 {
  private perm = new Uint8Array(512);
  private grad = new Uint8Array(512);

  constructor(seed: number) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    const rnd = mulberry32(seed);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.grad[i] = (this.perm[i] % 12) * 3;
    }
  }

  /** Noise in roughly [-1, 1]. */
  noise(x: number, y: number, z: number): number {
    const perm = this.perm;
    const gr = this.grad;
    const s = (x + y + z) * F3;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const k = Math.floor(z + s);
    const t = (i + j + k) * G3;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const z0 = z - (k - t);
    // which simplex of the skewed cube we are in
    let i1 = 0, j1 = 0, k1 = 0, i2 = 0, j2 = 0, k2 = 0;
    if (x0 >= y0) {
      i2 = 1;
      if (y0 >= z0) {
        i1 = 1;
        j2 = 1;
      } else if (x0 >= z0) {
        i1 = 1;
        k2 = 1;
      } else {
        k1 = 1;
        k2 = 1;
      }
    } else {
      j2 = 1;
      if (y0 < z0) {
        k1 = 1;
        k2 = 1;
      } else if (x0 < z0) {
        j1 = 1;
        k2 = 1;
      } else {
        j1 = 1;
        i2 = 1;
      }
    }
    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3;
    const y2 = y0 - j2 + 2 * G3;
    const z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3;
    const y3 = y0 - 1 + 3 * G3;
    const z3 = z0 - 1 + 3 * G3;
    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;
    let n = 0;
    let c = 0.5 - x0 * x0 - y0 * y0 - z0 * z0;
    if (c > 0) {
      const g = gr[ii + perm[jj + perm[kk]]];
      c *= c;
      n += c * c * (GRAD[g] * x0 + GRAD[g + 1] * y0 + GRAD[g + 2] * z0);
    }
    c = 0.5 - x1 * x1 - y1 * y1 - z1 * z1;
    if (c > 0) {
      const g = gr[ii + i1 + perm[jj + j1 + perm[kk + k1]]];
      c *= c;
      n += c * c * (GRAD[g] * x1 + GRAD[g + 1] * y1 + GRAD[g + 2] * z1);
    }
    c = 0.5 - x2 * x2 - y2 * y2 - z2 * z2;
    if (c > 0) {
      const g = gr[ii + i2 + perm[jj + j2 + perm[kk + k2]]];
      c *= c;
      n += c * c * (GRAD[g] * x2 + GRAD[g + 1] * y2 + GRAD[g + 2] * z2);
    }
    c = 0.5 - x3 * x3 - y3 * y3 - z3 * z3;
    if (c > 0) {
      const g = gr[ii + 1 + perm[jj + 1 + perm[kk + 1]]];
      c *= c;
      n += c * c * (GRAD[g] * x3 + GRAD[g + 1] * y3 + GRAD[g + 2] * z3);
    }
    return n * 76;
  }

  /** Fractal sum normalised to roughly [-1, 1]; `f` is the base frequency. */
  fbm(x: number, y: number, z: number, f: number, octaves: number, gain = 0.5): number {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      // offset every octave so their lattices don't line up
      sum += amp * this.noise(x * f + o * 31.7, y * f - o * 17.3, z * f + o * 11.1);
      norm += amp;
      amp *= gain;
      f *= 2;
    }
    return sum / norm;
  }

  /** Ridged multifractal in [0, 1]: sharp crests and branching valleys. */
  ridged(x: number, y: number, z: number, f: number, octaves: number): number {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    let weight = 1;
    for (let o = 0; o < octaves; o++) {
      let r = 1 - Math.abs(this.noise(x * f + o * 31.7, y * f - o * 17.3, z * f + o * 11.1));
      r *= r * weight;
      weight = r * 1.8 > 1 ? 1 : r * 1.8;
      sum += r * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  }
}
