import { polygonCentroid, uid } from '../core/math';
import type { MapLabel, RegionName, Vec2 } from '../model/types';
import { STYLE_PRESETS } from '../render/styles';
import { useDoc } from '../store/docStore';
import { useEditor } from '../store/editorStore';
import type { Geography, RegionInfo, RegionKind } from '../terrain/geography';
import type { GeographyRequest } from '../terrain/geography.worker';
import { addFeature } from './commands';
import { editor } from './Editor';

/**
 * Landmasses and water bodies of the current map, measured in a worker and
 * cached until the terrain or the sea level changes.
 */
let current: { geo: Geography; revision: number; sea: number; model: unknown } | null = null;
let pending: { revision: number; promise: Promise<Geography | null> } | null = null;

export function resetGeography() {
  current = null;
  pending = null;
  useEditor.getState().set({ geography: null, inspect: null });
  if (editor.layers) setOutline(null);
}

/** The latest measurement if it still matches the terrain. */
export function freshGeography(): Geography | null {
  const m = editor.model;
  if (!m || !current || current.model !== m || current.revision !== m.revision.height || current.sea !== m.seaLevel) return null;
  return current.geo;
}

/** Measure the map (or reuse the last measurement). */
export function ensureGeography(): Promise<Geography | null> {
  const model = editor.model;
  if (!model) return Promise.resolve(null);
  const fresh = freshGeography();
  if (fresh) return Promise.resolve(fresh);
  const revision = model.revision.height;
  if (pending && pending.revision === revision) return pending.promise;
  useEditor.getState().set({ geoBusy: true });
  const sea = model.seaLevel;
  const promise = new Promise<Geography | null>((resolve) => {
    const w = new Worker(new URL('../terrain/geography.worker.ts', import.meta.url), { type: 'module' });
    const height = model.height.toFull((n) => new Float32Array(n));
    w.onmessage = (e: MessageEvent<Geography>) => {
      w.terminate();
      resolve(e.data);
    };
    w.onerror = () => {
      w.terminate();
      resolve(null);
    };
    const req: GeographyRequest = { height, W: model.W, H: model.H, radiusKm: model.planet.radiusKm, seaLevel: sea };
    w.postMessage(req, [height.buffer]);
  }).then((geo) => {
    if (pending?.revision !== revision || editor.model !== model) return geo;
    pending = null;
    if (geo) {
      current = { geo, revision, sea, model };
      publish(geo);
    }
    useEditor.getState().set({ geoBusy: false });
    return geo;
  });
  pending = { revision, promise };
  return promise;
}

/** Re-measure after terrain edits, but only while something on screen shows the results. */
export function refreshGeographyIfShown() {
  const st = useEditor.getState();
  if (st.inspect || st.geoListOpen) void ensureGeography();
}

function publish(g: Geography) {
  const st = useEditor.getState();
  let inspect = st.inspect;
  if (inspect) {
    // find the inspected region again from its anchor
    const r = regionAt(g, inspect.anchorX, inspect.anchorY);
    inspect = r && r.land === inspect.land ? { ...inspect, id: r.id } : null;
  }
  st.set({ geography: { land: g.land, water: g.water, landKm2: g.landKm2, planetKm2: g.planetKm2 }, inspect });
  setOutline(inspect ? regionOf(g, inspect.land, inspect.id) : null);
}

function regionOf(g: Geography, land: boolean, id: number): RegionInfo | null {
  return (land ? g.land[id] : g.water[id]) ?? null;
}

export function regionAt(g: Geography, x: number, y: number): RegionInfo | null {
  const i = ((Math.floor(x) % g.W) + g.W) % g.W;
  const j = Math.min(g.H - 1, Math.max(0, Math.floor(y)));
  const l = g.labels[j * g.W + i];
  return l >= 0 ? g.land[l] : g.water[-l - 1];
}

/** Show the landmass or water body under a map position in the inspector. */
export async function inspectAt(x: number, y: number) {
  const g = await ensureGeography();
  if (!g) return;
  const r = regionAt(g, x, y);
  if (!r || useEditor.getState().selection.length) return;
  select(r, x, y);
}

