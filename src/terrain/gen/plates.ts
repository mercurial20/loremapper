import { mulberry32 } from '../../core/math';
import { Simplex3, subSeed } from '../../core/noise3';
import { blurKm, cellAreaKm2, components, distanceField, sphereTables, thresholdForFraction, type Grid } from './grid';

/** How continental crust is arranged on the planet. */
export type Layout = 'continents' | 'pangaea' | 'archipelago' | 'twoWorlds' | 'innerSea' | 'polar' | 'shattered' | 'mainland';

interface Plate {
  s: [number, number, number];
  weight: number;
  continental: boolean;
  /** rotation axis × angular speed: velocity at p is axis × p */
  axis: [number, number, number];
  area: number;
  neighbors: Set<number>;
}

export interface Hotspot {
  /** unit-sphere centre */
  p: [number, number, number];
  radiusKm: number;
  strength: number;
}

export interface Tectonics {
  /** 0..1 continental crust (smoothed) */
  crust: Float32Array;
  /** 0..1 young mountain belts at convergent boundaries */
  orogen: Float32Array;
  /** 0..1 volcanic island arcs over ocean–ocean subduction */
  arc: Float32Array;
  /** 0..1 deep-sea trenches */
  trench: Float32Array;
  /** 0..1 mid-ocean ridges */
  ridge: Float32Array;
  /** 0..1 continental rifts */
  rift: Float32Array;
  /** 0..1 old, worn-down mountain belts inside continents */
  old: Float32Array;
  /** land potential on this grid; land = landness above a share-preserving threshold */
  landness: Float32Array;
  hotspots: Hotspot[];
}

const PLATES: Record<Layout, number> = { continents: 16, pangaea: 14, archipelago: 20, twoWorlds: 16, innerSea: 14, polar: 16, shattered: 18, mainland: 16 };
const HOTSPOTS: Record<Layout, number> = { continents: 6, pangaea: 6, archipelago: 26, twoWorlds: 6, innerSea: 5, polar: 6, shattered: 6, mainland: 16 };

type V3 = [number, number, number];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const randomUnit = (rnd: () => number): V3 => {
  const z = rnd() * 2 - 1;
  const t = rnd() * Math.PI * 2;
  const r = Math.sqrt(1 - z * z);
  return [r * Math.cos(t), r * Math.sin(t), z];
};
const gauss = (x: number, w: number) => Math.exp(-(x / w) * (x / w));

/** Domain-warped unit vectors for every cell, so plate borders come out ragged instead of straight. */
function warpedPoints(g: Grid, warp: Simplex3, amp: number): Float32Array {
  const T = sphereTables(g);
  const q = new Float32Array(g.w * g.h * 3);
  for (let j = 0; j < g.h; j++)
    for (let i = 0; i < g.w; i++) {
      const x = T.cosLat[j] * T.cosLon[i];
      const y = T.cosLat[j] * T.sinLon[i];
      const z = T.sinLat[j];
      const v = norm([x + amp * warp.fbm(x, y, z, 1.7, 3), y + amp * warp.fbm(x + 5.1, y, z, 1.7, 3), z + amp * warp.fbm(x, y - 7.3, z, 1.7, 3)]);
      const o = (j * g.w + i) * 3;
      q.set(v, o);
    }
  return q;
}

