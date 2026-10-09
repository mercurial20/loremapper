import type { Geo } from '../core/geo';
import { distToSegment, pointInPolygon } from '../core/math';
import { objectCorners, toLocal } from '../model/geometry';
import type { MapDocument, SelectionRef, Vec2 } from '../model/types';
import type { ResolvedPeak } from '../terrain/peaks';
import { sampleSpline } from '../render/vectorGeometry';
import { objectSize } from '../model/geometry';

/** Shift x so it is the copy of `x` nearest to `ref` (longitude wrap). */
export function nearX(geo: Geo, ref: number, x: number): number {
  return ref + geo.deltaX(ref, x);
}

export interface HitContext {
  geo: Geo;
  zoom: number;
  doc: MapDocument;
  peaks: ResolvedPeak[];
  labelBounds: (id: string) => { w: number; h: number } | null;
  peakMin: number;
  layersVisible: { objects: boolean; paths: boolean; territories: boolean; labels: boolean; peaks: boolean };
}

export function hitObject(ctx: HitContext, x: number, y: number): string | null {
  if (!ctx.layersVisible.objects) return null;
  const layers = new Map(ctx.doc.objectLayers.map((l, i) => [l.id, { l, i }]));
  const objs = Object.values(ctx.doc.objects)
    // objects on hidden or locked layers can't be picked
    .filter((o) => !o.hidden && layers.get(o.layerId)?.l.visible !== false && !layers.get(o.layerId)?.l.locked)
    .sort((a, b) => (layers.get(b.layerId)?.i ?? 0) - (layers.get(a.layerId)?.i ?? 0) || b.z - a.z);
  for (const o of objs) {
    const px = nearX(ctx.geo, o.x, x);
    const [lx, ly] = toLocal(o, px, y);
    const { w, h } = objectSize(o);
    const pad = 3 / ctx.zoom;
    if (Math.abs(lx) <= w / 2 + pad && Math.abs(ly) <= h / 2 + pad) return o.id;
  }
  return null;
}

export function hitLabel(ctx: HitContext, x: number, y: number): string | null {
  if (!ctx.layersVisible.labels) return null;
  for (const l of Object.values(ctx.doc.labels)) {
    if (l.hidden) continue;
    const b = ctx.labelBounds(l.id);
    if (!b) continue;
    const px = nearX(ctx.geo, l.x, x);
    const a = (-l.rotation * Math.PI) / 180;
    const dx = px - l.x;
    const dy = y - l.y;
    const lx = dx * Math.cos(a) - dy * Math.sin(a);
    const ly = dx * Math.sin(a) + dy * Math.cos(a);
    if (Math.abs(lx) <= b.w / 2 + 3 / ctx.zoom && Math.abs(ly) <= b.h / 2) return l.id;
  }
  return null;
}

export function hitPath(ctx: HitContext, x: number, y: number): string | null {
  if (!ctx.layersVisible.paths) return null;
  let best: string | null = null;
  let bestD = Infinity;
  for (const p of Object.values(ctx.doc.paths)) {
    if (p.hidden || p.points.length < 2) continue;
    const px = nearX(ctx.geo, p.points[0][0], x);
    const pts = sampleSpline(p.points, ctx.zoom, false, 8);
    const tol = Math.max(p.width / 2, 6 / ctx.zoom);
    for (let i = 1; i < pts.length; i++) {
      const d = distToSegment(px, y, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
      if (d < tol && d < bestD) {
        bestD = d;
        best = p.id;
      }
    }
  }
  return best;
}

export function hitTerritory(ctx: HitContext, x: number, y: number): string | null {
  if (!ctx.layersVisible.territories) return null;
  const ts = Object.values(ctx.doc.territories).filter((t) => !t.hidden && t.points.length >= 3);
  // smallest containing territory wins (enclaves)
  let best: string | null = null;
  let bestArea = Infinity;
  for (const t of ts) {
    const px = nearX(ctx.geo, t.points[0][0], x);
    const poly = sampleSpline(t.points, ctx.zoom, true, 10);
    if (!pointInPolygon(px, y, poly)) continue;
    let area = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) area += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
    area = Math.abs(area);
    if (area < bestArea) {
      bestArea = area;
      best = t.id;
    }
  }
  return best;
}

export function hitPeak(ctx: HitContext, x: number, y: number, radiusPx = 12): ResolvedPeak | null {
  if (!ctx.layersVisible.peaks) return null;
  let best: ResolvedPeak | null = null;
  let bestD = radiusPx / ctx.zoom;
  for (const p of ctx.peaks) {
    if (!p.designated && p.elevation < ctx.peakMin) continue;
    const d = Math.hypot(ctx.geo.deltaX(p.x, x), p.y - 4 / ctx.zoom - y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** Topmost selectable item at a point. */
export function hitAny(ctx: HitContext, x: number, y: number): SelectionRef | null {
  const peak = hitPeak(ctx, x, y, 9);
  if (peak) return { kind: 'peak', id: peak.id };
  const label = hitLabel(ctx, x, y);
  if (label) return { kind: 'label', id: label };
  const obj = hitObject(ctx, x, y);
  if (obj) return { kind: 'object', id: obj };
  const path = hitPath(ctx, x, y);
  if (path) return { kind: 'path', id: path };
  const terr = hitTerritory(ctx, x, y);
  if (terr) return { kind: 'territory', id: terr };
  return null;
}

/** Index of the control point near (x, y), if any. */
export function hitVertex(geo: Geo, points: Vec2[], x: number, y: number, zoom: number, tolPx = 8): number {
  if (!points.length) return -1;
  const px = nearX(geo, points[0][0], x);
  let best = -1;
  let bestD = tolPx / zoom;
  points.forEach(([vx, vy], i) => {
    const d = Math.hypot(vx - px, vy - y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Insertion index for a new control point near (x, y) on a polyline (closed = polygon). */
export function insertionIndex(points: Vec2[], x: number, y: number, closed: boolean): number {
  let best = points.length;
  let bestD = Infinity;
  const n = points.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const d = distToSegment(x, y, a[0], a[1], b[0], b[1]);
    if (d < bestD) {
      bestD = d;
      best = i + 1;
    }
  }
  return best;
}

export function objectHandleHit(ctx: HitContext, id: string, x: number, y: number, rotate: Vec2): 'rotate' | number | null {
  const o = ctx.doc.objects[id];
  if (!o) return null;
  const px = nearX(ctx.geo, o.x, x);
  const tol = 8 / ctx.zoom;
  if (Math.hypot(px - rotate[0], y - rotate[1]) < tol) return 'rotate';
  const c = objectCorners(o, 2 / ctx.zoom);
  for (let i = 0; i < 4; i++) if (Math.hypot(px - c[i][0], y - c[i][1]) < tol) return i;
  return null;
}
