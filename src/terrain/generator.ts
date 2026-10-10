import { clamp, mulberry32, smoothstep } from '../core/math';
import { Simplex3, subSeed } from '../core/noise3';
import { BIOME_CHANNELS } from '../core/planet';
import { biomeWeights, climate, type Climate } from './gen/climate';
import { sketchClimate, sketchShape, type Shape, type Sketch } from './gen/sketch';
import { blurKm, components, distanceField, dyKm, latOf, lonOf, makeGrid, mercatorPatch, radPerCell, resample, resampleFromSphere, sampleAt, sphereTables, thresholdForFraction, type Grid } from './gen/grid';
import { accumulate, diffuse, drain, erode, steadyState, traceRivers, type Drainage } from './gen/hydrology';
import { layoutMismatch, plateBase, tectonics, type Layout, type Tectonics } from './gen/plates';

/**
 * World generator, version 3: plate tectonics set where land rises and how
 * fast; the relief is the steady state of that uplift against river incision
 * (stream-power law), so valleys, ridges and river networks follow real
 * scaling laws. Wind-driven climate, drainage-basin rivers and biomes.
 * Deterministic: one version + settings + seed = one map.
 */
export const GENERATOR_VERSION = 3;

export type GenType = 'continents' | 'pangaea' | 'island' | 'archipelago';
export type Realism = 'easy' | 'medium' | 'high' | 'ultra';
/** Whole-world layouts beyond the basic types. */
export type Template = 'none' | 'twoWorlds' | 'innerSea' | 'polar' | 'shattered' | 'mainland';

export interface GenParams {
  type: GenType;
  seed: number;
  W: number;
  H: number;
  /** Target land share of the generated area (true surface area). */
  landFraction: number;
  /** 0..1 — how much of the maximum elevation mountain ranges reach. */
  mountains: number;
  /** 0..1 — hills between the plains (0 = flat plains and steppes almost everywhere). */
  roughness: number;
  seaLevel: number;
  maxElevation: number;
  minElevation: number;
  oceanFloor: number;
  /** Cell rectangle to generate into (island / archipelago); whole world otherwise. */
  region: { x0: number; y0: number; x1: number; y1: number } | null;
  biomes: boolean;
  /** Maximum number of rivers (0 = none). */
  rivers: number;
  realism?: Realism;
  template?: Template;
  radiusKm?: number;
  /** −1 colder … +1 warmer */
  warmth?: number;
  /** −1 drier … +1 wetter */
  wetness?: number;
  /**
   * Flat maps: W × H is the flat map, generated as a patch of a virtual planet
   * `spanLonDeg` wide; climate follows `climateLatDeg` (the map's centre) over a
   * band of `climateSpanDeg` from top to bottom.
   */
  flat?: { spanLonDeg: number; climateLatDeg: number; climateSpanDeg: number };
  /** A drawn layout (built-in worlds): replaces the plate layout; `landFraction` is ignored. */
  sketch?: Sketch;
}

export interface GenRiver {
  points: [number, number][];
  /** width at the mouth, km (on the virtual planet for flat maps) */
  widthKm: number;
  /** width at the mouth in map cells */
  widthCells: number;
}

export interface GenResult {
  /** Heights for the region (or world), row-major, region width × height. */
  height: Float32Array;
  /** Biome weights at half resolution over `biomeRegion` (half-res grid cells). */
  biome: Uint8Array | null;
  biomeRegion: { x0: number; y0: number; w: number; h: number };
  region: { x0: number; y0: number; w: number; h: number };
  rivers: GenRiver[];
}

export type Progress = (stage: string, fraction: number) => void;

function layoutFor(p: GenParams): Layout {
  if (p.template && p.template !== 'none') return p.template;
  if (p.type === 'pangaea') return 'pangaea';
  if (p.type === 'archipelago') return 'archipelago';
  if (p.type === 'island') return 'mainland';
  return 'continents';
}

const gauss = (x: number, w: number) => Math.exp(-(x / w) * (x / w));
/** Erodibility for the stream-power law (per √km² of rain-weighted upstream area, per km). */
const ERODE_K = 0.02;
/**
 * Channel steepness by setting, m/km at 1 km² of upstream area: S = U · A^(−θ).
 * Earth's rivers span roughly 20 (cratons) to 1000+ (Himalaya) on this scale.
 */
const UPLIFT = { plain: 20, hills: 110, range: 700, old: 180, arc: 300 };
/** Concavity of river profiles (Flint's law); 0.45 is the usual reference value. */
const THETA = 0.45;
/** About 35°: steeper hillslopes fail. */
const MAX_SLOPE_M_PER_KM = 700;

/** Evaluate a function of the unit-sphere position on every cell of a grid. */
function lowField(g: Grid, f: (x: number, y: number, z: number) => number): Float32Array {
  const T = sphereTables(g);
  const out = new Float32Array(g.w * g.h);
  for (let j = 0; j < g.h; j++)
    for (let i = 0; i < g.w; i++) out[j * g.w + i] = f(T.cosLat[j] * T.cosLon[i], T.cosLat[j] * T.sinLon[i], T.sinLat[j]);
  return out;
}


