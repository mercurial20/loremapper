import { clamp, fbm, hash2, mulberry32, ridged, smoothstep } from '../core/math';
import { BIOME_CHANNELS } from '../core/planet';

export type GenType = 'continents' | 'pangaea' | 'island' | 'archipelago';

export interface GenParams {
  type: GenType;
  seed: number;
  W: number;
  H: number;
  /** Target land share of the generated area (true surface area). */
  landFraction: number;
  /** 0..1 — how much of the maximum elevation mountain ranges reach. */
  mountains: number;
  /** 0..1 — small-scale relief. */
  roughness: number;
  seaLevel: number;
  maxElevation: number;
  minElevation: number;
  oceanFloor: number;
  /** Cell rectangle to generate into (island / archipelago); whole world otherwise. */
  region: { x0: number; y0: number; x1: number; y1: number } | null;
  biomes: boolean;
  rivers: number;
}

export interface GenResult {
  /** Heights for the region (or world), row-major, region width × height. */
  height: Float32Array;
  /** Biome weights at half resolution over `biomeRegion` (half-res grid cells). */
  biome: Uint8Array | null;
  biomeRegion: { x0: number; y0: number; w: number; h: number };
  region: { x0: number; y0: number; w: number; h: number };
  rivers: [number, number][][];
}

