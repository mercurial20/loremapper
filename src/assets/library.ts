import { CanvasSource, Texture } from 'pixi.js';
import { create } from 'zustand';
import { uid } from '../core/math';
import { db, getSetting, setSetting, type AssetRecord } from '../persistence/db';
import { STARTER_ASSETS, STARTER_CATEGORIES, type StarterAsset } from './starter';

export interface AssetInfo {
  id: string;
  name: string;
  category: string;
  source: 'builtin' | 'user';
  tags: string[];
  /** Intrinsic aspect ratio (height / width). */
  aspect: number;
  /** URL usable in <img> (data: or blob: URL). */
  url: string;
  mime: string;
  /** Built-in whose artwork was replaced by the user. */
  replaced: boolean;
  hidden: boolean;
}

interface AssetState {
  assets: AssetInfo[];
  categories: string[];
  ready: boolean;
  version: number;
}

export const useAssets = create<AssetState>(() => ({ assets: [], categories: [], ready: false, version: 0 }));

export const ACCEPTED_TYPES = ['image/png', 'image/webp', 'image/svg+xml'];
const MAX_TEXTURE_PX = 512;

function svgUrl(svg: string): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image'));
    img.src = url;
  });
}

/** Determine pixel size; SVGs without intrinsic size fall back to their viewBox. */
async function measure(blob: Blob): Promise<{ width: number; height: number }> {
  if (blob.type === 'image/svg+xml') {
    const text = await blob.text();
    const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text);
    if (vb) return { width: parseFloat(vb[1]), height: parseFloat(vb[2]) };
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    return { width: img.naturalWidth || 128, height: img.naturalHeight || 128 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The persistent asset library: built-in starter assets (replaceable and
 * re-categorisable) plus user imports stored as blobs in IndexedDB.
 */
class AssetLibrary {
  private records = new Map<string, AssetRecord>();
  private builtins = new Map<string, StarterAsset>(STARTER_ASSETS.map((a) => [a.id, a]));
  private objectUrls = new Map<string, string>();
  private textures = new Map<string, Promise<Texture>>();
  private textureListeners = new Set<(id: string) => void>();

  async init() {
    const all = await (await db()).getAll('assets');
    for (const r of all) this.records.set(r.id, r);
    const custom = await getSetting<string[]>('categories', []);
    const cats = [...STARTER_CATEGORIES, ...custom.filter((c) => !STARTER_CATEGORIES.includes(c))];
    for (const r of all) if (r.category && !cats.includes(r.category)) cats.push(r.category);
    useAssets.setState({ categories: cats, ready: true });
    this.publish();
  }

  private urlFor(id: string, rec?: AssetRecord): string {
    if (rec?.blob) {
      let u = this.objectUrls.get(id);
      if (!u) {
        u = URL.createObjectURL(rec.blob);
        this.objectUrls.set(id, u);
      }
      return u;
    }
    const b = this.builtins.get(id);
    return b ? svgUrl(b.svg) : '';
  }

  private publish() {
    const out: AssetInfo[] = [];
    for (const b of STARTER_ASSETS) {
      const o = this.records.get(b.id);
      out.push({
        id: b.id,
        name: o?.name ?? b.name,
        category: o?.category ?? b.category,
        source: 'builtin',
        tags: b.tags,
        aspect: o?.blob && o.width && o.height ? o.height / o.width : b.aspect,
        url: this.urlFor(b.id, o),
        mime: o?.mime ?? 'image/svg+xml',
        replaced: !!o?.blob,
        hidden: !!o?.hidden,
      });
    }
    for (const r of this.records.values()) {
      if (r.kind !== 'user') continue;
      out.push({
        id: r.id,
        name: r.name ?? 'Untitled',
        category: r.category ?? 'Custom',
        source: 'user',
        tags: r.tags ?? [],
        aspect: r.width && r.height ? r.height / r.width : 1,
        url: this.urlFor(r.id, r),
        mime: r.mime ?? 'image/png',
        replaced: false,
        hidden: false,
      });
    }
    useAssets.setState((s) => ({ assets: out, version: s.version + 1 }));
  }

  get(id: string): AssetInfo | undefined {
    return useAssets.getState().assets.find((a) => a.id === id);
  }

  has(id: string) {
    return this.builtins.has(id) || this.records.get(id)?.kind === 'user';
  }

  /** Import PNG / WebP / SVG files into the permanent library. */
  async importFiles(files: File[], category: string): Promise<string[]> {
    const ids: string[] = [];
    const d = await db();
    for (const f of files) {
      const type = f.type || (f.name.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : '');
      if (!ACCEPTED_TYPES.includes(type)) throw new Error(`${f.name}: only PNG, WebP and SVG are supported`);
      const blob = type === f.type ? f : new Blob([await f.arrayBuffer()], { type });
      const { width, height } = await measure(blob);
      const rec: AssetRecord = {
        id: uid('user-'),
        kind: 'user',
        name: f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' '),
        category,
        mime: type,
        blob,
        width,
        height,
        tags: [],
        createdAt: Date.now(),
      };
      await d.put('assets', rec);
      this.records.set(rec.id, rec);
      ids.push(rec.id);
    }
    if (!useAssets.getState().categories.includes(category)) await this.addCategory(category);
    this.publish();
    return ids;
  }

  /** Insert records coming from an imported project (keeps ids). */
  async importRecords(recs: AssetRecord[]) {
    const d = await db();
    for (const r of recs) {
      const existing = this.records.get(r.id);
      if (existing && existing.kind === 'user') continue;
      await d.put('assets', r);
      this.records.set(r.id, r);
      this.invalidate(r.id);
      if (r.category && !useAssets.getState().categories.includes(r.category)) await this.addCategory(r.category);
    }
    this.publish();
  }

  private async patch(id: string, patch: Partial<AssetRecord>) {
    const d = await db();
    const base: AssetRecord = this.records.get(id) ?? { id, kind: 'override', createdAt: Date.now() };
    const rec = { ...base, ...patch };
    await d.put('assets', rec);
    this.records.set(id, rec);
    this.publish();
  }

  rename(id: string, name: string) {
    return this.patch(id, { name: name.trim() || 'Untitled' });
  }

  async setCategory(id: string, category: string) {
    if (!useAssets.getState().categories.includes(category)) await this.addCategory(category);
    return this.patch(id, { category });
  }

  /** Replace the artwork of any asset (built-in or user) with a new file. */
  async replaceImage(id: string, file: File) {
    const type = file.type || (file.name.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : '');
    if (!ACCEPTED_TYPES.includes(type)) throw new Error('Only PNG, WebP and SVG are supported');
    const { width, height } = await measure(file);
    const old = this.objectUrls.get(id);
    if (old) URL.revokeObjectURL(old);
    this.objectUrls.delete(id);
    this.invalidate(id);
    await this.patch(id, { blob: file, mime: type, width, height });
  }

  /** Restore a built-in asset to its original name, category and artwork. */
  async resetBuiltin(id: string) {
    if (!this.builtins.has(id)) return;
    await (await db()).delete('assets', id);
    this.records.delete(id);
    const old = this.objectUrls.get(id);
    if (old) URL.revokeObjectURL(old);
    this.objectUrls.delete(id);
    this.invalidate(id);
    this.publish();
  }

  /** Delete a user asset or hide a built-in. Placed objects keep their reference. */
  async remove(id: string) {
    if (this.builtins.has(id)) return this.patch(id, { hidden: true });
    await (await db()).delete('assets', id);
    this.records.delete(id);
    this.invalidate(id);
    this.publish();
  }

  unhide(id: string) {
    return this.patch(id, { hidden: false });
  }

  async addCategory(name: string) {
    const n = name.trim();
    if (!n) return;
    const cats = useAssets.getState().categories;
    if (cats.includes(n)) return;
    const next = [...cats, n];
    useAssets.setState({ categories: next });
    await setSetting(
      'categories',
      next.filter((c) => !STARTER_CATEGORIES.includes(c)),
    );
  }

  async renameCategory(from: string, to: string) {
    const t = to.trim();
    if (!t || from === t) return;
    const cats = useAssets.getState().categories.map((c) => (c === from ? t : c));
    useAssets.setState({ categories: [...new Set(cats)] });
    await setSetting(
      'categories',
      cats.filter((c) => !STARTER_CATEGORIES.includes(c) || c === t),
    );
    for (const a of useAssets.getState().assets) if (a.category === from) await this.patch(a.id, { category: t });
  }

  async deleteCategory(name: string) {
    const cats = useAssets.getState().categories.filter((c) => c !== name);
    useAssets.setState({ categories: cats });
    await setSetting(
      'categories',
      cats.filter((c) => !STARTER_CATEGORIES.includes(c)),
    );
    for (const a of useAssets.getState().assets)
      if (a.category === name) await this.patch(a.id, { category: a.source === 'builtin' ? this.builtins.get(a.id)!.category : 'Custom' });
  }

  /** Blob + metadata for project export. */
  async exportRecord(id: string): Promise<AssetRecord | null> {
    const r = this.records.get(id);
    if (r) return r;
    return null;
  }

  // ---------- textures ----------

  onTexture(fn: (id: string) => void) {
    this.textureListeners.add(fn);
    return () => this.textureListeners.delete(fn);
  }

  private invalidate(id: string) {
    const t = this.textures.get(id);
    this.textures.delete(id);
    if (t) {
      t.then((tex) => tex.destroy(true)).catch(() => {});
      for (const fn of this.textureListeners) fn(id);
    }
  }

  /** Rasterised Pixi texture for an asset (cached). */
  texture(id: string): Promise<Texture> {
    let p = this.textures.get(id);
    if (!p) {
      p = this.rasterize(id);
      this.textures.set(id, p);
    }
    return p;
  }

  private async rasterize(id: string): Promise<Texture> {
    const rec = this.records.get(id);
    const builtin = this.builtins.get(id);
    let url: string;
    let revoke = false;
    if (rec?.blob) {
      url = URL.createObjectURL(rec.blob);
      revoke = true;
    } else if (builtin) url = svgUrl(builtin.svg);
    else throw new Error('missing asset ' + id);
    try {
      const img = await loadImage(url);
      let w = img.naturalWidth || 128;
      let h = img.naturalHeight || 128;
      const isSvg = (rec?.mime ?? 'image/svg+xml') === 'image/svg+xml';
      const scale = isSvg ? MAX_TEXTURE_PX / Math.max(w, h) : Math.min(1, 1024 / Math.max(w, h));
      w = Math.max(1, Math.round(w * scale));
      h = Math.max(1, Math.round(h * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      const source = new CanvasSource({
        resource: canvas,
        autoGenerateMipmaps: true,
        scaleMode: 'linear',
        mipmapFilter: 'linear',
        alphaMode: 'premultiply-alpha-on-upload',
      });
      return new Texture({ source });
    } finally {
      if (revoke) URL.revokeObjectURL(url);
    }
  }
}

export const assetLibrary = new AssetLibrary();
