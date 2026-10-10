/**
 * Raster helpers for the world generator. A Grid samples the equirectangular
 * world at some step (world cells per grid cell); fields are row-major
 * Float32Arrays. Distances and areas are true kilometres on the sphere.
 */
export interface Grid {
  w: number;
  h: number;
  /** World-cell origin of the grid. */
  x0: number;
  y0: number;
  /** World cells per grid cell. */
  step: number;
  /** x wraps around the planet (whole-world grids). */
  wrap: boolean;
  /** Full-resolution world size in cells. */
  W: number;
  H: number;
  /** Planet radius in km. */
  R: number;
}

export function makeGrid(W: number, H: number, R: number, step: number, region?: { x0: number; y0: number; w: number; h: number }): Grid {
  if (!region) return { w: Math.max(1, Math.round(W / step)), h: Math.max(1, Math.round(H / step)), x0: 0, y0: 0, step, wrap: true, W, H, R };
  return { w: Math.max(4, Math.ceil(region.w / step)), h: Math.max(4, Math.ceil(region.h / step)), x0: region.x0, y0: region.y0, step, wrap: false, W, H, R };
}

/** Latitude (radians) of a world y coordinate (cells). */
export const latOf = (g: Grid, y: number) => Math.PI / 2 - (y / g.H) * Math.PI;
/** Latitude (radians) at the centre of grid row j. */
export const rowLat = (g: Grid, j: number) => latOf(g, g.y0 + (j + 0.5) * g.step);
export const dyKm = (g: Grid) => (g.step * Math.PI * g.R) / g.H;
export const dxKm = (g: Grid, j: number) => Math.max(1e-3, ((g.step * 2 * Math.PI * g.R) / g.W) * Math.cos(rowLat(g, j)));

/** Exact surface area (km²) of one cell in grid row j. */
export function cellAreaKm2(g: Grid, j: number): number {
  const top = Math.min(Math.PI / 2, latOf(g, g.y0 + j * g.step));
  const bottom = Math.max(-Math.PI / 2, latOf(g, g.y0 + (j + 1) * g.step));
  return g.R * g.R * ((g.step * 2 * Math.PI) / g.W) * (Math.sin(top) - Math.sin(bottom));
}

/** Unit-sphere coordinates for every row and column, so callers can build points cheaply. */
export function sphereTables(g: Grid) {
  const cosLat = new Float64Array(g.h);
  const sinLat = new Float64Array(g.h);
  const cosLon = new Float64Array(g.w);
  const sinLon = new Float64Array(g.w);
  for (let j = 0; j < g.h; j++) {
    const la = rowLat(g, j);
    cosLat[j] = Math.cos(la);
    sinLat[j] = Math.sin(la);
  }
  for (let i = 0; i < g.w; i++) {
    const lo = ((g.x0 + (i + 0.5) * g.step) / g.W) * 2 * Math.PI;
    cosLon[i] = Math.cos(lo);
    sinLon[i] = Math.sin(lo);
  }
  return { cosLat, sinLat, cosLon, sinLon };
}

const bsplineW = (t: number, out: Float64Array) => {
  const t2 = t * t;
  const t3 = t2 * t;
  out[0] = (1 - 3 * t + 3 * t2 - t3) / 6;
  out[1] = (4 - 6 * t2 + 3 * t3) / 6;
  out[2] = (1 + 3 * t + 3 * t2 - 3 * t3) / 6;
  out[3] = t3 / 6;
};
const catmullW = (t: number, out: Float64Array) => {
  const t2 = t * t;
  const t3 = t2 * t;
  out[0] = (-t3 + 2 * t2 - t) / 2;
  out[1] = (3 * t3 - 5 * t2 + 2) / 2;
  out[2] = (-3 * t3 + 4 * t2 + t) / 2;
  out[3] = (t3 - t2) / 2;
};

