import { mulberry32, simplifyPath, uid } from '../core/math';
import { BIOME_CHANNELS } from '../core/planet';
import { history } from '../model/history';
import type { MapDocument, MapObject, PathFeature } from '../model/types';
import { useDoc } from '../store/docStore';
import { useEditor } from '../store/editorStore';
import type { GenParams, GenResult, GenType, Realism, Template } from '../terrain/generator';
import type { WorkerReply, WorkerRequest } from '../terrain/generator.worker';
import type { RasterArray } from '../terrain/TileGrid';
import type { TileChange } from '../terrain/TerrainModel';
import { editor } from './Editor';
import { newObject } from './commands';

export type RiverAmount = 'none' | 'few' | 'normal' | 'many';
const RIVERS: Record<RiverAmount, [world: number, view: number]> = { none: [0, 0], few: [14, 4], normal: [32, 8], many: [70, 16] };

export interface GenerateOptions {
  type: GenType;
  template: Template;
  realism: Realism;
  seed: number;
  landFraction: number;
  mountains: number;
  roughness: number;
  warmth: number;
  wetness: number;
  biomes: boolean;
  rivers: RiverAmount;
  settlements: boolean;
  /** island / archipelago: generate into the visible area */
  region: 'view' | 'world';
  /** Flat maps: latitude (degrees) of the climate at the map's centre. */
  climateLat?: number;
}

/** Flat maps are generated as a 90°-wide patch of a virtual planet (enough room for several landmasses). */
const FLAT_SPAN_LON = 90;

/** Generator parameters for options on the current map (`size` overrides the grid, for previews). */
export function genParams(o: GenerateOptions, size?: { W: number; H: number }): GenParams {
  const model = editor.model!;
  const p = model.planet;
  const geo = model.geo;
  // flat maps: the climate band is as tall as the map is on the ground (≈111 km per degree)
  const flat = geo.flat ? { spanLonDeg: FLAT_SPAN_LON, climateLatDeg: o.climateLat ?? 45, climateSpanDeg: Math.min(60, Math.max(2, (geo.H * geo.cellKm) / 111.2)) } : undefined;
  const whole = o.type === 'continents' || o.type === 'pangaea' || o.region === 'world';
  let region: GenParams['region'] = null;
  if (!whole && !size) {
    const v = editor.renderer!.camera.visible;
    region = { x0: v.x0, y0: Math.max(0, v.y0), x1: v.x1, y1: Math.min(model.H, v.y1) };
  }
  return {
    type: o.type,
    template: whole ? o.template : 'none',
    realism: size ? 'easy' : o.realism,
    seed: o.seed,
    W: size?.W ?? model.W,
    // previews of flat maps keep the map's proportions
    H: size ? (geo.flat ? Math.max(64, Math.round((size.W * model.H) / model.W / 2) * 2) : size.H) : model.H,
    radiusKm: p.radiusKm,
    landFraction: o.landFraction,
    mountains: o.mountains,
    roughness: o.roughness,
    warmth: o.warmth,
    wetness: o.wetness,
    seaLevel: p.seaLevel,
    maxElevation: p.maxElevation,
    minElevation: p.minElevation,
    oceanFloor: p.oceanFloor,
    region,
    biomes: o.biomes,
    rivers: size ? 0 : RIVERS[o.rivers][whole ? 0 : 1],
    flat,
  };
}

const newWorker = () => new Worker(new URL('../terrain/generator.worker.ts', import.meta.url), { type: 'module' });

/** A long-lived worker that renders small previews; stale requests are dropped. */
export class PreviewWorker {
  private w = newWorker();
  private id = 0;
  private waiting = new Map<number, (img: ImageData | null) => void>();
  constructor() {
    this.w.onmessage = (e: MessageEvent<WorkerReply>) => {
      const m = e.data;
      if (m.kind === 'preview') this.waiting.get(m.id)?.(new ImageData(new Uint8ClampedArray(m.image), m.w, m.h));
      else if (m.kind === 'error' && m.id !== undefined) this.waiting.get(m.id)?.(null);
      if ((m.kind === 'preview' || m.kind === 'error') && m.id !== undefined) this.waiting.delete(m.id);
    };
  }
  render(p: GenParams): Promise<ImageData | null> {
    const id = ++this.id;
    return new Promise((resolve) => {
      this.waiting.set(id, resolve);
      this.w.postMessage({ kind: 'preview', id, params: p } satisfies WorkerRequest);
    });
  }
  dispose() {
    this.w.terminate();
    for (const r of this.waiting.values()) r(null);
    this.waiting.clear();
  }
}

