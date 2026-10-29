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
export type RegionLayout = 'part' | 'coast' | 'peninsula' | 'inland' | 'isle' | 'crater' | 'continents' | 'pangaea' | 'mainland' | 'archipelago' | 'innerSea' | 'shattered';

/** What kind of mountains each layout has: belts where plates collide, island arcs, rifts. */
const MOUNTAIN_STYLE: Record<RegionLayout, { belts: number; arcs: number; rifts: number }> = {
  part: { belts: 1.2, arcs: 0.1, rifts: 1 },
  coast: { belts: 1, arcs: 0.2, rifts: 1 },
  peninsula: { belts: 0.8, arcs: 0.2, rifts: 0.6 },
  inland: { belts: 1.2, arcs: 0, rifts: 1 },
  isle: { belts: 0.45, arcs: 0.3, rifts: 0 },
  crater: { belts: 0, arcs: 0, rifts: 0 },
  continents: { belts: 1, arcs: 0.3, rifts: 1 },
  pangaea: { belts: 1, arcs: 0.2, rifts: 1 },
  mainland: { belts: 0.8, arcs: 0.7, rifts: 0.5 },
  archipelago: { belts: 0.2, arcs: 1, rifts: 0.3 },
  innerSea: { belts: 0.8, arcs: 0.2, rifts: 0.6 },
  shattered: { belts: 0.8, arcs: 0.2, rifts: 0.5 },
};

export interface RegionalOptions {
  seed: number;
  layout: RegionLayout;
  /** km per world cell. */
  cellKm: number;
  landFraction: number;
  mountains: number;
  /** 0 … 1: how much of the land the ranges cover (0.5 about a quarter, as on Earth). */
  ranges: number;
  roughness: number;
  maxElevation: number;
  /** Deepest sea floor, metres below sea level. */
  maxDepth: number;
  progress?: (stage: string, f: number) => void;
}

/** Over this many km from the coast a belt's mountains come down to the shore. */
const COAST_EASE_KM = 12;
/** Most cells the erosion of the land works on (it runs coarser on bigger grids). */
const EROSION_CELLS = 4_300_000;
/** The same for the land beyond the belts (gentler land, coarser valleys). */
const HILL_CELLS = 300_000;

