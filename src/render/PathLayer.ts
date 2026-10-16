import { Container, Graphics } from 'pixi.js';
import type { MapDocument, PathFeature } from '../model/types';
import type { WorldLayer } from './MapRenderer';
import { hexToNumber, type StylePreset } from './styles';
import { dashes, dots, sampleSpline, strokePolyline } from './vectorGeometry';

interface Entry {
  path: PathFeature;
  g: Graphics;
  bucket: number;
}

const zoomBucket = (z: number) => Math.round(Math.log2(z) * 3);

/**
 * Roads drawn as smooth splines; rebuilt when they change or zoom shifts. (Rivers are water:
 * the terrain shader draws them with the sea and lakes, see RiverField.)
 */
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
      if (p.kind === 'river') continue;
      seen.add(p.id);
      let e = this.entries.get(p.id);
      if (!e) {
        e = { path: p, g: new Graphics(), bucket: NaN };
        this.entries.set(p.id, e);
        this.container.addChild(e.g);
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
    const color = hexToNumber(p.color);
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