/**
 * Resample a field onto another grid with a separable cubic filter. 'bspline'
 * is smooth (C2) and slightly softening — for control fields; 'catmull'
 * interpolates the samples exactly (C1) — for heights, so coasts stay put.
 */
export function resample(src: Float32Array, sg: Grid, dg: Grid, kind: 'bspline' | 'catmull' = 'bspline'): Float32Array {
  const weights = kind === 'bspline' ? bsplineW : catmullW;
  const wt = new Float64Array(4);
  const tapX = (u: number, idx: Int32Array, w: Float32Array, o: number) => {
    const i0 = Math.floor(u);
    weights(u - i0, wt);
    for (let k = 0; k < 4; k++) {
      let i = i0 - 1 + k;
      if (sg.wrap) i = ((i % sg.w) + sg.w) % sg.w;
      else i = i < 0 ? 0 : i >= sg.w ? sg.w - 1 : i;
      idx[o + k] = i;
      w[o + k] = wt[k];
    }
  };
  const colIdx = new Int32Array(dg.w * 4);
  const colW = new Float32Array(dg.w * 4);
  for (let i = 0; i < dg.w; i++) tapX((dg.x0 + (i + 0.5) * dg.step - sg.x0) / sg.step - 0.5, colIdx, colW, i * 4);
  // horizontal pass: every source row resampled to the destination width
  const tmp = new Float32Array(sg.h * dg.w);
  for (let j = 0; j < sg.h; j++) {
    const row = j * sg.w;
    const out = j * dg.w;
    for (let i = 0; i < dg.w; i++) {
      const o = i * 4;
      tmp[out + i] =
        src[row + colIdx[o]] * colW[o] + src[row + colIdx[o + 1]] * colW[o + 1] + src[row + colIdx[o + 2]] * colW[o + 2] + src[row + colIdx[o + 3]] * colW[o + 3];
    }
  }
  const dst = new Float32Array(dg.w * dg.h);
  for (let j = 0; j < dg.h; j++) {
    const v = (dg.y0 + (j + 0.5) * dg.step - sg.y0) / sg.step - 0.5;
    const j0 = Math.floor(v);
    weights(v - j0, wt);
    const r = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) {
      const jj = j0 - 1 + k;
      r[k] = (jj < 0 ? 0 : jj >= sg.h ? sg.h - 1 : jj) * dg.w;
    }
    const o = j * dg.w;
    for (let i = 0; i < dg.w; i++) dst[o + i] = tmp[r[0] + i] * wt[0] + tmp[r[1] + i] * wt[1] + tmp[r[2] + i] * wt[2] + tmp[r[3] + i] * wt[3];
  }
  return dst;
}

/** Bilinear sample of a grid field at a world position (cells). */
export function sampleAt(f: Float32Array, g: Grid, x: number, y: number): number {
  const u = (x - g.x0) / g.step - 0.5;
  const v = Math.min(g.h - 1, Math.max(0, (y - g.y0) / g.step - 0.5));
  let i0 = Math.floor(u);
  const j0 = Math.min(g.h - 2, Math.floor(v));
  const fx = u - i0;
  const fy = Math.min(1, v - Math.max(0, j0));
  let i1 = i0 + 1;
  if (g.wrap) {
    i0 = ((i0 % g.w) + g.w) % g.w;
    i1 = ((i1 % g.w) + g.w) % g.w;
  } else {
    i0 = Math.min(g.w - 1, Math.max(0, i0));
    i1 = Math.min(g.w - 1, Math.max(0, i1));
  }
  const ja = Math.max(0, j0) * g.w;
  const jb = Math.min(g.h - 1, Math.max(0, j0) + 1) * g.w;
  const a = f[ja + i0] + (f[ja + i1] - f[ja + i0]) * fx;
  const b = f[jb + i0] + (f[jb + i1] - f[jb + i0]) * fx;
  return a + (b - a) * fy;
}

