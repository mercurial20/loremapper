import type { Geo } from '../core/geo';
import type { PlanetSettings } from '../core/planet';
import type { Vec2 } from '../model/types';
import { isLake, type TerrainModel } from './TerrainModel';

/*
 * Where water from a source goes. The water runs down the land; in a hollow it rises until
 * either it spills over the lowest point of the rim (an open lake, and the river goes on with
 * what is left) or the lake has grown so wide that it loses to evaporation all that flows in
 * (a closed, salt lake: the river ends). On long flat stretches it spreads into marsh and loses
 * water as it goes, and may vanish there (as the Okavango does) or, with enough water, cross
 * the marsh and go on (as the Nile crosses the Sudd). It ends in the sea, a lake, another river,
 * or at the map's edge.
 *
 * Everything is decided by two numbers: how much water the source gives (m³/s) and how much
 * the climate takes back (net evaporation, mm a year).
 */

export interface SourceParams {
  /** Where the water comes out, world cells. */
  at: Vec2;
  /** Discharge, m³/s. */
  q: number;
  /** Net evaporation (evaporation minus rain on water), mm a year. */
  aridity: number;
  /** Water lost into the ground, fraction per 100 km of river. */
  seepage: number;
  /** Hollows shallower than this (m) are passed through instead of filling with a lake. */
  carve: number;
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

export interface SimMarsh {
  x: number;
  y: number;
  /** Radius, cells. */
  r: number;
}

export interface SimResult {
  rivers: SimRiver[];
  lakes: SimLake[];
  marshes: SimMarsh[];
  end: SimEnd;
}

/** m³/s lost per km² of water surface, per mm a year of net evaporation. */
export const EVAPORATION = 1e-3 / 31.557e6 * 1e6;
/** Below this discharge (m³/s) a river has run dry. */
const DRY = 0.05;
/** Hollows smaller than this many cells never hold a lake (the water passes on). */
const MIN_LAKE = 6;
/** The largest hollow followed, cells. */
const MAX_BASIN = 400_000;
/** Longest course followed, steps (cells). */
const MAX_STEPS = 40_000;
/** A stretch this long (steps) falling less than FLAT_SLOPE (m/m) is flat ground. */
const FLAT_STEPS = 20;
const FLAT_SLOPE = 5e-5;

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
  // a stretch of FLAT_STEPS cells is flat when it falls less than this (m)
  const flatDrop = FLAT_SLOPE * FLAT_STEPS * cellKm * 1000;
  const flat = (g: number) => recent.length === FLAT_STEPS && recent[0] - g < flatDrop;
  const area = (k: number) => model.geo.cellAreaKm2((k / W) | 0);
  const evap = Math.max(0, p.aridity) * EVAPORATION;
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

