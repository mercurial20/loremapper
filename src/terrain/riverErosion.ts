import { clamp, fbm } from '../core/math';
import type { RasterArray } from './TileGrid';
import { WATER_DETAIL, type TerrainModel, type TileChange } from './TerrainModel';

/*
 * How a river shapes the land around it, in three steps that follow the
 * geomorphology of real rivers:
 *
 * 1. Water runs downhill. The river's outlet is where it meets the sea (or
 *    leaves the map, or its lowest point for a river that ends inland). From
 *    there the river settles on a *graded* longitudinal profile: the slope of
 *    a river in equilibrium falls with the area it drains (Flint's law,
 *    S = ks·A^−θ), and the drained area grows with the length of the river
 *    above (Hack's law, L = 1.4·A^0.6). That gives the familiar concave
 *    profile, steep near the sources and gentle near the mouth. The profile
 *    starts at the source's ground and ends at the outlet; ground above it is
 *    cut down (a hill across the river's course becomes a gorge), ground
 *    below it stays (a basin on the way becomes a lake).
 * 2. Valley sides relax. Once the river has cut in, the slopes beside it give
 *    way until they are no steeper than the hillslopes of the land around
 *    (threshold hillslopes), so a deep cut makes a wide V-shaped valley and
 *    a shallow one a gentle dip.
 * 3. Lowland rivers spread a floodplain. Where the river's gradient is low it
 *    meanders over a flat floodplain a little above its bed, whose width
 *    grows with the river (hydraulic geometry: width ∝ Q^0.5, depth ∝ Q^0.4).
 *
 * The result only ever lowers the land, never pushes land into the sea, and
 * running it again on the same river changes nothing.
 */

/** Concavity of graded river profiles (Flint's law, slope ∝ area^−θ). */
const THETA = 0.45;
/** Hack's law, main stream length L = HACK_C · A^HACK_H (km, km²). */
const HACK_C = 1.4;
const HACK_H = 0.6;
/** Mean runoff, m³/s per km² of basin (about 470 mm a year). */
const RUNOFF = 0.015;
/** Floodplain half-width in channel widths, on gentle reaches. */
const FLOODPLAIN = 20;
/** Bed slope (m/m) above which a river runs in its valley without a floodplain. */
const FLOODPLAIN_MAX_SLOPE = 0.004;
/** Sills up to this high (m) between hollows on a river's bed are cut through. */
const SILL = 25;
/** Valley-side gradients (m per km of map distance) are kept in this range. */
const MIN_SIDE = 15;
const MAX_SIDE = 600;
/** Branches of a river shorter than this (cells) are part of its width, not tributaries. */
const MIN_BRANCH = 12;
/** Rivers larger than this many terrain cells are shaped near the new part only. */
const MAX_RIVER_CELLS = 400_000;
const MAX_WINDOW = 8e6;

export interface RiverInput {
  /** Terrain cells the river newly covers (world cells). */
  fresh: Iterable<[number, number]>;
  /** Whether a terrain cell is part of the river (painted water, or a drawn path). */
  wet: (x: number, y: number) => boolean;
  /** Where a drawn river ends; used when it doesn't reach the sea. */
  mouth?: [number, number];
}