/** Assign every cell to the nearest seed; larger weights claim larger plates. */
function partition(q: Float32Array, seeds: V3[], weights: number[]): Int32Array {
  const out = new Int32Array(q.length / 3);
  for (let k = 0; k < out.length; k++) {
    let best = 0;
    let bestD = Infinity;
    for (let p = 0; p < seeds.length; p++) {
      // (1 − cos θ) grows like θ², so dividing by weight² compares θ / weight
      const d = (1 - (q[k * 3] * seeds[p][0] + q[k * 3 + 1] * seeds[p][1] + q[k * 3 + 2] * seeds[p][2])) / (weights[p] * weights[p]);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    out[k] = best;
  }
  return out;
}

/** Everything about a world that doesn't depend on the plate layout (shared by retries). */
export interface PlateBase {
  q: Float32Array;
  paleoDist: Float32Array;
  shapeNoise: Float32Array;
}

export function plateBase(g: Grid, seed: number): PlateBase {
  const N = g.w * g.h;
  const q = warpedPoints(g, new Simplex3(subSeed(seed, 2)), 0.28);
  // old orogens: boundaries of an earlier plate configuration
  const prnd = mulberry32(subSeed(seed, 4));
  const pseeds: V3[] = [];
  for (let p = 0; p < 9; p++) pseeds.push(randomUnit(prnd));
  const paleo = partition(warpedPoints(g, new Simplex3(subSeed(seed, 5)), 0.35), pseeds, pseeds.map(() => 1));
  const pB = new Uint8Array(N);
  for (let j = 0; j < g.h; j++)
    for (let i = 0; i < g.w; i++) {
      const k = j * g.w + i;
      if (paleo[j * g.w + ((i + 1) % g.w)] !== paleo[k] || (j + 1 < g.h && paleo[k + g.w] !== paleo[k])) pB[k] = 1;
    }
  const paleoDist = distanceField(g, pB).dist;
  // ragged, domain-warped noise for coastlines
  const shape = new Simplex3(subSeed(seed, 6));
  const T = sphereTables(g);
  const shapeNoise = new Float32Array(N);
  for (let j = 0; j < g.h; j++)
    for (let i = 0; i < g.w; i++) {
      const x = T.cosLat[j] * T.cosLon[i];
      const y = T.cosLat[j] * T.sinLon[i];
      const z = T.sinLat[j];
      const wx = shape.fbm(x + 3.1, y, z, 1.3, 3) * 0.35;
      const wy = shape.fbm(x, y + 8.2, z, 1.3, 3) * 0.35;
      const wz = shape.fbm(x, y, z - 4.4, 1.3, 3) * 0.35;
      shapeNoise[j * g.w + i] = shape.fbm(x + wx, y + wy, z + wz, 1.9, 4);
    }
  return { q, paleoDist, shapeNoise };
}

/** Choose which plates carry continental crust for a layout. */
function chooseContinents(layout: Layout, plates: Plate[], target: number, rnd: () => number) {
  const n = plates.length;
  const order = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const cont = new Set<number>();
  let total = 0;
  const add = (p: number) => {
    if (cont.has(p)) return;
    cont.add(p);
    total += plates[p].area;
  };
  const latOf = (p: number) => Math.asin(plates[p].s[2]);
  /** grow a connected cluster from `start` until it holds `goal` of the sphere */
  const grow = (start: number, goal: number, avoid?: Set<number>) => {
    const cluster = new Set([start]);
    add(start);
    let area = plates[start].area;
    const frontier = [...plates[start].neighbors];
    while (area < goal && frontier.length) {
      const k = Math.floor(rnd() * frontier.length);
      const p = frontier.splice(k, 1)[0];
      if (cluster.has(p) || cont.has(p) || (avoid && [...plates[p].neighbors].some((q) => avoid.has(q)))) continue;
      cluster.add(p);
      add(p);
      area += plates[p].area;
      for (const q of plates[p].neighbors) if (!cluster.has(q)) frontier.push(q);
    }
    return cluster;
  };
  /** spread separate continents that don't touch each other */
  const scatter = (goal: number, avoid: Set<number>) => {
    for (const p of order) {
      if (total >= goal) break;
      if (cont.has(p) || plates[p].area > target * 0.6) continue;
      if ([...plates[p].neighbors].some((q) => cont.has(q) || avoid.has(q))) continue;
      add(p);
    }
    // still short (few, large plates): grow the existing continents outwards
    for (const p of order) {
      if (total >= goal * 0.9) break;
      if (!cont.has(p) && [...plates[p].neighbors].some((q) => cont.has(q))) add(p);
    }
  };
  switch (layout) {
    case 'archipelago':
      break;
    case 'continents':
      scatter(target, new Set());
      break;
    case 'pangaea':
    case 'shattered': {
      const start = order.find((p) => Math.abs(latOf(p)) < 0.6) ?? order[0];
      grow(start, target);
      break;
    }
    case 'mainland': {
      const start = order.find((p) => Math.abs(latOf(p)) < 0.8) ?? order[0];
      grow(start, target * 0.85);
      break;
    }
    case 'twoWorlds': {
      const a = order[0];
      let b = a;
      for (let p = 0; p < n; p++) if (dot(plates[p].s, plates[a].s) < dot(plates[b].s, plates[a].s)) b = p;
      const A = grow(a, target / 2);
      grow(b, target / 2, A);
      break;
    }
    case 'innerSea': {
      const centre = order.find((p) => Math.abs(latOf(p)) < 0.7 && plates[p].area > 0.02 && plates[p].area < 0.07) ?? order[0];
      const ring = new Set<number>();
      for (const q of plates[centre].neighbors) {
        add(q);
        ring.add(q);
      }
      // widen the ring outwards if it is too thin for the land share
      for (const p of order) {
        if (total >= target) break;
        if (p !== centre && !cont.has(p) && [...plates[p].neighbors].some((q) => ring.has(q))) add(p);
      }
      cont.delete(centre);
      break;
    }
    case 'polar': {
      const north = rnd() < 0.5;
      let pole = 0;
      for (let p = 0; p < n; p++) if ((north ? 1 : -1) * plates[p].s[2] > (north ? 1 : -1) * plates[pole].s[2]) pole = p;
      const cap = grow(pole, target * 0.5);
      scatter(target, cap);
      break;
    }
  }
  for (const p of cont) plates[p].continental = true;
}

/**
 * Plate tectonics on a whole-world grid: plates, which of them carry
 * continents, how they move, and what forms where they meet.
 */
export function tectonics(g: Grid, seed: number, layout: Layout, landFraction: number, base: PlateBase, plateScale = 1): Tectonics {
  const rnd = mulberry32(subSeed(seed, 1));
  const nPlates = Math.round(PLATES[layout] * plateScale * 1.5);
  const seeds: V3[] = [];
  const weights: number[] = [];
  // plate areas follow a power law (Bird 2003): a few giant plates among many small ones.
  // Area grows as weight², so a Pareto-like weight gives a heavy-tailed size distribution.
  for (let p = 0; p < nPlates; p++) {
    seeds.push(randomUnit(rnd));
    weights.push(Math.min(2.2, 0.6 * Math.pow(1 - 0.94 * rnd(), -0.45)));
  }
  const plateOf = partition(base.q, seeds, weights);
  const N = g.w * g.h;

  // areas and neighbours
  const plates: Plate[] = seeds.map((s, k) => ({ s, weight: weights[k], continental: false, axis: [0, 0, 0], area: 0, neighbors: new Set() }));
  let total = 0;
  for (let j = 0; j < g.h; j++) {
    const a = cellAreaKm2(g, j);
    for (let i = 0; i < g.w; i++) {
      const k = j * g.w + i;
      const p = plateOf[k];
      plates[p].area += a;
      total += a;
      const r = plateOf[j * g.w + ((i + 1) % g.w)];
      const link = (a: number, b: number) => {
        plates[a].neighbors.add(b);
        plates[b].neighbors.add(a);
      };
      if (r !== p) link(p, r);
      if (j + 1 < g.h) {
        const d = plateOf[k + g.w];
        if (d !== p) link(p, d);
      }
    }
  }
  for (const p of plates) p.area /= total;

  // continental crust covers a little more than the land share; the coast is cut inside it
  const crustShare = layout === 'archipelago' ? 0 : Math.min(0.9, landFraction * 1.2);
  chooseContinents(layout, plates, crustShare, rnd);

  // motion: random Euler poles; shattered supercontinents fly apart from their centre
  let centre: V3 = [0, 0, 0];
  for (const p of plates) if (p.continental) centre = [centre[0] + p.s[0] * p.area, centre[1] + p.s[1] * p.area, centre[2] + p.s[2] * p.area];
  centre = norm(centre);
  for (const p of plates) {
    const w = 0.5 + rnd();
    if (layout === 'shattered' && p.continental) {
      const away = norm([p.s[0] - centre[0] * dot(p.s, centre), p.s[1] - centre[1] * dot(p.s, centre), p.s[2] - centre[2] * dot(p.s, centre)]);
      const ax = norm(cross(p.s, away));
      p.axis = [ax[0] * 1.3, ax[1] * 1.3, ax[2] * 1.3];
    } else {
      const ax = randomUnit(rnd);
      p.axis = [ax[0] * w, ax[1] * w, ax[2] * w];
    }
  }

  // boundaries: convergence = how fast the neighbour approaches along the boundary normal
  const T = sphereTables(g);
  const P = (k: number): V3 => {
    const j = (k / g.w) | 0;
    const i = k - j * g.w;
    return [T.cosLat[j] * T.cosLon[i], T.cosLat[j] * T.sinLon[i], T.sinLat[j]];
  };
  const isB = new Uint8Array(N);
  const bConv = new Float32Array(N);
  const bOther = new Int32Array(N);
  for (let j = 0; j < g.h; j++) {
    for (let i = 0; i < g.w; i++) {
      const k = j * g.w + i;
      const a = plateOf[k];
      let conv = 0;
      let cnt = 0;
      const nbs = [j * g.w + ((i + 1) % g.w), j * g.w + ((i - 1 + g.w) % g.w), j > 0 ? k - g.w : -1, j + 1 < g.h ? k + g.w : -1];
      for (const n of nbs) {
        if (n < 0 || plateOf[n] === a) continue;
        const b = plateOf[n];
        const p = P(k);
        const q = P(n);
        const nrm = norm([q[0] - p[0], q[1] - p[1], q[2] - p[2]]);
        const va = cross(plates[a].axis, p);
        const vb = cross(plates[b].axis, p);
        conv += -dot([vb[0] - va[0], vb[1] - va[1], vb[2] - va[2]], nrm);
        cnt++;
        bOther[k] = b;
      }
      if (cnt) {
        isB[k] = 1;
        bConv[k] = Math.max(-1, Math.min(1, conv / cnt / 1.2));
      }
    }
  }
  const { dist, near } = distanceField(g, isB);

  // crust: continental plates, smoothed into shelves
  const raw = new Float32Array(N);
  for (let k = 0; k < N; k++) raw[k] = plates[plateOf[k]].continental ? 1 : 0;
  const crust = blurKm(raw, g, 260);

  const orogen = new Float32Array(N);
  const arc = new Float32Array(N);
  const trench = new Float32Array(N);
  const ridge = new Float32Array(N);
  const rift = new Float32Array(N);
  const strike = new Simplex3(subSeed(seed, 3));
  for (let k = 0; k < N; k++) {
    const d = dist[k];
    if (d > 1400) continue;
    const c = bConv[near[k]];
    const own = plateOf[k];
    const other = bOther[near[k]];
    const ownC = plates[own].continental;
    const othC = plates[other].continental;
    if (c > 0.05) {
      if (ownC && othC) orogen[k] = Math.min(1, 1.6 * c * gauss(d, 430));
      else if (ownC) orogen[k] = Math.min(1, 1.6 * c * gauss(d - 210, 230));
      else if (othC) trench[k] = c * gauss(d - 50, 75);
      else if (own > other) arc[k] = c * gauss(d - 140, 95);
      else trench[k] = c * gauss(d - 40, 60);
    } else if (c < -0.05) {
      const e = -c;
      if (!ownC) ridge[k] = e * gauss(d, 330);
      else if (othC) rift[k] = e * gauss(d, layout === 'shattered' ? 230 : 150);
    }
  }
  // ranges rise and fall along their length
  for (let k = 0; k < N; k++) {
    if (orogen[k] <= 0 && arc[k] <= 0) continue;
    const [x, y, z] = P(k);
    const v = 0.62 + 0.38 * strike.fbm(x, y, z, 2.2, 3);
    orogen[k] *= v;
    arc[k] *= v;
  }

  // old orogens inside today's continents
  const old = new Float32Array(N);
  for (let k = 0; k < N; k++) old[k] = gauss(base.paleoDist[k], 170) * Math.min(1, Math.max(0, (crust[k] - 0.4) * 2.5));

  // land potential: crust with ragged edges, lifted by young ranges, split by rifts
  const landness = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    const n = base.shapeNoise[k];
    if (layout === 'archipelago') landness[k] = 0.3 * n + 0.5 * arc[k];
    else landness[k] = crust[k] + 0.34 * n + 0.32 * orogen[k] + 0.35 * arc[k] - 0.75 * rift[k] * crust[k];
  }

  // hotspot chains trail behind the plate that carries them
  const hotspots: Hotspot[] = [];
  const hrnd = mulberry32(subSeed(seed, 7));
  for (let h = 0; h < HOTSPOTS[layout]; h++) {
    const p0 = randomUnit(hrnd);
    const j = Math.min(g.h - 1, Math.max(0, Math.floor((0.5 - Math.asin(p0[2]) / Math.PI) * g.h)));
    const i = Math.floor((((Math.atan2(p0[1], p0[0]) / (2 * Math.PI)) % 1) + 1) % 1 * g.w) % g.w;
    const pl = plates[plateOf[j * g.w + i]];
    const v = cross(pl.axis, p0);
    const back = norm([-v[0], -v[1], -v[2]]);
    const n = 4 + Math.floor(hrnd() * 5);
    const step = (110 + hrnd() * 80) / g.R;
    const size = 0.75 + hrnd() * 0.5;
    for (let b = 0; b < n; b++) {
      const t = b * step;
      const p = norm([Math.cos(t) * p0[0] + Math.sin(t) * back[0], Math.cos(t) * p0[1] + Math.sin(t) * back[1], Math.cos(t) * p0[2] + Math.sin(t) * back[2]]);
      hotspots.push({ p, radiusKm: (55 + 45 * hrnd()) * size * (1 - b * 0.07), strength: (1 - b * 0.1) * (0.75 + 0.35 * hrnd()) });
    }
  }
  return { crust, orogen, arc, trench, ridge, rift, old, landness, hotspots };
}

