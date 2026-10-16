import { catmullRom, clamp } from '../core/math';
import type { PathFeature, Vec2 } from './types';

/*
 * Rivers as a network. A tributary joins another river somewhere along it; below the join the
 * river carries both waters and is wider. Width grows with the square root of the discharge
 * (hydraulic geometry, w ∝ Q^0.5), so discharges add as squared widths.
 */

/** A river's centre line at a fixed resolution (about half a cell), for joins that stay put at every zoom. */
const curves = new WeakMap<Vec2[], Vec2[]>();

export function riverCurve(points: Vec2[]): Vec2[] {
  const known = curves.get(points);
  if (known) return known;
  const c = sampleRiver(points);
  curves.set(points, c);
  return c;
}

function sampleRiver(points: Vec2[]): Vec2[] {
  if (points.length < 2) return points.slice();
  let len = 0;
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  const per = Math.max(2, Math.min(64, Math.ceil((len * 2) / Math.max(1, points.length - 1))));
  return catmullRom(points, per);
}

/** Lengths along a curve, from its start. */
export function curveLengths(curve: Vec2[]): number[] {
  const cum = [0];
  for (let i = 1; i < curve.length; i++) cum.push(cum[i - 1] + Math.hypot(curve[i][0] - curve[i - 1][0], curve[i][1] - curve[i - 1][1]));
  return cum;
}

/** The point `t` of the way along a curve (0 … 1 of its length), and the direction there. */
export function alongCurve(curve: Vec2[], t: number): { at: Vec2; dir: Vec2 } {
  if (curve.length < 2) return { at: curve[0], dir: [1, 0] };
  const cum = curveLengths(curve);
  const target = clamp(t, 0, 1) * cum[cum.length - 1];
  let i = 1;
  while (i < curve.length - 1 && cum[i] < target) i++;
  const f = clamp((target - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]), 0, 1);
  const [ax, ay] = curve[i - 1];
  const [bx, by] = curve[i];
  const l = Math.hypot(bx - ax, by - ay) || 1;
  return { at: [ax + f * (bx - ax), ay + f * (by - ay)], dir: [(bx - ax) / l, (by - ay) / l] };
}

/** The nearest point of a curve to p: how far along it lies (0 … 1), the point and its distance. */
export function nearestOnCurve(curve: Vec2[], p: Vec2): { t: number; d: number; at: Vec2 } {
  const cum = curveLengths(curve);
  const total = cum[cum.length - 1];
  let best = { t: 0, d: Infinity, at: curve[0] };
  for (let i = 1; i < curve.length; i++) {
    const [ax, ay] = curve[i - 1];
    const [bx, by] = curve[i];
    const dx = bx - ax;
    const dy = by - ay;
    const f = clamp(((p[0] - ax) * dx + (p[1] - ay) * dy) / Math.max(1e-9, dx * dx + dy * dy), 0, 1);
    const at: Vec2 = [ax + f * dx, ay + f * dy];
    const d = Math.hypot(p[0] - at[0], p[1] - at[1]);
    if (d < best.d) best = { t: total > 0 ? (cum[i - 1] + f * (cum[i] - cum[i - 1])) / total : 0, d, at };
  }
  return best;
}

/** A river's own width `t` of the way from its source (0) to its mouth (1), world units. */
export function ownWidth(p: PathFeature, t: number): number {
  const wMin = p.taper ? p.width * 0.22 : p.width;
  return wMin + (p.width - wMin) * Math.pow(clamp(t, 0, 1), 0.8);
}

export interface Inflow {
  /** The tributary. */
  id: string;
  /** Where it joins, 0 … 1 along the river. */
  t: number;
  /** Its discharge where it joins (as a squared width). */
  q: number;
}

export interface RiverNet {
  /** Per river, the tributaries that join it, upstream first. */
  inflows: Map<string, Inflow[]>;
  /** Per river, its discharge at its mouth (as a squared width), its tributaries' included. */
  mouthQ: Map<string, number>;
}

const isRiver = (p: PathFeature | undefined): p is PathFeature => !!p && p.kind === 'river' && p.points.length >= 2;

/** Which rivers join which, and how much each carries. */
export function riverNet(paths: Record<string, PathFeature>): RiverNet {
  const inflows = new Map<string, Inflow[]>();
  const mouthQ = new Map<string, number>();
  for (const p of Object.values(paths)) {
    const o = p.outlet;
    if (!isRiver(p) || o?.kind !== 'path' || o.id === p.id || !isRiver(paths[o.id])) continue;
    const list = inflows.get(o.id) ?? [];
    list.push({ id: p.id, t: o.t, q: 0 });
    inflows.set(o.id, list);
  }
  const busy = new Set<string>();
  const q = (id: string): number => {
    const known = mouthQ.get(id);
    if (known !== undefined) return known;
    // a loop of rivers flowing into each other carries only its own water
    if (busy.has(id)) return ownWidth(paths[id], 1) ** 2;
    busy.add(id);
    let sum = ownWidth(paths[id], 1) ** 2;
    for (const f of inflows.get(id) ?? []) {
      f.q = q(f.id);
      sum += f.q;
    }
    busy.delete(id);
    mouthQ.set(id, sum);
    return sum;
  };
  for (const p of Object.values(paths)) if (isRiver(p)) q(p.id);
  for (const list of inflows.values()) list.sort((a, b) => a.t - b.t);
  return { inflows, mouthQ };
}

