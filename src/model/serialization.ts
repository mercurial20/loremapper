import { defaultPlanet } from '../core/planet';
import { NO_WATER } from '../terrain/TerrainModel';
import type { ProjectRecord } from '../persistence/db';
import { defaultView, emptyDocument, type MapDocument, type MapLabel, type MapObject, type PathFeature, type ProjectMeta } from './types';
import { t } from '../i18n';

/**
 * Project serialisation version. Bump when the stored shape changes and add a
 * step to `MIGRATIONS` that upgrades records from the previous version.
 */
export const FORMAT_VERSION = 7;

type Migration = (rec: Record<string, unknown>) => Record<string, unknown>;

/** MIGRATIONS[n] upgrades a record from version n to n + 1. */
const MIGRATIONS: Record<number, Migration> = {
  // 1 → 2 (v1.1): map types. Everything saved before is a planet; keep the
  // radius it was made with (7,410 km was the default before v1.1).
  1: (rec) => {
    const meta = (rec.meta ?? {}) as Record<string, unknown>;
    const planet = (meta.planet ?? {}) as Record<string, unknown>;
    return { ...rec, formatVersion: 2, meta: { ...meta, planet: { radiusKm: 7410, ...planet, mapType: 'planet' } } };
  },
  // 2 → 3 (v1.2.3): a raster layer of painted water. Older maps have none.
  2: (rec) => {
    const defaults = (rec.rasterDefaults ?? {}) as Record<string, unknown>;
    return { ...rec, formatVersion: 3, rasterDefaults: { ...defaults, water: 0 } };
  },
  // 3 → 4 (v1.3): mountain ranges drawn as lines with the raster of their relief, and lakes with
  // their own water level. Older maps have neither.
  3: (rec) => {
    const defaults = (rec.rasterDefaults ?? {}) as Record<string, unknown>;
    const doc = (rec.doc ?? {}) as Record<string, unknown>;
    return { ...rec, formatVersion: 4, rasterDefaults: { ...defaults, relief: 0, lake: NO_WATER }, doc: { ranges: {}, ...doc } };
  },
  // 4 → 5: water sources, whose rivers and lakes are worked out from the land. Older maps have none.
  4: (rec) => {
    const doc = (rec.doc ?? {}) as Record<string, unknown>;
    return { ...rec, formatVersion: 5, doc: { sources: {}, ...doc } };
  },
  // 5 → 6: objects write their own names on the map. A label written by hand beside an object with
  // the same name becomes the object's name (where it was, as it looked), so it is not written twice
  // and goes with the object from now on; a turned or curved one stays, and the object's is not shown.
  5: (rec) => ({ ...rec, formatVersion: 6, doc: tieObjectNames((rec.doc ?? {}) as Record<string, unknown>) }),
  // 6 → 7: rivers no longer widen below their tributaries unless set to; one that does has its width
  // at its mouth, its tributaries' water included (before, their water was added on top of it).
  // Rivers with tributaries are set to widen and take the width they were drawn at there, so they
  // look as they did.
  6: (rec) => ({ ...rec, formatVersion: 7, doc: riverWidthsAtMouth((rec.doc ?? {}) as Record<string, unknown>) }),
};

function riverWidthsAtMouth(doc: Record<string, unknown>): Record<string, unknown> {
  const paths = { ...((doc.paths ?? {}) as Record<string, PathFeature>) };
  const isRiver = (p: PathFeature | undefined) => !!p && p.kind === 'river' && p.points.length >= 2;
  const fromSource = (p: PathFeature) => !!p.flow && p.flow.length === p.points.length;
  const children = new Map<string, string[]>();
  for (const p of Object.values(paths)) {
    const o = p.outlet;
    if (!isRiver(p) || o?.kind !== 'path' || o.id === p.id || !isRiver(paths[o.id])) continue;
    children.set(o.id, [...(children.get(o.id) ?? []), p.id]);
  }
  // the old rule: a river's water at its mouth, its own (squared width there) and all that joined it
  const memo = new Map<string, number>();
  const busy = new Set<string>();
  const q = (id: string): number => {
    const known = memo.get(id);
    if (known !== undefined) return known;
    const p = paths[id];
    const own = (fromSource(p) ? p.width * Math.pow(Math.max(0, p.flow![p.flow!.length - 1]) / Math.max(1e-6, ...p.flow!), 0.4) : p.width) ** 2;
    if (busy.has(id)) return own;
    busy.add(id);
    let sum = own;
    for (const c of children.get(id) ?? []) sum += q(c);
    busy.delete(id);
    memo.set(id, sum);
    return sum;
  };
  for (const id of children.keys()) if (!fromSource(paths[id])) q(id);
  for (const id of children.keys()) {
    const p = paths[id];
    paths[id] = fromSource(p) ? { ...p, widenBelowTributaries: true } : { ...p, width: Math.sqrt(q(id)), widenBelowTributaries: true };
  }
  return { ...doc, paths };
}

