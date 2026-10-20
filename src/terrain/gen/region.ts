import { clamp, mulberry32, smoothstep } from '../../core/math';
import { Simplex3, subSeed } from '../../core/noise3';
import { rangeRelief, type RangeJobRange } from '../rangeUplift';
import { upliftRelief } from '../upliftErosion';
import { distanceField, thresholdForFraction, type Grid } from './grid';

/*
 * A region's land at its true size (a flat map up to a few thousand km across): every form as
 * large as it is on Earth, whatever the size of the map. Across 500 km, Earth shows a part of one
 * or two plates: a mountain belt or two where plates collide (100–250 km wide, as the Caucasus or
 * the Alps), and around them plains, hills and plateaus, cut by rivers. So here:
 *
 * - 0–2 plate boundaries cross the region (more on bigger maps and with more mountains); where
 *   plates collide a belt rises, as a mountain range object carved by the same river erosion as a
 *   drawn one (its relief kept apart, so it can be reshaped);
 * - land and sea from fields as large as the region, with a fractal coast down to the cell;
 * - the rest of the land gently uplifted (plains), more so in zones of hills, foothills and
 *   plateaus, and carved by the same erosion: valleys and ridges come from water, not from noise;
 * - seas shallow near the coast, as continental shelves are (about a metre deeper every km).
 */

export interface RegionRange {
  /** Crest, world cells. */
  points: [number, number][];
  heightM: number;
  widthKm: number;
  asymmetry: number;
  seed: number;
}

export interface RegionalRelief {
  land: Uint8Array;
  /** Metres above sea level (negative at sea), on the grid. */
  h: Float32Array;
  /** The ranges' share of `h`. */
  rangeRelief: Float32Array;
  ranges: RegionRange[];
}

/**
 * How the land lies on the map: wholly inside it (sea all round the edges) as one or several
 * landmasses, or running on past its edges as part of a larger land (`part`).
 */
export type RegionLayout = 'part' | 'continents' | 'pangaea' | 'mainland' | 'archipelago' | 'innerSea' | 'shattered';

export interface RegionalOptions {
  seed: number;
  layout: RegionLayout;
  /** km per world cell. */
  cellKm: number;
  landFraction: number;
  mountains: number;
  roughness: number;
  maxElevation: number;
  /** Deepest sea floor, metres below sea level. */
  maxDepth: number;
  progress?: (stage: string, f: number) => void;
}

/** Over this many km from the coast a belt's mountains come down to the shore. */
const COAST_EASE_KM = 12;
/** Most cells the erosion of the land works on (it runs coarser on bigger grids). */
const EROSION_CELLS = 260_000;

