import type { Geo } from '../core/geo';
import type { PlanetSettings } from '../core/planet';
import type { Vec2 } from '../model/types';
import { Simplex3, subSeed } from '../core/noise3';
import { smoothstep } from '../core/math';
import { isLake, type TerrainModel } from './TerrainModel';

/*
 * Where water from a source goes. The water runs down the land; in a hollow it rises until
 * either it spills over the lowest point of the rim (an open lake, and the river goes on with
 * what is left) or the lake has grown so wide that it loses all that flows in (a closed lake:
 * the river ends). On its way the river loses water into its bed and to the air, the more the
 * drier the climate and the wider the river: a small river fades away after a while, a great one
 * goes far (the Nile crosses the Sahara). In a marsh (painted on the map) the water spreads out
 * and loses much more. It ends in the sea, a lake, another river, at the map's edge, or where its
 * water has run out.
 *
 * The river carries the water of its source and no more: the tributaries it gathers on the way
 * are the map maker's to place (as sources of their own).
 */

export interface SourceParams {
  /** Where the water comes out, world cells. */
  at: Vec2;
  /** Discharge, m³/s. */
  q: number;
  /** Net evaporation (evaporation minus rain on water), mm a year. */
  aridity: number;
  /** Whether a cell is marsh (painted so on the map): the water spreads there and loses much more. */
  marsh?: (k: number) => boolean;
  /** Water lost into the ground, fraction per 100 km of river. */
  seepage: number;
  /** Hollows shallower than this (m) are passed through instead of filling with a lake. */
  carve: number;
  /** The map's seed: the unseen roughness of its flat ground (the same for every source). */
  seed?: number;
  /** Stop when the clock (performance.now) passes this, with what is found so far (for a preview). */
  deadline?: number;
  /** Lake cells to take as dry ground (a source's own lakes, while it is moved). */
  notLake?: Set<number>;
}

export type SimEnd = 'sea' | 'lake' | 'closed-lake' | 'marsh' | 'river' | 'edge' | 'pit' | 'dry';

export interface SimRiver {
  /** Source to mouth, world cells (cell centres, smoothed later). */
  points: Vec2[];
  /** Discharge at each point, m³/s. */
  flow: number[];
  /** Where it ends. */
  to: 'water' | 'river' | 'land';
  /** The river it joins, when it does. */
  join?: { id: string; t: number };
  /** It flows out of a lake this simulation filled. */
  fromLake: boolean;
}

export interface SimLake {
  cells: number[];
  level: number;
  /** Open: it spills and the river goes on; closed: evaporation takes all that flows in. */
  kind: 'open' | 'closed';
}


export interface SimResult {
  rivers: SimRiver[];
  lakes: SimLake[];
  end: SimEnd;
  /** It ran out of time (see `deadline`): the course goes on beyond what was found. */
  partial?: boolean;
}

/** m³/s lost per km² of water surface, per mm a year of net evaporation. */
export const EVAPORATION = 1e-3 / 31.557e6 * 1e6;
/**
 * What a river's bed lets into the ground, metres a day: little where the ground is soaked (the
 * wet tropics), more in middle latitudes, most in the sand and gravel of dry lands, where rivers
 * dwindle as they go (by net evaporation, mm a year).
 */
const bedLoss = (aridity: number) => 0.02 + 0.06 * smoothstep(-500, 100, aridity) + 0.07 * smoothstep(100, 1500, aridity);
/** What a lake loses through its bed into the ground, mm a year, besides what the air takes. */
export const LAKE_LEAK = 300;
/** In a marsh the water spreads this many times wider than its channel, and loses as much more. */
const MARSH_SPREAD = 12;
/** Below this discharge (m³/s) a river has run dry. */
const DRY = 0.05;
/**
 * Flat ground is never quite flat: the slopes of a few centimetres a kilometre that lead real
 * rivers across plains are finer than any map. Where the map's ground is about this flat (m/m)
 * or flatter, water follows an unseen roughness of the same gentle slope, MICRO_CELLS across at
 * its largest; on steeper ground the map's own slope leads it.
 */