// place-name generator: an onset, an optional middle syllable and a suffix
// chosen by settlement kind
const ONSETS = ['Bel', 'Cor', 'Dra', 'Eld', 'Fal', 'Gor', 'Hal', 'Ister', 'Kel', 'Lor', 'Mar', 'Nor', 'Os', 'Pell', 'Quel', 'Ros', 'Sel', 'Tam', 'Ul', 'Var', 'Wyn', 'Yr'];
const MIDDLES = ['a', 'en', 'i', 'o', 'ar', 'el', ''];
const SUFFIXES: Record<string, string[]> = {
  town: ['bridge', 'mere', 'brook', 'haven', 'vale', 'moor', 'wick', 'ley', 'stow', 'cross'],
  castle: ['guard', 'spire', 'helm', 'rock', 'wall', 'mount'],
  tower: ['watch', 'beacon', 'sight'],
  ruin: ['dust', 'grave', 'shade'],
};
export function makeName(kind: keyof typeof SUFFIXES, rnd: () => number = Math.random): string {
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const name = pick(ONSETS) + pick(MIDDLES) + pick(SUFFIXES[kind] ?? SUFFIXES.town);
  if (kind === 'castle' && rnd() < 0.35) return `${name} Keep`;
  if (kind === 'ruin' && rnd() < 0.5) return `Old ${name}`;
  return name;
}

class Cancelled extends Error {}

/** Run the generator in a worker; the busy overlay shows its progress and can cancel it. */
function runWorker(p: GenParams): Promise<GenResult> {
  return new Promise((resolve, reject) => {
    const w = newWorker();
    const done = () => {
      w.terminate();
      useEditor.getState().set({ busyCancel: null });
    };
    useEditor.getState().set({
      busyCancel: () => {
        done();
        reject(new Cancelled('Generation cancelled'));
      },
    });
    w.onmessage = (e: MessageEvent<WorkerReply>) => {
      const m = e.data;
      if (m.kind === 'progress') {
        const pct = m.fraction > 0 && m.fraction < 1 ? ` ${Math.round(m.fraction * 100)}%` : '';
        useEditor.getState().set({ busy: `${m.stage}…${pct}` });
      } else if (m.kind === 'done') {
        done();
        resolve(m.result);
      } else if (m.kind === 'error') {
        done();
        reject(new Error(m.error));
      }
    };
    w.onerror = (e) => {
      done();
      reject(new Error(e.message));
    };
    w.postMessage({ kind: 'generate', params: p } satisfies WorkerRequest);
  });
}

/** Write a region (in the layer's own grid cells) into a tile grid, recording before/after tiles. */
function writeRegion(
  layer: 'height' | 'biome',
  r: GenResult['region'],
  fn: (x: number, y: number, idx: number, tile: RasterArray, ti: number) => void,
): TileChange {
  const model = editor.model!;
  const g = model.grid(layer);
  const before = new Map<number, RasterArray | null>();
  const TS = g.TS;
  for (let j = 0; j < r.h; j++) {
    const y = r.y0 + j;
    if (y < 0 || y >= g.H) continue;
    const ty = Math.floor(y / TS);
    for (let i = 0; i < r.w; i++) {
      const x = (((r.x0 + i) % g.W) + g.W) % g.W;
      const tx = Math.floor(x / TS);
      const key = g.key(tx, ty);
      if (!before.has(key)) {
        const t = g.tiles.get(key);
        before.set(key, t ? (t.slice() as RasterArray) : null);
      }
      const tile = g.ensureTile(tx, ty);
      fn(x, y, j * r.w + i, tile, ((y - ty * TS) * TS + (x - tx * TS)) * g.channels);
    }
  }
  const after = new Map<number, RasterArray | null>();
  for (const k of before.keys()) after.set(k, g.tiles.get(k)!.slice() as RasterArray);
  const s = g.scale;
  model.changed(layer, { x0: r.x0 * s, y0: r.y0 * s, x1: (r.x0 + r.w) * s, y1: (r.y0 + r.h) * s });
  return { layer, before, after };
}

