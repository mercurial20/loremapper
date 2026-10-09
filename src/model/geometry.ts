import { assetLibrary } from '../assets/library';
import type { MapObject, Vec2 } from './types';

export function objectSize(o: MapObject): { w: number; h: number } {
  const aspect = assetLibrary.get(o.assetId)?.aspect ?? 1;
  const w = o.size * o.scale;
  return { w, h: w * aspect };
}

/** Rotated rectangle corners (TL, TR, BR, BL) in world units, around the object's own x. */
export function objectCorners(o: MapObject, pad = 0): Vec2[] {
  const { w, h } = objectSize(o);
  const a = (o.rotation * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const hw = w / 2 + pad;
  const hh = h / 2 + pad;
  return [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ].map(([x, y]) => [o.x + x * c - y * s, o.y + x * s + y * c] as Vec2);
}

/** Point in the object's local (unrotated) frame. */
export function toLocal(o: MapObject, x: number, y: number): Vec2 {
  const a = (-o.rotation * Math.PI) / 180;
  const dx = x - o.x;
  const dy = y - o.y;
  return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
}

export function rotateHandle(o: MapObject, zoom: number): Vec2 {
  const { h } = objectSize(o);
  const a = (o.rotation * Math.PI) / 180;
  const d = h / 2 + 22 / zoom;
  return [o.x + Math.sin(a) * d, o.y - Math.cos(a) * d];
}