const MICRO_SLOPE = 2e-4;
const MICRO_CELLS = 64;
/** The roughness of flat ground is never taller than this (m). */
const MICRO_HEIGHT = 4;
/** Differences of height smaller than this (m) do not lead water across a flat. */
const FLAT_TOLERANCE = 0.5;
/** Hollows smaller than this many cells never hold a lake (the water passes on). */
const MIN_LAKE = 6;
/** The largest hollow followed, cells. */
const MAX_BASIN = 400_000;
/** Most times hollows the water filled may join into one (each time the lake grows). */
const MAX_MERGES = 2000;
/** Longest course followed, steps (cells). */
const MAX_STEPS = 40_000;

/** Binary min-heap of cells by height. */
class Heap {
  private k: number[] = [];
  private v: number[] = [];
  get size() {
    return this.k.length;
  }
  push(key: number, val: number) {
    const k = this.k;
    const v = this.v;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (v[p] <= val) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  pop(): [number, number] {
    const k = this.k;
    const v = this.v;
    const top: [number, number] = [k[0], v[0]];
    const lk = k.pop()!;
    const lv = v.pop()!;
    const n = k.length;
    if (n) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && v[c + 1] < v[c]) c++;
        if (v[c] >= lv) break;
        k[i] = k[c];
        v[i] = v[c];
        i = c;
      }
      k[i] = lk;
      v[i] = lv;
    }
    return top;
  }
}

/**
 * Follow the water of one source. `joinRiver` finds a river already on the map near a point
 * (the water joins it as a tributary).
 */
