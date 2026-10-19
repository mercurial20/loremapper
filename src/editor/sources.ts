import { track } from '../analytics';
import { evenSpacing, simplifyPath, smoothstep, uid } from '../core/math';
import { meander, oxbowsFrom } from '../terrain/meander';
import { t } from '../i18n';
import { history } from '../model/history';
import { curveLengths, nearestOnCurve, riverCurve, widthForFlow } from '../model/rivers';
import type { MapDocument, PathFeature, Vec2, WaterSource } from '../model/types';
import { useDoc } from '../store/docStore';
import { useEditor } from '../store/editorStore';
import { clearLake, isOpenWater, lakeAt, setLake } from '../terrain/lakes';
import { isLake, type TerrainModel, type TileChange } from '../terrain/TerrainModel';
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
    if (p.kind !== 'river' || p.hidden || p.oxbow || p.points.length < 2) continue;
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
 * The course of a simulated river, smoothed and resampled every cell, unwrapped from `x0`, and
 * its discharge at a distance along it. Below the source itself (`head`) the water gathers over
 * the first stretch, so the river starts as a stream and widens.
 */
function toCourse(model: TerrainModel, r: SimRiver, x0: number, head: boolean): { course: Vec2[]; flowAt: (s: number) => number } {
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
  // water steps from cell to cell; the river's course is that path smoothed over a few cells
  const course = smoothCourse(raw, SMOOTH);
  const len = curveLengths(course).at(-1) || 1;
  const flowAt = (sc: number) => {
    // (along the smoothed course, as far along the raw one)
    const s = (Math.min(Math.max(sc, 0), len) / len) * total;
    let lo = 1;
    let hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < s) lo = mid + 1;
      else hi = mid;
    }
    const j = Math.max(1, lo);
    const u = Math.min(1, Math.max(0, (s - cum[j - 1]) / Math.max(1e-9, cum[j] - cum[j - 1])));
    const gather = head ? 0.1 + 0.9 * Math.sqrt(Math.min(1, s / Math.min(HEAD, 0.4 * total))) : 1;
    return Math.round((r.flow[j - 1] + (r.flow[j] - r.flow[j - 1]) * u) * gather * 100) / 100;
  };
  return { course, flowAt };
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

/**
 * A simulated river as it is drawn: its course meanders where its floodplain is flat (the
 * steeper the reach, the straighter), held at its ends and under lakes, never out into the sea or
 * a lake or up the valley side; the loops it once made are left beside it as oxbow lakes.
 */
