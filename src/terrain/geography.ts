import { simplifyPath } from '../core/math';

export type RegionKind = 'continent' | 'island' | 'islet' | 'ocean' | 'sea' | 'lake';

/** One landmass or body of water, measured on the sphere (or the flat map). */
export interface RegionInfo {
  /** index within `land` or `water` (largest first) */
  id: number;
  land: boolean;
  kind: RegionKind;
  areaKm2: number;
  /** coastline length, km (approximate: depends on the map's resolution) */
  coastKm: number;
  /** area-weighted centre, world cells (x in [0, W)) */
  cx: number;
  cy: number;
  /** a cell that belongs to the region, used to find it again after edits */
  anchorX: number;
  anchorY: number;
  /** bounding box in world cells; x0 may be negative or x1 > W when it crosses the antimeridian */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** highest point above sea level (land) or deepest point below it (water, negative) */
  extreme: number;
  extremeX: number;
  extremeY: number;
  /** mean height above (land) or depth below (water) sea level, metres */
  mean: number;
  /** indices into Geography.outlines */
  outlines: number[];
}

/** A shoreline as a polyline [x0, y0, x1, y1, …] in world cells, between one landmass and one water body. */
export interface Outline {
  pts: Float32Array;
  land: number;
  /** −1 where the line runs along the map edge instead of water */
  water: number;
}

export interface Geography {
  W: number;
  H: number;
  /** per cell: land region id ≥ 0, water region −(id + 1) */
  labels: Int32Array;
  land: RegionInfo[];
  water: RegionInfo[];
  outlines: Outline[];
  landKm2: number;
  mapKm2: number;
}

/** How cells map to ground: a sphere (equirectangular rows) or a flat map with square cells. */
export type Surface = { kind: 'planet'; radiusKm: number } | { kind: 'flat'; cellKm: number };

/**
 * Landmasses and water bodies of a height map (whole metres, full
 * resolution, row-major W×H): true areas, coastlines, extremes and simplified
 * outlines for every region, in one pass over the map.
 */
