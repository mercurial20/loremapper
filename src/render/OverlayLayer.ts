import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { Geo } from '../core/geo';
import { objectCorners, rotateHandle } from '../model/geometry';
import type { MapDocument, SelectionRef, Vec2 } from '../model/types';
import { brushWeight } from '../terrain/brushes';
import { FONT_FAMILY } from './fonts';
import type { WorldLayer } from './MapRenderer';
import { territoryLabelPos } from './TerritoryLayer';
import { sampleSpline, strokePolyline } from './vectorGeometry';

export interface BrushCursor {
  x: number;
  y: number;
  radiusKm: number;
  falloff: number;
  color: number;
}

export interface MeasureState {
  points: Vec2[];
  /** great-circle polylines per segment */
  arcs: Vec2[][];
  labels: { x: number; y: number; text: string }[];
}

export interface OverlayState {
  brush: BrushCursor | null;
  draft: { points: Vec2[]; closed: boolean; color: number; cursor: Vec2 | null } | null;
  measure: MeasureState | null;
  marquee: { x0: number; y0: number; x1: number; y1: number } | null;
  hover: SelectionRef | null;
  stampPreview: { x: number; y: number; w: number; h: number; rotation: number } | null;
  /** outline of the inspected landmass / water body: segments [x1, y1, x2, y2, …] */
  region: Float32Array | null;
}

const ACCENT = 0xf2b14a;

/** Interaction overlay: cursor, selection handles, drafts, measurement. */
export class OverlayLayer implements WorldLayer {
  readonly container = new Container();
  private g = new Graphics();
  private texts = new Container();
  private textPool: Text[] = [];
  private style = new TextStyle({
    fontFamily: FONT_FAMILY.sans,
    fontSize: 12,
    fontWeight: '600',
    fill: '#ffffff',
    stroke: { color: '#1b1612', width: 3.5, join: 'round' },
  });
  state: OverlayState = { brush: null, draft: null, measure: null, marquee: null, hover: null, stampPreview: null, region: null };
  private doc: MapDocument | null = null;
  private selection: SelectionRef[] = [];
  private dirty = true;
  private zoom = 1;
  private geo: Geo;
  private labelBounds: (id: string) => { w: number; h: number } | null;

  constructor(geo: Geo, labelBounds: (id: string) => { w: number; h: number } | null) {
    this.geo = geo;
    this.labelBounds = labelBounds;
    this.container.addChild(this.g, this.texts);
  }

  setGeo(geo: Geo) {
    this.geo = geo;
  }

  set(patch: Partial<OverlayState>) {
    this.state = { ...this.state, ...patch };
    this.dirty = true;
  }

  setContext(doc: MapDocument, selection: SelectionRef[]) {
    this.doc = doc;
    this.selection = selection;
    this.dirty = true;
  }

  prepare(zoom: number, zoomChanged: boolean) {
    if (!this.dirty && !zoomChanged) return;
    this.dirty = false;
    this.zoom = zoom;
    this.draw();
  }

  private text(i: number, s: string, x: number, y: number) {
    let t = this.textPool[i];
    if (!t) {
      t = new Text({ text: s, style: this.style, resolution: 2 });
      t.anchor.set(0.5, 1.2);
      this.textPool.push(t);
      this.texts.addChild(t);
    }
    t.text = s;
    t.visible = true;
    t.position.set(x, y);
    t.scale.set(1 / this.zoom);
  }

  private handle(x: number, y: number, r = 4.5, fill = 0xffffff) {
    const px = 1 / this.zoom;
    this.g.circle(x, y, r * px).fill({ color: fill }).stroke({ width: 1.5 * px, color: 0x1b1612 });
  }

