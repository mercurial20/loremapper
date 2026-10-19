import { track } from '../analytics';
import { evenSpacing, simplifyPath, uid } from '../core/math';
import { t } from '../i18n';
import { history } from '../model/history';
import { curveLengths, nearestOnCurve, riverCurve, widthForFlow } from '../model/rivers';
import type { MapDocument, PathFeature, Vec2, WaterSource } from '../model/types';
import { useDoc } from '../store/docStore';
import { useEditor } from '../store/editorStore';
import { clearLake, isOpenWater, lakeAt, setLake } from '../terrain/lakes';
import type { TerrainModel, TileChange } from '../terrain/TerrainModel';
import { aridityAt, climateLatAt, simulateSource, type SimRiver } from '../terrain/waterSim';
import { editor } from './Editor';

/*
 * Water sources (alpha): the water of a source runs where the land takes it. Its rivers are
 * ordinary rivers (paths that know their source) and its lakes ordinary lakes; running a source
 * again (a new size, a new place) first takes away what it made before. Every change is one
 * undo step, for the map's water and the document together.
 */

/** Dips shallower than this (m) are crossed by the river instead of filled with a lake. */
const CARVE = 4;
/** How close (cells) to another river the water must come to join it, beyond its banks. */
const JOIN = 2;

/** The rivers and the sources of the document: what running sources changes. */
export type Water = { paths: Record<string, PathFeature>; sources: Record<string, WaterSource> };

export const setWater = (w: Water) => useDoc.setState((s) => ({ doc: { ...s.doc, paths: w.paths, sources: w.sources }, revision: s.revision + 1 }));

/** A run of sources: the document before and after, and the lakes it changed (already applied). */
export interface WaterRun {
  before: Water;
  after: Water;
  changes: TileChange[];
}

/** The net evaporation a source's water meets, mm a year: its own, or the climate's at its latitude. */
export function sourceAridity(model: TerrainModel, s: Pick<WaterSource, 'at' | 'aridity'>): number {
  if (s.aridity !== null) return s.aridity;
  return Math.round(aridityAt(climateLatAt(model.planet, model.geo, s.at[1])));
}

/** Cells covered by the rivers, with the river on each (where other water joins them). */
function riverCells(model: TerrainModel, paths: Record<string, PathFeature>): Map<number, string> {
  const W = model.W;
  const out = new Map<number, string>();
  for (const p of Object.values(paths)) {
    if (p.kind !== 'river' || p.hidden || p.points.length < 2) continue;
    const r = p.width / 2 + JOIN;
    const R = Math.ceil(r);
    const c = riverCurve(p.points);
    for (let i = 0; i < c.length; i++) {
      const [x, y] = c[i];
      for (let dy = -R; dy <= R; dy++)
        for (let dx = -R; dx <= R; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const cy = Math.floor(y + dy);
          if (cy < 0 || cy >= model.H) continue;
          const cx = ((Math.floor(x + dx) % W) + W) % W;
          out.set(cy * W + cx, p.id);
        }
    }
  }
  return out;
}

/** Over this many cells below a source its river gathers its water (the brooks of its upper basin). */
const HEAD = 30;

/**
 * The course of a simulated river as a smooth line, unwrapped from `x0`, with its discharge at
 * each point. Below the source itself (`head`) the water gathers over the first stretch, so the
 * river starts as a stream and widens, as one fed by the brooks of its upper basin does.
 */
