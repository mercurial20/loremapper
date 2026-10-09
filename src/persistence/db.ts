import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { MapDocument, ProjectMeta } from '../model/types';
import type { RasterLayer } from '../terrain/TerrainModel';

export interface ProjectRecord {
  id: string;
  formatVersion: number;
  meta: ProjectMeta;
  doc: MapDocument;
  /** Default value of each sparse raster layer (unallocated tiles read this). */
  rasterDefaults: Record<RasterLayer, number>;
  thumbnail?: Blob;
  updatedAt: number;
}

export interface TileRecord {
  projectId: string;
  layer: RasterLayer;
  index: number;
  data: ArrayBuffer;
}

/**
 * A user asset, or an override of a built-in one (rename, re-categorise,
 * replacement artwork, hide) stored under the built-in's id.
 */
export interface AssetRecord {
  id: string;
  kind: 'user' | 'override';
  name?: string;
  category?: string;
  mime?: string;
  blob?: Blob;
  width?: number;
  height?: number;
  tags?: string[];
  hidden?: boolean;
  createdAt: number;
}

export interface SettingRecord {
  key: string;
  value: unknown;
}

interface CartographerDB extends DBSchema {
  projects: { key: string; value: ProjectRecord };
  tiles: { key: [string, string, number]; value: TileRecord; indexes: { byProject: string } };
  assets: { key: string; value: AssetRecord };
  settings: { key: string; value: SettingRecord };
}

let dbPromise: Promise<IDBPDatabase<CartographerDB>> | null = null;

export function db(): Promise<IDBPDatabase<CartographerDB>> {
  if (!dbPromise) {
    dbPromise = openDB<CartographerDB>('fantasy-cartographer', 1, {
      upgrade(d) {
        d.createObjectStore('projects', { keyPath: 'id' });
        const tiles = d.createObjectStore('tiles', { keyPath: ['projectId', 'layer', 'index'] });
        tiles.createIndex('byProject', 'projectId');
        d.createObjectStore('assets', { keyPath: 'id' });
        d.createObjectStore('settings', { keyPath: 'key' });
      },
    });
  }
  return dbPromise;
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const r = await (await db()).get('settings', key);
  return r ? (r.value as T) : fallback;
}

export async function setSetting(key: string, value: unknown) {
  await (await db()).put('settings', { key, value });
}

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* not supported */
  }
}