/** Inspect a region (from the list) and fly to it. */
export function showRegion(r: RegionInfo) {
  const g = freshGeography();
  if (!g) return;
  useEditor.getState().select([]);
  select(r, r.anchorX, r.anchorY);
  const rd = editor.renderer;
  if (!rd) return;
  const cam = rd.camera;
  const w = Math.max(8, r.x1 - r.x0);
  const h = Math.max(8, r.y1 - r.y0);
  const zoom = Math.min(cam.viewW / (w * 1.25), cam.viewH / (h * 1.25), 6);
  cam.centerOn((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, zoom);
  rd.viewChanged();
}

function select(r: RegionInfo, ax: number, ay: number) {
  useEditor.getState().set({ inspect: { land: r.land, id: r.id, anchorX: ax, anchorY: ay }, inspectorOpen: true });
  setOutline(r);
}

export function clearInspect() {
  useEditor.getState().set({ inspect: null });
  setOutline(null);
}

/**
 * Outline of a region: marching squares on its cells (corners at cell
 * centres), as line segments [x1, y1, x2, y2, …] in world cells. The world
 * ocean is left without an outline: it would trace every coast on the planet.
 */
function outline(g: Geography, r: RegionInfo): Float32Array | null {
  if (!r.land && r.kind === 'ocean') return null;
  const target = r.land ? r.id : -(r.id + 1);
  const { W, H, labels } = g;
  const inside = (i: number, j: number) => j >= 0 && j < H && labels[j * W + (((i % W) + W) % W)] === target;
  const seg: number[] = [];
  const i0 = Math.floor(r.x0) - 1;
  const i1 = Math.ceil(r.x1) + 1;
  const j0 = Math.max(-1, Math.floor(r.y0) - 1);
  const j1 = Math.min(H, Math.ceil(r.y1) + 1);
  for (let j = j0; j < j1; j++)
    for (let i = i0; i < i1; i++) {
      // corners: a = (i, j), b = (i + 1, j), c = (i + 1, j + 1), d = (i, j + 1), at cell centres
      const a = inside(i, j) ? 1 : 0;
      const b = inside(i + 1, j) ? 2 : 0;
      const c = inside(i + 1, j + 1) ? 4 : 0;
      const d = inside(i, j + 1) ? 8 : 0;
      const code = a | b | c | d;
      if (code === 0 || code === 15) continue;
      const x = i + 0.5;
      const y = j + 0.5;
      const top: Vec2 = [x + 0.5, y];
      const right: Vec2 = [x + 1, y + 0.5];
      const bottom: Vec2 = [x + 0.5, y + 1];
      const left: Vec2 = [x, y + 0.5];
      const add = (p: Vec2, q: Vec2) => seg.push(p[0], p[1], q[0], q[1]);
      switch (code) {
        case 1:
        case 14:
          add(left, top);
          break;
        case 2:
        case 13:
          add(top, right);
          break;
        case 3:
        case 12:
          add(left, right);
          break;
        case 4:
        case 11:
          add(right, bottom);
          break;
        case 6:
        case 9:
          add(top, bottom);
          break;
        case 7:
        case 8:
          add(left, bottom);
          break;
        case 5:
          add(left, top);
          add(right, bottom);
          break;
        case 10:
          add(top, right);
          add(left, bottom);
          break;
      }
    }
  return Float32Array.from(seg);
}

function setOutline(r: RegionInfo | null) {
  const g = current?.geo;
  editor.layers?.overlay.set({ region: r && g ? outline(g, r) : null });
  editor.requestRender();
}

/** The landmass / water body shown in the inspector, if any (React hook). */
export function useInspectedRegion(): RegionInfo | null {
  const inspect = useEditor((s) => s.inspect);
  const geography = useEditor((s) => s.geography);
  if (!inspect || !geography) return null;
  return (inspect.land ? geography.land[inspect.id] : geography.water[inspect.id]) ?? null;
}

// selecting something else (or anything that clears `inspect`) removes the outline
useEditor.subscribe((s, prev) => {
  if (!s.inspect && prev.inspect) setOutline(null);
});

// ---------------------------------------------------------------- names

const KIND_LABEL: Record<RegionKind, string> = { continent: 'Continent', island: 'Island', islet: 'Islet', ocean: 'Ocean', sea: 'Inland sea', lake: 'Lake' };
export const kindLabel = (k: RegionKind) => KIND_LABEL[k];

/** A name pinned inside this region, if any. */
export function regionName(g: Geography, r: RegionInfo, names: Record<string, RegionName>): RegionName | null {
  for (const n of Object.values(names)) {
    const at = regionAt(g, n.x, n.y);
    if (at && at.land === r.land && at.id === r.id) return n;
  }
  return null;
}

/** Placeholder name: kind and rank by size, e.g. "Continent 2". */
export function defaultName(g: { land: RegionInfo[]; water: RegionInfo[] }, r: RegionInfo): string {
  const list = r.land ? g.land : g.water;
  if (r.kind === 'ocean') return 'World ocean';
  let rank = 0;
  for (const x of list) {
    if (x.kind === r.kind) rank++;
    if (x === r || x.id === r.id) break;
  }
  return `${KIND_LABEL[r.kind]} ${rank}`;
}

export function setRegionName(r: RegionInfo, name: string) {
  const g = freshGeography();
  if (!g) return;
  const existing = regionName(g, r, useDoc.getState().doc.regionNames);
  const entry: RegionName = existing ? { ...existing, name } : { id: uid('region-'), x: r.anchorX, y: r.anchorY, name };
  useDoc.getState().commit(
    'Rename region',
    (d) => {
      const regionNames = { ...d.regionNames };
      if (name.trim()) regionNames[entry.id] = entry;
      else delete regionNames[entry.id];
      return { regionNames };
    },
    `region-name:${entry.id}`,
  );
}

/** Write the region's name on the map as a regular, editable label. */
export function labelRegion(r: RegionInfo, text: string) {
  const doc = useDoc.getState().doc;
  const style = STYLE_PRESETS[doc.view.style];
  const span = Math.max(r.x1 - r.x0, (r.y1 - r.y0) * 1.5);
  const l: MapLabel = {
    id: uid('label-'),
    text,
    x: r.cx,
    y: r.cy,
    size: Math.min(80, Math.max(1.5, span * 0.045)),
    font: r.land ? 'display' : 'script',
    color: r.land ? style.labelColor : '#2f5874',
    rotation: 0,
    letterSpacing: r.land ? 0.25 : 0.08,
    uppercase: r.land,
    italic: !r.land,
    halo: true,
    curve: 0,
    opacity: 1,
    hidden: false,
    locked: false,
  };
  addFeature('label', l, 'Label region');
  useEditor.getState().select([{ kind: 'label', id: l.id }]);
}

// ---------------------------------------------------------------- territories

/** Land area (km²) inside a closed outline, and how it splits between landmasses. */
export function landInside(g: Geography, poly: Vec2[], cellArea: (y: number) => number): { km2: number; byRegion: Map<number, number> } {
  const byRegion = new Map<number, number>();
  let km2 = 0;
  if (poly.length < 3) return { km2, byRegion };
  let ymin = Infinity;
  let ymax = -Infinity;
  for (const [, y] of poly) {
    ymin = Math.min(ymin, y);
    ymax = Math.max(ymax, y);
  }
  const xs: number[] = [];
  for (let j = Math.max(0, Math.floor(ymin)); j <= Math.min(g.H - 1, Math.ceil(ymax)); j++) {
    const y = j + 0.5;
    xs.length = 0;
    for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
      const [x1, y1] = poly[b];
      const [x2, y2] = poly[a];
      if (y1 <= y !== y2 <= y) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
    }
    xs.sort((p, q) => p - q);
    const area = cellArea(y);
    for (let s = 0; s + 1 < xs.length; s += 2)
      for (let i = Math.ceil(xs[s] - 0.5); i <= Math.floor(xs[s + 1] - 0.5); i++) {
        const l = g.labels[j * g.W + (((i % g.W) + g.W) % g.W)];
        if (l < 0) continue;
        km2 += area;
        byRegion.set(l, (byRegion.get(l) ?? 0) + area);
      }
  }
  return { km2, byRegion };
}