/** Shape the terrain around a river; returns the undo record for the height layer. */
export function erodeRiver(model: TerrainModel, input: RiverInput): TileChange | null {
  const g = model.height;
  const geo = model.geo;
  const W = model.W;
  const H = model.H;
  const sea = model.seaLevel;
  const wrap = g.wrap;
  const kmY = geo.kmPerCellY;
  const wx = (x: number) => (wrap ? ((x % W) + W) % W : x);
  const inMap = (x: number, y: number) => y >= 0 && y < H && (wrap || (x >= 0 && x < W));

  // ---------- the river's cells: everything wet and connected to the new part ----------
  // x stays unwrapped along the river, so a river across the antimeridian is one piece
  const seen = new Set<number>();
  const cells: [number, number][] = [];
  const queue: [number, number][] = [];
  for (const [x, y] of input.fresh) {
    if (!inMap(x, y) || g.get(x, y) < sea) continue;
    const k = y * W + wx(x);
    if (seen.has(k)) continue;
    seen.add(k);
    queue.push([x, y]);
  }
  if (!queue.length) return null;
  while (queue.length && cells.length < MAX_RIVER_CELLS) {
    const [x, y] = queue.pop()!;
    cells.push([x, y]);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if ((!dx && !dy) || !inMap(nx, ny)) continue;
        const k = ny * W + wx(nx);
        if (seen.has(k)) continue;
        if (!input.wet(wx(nx), ny) || g.get(nx, ny) < sea) continue;
        seen.add(k);
        queue.push([nx, ny]);
      }
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of cells) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  // room for the valley sides around the river
  let margin = 96;
  while (margin > 4 && (maxX - minX + 1 + 2 * margin) * (Math.min(H - 1, maxY + margin) - Math.max(0, minY - margin) + 1) > MAX_WINDOW) margin = Math.floor(margin / 2);
  const lx0 = wrap ? minX - margin : Math.max(0, minX - margin);
  const lx1 = wrap ? maxX + margin : Math.min(W - 1, maxX + margin);
  const ly0 = Math.max(0, minY - margin);
  const ly1 = Math.min(H - 1, maxY + margin);
  const w = lx1 - lx0 + 1;
  const h = ly1 - ly0 + 1;
  if (w * h > MAX_WINDOW) return null;
  const N = w * h;
  const ground = new Float32Array(N);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) ground[j * w + i] = g.get(lx0 + i, ly0 + j);
  const kmX = new Float32Array(h);
  for (let j = 0; j < h; j++) kmX[j] = geo.kmPerCellX(ly0 + j + 0.5);

  const river = new Int32Array(N).fill(-1); // window cell → river cell index
  const idx = new Int32Array(cells.length); // river cell index → window cell
  cells.forEach(([x, y], r) => {
    const k = (y - ly0) * w + (x - lx0);
    river[k] = r;
    idx[r] = k;
  });
  const n = cells.length;
  const stepKm = (a: number, b: number) => {
    const ja = (a / w) | 0;
    const dx = Math.abs((a % w) - (b % w));
    const dy = Math.abs(ja - ((b / w) | 0));
    const kx = kmX[ja] * dx;
    const ky = kmY * dy;
    return Math.sqrt(kx * kx + ky * ky);
  };

  // ---------- outlets: the sea, the edge of a flat map, or the lowest point ----------
  const outlet = new Uint8Array(n); // 1 at the sea, 2 elsewhere
  for (let r = 0; r < n; r++) {
    const k = idx[r];
    const i = k % w;
    const j = (k / w) | 0;
    const x = lx0 + i;
    const y = ly0 + j;
    if (!wrap && (x === 0 || x === W - 1 || y === 0 || y === H - 1)) outlet[r] = 2;
    for (let dy = -1; dy <= 1 && outlet[r] !== 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const ii = i + dx;
        const jj = j + dy;
        if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
        if (ground[jj * w + ii] < sea) {
          outlet[r] = 1;
          break;
        }
      }
  }
  if (!outlet.some((o) => o)) {
    let best = 0;
    if (input.mouth) {
      // a drawn river ends where it was drawn to
      let bd = Infinity;
      for (let r = 0; r < n; r++) {
        const d = Math.hypot(geo.deltaX(input.mouth[0], cells[r][0]), cells[r][1] - input.mouth[1]);
        if (d < bd) {
          bd = d;
          best = r;
        }
      }
    } else for (let r = 1; r < n; r++) if (ground[idx[r]] < ground[idx[best]]) best = r;
    outlet[best] = 2;
  }

  // ---------- flow paths: distance to the outlet along the river ----------
  // Water follows the middle of a wide river: steps near its edge cost more, so the edge drains
  // straight across to the middle instead of running along the bank as streams of its own.
  const edge = new Float32Array(n).fill(Infinity); // cells to the river's edge
  const ring: number[] = [];
  for (let r = 0; r < n; r++) {
    const k = idx[r];
    const i = k % w;
    const j = (k / w) | 0;
    for (let dy = -1; dy <= 1 && edge[r] > 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const ii = i + dx;
        const jj = j + dy;
        if (ii < 0 || jj < 0 || ii >= w || jj >= h || river[jj * w + ii] < 0) {
          edge[r] = 1;
          ring.push(r);
          break;
        }
      }
  }
  for (let q = 0; q < ring.length; q++) {
    const r = ring[q];
    const k = idx[r];
    const i = k % w;
    const j = (k / w) | 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const ii = i + dx;
        const jj = j + dy;
        if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
        const o = river[jj * w + ii];
        if (o >= 0 && edge[o] > edge[r] + 1) {
          edge[o] = edge[r] + 1;
          ring.push(o);
        }
      }
  }
  const dist = new Float64Array(n).fill(Infinity);
  const down = new Int32Array(n).fill(-1);
  const order: number[] = [];
  const heap = new MinHeap();
  for (let r = 0; r < n; r++)
    if (outlet[r]) {
      dist[r] = 0;
      heap.push(r, 0);
    }
  const done = new Uint8Array(n);
  for (;;) {
    if (!heap.size) {
      // a piece of the river cut off from the rest (by the sea, say) ends at its own lowest point
      let low = -1;
      for (let r = 0; r < n; r++) if (!done[r] && (low < 0 || ground[idx[r]] < ground[idx[low]])) low = r;
      if (low < 0) break;
      outlet[low] = 2;
      dist[low] = 0;
      heap.push(low, 0);
    }
    const r = heap.pop();
    if (done[r]) continue;
    done[r] = 1;
    order.push(r);
    const k = idx[r];
    const i = k % w;
    const j = (k / w) | 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const ii = i + dx;
        const jj = j + dy;
        if ((!dx && !dy) || ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
        const q = river[jj * w + ii];
        if (q < 0 || done[q]) continue;
        const nd = dist[r] + stepKm(k, idx[q]) * (1 + 2 / edge[q]);
        if (nd < dist[q]) {
          dist[q] = nd;
          down[q] = r;
          heap.push(q, nd);
        }
      }
  }

  // ---------- river size: length of the main stream above each cell ----------
  const up = new Float64Array(n); // km
  const src = new Int32Array(n).fill(-1);
  for (let o = order.length - 1; o >= 0; o--) {
    const r = order[o];
    if (src[r] < 0) src[r] = r; // a source
    const p = down[r];
    if (p < 0) continue;
    const l = up[r] + stepKm(idx[r], idx[p]);
    if (src[p] < 0 || l > up[p]) {
      up[p] = l;
      src[p] = src[r];
    }
  }
  // at the map's resolution, each source already gathers the water of a few cells of hillside
  const L0 = 2 * kmY + 1;
  const areaKm2 = (r: number) => ((up[r] + L0) / HACK_C) ** (1 / HACK_H);

  // ---------- the graded profile, fitted from the outlet to each source ----------
  // u: the profile's shape (∫ A^−θ ds); z = base + ks·u along each main stream
  const u = new Float64Array(n);
  const z = new Float64Array(n);
  const ks = new Map<number, number>();
  for (const r of order) {
    const p = down[r];
    if (p >= 0) u[r] = u[p] + stepKm(idx[r], idx[p]) * 1000 * (areaKm2(r) * 1e6) ** -THETA;
  }
  // A branch that is short, or starts right beside a longer stream, is no tributary but part of
  // a wide river's width: it runs at the level of the stream it leaves (rising to its own ground,
  // the river's edge would stand as a sawtooth of ridges along the bank)
  const minBranch = MIN_BRANCH * kmY;
  const besideLonger = (s: number) => {
    const k = idx[s];
    const i = k % w;
    const j = (k / w) | 0;
    const look = (rad: number, f: (q: number) => void) => {
      for (let jj = Math.max(0, j - rad); jj <= Math.min(h - 1, j + rad); jj++)
        for (let ii = Math.max(0, i - rad); ii <= Math.min(w - 1, i + rad); ii++) {
          const q = river[jj * w + ii];
          if (q >= 0) f(q);
        }
    };
    // the river's half-width here
    let half = 1;
    look(4, (q) => (half = Math.max(half, edge[q])));
    const rad = Math.ceil(2 + 2 * half);
    let found = false;
    look(rad, (q) => {
      if (src[q] !== s && up[q] > 2 * rad * kmY) found = true;
    });
    return found;
  };
  const joins = new Map<number, number>();
  const streamOf = (r: number) => {
    let s = src[r];
    for (let j = joins.get(s); j !== undefined; j = joins.get(s)) s = j;
    return s;
  };
  for (const r of order) {
    const p = down[r];
    const gr = ground[idx[r]];
    if (p < 0) {
      z[r] = outlet[r] === 1 ? Math.min(gr, sea + 1) : gr;
      continue;
    }
    if (joins.has(src[r])) {
      // part of the river's width: level with the water beside it
      z[r] = z[p];
      continue;
    }
    const s = src[r];
    let k = ks.get(s);
    if (k === undefined) {
      if (streamOf(p) !== s && (up[r] + stepKm(idx[r], idx[p]) < minBranch || besideLonger(s))) {
        joins.set(s, streamOf(p));
        z[r] = z[p];
        continue;
      }
      // this stream joins at p; it rises from there to its source's ground
      const span = u[s] - u[p];
      k = span > 0 ? Math.max(0, (ground[idx[s]] - z[p]) / span) : 0;
      ks.set(s, k);
    }
    z[r] = z[p] + k * (u[r] - u[p]);
  }
  for (let r = 0; r < n; r++) src[r] = streamOf(r);

  // ---------- each river cell: bed, floodplain ----------
  const bed = new Float32Array(n);
  for (let r = 0; r < n; r++) {
    const gr = ground[idx[r]];
    bed[r] = Math.max(Math.min(gr, z[r]), Math.min(gr, sea + 0.5));
  }
  // Ground below the graded line stays: a deep basin on the way becomes a lake. A river
  // does cut through low sills, though, so shallow hollows don't leave the water standing:
  // going downstream, a bed up to SILL above the lowest bed just upstream is cut down to it.
  const upMin = new Float32Array(n).fill(Infinity);
  for (let o = order.length - 1; o >= 0; o--) {
    const r = order[o];
    if (bed[r] > upMin[r] && bed[r] - upMin[r] <= SILL) bed[r] = Math.max(upMin[r], Math.min(ground[idx[r]], sea + 0.5));
    const p = down[r];
    if (p >= 0) upMin[p] = Math.min(upMin[p], bed[r]);
  }
  const plainLevel = new Float32Array(n);
  const plainKm = new Float32Array(n);
  for (let r = 0; r < n; r++) {
    const b = bed[r];
    const A = areaKm2(r);
    const Q = RUNOFF * A;
    const depth = Math.min(30, 0.3 * Q ** 0.4);
    const widthKm = (4.5 * Q ** 0.5) / 1000;
    const slope = (ks.get(src[r]) ?? 0) * (A * 1e6) ** -THETA;
    plainKm[r] = Math.min(40, FLOODPLAIN * widthKm * clamp(1 - slope / FLOODPLAIN_MAX_SLOPE, 0, 1));
    plainLevel[r] = b + depth;
  }

  // ---------- how steep valley sides may be: like the hillslopes around ----------
  const slopes: number[] = [];
  const stride = Math.max(1, Math.floor(Math.sqrt(N / 40000)));
  for (let j = 1; j < h - 1; j += stride)
    for (let i = 1; i < w - 1; i += stride) {
      const k = j * w + i;
      if (ground[k] < sea) continue;
      const gx = (ground[k + 1] - ground[k - 1]) / (2 * kmX[j]);
      const gy = (ground[k + w] - ground[k - w]) / (2 * kmY);
      slopes.push(Math.hypot(gx, gy));
    }
  slopes.sort((a, b) => a - b);
  const side = clamp(slopes.length ? slopes[Math.floor(slopes.length * 0.85)] : MIN_SIDE, MIN_SIDE, MAX_SIDE);

  // ---------- the new ground: bed, floodplain, then valley sides ----------
  // The valley is a surface of its own (it depends on the river only, so carving the same river
  // again changes nothing): the lowest of the slopes rising from every river cell, each from the
  // cell's floodplain level, flat across the floodplain and then steepening into the valley side.
  // Between two reaches of a bend the slopes meet in a spur, as they do in real valleys; near a
  // source no slope starts below the source itself.
  const period = wrap ? Math.max(1, Math.round(W / 8)) : 0;
  // valley sides vary a little in steepness over long stretches, as rock and soil do
  const vary = new Float32Array(N);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) vary[j * w + i] = side * (0.85 + 0.3 * fbm((lx0 + i) / 40, (ly0 + j) / 40, 911, 2, period));
  const valley = new Float32Array(N).fill(1e6);
  const from = new Int32Array(N).fill(-1);
  for (let r = 0; r < n; r++) {
    valley[idx[r]] = bed[r];
    from[idx[r]] = r;
  }
  const rise = (k: number, r: number) => {
    const j = (k / w) | 0;
    const t = idx[r];
    const d = Math.hypot(((k % w) - (t % w)) * kmX[j], (j - ((t / w) | 0)) * kmY);
    // the floodplain eases into the valley side instead of ending at a step
    const out = Math.max(0, d - plainKm[r]);
    const ease = Math.max(kmY, 0.25 * plainKm[r]);
    return plainLevel[r] + (vary[k] * out * out) / (out + ease);
  };
  // two sweeps each way, every cell taking the lowest slope its neighbours know of
  const relax = (k: number, o: number) => {
    const r = from[o];
    if (r < 0 || river[k] >= 0) return;
    const v = rise(k, r);
    if (v < valley[k]) {
      valley[k] = v;
      from[k] = r;
    }
  };
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const k = j * w + i;
        if (i > 0) relax(k, k - 1);
        if (j > 0) {
          relax(k, k - w);
          if (i > 0) relax(k, k - w - 1);
          if (i < w - 1) relax(k, k - w + 1);
        }
      }
    for (let j = h - 1; j >= 0; j--)
      for (let i = w - 1; i >= 0; i--) {
        const k = j * w + i;
        if (i < w - 1) relax(k, k + 1);
        if (j < h - 1) {
          relax(k, k + w);
          if (i < w - 1) relax(k, k + w + 1);
          if (i > 0) relax(k, k + w - 1);
        }
      }
  }
  // smoothed, so no step of the cells shows
  const tmp = new Float32Array(N);
  const wts = [1, 4, 6, 4, 1];
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        let sum = 0;
        let ws = 0;
        for (let o = -2; o <= 2; o++) {
          const ii = i + o;
          if (ii < 0 || ii >= w) continue;
          sum += wts[o + 2] * valley[j * w + ii];
          ws += wts[o + 2];
        }
        tmp[j * w + i] = sum / ws;
      }
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        let sum = 0;
        let ws = 0;
        for (let o = -2; o <= 2; o++) {
          const jj = j + o;
          if (jj < 0 || jj >= h) continue;
          sum += wts[o + 2] * tmp[jj * w + i];
          ws += wts[o + 2];
        }
        valley[j * w + i] = sum / ws;
      }
  }
  // The river's cells follow the smooth valley too (cut exactly to the bed cell by cell, a
  // slanting river would leave a row of notches along its banks), but never below the bed and
  // never rising downstream: from the sources down, no cell stays above the one upstream
  const runLevel = new Float32Array(n);
  for (let r = 0; r < n; r++) runLevel[r] = Math.max(bed[r], valley[idx[r]]);
  for (let o = order.length - 1; o >= 0; o--) {
    const r = order[o];
    const p = down[r];
    if (p >= 0) runLevel[p] = Math.min(runLevel[p], Math.min(ground[idx[r]], runLevel[r]));
  }
  const before = new Map<number, RasterArray | null>();
  const TS = g.TS;
  let rx0 = Infinity;
  let rx1 = -Infinity;
  let ry0 = Infinity;
  let ry1 = -Infinity;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      const cur = ground[k];
      if (cur < sea) continue;
      const level = river[k] >= 0 ? runLevel[river[k]] : valley[k];
      // never into the sea
      const nh = Math.max(Math.min(cur, level), Math.min(cur, sea + 0.5));
      if (nh >= cur - 0.01) continue;
      const x = wx(lx0 + i);
      const y = ly0 + j;
      if (!wrap && (x < 0 || x >= W)) continue;
      const tx = (x / TS) | 0;
      const ty = (y / TS) | 0;
      const key = g.key(tx, ty);
      if (!before.has(key)) {
        const t0 = g.tiles.get(key);
        before.set(key, t0 ? (t0.slice() as RasterArray) : null);
      }
      g.ensureTile(tx, ty)[(y - ty * TS) * TS + (x - tx * TS)] = nh;
      rx0 = Math.min(rx0, lx0 + i);
      rx1 = Math.max(rx1, lx0 + i);
      ry0 = Math.min(ry0, y);
      ry1 = Math.max(ry1, y);
    }
  if (!before.size) return null;
  const after = new Map<number, RasterArray | null>();
  for (const key of before.keys()) {
    const t = g.tiles.get(key);
    after.set(key, t ? (t.slice() as RasterArray) : null);
  }
  model.changed('height', { x0: rx0, y0: ry0, x1: rx1, y1: ry1 });
  return { layer: 'height', before, after };
}

