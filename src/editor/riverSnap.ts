import { alongCurve, nearestOnCurve, riverCurve } from '../model/rivers';
import type { PathFeature, PathOutlet, Vec2 } from '../model/types';
import { isOpenWater, lakeDepthAt } from '../terrain/lakes';
import type { TerrainModel } from '../terrain/TerrainModel';

/*
 * Snapping a river's ends while it is drawn: a river runs into the sea, a lake or another river.
 * Its end is pulled onto the shore (or onto the other river's line), so the mouth meets the
 * water exactly, and a river drawn from its mouth upstream is turned around.
 */

/** Open water at a point: the sea, or a lake. */
export const isWater = isOpenWater;

/** The height of the surface at a point: a lake's level over its water, else the ground or the sea. */
function surface(model: TerrainModel, p: Vec2): number {
  const x = model.geo.wrapX(p[0]);
  const lake = lakeDepthAt(model, x, p[1]);
  return lake.depth > 0 ? lake.level : Math.max(model.seaLevel, model.heightAt(x, p[1]));
}

/** Where a straight line from land `a` to water `b` reaches the shore. */
function shoreBetween(model: TerrainModel, a: Vec2, b: Vec2): Vec2 {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 14; i++) {
    const m = (lo + hi) / 2;
    if (isWater(model, a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m)) hi = m;
    else lo = m;
  }
  return [a[0] + (b[0] - a[0]) * hi, a[1] + (b[1] - a[1]) * hi];
}

export type RiverSnapTarget = { kind: 'water'; at: Vec2; d: number } | { kind: 'path'; at: Vec2; d: number; id: string; t: number };

/**
 * What a river's end at `p` would snap to within `radius` (world units): the nearest shore of
 * the sea or a lake, or the nearest point on another river. Null when there is nothing near.
 */
export function riverSnapAt(model: TerrainModel, paths: Record<string, PathFeature>, p: Vec2, radius: number, self?: string): RiverSnapTarget | null {
  let best: RiverSnapTarget | null = null;
  for (const q of Object.values(paths)) {
    if (q.kind !== 'river' || q.id === self || q.hidden || q.oxbow || q.points.length < 2) continue;
    const n = nearestOnCurve(riverCurve(q.points), p);
    // the line, and a little more for a wide river's banks
    const reach = radius + q.width / 2;
    if (n.d <= reach && (!best || n.d < best.d)) best = { kind: 'path', at: n.at, d: n.d, id: q.id, t: n.t };
  }
  if (isWater(model, p[0], p[1])) {
    // in the water already: the river ends where it reached it (cut later along its course)
    if (!best || best.d > radius * 0.25) best = { kind: 'water', at: p, d: 0 };
    return best;
  }
  // the nearest water around, then the shore on the way to it
  let near: Vec2 | null = null;
  let nd = Infinity;
  const rings = 8;
  for (let r = 1; r <= rings; r++) {
    const rr = (radius * r) / rings;
    const n = Math.max(12, Math.round(rr * 6));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const q: Vec2 = [p[0] + Math.cos(a) * rr, p[1] + Math.sin(a) * rr];
      if (isWater(model, q[0], q[1])) {
        near = q;
        nd = rr;
        break;
      }
    }
    if (near) break;
  }
  if (near) {
    const at = shoreBetween(model, p, near);
    const d = Math.hypot(at[0] - p[0], at[1] - p[1]);
    // a river line right here wins over a shore a little further on
    if ((!best || d < best.d) && d <= nd + 1e-6) best = { kind: 'water', at, d };
  }
  return best;
}

export interface SnappedRiver {
  points: Vec2[];
  outlet?: PathOutlet;
  /** A river drawn on through a lake goes on as another river, flowing out of it. */
  more?: SnappedRiver[];
}

/**
 * Where a line drawn through water crosses it: the shore where it first goes in, and where it
 * comes out again, by segment. Null when it never goes into water, or the water is the sea.
 */
function crossing(model: TerrainModel, pts: Vec2[]): { inSeg: number; inAt: Vec2; outSeg: number; outAt: Vec2 } | null {
  let entered: { seg: number; at: Vec2 } | null = null;
  let prev = pts[0];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.5));
    for (let k = 1; k <= steps; k++) {
      const q: Vec2 = [ax + ((bx - ax) * k) / steps, ay + ((by - ay) * k) / steps];
      const w = isWater(model, q[0], q[1]);
      if (!entered && w) {
        // only lakes are crossed: a river drawn into the sea ends there
        if (lakeDepthAt(model, model.geo.wrapX(q[0]), q[1]).depth <= 0) return null;
        entered = { seg: i, at: shoreBetween(model, prev, q) };
      } else if (entered && !w) return { inSeg: entered.seg, inAt: entered.at, outSeg: i, outAt: shoreBetween(model, q, prev) };
      prev = q;
    }
  }
  return null;
}

