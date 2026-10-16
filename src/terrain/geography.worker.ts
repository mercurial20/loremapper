import { analyzeGeography, NO_LAKE, type Surface } from './geography';

export interface GeographyRequest {
  /** the height raster as tiles (copied, so the editor can keep painting) */
  tiles: { tx: number; ty: number; data: Float32Array }[];
  tileSize: number;
  defaultHeight: number;
  W: number;
  H: number;
  surface: Surface;
  seaLevel: number;
  /** the lake layer's tiles (lake levels), when there are any */
  lakeTiles: { tx: number; ty: number; data: Float32Array }[];
}

/** Whole metres; anything above sea level stays at least one metre above it. */
function toInt16(req: GeographyRequest): { height: Int16Array; sea: number } {
  const { W, H, tileSize: TS, seaLevel } = req;
  const sea = Math.floor(seaLevel);
  const q = (v: number) => {
    let r = Math.round(v);
    if (v > seaLevel && r <= sea) r = sea + 1;
    else if (v <= seaLevel && r > sea) r = sea;
    return r < -32768 ? -32768 : r > 32767 ? 32767 : r;
  };
  const height = new Int16Array(W * H).fill(q(req.defaultHeight));
  for (const { tx, ty, data } of req.tiles)
    for (let j = 0; j < TS; j++) {
      const y = ty * TS + j;
      if (y >= H) break;
      for (let i = 0; i < TS; i++) {
        const x = tx * TS + i;
        if (x >= W) break;
        height[y * W + x] = q(data[j * TS + i]);
      }
    }
  return { height, sea };
}

/**
 * Per cell, the level of the lake standing above the ground there (whole metres), or NO_LAKE.
 * Read before the heights are rounded, so water just above the ground still counts.
 */
function lakeLevels(req: GeographyRequest): Int16Array | null {
  const { W, H, tileSize: TS } = req;
  if (!req.lakeTiles.length) return null;
  const heights = new Map(req.tiles.map((t) => [t.ty * 1e6 + t.tx, t.data]));
  const out = new Int16Array(W * H).fill(NO_LAKE);
  let any = false;
  for (const { tx, ty, data } of req.lakeTiles) {
    const hd = heights.get(ty * 1e6 + tx);
    for (let j = 0; j < TS; j++) {
      const y = ty * TS + j;
      if (y >= H) break;
      for (let i = 0; i < TS; i++) {
        const x = tx * TS + i;
        if (x >= W) break;
        const v = data[j * TS + i];
        // lake levels; early versions also marked dry shores, far above any level
        if (!(v > -20000 && v < 25000)) continue;
        const g = hd ? hd[j * TS + i] : req.defaultHeight;
        if (g >= v || g <= req.seaLevel) continue;
        out[y * W + x] = Math.max(-32767, Math.min(32767, Math.round(v)));
        any = true;
      }
    }
  }
  return any ? out : null;
}

self.onmessage = (e: MessageEvent<GeographyRequest>) => {
  const req = e.data;
  const lake = lakeLevels(req);
  const { height, sea } = toInt16(req);
  req.tiles.length = 0;
  req.lakeTiles.length = 0;
  const g = analyzeGeography(height, req.W, req.H, req.surface, sea, lake);
  const transfer: Transferable[] = [g.labels.buffer as ArrayBuffer, ...g.outlines.map((o) => o.pts.buffer as ArrayBuffer)];
  (self as unknown as Worker).postMessage(g, transfer);
};