/**
 * The cells under a river's line (`curve`, its centre about every cell or closer), as wide as
 * `width` cells: stamped every half cell along it, so they never break apart.
 */
export function cellsAlong(model: TerrainModel, curve: [number, number][], width: number): Map<number, [number, number]> {
  const W = model.W;
  const cells = new Map<number, [number, number]>();
  const r = Math.max(0.5, width / 2);
  const R = Math.ceil(r);
  const stamp = (x: number, y: number) => {
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > r * r + 0.5) continue;
        const cx = Math.floor(x + dx);
        const cy = Math.floor(y + dy);
        if (cy < 0 || cy >= model.H) continue;
        cells.set(cy * W + (((cx % W) + W) % W), [cx, cy]);
      }
  };
  if (!curve.length) return cells;
  stamp(curve[0][0], curve[0][1]);
  for (let i = 1; i < curve.length; i++) {
    const [ax, ay] = curve[i - 1];
    const [bx, by] = curve[i];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
    for (let s = 1; s <= steps; s++) stamp(ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps);
  }
  return cells;
}

/** Whether any water is painted inside a terrain cell. */
export function waterIn(model: TerrainModel, x: number, y: number): boolean {
  const g = model.water;
  const k = WATER_DETAIL;
  for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) if (g.get(x * k + i, y * k + j) >= 128) return true;
  return false;
}