export function analyzeGeography(height: Int16Array | Float32Array, W: number, H: number, surface: Surface, seaLevel: number): Geography {
  const N = W * H;
  const wrap = surface.kind === 'planet';
  // per-row geometry
  const rowArea = new Float64Array(H);
  const edgeX = new Float64Array(H); // east–west edge between rows j and j + 1
  let dyKm: number;
  let mapKm2: number;
  if (surface.kind === 'planet') {
    const R = surface.radiusKm;
    dyKm = (Math.PI * R) / H;
    for (let j = 0; j < H; j++) {
      const top = Math.PI / 2 - (j / H) * Math.PI;
      const bottom = Math.PI / 2 - ((j + 1) / H) * Math.PI;
      rowArea[j] = R * R * ((2 * Math.PI) / W) * (Math.sin(top) - Math.sin(bottom));
      edgeX[j] = ((2 * Math.PI * R) / W) * Math.cos(bottom);
    }
    mapKm2 = 4 * Math.PI * R * R;
  } else {
    dyKm = surface.cellKm;
    rowArea.fill(surface.cellKm * surface.cellKm);
    edgeX.fill(surface.cellKm);
    mapKm2 = N * surface.cellKm * surface.cellKm;
  }

  // ---- connected regions: 8-connected land and water, scanline flood fill
  const isLand = (k: number) => height[k] > seaLevel;
  const labels = new Int32Array(N).fill(-2147483648);
  const UNSET = -2147483648;
  const areas: number[][] = [[], []]; // [water, land]
  const stack: number[] = [];
  let landCount = 0;
  let waterCount = 0;
  for (let start = 0; start < N; start++) {
    if (labels[start] !== UNSET) continue;
    const land = isLand(start);
    const id = land ? landCount++ : waterCount++;
    const value = land ? id : -(id + 1);
    let area = 0;
    stack.push(start);
    labels[start] = value;
    while (stack.length) {
      const k = stack.pop()!;
      const j = (k / W) | 0;
      const i = k - j * W;
      area += rowArea[j];
      for (let dj = -1; dj <= 1; dj++) {
        const jj = j + dj;
        if (jj < 0 || jj >= H) continue;
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          let ii = i + di;
          if (ii < 0 || ii >= W) {
            if (!wrap) continue;
            ii = (ii + W) % W;
          }
          const n = jj * W + ii;
          if (labels[n] === UNSET && isLand(n) === land) {
            labels[n] = value;
            stack.push(n);
          }
        }
      }
    }
    areas[land ? 1 : 0].push(area);
  }

  // largest first
  const rank = (a: number[]) => {
    const order = [...a.keys()].sort((x, y) => a[y] - a[x]);
    const r = new Int32Array(a.length);
    order.forEach((c, i) => (r[c] = i));
    return { order, r };
  };
  const L = rank(areas[1]);
  const Wt = rank(areas[0]);
  for (let k = 0; k < N; k++) {
    const v = labels[k];
    labels[k] = v >= 0 ? L.r[v] : -(Wt.r[-v - 1] + 1);
  }
  const blank = (id: number, land: boolean, area: number): RegionInfo => ({
    id,
    land,
    kind: 'island',
    areaKm2: area,
    coastKm: 0,
    cx: 0,
    cy: 0,
    anchorX: -1,
    anchorY: -1,
    x0: Infinity,
    x1: -Infinity,
    y0: Infinity,
    y1: -Infinity,
    extreme: land ? -Infinity : Infinity,
    extremeX: 0,
    extremeY: 0,
    mean: 0,
    outlines: [],
  });
  const land = L.order.map((c, i) => blank(i, true, areas[1][c]));
  const water = Wt.order.map((c, i) => blank(i, false, areas[0][c]));
  const regionOf = (k: number) => (labels[k] >= 0 ? land[labels[k]] : water[-labels[k] - 1]);

  // ---- centres: area-weighted mean of unit vectors (planet) or positions (flat), so wrap is handled
  const sx = new Float64Array(land.length + water.length);
  const sy = new Float64Array(land.length + water.length);
  const sz = new Float64Array(land.length + water.length);
  const slot = (k: number) => (labels[k] >= 0 ? labels[k] : land.length - labels[k] - 1);
  for (let j = 0; j < H; j++) {
    const a = rowArea[j];
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      const s = slot(k);
      if (wrap) {
        const lon = ((i + 0.5) / W) * 2 * Math.PI;
        sx[s] += a * Math.cos(lon);
        sy[s] += a * Math.sin(lon);
      } else sx[s] += a * (i + 0.5);
      sz[s] += a * (j + 0.5);
    }
  }
  const all = [...land, ...water];
  all.forEach((r, s) => {
    r.cx = wrap ? ((((Math.atan2(sy[s], sx[s]) / (2 * Math.PI)) * W) % W) + W) % W : sx[s] / r.areaKm2;
    r.cy = sz[s] / r.areaKm2;
  });

  // ---- statistics, bounds, anchors and coastline length
  for (let j = 0; j < H; j++) {
    const a = rowArea[j];
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      const r = regionOf(k);
      const v = height[k] - seaLevel;
      r.mean += v * a;
      if (r.land ? v > r.extreme : v < r.extreme) {
        r.extreme = v;
        r.extremeX = i + 0.5;
        r.extremeY = j + 0.5;
      }
      // bounds unwrapped around the centre; the cell nearest the centre becomes the anchor
      let ux = i + 0.5;
      if (wrap) {
        while (ux - r.cx > W / 2) ux -= W;
        while (ux - r.cx < -W / 2) ux += W;
      }
      if (ux - 0.5 < r.x0) r.x0 = ux - 0.5;
      if (ux + 0.5 > r.x1) r.x1 = ux + 0.5;
      if (j < r.y0) r.y0 = j;
      if (j + 1 > r.y1) r.y1 = j + 1;
      const d = Math.abs(ux - r.cx) + Math.abs(j + 0.5 - r.cy);
      if (r.anchorX < 0 || d < Math.abs(r.anchorX - r.cx) + Math.abs(r.anchorY - r.cy)) {
        r.anchorX = ux;
        r.anchorY = j + 0.5;
      }
      // coastline: every edge between land and water counts for both sides
      if (i + 1 < W || wrap) {
        const e = j * W + ((i + 1) % W);
        if (labels[e] >= 0 !== labels[k] >= 0) {
          r.coastKm += dyKm;
          regionOf(e).coastKm += dyKm;
        }
      }
      if (j + 1 < H && labels[k + W] >= 0 !== labels[k] >= 0) {
        r.coastKm += edgeX[j];
        regionOf(k + W).coastKm += edgeX[j];
      }
    }
  }
  let landKm2 = 0;
  for (const r of land) landKm2 += r.areaKm2;
  for (const r of all) {
    r.mean /= Math.max(1e-9, r.areaKm2);
    // a grid outline is a staircase; on average it is 4/π longer than the smooth coast
    r.coastKm *= Math.PI / 4;
    if (wrap) r.anchorX = ((r.anchorX % W) + W) % W;
  }

  // ---- kinds: continents are Australia-sized and up (relative to the map), islets tiny
  const cellKm2 = rowArea[H >> 1];
  for (const r of land) r.kind = r.areaKm2 >= mapKm2 * 0.008 ? 'continent' : r.areaKm2 < Math.max(mapKm2 * 1.5e-5, cellKm2 * 6) ? 'islet' : 'island';
  water.forEach((r, i) => (r.kind = i === 0 ? (wrap ? 'ocean' : 'sea') : r.areaKm2 >= mapKm2 * 5e-4 ? 'sea' : 'lake'));

  const outlines = traceOutlines(labels, W, H, wrap);
  outlines.forEach((o, n) => {
    land[o.land].outlines.push(n);
    if (o.water >= 0) water[o.water].outlines.push(n);
  });
  return { W, H, labels, land, water, outlines, landKm2, mapKm2 };
}

