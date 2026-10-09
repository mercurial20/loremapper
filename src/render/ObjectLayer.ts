import { Container, Sprite, Texture } from 'pixi.js';
import { assetLibrary } from '../assets/library';
import type { MapDocument, MapObject } from '../model/types';
import type { WorldLayer } from './MapRenderer';

interface Entry {
  obj: MapObject;
  sprite: Sprite;
  loaded: boolean;
}

/** Placed asset instances, grouped per object layer, sorted by z. */
export class ObjectLayer implements WorldLayer {
  readonly container = new Container();
  private groups = new Map<string, Container>();
  private entries = new Map<string, Entry>();
  private doc: MapDocument | null = null;
  private onDirty: () => void;
  private unsubscribe: () => void;

  constructor(onDirty: () => void) {
    this.onDirty = onDirty;
    this.unsubscribe = assetLibrary.onTexture((assetId) => {
      // artwork replaced → detach the old texture now, then reload
      for (const e of this.entries.values())
        if (e.obj.assetId === assetId) {
          e.sprite.texture = Texture.WHITE;
          e.loaded = false;
          this.loadTexture(e);
        }
    });
  }

  /** Stop listening for artwork changes (call before the renderer is torn down). */
  dispose() {
    this.unsubscribe();
    this.entries.clear();
  }

  private group(layerId: string): Container {
    let g = this.groups.get(layerId);
    if (!g) {
      g = new Container();
      g.sortableChildren = true;
      this.groups.set(layerId, g);
      this.container.addChild(g);
    }
    return g;
  }

  private loadTexture(e: Entry) {
    const id = e.obj.assetId;
    assetLibrary
      .texture(id)
      .then((tex) => {
        if (this.entries.get(e.obj.id) !== e || e.obj.assetId !== id) return;
        e.sprite.texture = tex;
        e.loaded = true;
        e.sprite.tint = 0xffffff;
        this.apply(e);
        this.onDirty();
      })
      .catch(() => {
        e.sprite.texture = Texture.WHITE;
        e.sprite.tint = 0xb04a3a;
        e.loaded = true;
        this.apply(e);
        this.onDirty();
      });
  }

  private apply(e: Entry) {
    const o = e.obj;
    const s = e.sprite;
    const info = assetLibrary.get(o.assetId);
    const aspect = info?.aspect ?? (s.texture.height / Math.max(1, s.texture.width) || 1);
    const w = o.size * o.scale;
    s.position.set(o.x, o.y);
    s.rotation = (o.rotation * Math.PI) / 180;
    s.zIndex = o.z;
    // set size explicitly through scale to keep flips
    const tw = Math.max(1, s.texture.width);
    const th = Math.max(1, s.texture.height);
    s.scale.set(((o.flipX ? -1 : 1) * w) / tw, (w * aspect) / th);
    const layer = this.doc?.objectLayers.find((l) => l.id === o.layerId);
    s.alpha = o.opacity * (e.loaded ? 1 : 0.25);
    s.visible = !o.hidden && (layer?.visible ?? true);
  }

  sync(doc: MapDocument) {
    const layersChanged = doc.objectLayers !== this.doc?.objectLayers;
    this.doc = doc;
    const seen = new Set<string>();
    for (const o of Object.values(doc.objects)) {
      seen.add(o.id);
      let e = this.entries.get(o.id);
      if (!e) {
        const sprite = new Sprite(Texture.WHITE);
        sprite.anchor.set(0.5);
        sprite.tint = 0x8a7b62;
        e = { obj: o, sprite, loaded: false };
        this.entries.set(o.id, e);
        this.group(o.layerId).addChild(sprite);
        this.loadTexture(e);
        this.apply(e);
        continue;
      }
      if (e.obj === o && !layersChanged) continue;
      const prev = e.obj;
      e.obj = o;
      if (prev.layerId !== o.layerId) this.group(o.layerId).addChild(e.sprite);
      if (prev.assetId !== o.assetId) {
        e.loaded = false;
        this.loadTexture(e);
      }
      this.apply(e);
    }
    for (const [id, e] of this.entries) {
      if (!seen.has(id)) {
        e.sprite.destroy();
        this.entries.delete(id);
      }
    }
    if (layersChanged) {
      // order groups like the layer list (first = bottom)
      doc.objectLayers.forEach((l, i) => {
        const g = this.group(l.id);
        g.alpha = l.opacity;
        g.visible = l.visible;
        this.container.setChildIndex(g, Math.min(i, this.container.children.length - 1));
      });
    }
  }
}
