import { FORMAT_VERSION, migrateProject } from '../model/serialization';
import type { MapDocument, ProjectMeta } from '../model/types';
import { RASTER_LAYERS, TerrainModel, type RasterLayer } from '../terrain/TerrainModel';
import type { RasterArray } from '../terrain/TileGrid';
import { db, dehydrateProject, hydrateProject, type ProjectRecord, type TileRecord } from './db';

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: number;
  createdAt: number;
  thumbnail?: Blob;
  gridWidth: number;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const all = (await (await db()).getAll('projects')).map(hydrateProject);
  return all
    .map((p) => ({
      id: p.id,
      name: p.meta.name,
      updatedAt: p.updatedAt,
      createdAt: p.meta.createdAt,
      thumbnail: p.thumbnail,
      gridWidth: p.meta.planet.gridWidth,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProjectRecord(id: string): Promise<ProjectRecord | undefined> {
  const raw = await (await db()).get('projects', id);
  return raw ? hydrateProject(migrateProject(raw as unknown as Record<string, unknown>)) : undefined;
}

function tileArray(layer: RasterLayer, buf: ArrayBuffer): RasterArray {
  return layer === 'height' ? new Float32Array(buf) : new Uint8Array(buf);
}

/** Load a project's record and raster tiles into a fresh TerrainModel. */
export async function loadProject(id: string): Promise<{ record: ProjectRecord; model: TerrainModel } | null> {
  const record = await getProjectRecord(id);
  if (!record) return null;
  const model = new TerrainModel(record.meta.planet);
  for (const l of RASTER_LAYERS) model.grid(l).defaultValue = record.rasterDefaults?.[l] ?? model.grid(l).defaultValue;
  const d = await db();
  const tiles = await d.getAllFromIndex('tiles', 'byProject', id);
  for (const t of tiles) {
    const g = model.grid(t.layer);
    const arr = tileArray(t.layer, t.data);
    if (arr.length === g.TS * g.TS * g.channels) g.tiles.set(t.index, arr);
  }
  return { record, model };
}

export async function putProjectRecord(meta: ProjectMeta, doc: MapDocument, model: TerrainModel, thumbnail?: Blob) {
  const d = await db();
  const prev = await d.get('projects', meta.id);
  const rec: ProjectRecord = {
    thumbnailPng: prev?.thumbnailPng,
    id: meta.id,
    formatVersion: FORMAT_VERSION,
    meta,
    doc,
    rasterDefaults: { height: model.height.defaultValue, biome: model.biome.defaultValue, fog: model.fog.defaultValue },
    thumbnail: thumbnail ?? prev?.thumbnail,
    updatedAt: Date.now(),
  };
  await d.put('projects', await dehydrateProject(rec));
}

/**
 * Persist changed tiles. Layers in `model.persistReset` are rewritten
 * completely; otherwise only the dirty tile keys are written or deleted.
 */
export async function saveDirtyTiles(projectId: string, model: TerrainModel): Promise<number> {
  const d = await db();
  const tx = d.transaction('tiles', 'readwrite');
  const store = tx.objectStore('tiles');
  let n = 0;
  const reset = new Set(model.persistReset);
  model.persistReset.clear();
  const dirty: Record<RasterLayer, Set<number>> = { height: new Set(), biome: new Set(), fog: new Set() };
  for (const l of RASTER_LAYERS) {
    for (const k of model.persistDirty[l]) dirty[l].add(k);
    model.persistDirty[l].clear();
  }
  const ops: Promise<unknown>[] = [];
  for (const layer of RASTER_LAYERS) {
    const g = model.grid(layer);
    if (reset.has(layer)) {
      // delete all stored tiles for this layer, then write every allocated tile
      let cursor = await store.openCursor(IDBKeyRange.bound([projectId, layer, -Infinity], [projectId, layer, Infinity]));
      while (cursor) {
        ops.push(cursor.delete());
        cursor = await cursor.continue();
      }
      for (const [k, t] of g.tiles) {
        ops.push(store.put({ projectId, layer, index: k, data: t.slice().buffer as ArrayBuffer }));
        n++;
      }
      continue;
    }
    for (const k of dirty[layer]) {
      const t = g.tiles.get(k);
      if (t) ops.push(store.put({ projectId, layer, index: k, data: t.slice().buffer as ArrayBuffer } satisfies TileRecord));
      else ops.push(store.delete([projectId, layer, k]));
      n++;
    }
  }
  await Promise.all(ops);
  await tx.done;
  return n;
}

export async function deleteProject(id: string) {
  const d = await db();
  const tx = d.transaction(['projects', 'tiles'], 'readwrite');
  await tx.objectStore('projects').delete(id);
  const tiles = tx.objectStore('tiles');
  let cursor = await tiles.index('byProject').openKeyCursor(IDBKeyRange.only(id));
  const dels: Promise<unknown>[] = [];
  while (cursor) {
    dels.push(tiles.delete(cursor.primaryKey));
    cursor = await cursor.continue();
  }
  await Promise.all(dels);
  await tx.done;
}

export async function renameProject(id: string, name: string) {
  const d = await db();
  const rec = await d.get('projects', id);
  if (!rec) return;
  rec.meta = { ...rec.meta, name };
  rec.updatedAt = Date.now();
  await d.put('projects', rec);
}

export async function duplicateProject(id: string, newName: string): Promise<string | null> {
  const d = await db();
  const rec = await d.get('projects', id);
  if (!rec) return null;
  const nid = crypto.randomUUID();
  const now = Date.now();
  await d.put('projects', { ...rec, id: nid, meta: { ...rec.meta, id: nid, name: newName, createdAt: now, updatedAt: now }, updatedAt: now });
  const tiles = await d.getAllFromIndex('tiles', 'byProject', id);
  const tx = d.transaction('tiles', 'readwrite');
  await Promise.all(tiles.map((t) => tx.store.put({ ...t, projectId: nid })));
  await tx.done;
  return nid;
}

/** Write a complete project (used by import). */
export async function writeFullProject(record: ProjectRecord, tiles: TileRecord[]) {
  const d = await db();
  await d.put('projects', await dehydrateProject(record));
  const tx = d.transaction('tiles', 'readwrite');
  await Promise.all(tiles.map((t) => tx.store.put(t)));
  await tx.done;
}

export async function estimateStorage(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage.estimate();
    return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
  } catch {
    return null;
  }
}