/** Hotspot volcanoes splatted onto a grid. */
function splatHotspots(g: Grid, t: Tectonics): Float32Array {
  const out = new Float32Array(g.w * g.h);
  const T = sphereTables(g);
  for (const s of t.hotspots) {
    const lat = Math.asin(s.p[2]);
    const lon = Math.atan2(s.p[1], s.p[0]);
    const rr = (s.radiusKm * 2.6) / g.R;
    let yc: number, xc: number, dy: number, dx: number;
    if (g.proj) {
      if (Math.abs(lon) > Math.PI * 0.95 || Math.abs(lat) > 1.5) continue;
      xc = g.proj.x(lon);
      yc = g.proj.y(lat);
      dx = dy = (s.radiusKm * 2.6) / g.proj.km(yc);
    } else {
      yc = ((Math.PI / 2 - lat) / Math.PI) * g.H;
      xc = ((((lon / (2 * Math.PI)) % 1) + 1) % 1) * g.W;
      dy = (rr / Math.PI) * g.H;
      dx = Math.min(g.W / 2, ((rr / (2 * Math.PI)) * g.W) / Math.max(0.05, Math.cos(lat)));
    }
    const j0 = Math.max(0, Math.floor((yc - dy - g.y0) / g.step));
    const j1 = Math.min(g.h - 1, Math.ceil((yc + dy - g.y0) / g.step));
    const i0 = Math.floor((xc - dx - g.x0) / g.step);
    const i1 = Math.ceil((xc + dx - g.x0) / g.step);
    for (let j = j0; j <= j1; j++)
      for (let ii = i0; ii <= i1; ii++) {
        let i = ii;
        if (g.wrap) i = ((i % g.w) + g.w) % g.w;
        else if (i < 0 || i >= g.w) continue;
        const x = T.cosLat[j] * T.cosLon[i];
        const y = T.cosLat[j] * T.sinLon[i];
        const z = T.sinLat[j];
        const chord = Math.hypot(x - s.p[0], y - s.p[1], z - s.p[2]);
        const v = s.strength * gauss(chord * g.R, s.radiusKm);
        const k = j * g.w + i;
        if (v > out[k]) out[k] = v;
      }
  }
  return out;
}

/** Flat maps: land fades out toward the map's edges, so the world sits in a sea instead of being cut off. */
function flatEdges(g: Grid, landness: Float32Array): Float32Array {
  for (let j = 0; j < g.h; j++)
    for (let i = 0; i < g.w; i++) {
      const u = (g.x0 + (i + 0.5) * g.step) / g.W;
      const v = (g.y0 + (j + 0.5) * g.step) / g.H;
      const edge = Math.min(u, 1 - u, v, 1 - v);
      landness[j * g.w + i] -= 3 * (1 - smoothstep(0.01, 0.09, edge));
    }
  return landness;
}

/** Whole-world shape from plate tectonics, retrying plate layouts that don't fit the requested type. */
function worldShape(p: GenParams, layout: Layout, mid: Grid, R: number, progress: Progress): Shape {
  // plates always move on a whole sphere; flat maps then read their patch of it
  const coarse = mid.proj ? makeGrid(512, 256, R, 1) : makeGrid(p.W, p.H, R, p.W / 512);
  const check = mid.proj ? makeGrid(p.W, p.H, R, Math.max(1, Math.round(Math.max(p.W, p.H) / 256)), { x0: 0, y0: 0, w: p.W, h: p.H }, mid.proj) : coarse;
  let best: Tectonics | null = null;
  let bestScore = Infinity;
  progress('Moving tectonic plates', 0);
  const base = plateBase(coarse, p.seed);
  for (let a = 0; a < 8 && bestScore > 0; a++) {
    progress('Moving tectonic plates', (a + 1) / 9);
    // a flat map sees a few plates of a whole planet: more, smaller plates put several landmasses on it
    const t = tectonics(coarse, subSeed(p.seed, 100 + a), layout, p.landFraction, base, mid.proj ? 2.5 : 1);
    const s = layoutMismatch(check, check === coarse ? t.landness : flatEdges(check, resampleFromSphere(t.landness, coarse, check)), p.landFraction, layout);
    if (s < bestScore) {
      best = t;
      bestScore = s;
    }
  }
  const t = best!;
  progress('Shaping coasts', 0);
  const up = (f: Float32Array) => (mid.proj ? resampleFromSphere(f, coarse, mid) : resample(f, coarse, mid, 'bspline'));
  const shape: Shape = {
    landness: up(t.landness),
    crust: up(t.crust),
    orogen: up(t.orogen),
    arc: up(t.arc),
    trench: up(t.trench),
    ridge: up(t.ridge),
    rift: up(t.rift),
    old: up(t.old),
    hot: splatHotspots(mid, t),
  };
  const n = new Simplex3(subSeed(p.seed, 20));
  const T = sphereTables(mid);
  const arch = layout === 'archipelago';
  // island groups: a slow "where" field times a fast "which islands" field
  const groups = arch ? resample(lowField(coarse, (x, y, z) => smoothstep(-0.15, 0.45, n.fbm(x, y + 7, z, 2.6, 3))), coarse, mid, 'bspline') : null;
  const coastOctaves = Math.max(3, Math.floor(Math.log2((2 * Math.PI) / (4 * radPerCell(mid) * mid.step) / 5.5)) + 1);
  // fine coastline noise only matters near the coast: estimate where that is first
  const t0 = thresholdForFraction(shape.landness, mid, p.landFraction);
  for (let j = 0; j < mid.h; j++)
    for (let i = 0; i < mid.w; i++) {
      const k = j * mid.w + i;
      const x = T.cosLat[j] * T.cosLon[i];
      const y = T.cosLat[j] * T.sinLon[i];
      const z = T.sinLat[j];
      let L = shape.landness[k];
      if (shape.arc[k] > 0.01) L += (arch ? 0.9 : 0.75) * shape.arc[k] * smoothstep(-0.05, 0.45, n.fbm(x, y, z, 17, 3));
      L += (arch ? 1.1 : 0.95) * shape.hot[k];
      if (arch) L += groups![k] * (0.35 + 0.45 * n.fbm(x, y - 3.3, z, 9, 4));
      // coasts are fractal (Mandelbrot 1967): bays within bays down to the grid's resolution,
      // with fine octaves fading slowly (gain 0.62) like real shorelines, D ≈ 1.1–1.25
      else if (Math.abs(L - t0) < 0.5) L += 0.4 * n.fbm(x + 2.7, y, z, 5.5, coastOctaves, 0.62);
      shape.landness[k] = L;
    }
  if (mid.proj) flatEdges(mid, shape.landness);
  return shape;
}

