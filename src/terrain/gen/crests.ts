import { blurKm, dyKm, type Grid } from './grid';

/*
 * The crest lines of a world's mountain belts, so the generated ranges are the same line objects
 * a map maker draws: each belt where the plates collide, traced along the ridge of its uplift
 * from its highest point both ways, as long as it stays a belt; a belt that bends or forks gives
 * more than one line.
 */

export interface Crest {
  /** Points along the crest, world cells, x unwrapped (continuous across the antimeridian). */
  points: [number, number][];
  /** Strength of the belt's uplift along the crest, its highest (0 … 1). */
  strength: number;
  /** Half the belt's width, km. */
  halfWidthKm: number;
}

/** A belt's uplift at least this strong is mountains (a crest is traced inside it). */
const BELT = 0.22;
/** A crest starts only where the uplift is at least this strong. */
const START = 0.5;
/** Steps (working-grid cells) between a crest's points while tracing. */
const STEP = 2.5;
/** A crest turns at most this much (radians) from one step to the next... */
const TURN = 0.35;
/** ...and, all told, this much from the way it set out (a range is a chain, not a ring). */
const BEND = 1.75;
/** Crests shorter than this (km) are left out (a short belt is a massif, not a range). */
const MIN_KM = 350;

/** Trace the crest lines of the belts of `raw` (0 … 1, on grid `g`). */
export function crestLines(g: Grid, raw: Float32Array, land: Uint8Array): Crest[] {
  const { w, h } = g;
  const N = w * h;
  // traced along the belt's broad ridge, not along every bump of it
  const uplift = blurKm(raw, g, 60, 2);
  const at = (x: number, y: number) => {
    if (y < 0 || y >= h - 1) return 0;
    let x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const get = (i: number, j: number) => {
      let ii = i;
      if (g.wrap) ii = ((ii % w) + w) % w;
      else if (ii < 0 || ii >= w) return 0;
      const k = j * w + ii;
      return land[k] ? uplift[k] : 0;
    };
    const a = get(x0, y0) * (1 - fx) + get(x0 + 1, y0) * fx;
    const b = get(x0, y0 + 1) * (1 - fx) + get(x0 + 1, y0 + 1) * fx;
    return a * (1 - fy) + b * fy;
  };
  // cells already claimed by a crest (within its belt)
  const taken = new Uint8Array(N);
  const cellOf = (x: number, y: number) => {
    let i = Math.floor(x);
    const j = Math.floor(y);
    if (j < 0 || j >= h) return -1;
    if (g.wrap) i = ((i % w) + w) % w;
    else if (i < 0 || i >= w) return -1;
    return j * w + i;
  };
  // strongest uplift first
  const starts: number[] = [];
  for (let k = 0; k < N; k++) if (land[k] && uplift[k] >= START) starts.push(k);
  starts.sort((a, b) => uplift[b] - uplift[a]);
  const out: Crest[] = [];
  for (const s of starts) {
    if (taken[s]) continue;
    const sx = (s % w) + 0.5;
    const sy = Math.floor(s / w) + 0.5;
    // the belt's direction here: across it the uplift falls fastest
    const gx = at(sx + 1, sy) - at(sx - 1, sy);
    const gy = at(sx, sy + 1) - at(sx, sy - 1);
    const gl = Math.hypot(gx, gy);
    let dir = gl > 1e-6 ? Math.atan2(gx, -gy) : 0;
    const halves: [number, number][][] = [];
    for (const sign of [1, -1]) {
      const pts: [number, number][] = [];
      let x = sx;
      let y = sy;
      let d = dir + (sign < 0 ? Math.PI : 0);
      const d0 = d;
      // never back over its own way
      const mine = new Set<number>();
      const mark = (px: number, py: number) => {
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const k = cellOf(px + dx, py + dy);
            if (k >= 0) mine.add(k);
          }
      };
      mark(x, y);
      for (const [px, py] of halves[0] ?? []) mark(px, py);
      for (let n = 0; n < 2000; n++) {
        // the strongest uplift a step ahead, within the turn allowed
        let best = -1;
        let bx = 0;
        let by = 0;
        let bd = d;
        for (let a = -TURN; a <= TURN + 1e-9; a += TURN / 4) {
          const dd = d + a;
          // the way it set out, give or take BEND
          const off = Math.atan2(Math.sin(dd - d0), Math.cos(dd - d0));
          if (Math.abs(off) > BEND) continue;
          const nx = x + Math.cos(dd) * STEP;
          const ny = y + Math.sin(dd) * STEP;
          // keep straight unless the belt bends: a little preference for going on
          const v = at(nx, ny) * (1 - 0.08 * Math.abs(a));
          if (v > best) {
            best = v;
            bx = nx;
            by = ny;
            bd = dd;
          }
        }
        const k = cellOf(bx, by);
        if (best < BELT || k < 0 || taken[k] || mine.has(k)) break;
        x = bx;
        y = by;
        d = bd;
        pts.push([x, y]);
        mark(x, y);
      }
      halves.push(pts);
      if (sign > 0) dir = d;
    }
    const line: [number, number][] = [...halves[1].reverse(), [sx, sy], ...halves[0]];
    // the belt's half width: how far the uplift stays strong across the crest
    let across = 0;
    let samples = 0;
    let strength = 0;
    for (let i = 0; i < line.length; i += 3) {
      const [x, y] = line[i];
      const a = line[Math.max(0, i - 1)];
      const b = line[Math.min(line.length - 1, i + 1)];
      const tx = b[0] - a[0];
      const ty = b[1] - a[1];
      const tl = Math.hypot(tx, ty) || 1;
      const nx = -ty / tl;
      const ny = tx / tl;
      for (const s2 of [1, -1]) {
        let r = 0;
        while (r < 60 && at(x + nx * s2 * (r + 1), y + ny * s2 * (r + 1)) >= BELT * 0.6) r++;
        across += r + 0.5;
        samples++;
      }
      strength = Math.max(strength, at(x, y));
    }
    const halfWidth = across / Math.max(1, samples);
    // claim the belt around the crest, so other crests start elsewhere
    for (const [x, y] of line) {
      const R = Math.ceil(halfWidth + 1);
      for (let dy = -R; dy <= R; dy++)
        for (let dx = -R; dx <= R; dx++) {
          if (dx * dx + dy * dy > R * R) continue;
          const k = cellOf(x + dx, y + dy);
          if (k >= 0) taken[k] = 1;
        }
    }
    let len = 0;
    for (let i = 1; i < line.length; i++) len += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
    if (len * dyKm(g) < MIN_KM) continue;
    // to world cells, x unwrapped along the line
    const pts: [number, number][] = [];
    let prev = NaN;
    for (const [x, y] of line) {
      let wx = g.x0 + x * g.step;
      if (g.wrap && prev === prev) {
        while (wx - prev > g.W / 2) wx -= g.W;
        while (prev - wx > g.W / 2) wx += g.W;
      }
      prev = wx;
      pts.push([wx, g.y0 + y * g.step]);
    }
    out.push({ points: pts, strength, halfWidthKm: halfWidth * dyKm(g) });
  }
  return out;
}
