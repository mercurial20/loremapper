import type { Graphics } from 'pixi.js';
import { catmullRom } from '../core/math';
import type { Vec2 } from '../model/types';

/** Sample a spline adaptively so segments are ~`pxStep` screen pixels long. */
export function sampleSpline(points: Vec2[], zoom: number, closed = false, pxStep = 5): Vec2[] {
  if (points.length < 2) return points.slice();
  let len = 0;
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  const segs = closed ? points.length : points.length - 1;
  const perSeg = Math.max(2, Math.min(48, Math.ceil((len * zoom) / pxStep / Math.max(1, segs))));
  return catmullRom(points, perSeg, closed);
}

export function polylineLength(pts: Vec2[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return l;
}

/** Split a polyline into dash segments. */
export function dashes(pts: Vec2[], dash: number, gap: number, closed = false): Vec2[][] {
  const path = closed && pts.length > 2 ? [...pts, pts[0]] : pts;
  const out: Vec2[][] = [];
  let cur: Vec2[] = [];
  let on = true;
  let remain = dash;
  for (let i = 1; i < path.length; i++) {
    let [ax, ay] = path[i - 1];
    const [bx, by] = path[i];
    let segLen = Math.hypot(bx - ax, by - ay);
    if (on && cur.length === 0) cur.push([ax, ay]);
    while (segLen > 0) {
      if (segLen <= remain) {
        remain -= segLen;
        if (on) cur.push([bx, by]);
        segLen = 0;
      } else {
        const t = remain / segLen;
        const mx = ax + (bx - ax) * t;
        const my = ay + (by - ay) * t;
        if (on) {
          cur.push([mx, my]);
          out.push(cur);
          cur = [];
        } else cur = [[mx, my]];
        segLen -= remain;
        ax = mx;
        ay = my;
        on = !on;
        remain = on ? dash : gap;
      }
    }
  }
  if (on && cur.length > 1) out.push(cur);
  return out;
}

/** Points spaced evenly along a polyline (for dotted lines). */
export function dots(pts: Vec2[], spacing: number, closed = false): Vec2[] {
  const path = closed && pts.length > 2 ? [...pts, pts[0]] : pts;
  const out: Vec2[] = [];
  let carry = 0;
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1];
    const [bx, by] = path[i];
    const l = Math.hypot(bx - ax, by - ay);
    let d = carry;
    while (d < l) {
      const t = d / l;
      out.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
      d += spacing;
    }
    carry = d - l;
  }
  return out;
}

export function strokePolyline(g: Graphics, pts: Vec2[], closed = false) {
  if (pts.length < 2) return;
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  if (closed) g.closePath();
}

/** Ribbon polygon around a polyline with per-point width. */
export function ribbon(pts: Vec2[], widthAt: (t: number) => number): number[] {
  const n = pts.length;
  if (n < 2) return [];
  const total = polylineLength(pts) || 1;
  const left: number[] = [];
  const right: number[] = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0];
    let ty = b[1] - a[1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const hw = widthAt(acc / total) / 2;
    left.push(pts[i][0] - ty * hw, pts[i][1] + tx * hw);
    right.push(pts[i][0] + ty * hw, pts[i][1] - tx * hw);
  }
  const poly = left.slice();
  for (let i = right.length - 2; i >= 0; i -= 2) poly.push(right[i], right[i + 1]);
  return poly;
}