/** Island or archipelago shaped inside a rectangle of the map. */
function regionShape(p: GenParams, mid: Grid): Shape {
  const N = mid.w * mid.h;
  const rnd = mulberry32(subSeed(p.seed, 30));
  const n = new Simplex3(subSeed(p.seed, 31));
  const T = sphereTables(mid);
  const span = Math.max(mid.w, mid.h);
  const f = (2 * Math.PI) / (span * mid.step * radPerCell(mid)); // one wavelength across the region
  const s: Shape = {
    landness: new Float32Array(N),
    crust: new Float32Array(N),
    orogen: new Float32Array(N),
    arc: new Float32Array(N),
    trench: new Float32Array(N),
    ridge: new Float32Array(N),
    rift: new Float32Array(N),
    old: new Float32Array(N),
    hot: new Float32Array(N),
  };
  const ang = rnd() * Math.PI;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const elong = 0.55 + 0.4 * rnd();
  const blobs: [number, number, number][] = [];
  if (p.type === 'archipelago') {
    const count = 6 + Math.floor(rnd() * 9);
    for (let b = 0; b < count; b++) blobs.push([0.15 + 0.7 * rnd(), 0.15 + 0.7 * rnd(), 0.04 + 0.09 * rnd()]);
  }
  const arcR = 0.5 + rnd() * 0.6;
  const arcC: [number, number] = [0.5 + Math.cos(ang) * arcR, 0.5 + Math.sin(ang) * arcR];
  for (let j = 0; j < mid.h; j++)
    for (let i = 0; i < mid.w; i++) {
      const k = j * mid.w + i;
      const x = T.cosLat[j] * T.cosLon[i];
      const y = T.cosLat[j] * T.sinLon[i];
      const z = T.sinLat[j];
      const u = (i + 0.5) / mid.w - 0.5;
      const v = (j + 0.5) / mid.h - 0.5;
      const edge = Math.min(0.5 - Math.abs(u), 0.5 - Math.abs(v));
      const fade = smoothstep(0.02, 0.14, edge);
      const warp = 0.18 * n.fbm(x, y, z, f * 1.3, 3);
      if (p.type === 'island') {
        const a = (u * ca + v * sa) / 0.5;
        const b = (-u * sa + v * ca) / (0.5 * elong);
        const d = Math.hypot(a, b) + warp;
        s.crust[k] = 1 - smoothstep(0.3, 0.95, d);
        // a mountain spine along the long axis
        const spine = Math.abs(b + 0.25 * n.fbm(x, y, z, f * 1.1, 2)) * elong;
        s.orogen[k] = gauss(spine, 0.13) * s.crust[k] * (0.55 + 0.45 * n.fbm(x + 4, y, z, f * 2, 2));
        s.landness[k] = s.crust[k] + 0.22 * n.fbm(x + 2.7, y, z, f * 3.5, 5) + 0.2 * s.orogen[k];
      } else {
        let best = 0;
        for (const [bx, by, br] of blobs) best = Math.max(best, gauss(Math.hypot(u + 0.5 - bx, v + 0.5 - by) + warp * 0.4, br));
        const arcD = Math.abs(Math.hypot(u + 0.5 - arcC[0], v + 0.5 - arcC[1]) - arcR);
        s.arc[k] = gauss(arcD, 0.035) * smoothstep(-0.05, 0.45, n.fbm(x, y, z, f * 9, 3));
        s.crust[k] = best * 0.5;
        s.landness[k] = best * 0.8 + 0.28 * n.fbm(x + 2.7, y, z, f * 4, 5) + 0.7 * s.arc[k];
      }
      s.landness[k] = s.landness[k] * fade - (1 - fade) * 0.8;
    }
  return s;
}