  private draw() {
    const g = this.g;
    const px = 1 / this.zoom;
    g.clear();
    for (const t of this.textPool) t.visible = false;
    let ti = 0;
    const doc = this.doc;
    const s = this.state;

    // inspected landmass or water body: a soft glow under a crisp line
    if (s.region && s.region.length) {
      const r = s.region;
      for (const [w, alpha] of [
        [6, 0.25],
        [1.8, 1],
      ] as const) {
        for (let i = 0; i < r.length; i += 4) g.moveTo(r[i], r[i + 1]).lineTo(r[i + 2], r[i + 3]);
        g.stroke({ width: w * px, color: ACCENT, alpha, cap: 'round' });
      }
    }

    // selection
    if (doc) {
      const refs = [...this.selection];
      if (s.hover && !refs.some((r) => r.id === s.hover!.id)) refs.push(s.hover);
      for (const ref of refs) {
        const isHover = !this.selection.some((r) => r.id === ref.id);
        const color = isHover ? 0xffffff : ACCENT;
        const alpha = isHover ? 0.6 : 1;
        if (ref.kind === 'object') {
          const o = doc.objects[ref.id];
          if (!o) continue;
          const c = objectCorners(o, 2 * px);
          g.poly(c.flat()).stroke({ width: 1.6 * px, color, alpha });
          if (!isHover && this.selection.length === 1 && !o.locked) {
            const [rx, ry] = rotateHandle(o, this.zoom);
            const top: Vec2 = [(c[0][0] + c[1][0]) / 2, (c[0][1] + c[1][1]) / 2];
            g.moveTo(top[0], top[1]).lineTo(rx, ry).stroke({ width: 1.2 * px, color: ACCENT });
            this.handle(rx, ry, 5, ACCENT);
            for (const [x, y] of c) this.handle(x, y, 4);
          }
        } else if (ref.kind === 'path') {
          const p = doc.paths[ref.id];
          if (!p || p.points.length < 2) continue;
          const pts = sampleSpline(p.points, this.zoom);
          strokePolyline(g, pts);
          g.stroke({ width: Math.max(p.width + 4 * px, 5 * px), color, alpha: 0.35 * alpha, cap: 'round', join: 'round' });
          if (!isHover) {
            strokePolyline(g, p.points);
            g.stroke({ width: 1 * px, color: 0xffffff, alpha: 0.6 });
            p.points.forEach(([x, y], i) => this.handle(x, y, i === 0 || i === p.points.length - 1 ? 5 : 4, i === 0 ? 0x8fd0ff : 0xffffff));
          }
        } else if (ref.kind === 'territory') {
          const t = doc.territories[ref.id];
          if (!t || t.points.length < 3) continue;
          const pts = sampleSpline(t.points, this.zoom, true, 6);
          g.poly(pts.flat()).stroke({ width: 3 * px, color, alpha: 0.8 * alpha });
          if (!isHover) {
            for (const [x, y] of t.points) this.handle(x, y, 4);
            const [lx, ly] = territoryLabelPos(t);
            this.handle(lx, ly, 5, ACCENT);
          }
        } else if (ref.kind === 'label') {
          const l = doc.labels[ref.id];
          const b = this.labelBounds(ref.id);
          if (!l || !b) continue;
          const a = (l.rotation * Math.PI) / 180;
          const hw = b.w / 2 + 4 * px;
          const hh = b.h / 2 + 2 * px;
          const corners = [
            [-hw, -hh],
            [hw, -hh],
            [hw, hh],
            [-hw, hh],
          ].map(([x, y]) => [l.x + x * Math.cos(a) - y * Math.sin(a), l.y + x * Math.sin(a) + y * Math.cos(a)]);
          g.poly(corners.flat()).stroke({ width: 1.5 * px, color, alpha });
        }
      }
    }

    // stamp preview
    if (s.stampPreview) {
      const { x, y, w, h, rotation } = s.stampPreview;
      const a = (rotation * Math.PI) / 180;
      const pts = [
        [-w / 2, -h / 2],
        [w / 2, -h / 2],
        [w / 2, h / 2],
        [-w / 2, h / 2],
      ].map(([u, v]) => [x + u * Math.cos(a) - v * Math.sin(a), y + u * Math.sin(a) + v * Math.cos(a)]);
      g.poly(pts.flat()).stroke({ width: 1.2 * px, color: 0xffffff, alpha: 0.8 });
    }

    // draft polyline / polygon
    if (s.draft && s.draft.points.length) {
      const pts = s.draft.cursor ? [...s.draft.points, s.draft.cursor] : s.draft.points;
      if (pts.length >= 2) {
        const smooth = sampleSpline(pts, this.zoom, s.draft.closed && pts.length > 2);
        strokePolyline(g, smooth, s.draft.closed && pts.length > 2);
        g.stroke({ width: 2.2 * px, color: s.draft.color, alpha: 0.95, cap: 'round', join: 'round' });
      }
      for (const [x, y] of s.draft.points) this.handle(x, y, 3.5);
    }

    // marquee
    if (s.marquee) {
      const { x0, y0, x1, y1 } = s.marquee;
      g.rect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0))
        .fill({ color: ACCENT, alpha: 0.08 })
        .stroke({ width: 1 * px, color: ACCENT });
    }

    // measurement
    if (s.measure) {
      for (const arc of s.measure.arcs) {
        strokePolyline(g, arc);
        g.stroke({ width: 3.5 * px, color: 0x1b1612, alpha: 0.7, cap: 'round', join: 'round' });
        strokePolyline(g, arc);
        g.stroke({ width: 1.8 * px, color: 0xffffff, cap: 'round', join: 'round' });
      }
      for (const [x, y] of s.measure.points) this.handle(x, y, 4, ACCENT);
      for (const l of s.measure.labels) this.text(ti++, l.text, l.x, l.y);
    }

    // brush cursor: a true circle on the sphere, which is stretched in equirectangular
    if (s.brush) {
      const b = s.brush;
      const ring = (frac: number) => {
        const out: number[] = [];
        const r = b.radiusKm * frac;
        for (let i = 0; i <= 72; i++) {
          const th = (i / 72) * Math.PI * 2;
          const dy = (Math.cos(th) * r) / this.geo.kmPerCellY;
          const yy = Math.min(this.geo.H, Math.max(0, b.y + dy));
          const kx = Math.max(1e-3, Math.abs(this.geo.kmPerCellX(yy)));
          const dx = Math.min(this.geo.W / 2, (Math.sin(th) * r) / kx);
          out.push(b.x + dx, yy);
        }
        return out;
      };
      const outer = ring(1);
      g.poly(outer).stroke({ width: 3 * px, color: 0x000000, alpha: 0.35 });
      g.poly(outer).stroke({ width: 1.4 * px, color: b.color, alpha: 0.95 });
      if (b.falloff > 0.05 && b.falloff < 0.98) {
        // inner ring where the falloff starts
        let inner = 1 - b.falloff;
        // match the 50 % weight contour for clarity
        while (inner < 1 && brushWeight(inner, b.falloff) > 0.5) inner += 0.01;
        g.poly(ring(inner)).stroke({ width: 1 * px, color: b.color, alpha: 0.45 });
      }
      g.circle(b.x, b.y, 1.5 * px).fill({ color: b.color });
    }
  }
}