/**
 * Marching squares on the land/water labels (corners at cell centres),
 * chained into polylines and simplified. Each line separates one landmass
 * from one water body (or from the map edge).
 */
function traceOutlines(labels: Int32Array, W: number, H: number, wrap: boolean): Outline[] {
  const at = (i: number, j: number) => {
    if (j < 0 || j >= H) return null;
    if (i < 0 || i >= W) {
      if (!wrap) return null;
      i = (i + W) % W;
    }
    return labels[j * W + i];
  };
  // segment endpoints in half-cell units, packed into one integer key
  const KW = 2 * W + 8;
  const key = (x2: number, y2: number) => (y2 + 4) * KW + (x2 + 4);
  const segA: number[] = [];
  const segB: number[] = [];
  const segLand: number[] = [];
  const segWater: number[] = [];
  const i0 = wrap ? 0 : -1;
  for (let j = -1; j < H; j++)
    for (let i = i0; i < W; i++) {
      const a = at(i, j);
      const b = at(i + 1, j);
      const c = at(i + 1, j + 1);
      const d = at(i, j + 1);
      const isL = (v: number | null) => v !== null && v >= 0;
      const code = (isL(a) ? 1 : 0) | (isL(b) ? 2 : 0) | (isL(c) ? 4 : 0) | (isL(d) ? 8 : 0);
      if (code === 0 || code === 15) continue;
      let landId = -1;
      let waterId = -1;
      for (const v of [a, b, c, d]) {
        if (v === null) continue;
        if (v >= 0) landId = v;
        else waterId = -v - 1;
      }
      // edge midpoints, doubled: top (i+1, j+.5), right (i+1.5, j+1), bottom (i+1, j+1.5), left (i+.5, j+1)
      const T = key(2 * i + 2, 2 * j + 1);
      const Rt = key(2 * i + 3, 2 * j + 2);
      const B = key(2 * i + 2, 2 * j + 3);
      const Lf = key(2 * i + 1, 2 * j + 2);
      const add = (p: number, q: number) => {
        segA.push(p);
        segB.push(q);
        segLand.push(landId);
        segWater.push(waterId);
      };
      switch (code) {
        case 1:
        case 14:
          add(Lf, T);
          break;
        case 2:
        case 13:
          add(T, Rt);
          break;
        case 3:
        case 12:
          add(Lf, Rt);
          break;
        case 4:
        case 11:
          add(Rt, B);
          break;
        case 6:
        case 9:
          add(T, B);
          break;
        case 7:
        case 8:
          add(Lf, B);
          break;
        case 5:
          add(Lf, T);
          add(Rt, B);
          break;
        case 10:
          add(T, Rt);
          add(Lf, B);
          break;
      }
    }
  // chain segments that share endpoints (and belong to the same pair of regions)
  const S = segA.length;
  const byPoint = new Map<number, number[]>();
  const link = (p: number, s: number) => {
    const l = byPoint.get(p);
    if (l) l.push(s);
    else byPoint.set(p, [s]);
  };
  for (let s = 0; s < S; s++) {
    link(segA[s], s);
    link(segB[s], s);
  }
  const used = new Uint8Array(S);
  const unkey = (k: number): [number, number] => [((k % KW) - 4) / 2, (Math.floor(k / KW) - 4) / 2];
  const next = (p: number, from: number) => {
    for (const s of byPoint.get(p)!) if (!used[s] && segLand[s] === segLand[from] && segWater[s] === segWater[from]) return s;
    return -1;
  };
  const out: Outline[] = [];
  for (let s0 = 0; s0 < S; s0++) {
    if (used[s0]) continue;
    used[s0] = 1;
    // grow both ways from the first segment
    const fwd: number[] = [segB[s0]];
    let tail = segB[s0];
    for (let s = next(tail, s0); s >= 0; s = next(tail, s0)) {
      used[s] = 1;
      tail = segA[s] === tail ? segB[s] : segA[s];
      fwd.push(tail);
    }
    const back: number[] = [];
    let head = segA[s0];
    for (let s = next(head, s0); s >= 0; s = next(head, s0)) {
      used[s] = 1;
      head = segA[s] === head ? segB[s] : segA[s];
      back.push(head);
    }
    const keys = [...back.reverse(), segA[s0], ...fwd];
    const pts = simplifyPath(keys.map(unkey), 0.35);
    const flat = new Float32Array(pts.length * 2);
    pts.forEach(([x, y], n) => {
      flat[2 * n] = x;
      flat[2 * n + 1] = y;
    });
    out.push({ pts: flat, land: segLand[s0], water: segWater[s0] });
  }
  return out;
}