/** Densify a polyline to points at most `step` cells apart. */
function densify(pts: [number, number][], step: number): [number, number][] {
  const out: [number, number][] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let s = 1; s <= n; s++) out.push([ax + ((bx - ax) * s) / n, ay + ((by - ay) * s) / n]);
  }
  return out;
}

/**
 * Cut each river's bed into the full-resolution heights (metres above sea):
 * the bed never rises from source to mouth, and a shallow valley follows it.
 */
export function carveRivers(g: Grid, height: Float32Array, rivers: GenRiver[], cellKm: number) {
  // the bed follows the terrain as it was, not the trench already cut behind it
  const terrain = height.slice();
  for (const r of rivers) {
    // a river ends where it first reaches the sea (fine coastlines can cut it short of its traced mouth)
    const end = r.points.findIndex(([x, y]) => sampleAt(terrain, g, x, y) <= 0);
    if (end >= 0) r.points = r.points.slice(0, end + 1);
  }
  // twice: the second pass lets every river meet the beds cut near it by the others
  for (let pass = 0; pass < 2; pass++) for (const r of rivers) {
    const widthCells = r.widthKm / cellKm;
    const radius = Math.min(4, 1.6 + widthCells * 0.7);
    const depth = 4 + 3 * widthCells;
    let bed = Infinity;
    for (const [x, y] of densify(r.points, 0.5)) {
      // the river's own end was trimmed above; a dip into a narrow strait on the way is just skipped
      if (sampleAt(terrain, g, x, y) <= 0) continue;
      // the lowest cell under the river, so no pocket beside the bed sits below it
      let here = Infinity;
      for (let dj = 0; dj <= 1; dj++)
        for (let di = 0; di <= 1; di++) {
          let i = Math.floor(x - g.x0 - 0.5) + di;
          const j = Math.min(g.h - 1, Math.max(0, Math.floor(y - g.y0 - 0.5) + dj));
          if (g.wrap) i = ((i % g.w) + g.w) % g.w;
          else i = Math.min(g.w - 1, Math.max(0, i));
          // a deeper bed already cut beside us (another river) pulls ours down to meet it
          const v = Math.min(terrain[j * g.w + i], height[j * g.w + i] + depth);
          if (v > 0 && v < here) here = v;
        }
      if (here === Infinity) continue;
      bed = Math.min(bed, here);
      const cut = Math.max(1, bed - depth);
      const ci = Math.floor(x - g.x0);
      const cj = Math.floor(y - g.y0);
      const R = Math.ceil(radius);
      for (let dj = -R; dj <= R; dj++) {
        const j = cj + dj;
        if (j < 0 || j >= g.h) continue;
        for (let di = -R; di <= R; di++) {
          let i = ci + di;
          if (g.wrap) i = ((i % g.w) + g.w) % g.w;
          else if (i < 0 || i >= g.w) continue;
          const k = j * g.w + i;
          const v = height[k];
          if (v <= 0 || v <= cut) continue;
          // a flat bed about a cell wide, then the valley sides
          const d = Math.hypot(g.x0 + ci + di + 0.5 - x, g.y0 + j + 0.5 - y);
          if (d >= radius) continue;
          const sideT = Math.max(0, d - 0.8) / Math.max(0.01, radius - 0.8);
          height[k] = Math.min(v, cut + sideT * sideT * (v - cut));
        }
      }
    }
  }
}