function toLine(model: TerrainModel, r: SimRiver, x0: number, head: boolean): { points: Vec2[]; flow: number[] } {
  const raw: Vec2[] = [];
  let prev = x0;
  for (const [x, y] of r.points) {
    let ux = x;
    if (model.geo.wraps) ux = prev + model.geo.deltaX(prev, x);
    raw.push([ux, y]);
    prev = ux;
  }
  const cum = curveLengths(raw);
  const total = cum[cum.length - 1] || 1;
  // water steps from cell to cell in eight directions; the river's course is that path smoothed
  // over a few cells (no straight runs at 45° with sharp turns between them), then evenly spaced
  // control points
  const points = evenSpacing(simplifyPath(smoothCourse(raw, SMOOTH), 0.3), 5) as Vec2[];
  const along = curveLengths(points);
  const all = along[along.length - 1] || 1;
  let j = 1;
  const flow = points.map((_, i) => {
    const s = (along[i] / all) * total;
    while (j < cum.length - 1 && cum[j] < s) j++;
    const u = Math.min(1, Math.max(0, (s - cum[j - 1]) / Math.max(1e-9, cum[j] - cum[j - 1])));
    const gather = head ? 0.1 + 0.9 * Math.sqrt(Math.min(1, s / Math.min(HEAD, 0.4 * total))) : 1;
    return Math.round((r.flow[j - 1] + (r.flow[j] - r.flow[j - 1]) * u) * gather * 100) / 100;
  });
  return { points, flow };
}

/** How far (cells) a river's course is smoothed along its length. */
const SMOOTH = 4;

/**
 * A line smoothed along its length: resampled every cell, each point the Gaussian-weighted mean of
 * its neighbours (`sigma` cells); the ends stay where they are.
 */
function smoothCourse(line: Vec2[], sigma: number): Vec2[] {
  if (line.length < 3) return line;
  const cum = curveLengths(line);
  const total = cum[cum.length - 1];
  const n = Math.max(2, Math.ceil(total) + 1);
  const pts: Vec2[] = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const s = (k / (n - 1)) * total;
    while (j < line.length - 1 && cum[j] < s) j++;
    const u = Math.min(1, Math.max(0, (s - cum[j - 1]) / Math.max(1e-9, cum[j] - cum[j - 1])));
    pts.push([line[j - 1][0] + (line[j][0] - line[j - 1][0]) * u, line[j - 1][1] + (line[j][1] - line[j - 1][1]) * u]);
  }
  const R = Math.ceil(3 * sigma);
  const w = Array.from({ length: R + 1 }, (_, i) => Math.exp(-((i / sigma) ** 2) / 2));
  return pts.map((p, k) => {
    // near an end the window shrinks to stay symmetric, so the end itself does not move
    const r = Math.min(R, k, n - 1 - k);
    let x = 0;
    let y = 0;
    let ws = 0;
    for (let i = -r; i <= r; i++) {
      const wi = w[Math.abs(i)];
      x += pts[k + i][0] * wi;
      y += pts[k + i][1] * wi;
      ws += wi;
    }
    return [x / ws, y / ws];
  });
}

/** Take away what a source made: its rivers and the lakes it filled. */
function unmake(model: TerrainModel, s: WaterSource, paths: Record<string, PathFeature>, changes: TileChange[]) {
  for (const p of Object.values(paths)) if (p.source === s.id) delete paths[p.id];
  const W = model.W;
  for (const k of s.made.lakes) {
    const cells = lakeAt(model, (k % W) + 0.5, Math.floor(k / W) + 0.5);
    const c = cells.length ? clearLake(model, cells) : null;
    if (c) changes.push(c);
  }
}