/**
 * Approximate Gaussian blur with a radius in km: repeated box blurs whose
 * horizontal width grows towards the poles, where cells are narrower.
 */
export function blurKm(f: Float32Array, g: Grid, radiusKm: number, passes = 3): Float32Array {
  let a = f.slice();
  let b = new Float32Array(f.length);
  const row = new Float64Array(g.w * 3);
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < g.h; j++) {
      const r = Math.min(Math.floor((g.w - 1) / 2), Math.round(radiusKm / dxKm(g, j)));
      const o = j * g.w;
      if (r < 1) {
        for (let i = 0; i < g.w; i++) b[o + i] = a[o + i];
        continue;
      }
      // prefix sums over the row (tripled for wrap, edge-extended otherwise)
      let s = 0;
      for (let k = 0; k < g.w * 3; k++) {
        const i = k - g.w;
        const src = g.wrap ? ((i % g.w) + g.w) % g.w : i < 0 ? 0 : i >= g.w ? g.w - 1 : i;
        s += a[o + src];
        row[k] = s;
      }
      const n = 2 * r + 1;
      for (let i = 0; i < g.w; i++) b[o + i] = (row[i + g.w + r] - row[i + g.w - r - 1]) / n;
    }
    [a, b] = [b, a];
    const r = Math.max(1, Math.round(radiusKm / dyKm(g)));
    const n = 2 * r + 1;
    const col = new Float64Array(g.h + 2 * r + 1);
    for (let i = 0; i < g.w; i++) {
      let s = 0;
      col[0] = 0;
      for (let k = 0; k < g.h + 2 * r; k++) {
        const j = Math.min(g.h - 1, Math.max(0, k - r));
        s += a[j * g.w + i];
        col[k + 1] = s;
      }
      for (let j = 0; j < g.h; j++) b[j * g.w + i] = (col[j + n] - col[j]) / n;
    }
    [a, b] = [b, a];
  }
  return a;
}

/**
 * Distance in km from every cell to the nearest source cell (two-pass 8-way
 * chamfer, latitude-aware), plus the index of that source so callers can read
 * the source's attributes.
 */
export function distanceField(g: Grid, isSource: Uint8Array, maxKm = Infinity): { dist: Float32Array; near: Int32Array } {
  const { w, h } = g;
  const dist = new Float32Array(w * h).fill(Infinity);
  const near = new Int32Array(w * h).fill(-1);
  for (let k = 0; k < w * h; k++) {
    if (!isSource[k]) continue;
    dist[k] = 0;
    near[k] = k;
  }
  const dy = dyKm(g);
  const dx = new Float64Array(h);
  for (let j = 0; j < h; j++) dx[j] = dxKm(g, j);
  const relax = (k: number, n: number, cost: number) => {
    const d = dist[n] + cost;
    if (d < dist[k]) {
      dist[k] = d;
      near[k] = near[n];
    }
  };
  const nx = (i: number) => (g.wrap ? (i + w) % w : i);
  for (let rep = 0; rep < (g.wrap ? 2 : 1); rep++) {
    for (let j = 0; j < h; j++) {
      const diag = Math.hypot(dy, (dx[j] + (j > 0 ? dx[j - 1] : dx[j])) / 2);
      for (let i = 0; i < w; i++) {
        const k = j * w + i;
        const l = nx(i - 1);
        const r = nx(i + 1);
        if (l >= 0 && l < w) relax(k, j * w + l, dx[j]);
        if (j > 0) {
          relax(k, (j - 1) * w + i, dy);
          if (l >= 0 && l < w) relax(k, (j - 1) * w + l, diag);
          if (r >= 0 && r < w) relax(k, (j - 1) * w + r, diag);
        }
      }
    }
    for (let j = h - 1; j >= 0; j--) {
      const diag = Math.hypot(dy, (dx[j] + (j < h - 1 ? dx[j + 1] : dx[j])) / 2);
      for (let i = w - 1; i >= 0; i--) {
        const k = j * w + i;
        const l = nx(i - 1);
        const r = nx(i + 1);
        if (r >= 0 && r < w) relax(k, j * w + r, dx[j]);
        if (j < h - 1) {
          relax(k, (j + 1) * w + i, dy);
          if (l >= 0 && l < w) relax(k, (j + 1) * w + l, diag);
          if (r >= 0 && r < w) relax(k, (j + 1) * w + r, diag);
        }
      }
    }
  }
  if (maxKm < Infinity) for (let k = 0; k < w * h; k++) if (dist[k] > maxKm) dist[k] = maxKm;
  return { dist, near };
}

