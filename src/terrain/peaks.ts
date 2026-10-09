import type { PeakAnnotation } from '../model/types';
import type { TerrainModel } from './TerrainModel';

export interface DetectedPeak {
  x: number;
  y: number;
  /** metres above sea level */
  elevation: number;
}

export interface ResolvedPeak extends DetectedPeak {
  /** Stable id: annotation id for user peaks, position-derived for automatic ones. */
  id: string;
  name: string;
  annotationId?: string;
  designated: boolean;
}

/**
 * Find mountain peaks as local elevation maxima: cells that are the highest
 * point within `radiusKm` and rise at least `minElevation` above sea level.
 * Only allocated tiles are scanned — untouched ocean holds no peaks.
 */
export function detectPeaks(model: TerrainModel, minElevation = 400, radiusKm = 140): DetectedPeak[] {
  const g = model.height;
  const { TS, NX } = g;
  const sea = model.seaLevel;
  const geo = model.geo;
  const ry = Math.max(2, Math.round(radiusKm / geo.kmPerCellY));
  const out: DetectedPeak[] = [];
  for (const [key, tile] of g.tiles) {
    const tx = key % NX;
    const ty = Math.floor(key / NX);
    for (let ly = 0; ly < TS; ly++) {
      const y = ty * TS + ly;
      if (y >= model.H) break;
      for (let lx = 0; lx < TS; lx++) {
        const h = tile[ly * TS + lx];
        if (h - sea < minElevation) continue;
        const x = tx * TS + lx;
        // quick 3×3 test (fast path inside the tile)
        let isMax = true;
        for (let oy = -1; oy <= 1 && isMax; oy++)
          for (let ox = -1; ox <= 1; ox++) {
            if (!ox && !oy) continue;
            const ix = lx + ox;
            const iy = ly + oy;
            const v = ix >= 0 && iy >= 0 && ix < TS && iy < TS ? tile[iy * TS + ix] : g.get(x + ox, y + oy);
            if (v > h) {
              isMax = false;
              break;
            }
          }
        if (!isMax) continue;
        // radius test, ellipse widened with latitude
        const cosLat = Math.max(0.05, Math.cos((geo.lat(y + 0.5) * Math.PI) / 180));
        const rx = Math.min(model.W / 4, Math.round(ry / cosLat));
        let ok = true;
        for (let oy = -ry; oy <= ry && ok; oy++) {
          const yy = y + oy;
          if (yy < 0 || yy >= model.H) continue;
          const span = Math.round(rx * Math.sqrt(1 - (oy * oy) / (ry * ry)));
          for (let ox = -span; ox <= span; ox++) {
            if (!ox && !oy) continue;
            const v = g.get(x + ox, yy);
            // ties: the first cell in scan order wins
            if (v > h || (v === h && (oy < 0 || (oy === 0 && ox < 0)))) {
              ok = false;
              break;
            }
          }
        }
        if (ok) out.push({ x: x + 0.5, y: y + 0.5, elevation: h - sea });
      }
    }
  }
  out.sort((a, b) => b.elevation - a.elevation);
  return out;
}

/** Climb uphill from (x, y) to the nearest local maximum (max `steps` cells). */
export function climbToPeak(model: TerrainModel, x: number, y: number, steps = 10): DetectedPeak {
  const g = model.height;
  let cx = Math.floor(x);
  let cy = Math.floor(y);
  let ch = g.get(cx, cy);
  for (let s = 0; s < steps; s++) {
    let bx = cx;
    let by = cy;
    let bh = ch;
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++) {
        const v = g.get(cx + ox, cy + oy);
        if (v > bh) {
          bh = v;
          bx = cx + ox;
          by = cy + oy;
        }
      }
    if (bx === cx && by === cy) break;
    cx = bx;
    cy = by;
    ch = bh;
  }
  return { x: model.geo.wrapX(cx) + 0.5, y: cy + 0.5, elevation: ch - model.seaLevel };
}

/** Merge detected peaks with user annotations (names, designations, removals). */
export function resolvePeaks(model: TerrainModel, detected: DetectedPeak[], annotations: PeakAnnotation[]): ResolvedPeak[] {
  const geo = model.geo;
  const near = (a: { x: number; y: number }, b: { x: number; y: number }, r: number) =>
    Math.abs(geo.deltaX(a.x, b.x)) <= r && Math.abs(a.y - b.y) <= r;
  const out: ResolvedPeak[] = [];
  const used = new Set<number>();
  for (const ann of annotations) {
    const snapped = climbToPeak(model, ann.x, ann.y, 6);
    let idx = -1;
    for (let i = 0; i < detected.length; i++) {
      if (!used.has(i) && near(detected[i], snapped, 2.5)) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) used.add(idx);
    if (ann.mode === 'suppressed') continue;
    out.push({
      ...snapped,
      id: ann.id,
      name: ann.name,
      annotationId: ann.id,
      designated: true,
    });
  }
  detected.forEach((p, i) => {
    if (used.has(i)) return;
    out.push({ ...p, id: `auto:${Math.floor(p.x)}:${Math.floor(p.y)}`, name: '', designated: false });
  });
  return out;
}