/** Run a source: its water's course, rivers and lakes. Returns the source with what it made. */
function make(model: TerrainModel, s: WaterSource, paths: Record<string, PathFeature>, changes: TileChange[]): WaterSource {
  const cells = riverCells(model, paths);
  const W = model.W;
  const joinRiver = (at: Vec2) => {
    const id = cells.get(Math.floor(at[1]) * W + ((Math.floor(at[0]) % W) + W) % W);
    if (!id) return null;
    const p = paths[id];
    const ref = p.points[0][0];
    const n = nearestOnCurve(riverCurve(p.points), [ref + model.geo.deltaX(ref, at[0]), at[1]]);
    return { id, t: n.t };
  };
  const seed = useDoc.getState().meta?.seed ?? 0;
  const res = simulateSource(model, { at: s.at, q: s.q, aridity: sourceAridity(model, s), seepage: 0, carve: CARVE, seed }, joinRiver);
  const lakes: number[] = [];
  for (const l of res.lakes) {
    const c = setLake(model, l.cells, l.level);
    if (c) changes.push(c);
    // a cell of it to find it by later: its deepest
    let deep = l.cells[0];
    for (const k of l.cells) if (model.heightAt((k % W) + 0.5, Math.floor(k / W) + 0.5) < model.heightAt((deep % W) + 0.5, Math.floor(deep / W) + 0.5)) deep = k;
    lakes.push(deep);
  }
  const color = useEditor.getState().pathDefaults.river.color;
  const cellKm = model.geo.kmPerCellY;
  let x0 = s.at[0];
  res.rivers.forEach((r, i) => {
    const { points, flow } = toLine(model, r, x0, i === 0 && !r.fromLake);
    x0 = points[points.length - 1][0];
    if (points.length < 2) return;
    const id = `${s.id}-r${i}`;
    paths[id] = {
      id,
      kind: 'river',
      points,
      width: widthForFlow(Math.max(...flow), cellKm),
      color,
      style: 'solid',
      taper: false,
      outlet: r.join ? { kind: 'path', id: r.join.id, t: r.join.t } : r.to === 'water' ? { kind: 'water' } : undefined,
      source: s.id,
      flow,
      name: paths[id]?.name ?? '',
      hidden: false,
      locked: false,
    };
  });
  // where its water goes, so an edit of the ground there runs it again
  let box: [number, number, number, number] = [s.at[0], s.at[1], s.at[0], s.at[1]];
  const grow = (x: number, y: number) => (box = [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)]);
  for (const p of Object.values(paths)) if (p.source === s.id) for (const [x, y] of p.points) grow(x, y);
  for (const l of res.lakes)
    for (const k of l.cells) {
      const x = (k % W) + 0.5;
      grow(s.at[0] + model.geo.deltaX(s.at[0], x), Math.floor(k / W) + 0.5);
    }
  return { ...s, made: { lakes, marshes: res.marshes.map((m) => ({ x: m.x, y: m.y, r: m.r })), end: res.end, box } };
}

/**
 * Change the sources and run the ones affected (and those whose water joins what they made), as
 * one undo step. `removed` are sources taken away (with what they made).
 */
function changeSources(label: string, next: Record<string, WaterSource>, run: string[], removed: WaterSource[] = []) {
  const model = editor.model;
  if (!model) return;
  const { before, after, changes } = runSources(model, next, run, removed);
  let bytes = 4096;
  for (const c of changes) for (const v of [...c.before.values(), ...c.after.values()]) bytes += v?.byteLength ?? 0;
  history.push({
    label,
    cost: bytes,
    undo: () => {
      for (const c of changes.slice().reverse()) model.applyTiles(c, 'before');
      setWater(before);
    },
    redo: () => {
      for (const c of changes) model.applyTiles(c, 'after');
      setWater(after);
    },
  });
  track('first_edit');
}

/** Run sources (and those whose water joins theirs) with the document's sources set to `next`. */
function runSources(model: TerrainModel, next: Record<string, WaterSource>, run: string[], removed: WaterSource[] = []): WaterRun {
  const before: Water = { paths: useDoc.getState().doc.paths, sources: useDoc.getState().doc.sources };
  const paths = { ...before.paths };
  const sources = { ...next };
  const changes: TileChange[] = [];
  // sources whose rivers join the rivers of those that run again: their joins move, so they run too
  const todo = new Set(run.filter((id) => sources[id]));
  const gone = new Set([...todo, ...removed.map((s) => s.id)]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const p of Object.values(paths)) {
      if (!p.source || gone.has(p.source) || !sources[p.source] || p.outlet?.kind !== 'path') continue;
      const into = paths[p.outlet.id]?.source;
      if (into && gone.has(into)) {
        gone.add(p.source);
        todo.add(p.source);
        grew = true;
      }
    }
  }
  // what they made goes first (latest first, so lakes laid over others come off cleanly)
  for (const s of removed) unmake(model, s, paths, changes);
  for (const id of todo) unmake(model, before.sources[id] ?? sources[id], paths, changes);
  // then they run again, each joining the rivers that are there
  for (const id of todo) sources[id] = make(model, sources[id], paths, changes);
  const after: Water = { paths, sources };
  setWater(after);
  return { before, after, changes };
}

