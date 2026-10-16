import { defaultPlanet } from '../core/planet';
import { NO_WATER } from '../terrain/TerrainModel';
import type { ProjectRecord } from '../persistence/db';
import { defaultView, emptyDocument, type MapDocument, type ProjectMeta } from './types';
import { t } from '../i18n';

/**
 * Project serialisation version. Bump when the stored shape changes and add a
 * step to `MIGRATIONS` that upgrades records from the previous version.
 */
export const FORMAT_VERSION = 4;

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
};

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
    territories: d.territories ?? {},
    labels: d.labels ?? {},
    peaks: d.peaks ?? {},
    regionNames: d.regionNames ?? {},
    reference: d.reference ?? null,
    objectLayers: d.objectLayers?.length ? d.objectLayers : e.objectLayers,
    systemLayers: { ...e.systemLayers, ...(d.systemLayers ?? {}) },
    view: { ...defaultView(), ...(d.view ?? {}) },
  };
}