/** Terrain cells that gained water in a water-layer change. */
export function newWaterCells(model: TerrainModel, change: TileChange): [number, number][] {
  const g = model.water;
  const TS = g.TS;
  const k = WATER_DETAIL;
  const out = new Map<number, [number, number]>();
  for (const [key, after] of change.after) {
    if (!after) continue;
    const b = change.before.get(key) ?? null;
    const [tx, ty] = g.tileXY(key);
    for (let ly = 0; ly < TS; ly++)
      for (let lx = 0; lx < TS; lx++) {
        const li = ly * TS + lx;
        if (after[li] < 128 || (b && b[li] >= 128)) continue;
        const x = ((tx * TS + lx) / k) | 0;
        const y = ((ty * TS + ly) / k) | 0;
        out.set(y * model.W + x, [x, y]);
      }
  }
  return [...out.values()];
}

/** A binary min-heap of indices keyed by distance. */
class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size() {
    return this.ids.length;
  }
  push(id: number, key: number) {
    const ids = this.ids;
    const keys = this.keys;
    let i = ids.length;
    ids.push(id);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      ids[i] = ids[p];
      keys[i] = keys[p];
      i = p;
    }
    ids[i] = id;
    keys[i] = key;
  }
  pop(): number {
    const ids = this.ids;
    const keys = this.keys;
    const top = ids[0];
    const lastId = ids.pop()!;
    const lastKey = keys.pop()!;
    const n = ids.length;
    if (n) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && keys[r] < keys[l] ? r : l;
        if (keys[c] >= lastKey) break;
        ids[i] = ids[c];
        keys[i] = keys[c];
        i = c;
      }
      ids[i] = lastId;
      keys[i] = lastKey;
    }
    return top;
  }
}