/** Box blur in place, three passes (about a Gaussian), edges clamped. */
function blurGrid(a: Float32Array, w: number, h: number, r: number) {
  const line = new Float32Array(Math.max(w, h));
  for (let p = 0; p < 3; p++) {
    for (let j = 0; j < h; j++) {
      let s = 0;
      for (let i = -r; i <= r; i++) s += a[j * w + Math.min(w - 1, Math.max(0, i))];
      for (let i = 0; i < w; i++) {
        line[i] = s / (2 * r + 1);
        s += a[j * w + Math.min(w - 1, i + r + 1)] - a[j * w + Math.max(0, i - r)];
      }
      a.set(line.subarray(0, w), j * w);
    }
    for (let i = 0; i < w; i++) {
      let s = 0;
      for (let j = -r; j <= r; j++) s += a[Math.min(h - 1, Math.max(0, j)) * w + i];
      for (let j = 0; j < h; j++) {
        line[j] = s / (2 * r + 1);
        s += a[Math.min(h - 1, j + r + 1) * w + i] - a[Math.max(0, j - r) * w + i];
      }
      for (let j = 0; j < h; j++) a[j * w + i] = line[j];
    }
  }
}

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
  // (an island stays nearer the middle: off it, the sea round the map would cut its side straight)
  const off = o.layout === 'isle' || o.layout === 'mainland' ? 0.07 : 0.16;
  const cu = 0.5 + (rnd() - 0.5) * off;
  const cv = 0.5 + (rnd() - 0.5) * off;
  // the side open layouts face (where their land lies): a direction, unit length
  const side = rnd() * Math.PI * 2;
  const dirX = Math.cos(side);
  const dirY = Math.sin(side);
  const style = MOUNTAIN_STYLE[o.layout];
  // a meteorite's crater (Chicxulub is 180 km across): its middle and size
  const craterX = (0.4 + 0.2 * rnd()) * g.W * o.cellKm;
  const craterY = (0.4 + 0.2 * rnd()) * g.H * o.cellKm;
  const craterR = (0.16 + 0.1 * rnd()) * mapKm;
  // (its outline not ruled: its radius wanders by some per cent around it)
  const craterD = (x: number, y: number) => Math.hypot(x - craterX, y - craterY) / craterR + 0.07 * n2(x, y, 0.35 * craterR, 3, 24.1);
  // inland and crater maps are land wherever their own shape says (no share of sea to meet)
  const fixedShore = o.layout === 'inland' || o.layout === 'crater';
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
      const r0 = Math.hypot(wu - cu, wv - cv) / 0.5;
      // (an island's outline has lobes and bays: capes and gulfs tens of km deep)
      const r = o.layout === 'isle' || o.layout === 'mainland' ? r0 * (1 + 0.32 * n2(x, y, 0.22 * mapKm, 2, 33.3)) : r0;
      // the sea round the map's edges: a frame between a circle and the map's square (1 at the
      // middle of each edge), its width wandering, so the land's outline is its own and not the
      // map's square with its sides and corners
      const se = ((Math.abs(u - 0.5) / 0.5) ** 3 + (Math.abs(v - 0.5) / 0.5) ** 3) ** (1 / 3);
      const out = se - 0.88 + 0.1 * n2(x, y, 0.25 * mapKm, 3, 15.5);
      const frame = smoothstep(-0.15, 0.05, out);
      // which way the land lies, for layouts open to one side: 0 … 1 across the map
      const toward = (u - 0.5) * dirX + (v - 0.5) * dirY + 0.5;
      let L: number;
      switch (o.layout) {
        case 'part':
          // a region of a bigger land: land runs off the map on most sides, the sea on one
          L = 0.55 * n2(x, y, 0.8 * mapKm, 2, 0.3) + 0.25 * n2(x, y, 0.35 * mapKm, 2, 1.7) + coast + 0.9 * smoothstep(0, 0.45, toward);
          break;
        case 'coast':
          // land on one side, sea on the other, the coast winding between
          L = 2.2 * (toward - 0.5) + 0.35 * n2(x, y, 0.35 * mapKm, 3, 1.7) + coast;
          break;
        case 'peninsula': {
          // a tongue of land from one side of the map out into the sea, narrowing to its tip
          const across = (u - 0.5) * -dirY + (v - 0.5) * dirX + 0.07 * n2(x, y, 0.3 * mapKm, 2, 19.3);
          const half = 0.07 + 0.2 * smoothstep(0.2, 0.95, toward);
          L = 1 - Math.abs(across) / half + 0.25 * n2(x, y, 0.3 * mapKm, 2, 1.7) + coast - 2.5 * (1 - smoothstep(0.12, 0.32, toward));
          break;
        }
        case 'inland':
          // no sea at all
          L = 1;
          break;
        case 'isle':
          // one island
          L = 1.2 * (1 - Math.min(1.6, r / 0.7) ** 2) + 0.3 * n2(x, y, 0.3 * mapKm, 3, 1.7) + coast - 2 * frame;
          break;
        case 'crater':
          // a land struck by a meteorite: the crater a lake or a bay of the sea, its rim standing
          L = 1;
          break;
        case 'pangaea':
          // one landmass filling most of the map
          L = 1.1 * (1 - r * r) + 0.3 * n2(x, y, 0.45 * mapKm, 2, 1.7) + coast - 1.6 * frame;
          break;
        case 'mainland':
          // one large landmass and island chains around it
          L = 1.2 * (1 - Math.min(1.5, r / 0.65) ** 2) + 0.25 * n2(x, y, 0.4 * mapKm, 2, 1.7) + coast + 1.6 * smoothstep(0.7, 0.85, r) * smoothstep(0.15, 0.5, n2(x, y, 0.06 * mapKm, 3, 4.4)) - 1.6 * frame;
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
      if (o.layout === 'crater') {
        // the crater: its floor flooded, its rim a ring of hills, a peak in its middle
        const d = craterD(x, y);
        L = d < 0.82 + 0.04 * n2(x, y, 0.1 * mapKm, 2, 21.1) ? -1 : 1;
        if (d < 0.12) L = 1;
      }
      landness[k] = L;
    }
  // ---- plates parting and plates sinking: rifts and island arcs
  // A rift (Red Sea, Rhine graben, East African valleys): where the land is pulled apart it sinks
  // in a long trough some tens of km wide, a sea if deep enough. An island arc (Kurils, Lesser
  // Antilles): where a plate sinks under another, a curved chain of volcanic islands stands
  // offshore. Rarer than collisions, and arcs belong to seas: more of them on island maps.
  const rift = new Float32Array(N);
  const cones: { x: number; y: number; r: number; hM: number }[] = [];
  {
    const nRift = rnd() < (0.25 + 0.15 * (mapKm / 1000)) * style.rifts ? 1 : 0;
    const nArc = rnd() < 0.5 * style.arcs + 0.4 * Math.max(0, style.arcs - 0.6) ? (style.arcs >= 1 && rnd() < 0.5 ? 2 : 1) : 0;
    for (let b = 0; b < nRift; b++) {
      const cx = (0.25 + 0.5 * rnd()) * g.W * o.cellKm;
      const cy = (0.25 + 0.5 * rnd()) * g.H * o.cellKm;
      const ang = rnd() * Math.PI;
      const half = 15 + 25 * rnd();
      for (let j = 0; j < h; j++)
        for (let i = 0; i < w; i++) {
          const dx = xKm(i) - cx;
          const dy = yKm(j) - cy;
          const along = dx * Math.cos(ang) + dy * Math.sin(ang);
          const off = -dx * Math.sin(ang) + dy * Math.cos(ang) + 0.06 * mapKm * n2(along, b * 31, 300, 2, 9.4);
          // the trough, fading out at its ends (rifts open from a point)
          const len = 0.45 * mapKm;
          const v = Math.exp(-((off / half) ** 2)) * (1 - smoothstep(0.6 * len, len, Math.abs(along)));
          rift[j * w + i] = Math.max(rift[j * w + i], v);
        }
    }
    for (let b = 0; b < nArc; b++) {
      // an arc a few hundred km across, its chain of volcanoes 30–80 km apart
      const R = (0.35 + 0.4 * rnd()) * mapKm;
      const ccx = (rnd() - 0.5) * g.W * o.cellKm + (rnd() < 0.5 ? -0.3 : 1.3) * g.W * o.cellKm * 0.5;
      const ccy = (0.3 + 0.4 * rnd()) * g.H * o.cellKm;
      const a0 = rnd() * Math.PI * 2;
      for (let a = 0; a < Math.PI * 1.2; a += (22 + 30 * rnd()) / R) {
        const x = ccx + Math.cos(a0 + a) * R;
        const y = ccy + Math.sin(a0 + a) * R;
        if (x < 0 || y < 0 || x > g.W * o.cellKm || y > g.H * o.cellKm) continue;
        // (a little off the arc's line: chains are not ruled)
        const j2 = (rnd() - 0.5) * 16;
        cones.push({ x: x + j2, y: y - j2, r: 3 + 5 * rnd(), hM: 500 + 2000 * rnd() * (0.4 + 0.6 * mountains) });
      }
    }
    for (const c of cones)
      for (let j = 0; j < h; j++) {
        const dy = yKm(j) - c.y;
        if (Math.abs(dy) > c.r * 3) continue;
        for (let i = 0; i < w; i++) {
          const dx = xKm(i) - c.x;
          if (Math.abs(dx) > c.r * 3) continue;
          const d = Math.hypot(dx, dy) / c.r;
          const k = j * w + i;
          landness[k] = Math.max(landness[k], 2 * Math.exp(-d * d) - 0.6 + 0.35 * n2(xKm(i), yKm(j), 6, 3, 13.3));
        }
      }
    for (let k = 0; k < N; k++) landness[k] -= 0.9 * rift[k];
  }

  const t = fixedShore ? 0 : thresholdForFraction(landness, g, o.landFraction);
  const land = new Uint8Array(N);
  for (let k = 0; k < N; k++) land[k] = landness[k] > t ? 1 : 0;
  // ---- plate boundaries where plates collide: mountain belts
  o.progress?.('Moving tectonic plates', 0);
  const ranges: RegionRange[] = [];
  // How many belts: as many as cover the share of the land asked for (a belt with its foothills
  // covers about 1.4 times its width across a map it crosses). Their width is a real range's
  // (Pyrenees 80–100 km, Caucasus 100–180, Alps 150–250), whatever the map's size: on a small map
  // a belt is rarer, not narrower. Their height is the other setting's.
  const amount = clamp(o.ranges, 0, 1);
  const cover = 0.5 * amount ** 1.1;
  const expected = amount < 0.03 || mountains < 0.05 ? 0 : (cover * style.belts * mapKm) / (1.4 * 125);
  let count = Math.min(4, Math.floor(expected) + (rnd() < expected % 1 ? 1 : 0));
  // a piece of a continent has its range whenever there are ranges at all (it is why one draws
  // such a map); its width then gives the share of the land asked for
  if (!count && amount >= 0.2 && mountains >= 0.05 && style.belts >= 0.8) count = 1;
  // an island: half of them have a massif (Corsica, Kyushu), the rest a volcano or two
  if (!count && amount >= 0.2 && mountains >= 0.05 && o.layout === 'isle' && rnd() < 0.5) count = 1;
  const beltWidth = count ? clamp((cover * style.belts * mapKm) / (1.4 * count), 40, 200) : 0;
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
    const width = Math.min(0.4 * mapKm, clamp(beltWidth * (0.75 + 0.5 * rnd()), 40, 220));
    const bend = 0.08 * mapKm;
    const L = 1.6 * mapKm;
    const pts: [number, number][] = [];
    for (let s = -L; s <= L; s += Math.max(2 * o.cellKm, width / 4)) {
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
    // (the ranges have foothills of their own: this is only the land rising toward them)
    foot[k] = 1 - smoothstep(0.9, 1.7, q);
  }
  // the belts stand on land: the land widens a little around them (its coast as fractal as any)
  if (ranges.length) {
    for (let k = 0; k < N; k++) landness[k] += 0.3 * (1 - smoothstep(0.6, 3, crestD[k] / crestHalf[k]));
    const t2 = fixedShore ? 0.15 : thresholdForFraction(landness, g, Math.min(0.9, o.landFraction * 1.08));
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

  // ---- volcanoes on islands: an island without a range has its mountain in a volcano or two
  // (Tenerife, Etna, Hawaii's), the islands of an archipelago each their own cone
  if (o.layout === 'isle' || o.layout === 'archipelago') {
    const many = o.layout === 'archipelago';
    const want = many ? 3 + Math.floor(5 * rnd()) : ranges.length ? (rnd() < 0.4 ? 1 : 0) : 1 + (rnd() < 0.5 ? 1 : 0);
    const placed: { x: number; y: number }[] = [];
    for (let v = 0; v < want; v++) {
      // of some land cells tried, the one farthest from the coast (and from cones already there)
      let bestK = -1;
      let bestS = 0;
      for (let tries = 0; tries < 400; tries++) {
        const k = Math.floor(rnd() * N);
        if (!land[k]) continue;
        const x = xKm(k % w);
        const y = yKm((k / w) | 0);
        let sc = coastKm[k] * (0.6 + 0.4 * rnd());
        for (const q of placed) sc = Math.min(sc, Math.hypot(q.x - x, q.y - y) / 2.5);
        if (sc > bestS) {
          bestS = sc;
          bestK = k;
        }
      }
      if (bestK < 0 || coastKm[bestK] < 3) break;
      const x = xKm(bestK % w);
      const y = yKm((bestK / w) | 0);
      placed.push({ x, y });
      const r = clamp(coastKm[bestK] * 0.55, 3, many ? 0.02 * mapKm : 0.05 * mapKm) * (0.7 + 0.3 * rnd());
      cones.push({ x, y, r, hM: (many ? 600 + 1600 * rnd() : 1300 + 2600 * rnd()) * (0.4 + 0.6 * mountains) * Math.min(1, r / 10 + 0.3) });
    }
  }

  // ---- the land beyond the belts: plains, hills, foothills, plateaus; cut by water
  o.progress?.('Carving valleys', 0);
  // tablelands: hundreds of metres above the plains around them, risen over tens of km
  const plateauH = (120 + 380 * rnd()) * (0.4 + 0.6 * rough);
  // the local relief of the land beyond the belts, metres: low swells on plains, a few hundred
  // metres in hill country, more where it is rugged (the "Hills" setting)
  const hillAmp = 25 + 675 * rough ** 2.2;
  const footAmp = 60 + 200 * mountains;
  // a crater's rim: hundreds of metres to a couple of km
  const craterRim = (400 + 1600 * rnd()) * (0.5 + 0.5 * mountains);
  /** Volcanoes: steep cones, their foot not a circle (lava flows and spurs run out further on some sides). */
  const coneAt = (x: number, y: number) => {
    let v = 0;
    for (const c of cones) {
      const dx = x - c.x;
      const dy = y - c.y;
      if (Math.abs(dx) > c.r * 2 || Math.abs(dy) > c.r * 2) continue;
      const d = (Math.hypot(dx, dy) / c.r) * (1 + 0.15 * n2(x, y, c.r * 1.2, 2, 29.3));
      if (d < 1.6) v = Math.max(v, c.hM * (1 - d / 1.6) ** 1.6);
    }
    return v;
  };
  const cone = new Float32Array(N);
  const plateau = new Float32Array(N);
  const U = new Float32Array(N);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (!land[k]) continue;
      const x = xKm(i);
      const y = yKm(j);
      // hill country here and there, gentler land between
      const hills = 0.3 + 0.7 * smoothstep(-0.1, 0.45, n2(x, y, 160, 3, 5.1));
      // tablelands: broad, raised, their margins easing down over tens of km
      // (no flat top nor clear edge: uplands that rise and fall again across them)
      const pl = smoothstep(-0.05, 0.6, n2(x, y, 240, 3, 7.7)) * (1 - foot[k]) * smoothstep(5, 60, coastKm[k]);
      plateau[k] = pl;
      // (the volcanoes rise with the land and are cut by the same water: gullies down their flanks)
      cone[k] = cones.length ? coneAt(x, y) : 0;
      U[k] = 15 + hills * hillAmp + footAmp * foot[k] * (1 - belt[k]) + cone[k];
    }
  // erosion on a grid of at most HILL_CELLS cells (the valleys it can hold are a few of them across)
  const f = Math.max(1, Math.ceil(Math.sqrt(N / HILL_CELLS)));
  const ew = Math.ceil(w / f);
  const eh = Math.ceil(h / f);
  const eU = new Float32Array(ew * eh);
  const eFoot = new Float32Array(ew * eh);
  for (let j = 0; j < eh; j++)
    for (let i = 0; i < ew; i++) {
      const k = Math.min(h - 1, j * f) * w + Math.min(w - 1, i * f);
      eU[j * ew + i] = U[k];
      eFoot[j * ew + i] = Math.max(foot[k] * (1 - belt[k]), cone[k] / (cone[k] + 60));
    }
  let uTop = 0;
  for (let q = 0; q < eU.length; q++) uTop = Math.max(uTop, eU[q]);
  for (let q = 0; q < eU.length; q++) eU[q] /= Math.max(1, uTop);
  const z = upliftRelief({ w: ew, h: eh, uplift: eU, cellKm: kmCell * f, peakM: 1, raw: true, seed: subSeed(o.seed, 402), steps: 40, roughness: 0.05 });
  let zTop = 0;
  for (let q = 0; q < z.length; q++) zTop = Math.max(zTop, z[q]);
  // the relief comes out about in proportion to the uplift: the highest, the uplift's metres
  const hillM = uTop;
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
  // low land is shaped more by soil creep than by rivers: its rills soften into broad, rounded
  // swells; the sharp valleys stay in rugged hills and foothills (Perron et al. 2009)
  const zs = new Float32Array(z.length);
  {
    const zr = Math.max(1, Math.round((1.2 + 2.5 * (1 - rough)) / (kmCell * f)));
    const zb = Float32Array.from(z);
    blurGrid(zb, ew, eh, zr);
    const keepHills = 0.25 + 0.7 * rough ** 1.5;
    for (let q = 0; q < z.length; q++) {
      const t2 = Math.max(keepHills, 0.85 * eFoot[q]);
      zs[q] = zb[q] + (z[q] - zb[q]) * t2;
    }
  }
  z.set(zs);
  // (far from the coast its distance is smoothed: the field's small errors there, steepened by the
  // slope down to the deep sea, would draw steps across the sea floor)
  const seaKm = Float32Array.from(coastKm);
  blurGrid(seaKm, w, h, Math.max(1, Math.round(12 / kmCell)));
  const height = new Float32Array(N);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (land[k]) {
        // coastal plains rise gently inland (half a metre to a metre a km)
        const rise = 3 + 0.7 * Math.min(coastKm[k], 350);
        height[k] = rise + (zTop > 0 ? (zAt(i, j) / zTop) * hillM : 0) + plateau[k] * plateauH;
        // a rift's floor is low and level
        height[k] = Math.max(2, height[k] * (1 - 0.85 * rift[k]));
        if (o.layout === 'crater') {
          // the rim a ring of steep hills, the ejecta thinning outward; the central peak
          const d = craterD(xKm(i), yKm(j));
          const rim = Math.exp(-(((d - 0.93) / 0.12) ** 2)) + (d > 0.93 ? 0.35 * Math.exp(-(d - 0.93) / 0.5) : 0);
          height[k] += craterRim * rim * (0.75 + 0.5 * smoothstep(-0.4, 0.4, n2(xKm(i), yKm(j), 0.3 * craterR, 3, 23.3))) * (1 + 0.25 * n2(xKm(i), yKm(j), 6, 3, 25.9));
          if (d < 0.14) height[k] += craterRim * 0.8 * (1 - d / 0.14) ** 1.5;
        }
      } else {
        // shelves: about a metre deeper every km, then down the slope to the deep sea
        const d = coastKm[k] < 20 ? coastKm[k] : coastKm[k] + (seaKm[k] - coastKm[k]) * smoothstep(20, 60, coastKm[k]);
        height[k] = -Math.min(o.maxDepth, 3 + 1.1 * Math.min(d, 140) + 18 * Math.max(0, d - 140) + 1200 * rift[k]);
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
    const { relief } = rangeRelief({ w: rw, h: rh, cellKm: kmCell * rf, ox: g.x0, oy: g.y0, scale: g.step * rf, ranges: jobRanges, peakM, seed: 0, steps: 32, coarseToFine: true, refineSteps: 10 });
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
      }
    // the foothills are worn by creep like the hills beyond them: rounded where the land is gentle
    // (the "Hills" setting), sharp-cut where it is rugged; the main ranges keep their valleys
    const soft = Float32Array.from(rangeRel);
    blurGrid(soft, w, h, Math.max(1, Math.round(1.5 / kmCell)));
    const keepFoot = 0.3 + 0.65 * rough;
    for (let k = 0; k < N; k++) {
      const t2 = Math.max(keepFoot, smoothstep(0.2, 0.7, belt[k]));
      rangeRel[k] = soft[k] + (rangeRel[k] - soft[k]) * t2;
      height[k] += rangeRel[k];
    }
  }
  return { land, h: height, rangeRelief: rangeRel, ranges };
}