/** Biome weights from climate, relief and water (rivers, flow, coasts). */
function paintBiomes(
  p: GenParams,
  mid: Grid,
  h: Float32Array,
  clim: Climate,
  coastKm: Float32Array,
  flow: Float32Array,
  maxFlow: number,
  rivers: GenRiver[],
  bg: { x0: number; y0: number; w: number; h: number },
): Uint8Array {
  const N = mid.w * mid.h;
  // slope (m per km) on the working grid
  const slope = new Float32Array(N);
  const dy = (mid.step * Math.PI * mid.R) / mid.H;
  for (let j = 0; j < mid.h; j++) {
    const dx = Math.max(1, ((mid.step * 2 * Math.PI * mid.R) / mid.W) * Math.cos(Math.PI / 2 - ((mid.y0 + (j + 0.5) * mid.step) / mid.H) * Math.PI));
    for (let i = 0; i < mid.w; i++) {
      const k = j * mid.w + i;
      const l = mid.wrap ? j * mid.w + ((i - 1 + mid.w) % mid.w) : j * mid.w + Math.max(0, i - 1);
      const r = mid.wrap ? j * mid.w + ((i + 1) % mid.w) : j * mid.w + Math.min(mid.w - 1, i + 1);
      const u = Math.max(0, j - 1) * mid.w + i;
      const d = Math.min(mid.h - 1, j + 1) * mid.w + i;
      slope[k] = Math.hypot((Math.max(0, h[r]) - Math.max(0, h[l])) / (2 * dx), (Math.max(0, h[d]) - Math.max(0, h[u])) / (2 * dy));
    }
  }
  // distance to the nearest river, and how big that river is
  const onRiver = new Uint8Array(N);
  const size = new Float32Array(N);
  for (const r of rivers)
    for (const [x, y] of densify(r.points, mid.step * 0.5)) {
      let i = Math.floor((x - mid.x0) / mid.step);
      const j = Math.floor((y - mid.y0) / mid.step);
      if (mid.wrap) i = ((i % mid.w) + mid.w) % mid.w;
      if (i < 0 || i >= mid.w || j < 0 || j >= mid.h) continue;
      const k = j * mid.w + i;
      onRiver[k] = 1;
      size[k] = Math.max(size[k], r.widthKm);
    }
  const riv = distanceField(mid, onRiver, 2000);
  const patchN = new Simplex3(subSeed(p.seed, 70));
  const out = new Uint8Array(bg.w * bg.h * BIOME_CHANNELS);
  const wts = new Float32Array(BIOME_CHANNELS);
  const logMax = Math.log(maxFlow);
  for (let j = 0; j < bg.h; j++)
    for (let i = 0; i < bg.w; i++) {
      const wx = (bg.x0 + i) * 2 + 1;
      const wy = (bg.y0 + j) * 2 + 1;
      // nearest working-grid cell for the discrete fields
      let mi = Math.floor((wx - mid.x0) / mid.step);
      const mj = Math.min(mid.h - 1, Math.max(0, Math.floor((wy - mid.y0) / mid.step)));
      mi = mid.wrap ? ((mi % mid.w) + mid.w) % mid.w : Math.min(mid.w - 1, Math.max(0, mi));
      const mk = mj * mid.w + mi;
      // coastal lowlands sit only metres above the sea: land if either the cell or its neighbourhood is
      let e = sampleAt(h, mid, wx, wy);
      if (e <= 0 && h[mk] <= 0) continue;
      e = Math.max(e, h[mk], 1);
      const dRiver = riv.dist[mk];
      const bigness = riv.near[mk] >= 0 ? smoothstep(3, 9, size[riv.near[mk]]) : 0;
      const lat = latOf(mid, wy);
      const lon = lonOf(mid, wx);
      biomeWeights(
        {
          t: sampleAt(clim.temp, mid, wx, wy),
          r: sampleAt(clim.rain, mid, wx, wy),
          elev: e,
          slope: slope[mk],
          flow: flow[mk] > 1 ? Math.max(0, Math.log(flow[mk]) / logMax) : 0,
          river: Math.exp(-dRiver / 110),
          bigRiver: Math.exp(-dRiver / 75) * bigness,
          coast: coastKm[mk],
          patch: 0.5 + 0.5 * patchN.fbm(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat), 40, 2),
          dry: sampleAt(clim.dry, mid, wx, wy),
        },
        wts,
      );
      let total = 0;
      for (let c = 0; c < BIOME_CHANNELS; c++) total += wts[c];
      total = Math.max(1, total);
      const o = (j * bg.w + i) * BIOME_CHANNELS;
      for (let c = 0; c < BIOME_CHANNELS; c++) out[o + c] = (wts[c] / total) * 235;
    }
  return out;
}

/**
 * Generate a world (or land inside a region). `progress` reports stages for
 * the busy indicator.
 */
