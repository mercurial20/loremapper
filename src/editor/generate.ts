import { mulberry32, simplifyPath, uid } from '../core/math';
import { BIOME_CHANNELS } from '../core/planet';
import { history } from '../model/history';
import type { MapDocument, MapObject, PathFeature } from '../model/types';
import { useDoc } from '../store/docStore';
import { useEditor } from '../store/editorStore';
import type { GenParams, GenResult, GenType } from '../terrain/generator';
import type { RasterArray } from '../terrain/TileGrid';
import type { TileChange } from '../terrain/TerrainModel';
import { editor } from './Editor';
import { newObject } from './commands';

export interface GenerateOptions {
  type: GenType;
  seed: number;
  landFraction: number;
  mountains: number;
  roughness: number;
  biomes: boolean;
  rivers: boolean;
  settlements: boolean;
  /** island / archipelago: generate into the visible area */
  region: 'view' | 'world';
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

function runWorker(p: GenParams): Promise<GenResult> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('../terrain/generator.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<{ ok: boolean; result?: GenResult; error?: string }>) => {
      w.terminate();
      if (e.data.ok) resolve(e.data.result!);
      else reject(new Error(e.data.error));
    };
    w.onerror = (e) => {
      w.terminate();
      reject(new Error(e.message));
    };
    w.postMessage(p);
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
  const r = editor.renderer!;
  const p = model.planet;
  const st = useEditor.getState();
  const whole = o.type === 'continents' || o.type === 'pangaea' || o.region === 'world';
  let region: GenParams['region'] = null;
  if (!whole) {
    const v = r.camera.visible;
    region = { x0: v.x0, y0: Math.max(0, v.y0), x1: v.x1, y1: Math.min(model.H, v.y1) };
  }
  st.set({ busy: 'Generating terrain…' });
  try {
    const res = await runWorker({
      type: o.type,
      seed: o.seed,
      W: model.W,
      H: model.H,
      landFraction: o.landFraction,
      mountains: o.mountains,
      roughness: o.roughness,
      seaLevel: p.seaLevel,
      maxElevation: p.maxElevation,
      minElevation: p.minElevation,
      oceanFloor: p.oceanFloor,
      region,
      biomes: o.biomes,
      rivers: o.rivers ? (whole ? 28 : 6) : 0,
    });
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

    // vector additions
    const before = useDoc.getState().doc;
    const paths = { ...before.paths };
    const objects = { ...before.objects };
    const cellKm = model.geo.kmPerCellY;
    for (const pts of res.rivers) {
      const simp = simplifyPath(pts, 0.8);
      if (simp.length < 2) continue;
      const shift = model.geo.wrapX(simp[0][0]) - simp[0][0];
      const f: PathFeature = {
        id: uid('path-'),
        kind: 'river',
        points: simp.map(([x, y]) => [x + shift, y]),
        width: Math.max(0.6, 9 / cellKm),
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
      const placed = scatterSettlements(whole ? 26 : 7, res.region, o.seed);
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
    useEditor.getState().notify('Generation failed: ' + (e instanceof Error ? e.message : String(e)), 'error');
  } finally {
    useEditor.getState().set({ busy: null });
  }
}

/** Place named castles, cities, villages and towers on suitable land. */
function scatterSettlements(count: number, region: GenResult['region'], seed: number): MapObject[] {
  const model = editor.model!;
  const sea = model.seaLevel;
  const rnd = mulberry32(seed ^ 0x9e3779b9);
  const out: MapObject[] = [];
  const minSep = Math.max(region.w, region.h) / (Math.sqrt(count) * 2.2);
  const size = Math.max(2.5, Math.min(region.w, region.h) / 48);
  const kinds: { asset: string; kind: 'town' | 'castle' | 'tower'; n: number; ok: (e: number, flat: number) => boolean; scale: number }[] = [
    { asset: 'builtin:city-capital', kind: 'town', n: Math.max(1, Math.round(count * 0.08)), ok: (e, f) => e > 20 && e < 900 && f < 120, scale: 1.4 },
    { asset: 'builtin:castle', kind: 'castle', n: Math.round(count * 0.22), ok: (e) => e > 400 && e < 3500, scale: 1 },
    { asset: 'builtin:village', kind: 'town', n: Math.round(count * 0.45), ok: (e, f) => e > 10 && e < 1200 && f < 180, scale: 0.9 },
    { asset: 'builtin:watchtower', kind: 'tower', n: Math.round(count * 0.15), ok: (e) => e > 900 && e < 4000, scale: 0.8 },
  ];
  for (const k of kinds) {
    let done = 0;
    for (let tries = 0; tries < 900 && done < k.n; tries++) {
      const x = region.x0 + rnd() * region.w;
      const y = region.y0 + 8 + rnd() * Math.max(1, region.h - 16);
      const h = model.heightAt(x, y);
      const e = h - sea;
      const flat = Math.abs(model.heightAt(x + 2, y) - h) + Math.abs(model.heightAt(x, y + 2) - h);
      if (e <= 0 || !k.ok(e, flat)) continue;
      if (out.some((o) => Math.hypot(model.geo.deltaX(o.x, x), o.y - y) < minSep)) continue;
      out.push(
        newObject({
          assetId: k.asset,
          x: model.geo.wrapX(x),
          y,
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
