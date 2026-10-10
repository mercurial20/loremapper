import { smoothstep } from '../../core/math';
import { Simplex3, subSeed } from '../../core/noise3';
import { blurKm, distanceField, dxKm, dyKm, makeGrid, resample, sphereTables, type Grid } from './grid';

/** A point on the map as fractions of its width and height: [0, 0] top left, [1, 1] bottom right. */
export type MapPoint = [u: number, v: number];

/**
 * A hand-drawn layout for the generator: where land and sea go and where
 * mountains rise. The generator turns it into real relief (uplift against
 * erosion), coasts, rivers, climate and biomes, so a sketch stays simple.
 */
export interface Sketch {
  /** Land outlines (closed polygons). */
  land: MapPoint[][];
  /** Water cut out of the land: inner seas, gulfs, great lakes. */
  sea?: MapPoint[][];
  /**
   * Mountain ranges along a line. `width` is a fraction of the map's width;
   * `height` 0..1 scales the uplift; old ranges are lower and rounder.
   */
  ranges?: { pts: MapPoint[]; width: number; height: number; old?: boolean }[];
  /** Volcanoes: position and strength 0..1. */
  volcanoes?: [u: number, v: number, strength: number][];
  /** How ragged the coasts are, 0..1 (default 0.5). */
  rough?: number;
  /** Regions with their own climate: rainfall multiplied by `rain`, temperature shifted by `temp` °C. */
  climate?: { pts: MapPoint[]; rain?: number; temp?: number }[];
}

/** Apply a sketch's climate regions (with soft edges) to temperature and rainfall on a grid. */
export function sketchClimate(sk: Sketch, g: Grid, temp: Float32Array, rain: Float32Array) {
  if (!sk.climate?.length) return;
  const N = g.w * g.h;
  for (const zone of sk.climate) {
    const m = new Float32Array(N);
    for (let j = 0; j < g.h; j++)
      for (let i = 0; i < g.w; i++) m[j * g.w + i] = insideWrapped(zone.pts, (g.x0 + (i + 0.5) * g.step) / g.W, (g.y0 + (j + 0.5) * g.step) / g.H, g.wrap) ? 1 : 0;
    let widthKm = 0;
    for (let i = 0; i < g.w; i++) widthKm += dxKm(g, g.h >> 1);
    const soft = blurKm(m, g, 0.03 * widthKm, 2);
    for (let k = 0; k < N; k++) {
      const f = soft[k];
      if (f <= 0.001) continue;
      if (zone.rain !== undefined) rain[k] *= 1 + (zone.rain - 1) * f;
      if (zone.temp !== undefined) temp[k] += zone.temp * f;
    }
  }
}

/** Fields the elevation model needs, on the working ("mid") grid. */
export interface Shape {
  landness: Float32Array;
  crust: Float32Array;
  orogen: Float32Array;
  arc: Float32Array;
  trench: Float32Array;
  ridge: Float32Array;
  rift: Float32Array;
  old: Float32Array;
  hot: Float32Array;
}

/** Point in polygon; on a planet the map wraps east–west, so outlines may run past either edge. */
function insideWrapped(poly: MapPoint[], u: number, v: number, wrap: boolean): boolean {
  return inside(poly, u, v) || (wrap && (inside(poly, u - 1, v) || inside(poly, u + 1, v)));
}

function inside(poly: MapPoint[], u: number, v: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ui, vi] = poly[i];
    const [uj, vj] = poly[j];
    if (vi > v !== vj > v && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) c = !c;
  }
  return c;
}

/** Distance from (x, y) to a polyline, in the same units as the points. */
function toPolyline(pts: [number, number][], x: number, y: number): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return best;
}

/**
 * The generator's shape fields from a sketch. Land is where `landness` > 0:
 * a signed distance to the drawn coast, frayed by fractal noise.
 */
