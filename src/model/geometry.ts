import { assetLibrary } from '../assets/library';
import type { MapObject, Vec2 } from './types';

export function objectSize(o: MapObject): { w: number; h: number } {
  const aspect = assetLibrary.get(o.assetId)?.aspect ?? 1;
  const w = o.size * o.scale;
  return { w, h: w * aspect * (o.stretch ?? 1) };
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

/**
 * The eight resize handles of a symbol, corners (TL, TR, BR, BL) then sides (T, R, B, L), in world
 * units; and each one's direction in the symbol's own frame.
 */
export const HANDLE_DIRS: Vec2[] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export function objectHandles(o: MapObject, pad = 0): Vec2[] {
  const { w, h } = objectSize(o);
  const a = (o.rotation * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const hw = w / 2 + pad;
  const hh = h / 2 + pad;
  return HANDLE_DIRS.map(([dx, dy]) => {
    const x = dx * hw;
    const y = dy * hh;
    return [o.x + x * c - y * s, o.y + x * s + y * c] as Vec2;
  });
}

/** The CSS cursor for a resize handle, turned with the symbol. */
export function handleCursor(handle: number, rotation: number): string {
  const [dx, dy] = HANDLE_DIRS[handle];
  const ang = ((Math.atan2(dy, dx) * 180) / Math.PI + rotation + 360) % 180;
  const k = Math.round(ang / 45) % 4;
  return ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][k];
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