/** A drawn river that starts out in a lake begins at the shore where it leaves it. */
function leaveWater(model: TerrainModel, pts: Vec2[]): Vec2[] {
  if (!isWater(model, pts[0][0], pts[0][1])) return pts;
  let prev = pts[0];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.5));
    for (let k = 1; k <= steps; k++) {
      const q: Vec2 = [ax + ((bx - ax) * k) / steps, ay + ((by - ay) * k) / steps];
      if (!isWater(model, q[0], q[1])) return [shoreBetween(model, q, prev), ...pts.slice(i + 1)];
      prev = q;
    }
  }
  return pts;
}

const lengthOf = (pts: Vec2[]) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);

/**
 * A drawn river with its ends snapped: drawn from its mouth upstream, it is turned around; a
 * mouth near water is pulled onto the shore (a course drawn on into the water is cut there); a
 * mouth near another river joins it.
 */
export function snapRiver(model: TerrainModel, paths: Record<string, PathFeature>, raw: Vec2[], radius: number, self?: string, orient = true): SnappedRiver {
  let pts = raw.slice();
  if (pts.length < 2) return { points: pts };
  const startSnap = riverSnapAt(model, paths, pts[0], radius, self);
  let endSnap = riverSnapAt(model, paths, pts[pts.length - 1], radius, self);
  // drawn from the mouth: rivers run downhill, so a river that starts at other water lower than
  // where it ends was drawn upstream (one leaving a lake runs downhill from it, and stays)
  const lower = (a: Vec2, b: Vec2) => surface(model, a) < surface(model, b);
  if (orient && startSnap && lower(pts[0], pts[pts.length - 1])) {
    pts = pts.reverse();
    endSnap = startSnap;
  }
  // drawn on through a lake: a river into it, and another flowing out of it
  pts = leaveWater(model, pts);
  if (pts.length < 2) return { points: pts };
  const through = crossing(model, pts);
  if (through) {
    const rest = [through.outAt, ...pts.slice(through.outSeg + 1)];
    if (lengthOf(rest) > Math.max(3, radius)) {
      const inflow = pts.slice(0, through.inSeg + 1);
      while (inflow.length > 1 && Math.hypot(inflow[inflow.length - 1][0] - through.inAt[0], inflow[inflow.length - 1][1] - through.inAt[1]) < radius) inflow.pop();
      inflow.push(through.inAt);
      // the river goes on the way it was drawn
      const out = snapRiver(model, paths, rest, radius, self, false);
      return { points: dedupe(inflow), outlet: { kind: 'water' }, more: [{ ...out, more: undefined }, ...(out.more ?? [])] };
    }
  }
  endSnap = riverSnapAt(model, paths, pts[pts.length - 1], radius, self);
  if (!endSnap) return { points: pts };
  /** Drop the drawn points close to where the river now ends, so its last bend is not a tight loop. */
  const approach = (target: Vec2) => {
    while (pts.length > 1 && Math.hypot(pts[pts.length - 1][0] - target[0], pts[pts.length - 1][1] - target[1]) < radius) pts.pop();
  };
  if (endSnap.kind === 'water') {
    // the river's course up to where it first reaches the water
    const first = pts.findIndex((q, i) => i > 0 && isWater(model, q[0], q[1]));
    let mouth: Vec2;
    if (first > 0) {
      mouth = shoreBetween(model, pts[first - 1], pts[first]);
      pts = pts.slice(0, first);
    } else {
      // ending short of the water: on along the way it was going, else to the nearest shore
      const end = pts[pts.length - 1];
      const prev = pts[pts.length - 2];
      const l = Math.hypot(end[0] - prev[0], end[1] - prev[1]) || 1;
      const dx = (end[0] - prev[0]) / l;
      const dy = (end[1] - prev[1]) / l;
      mouth = endSnap.at;
      let last = end;
      for (let k = 1; k <= 24; k++) {
        const q: Vec2 = [end[0] + dx * radius * 1.5 * (k / 24), end[1] + dy * radius * 1.5 * (k / 24)];
        if (isWater(model, q[0], q[1])) {
          mouth = shoreBetween(model, last, q);
          break;
        }
        last = q;
      }
    }
    approach(mouth);
    pts.push(mouth);
    return { points: dedupe(pts), outlet: { kind: 'water' } };
  }
  // a tributary: it ends on the other river's line, at the angle it comes in at (a bend forced
  // onto the last stretch would loop)
  const main = paths[endSnap.id];
  const { at } = alongCurve(riverCurve(main.points), endSnap.t);
  approach(at);
  pts.push(at);
  return { points: dedupe(pts), outlet: { kind: 'path', id: main.id, t: endSnap.t } };
}

/** Drop points that fall on the one before them. */
function dedupe(pts: Vec2[]): Vec2[] {
  return pts.filter((q, i) => i === 0 || Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) > 1e-4);
}