/** Bilinear upsampling helper for low-resolution noise fields. */
function upsample(src: Float32Array, sw: number, sh: number, x: number, y: number, wrapX: boolean): number {
  const u = x - 0.5;
  const v = clamp(y - 0.5, 0, sh - 1.001);
  let x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const fx = u - x0;
  const fy = v - y0;
  let x1 = x0 + 1;
  if (wrapX) {
    x0 = ((x0 % sw) + sw) % sw;
    x1 = ((x1 % sw) + sw) % sw;
  } else {
    x0 = clamp(x0, 0, sw - 1);
    x1 = clamp(x1, 0, sw - 1);
  }
  const y1 = Math.min(sh - 1, y0 + 1);
  const a = src[y0 * sw + x0];
  const b = src[y0 * sw + x1];
  const c = src[y1 * sw + x0];
  const d = src[y1 * sw + x1];
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

export function generate(p: GenParams): GenResult {
  const whole = !p.region || p.type === 'continents' || p.type === 'pangaea';
  const rx0 = whole ? 0 : Math.max(0, Math.floor(p.region!.x0));
  const ry0 = whole ? 0 : Math.max(0, Math.floor(p.region!.y0));
  const rw = whole ? p.W : Math.max(8, Math.min(p.W, Math.ceil(p.region!.x1 - p.region!.x0)));
  const rh = whole ? p.H : Math.max(8, Math.min(p.H - ry0, Math.ceil(p.region!.y1 - p.region!.y0)));
  const seed = p.seed % 100000;
  const rand = mulberry32(p.seed);

  // ---- low-resolution macro field (continent shapes)
  const Q = 4;
  const qw = Math.ceil(rw / Q);
  const qh = Math.ceil(rh / Q);
  const macro = new Float32Array(qw * qh);
  const P = p.type === 'archipelago' ? 18 : p.type === 'island' ? 3 : 7; // lattice periods around the world
  const scale = whole ? p.W / P : Math.max(rw, rh) / P;
  const periodX = whole ? P : 0;
  const pangaeaCx = rand() * p.W;
  const pangaeaCy = p.H * (0.35 + rand() * 0.3);
  for (let j = 0; j < qh; j++) {
    for (let i = 0; i < qw; i++) {
      const x = rx0 + (i + 0.5) * Q;
      const y = ry0 + (j + 0.5) * Q;
      const sx = x / scale;
      const sy = y / scale;
      // domain warp for organic coastlines
      const wx = fbm(sx + 5.2, sy + 1.3, seed + 11, 3, periodX) - 0.5;
      const wy = fbm(sx + 9.7, sy + 4.1, seed + 23, 3, periodX) - 0.5;
      let v = fbm(sx + wx * 1.4, sy + wy * 1.4, seed, 7, periodX);
      if (whole) {
        const lat = Math.abs(90 - (y / p.H) * 180);
        v -= 0.12 * smoothstep(55, 88, lat);
        if (p.type === 'pangaea') {
          let dx = Math.abs(x - pangaeaCx);
          dx = Math.min(dx, p.W - dx);
          const d = Math.hypot(dx / (p.W * 0.28), (y - pangaeaCy) / (p.H * 0.38));
          v += 0.35 * (1 - smoothstep(0.2, 1.2, d));
        }
      } else {
        // radial mask confines land to the region
        const nx = (x - rx0) / rw - 0.5;
        const ny = (y - ry0) / rh - 0.5;
        const d = Math.hypot(nx, ny) * 2;
        const fall = p.type === 'island' ? 1 - smoothstep(0.25, 0.95, d) : 1 - smoothstep(0.55, 1.0, d);
        v = v * (0.45 + 0.55 * fall) - (1 - fall) * 0.35;
      }
      macro[j * qw + i] = v;
    }
  }

  // ---- threshold so land covers the requested share of true surface area
  let vmin = Infinity;
  let vmax = -Infinity;
  for (const v of macro) {
    if (v < vmin) vmin = v;
    if (v > vmax) vmax = v;
  }
  const BINS = 2048;
  const hist = new Float64Array(BINS);
  let totalW = 0;
  for (let j = 0; j < qh; j++) {
    const y = ry0 + (j + 0.5) * Q;
    const w = Math.cos(((90 - (y / p.H) * 180) * Math.PI) / 180);
    for (let i = 0; i < qw; i++) {
      const b = Math.min(BINS - 1, Math.floor(((macro[j * qw + i] - vmin) / (vmax - vmin + 1e-9)) * BINS));
      hist[b] += w;
      totalW += w;
    }
  }
  let acc = 0;
  let t = vmax;
  for (let b = BINS - 1; b >= 0; b--) {
    acc += hist[b];
    if (acc >= totalW * p.landFraction) {
      t = vmin + ((b + 0.5) / BINS) * (vmax - vmin);
      break;
    }
  }

  // ---- half-resolution mountain field
  const Hh = 2;
  const hw = Math.ceil(rw / Hh);
  const hh = Math.ceil(rh / Hh);
  const mount = new Float32Array(hw * hh);
  const mScale = whole ? p.W / 44 : Math.max(18, Math.max(rw, rh) / 9);
  const mPeriod = whole ? 44 : 0;
  const beltScale = whole ? p.W / 9 : Math.max(rw, rh) / 2.2;
  const beltPeriod = whole ? 9 : 0;
  for (let j = 0; j < hh; j++) {
    for (let i = 0; i < hw; i++) {
      const x = rx0 + (i + 0.5) * Hh;
      const y = ry0 + (j + 0.5) * Hh;
      const r = ridged(x / mScale, y / mScale, seed + 101, 5, mPeriod);
      // mountain belts: only some regions get ranges
      const belt = smoothstep(0.42, 0.62, fbm(x / beltScale + 3.3, y / beltScale + 7.7, seed + 202, 3, beltPeriod));
      const t = Math.min(1, Math.max(0, (r - 0.12) / 0.7));
      mount[j * hw + i] = Math.pow(t * t * (3 - 2 * t), 1.5) * belt;
    }
  }

  // ---- full-resolution composition
  const height = new Float32Array(rw * rh);
  const sea = p.seaLevel;
  const maxE = p.maxElevation;
  const detailScale = whole ? p.W / 512 : 6;
  for (let j = 0; j < rh; j++) {
    const y = ry0 + j + 0.5;
    for (let i = 0; i < rw; i++) {
      const x = rx0 + i + 0.5;
      const v = upsample(macro, qw, qh, (x - rx0) / Q, (y - ry0) / Q, whole);
      const m = upsample(mount, hw, hh, (x - rx0) / Hh, (y - ry0) / Hh, whole);
      const det = fbm(x / detailScale, y / detailScale, seed + 303, 2, whole ? 512 : 0) - 0.5;
      let h: number;
      if (v >= t) {
        const e = (v - t) / (vmax - t + 1e-9);
        const inland = smoothstep(0.02, 0.35, e);
        h = 30 + 1400 * Math.pow(e, 1.25) + m * maxE * 0.92 * p.mountains * (0.25 + 0.75 * inland) + det * (100 + 700 * p.roughness) * inland;
        h = Math.max(h, 8);
      } else {
        const d = (t - v) / (t - vmin + 1e-9);
        h = -(60 + 4400 * smoothstep(0.0, 0.35, d) + 1600 * d) + det * 200;
        h = Math.min(h, -10);
      }
      height[j * rw + i] = clamp(sea + h, p.minElevation, sea + maxE);
    }
  }

  // ---- biomes
  let biome: Uint8Array | null = null;
  // biomes live on a half-resolution grid
  const bw = Math.ceil(rw / 2);
  const bh = Math.ceil(rh / 2);
  if (p.biomes) {
    biome = new Uint8Array(bw * bh * BIOME_CHANNELS);
    const bs = whole ? p.W / 60 : Math.max(12, Math.max(rw, rh) / 8);
    const bp = whole ? 60 : 0;
    for (let j = 0; j < bh; j++) {
      const y = ry0 + j * 2 + 1;
      const lat = Math.abs(90 - (y / p.H) * 180);
      const r0 = Math.min(rh - 1, j * 2);
      const r1 = Math.min(rh - 1, j * 2 + 1);
      for (let i = 0; i < bw; i++) {
        const c0 = Math.min(rw - 1, i * 2);
        const c1 = Math.min(rw - 1, i * 2 + 1);
        const hm = (height[r0 * rw + c0] + height[r0 * rw + c1] + height[r1 * rw + c0] + height[r1 * rw + c1]) / 4;
        const h = hm - sea;
        if (h <= 0) continue;
        const x = rx0 + i * 2 + 1;
        const e = h / maxE;
        const n = fbm(x / bs, y / bs, seed + 404, 3, bp);
        const moist = fbm(x / bs + 17, y / bs + 9, seed + 505, 4, bp);
        // climate: noisy latitude so zones never form straight bands
        const latN = lat + (n - 0.5) * 26;
        const temp = 1 - latN / 72 - e * 1.5;
        const snow = smoothstep(0.1, -0.04, temp);
        const rock = smoothstep(0.3, 0.46, e) * (1 - snow);
        const desert = smoothstep(0.48, 0.66, temp) * smoothstep(0.5, 0.36, moist) * (1 - rock) * (1 - snow);
        const swamp = smoothstep(0.6, 0.7, moist) * smoothstep(0.05, 0.015, e) * (1 - desert) * (1 - snow);
        const forest = smoothstep(0.44, 0.58, moist) * (1 - desert) * (1 - snow) * (1 - rock) * (1 - swamp) * smoothstep(-0.05, 0.12, temp);
        const used = snow + rock + desert + swamp + forest;
        const grass = Math.max(0, 1 - used) * 0.85;
        const total = Math.max(1, used + grass);
        const o = (j * bw + i) * BIOME_CHANNELS;
        biome[o] = (grass / total) * 235;
        biome[o + 1] = (forest / total) * 235;
        biome[o + 3] = (desert / total) * 235;
        biome[o + 4] = (swamp / total) * 235;
        biome[o + 5] = (snow / total) * 235;
        biome[o + 6] = (rock / total) * 235;
      }
    }
  }

  // ---- rivers: follow terrain downhill from high ground to the sea (ported from Cartographer)
  const rivers: [number, number][][] = [];
  if (p.rivers > 0) {
    const hAt = (x: number, y: number) => {
      const xi = whole ? (((Math.floor(x) - rx0) % rw) + rw) % rw : clamp(Math.floor(x) - rx0, 0, rw - 1);
      const yi = clamp(Math.floor(y) - ry0, 0, rh - 1);
      return height[yi * rw + xi];
    };
    let tries = 0;
    const step = whole ? 2.2 : Math.max(1, Math.min(rw, rh) / 160);
    while (rivers.length < p.rivers && tries < p.rivers * 60) {
      tries++;
      const sx = rx0 + rand() * rw;
      const sy = ry0 + 8 + rand() * (rh - 16);
      const h0 = hAt(sx, sy) - sea;
      if (h0 < 900 || h0 > maxE * 0.7) continue;
      const pts: [number, number][] = [[sx, sy]];
      let cx = sx;
      let cy = sy;
      let ok = false;
      for (let s = 0; s < 700; s++) {
        let bx = cx;
        let by = cy;
        let bh = hAt(cx, cy);
        for (let a = 0; a < 8; a++) {
          const ang = (a / 8) * Math.PI * 2;
          const nx = cx + Math.cos(ang) * step;
          const ny = cy + Math.sin(ang) * step;
          const nh = hAt(nx, ny) + (hash2(s + tries * 7, a) - 0.5) * 6;
          if (nh < bh) {
            bh = nh;
            bx = nx;
            by = ny;
          }
        }
        if (bx === cx && by === cy) break;
        cx = bx;
        cy = by;
        pts.push([cx, cy]);
        if (bh <= sea) {
          ok = true;
          break;
        }
      }
      if (ok && pts.length > 12) {
        // keep rivers apart
        if (rivers.some((r) => Math.hypot(r[0][0] - sx, r[0][1] - sy) < 25)) continue;
        rivers.push(pts);
      }
    }
  }

  return {
    height,
    biome,
    biomeRegion: { x0: Math.floor(rx0 / 2), y0: Math.floor(ry0 / 2), w: bw, h: bh },
    region: { x0: rx0, y0: ry0, w: rw, h: rh },
    rivers,
  };
}
