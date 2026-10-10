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
    w.onmessage = (e: MessageEvent<Geography>) => {
      w.terminate();
      resolve(e.data);
    };
    w.onerror = () => {
      w.terminate();
      resolve(null);
    };
    const g = model.height;
    const tiles = [...g.tiles.entries()].map(([k, data]) => ({ tx: k % g.NX, ty: Math.floor(k / g.NX), data: data as Float32Array }));
    const req: GeographyRequest = { tiles, tileSize: g.TS, defaultHeight: g.defaultValue, W: model.W, H: model.H, surface: model.geo.flat ? { kind: 'flat', cellKm: model.geo.cellKm } : { kind: 'planet', radiusKm: model.planet.radiusKm }, seaLevel: sea };
    // tiles are copied by structured clone (a fast memory copy); the editor keeps its own
    w.postMessage(req);
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

/** The tool that answers "what is here?": Info in the editor, a tap (Select) in the viewer. */
const asksWhatIsHere = (st: { tool: string; readOnly: boolean }) => st.tool === 'info' || (st.readOnly && st.tool === 'select');

/**
 * Re-measure after terrain edits while something shows the results — or
 * ahead of time while the Info tool is active, so hover and click answer at once.
 */
export function refreshGeographyIfShown() {
  const st = useEditor.getState();
  if (st.inspect || st.geoListOpen || asksWhatIsHere(st)) void ensureGeography();
}

function publish(g: Geography) {
  const st = useEditor.getState();
  let inspect = st.inspect;
  if (inspect) {
    // find the inspected region again from its anchor
    const r = regionAt(g, inspect.anchorX, inspect.anchorY);
    inspect = r && r.land === inspect.land ? { ...inspect, id: r.id } : null;
  }
  st.set({ geography: { land: g.land, water: g.water, landKm2: g.landKm2, mapKm2: g.mapKm2 }, inspect });
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

/** Show a region's shoreline on the map (the world ocean's would trace every coast, so it has none). */
function setOutline(r: RegionInfo | null) {
  const g = current?.geo;
  const lines = r && g && !(r.kind === 'ocean' && !r.land) ? r.outlines.map((n) => g.outlines[n].pts) : null;
  editor.layers?.overlay.set({ region: lines });
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
  if (asksWhatIsHere(s) && s.tool !== prev.tool && editor.model) void ensureGeography();
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

// display helpers used by the geography panels
export { formatArea, formatHeight, formatLength as formatDistance } from '../core/units';
export { setUnits } from '../store/editorStore';
