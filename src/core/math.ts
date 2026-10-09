export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Deterministic integer hash of a lattice point → [0, 1) (multiply–xorshift mixing). */
export function hash2(x: number, y: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul((y | 0) + 0x9e3779b9, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Lattice hash with a seed mixed in as a third coordinate. */
function hash3(x: number, y: number, seed: number): number {
  return hash2(x ^ Math.imul(seed | 0, 0x5bd1e995), y + (seed | 0) * 0x3c6ef372);
}

/** Seeded PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a free-form seed string to an integer. */
export function seedFromString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/**
 * Lattice value noise in [0, 1] with quintic interpolation. When `periodX` > 0
 * the lattice repeats horizontally, so noise tiles seamlessly around the planet.
 */
export function valueNoise(x: number, y: number, seed: number, periodX = 0): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const u = fade(x - ix);
  const v = fade(y - iy);
  const wrap = (c: number) => (periodX > 0 ? ((c % periodX) + periodX) % periodX : c);
  const left = wrap(ix);
  const right = wrap(ix + 1);
  const top = lerp(hash3(left, iy, seed), hash3(right, iy, seed), u);
  const bottom = lerp(hash3(left, iy + 1, seed), hash3(right, iy + 1, seed), u);
  return lerp(top, bottom, v);
}

/**
 * Fractal sum of value noise, normalised to [0, 1]. `periodX` is the
 * horizontal period of the first octave (in lattice cells); every octave
 * doubles the frequency and the period, so wrapping is preserved.
 */
export function fbm(x: number, y: number, seed: number, octaves = 5, periodX = 0, gain = 0.5): number {
  let total = 0;
  let weight = 1;
  let weights = 0;
  for (let o = 0, f = 1; o < octaves; o++, f *= 2) {
    total += weight * valueNoise(x * f, y * f, seed + o * 1013, periodX > 0 ? periodX * f : 0);
    weights += weight;
    weight *= gain;
  }
  return total / weights;
}

/** Ridged multifractal in [0, 1] — sharp crests for mountain ranges. */
export function ridged(x: number, y: number, seed: number, octaves = 5, periodX = 0): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  let weight = 1;
  for (let o = 0; o < octaves; o++) {
    const n = valueNoise(x * freq, y * freq, seed + o * 57, periodX > 0 ? periodX * freq : 0);
    let r = 1 - Math.abs(n * 2 - 1);
    r *= r;
    r *= weight;
    weight = clamp(r * 1.6, 0, 1);
    sum += r * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

let idCounter = 0;
export function uid(prefix = ''): string {
  idCounter = (idCounter + 1) % 1679616;
  return (
    prefix +
    Date.now().toString(36) +
    idCounter.toString(36).padStart(4, '0') +
    Math.floor(Math.random() * 1679616)
      .toString(36)
      .padStart(4, '0')
  );
}

/** IEEE-754 float32 → float16 bits. */
const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);
export function toHalf(v: number): number {
  f32[0] = v;
  const x = u32[0];
  const sign = (x >>> 16) & 0x8000;
  let exp = ((x >>> 23) & 0xff) - 127 + 15;
  let mant = x & 0x7fffff;
  if (exp <= 0) {
    if (exp < -10) return sign;
    mant = (mant | 0x800000) >> (1 - exp);
    return sign | ((mant + 0x1000) >> 13);
  }
  if (exp >= 31) return sign | 0x7c00;
  mant += 0x1000;
  if (mant & 0x800000) {
    mant = 0;
    exp += 1;
    if (exp >= 31) return sign | 0x7c00;
  }
  return sign | (exp << 10) | (mant >> 13);
}

/** Ramer–Douglas–Peucker polyline simplification. */
export function simplifyPath(pts: [number, number][], tolerance: number): [number, number][] {
  if (pts.length <= 2) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  const t2 = tolerance * tolerance;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-12;
    let maxD = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      const t = clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
      const ex = ax + t * dx - px;
      const ey = ay + t * dy - py;
      const d = ex * ex + ey * ey;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > t2 && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Sample a Catmull-Rom spline through control points. */
export function catmullRom(pts: [number, number][], samplesPerSeg = 8, closed = false): [number, number][] {
  const n = pts.length;
  if (n < 2) return pts.slice();
  if (n === 2 && !closed) return pts.slice();
  const out: [number, number][] = [];
  const get = (i: number) => {
    if (closed) return pts[((i % n) + n) % n];
    return pts[clamp(i, 0, n - 1)];
  };
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    for (let s = 0; s < samplesPerSeg; s++) {
      const t = s / samplesPerSeg;
      const t2 = t * t;
      const t3 = t2 * t;
      const x =
        0.5 *
        (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const y =
        0.5 *
        (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      out.push([x, y]);
    }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}

export function pointInPolygon(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1) : 0;
  return Math.hypot(ax + t * dx - px, ay + t * dy - py);
}

export function polygonCentroid(poly: [number, number][]): [number, number] {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const f = poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
    a += f;
    cx += (poly[j][0] + poly[i][0]) * f;
    cy += (poly[j][1] + poly[i][1]) * f;
  }
  if (Math.abs(a) < 1e-9) {
    const n = poly.length || 1;
    return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}