export function generate(p: GenParams, progress: Progress = () => {}): GenResult {
  const R = p.radiusKm ?? 6371;
  const realism: Realism = p.realism ?? 'easy';
  // flat maps are a conformal patch of a virtual planet; their grids never wrap
  const proj = p.flat ? mercatorPatch(p.W, p.H, R, (p.flat.spanLonDeg * Math.PI) / 180) : undefined;
  const whole = !p.region || p.type === 'continents' || p.type === 'pangaea';
  const rx0 = whole ? 0 : Math.max(0, Math.floor(p.region!.x0));
  const ry0 = whole ? 0 : Math.max(0, Math.floor(p.region!.y0));
  const rw = whole ? p.W : Math.max(16, Math.min(p.W, Math.ceil(p.region!.x1 - p.region!.x0)));
  const rh = whole ? p.H : Math.max(16, Math.min(p.H - ry0, Math.ceil(p.region!.y1 - p.region!.y0)));
  const region = whole ? (proj ? { x0: 0, y0: 0, w: p.W, h: p.H } : undefined) : { x0: rx0, y0: ry0, w: rw, h: rh };
  const G = (step: number) => makeGrid(p.W, p.H, R, step, region, proj);
  const midStep = Math.max(rw, rh) >= 1024 ? 2 : 1;
  const mid = G(midStep);
  const layout = layoutFor(p);
  const N = mid.w * mid.h;

  // ---- shape: where land goes
  const s = p.sketch ? sketchShape(p.sketch, mid, p.seed) : whole ? worldShape(p, layout, mid, R, progress) : regionShape(p, mid);
  const t = p.sketch ? 0 : thresholdForFraction(s.landness, mid, p.landFraction);
  const isCoast = new Uint8Array(N);
  const land = new Uint8Array(N);
  for (let k = 0; k < N; k++) land[k] = s.landness[k] > t ? 1 : 0;
  // pockets of sea inside the land read as noise, not lakes: keep only real inland seas
  {
    const water = new Uint8Array(N);
    for (let k = 0; k < N; k++) water[k] = land[k] ? 0 : 1;
    const wc = components(mid, water);
    let biggest = 0;
    for (let c = 1; c < wc.count; c++) if (wc.area[c] > wc.area[biggest]) biggest = c;
    const minSea = 4 * Math.PI * R * R * 1.5e-3;
    for (let k = 0; k < N; k++) {
      const c = wc.label[k];
      if (c >= 0 && c !== biggest && wc.area[c] < minSea) land[k] = 1;
    }
  }
  for (let j = 0; j < mid.h; j++)
    for (let i = 0; i < mid.w; i++) {
      const k = j * mid.w + i;
      const r = mid.wrap ? j * mid.w + ((i + 1) % mid.w) : i + 1 < mid.w ? k + 1 : k;
      const d = j + 1 < mid.h ? k + mid.w : k;
      if (land[r] !== land[k]) isCoast[k] = isCoast[r] = 1;
      if (land[d] !== land[k]) isCoast[k] = isCoast[d] = 1;
    }
  const coastKm = distanceField(mid, isCoast, 4000).dist;

  // ---- elevation (metres above sea level) on the working grid
  progress('Raising mountains', 0);
  // h: a first sketch of the relief that only routes the rivers; the land's
  // final heights come from uplift (U) in balance with river incision
  const h = new Float32Array(N);
  const rug = new Float32Array(N);
  const U = new Float32Array(N);
  const built = new Float32Array(N);
  const nA = new Simplex3(subSeed(p.seed, 40));
  const nB = new Simplex3(subSeed(p.seed, 41));
  const nC = new Simplex3(subSeed(p.seed, 42));
  const T = sphereTables(mid);
  // slow-varying fields are computed 4× coarser and interpolated
  const lo = G(midStep * 4);
  const up = (f: (x: number, y: number, z: number) => number) => resample(lowField(lo, f), lo, mid, 'bspline');
  const plateauN = up((x, y, z) => smoothstep(0.12, 0.42, nA.fbm(x, y, z, 2.4, 3)));
  const hillN = up((x, y, z) => smoothstep(-0.05, 0.4, nA.fbm(x + 6.1, y, z, 3.2, 3)));
  // broad sinking lowlands (sedimentary basins) between rising shields
  const basinN = up((x, y, z) => 0.3 + 1.1 * smoothstep(-0.35, 0.35, nA.fbm(x - 4.2, y + 1.3, z, 1.8, 3)));
  const seaN = up((x, y, z) => 1.05 + 0.12 * nA.fbm(x, y, z, 2.2, 3) + 0.03 * nB.fbm(x, y, z, 9, 2));
  const maxE = p.maxElevation;
  const rough = clamp(p.roughness, 0, 1);
  const mtnTop = maxE * clamp(p.mountains, 0, 1);
  const abyssBase = Math.max(2500, -p.oceanFloor + p.seaLevel);
  const deepest = Math.max(abyssBase + 500, p.seaLevel - p.minElevation);
  for (let j = 0; j < mid.h; j++)
    for (let i = 0; i < mid.w; i++) {
      const k = j * mid.w + i;
      const x = T.cosLat[j] * T.cosLon[i];
      const y = T.cosLat[j] * T.sinLon[i];
      const z = T.sinLat[j];
      const d = coastKm[k];
      if (land[k]) {
        const o = Math.max(0, s.orogen[k]);
        const inland = smoothstep(0, 900, d);
        const base = 6 + 170 * Math.pow(inland, 0.75);
        // broad flat uplands (high plains / plateaus) away from coasts and ranges
        const plateau = 620 * plateauN[k] * smoothstep(120, 600, d) * (1 - Math.min(1, o * 1.5));
        // where hills grow at all; elsewhere the land stays flat (plains, steppe)
        const hillZone = hillN[k];
        const r = clamp(0.03 + 0.04 * rough + hillZone * (0.1 + 0.75 * rough) + 1.1 * o + 0.7 * s.old[k] + 0.5 * s.arc[k] + 0.5 * s.hot[k], 0, 1);
        rug[k] = r;
        const hills = r * (120 + 520 * rough) * (0.5 + 0.5 * nB.fbm(x, y, z, 16, 4));
        const wx = 0.08 * nC.fbm(x, y, z, 5, 2);
        const ridges = o > 0.01 ? nB.ridged(x + wx, y - wx, z + wx, 11, 5) : 0;
        const mtn = mtnTop * Math.pow(Math.min(1, o), 1.15) * (0.28 + 0.8 * ridges);
        const oldM = s.old[k] > 0.01 ? 1700 * clamp(p.mountains, 0, 1) * s.old[k] * (0.3 + 0.7 * nB.ridged(x - 3, y, z, 13, 4)) : 0;
        const volc = (s.arc[k] > 0.01 ? 2400 * s.arc[k] * (0.35 + 0.65 * smoothstep(-0.2, 0.6, nC.fbm(x, y, z, 20, 2))) : 0) + 3600 * Math.pow(s.hot[k], 1.6);
        const coastSoft = 0.45 + 0.55 * smoothstep(0, 60, d);
        h[k] = Math.max(2, base + plateau + (hills + mtn + oldM + volc) * coastSoft);
        // channel steepness (m/km at 1 km² of upstream area): tens on plains, hundreds in young ranges
        const het = 0.65 + 0.7 * (0.5 + 0.5 * nC.fbm(x - 1.7, y, z, 7, 3));
        U[k] = het * (UPLIFT.plain * basinN[k] + UPLIFT.hills * hillZone * (0.25 + rough) + UPLIFT.range * clamp(p.mountains, 0, 1) * Math.pow(Math.min(1, o), 1.2) + UPLIFT.old * s.old[k] + UPLIFT.arc * s.arc[k]);
        // what uplift and incision don't make: tablelands and volcanoes
        // (arcs already rise through uplift; their volcanoes add only cones on top)
        built[k] = 6 + plateau + 0.45 * volc * coastSoft;
      } else {
        const crust = s.crust[k];
        const shelfW = 45 + 190 * crust * (1 - 0.6 * Math.min(1, s.orogen[k] * 2));
        const shelf = 20 + 130 * smoothstep(0, shelfW, d);
        const abyss = abyssBase * seaN[k];
        let depth = shelf + (abyss - shelf) * smoothstep(shelfW, shelfW + 420, d);
        depth -= 2300 * s.ridge[k] + 2400 * s.hot[k] + 1800 * Math.max(0, s.arc[k]);
        depth += (deepest - abyss) * 0.92 * s.trench[k];
        // seamounts and ridges stay submerged away from the coast (no almost-islands awash at the surface)
        h[k] = -clamp(depth, 3 + Math.min(60, 0.45 * d), deepest);
        rug[k] = 0.15;
      }
    }

  // ---- climate: prevailing winds and rain shadows at every realism level, so previews match the result
  progress('Simulating climate', 0);
  // flat maps: a band of climate around the chosen latitude instead of the patch's own latitudes
  const climateLat =
    proj && p.flat
      ? (lat: number) => ((p.flat!.climateLatDeg + (lat / Math.max(1e-6, proj.lat(0))) * (p.flat!.climateSpanDeg / 2)) * Math.PI) / 180
      : undefined;
  const climOpts = { warmth: p.warmth ?? 0, wetness: p.wetness ?? 0, winds: true, seed: subSeed(p.seed, 50), climateLat };
  let clim = climate(mid, h, coastKm, climOpts);
  if (p.sketch) sketchClimate(p.sketch, mid, clim.temp, clim.rain);

  // ---- relief: uplift in balance with river incision (wetter land wears lower); more passes let the network settle
  const PASSES: Record<Realism, number> = { easy: 2, medium: 3, high: 4, ultra: 4 };
  const passes = PASSES[realism];
  // dry land still wears down in flash floods: incision never sees less than a modest rainfall
  const erosionRain = clim.rain.map((r) => Math.max(0.4, r));
  const rel = steadyState(mid, h, U, erosionRain, { theta: THETA, maxSlope: MAX_SLOPE_M_PER_KM, passes }, (i) => progress('Carving valleys', (i + 1) / passes));
  // the highest ranges ease into the chosen summit height instead of piling past it
  const knee = 0.55 * mtnTop;
  const soft = (v: number) => (v <= knee ? v : knee + (mtnTop - knee) * Math.tanh((v - knee) / Math.max(1, mtnTop - knee)));
  for (let k = 0; k < N; k++)
    if (land[k]) {
      h[k] = Math.max(2, soft(built[k] + rel[k]));
      rug[k] = clamp(U[k] / 500, 0.03, 1);
    }
  // low, gently uplifted land is shaped more by soil creep than by rivers (a low
  // Péclet number, Perron et al. 2009): plains come out smooth, ranges stay sharp
  const creep = blurKm(h, mid, 1.5 * dyKm(mid), 2);
  for (let k = 0; k < N; k++) if (land[k]) h[k] = Math.max(2, h[k] + (1 - smoothstep(25, 220, U[k])) * 0.5 * (creep[k] - h[k]));
  diffuse(mid, h, realism === 'easy' ? 1 : 2);
  clim = climate(mid, h, coastKm, climOpts);
  if (p.sketch) sketchClimate(p.sketch, mid, clim.temp, clim.rain);

  // ---- drainage: closed basins fill into flat alluvial plains; upstream area feeds rivers, swamps and farmland
  progress('Tracing rivers', 0);
  const midCellKm = (midStep * 2 * Math.PI * R) / p.W;
  const minRiverArea = 24 * midCellKm * midCellKm;
  const drained = drain(mid, h, true);
  const flow = accumulate(mid, drained, clim.rain);
  let maxFlow = 1;
  for (let k = 0; k < N; k++) if (h[k] > 0 && flow[k] > maxFlow) maxFlow = flow[k];
  const trace = (g: Grid, d: Drainage, A: Float32Array, hh: Float32Array, maxA: number): GenRiver[] =>
    traceRivers(g, d, A, hh, p.rivers, Math.max(minRiverArea, maxA * 0.004)).map((r) => {
      const widthKm = 2.5 + 16 * Math.sqrt(r.area / maxA);
      return { points: r.points, widthKm, widthCells: widthKm / dyKm(mid) * midStep };
    });
  let rivers: GenRiver[] = realism === 'ultra' || p.rivers <= 0 ? [] : trace(mid, drained, flow, h, maxFlow);

  // ---- full resolution: smooth interpolation plus fine detail where the land is rough
  progress('Adding detail', 0);
  const full = G(1);
  const height = midStep === 1 ? h.slice() : resample(h, mid, full, 'catmull');
  const rugF = midStep === 1 ? rug : resample(rug, mid, full, 'bspline');
  const coarseH = midStep === 1 ? null : h;
  const nD = new Simplex3(subSeed(p.seed, 60));
  const FT = sphereTables(full);
  // about one full-resolution cell per feature
  const fineF = (2 * Math.PI) / (7 * radPerCell(full));
  const amp = 40 + 260 * rough;
  for (let j = 0; j < full.h; j++)
    for (let i = 0; i < full.w; i++) {
      const k = j * full.w + i;
      let v = height[k];
      const x = FT.cosLat[j] * FT.cosLon[i];
      const y = FT.cosLat[j] * FT.sinLon[i];
      const z = FT.sinLat[j];
      // keep the coastline where the working grid put it
      const wasLand = coarseH ? sampleAt(coarseH, mid, full.x0 + i + 0.5, full.y0 + j + 0.5) > 0 : v > 0;
      const r = rugF[k];
      if (wasLand && r > 0.06) v += r * r * amp * nD.fbm(x, y, z, fineF, 2);
      height[k] = wasLand ? Math.max(1, v) : Math.min(-2, v);
    }
  if (realism === 'ultra') {
    // fine valleys cut into the full-resolution relief, then rivers that follow them
    const rainF = resample(clim.rain, mid, full, 'bspline');
    erode(full, height, rainF, 10, ERODE_K, (i) => progress('Carving fine valleys', (i + 1) / 10));
    progress('Tracing rivers', 0);
    if (p.rivers > 0) {
      const d = drain(full, height, true);
      const A = accumulate(full, d, rainF);
      let mA = 1;
      for (let k = 0; k < A.length; k++) if (height[k] > 0 && A[k] > mA) mA = A[k];
      rivers = trace(full, d, A, height, mA);
    }
  }
  // every river runs downhill in its own bed
  carveRivers(full, height, rivers, dyKm(full));

  // ---- biomes on the half-resolution biome grid, from climate, terrain and water
  progress('Painting biomes', 0);
  const bx0 = Math.floor(rx0 / 2);
  const by0 = Math.floor(ry0 / 2);
  const bw = Math.ceil(rw / 2);
  const bh = Math.ceil(rh / 2);
  let biome: Uint8Array | null = null;
  if (p.biomes) biome = paintBiomes(p, mid, h, clim, coastKm, flow, maxFlow, rivers, { x0: bx0, y0: by0, w: bw, h: bh });

  for (let k = 0; k < height.length; k++) height[k] = clamp(p.seaLevel + height[k], p.minElevation, p.seaLevel + maxE);
  progress('Done', 1);
  return {
    height,
    biome,
    biomeRegion: { x0: bx0, y0: by0, w: bw, h: bh },
    region: { x0: rx0, y0: ry0, w: rw, h: rh },
    rivers,
  };
}