export function sketchShape(sk: Sketch, mid: Grid, seed: number): Shape {
  const W = mid.W;
  const H = mid.H;
  // outlines are traced on a coarse grid, then smoothed onto the working grid
  const cstep = Math.max(mid.step, Math.ceil(Math.max(W, H) / 512));
  // planets wrap east–west; flat maps are a fixed rectangle
  const wrap = !mid.proj && mid.wrap;
  const coarse = wrap ? makeGrid(W, H, mid.R, cstep) : makeGrid(W, H, mid.R, cstep, { x0: 0, y0: 0, w: W, h: H }, mid.proj);
  const cN = coarse.w * coarse.h;
  const isLand = new Uint8Array(cN);
  const isSea = new Uint8Array(cN);
  // outlines are warped a little so no drawn straight edge survives
  const wn = new Simplex3(subSeed(seed, 21));
  const rough = sk.rough ?? 0.5;
  const warp = 0.025 + 0.035 * rough;
  for (let j = 0; j < coarse.h; j++)
    for (let i = 0; i < coarse.w; i++) {
      const u0 = (i + 0.5) / coarse.w;
      const v0 = (j + 0.5) / coarse.h;
      // noise sampled around a circle in u, so it joins up across a planet's seam
      const cu = Math.cos(2 * Math.PI * u0) / Math.PI;
      const su = Math.sin(2 * Math.PI * u0) / Math.PI;
      const u = u0 + warp * wn.fbm(cu * 2, su * 2, v0 * 2 + 0.5, 3, 4, 0.55);
      const v = v0 + warp * wn.fbm(cu * 2, su * 2, v0 * 2 + 7.5, 3, 4, 0.55);
      const land = sk.land.some((p) => insideWrapped(p, u, v, wrap)) && !(sk.sea ?? []).some((p) => insideWrapped(p, u, v, wrap));
      isLand[j * coarse.w + i] = land ? 1 : 0;
      isSea[j * coarse.w + i] = land ? 0 : 1;
    }
  const toSea = distanceField(coarse, isSea).dist;
  const toLand = distanceField(coarse, isLand).dist;
  // the map's size in the grid's km, for transitions that scale with the map
  let widthKm = 0;
  for (let i = 0; i < coarse.w; i++) widthKm += dxKm(coarse, coarse.h >> 1);
  const heightKm = coarse.h * dyKm(coarse);
  const coastKm = 0.035 * Math.max(widthKm, heightKm);
  const signed = new Float32Array(cN);
  for (let k = 0; k < cN; k++) signed[k] = isLand[k] ? Math.min(1.5, toSea[k] / coastKm) : -Math.min(1.5, toLand[k] / coastKm);

  // ranges and volcanoes, in km on the map
  const orogen = new Float32Array(cN);
  const old = new Float32Array(cN);
  const hot = new Float32Array(cN);
  const ranges = (sk.ranges ?? []).map((r) => ({ ...r, km: r.pts.map(([u, v]) => [u * widthKm, v * heightKm] as [number, number]), wKm: r.width * widthKm }));
  // on a planet a volcano near the seam is also near the far edge
  const dxw = (dx: number) => (wrap ? Math.abs(dx) - widthKm * Math.round(Math.abs(dx) / widthKm) : dx);
  for (let j = 0; j < coarse.h; j++)
    for (let i = 0; i < coarse.w; i++) {
      const k = j * coarse.w + i;
      const x = ((i + 0.5) / coarse.w) * widthKm;
      const y = ((j + 0.5) / coarse.h) * heightKm;
      // peaks and saddles along every range, and a wavering crest line
      const cx = Math.cos((2 * Math.PI * x) / widthKm) / Math.PI;
      const sx = Math.sin((2 * Math.PI * x) / widthKm) / Math.PI;
      const along = 0.6 + 0.55 * (0.5 + 0.5 * wn.fbm(cx, sx, y / widthKm + 3.3, 9, 3, 0.55));
      const wob = 0.4 * wn.fbm(cx, sx, y / widthKm + 9.1, 5, 3, 0.5);
      for (const r of ranges) {
        const d = (wrap ? Math.min(toPolyline(r.km, x, y), toPolyline(r.km, x - widthKm, y), toPolyline(r.km, x + widthKm, y)) : toPolyline(r.km, x, y)) * (1 + wob);
        const f = r.height * along * Math.exp(-((d / Math.max(1, r.wKm * 0.5)) ** 2));
        if (r.old) old[k] = Math.max(old[k], f);
        else orogen[k] = Math.max(orogen[k], f);
      }
      for (const [vu, vv, s] of sk.volcanoes ?? []) {
        const d = Math.hypot(dxw(x - vu * widthKm), y - vv * heightKm);
        hot[k] = Math.max(hot[k], s * Math.exp(-((d / (0.012 * widthKm)) ** 2)));
      }
    }

  const up = (f: Float32Array) => (coarse.step === mid.step ? f : resample(f, coarse, mid, 'bspline'));
  const s: Shape = {
    landness: up(signed),
    crust: new Float32Array(0),
    orogen: up(orogen),
    arc: new Float32Array(mid.w * mid.h),
    trench: new Float32Array(mid.w * mid.h),
    ridge: new Float32Array(mid.w * mid.h),
    rift: new Float32Array(mid.w * mid.h),
    old: up(old),
    hot: up(hot),
  };
  // fractal coasts (as in generated worlds), and ranges drawn into the sea rise as islands
  const n = new Simplex3(subSeed(seed, 20));
  const T = sphereTables(mid);
  // noise frequency in the sketch's own scale: the map spans about one unit
  const span = Math.max(mid.w * mid.step, mid.h * mid.step) / W;
  const f0 = 3 / span;
  // fine octaves stop a few cells short of the grid, or the shore breaks into specks
  const octaves = Math.max(3, Math.floor(Math.log2(Math.max(mid.w, mid.h) / 48)));
  s.crust = new Float32Array(mid.w * mid.h);
  for (let j = 0; j < mid.h; j++)
    for (let i = 0; i < mid.w; i++) {
      const k = j * mid.w + i;
      const x = T.cosLat[j] * T.cosLon[i];
      const y = T.cosLat[j] * T.sinLon[i];
      const z = T.sinLat[j];
      let L = s.landness[k];
      if (Math.abs(L) < 1.2) L += (0.25 + 0.4 * rough) * n.fbm(x + 2.7, y, z, f0 * 9, octaves, 0.55);
      L += 0.8 * Math.max(s.orogen[k], s.old[k] * 0.7) * smoothstep(-1, 0, L) + 1.2 * s.hot[k];
      s.landness[k] = L;
      s.crust[k] = smoothstep(-0.6, 0.4, L);
    }
  return s;
}