/** Threshold t such that cells with value > t cover `fraction` of the grid's true area. */
export function thresholdForFraction(f: Float32Array, g: Grid, fraction: number): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of f) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const BINS = 4096;
  const hist = new Float64Array(BINS);
  let total = 0;
  const span = hi - lo + 1e-9;
  for (let j = 0; j < g.h; j++) {
    const a = cellAreaKm2(g, j);
    for (let i = 0; i < g.w; i++) {
      hist[Math.min(BINS - 1, Math.floor(((f[j * g.w + i] - lo) / span) * BINS))] += a;
      total += a;
    }
  }
  let acc = 0;
  for (let b = BINS - 1; b >= 0; b--) {
    if (acc + hist[b] >= total * fraction) {
      // interpolate inside the bin
      const into = hist[b] > 0 ? (total * fraction - acc) / hist[b] : 0;
      return lo + ((b + 1 - into) / BINS) * span;
    }
    acc += hist[b];
  }
  return lo;
}

export interface Components {
  /** Component id per cell, -1 outside the mask. */
  label: Int32Array;
  /** Area in km² per component. */
  area: Float64Array;
  /** Area-weighted mean position per component, world cells (x may be unwrapped). */
  cx: Float64Array;
  cy: Float64Array;
  count: number;
}

/** Connected regions of a mask (8-connected, wrapping around the planet when the grid does). */
export function components(g: Grid, mask: Uint8Array): Components {
  const { w, h } = g;
  const label = new Int32Array(w * h).fill(-1);
  const stack = new Int32Array(w * h);
  const areas: number[] = [];
  const cxs: number[] = [];
  const cys: number[] = [];
  const rowArea = new Float64Array(h);
  for (let j = 0; j < h; j++) rowArea[j] = cellAreaKm2(g, j);
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || label[start] >= 0) continue;
    const id = areas.length;
    let sp = 0;
    stack[sp++] = start;
    label[start] = id;
    let area = 0;
    let sx = 0;
    let sy = 0;
    // unwrap x relative to the first cell so centroids work across the seam
    const ox = start % w;
    while (sp > 0) {
      const k = stack[--sp];
      const j = (k / w) | 0;
      const i = k - j * w;
      const a = rowArea[j];
      area += a;
      let ux = i - ox;
      if (g.wrap && ux > w / 2) ux -= w;
      if (g.wrap && ux < -w / 2) ux += w;
      sx += a * (ox + ux);
      sy += a * j;
      for (let dj = -1; dj <= 1; dj++) {
        const jj = j + dj;
        if (jj < 0 || jj >= h) continue;
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          let ii = i + di;
          if (ii < 0 || ii >= w) {
            if (!g.wrap) continue;
            ii = (ii + w) % w;
          }
          const n = jj * w + ii;
          if (mask[n] && label[n] < 0) {
            label[n] = id;
            stack[sp++] = n;
          }
        }
      }
    }
    areas.push(area);
    cxs.push(g.x0 + (sx / area + 0.5) * g.step);
    cys.push(g.y0 + (sy / area + 0.5) * g.step);
  }
  return { label, area: Float64Array.from(areas), cx: Float64Array.from(cxs), cy: Float64Array.from(cys), count: areas.length };
}