/**
 * A river's width `t` of the way along it (world units), with the water of the tributaries that
 * joined above. Each one's water spreads into the river over a few of its own widths below the
 * join, so the river widens smoothly instead of in a step.
 */
export function widthAt(p: PathFeature, t: number, net: RiverNet, length: number): number {
  let q = ownWidth(p, t) ** 2;
  for (const f of net.inflows.get(p.id) ?? []) {
    if (t <= f.t) continue;
    const w = Math.sqrt(f.q);
    const s = clamp(((t - f.t) * length) / Math.max(1e-6, 3 * w), 0, 1);
    q += f.q * s * s * (3 - 2 * s);
  }
  return Math.sqrt(q);
}

export interface RiverShape {
  /** Points along the river's centre, about `step` apart, source first, x/y pairs. */
  pts: Float32Array;
  /** Half the river's width at each point. */
  hw: Float32Array;
  /** Where the river's own course ends among the points (beyond: it runs on into the water it meets). */
  end: number;
}

/**
 * The river as it is drawn: its centre line (a tributary's mouth held on the river it joins),
 * its width along it (the water of tributaries above, a tributary never wider than its river),
 * a mouth that opens like a trumpet where it meets the sea or a lake, and a short run on into
 * that water (or into the river it joins), so the waters meet without a gap.
 */
export function riverShape(p: PathFeature, paths: Record<string, PathFeature>, net: RiverNet, step: number): RiverShape | null {
  if (p.points.length < 2) return null;
  const o = p.outlet;
  const main = o?.kind === 'path' ? paths[o.id] : undefined;
  let ctrl = p.points;
  let mainHw = 0;
  if (o?.kind === 'path' && main?.kind === 'river' && main.points.length >= 2) {
    const mc = riverCurve(main.points);
    ctrl = [...ctrl.slice(0, -1), alongCurve(mc, o.t).at];
    mainHw = widthAt(main, o.t, net, curveLengths(mc)[mc.length - 1]) / 2;
  }
  const curve = riverCurve(ctrl);
  const cum = curveLengths(curve);
  const len = cum[cum.length - 1];
  if (len <= 0) return null;
  const toWater = o?.kind === 'water';
  const hwEnd = widthAt(p, 1, net, len) / 2;
  // the trumpet of a mouth: over the last few widths the banks open out
  const flare = toWater ? Math.max(6 * hwEnd, 3) : 0;
  const half = (s: number) => {
    let h = widthAt(p, Math.min(1, s / len), net, len) / 2;
    if (mainHw > 0) h = Math.min(h, mainHw * 0.85);
    if (flare > 0) {
      const f = clamp(1 - (len - s) / flare, 0, 1);
      h *= 1 + 0.9 * f * f;
    }
    return h;
  };
  // a mouth reaches a little way on into the water (where it is not seen), so no strip of land is
  // left between them; it ends rounded, as a tributary does inside its river
  const back = Math.max(4 * hwEnd, 2);
  const { at: before } = alongCurve(curve, clamp(1 - back / len, 0, 1));
  const [ex, ey] = curve[curve.length - 1];
  const dl = Math.hypot(ex - before[0], ey - before[1]) || 1;
  const dx = (ex - before[0]) / dl;
  const dy = (ey - before[1]) / dl;
  const ext = toWater ? 1.5 + 0.5 * half(len) : 0;
  const n = Math.max(2, Math.ceil(len / step) + 1);
  const m = ext > 0 ? Math.ceil(ext / step) : 0;
  const pts = new Float32Array((n + m) * 2);
  const hw = new Float32Array(n + m);
  let i = 1;
  for (let k = 0; k < n; k++) {
    const s = (k / (n - 1)) * len;
    while (i < curve.length - 1 && cum[i] < s) i++;
    const f = clamp((s - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]), 0, 1);
    pts[2 * k] = curve[i - 1][0] + f * (curve[i][0] - curve[i - 1][0]);
    pts[2 * k + 1] = curve[i - 1][1] + f * (curve[i][1] - curve[i - 1][1]);
    hw[k] = half(s);
  }
  for (let k = 1; k <= m; k++) {
    const s = (k / m) * ext;
    pts[2 * (n - 1 + k)] = ex + dx * s;
    pts[2 * (n - 1 + k) + 1] = ey + dy * s;
    hw[n - 1 + k] = half(len);
  }
  return { pts: pts.subarray(0, (n + m) * 2), hw: hw.subarray(0, n + m), end: n - 1 };
}