/** Small RGBA picture of a generated world for previews (biomes, depth and hill shading). */
export function previewImage(r: GenResult, w: number): Uint8ClampedArray {
  const H = r.region.h;
  const out = new Uint8ClampedArray(w * H * 4);
  const pal: [number, number, number][] = [
    [150, 170, 104],
    [79, 116, 62],
    [190, 170, 110],
    [214, 190, 135],
    [104, 120, 84],
    [240, 242, 246],
    [140, 132, 120],
    [196, 184, 120],
  ];
  for (let j = 0; j < H; j++)
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      const v = r.height[k];
      const o = k * 4;
      if (v <= 0) {
        const d = Math.min(1, -v / 5000);
        out[o] = 92 - 50 * d;
        out[o + 1] = 140 - 60 * d;
        out[o + 2] = 170 - 50 * d;
      } else {
        let cr = 0;
        let cg = 0;
        let cb = 0;
        let tw = 0;
        if (r.biome) {
          const bo = (Math.min(r.biomeRegion.h - 1, j >> 1) * r.biomeRegion.w + Math.min(r.biomeRegion.w - 1, i >> 1)) * BIOME_CHANNELS;
          for (let c = 0; c < BIOME_CHANNELS; c++) {
            const wv = r.biome[bo + c];
            cr += pal[c][0] * wv;
            cg += pal[c][1] * wv;
            cb += pal[c][2] * wv;
            tw += wv;
          }
        }
        if (tw < 1) {
          [cr, cg, cb] = [160, 170, 115];
          tw = 1;
        }
        const e = Math.min(1, v / 6000);
        out[o] = (cr / tw) * (1 - e * 0.3) + 200 * e * 0.3;
        out[o + 1] = (cg / tw) * (1 - e * 0.3) + 190 * e * 0.3;
        out[o + 2] = (cb / tw) * (1 - e * 0.3) + 180 * e * 0.3;
      }
      const l = r.height[j * w + ((i - 1 + w) % w)];
      const u = r.height[Math.max(0, j - 1) * w + i];
      const shade = clamp(1 + ((Math.max(0, l) - Math.max(0, v)) + (Math.max(0, u) - Math.max(0, v))) / 1800, 0.6, 1.3);
      out[o] *= shade;
      out[o + 1] *= shade;
      out[o + 2] *= shade;
      out[o + 3] = 255;
    }
  return out;
}
