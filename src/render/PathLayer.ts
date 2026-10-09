import { Container, Graphics } from 'pixi.js';
import type { MapDocument, PathFeature } from '../model/types';
import type { WorldLayer } from './MapRenderer';
import { hexToNumber, type StylePreset } from './styles';
import { dashes, dots, ribbon, sampleSpline, strokePolyline } from './vectorGeometry';

interface Entry {
  path: PathFeature;
  g: Graphics;
  bucket: number;
  style: StylePreset | null;
}

const zoomBucket = (z: number) => Math.round(Math.log2(z) * 3);

/** Rivers and roads drawn as smooth splines; rebuilt when they change or zoom shifts. */
export class PathLayer implements WorldLayer {
  readonly container = new Container();
  private entries = new Map<string, Entry>();
  private zoom = 1;
  private style: StylePreset | null = null;

  setStyle(style: StylePreset) {
    if (style === this.style) return;
    this.style = style;
    for (const e of this.entries.values()) this.draw(e);
  }

  sync(doc: MapDocument) {
    const seen = new Set<string>();
    for (const p of Object.values(doc.paths)) {
      seen.add(p.id);
      let e = this.entries.get(p.id);
      if (!e) {
        e = { path: p, g: new Graphics(), bucket: NaN, style: null };
        this.entries.set(p.id, e);
        // rivers below roads
        if (p.kind === 'river') this.container.addChildAt(e.g, 0);
        else this.container.addChild(e.g);
        this.draw(e);
      } else if (e.path !== p) {
        e.path = p;
        this.draw(e);
      }
    }
    for (const [id, e] of this.entries)
      if (!seen.has(id)) {
        e.g.destroy();
        this.entries.delete(id);
      }
  }

  prepare(zoom: number) {
    this.zoom = zoom;
    const b = zoomBucket(zoom);
    for (const e of this.entries.values()) if (e.bucket !== b) this.draw(e);
  }

  private draw(e: Entry) {
    const g = e.g;
    const p = e.path;
    const zoom = this.zoom;
    e.bucket = zoomBucket(zoom);
    g.clear();
    g.visible = !p.hidden;
    if (p.points.length < 2) return;
    const pts = sampleSpline(p.points, zoom);
    const px = 1 / zoom;
    const ink = hexToNumber(this.style?.ink ?? '#3a2d1f');
    const color = hexToNumber(p.color);
    if (p.kind === 'river') {
      const wMax = Math.max(p.width, 2.2 * px);
      const wMin = Math.max(p.taper ? p.width * 0.22 : p.width, 0.9 * px);
      const poly = ribbon(pts, (t) => wMin + (wMax - wMin) * Math.pow(t, 0.8));
      g.poly(poly).fill({ color });
      g.poly(poly).stroke({ width: 0.9 * px, color: ink, alpha: 0.55, join: 'round' });
      // highlight
      if (wMax * zoom > 5) {
        strokePolyline(g, pts);
        g.stroke({ width: Math.max(0.6 * px, wMax * 0.12), color: 0xffffff, alpha: 0.25, cap: 'round', join: 'round' });
      }
      return;
    }
    const w = Math.max(p.width, 1.2 * px);
    switch (p.style) {
      case 'solid':
        strokePolyline(g, pts);
        g.stroke({ width: w, color, cap: 'round', join: 'round' });
        break;
      case 'double':
        strokePolyline(g, pts);
        g.stroke({ width: w * 1.8, color, cap: 'round', join: 'round' });
        strokePolyline(g, pts);
        g.stroke({ width: w * 0.8, color: hexToNumber(this.style?.paper ?? '#eadcb8'), cap: 'round', join: 'round' });
        break;
      case 'dotted':
        for (const [x, y] of dots(pts, w * 2.6)) g.circle(x, y, w * 0.6);
        g.fill({ color });
        break;
      case 'dashed':
      default:
        for (const seg of dashes(pts, w * 4, w * 2.6)) strokePolyline(g, seg);
        g.stroke({ width: w, color, cap: 'round', join: 'round' });
        break;
    }
  }
}
