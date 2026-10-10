import { cellAreaKm2, components, makeGrid } from './gen/grid';

export type RegionKind = 'continent' | 'island' | 'islet' | 'ocean' | 'sea' | 'lake';

/** One landmass or body of water, measured on the sphere. */
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
}

export interface Geography {
  W: number;
  H: number;
  /** per cell: land region id ≥ 0, water region −(id + 1) */
  labels: Int32Array;
  land: RegionInfo[];
  water: RegionInfo[];
  landKm2: number;
  planetKm2: number;
}

/** Landmasses and water bodies of a height map (metres, full resolution, row-major W×H). */
export function analyzeGeography(height: Float32Array, W: number, H: number, radiusKm: number, seaLevel: number): Geography {
  const g = makeGrid(W, H, radiusKm, 1);
  const N = W * H;
  const landMask = new Uint8Array(N);
  const waterMask = new Uint8Array(N);
  for (let k = 0; k < N; k++) {
    const l = height[k] > seaLevel ? 1 : 0;
    landMask[k] = l;
    waterMask[k] = 1 - l;
  }
  const planetKm2 = 4 * Math.PI * radiusKm * radiusKm;
  const lc = components(g, landMask);
  const wc = components(g, waterMask);
  // largest first
  const order = (area: Float64Array) => [...area.keys()].sort((a, b) => area[b] - area[a]);
  const lOrder = order(lc.area);
  const wOrder = order(wc.area);
  const lRank = new Int32Array(lc.count);
  const wRank = new Int32Array(wc.count);
  lOrder.forEach((c, r) => (lRank[c] = r));
  wOrder.forEach((c, r) => (wRank[c] = r));
  const labels = new Int32Array(N);
  for (let k = 0; k < N; k++) labels[k] = landMask[k] ? lRank[lc.label[k]] : -(wRank[wc.label[k]] + 1);

  const blank = (id: number, land: boolean, area: number, cx: number, cy: number): RegionInfo => ({
    id,
    land,
    kind: 'island',
    areaKm2: area,
    coastKm: 0,
    cx: ((cx % W) + W) % W,
    cy,
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
  });
  const land = lOrder.map((c, r) => blank(r, true, lc.area[c], lc.cx[c], lc.cy[c]));
  const water = wOrder.map((c, r) => blank(r, false, wc.area[c], wc.cx[c], wc.cy[c]));
  const regionOf = (k: number) => (labels[k] >= 0 ? land[labels[k]] : water[-labels[k] - 1]);

  const dyKm = (Math.PI * radiusKm) / H;
  for (let j = 0; j < H; j++) {
    const a = cellAreaKm2(g, j);
    // east–west edge length on the boundary between rows j and j + 1
    const edgeX = ((2 * Math.PI * radiusKm) / W) * Math.cos(Math.PI / 2 - ((j + 1) / H) * Math.PI);
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
      // the cell nearest the centre becomes the anchor; bounds unwrapped around the centre
      let ux = i + 0.5;
      while (ux - r.cx > W / 2) ux -= W;
      while (ux - r.cx < -W / 2) ux += W;
      if (ux - 0.5 < r.x0) r.x0 = ux - 0.5;
      if (ux + 0.5 > r.x1) r.x1 = ux + 0.5;
      if (j < r.y0) r.y0 = j;
      if (j + 1 > r.y1) r.y1 = j + 1;
      if (r.anchorX < 0 || Math.hypot(ux - r.cx, j + 0.5 - r.cy) < Math.hypot(r.anchorX - r.cx, r.anchorY - r.cy)) {
        r.anchorX = ux;
        r.anchorY = j + 0.5;
      }
      // coastline: every edge between land and water counts for both sides
      const e = j * W + ((i + 1) % W);
      if (landMask[e] !== landMask[k]) {
        regionOf(k).coastKm += dyKm;
        regionOf(e).coastKm += dyKm;
      }
      if (j + 1 < H && landMask[k + W] !== landMask[k]) {
        regionOf(k).coastKm += edgeX;
        regionOf(k + W).coastKm += edgeX;
      }
    }
  }
  let landKm2 = 0;
  for (const r of land) landKm2 += r.areaKm2;
  for (const r of [...land, ...water]) {
    r.mean /= Math.max(1e-9, r.areaKm2);
    // a grid outline is a staircase; on average it is 4/π longer than the smooth coast
    r.coastKm *= Math.PI / 4;
    r.anchorX = ((r.anchorX % W) + W) % W;
  }
  // kinds: continents are Australia-sized and up (relative to the planet), islets tiny
  const cellKm2 = cellAreaKm2(g, H >> 1);
  for (const r of land) r.kind = r.areaKm2 >= planetKm2 * 0.008 ? 'continent' : r.areaKm2 < Math.max(planetKm2 * 1.5e-5, cellKm2 * 6) ? 'islet' : 'island';
  water.forEach((r, i) => (r.kind = i === 0 ? 'ocean' : r.areaKm2 >= planetKm2 * 5e-4 ? 'sea' : 'lake'));
  return { W, H, labels, land, water, landKm2, planetKm2 };
}