function winding(model: TerrainModel, r: SimRiver, x0: number, head: boolean, key: string, others: Set<number>): { points: Vec2[]; flow: number[]; oxbows: { points: Vec2[]; width: number }[] } {
  const { course, flowAt } = toCourse(model, r, x0, head);
  const cellKm = model.geo.kmPerCellY;
  const total = curveLengths(course).at(-1) || 0;
  const n = course.length;
  if (n < 3 || total < 4) return { ...lineOf(course, flowAt, total), oxbows: [] };
  // the ground along the course, and its slope
  const at = (s: number): Vec2 => course[Math.min(n - 1, Math.max(0, Math.round((s / total) * (n - 1))))];
  const ground = course.map(([x, y]) => model.heightAt(model.geo.wrapX(x), y));
  const groundAt = (s: number) => ground[Math.min(n - 1, Math.max(0, Math.round((s / total) * (n - 1))))];
  let qmax = 0;
  for (let k = 0; k <= 20; k++) qmax = Math.max(qmax, flowAt((k / 20) * total));
  const wMax = widthForFlow(qmax, cellKm);
  const width = (s: number) => Math.max(0.25, wMax * Math.pow(Math.max(0, flowAt(s)) / Math.max(1e-6, qmax), 0.4));
  const span = 5;
  const mobility = (s: number) => {
    const w = width(s);
    // held at its ends (the source, a mouth, a join)
    const ends = Math.min(1, s / (3 * w), (total - s) / (3 * w));
    if (ends <= 0) return 0;
    const [x, y] = at(s);
    if (isOpenWater(model, model.geo.wrapX(x), y)) return 0;
    // the steeper the reach, the straighter (lowland rivers wind at slopes below about 0.3 m a km)
    const slope = Math.max(0, groundAt(s - span) - groundAt(s + span)) / (2 * span * cellKm * 1000);
    return Math.min(1, ends) * (1 - smoothstep(3e-4, 3e-3, slope));
  };
  // how far above its course it may wander up the floodplain (more on a coarse map, whose cells
  // hold more relief than a floodplain has)
  const rise = (s: number) => 3 + 1.5e-3 * width(s) * cellKm * 1000;
  // the ground of the cells it may move over (NaN: water), as it is asked for
  const cellGround = new Map<number, number>();
  const W = model.W;
  const groundOf = (x: number, y: number) => {
    const cx = ((Math.floor(x) % W) + W) % W;
    const k = Math.floor(y) * W + cx;
    let g = cellGround.get(k);
    if (g === undefined) {
      g = model.height.get(cx, Math.floor(y));
      const lv = model.lake.get(cx, Math.floor(y));
      if (g < model.seaLevel || (isLake(lv) && lv > g)) g = NaN;
      cellGround.set(k, g);
    }
    return g;
  };
  const allowed = (x: number, y: number, s: number) => {
    if (y < 0 || y >= model.H) return false;
    const g = groundOf(x, y);
    // (and never over another river or an oxbow lake)
    return g === g && g <= groundAt(s) + rise(s) && !others.has(Math.floor(y) * W + (((Math.floor(x) % W) + W) % W));
  };
  const seed = hashKey(key);
  // a map draws a brook's bends no smaller than a river's about a cell wide (smaller, they would
  // read as a trembling line)
  const loops = (s: number) => Math.max(LOOP_MIN, width(s));
  const now = meander({ points: course, width: loops, mobility, allowed, seed });
  const former = meander({ points: course, width: loops, mobility, allowed, seed: seed ^ 0x51ed27, sinuosity: 2.8 });
  const oxbows = oxbowsFrom(former, now.points, width).map((o) => ({ points: evenSpacing(simplifyPath(o.points, 0.05), Math.max(1, width(o.along))) as Vec2[], width: 0.8 * width(o.along) }));
  // control points close enough to keep the loops' shape
  const pts = now.points;
  const keep: number[] = [0];
  for (let k = 1; k < pts.length - 1; k++) {
    const p = pts[keep[keep.length - 1]];
    if (Math.hypot(pts[k][0] - p[0], pts[k][1] - p[1]) >= Math.max(0.8, 0.9 * width(now.along[k]))) keep.push(k);
  }
  keep.push(pts.length - 1);
  return { points: keep.map((k) => pts[k]), flow: keep.map((k) => flowAt(now.along[k])), oxbows };
}

/** A course as control points and the discharge at each. */
function lineOf(course: Vec2[], flowAt: (s: number) => number, total: number): { points: Vec2[]; flow: number[] } {
  const points = evenSpacing(simplifyPath(course, 0.3), 5) as Vec2[];
  const along = curveLengths(points);
  const all = along[along.length - 1] || 1;
  return { points, flow: points.map((_, i) => flowAt((along[i] / all) * total)) };
}

/** The cells the rivers and oxbow lakes on the map cover, with a cell to spare beside them. */
function taken(model: TerrainModel, paths: Record<string, PathFeature>): Set<number> {
  const W = model.W;
  const out = new Set<number>();
  for (const p of Object.values(paths)) {
    if (p.kind !== 'river' || p.hidden || p.points.length < 2) continue;
    const r = p.width / 2 + 1;
    const R = Math.ceil(r);
    for (const [x, y] of riverCurve(p.points))
      for (let dy = -R; dy <= R; dy++)
        for (let dx = -R; dx <= R; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const cy = Math.floor(y + dy);
          if (cy >= 0 && cy < model.H) out.add(cy * W + (((Math.floor(x + dx) % W) + W) % W));
        }
  }
  return out;
}

/** The smallest width (cells) a river's loops are made for. */
const LOOP_MIN = 0.9;

/** A number from a string, to seed a river's own pattern. */
function hashKey(k: string): number {
  let h = 2166136261;
  for (let i = 0; i < k.length; i++) h = Math.imul(h ^ k.charCodeAt(i), 16777619);
  return h >>> 0;
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
    const { points, flow, oxbows } = winding(model, r, x0, i === 0 && !r.fromLake, `${s.id}-r${i}`, taken(model, paths));
    x0 = points[points.length - 1][0];
    if (points.length < 2) return;
    const id = `${s.id}-r${i}`;
    oxbows.forEach((o, k) => {
      const oid = `${id}-o${k}`;
      paths[oid] = { id: oid, kind: 'river', points: o.points, width: o.width, color, style: 'solid', taper: false, oxbow: true, source: s.id, name: paths[oid]?.name ?? '', hidden: false, locked: false };
    });
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