export async function generateWorld(o: GenerateOptions) {
  const model = editor.model!;
  const st = useEditor.getState();
  const whole = o.type === 'continents' || o.type === 'pangaea' || o.region === 'world';
  st.set({ busy: 'Generating terrain…' });
  try {
    const res = await runWorker(genParams(o));
    const changes: TileChange[] = [];
    if (whole && res.region.w === model.W) {
      changes.push(model.replaceLayer('height', res.height));
      changes.push(model.replaceLayer('biome', res.biome ?? null, 0));
    } else {
      const gen = res.height;
      changes.push(
        writeRegion('height', res.region, (_x, _y, idx, tile, ti) => {
          if (gen[idx] > tile[ti]) tile[ti] = gen[idx];
        }),
      );
      if (res.biome) {
        const b = res.biome;
        changes.push(
          writeRegion('biome', res.biomeRegion, (_x, _y, idx, tile, ti) => {
            const s = idx * BIOME_CHANNELS;
            let any = 0;
            for (let c = 0; c < BIOME_CHANNELS; c++) any |= b[s + c];
            if (!any) return;
            for (let c = 0; c < BIOME_CHANNELS; c++) tile[ti + c] = b[s + c];
          }),
        );
      }
    }

    // vector additions; a new planet drops the old rivers, which no longer match the terrain
    const before = useDoc.getState().doc;
    const paths = whole ? Object.fromEntries(Object.entries(before.paths).filter(([, f]) => f.kind !== 'river')) : { ...before.paths };
    const objects = { ...before.objects };
    for (const river of res.rivers) {
      const simp = evenSpacing(simplifyPath(chaikin(river.points, 2), 0.6), 5);
      if (simp.length < 2) continue;
      const shift = model.geo.wrapX(simp[0][0]) - simp[0][0];
      const f: PathFeature = {
        id: uid('path-'),
        kind: 'river',
        points: simp.map(([x, y]) => [x + shift, y]),
        width: Math.max(0.6, river.widthCells),
        color: st.pathDefaults.river.color,
        style: 'solid',
        taper: true,
        name: '',
        hidden: false,
        locked: false,
      };
      paths[f.id] = f;
    }
    if (o.settlements) {
      const placed = scatterSettlements(whole ? 26 : 7, res.region, o.seed, res.rivers);
      for (const ob of placed) objects[ob.id] = ob;
    }
    const after: MapDocument = { ...useDoc.getState().doc, paths, objects };
    const setContent = (d: MapDocument) =>
      useDoc.setState((s) => ({ doc: { ...s.doc, paths: d.paths, objects: d.objects }, revision: s.revision + 1 }));
    setContent(after);
    history.push({
      label: 'Generate terrain',
      cost: changes.reduce((s, c) => s + [...c.before.values(), ...c.after.values()].reduce((a, t) => a + (t?.byteLength ?? 0), 0), 0),
      undo: () => {
        for (const c of changes.slice().reverse()) model.applyTiles(c, 'before');
        setContent(before);
      },
      redo: () => {
        for (const c of changes) model.applyTiles(c, 'after');
        setContent(after);
      },
    });
    useEditor.getState().notify(whole ? 'World generated' : 'Land generated in view');
  } catch (e) {
    if (e instanceof Cancelled) useEditor.getState().notify('Generation cancelled — the map is unchanged');
    else useEditor.getState().notify('Generation failed: ' + (e instanceof Error ? e.message : String(e)), 'error');
  } finally {
    useEditor.getState().set({ busy: null, busyCancel: null });
  }
}

/** Corner-cutting smoothing: takes the staircase out of grid-traced lines, keeps the ends. */
function chaikin(pts: [number, number][], passes: number): [number, number][] {
  let p = pts;
  for (let k = 0; k < passes && p.length > 2; k++) {
    const out: [number, number][] = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, ay] = p[i];
      const [bx, by] = p[i + 1];
      out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    out.push(p[p.length - 1]);
    p = out;
  }
  return p;
}

/** Split long segments so spline control points are evenly spaced (no overshooting loops). */
function evenSpacing(pts: [number, number][], maxLen: number): [number, number][] {
  const out: [number, number][] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) / maxLen);
    for (let s = 1; s <= n; s++) out.push([ax + ((bx - ax) * s) / n, ay + ((by - ay) * s) / n]);
  }
  return out;
}

/**
 * Place named settlements where people would build them: capitals and towns
 * on flat, fertile land by rivers, river mouths and coasts; castles on hills
 * that watch over rivers and coasts; watchtowers in mountain passes. Never in
 * deserts far from water, on ice, or in swamps.
 */
