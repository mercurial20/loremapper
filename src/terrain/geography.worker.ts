import { analyzeGeography, type Surface } from './geography';

export interface GeographyRequest {
  /** the height raster as tiles (copied, so the editor can keep painting) */
  tiles: { tx: number; ty: number; data: Float32Array }[];
  tileSize: number;
  defaultHeight: number;
  W: number;
  H: number;
  surface: Surface;
  seaLevel: number;
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

self.onmessage = (e: MessageEvent<GeographyRequest>) => {
  const req = e.data;
  const { height, sea } = toInt16(req);
  req.tiles.length = 0;
  const g = analyzeGeography(height, req.W, req.H, req.surface, sea);
  const transfer: Transferable[] = [g.labels.buffer as ArrayBuffer, ...g.outlines.map((o) => o.pts.buffer as ArrayBuffer)];
  (self as unknown as Worker).postMessage(g, transfer);
};