  const rivers: SimRiver[] = [];
  const lakes: SimLake[] = [];
  const marshes: SimMarsh[] = [];
  const ours = new Set<number>();
  let Q = Math.max(0, p.q);
  let cur: SimRiver = { points: [], flow: [], to: 'land', fromLake: false };
  const finish = (to: SimRiver['to'], join?: SimRiver['join']) => {
    cur.to = to;
    if (join) cur.join = join;
    if (cur.points.length >= 2) rivers.push(cur);
  };
  const add = (k: number) => {
    cur.points.push(centre(k));
    cur.flow.push(Q);
  };
  const nb: number[] = [];
  let c = Math.floor(p.at[1]) * W + ((Math.floor(p.at[0]) % W) + W) % W;
  const recent: number[] = [];
  let lastMarsh = -1e9;
  let end: SimEnd = 'pit';
  // Every hollow the water has been through, and how things stood when it got there: a hollow
  // filling further down may rise to the rim of one above and join it (two lakes become one at
  // the level of the saddle between them), and what happened in between is undone.
  const hollows: { rivers: number; cur: SimRiver; points: number; lakes: number; marshes: number; Q: number }[] = [];
  const hollowOf = new Map<number, number>();
  for (let step = 0; step < MAX_STEPS; step++) {
    add(c);
    const g = h(c);
    if (g < sea) {
      end = 'sea';
      finish('water');
      break;
    }
    const lv = model.lake.get(c % W, (c / W) | 0);
    if (isLake(lv) && g < lv && !ours.has(c)) {
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
    // water lost into the ground on the way
    if (p.seepage > 0) Q *= Math.pow(1 - Math.min(0.99, p.seepage), cellKm / 100);
    // flat ground: the river spreads into marsh and loses water to the air
    recent.push(g);
    if (recent.length > FLAT_STEPS) recent.shift();
    if (evap > 0 && flat(g)) {
      // the marsh is the wider the more water spreads into it (the Okavango's, of some
      // 300 m³/s, is about 50 km across; the Sudd's, of 1,000, about 100 km)
      const wideKm = 3 * Math.sqrt(Q);
      const r = Math.max(1, (0.5 * wideKm) / cellKm);
      Q -= evap * wideKm * Math.sqrt(area(c));
      // discs along the way, close enough to read as one marsh
      if (step - lastMarsh >= Math.max(1, Math.min(12, r * 0.7))) {
        marshes.push({ x: (c % W) + 0.5, y: ((c / W) | 0) + 0.5, r });
        lastMarsh = step;
      }
    }
    if (Q <= DRY) {
      end = flat(g) ? 'marsh' : 'dry';
      finish('land');
      break;
    }
    // downhill: the steepest way down
    neighbours(c, nb);
    let best = -1;
    let bestSlope = 0;
    for (const n of nb) {
      const dist = (n % W) !== (c % W) && ((n / W) | 0) !== ((c / W) | 0) ? Math.SQRT2 : 1;
      const s = (g - h(n)) / dist;
      if (s > bestSlope) {
        bestSlope = s;
        best = n;
      }
    }
    if (best >= 0) {
      c = best;
      continue;
    }
    // a hollow: the water rises in it until it spills or evaporates as fast as it flows in
    hollows.push({ rivers: rivers.length, cur, points: cur.points.length, lakes: lakes.length, marshes: marshes.length, Q });
    const basin = fillHollow(c);
    if (basin && basin.joined >= 0) {
      // it rose into hollows the water came through before: one lake now, filled from there
      const was = hollows[basin.joined];
      rivers.length = was.rivers;
      cur = was.cur;
      cur.points.length = was.points;
      cur.flow.length = was.points;
      lakes.length = was.lakes;
      marshes.length = was.marshes;
      Q = was.Q;
      hollows.length = basin.joined + 1;
      hollows[basin.joined] = { ...was };
    }
    if (basin) for (const k of basin.cells) hollowOf.set(k, hollows.length - 1);
    if (!basin) {
      end = 'pit';
      finish('land');
      break;
    }
    const depth = basin.level - g;
    if (basin.closed && !basin.cells.length) {
      // a flat with nowhere to go: the water spreads and the air takes it
      const r = Math.max(1, Math.sqrt(basin.km2 / Math.PI) / cellKm);
      marshes.push({ x: (c % W) + 0.5, y: ((c / W) | 0) + 0.5, r });
      end = 'marsh';
      finish('land');
      break;
    }
    if (basin.closed) {
      lakes.push({ cells: basin.cells, level: basin.level, kind: 'closed' });
      for (const k of basin.cells) ours.add(k);
      end = 'closed-lake';
      finish('water');
      break;
    }
    if (depth < p.carve || basin.cells.length < MIN_LAKE) {
      // a shallow dip or a flat: the river finds its way across
      for (const k of basin.path) add(k);
      c = basin.out;
      continue;
    }
    lakes.push({ cells: basin.cells, level: basin.level, kind: 'open' });
    for (const k of basin.cells) ours.add(k);
    Q -= evap * basin.km2;
    finish('water');
    cur = { points: [], flow: [], to: 'land', fromLake: true };
    // the river goes on from the spill point
    for (const k of basin.exit) add(k);
    c = basin.out;
  }
  return { rivers, lakes, marshes, end };

  /**
   * Fill the hollow whose bottom is `pit`: cells join lowest first, the water level rising with
   * them. Closed when the lake's evaporation reaches the inflow before it spills; otherwise it
   * spills at the rim's lowest point, into `out`. `path` runs from the pit to `out` across the
   * hollow (for a river passing through a shallow dip), `exit` from the shore to `out`.
   */
  function fillHollow(pit: number): { cells: number[]; level: number; km2: number; closed: boolean; out: number; path: number[]; exit: number[]; joined: number } | null {
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
        // the water rises to this cell: does it now evaporate all that flows in?
        if (evap > 0 && evap * km2 >= Q) {
          // a closed lake, however small (a lake of a cell or two on a coarse map is still
          // hundreds of km²); none at all on a flat. Its water stands above the cells it covers,
          // short of the next one it would reach.
          const top = level + 0.5 * (z - level);
          const cells = popped.filter((x) => h(x) < top);
          return { cells, level: top, km2, closed: true, out: -1, path: [], exit: [], joined };
        }
        level = z;
      }
      popped.push(k);
      km2 += area(k);
      if (popped.length > MAX_BASIN) return null;
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
        if (hn < level || hn < sea || isEdge(n)) {
          // the way out: lower land (or the sea) beyond the rim
          const cells = popped.filter((x) => h(x) < level);
          const path: number[] = [];
          for (let q = k; q >= 0; q = parent.get(q)!) path.push(q);
          path.reverse();
          const exit: number[] = [];
          for (const q of path) if (h(q) >= level) exit.push(q);
          exit.push(n);
          return { cells, level, km2: cells.reduce((s, x) => s + area(x), 0), closed: false, out: n, path: path.slice(1), exit, joined };
        }
        heap.push(n, hn);
      }
    }
    return null;
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
