import { analyzeGeography } from './geography';

export interface GeographyRequest {
  height: Float32Array;
  W: number;
  H: number;
  radiusKm: number;
  seaLevel: number;
}

self.onmessage = (e: MessageEvent<GeographyRequest>) => {
  const { height, W, H, radiusKm, seaLevel } = e.data;
  const g = analyzeGeography(height, W, H, radiusKm, seaLevel);
  (self as unknown as Worker).postMessage(g, [g.labels.buffer as ArrayBuffer]);
};