/** Territories whose centre lies on this landmass. */
export function realmsOn(g: Geography, r: RegionInfo): string[] {
  const out: string[] = [];
  for (const t of Object.values(useDoc.getState().doc.territories)) {
    const [x, y] = polygonCentroid(t.points);
    const at = regionAt(g, x, y);
    if (at && at.land === r.land && at.id === r.id) out.push(t.name || 'Unnamed territory');
  }
  return out;
}

// ---------------------------------------------------------------- units

const MI2 = 0.386102;
const MI = 0.621371;

export function formatArea(km2: number, units: 'metric' | 'imperial'): string {
  const v = units === 'imperial' ? km2 * MI2 : km2;
  const u = units === 'imperial' ? 'mi²' : 'km²';
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 1 : 2)}M ${u}`;
  if (v >= 100) return `${Math.round(v).toLocaleString('en-US')} ${u}`;
  return `${v.toFixed(1)} ${u}`;
}

export function formatDistance(km: number, units: 'metric' | 'imperial'): string {
  const v = units === 'imperial' ? km * MI : km;
  return `${Math.round(v).toLocaleString('en-US')} ${units === 'imperial' ? 'mi' : 'km'}`;
}

/** Heights and depths: metres, or feet in imperial units. */
export function formatHeight(m: number, units: 'metric' | 'imperial'): string {
  return units === 'imperial' ? `${Math.round(m * 3.28084).toLocaleString('en-US')} ft` : `${Math.round(m).toLocaleString('en-US')} m`;
}

export function setUnits(units: 'metric' | 'imperial') {
  useEditor.getState().set({ units });
  try {
    localStorage.setItem('loremapper.units', units);
  } catch {
    // remembering the choice is a convenience only
  }
}
