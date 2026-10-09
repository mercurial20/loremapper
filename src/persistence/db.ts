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
  /** In memory only; persisted as `thumbnailPng`. */
  thumbnail?: Blob;
  thumbnailPng?: ArrayBuffer;
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
  /** In memory only; persisted as `data`. */
  blob?: Blob;
  data?: ArrayBuffer;
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

/*
 * Binary data is persisted as ArrayBuffers, never Blobs: WebKit refuses to
 * store Blobs in IndexedDB in ephemeral sessions (e.g. Safari Private
 * Browsing). Records written by older builds may still hold Blobs; both
 * shapes are accepted when reading.
 */

export async function dehydrateAsset(r: AssetRecord): Promise<AssetRecord> {
  const { blob, ...rest } = r;
  if (!blob) return rest;
  return { ...rest, mime: rest.mime ?? blob.type, data: await blob.arrayBuffer() };
}

export function hydrateAsset(r: AssetRecord): AssetRecord {
  if (r.blob || !r.data) return r;
  return { ...r, blob: new Blob([r.data], { type: r.mime ?? 'application/octet-stream' }) };
}

export async function dehydrateProject(r: ProjectRecord): Promise<ProjectRecord> {
  const { thumbnail, ...rest } = r;
  if (!thumbnail) return rest;
  return { ...rest, thumbnailPng: await thumbnail.arrayBuffer() };
}

export function hydrateProject<T extends Partial<ProjectRecord>>(r: T): T {
  if (r.thumbnail || !r.thumbnailPng) return r;
  return { ...r, thumbnail: new Blob([r.thumbnailPng], { type: 'image/png' }) };
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