/** The cells an edit of the ground changed, as a rectangle (null when nothing changed). */
function changedRect(model: TerrainModel, change: TileChange): [number, number, number, number] | null {
  const g = model.height;
  const TS = g.TS;
  let r: [number, number, number, number] | null = null;
  for (const [key, after] of change.after) {
    const before = change.before.get(key) ?? null;
    const [tx, ty] = g.tileXY(key);
    for (let i = 0; i < TS * TS; i++) {
      const a = after ? after[i] : NaN;
      const b = before ? before[i] : NaN;
      if (a === b || (Number.isNaN(a) && Number.isNaN(b))) continue;
      const x = tx * TS + (i % TS);
      const y = ty * TS + Math.floor(i / TS);
      r = r ? [Math.min(r[0], x), Math.min(r[1], y), Math.max(r[2], x), Math.max(r[3], y)] : [x, y, x, y];
    }
  }
  return r;
}

/** How close (cells) an edit of the ground must come to a source's water to run it again. */
const FOLLOW = 3;

/**
 * Sources whose water an edit of the ground touches run again: a hill raised across a river
 * dams it into a lake that spills where it can, ground lowered beside it may take it another
 * way. Returns the run (applied) to fold into the edit's undo step, or null.
 */
export function sourcesFollowGround(model: TerrainModel, changes: TileChange[]): WaterRun | null {
  const sources = useDoc.getState().doc.sources;
  const list = Object.values(sources);
  if (!list.length) return null;
  const rects = changes.filter((c) => c.layer === 'height').map((c) => changedRect(model, c)).filter((r): r is [number, number, number, number] => !!r);
  if (!rects.length) return null;
  const W = model.W;
  const touched = (box: [number, number, number, number]) =>
    rects.some(([x0, y0, x1, y1]) => {
      if (box[1] - FOLLOW > y1 || box[3] + FOLLOW < y0) return false;
      // a planet wraps: the box may lie a turn east or west of the edit
      for (const s of model.geo.wraps ? [-W, 0, W] : [0]) if (box[0] - FOLLOW <= x1 + s && box[2] + FOLLOW >= x0 + s) return true;
      return false;
    });
  const hit = list.filter((s) => touched(s.made.box ?? [s.at[0], s.at[1], s.at[0], s.at[1]])).map((s) => s.id);
  if (!hit.length) return null;
  return runSources(model, sources, hit);
}

/** Whether water can come out at a point (on land, not in the sea or a lake). */
export function canPlaceSource(at: Vec2): boolean {
  const model = editor.model;
  if (!model) return false;
  const x = model.geo.wrapX(at[0]);
  return at[1] >= 0 && at[1] < model.H && model.heightAt(x, at[1]) >= model.seaLevel && !isOpenWater(model, x, at[1]);
}

/** Place a new source; returns its id (null where no water can come out). */
export function addSource(at: Vec2, q: number): string | null {
  if (!canPlaceSource(at)) {
    useEditor.getState().notify(t('A source has to be on land, not in the water'));
    return null;
  }
  const sources = useDoc.getState().doc.sources;
  const n = Object.keys(sources).length;
  const s: WaterSource = { id: uid('source-'), name: t('Source {n}', { n: n + 1 }), at, q, aridity: null, made: { lakes: [], marshes: [], end: 'dry' }, locked: false };
  changeSources(t('Add a water source'), { ...sources, [s.id]: s }, [s.id]);
  return s.id;
}

/** Change a source's settings (or move it) and run it again. */
export function updateSource(id: string, patch: Partial<Pick<WaterSource, 'at' | 'q' | 'aridity' | 'name'>>) {
  const sources = useDoc.getState().doc.sources;
  const s = sources[id];
  if (!s) return;
  if (patch.at && !canPlaceSource(patch.at)) {
    useEditor.getState().notify(t('A source has to be on land, not in the water'));
    return;
  }
  const next = { ...sources, [id]: { ...s, ...patch } };
  // a new name changes nothing on the map
  if (Object.keys(patch).every((k) => k === 'name')) {
    useDoc.getState().commit(t('Rename a water source'), () => ({ sources: next }), 'source-name-' + id);
    return;
  }
  changeSources(patch.at ? t('Move a water source') : t('Change a water source'), next, [id]);
}