export function simulateSource(model: TerrainModel, p: SourceParams, joinRiver?: (at: Vec2) => { id: string; t: number } | null): SimResult {
  const W = model.W;
  const H = model.H;
  const sea = model.seaLevel;
  const hg = model.height;
  const wrap = hg.wrap;
  const h = (k: number) => hg.get(k % W, (k / W) | 0);
  const cellKm = model.geo.kmPerCellY;
  const area = (k: number) => model.geo.cellAreaKm2((k / W) | 0);
  const evap = Math.max(0, p.aridity) * EVAPORATION;
  // a lake loses to the air and into the ground: even where it rains more than the air takes, a
  // small river fills only a small lake (m³/s per km²)
  const lakeLoss = (Math.max(0, p.aridity) + LAKE_LEAK) * EVAPORATION;
  // what the river's bed lets into the ground, m³/s per km² of bed
  const seep = (bedLoss(p.aridity) / 86400) * 1e6;
  const neighbours = (k: number, out: number[]) => {
    const x = k % W;
    const y = (k / W) | 0;
    out.length = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const ny = y + dy;
        if (ny < 0 || ny >= H) continue;
        let nx = x + dx;
        if (nx < 0 || nx >= W) {
          if (!wrap) continue;
          nx = (nx + W) % W;
        }
        out.push(ny * W + nx);
      }
  };
  const isEdge = (k: number) => {
    const x = k % W;
    const y = (k / W) | 0;
    return y === 0 || y === H - 1 || (!wrap && (x === 0 || x === W - 1));
  };
  const centre = (k: number): Vec2 => [(k % W) + 0.5, ((k / W) | 0) + 0.5];
  const cellOf = (q: Vec2) => Math.floor(q[1]) * W + ((Math.floor(q[0]) % W) + W) % W;

  const rivers: SimRiver[] = [];
  const lakes: SimLake[] = [];
  const ours = new Set<number>();
  let Q = Math.max(0, p.q);
  let cur: SimRiver = { points: [], flow: [], to: 'land', fromLake: false };
  const finish = (to: SimRiver['to'], join?: SimRiver['join']) => {
    cur.to = to;
    if (join) cur.join = join;
    if (cur.points.length >= 2) rivers.push(cur);
  };
  // the cells the water has run through: it never flows back over its own course
  const passed = new Set<number>();
  const add = (k: number, at: Vec2 = centre(k)) => {
    cur.points.push(at);
    cur.flow.push(Q);
    passed.add(k);
  };
  // the water's position, between cell centres where it follows the slope
  let pos: Vec2;
  const geo = model.geo;
  const sample = (x: number, y: number) => model.heightAt(geo.wrapX(x), Math.min(H - 0.5, Math.max(0.5, y)));

  // the unseen roughness of flat ground (see MICRO_SLOPE): heights the water goes by, never shown
  const rough = new Simplex3(subSeed(p.seed ?? 0, 0x5eed));
  // (a few metres at most: on a coarse map a gentle slope over many cells would make it as tall
  // as real hills, and the water would cross real lakes as if they were its own dips)
  const roughM = Math.min(MICRO_HEIGHT, (MICRO_SLOPE * MICRO_CELLS * cellKm * 1000) / 4);
  const roughAt = (x: number, y: number) => {
    if (geo.flat) return rough.fbm(x / MICRO_CELLS, y / MICRO_CELLS, 0.5, 1, 4);
    // on a planet, on the sphere: no seam, no stretching towards the poles
    const lon = (x / W) * 2 * Math.PI;
    const lat = (0.5 - y / H) * Math.PI;
    return rough.fbm(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat), W / (2 * Math.PI * MICRO_CELLS), 4);
  };
  /** How flat the map's ground is at a point: 1 where the roughness leads, 0 where its slope does. */
  const flatness = (x: number, y: number) => {
    const kx = Math.max(1e-6, Math.abs(geo.kmPerCellX(y))) * 1000;
    const sx = (sample(x + 1, y) - sample(x - 1, y)) / (2 * kx);
    const sy = (sample(x, y + 1) - sample(x, y - 1)) / (2 * cellKm * 1000);
    return 1 - smoothstep(MICRO_SLOPE, 4 * MICRO_SLOPE, Math.hypot(sx, sy));
  };
  /** The height water goes by at a point. */
  const routeAt = (x: number, y: number) => {
    const f = flatness(x, y);
    return sample(x, y) + (f > 0 ? roughM * f * roughAt(x, y) : 0);
  };
  const routed = new Map<number, number>();
  /** The height water goes by in a cell. */
  const r = (k: number): number => {
    let v = routed.get(k);
    if (v === undefined) {
      const x = (k % W) + 0.5;
      const y = ((k / W) | 0) + 0.5;
      const f = flatness(x, y);
      v = h(k) + (f > 0 ? roughM * f * roughAt(x, y) : 0);
      routed.set(k, v);
    }
    return v;
  };
  /**
   * A step of about a cell down the slope of the land, in whatever direction it falls (not only
   * the eight from cell to cell, which would draw rivers as straight runs at 45°). Null where
   * that does not lead to a lower cell: then the water steps from cell to cell.
   */
  const alongSlope = (k: number): { at: Vec2; k: number } | null => {
    const [x, y] = pos;
    const kx = Math.max(1e-6, Math.abs(geo.kmPerCellX(y)));
    const gx = (routeAt(x + 0.5, y) - routeAt(x - 0.5, y)) / kx;
    const gy = (routeAt(x, y + 0.5) - routeAt(x, y - 0.5)) / cellKm;
    // downhill, in cells
    let dx = -gx / kx;
    let dy = -gy / cellKm;
    const l = Math.hypot(dx, dy);
    if (l < 1e-12) return null;
    dx /= l;
    dy /= l;
    for (let m = 1; m <= 3; m++) {
      const at: Vec2 = [x + dx * m * 0.7, y + dy * m * 0.7];
      if (at[1] < 0 || at[1] >= H) return null;
      const n = Math.floor(at[1]) * W + ((Math.floor(at[0]) % W) + W) % W;
      if (n === k) continue;
      if (!wrap && (at[0] < 0 || at[0] >= W)) return null;
      return r(n) < r(k) && !passed.has(n) ? { at: [((at[0] % W) + W) % W, at[1]], k: n } : null;
    }
    return null;
  };
  const nb: number[] = [];
  let c = Math.floor(p.at[1]) * W + ((Math.floor(p.at[0]) % W) + W) % W;
  pos = centre(c);
  /**
   * What happens to the water in a cell on its way: some goes into the ground and to the air.
   * True when it has all gone.
   */
  const onTheWay = (k: number): boolean => {
    if (p.seepage > 0) Q *= Math.pow(1 - Math.min(0.99, p.seepage), cellKm / 100);
    // into its bed and to the air above it, the more the wider it is (about 4.5·√Q m), and in a
    // marsh the water spreads out and loses as much again many times over
    const wideKm = ((4.5 * Math.sqrt(Math.max(0, Q))) / 1000) * (p.marsh?.(k) ? MARSH_SPREAD : 1);
    Q -= (seep + evap) * wideKm * cellKm;
    return Q <= DRY;
  };
  /** Go on from a cell (its centre). */
  const goTo = (k: number) => {
    c = k;
    pos = centre(k);
  };
  let end: SimEnd = 'pit';
  // Every hollow the water has been through, and how things stood when it got there: a hollow
  // filling further down may rise to the rim of one above and join it (two lakes become one at
  // the level of the saddle between them), and what happened in between is undone.
  const hollows: { rivers: number; cur: SimRiver; points: number; lakes: number; Q: number }[] = [];
  const hollowOf = new Map<number, number>();
  let merges = 0;
  let partial = false;
  const late = () => p.deadline !== undefined && performance.now() > p.deadline;
  for (let step = 0; step < MAX_STEPS; step++) {
    if ((step & 31) === 0 && late()) {
      partial = true;
      finish('land');
      break;
    }
    add(c, pos);
    const g = h(c);
    if (g < sea) {
      end = 'sea';
      finish('water');
      break;
    }
    const lv = model.lake.get(c % W, (c / W) | 0);
    if (isLake(lv) && g < lv && !ours.has(c) && !p.notLake?.has(c)) {
      end = 'lake';
      finish('water');
      break;
    }
    const joined = step > 2 && joinRiver ? joinRiver(centre(c)) : null;
    if (joined) {
      end = 'river';
      finish('river', joined);
      break;
    }
    if (isEdge(c)) {
      end = 'edge';
      finish('land');
      break;
    }
    if (onTheWay(c)) {
      end = p.marsh?.(c) ? 'marsh' : 'dry';
      finish('land');
      break;
    }
    // downhill: along the slope, or else the steepest way down from cell to cell
    const slope = alongSlope(c);
    if (slope) {
      c = slope.k;
      pos = slope.at;
      continue;
    }
    neighbours(c, nb);
    let best = -1;
    let bestSlope = 0;
    for (const n of nb) {
      const dist = (n % W) !== (c % W) && ((n / W) | 0) !== ((c / W) | 0) ? Math.SQRT2 : 1;
      const s = (r(c) - r(n)) / dist;
      if (s > bestSlope && !passed.has(n)) {
        bestSlope = s;
        best = n;
      }
    }
    if (best >= 0) {
      goTo(best);
      continue;
    }
    // a dip shallower than the carving depth: the river cuts through its rim to lower ground
    const way = breach(c);
    if (way) {
      let dried = false;
      for (const k of way.slice(0, -1)) {
        add(k);
        if ((dried = onTheWay(k))) break;
      }
      if (dried) {
        end = p.marsh?.(cur.points.length ? cellOf(cur.points[cur.points.length - 1]) : c) ? 'marsh' : 'dry';
        finish('land');
        break;
      }
      goTo(way[way.length - 1]);
      continue;
    }
    // a hollow: the water rises in it until it spills or evaporates as fast as it flows in
    hollows.push({ rivers: rivers.length, cur, points: cur.points.length, lakes: lakes.length, Q });
    const basin = fillHollow(c);
    if (basin && basin.joined >= 0) {
      if (++merges > MAX_MERGES) break;
      // it rose into hollows the water came through before: one lake now, filled from there
      const was = hollows[basin.joined];
      rivers.length = was.rivers;
      cur = was.cur;
      // (cut back to where it was then; it may have been cut shorter since, at a lake's shore)
      cur.points.length = Math.min(cur.points.length, was.points);
      cur.flow.length = cur.points.length;
      lakes.length = was.lakes;
      Q = was.Q;
      hollows.length = basin.joined + 1;
      hollows[basin.joined] = { ...was };
      // the hollows after it are undone: their cells belong to none (the new one takes its own)
      for (const [k, i] of hollowOf) if (i > basin.joined) hollowOf.delete(k);
    }
    if (basin) for (const k of basin.cells) hollowOf.set(k, hollows.length - 1);
    if (!basin) {
      end = 'pit';
      if (late()) partial = true;
      finish('land');
      break;
    }
    const depth = basin.level - g;
    if (basin.closed && !basin.cells.length) {
      // a flat with nowhere to go: the water spreads out and soaks away
      end = 'dry';
      finish('land');
      break;
    }
    const lake = basin.closed || !(depth < p.carve || basin.cells.length < MIN_LAKE);
    // A lake: the river ends where it meets the water, at the shore (its mouth opens there, not
    // somewhere out in the lake, or on through a small one to the far bank)
    let entry = c;
    if (lake) {
      const inLake = new Set(basin.cells);
      for (let i = 0; i < cur.points.length; i++) {
        const [x, y] = cur.points[i];
        const k = Math.floor(y) * W + ((Math.floor(x) % W) + W) % W;
        if (!inLake.has(k)) continue;
        cur.points.length = i + 1;
        cur.flow.length = i + 1;
        entry = k;
        break;
      }
    }
    if (basin.closed) {
      lakes.push({ cells: basin.cells, level: basin.level, kind: 'closed' });
      for (const k of basin.cells) ours.add(k);
      end = 'closed-lake';
      finish('water');
      break;
    }
    if (!lake) {
      // a shallow dip or a flat: the river finds its way across
      for (const k of basin.path) add(k);
      goTo(basin.out);
      continue;
    }
    lakes.push({ cells: basin.cells, level: basin.level, kind: 'open' });
    for (const k of basin.cells) ours.add(k);
    Q -= lakeLoss * basin.km2;
    finish('water');
    cur = { points: [], flow: [], to: 'land', fromLake: true };
    // The river goes on from where the water came in, across the lake along its lowest ground
    // to the spill point: under deep water it is not seen, and where the lake is too shallow to
    // show (a lake of two hollows joined over a low saddle) the water still runs on unbroken.
    for (const k of across(basin.region, entry, basin.rim)) add(k);
    goTo(basin.out);
  }
  return partial ? { rivers, lakes, end, partial } : { rivers, lakes, end };

  /**
   * Fill the hollow whose bottom is `pit`: cells join lowest first, the water level rising with
   * them. Closed when the lake's evaporation reaches the inflow before it spills; otherwise it
   * spills at the rim's lowest point, into `out`. `path` runs from the pit to `out` across the
   * hollow (for a river passing through a shallow dip), `exit` from the shore to `out`.
   */
  function fillHollow(pit: number): { cells: number[]; level: number; km2: number; closed: boolean; out: number; path: number[]; region: number[]; rim: number; joined: number } | null {
    const heap = new Heap();
    // the earliest hollow (of those the water came through) this one rises into, or -1
    let joined = -1;
    const parent = new Map<number, number>([[pit, -1]]);
    const popped: number[] = [];
    heap.push(pit, h(pit));
    let level = h(pit);
    let km2 = 0;
    const local: number[] = [];
    while (heap.size) {
      const [k, z] = heap.pop();
      if (z > level) {
        // the water rises to this cell: does the lake now lose all that flows in?
        if (lakeLoss * km2 >= Q) {
          // a closed lake, however small (a lake of a cell or two on a coarse map is still
          // hundreds of km²); none at all on a flat. Its water stands above the cells it covers,
          // short of the next one it would reach.
          const top = level + 0.5 * (z - level);
          const cells = popped.filter((x) => h(x) < top);
          return { cells, level: top, km2, closed: true, out: -1, path: [], region: popped, rim: -1, joined };
        }
        level = z;
      }
      popped.push(k);
      km2 += area(k);
      if (popped.length > MAX_BASIN || ((popped.length & 1023) === 0 && late())) return null;
      neighbours(k, local);
      for (const n of local) {
        if (parent.has(n)) continue;
        parent.set(n, k);
        const hn = h(n);
        const before = hollowOf.get(n);
        if (before !== undefined && before < hollows.length - 1) {
          // a hollow the water came through before: it is part of this one now
          joined = joined < 0 ? before : Math.min(joined, before);
          heap.push(n, hn);
          continue;
        }
        if (((hn < level && !passed.has(n)) || hn < sea || isEdge(n))) {
          // the way out: lower land (or the sea) beyond the rim (not back the way the water came)
          const cells = popped.filter((x) => h(x) < level);
          const path = across(popped, pit, k);
          return { cells, level, km2: cells.reduce((s, x) => s + area(x), 0), closed: false, out: n, path: path.slice(1), region: popped, rim: k, joined };
        }
        heap.push(n, hn);
      }
    }
    return null;
  }

  /**
   * The way out of a dip whose rim is less than the carving depth above its bottom: across it to
   * the first ground clearly lower than the bottom (so each step leads lower, and the water never
   * goes back and forth between dips; on a flat, roughness of a few centimetres does not lead it
   * astray from pit to pit, it crosses to where the land falls away), or null for a deeper hollow.
   */
  function breach(pit: number): number[] | null {
    const base = r(pit);
    // the roughness of flat ground makes dips of its own, which the water always crosses
    const limit = p.carve + 2 * roughM * (1 - smoothstep(0, 1, 1 - flatness((pit % W) + 0.5, ((pit / W) | 0) + 0.5)));
    // (and no more than half the roughness of flat ground: its dips are crossed in a short step,
    // and the slope of the land around still leads the water)
    const tol = Math.max(1e-3, Math.min(FLAT_TOLERANCE, p.carve / 2, roughM / 2));
    const lower = base - tol;
    // lowest first, by bands of the tolerance; within a band, nearest first (so on a flat the
    // water makes for the nearest edge where the land falls away)
    const steps = new Map<number, number>([[pit, 0]]);
    const key = (n: number, d: number) => Math.floor(Math.max(0, r(n) - base) / tol) * 1e7 + d;
    const heap = new Heap();
    const region: number[] = [];
    const local: number[] = [];
    heap.push(pit, 0);
    while (heap.size) {
      const [k] = heap.pop();
      if (r(k) - base >= limit) return null;
      region.push(k);
      if (region.length > MAX_BASIN || ((region.length & 1023) === 0 && late())) return null;
      neighbours(k, local);
      for (const n of local) {
        if (steps.has(n)) continue;
        const d = steps.get(k)! + 1;
        steps.set(n, d);
        const hn = r(n);
        // not back into a hollow the water came through (it would only come back out the same way)
        if ((hn < lower && !hollowOf.has(n) && !passed.has(n)) || h(n) < sea || isEdge(n)) return [...across(region, pit, k).slice(1), n];
        heap.push(n, key(n, d));
      }
    }
    return null;
  }

  /**
   * The way across a hollow from `from` to `to` through its cells: short, and along the lowest
   * ground in it (on a flat, the faint channels of its roughness), not the order the water filled
   * it in, which winds back and forth over all of it, nor a ruler-straight line.
   */
  function across(region: number[], from: number, to: number): number[] {
    const inside = new Set(region);
    const base = r(from);
    const scale = Math.max(0.05, roughM);
    const cost = new Map<number, number>([[from, 0]]);
    const prev = new Map<number, number>([[from, -1]]);
    const done = new Set<number>();
    const heap = new Heap();
    const local: number[] = [];
    heap.push(from, 0);
    while (heap.size) {
      const [k, ck] = heap.pop();
      if (done.has(k)) continue;
      done.add(k);
      if (k === to) break;
      neighbours(k, local);
      for (const n of local) {
        if (!inside.has(n) || done.has(n)) continue;
        const diag = n % W !== k % W && ((n / W) | 0) !== ((k / W) | 0);
        const cn = ck + (diag ? Math.SQRT2 : 1) * (1 + Math.max(0, r(n) - base) / scale);
        if (cn < (cost.get(n) ?? Infinity)) {
          cost.set(n, cn);
          prev.set(n, k);
          heap.push(n, cn);
        }
      }
    }
    const path: number[] = [];
    for (let q = prev.has(to) ? to : from; q >= 0; q = prev.get(q)!) path.push(q);
    return path.reverse();
  }
}