function tieObjectNames(doc: Record<string, unknown>): Record<string, unknown> {
  const objects = { ...((doc.objects ?? {}) as Record<string, MapObject>) };
  const labels = { ...((doc.labels ?? {}) as Record<string, MapLabel>) };
  const key = (t: string) => t.trim().toLowerCase();
  for (const o of Object.values(objects)) {
    if (!o.name?.trim()) continue;
    const reach = Math.max(o.size * o.scale * 2, 8);
    let best: MapLabel | null = null;
    let bestD = Infinity;
    for (const l of Object.values(labels)) {
      if (l.anchor || key(l.text) !== key(o.name)) continue;
      const d = Math.hypot(l.x - o.x, l.y - o.y);
      if (d <= Math.max(reach, l.size * 4) && d < bestD) {
        best = l;
        bestD = d;
      }
    }
    if (!best) continue;
    if (best.rotation === 0 && Math.abs(best.curve) < 0.01 && !best.hidden) {
      objects[o.id] = { ...o, nameOffset: [best.x - o.x, best.y - o.y], nameStyle: { font: best.font, size: best.size, color: best.color, halo: best.halo, uppercase: best.uppercase, italic: best.italic } };
      delete labels[best.id];
    } else objects[o.id] = { ...o, showName: false };
  }
  return { ...doc, objects, labels };
}

export function migrateProject(raw: Record<string, unknown>): ProjectRecord {
  let rec = raw;
  let v = typeof rec.formatVersion === 'number' ? rec.formatVersion : 1;
  if (v > FORMAT_VERSION) throw new Error(t('This project was saved by a newer version of Loremapper (format {v}). Update the page and try again.', { v }));
  while (v < FORMAT_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(t('Unknown project format {v}', { v }));
    rec = step(rec);
    v++;
  }
  const r = rec as unknown as ProjectRecord;
  return { ...r, formatVersion: FORMAT_VERSION, meta: normalizeMeta(r.meta), doc: normalizeDoc(r.doc) };
}

export function normalizeMeta(m: Partial<ProjectMeta> | undefined): ProjectMeta {
  const base = defaultPlanet();
  return {
    id: m?.id ?? crypto.randomUUID(),
    name: m?.name ?? 'Untitled world',
    createdAt: m?.createdAt ?? Date.now(),
    updatedAt: m?.updatedAt ?? Date.now(),
    seed: m?.seed ?? Math.floor(Math.random() * 1e9),
    planet: { ...base, ...(m?.planet ?? {}) },
    ...(m?.source ? { source: m.source } : {}),
  };
}

/** Fill any fields missing from older or hand-edited documents. */
export function normalizeDoc(d: Partial<MapDocument> | undefined): MapDocument {
  const e = emptyDocument();
  if (!d) return e;
  return {
    objects: d.objects ?? {},
    paths: d.paths ?? {},
    ranges: d.ranges ?? {},
    sources: d.sources ?? {},
    territories: d.territories ?? {},
    labels: d.labels ?? {},
    peaks: d.peaks ?? {},
    regionNames: d.regionNames ?? {},
    // (older maps: the built-in name groups; a group added since is put in)
    nameGroups: [...(d.nameGroups ?? []), ...e.nameGroups.filter((g) => !d.nameGroups?.some((x) => x.id === g.id))],
    reference: d.reference ?? null,
    objectLayers: d.objectLayers?.length ? d.objectLayers : e.objectLayers,
    systemLayers: { ...e.systemLayers, ...(d.systemLayers ?? {}) },
    view: { ...defaultView(), ...(d.view ?? {}) },
  };
}