type Removable = Pick<MapDocument, 'objects' | 'paths' | 'territories' | 'labels' | 'sources'>;
const removable = (d: MapDocument): Removable => ({ objects: d.objects, paths: d.paths, territories: d.territories, labels: d.labels, sources: d.sources });

/**
 * Remove sources with the rivers and lakes they made, as one undo step; `also` removes other
 * things in the same step (the rest of a selection being deleted).
 */
export function removeSources(ids: string[], label: string, also?: (d: MapDocument) => Partial<Removable>) {
  const model = editor.model;
  if (!model || useEditor.getState().readOnly) return;
  const set = (c: Removable) => useDoc.setState((s) => ({ doc: { ...s.doc, ...c }, revision: s.revision + 1 }));
  const before = removable(useDoc.getState().doc);
  if (also) useDoc.setState((s) => ({ doc: { ...s.doc, ...also(s.doc) }, revision: s.revision + 1 }));
  const sources = useDoc.getState().doc.sources;
  const gone = ids.map((id) => sources[id]).filter((s): s is WaterSource => !!s);
  const next = { ...sources };
  for (const s of gone) delete next[s.id];
  const { changes } = runSources(model, next, [], gone);
  const after = removable(useDoc.getState().doc);
  let bytes = 4096;
  for (const c of changes) for (const v of [...c.before.values(), ...c.after.values()]) bytes += v?.byteLength ?? 0;
  history.push({
    label,
    cost: bytes,
    undo: () => {
      for (const c of changes.slice().reverse()) model.applyTiles(c, 'before');
      set(before);
    },
    redo: () => {
      for (const c of changes) model.applyTiles(c, 'after');
      set(after);
    },
  });
  const active = useEditor.getState().activeSource;
  if (active && ids.includes(active)) useEditor.getState().set({ activeSource: null });
  track('first_edit');
}

/** Remove a source with the rivers and lakes it made. */
export function deleteSource(id: string) {
  removeSources([id], t('Delete a water source'));
}

/** Remove every source with its rivers and lakes. */
export function deleteAllSources() {
  const ids = Object.keys(useDoc.getState().doc.sources);
  if (ids.length) removeSources(ids, t('Delete all water sources'));
}

/** Run every source again (after the ground changed in ways no edit told them, say). */
export function rerunAllSources() {
  const sources = useDoc.getState().doc.sources;
  const ids = Object.keys(sources);
  if (ids.length) changeSources(t('Run the water sources again'), sources, ids);
}

/** Keep what a source made as ordinary rivers and lakes; the source itself goes. */
export function detachSource(id: string) {
  const { sources, paths } = useDoc.getState().doc;
  if (!sources[id]) return;
  const nextSources = { ...sources };
  delete nextSources[id];
  const nextPaths = { ...paths };
  for (const p of Object.values(paths))
    if (p.source === id) {
      const { source: _s, ...rest } = p;
      nextPaths[p.id] = rest;
    }
  if (useEditor.getState().activeSource === id) useEditor.getState().set({ activeSource: null });
  useDoc.getState().commit(t('Keep the rivers, remove their source'), () => ({ sources: nextSources, paths: nextPaths }));
}

/** The source nearest to a point within `maxDist` cells. */
export function sourceAt(p: Vec2, maxDist: number): string | null {
  const model = editor.model;
  if (!model) return null;
  let best: string | null = null;
  let bd = maxDist;
  for (const s of Object.values(useDoc.getState().doc.sources)) {
    const d = Math.hypot(model.geo.deltaX(p[0], s.at[0]), s.at[1] - p[1]);
    if (d <= bd) {
      bd = d;
      best = s.id;
    }
  }
  return best;
}