/** How well a coarse land mask fits the requested layout: 0 = perfect, larger = worse. */
export function layoutMismatch(g: Grid, landness: Float32Array, landFraction: number, layout: Layout): number {
  const t = thresholdForFraction(landness, g, landFraction);
  const mask = new Uint8Array(landness.length);
  for (let k = 0; k < mask.length; k++) mask[k] = landness[k] > t ? 1 : 0;
  const c = components(g, mask);
  let land = 0;
  for (const a of c.area) land += a;
  const areas = [...c.area].sort((a, b) => b - a).map((a) => a / land);
  const big = areas.filter((a) => a >= 0.05).length;
  const largest = areas[0] ?? 0;
  const over = (v: number, max: number) => Math.max(0, v - max);
  const under = (v: number, min: number) => Math.max(0, min - v);
  switch (layout) {
    case 'continents':
      return under(big, 3) + over(big, 7) + over(largest, 0.5) * 4;
    case 'pangaea':
      return under(largest, 0.75) * 4;
    case 'mainland':
      return under(largest, 0.6) * 4;
    case 'twoWorlds':
      return under(big, 2) + over(big, 4) + under(areas[1] ?? 0, 0.22) * 4;
    case 'shattered':
      return under(big, 4) + over(largest, 0.45) * 4;
    case 'polar':
      return under(big, 2);
    case 'innerSea':
      return over(big, 3) * 0.5;
    case 'archipelago':
      return over(largest, 0.12) * 4;
  }
}