export function regionalRelief(g: Grid, o: RegionalOptions): RegionalRelief {
  const { w, h } = g;
  const N = w * h;
  const kmCell = o.cellKm * g.step;
  const mapKm = Math.max(g.W, g.H) * o.cellKm;
  const rnd = mulberry32(subSeed(o.seed, 400));
  const noise = new Simplex3(subSeed(o.seed, 401));
  const n2 = (xKm: number, yKm: number, lambdaKm: number, octaves: number, z: number, gain = 0.5) => noise.fbm(xKm / lambdaKm, yKm / lambdaKm, z, 1, octaves, gain);
  const xKm = (i: number) => (g.x0 + (i + 0.5) * g.step) * o.cellKm;
  const yKm = (j: number) => (g.y0 + (j + 0.5) * g.step) * o.cellKm;
  const mountains = clamp(o.mountains, 0, 1);
  const rough = clamp(o.roughness, 0, 1);

  // ---- land and sea: fields as large as the region, a fractal coast down to the cell
  o.progress?.('Shaping coasts', 0);
  const landness = new Float32Array(N);
  const coastOct = Math.max(3, Math.round(Math.log2((0.18 * mapKm) / (2 * kmCell))));
  // the middle of the land, a little off the map's middle
  const cu = 0.5 + (rnd() - 0.5) * 0.16;
  const cv = 0.5 + (rnd() - 0.5) * 0.16;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const x = xKm(i);
      const y = yKm(j);
      const k = j * w + i;
      const coast = 0.32 * n2(x, y, 0.18 * mapKm, coastOct, 2.9, 0.6);
      // where on the map: u, v across it (0 … 1), r from its middle
      const u = x / (g.W * o.cellKm);
      const v = y / (g.H * o.cellKm);
      // (a landmass's outline wanders: bays and peninsulas hundreds of km across, not a disc)
      const wu = u + 0.12 * n2(x, y, 0.4 * mapKm, 3, 11.1);
      const wv = v + 0.12 * n2(x, y, 0.4 * mapKm, 3, 12.7);
      const r = Math.hypot(wu - cu, wv - cv) / 0.5;
      const edge = Math.min(u, 1 - u, v, 1 - v);
      const frame = 1 - smoothstep(0.02, 0.14, edge);
      let L: number;
      switch (o.layout) {
        case 'part':
          L = 0.65 * n2(x, y, 0.8 * mapKm, 2, 0.3) + 0.25 * n2(x, y, 0.35 * mapKm, 2, 1.7) + coast;
          break;
        case 'pangaea':
          // one landmass filling most of the map
          L = 1.1 * (1 - r * r) + 0.3 * n2(x, y, 0.45 * mapKm, 2, 1.7) + coast - 1.6 * frame;
          break;
        case 'mainland':
          // one large landmass and island chains around it
          L = 1.2 * (1 - Math.min(1.5, r / 0.65) ** 2) + 0.25 * n2(x, y, 0.4 * mapKm, 2, 1.7) + coast + 1.6 * smoothstep(0.7, 0.85, r) * smoothstep(0.15, 0.5, n2(x, y, 0.06 * mapKm, 3, 4.4)) - 1.6 * (1 - smoothstep(0.01, 0.06, edge));
          break;
        case 'archipelago':
          // many islands, none large
          L = 0.35 * n2(x, y, 0.5 * mapKm, 2, 0.3) + 0.6 * n2(x, y, 0.09 * mapKm, 4, 6.2, 0.55) + 0.5 * coast - 1.6 * frame;
          break;
        case 'innerSea':
          // lands all round a sea in the middle, running on past the edges
          L = 0.55 * smoothstep(0.35, 0.8, r) - 0.7 * (1 - smoothstep(0.15, 0.55, r)) + 0.3 * n2(x, y, 0.35 * mapKm, 2, 1.7) + coast;
          break;
        case 'shattered':
          // one land broken apart by narrow seas along rifts
          L = 1.0 * (1 - r * r) + 0.25 * n2(x, y, 0.45 * mapKm, 2, 1.7) + coast - 1.1 * (1 - smoothstep(0.02, 0.07, Math.abs(n2(x, y, 0.3 * mapKm, 2, 8.8)))) - 1.6 * frame;
          break;
        default:
          // several landmasses, all on the map
          L = 0.6 * n2(x, y, 0.55 * mapKm, 2, 0.3) + 0.2 * n2(x, y, 0.3 * mapKm, 2, 1.7) + coast - 1.4 * frame;
      }
      landness[k] = L;
    }
  const t = thresholdForFraction(landness, g, o.landFraction);
  const land = new Uint8Array(N);
  for (let k = 0; k < N; k++) land[k] = landness[k] > t ? 1 : 0;
  // ---- plate boundaries where plates collide: mountain belts
  o.progress?.('Moving tectonic plates', 0);
  const ranges: RegionRange[] = [];
  const expected = mountains < 0.05 ? 0 : (0.6 + 1.4 * mountains) * Math.sqrt(mapKm / 600);
  const count = Math.min(4, Math.floor(expected) + (rnd() < expected % 1 ? 1 : 0));
  // where the land is (belts rise where continents collide: across land, not along coasts)
  const landAt = (mx: number, my: number) => {
    const i = Math.floor((mx - g.x0) / g.step);
    const j = Math.floor((my - g.y0) / g.step);
    return i >= 0 && j >= 0 && i < w && j < h ? land[j * w + i] : 0;
  };
  for (let b = 0; b < count; b++) {
    // a line through the middle part of the map, bending gently over hundreds of km; of a few
    // tried, the one that runs most over land (and away from the belts already placed)
    let px = 0;
    let py = 0;
    let ang = 0;
    let best = -1;
    for (let tries = 0; tries < 16; tries++) {
      const cx = (0.15 + 0.7 * rnd()) * g.W * o.cellKm;
      const cy = (0.15 + 0.7 * rnd()) * g.H * o.cellKm;
      const ca = rnd() * Math.PI;
      let on = 0;
      let all = 0;
      for (let s2 = -mapKm; s2 <= mapKm; s2 += mapKm / 40) {
        const mx = (cx + Math.cos(ca) * s2) / o.cellKm;
        const my = (cy + Math.sin(ca) * s2) / o.cellKm;
        if (mx < 0 || my < 0 || mx >= g.W || my >= g.H) continue;
        all++;
        on += landAt(mx, my);
        for (const r of ranges) for (const [qx, qy] of r.points) if (Math.hypot(qx - mx, qy - my) * o.cellKm < r.widthKm) on -= 0.02;
      }
      const score = all ? on / all : -1;
      if (score > best) {
        best = score;
        px = cx;
        py = cy;
        ang = ca;
      }
    }
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    const width = Math.min(0.45 * mapKm, (60 + 160 * rnd()) * (0.8 + 0.4 * mountains));
    const bend = 0.08 * mapKm;
    const L = 1.6 * mapKm;
    const pts: [number, number][] = [];
    for (let s = -L; s <= L; s += Math.max(2 * o.cellKm, 4)) {
      const off = bend * noise.fbm(s / 350, b * 7.3, 3.1, 1, 3);
      const x = px + dx * s - dy * off;
      const y = py + dy * s + dx * off;
      // only the part over the map (and a belt's width around it)
      const mx = x / o.cellKm;
      const my = y / o.cellKm;
      const pad = width / o.cellKm;
      if (mx < -pad || my < -pad || mx > g.W + pad || my > g.H + pad) continue;
      pts.push([mx, my]);
    }
    if (pts.length < 2) continue;
    const peak = clamp((1600 + 5200 * Math.pow(mountains, 1.3)) * (0.7 + 0.45 * rnd()), 700, o.maxElevation * 0.95);
    ranges.push({ points: pts, heightM: Math.round(peak / 10) * 10, widthKm: Math.round(width), asymmetry: Math.round((rnd() * 1.2 - 0.6) * 100) / 100, seed: Math.floor(rnd() * 1e9) });
  }

  // distance (km) from every cell to the nearest crest, and that range's half width
  const crestD = new Float32Array(N).fill(1e9);
  const crestHalf = new Float32Array(N).fill(1);
  if (ranges.length) {
    const isCrest = new Uint8Array(N);
    const half = new Float32Array(N);
    for (const r of ranges)
      for (let q = 1; q < r.points.length; q++) {
        const [ax, ay] = r.points[q - 1];
        const [bx, by] = r.points[q];
        const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / g.step) + 1;
        for (let s = 0; s <= steps; s++) {
          const i = Math.floor((ax + ((bx - ax) * s) / steps - g.x0) / g.step);
          const j = Math.floor((ay + ((by - ay) * s) / steps - g.y0) / g.step);
          if (i < 0 || j < 0 || i >= w || j >= h) continue;
          isCrest[j * w + i] = 1;
          half[j * w + i] = r.widthKm / 2;
        }
      }
    const df = distanceField(g, isCrest);
    for (let k = 0; k < N; k++) {
      crestD[k] = df.dist[k];
      if (df.near[k] >= 0) crestHalf[k] = half[df.near[k]];
    }
  }
  // the belts (1 on the crest, 0 beyond them), and the foothills around them
  const belt = new Float32Array(N);
  const foot = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    const q = crestD[k] / crestHalf[k];
    belt[k] = 1 - smoothstep(0.55, 1.05, q);
    foot[k] = 1 - smoothstep(0.9, 2.2, q);
  }
  // the belts stand on land: the land widens a little around them (its coast as fractal as any)
  if (ranges.length) {
    for (let k = 0; k < N; k++) landness[k] += 0.3 * (1 - smoothstep(0.6, 3, crestD[k] / crestHalf[k]));
    const t2 = thresholdForFraction(landness, g, Math.min(0.9, o.landFraction * 1.08));
    for (let k = 0; k < N; k++) land[k] = landness[k] > t2 ? 1 : 0;
  }

  const isCoast = new Uint8Array(N);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (i + 1 < w && land[k] !== land[k + 1]) isCoast[k] = isCoast[k + 1] = 1;
      if (j + 1 < h && land[k] !== land[k + w]) isCoast[k] = isCoast[k + w] = 1;
    }
  const coastKm = distanceField(g, isCoast).dist;

  // ---- the land beyond the belts: plains, hills, foothills, plateaus; cut by water
  o.progress?.('Carving valleys', 0);
  const plateauH = 300 + 1100 * rnd();
  const plateau = new Float32Array(N);
  const U = new Float32Array(N);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (!land[k]) continue;
      const x = xKm(i);
      const y = yKm(j);
      const hills = smoothstep(-0.1, 0.45, n2(x, y, 160, 3, 5.1));
      // tablelands: broad, raised, with margins rivers cut into
      const pl = smoothstep(0.22, 0.38, n2(x, y, 240, 2, 7.7)) * (1 - foot[k]) * smoothstep(5, 40, coastKm[k]) * (0.3 + 0.7 * rough);
      plateau[k] = pl;
      U[k] = 0.06 + hills * (0.1 + 0.55 * rough) + 0.6 * foot[k] * (1 - belt[k]) + 0.25 * pl;
    }
  // erosion on a grid of at most EROSION_CELLS cells (the valleys it can hold are a few of them across)
  const f = Math.max(1, Math.ceil(Math.sqrt(N / EROSION_CELLS)));
  const ew = Math.ceil(w / f);
  const eh = Math.ceil(h / f);
  const eU = new Float32Array(ew * eh);
  for (let j = 0; j < eh; j++) for (let i = 0; i < ew; i++) eU[j * ew + i] = U[Math.min(h - 1, j * f) * w + Math.min(w - 1, i * f)];
  const z = upliftRelief({ w: ew, h: eh, uplift: eU, cellKm: kmCell * f, peakM: 1, raw: true, seed: subSeed(o.seed, 402), steps: 40, roughness: 0.05 });
  let zTop = 0;
  for (let q = 0; q < z.length; q++) zTop = Math.max(zTop, z[q]);
  // the relief this uplift makes: hundreds of metres in hill country, much less on plains
  const hillM = 250 + 1200 * rough + 900 * mountains;
  const zAt = (i: number, j: number) => {
    const fx = (i + 0.5) / f - 0.5;
    const fy = (j + 0.5) / f - 0.5;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const at = (a: number, b: number) => z[clamp(b, 0, eh - 1) * ew + clamp(a, 0, ew - 1)];
    return (at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty) + (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty;
  };
  const height = new Float32Array(N);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (land[k]) {
        // coastal plains rise gently inland (half a metre to a metre a km)
        const rise = 3 + 0.7 * Math.min(coastKm[k], 350);
        height[k] = rise + (zTop > 0 ? (zAt(i, j) / zTop) * hillM : 0) + plateau[k] * plateauH;
      } else {
        // shelves: about a metre deeper every km, then down the slope to the deep sea
        const d = coastKm[k];
        height[k] = -Math.min(o.maxDepth, 3 + 1.1 * Math.min(d, 140) + 18 * Math.max(0, d - 140));
      }
    }

  // ---- the belts: ranges carved by rivers, as drawn ranges are
  const rangeRel = new Float32Array(N);
  if (ranges.length) {
    o.progress?.('Raising mountains', 0);
    const rf = Math.max(1, Math.ceil(Math.sqrt(N / EROSION_CELLS)));
    const rw = Math.ceil(w / rf);
    const rh = Math.ceil(h / rf);
    const peakM = Math.max(...ranges.map((r) => r.heightM));
    const jobRanges: RangeJobRange[] = ranges.map((r) => ({
      height: r.heightM / peakM,
      seed: r.seed % 1_000_003,
      halfWidth: r.widthKm / 2 / (kmCell * rf),
      irregularity: 0.6,
      asymmetry: r.asymmetry,
      lines: [
        {
          pts: Float32Array.from(r.points.flatMap(([x, y]) => [(x - g.x0) / (g.step * rf), (y - g.y0) / (g.step * rf)])),
          h0: 1,
          h1: 1,
          freeStart: true,
          freeEnd: true,
        },
      ],
    }));
    const { relief } = rangeRelief({ w: rw, h: rh, cellKm: kmCell * rf, ox: g.x0, oy: g.y0, scale: g.step * rf, ranges: jobRanges, peakM, seed: 0 });
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const k = j * w + i;
        const fx = Math.min(rw - 1, (i + 0.5) / rf - 0.5);
        const fy = Math.min(rh - 1, (j + 0.5) / rf - 0.5);
        const ix = Math.max(0, Math.floor(fx));
        const iy = Math.max(0, Math.floor(fy));
        const tx = Math.max(0, fx - ix);
        const ty = Math.max(0, fy - iy);
        const lerp = (a: Float32Array) => {
          const at = (x: number, y: number) => a[Math.min(rh - 1, y) * rw + Math.min(rw - 1, x)];
          return (at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty) + (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty;
        };
        // on land only, easing down to the coast over some km (no cliff where a belt meets the sea)
        rangeRel[k] = land[k] ? lerp(relief) * smoothstep(0, COAST_EASE_KM, coastKm[k]) : 0;
        height[k] += rangeRel[k];
      }
  }
  return { land, h: height, rangeRelief: rangeRel, ranges };
}