function scatterSettlements(count: number, region: GenResult['region'], seed: number, rivers: GenResult['rivers']): MapObject[] {
  const model = editor.model!;
  const geo = model.geo;
  const sea = model.seaLevel;
  const rnd = mulberry32(seed ^ 0x9e3779b9);
  const out: MapObject[] = [];
  const minSep = Math.max(region.w, region.h) / (Math.sqrt(count) * 2.2);
  const size = Math.max(2.5, Math.min(region.w, region.h) / 48);

  // river points in a coarse spatial hash
  const B = 16;
  const bins = new Map<number, [number, number][]>();
  const key = (bx: number, by: number) => by * 100000 + (((bx % 100000) + 100000) % 100000);
  for (const r of rivers)
    for (const [x, y] of r.points) {
      const wx = geo.wrapX(x);
      const k = key(Math.floor(wx / B), Math.floor(y / B));
      if (!bins.has(k)) bins.set(k, []);
      bins.get(k)!.push([wx, y]);
    }
  const nbx = Math.ceil(model.W / B);
  const riverDist = (x: number, y: number) => {
    let best = 99;
    const bx = Math.floor(x / B);
    const by = Math.floor(y / B);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        for (const [px, py] of bins.get(key((bx + dx + nbx) % nbx, by + dy)) ?? []) best = Math.min(best, Math.hypot(geo.deltaX(px, x), py - y));
    return best;
  };
  const coastDist = (x: number, y: number) => {
    for (const r of [2, 4, 8, 14])
      for (let a = 0; a < 12; a++) if (model.heightAt(x + Math.cos((a * Math.PI) / 6) * r, y + Math.sin((a * Math.PI) / 6) * r) <= sea) return r;
    return 99;
  };

  // candidate sites and what makes each one attractive
  interface Site { x: number; y: number; e: number; flat: number; river: number; coast: number; biome: number; jitter: number }
  const sites: Site[] = [];
  for (let tries = 0; tries < 9000 && sites.length < 3000; tries++) {
    const x = region.x0 + rnd() * region.w;
    const y = region.y0 + 8 + rnd() * Math.max(1, region.h - 16);
    const h = model.heightAt(x, y);
    const e = h - sea;
    if (e <= 2) continue;
    const flat = Math.abs(model.heightAt(x + 2, y) - h) + Math.abs(model.heightAt(x, y + 2) - h);
    sites.push({ x, y, e, flat, river: riverDist(x, y), coast: coastDist(x, y), biome: model.biomeAt(x, y), jitter: rnd() });
  }
  const livable = (s: Site) => {
    // 0 grass, 1 forest, 2 farmland, 3 desert, 4 swamp, 5 snow, 6 rock, 7 steppe
    if (s.biome === 5 || s.biome === 4) return 0;
    if (s.biome === 3) return s.river < 4 ? 0.8 : 0.05; // desert towns only on a river
    if (s.biome === 6) return 0.3;
    return s.biome === 2 ? 1.3 : s.biome === 1 ? 0.8 : 1;
  };
  const water = (s: Site) => (s.river < 3 && s.coast <= 8 ? 2.2 : s.river < 3 ? 1.7 : s.river < 8 ? 1.2 : s.coast <= 4 ? 1.3 : 0.35);
  const kinds: { asset: string; kind: 'town' | 'castle' | 'tower'; n: number; score: (s: Site) => number; scale: number; sep: number }[] = [
    { asset: 'builtin:city-capital', kind: 'town', n: Math.max(1, Math.round(count * 0.08)), scale: 1.4, sep: 1, score: (s) => (s.e < 700 && s.flat < 90 ? livable(s) * water(s) * (1.2 - s.flat / 120) : 0) },
    { asset: 'builtin:village', kind: 'town', n: Math.round(count * 0.45), scale: 0.9, sep: 0.8, score: (s) => (s.e < 1400 && s.flat < 160 ? livable(s) * water(s) : 0) },
    { asset: 'builtin:castle', kind: 'castle', n: Math.round(count * 0.22), scale: 1, sep: 0.65, score: (s) => (s.e > 120 && s.e < 2800 && s.flat > 8 ? livable(s) * (s.river < 10 || s.coast <= 8 ? 1.5 : 0.8) * Math.min(1, 0.3 + s.flat / 80) : 0) },
    { asset: 'builtin:watchtower', kind: 'tower', n: Math.round(count * 0.15), scale: 0.8, sep: 0.5, score: (s) => (s.e > 600 && s.e < 4200 && s.biome !== 5 ? 0.6 + Math.min(1, s.flat / 200) : 0) },
  ];
  for (const k of kinds) {
    const ranked = sites.map((s) => ({ s, v: k.score(s) * (0.75 + 0.5 * s.jitter) })).filter((r) => r.v > 0.05).sort((a, b) => b.v - a.v);
    let done = 0;
    for (const { s } of ranked) {
      if (done >= k.n) break;
      if (out.some((o) => Math.hypot(geo.deltaX(o.x, s.x), o.y - s.y) < minSep * k.sep)) continue;
      out.push(
        newObject({
          assetId: k.asset,
          x: geo.wrapX(s.x),
          y: s.y,
          size: size * k.scale,
          name: makeName(k.kind, rnd),
          layerId: 'layer-settlements',
          z: out.length + 1,
        }),
      );
      done++;
    }
  }
  return out;
}
