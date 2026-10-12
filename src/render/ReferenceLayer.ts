import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { MapDocument, ReferenceImage } from '../model/types';
import type { WorldLayer } from './MapRenderer';

/** Pictures larger than this are scaled down for display (the stored file keeps its full size). */
const MAX_SIDE = 8192;

/**
 * The tracing picture: drawn over the terrain and under borders, rivers and
 * symbols, with its own opacity. While it is being placed, a frame with
 * corner handles shows its edges.
 */
export class ReferenceLayer implements WorldLayer {
  readonly container = new Container();
  private sprite = new Sprite(Texture.EMPTY);
  private frame = new Graphics();
  private ref: ReferenceImage | null = null;
  private loadedId: string | null = null;
  private editing = false;
  private zoom = 1;
  private getBlob: (assetId: string) => Blob | null;
  private onDirty: () => void;

  constructor(getBlob: (assetId: string) => Blob | null, onDirty: () => void) {
    this.getBlob = getBlob;
    this.onDirty = onDirty;
    this.container.addChild(this.sprite, this.frame);
  }

  sync(doc: MapDocument) {
    const r = doc.reference;
    this.ref = r;
    if (!r) {
      this.container.visible = false;
      return;
    }
    if (r.assetId !== this.loadedId) void this.load(r.assetId);
    this.sprite.position.set(r.x, r.y);
    this.sprite.width = r.w;
    this.sprite.height = r.h;
    this.sprite.alpha = r.opacity;
    this.container.visible = r.visible;
    this.drawFrame();
  }

  private async load(assetId: string) {
    this.loadedId = assetId;
    const blob = this.getBlob(assetId);
    if (!blob) return;
    try {
      const probe = await createImageBitmap(blob);
      const k = Math.min(1, MAX_SIDE / Math.max(probe.width, probe.height));
      const bitmap = k < 1 ? await createImageBitmap(blob, { resizeWidth: Math.round(probe.width * k), resizeHeight: Math.round(probe.height * k), resizeQuality: 'high' }) : probe;
      if (bitmap !== probe) probe.close();
      if (this.loadedId !== assetId) return;
      const old = this.sprite.texture;
      this.sprite.texture = Texture.from(bitmap);
      if (old !== Texture.EMPTY) old.destroy(true);
      if (this.ref) this.sync({ reference: this.ref } as MapDocument);
      this.onDirty();
    } catch {
      // an unreadable picture just isn't shown
    }
  }

  /** Show the placement frame (Move & resize). */
  setEditing(on: boolean) {
    this.editing = on;
    this.drawFrame();
  }

  prepare(zoom: number) {
    if (zoom === this.zoom) return;
    this.zoom = zoom;
    if (this.editing) this.drawFrame();
  }

  private drawFrame() {
    const g = this.frame;
    g.clear();
    const r = this.ref;
    if (!r || !this.editing) return;
    const px = 1 / this.zoom;
    g.rect(r.x, r.y, r.w, r.h).stroke({ width: 2 * px, color: 0xffcf6b, alpha: 0.95 });
    const hs = 6 * px;
    for (const [cx, cy] of [
      [r.x, r.y],
      [r.x + r.w, r.y],
      [r.x + r.w, r.y + r.h],
      [r.x, r.y + r.h],
    ])
      g.rect(cx - hs, cy - hs, hs * 2, hs * 2).fill({ color: 0xffffff }).stroke({ width: 1.5 * px, color: 0x1a1d23 });
  }

  destroy() {
    if (this.sprite.texture !== Texture.EMPTY) this.sprite.texture.destroy(true);
    this.container.destroy({ children: true });
  }
}