/**
 * Net evaporation at a latitude, mm a year: what open water loses to the air less the rain on it.
 * Below zero where it rains more than evaporates (the wet tropics, the cool middle latitudes):
 * there lakes overflow and rivers do not dry up. Most in the dry belts around 25°.
 */
export function aridityAt(latDeg: number): number {
  const a = Math.abs(latDeg);
  const table: [number, number][] = [
    [0, -800],
    [10, -300],
    [18, 600],
    [27, 1700],
    [35, 900],
    [45, 100],
    [55, -100],
    [70, -50],
    [90, 0],
  ];
  for (let i = 1; i < table.length; i++)
    if (a <= table[i][0]) {
      const [x0, y0] = table[i - 1];
      const [x1, y1] = table[i];
      const f = (a - x0) / (x1 - x0);
      return y0 + (y1 - y0) * f * f * (3 - 2 * f);
    }
  return 0;
}

/**
 * The latitude whose climate a row of the map has, degrees. A planet's own latitude; a flat map
 * spans a band of latitudes as tall as it is on the ground (111 km a degree, at most 60°),
 * centred on the latitude chosen for its middle.
 */
export function climateLatAt(planet: Pick<PlanetSettings, 'climateLatDeg'>, geo: Geo, y: number): number {
  if (!geo.flat) return geo.lat(y);
  const span = Math.min(60, Math.max(2, (geo.H * geo.cellKm) / 111.2));
  return Math.max(-90, Math.min(90, (planet.climateLatDeg ?? 45) + (0.5 - y / geo.H) * span));
}
