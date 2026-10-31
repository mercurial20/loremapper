import { Container, Graphics } from 'pixi.js';
import { polygonCentroid } from '../core/math';
import { labelGroup, labelStyle, MIN_NAME_PX } from '../model/names';
import type { LabelAnchor, MapDocument, MapLabel, NameGroup, NameStyle, Territory, Vec2 } from '../model/types';
import type { WorldLayer } from './MapRenderer';
import { hexToNumber, type StylePreset } from './styles';
import { TextLabel } from './TextLabel';
import { dashes, dots, sampleSpline, strokePolyline } from './vectorGeometry';

interface TEntry {
  t: Territory;
  g: Graphics;
  label: TextLabel;
  bucket: number;
}

const zoomBucket = (z: number) => Math.round(Math.log2(z) * 3);

export function territoryLabelPos(t: Territory): Vec2 {
  return t.labelPos ?? polygonCentroid(t.points);
}

/** Political territories: tinted fill, inner glow band, styled border, name. */
export class TerritoryLayer implements WorldLayer {
  readonly container = new Container();
  private shapes = new Container();
  private labels = new Container();
  private entries = new Map<string, TEntry>();
  private zoom = 1;
  private style: StylePreset | null = null;

  constructor() {
    this.container.addChild(this.shapes, this.labels);
  }

  setStyle(style: StylePreset) {
    if (style === this.style) return;
    this.style = style;
    for (const e of this.entries.values()) this.draw(e);
  }

  /** Show or hide the realm names (the projected view draws them itself). */
  setLabelsVisible(v: boolean) {
    this.labels.visible = v;
  }

  sync(doc: MapDocument) {
    const seen = new Set<string>();
    for (const t of Object.values(doc.territories)) {
      seen.add(t.id);
      let e = this.entries.get(t.id);
      if (!e) {
        e = { t, g: new Graphics(), label: new TextLabel(), bucket: NaN };
        this.entries.set(t.id, e);
        this.shapes.addChild(e.g);
        this.labels.addChild(e.label);
        this.draw(e);
      } else if (e.t !== t) {
        e.t = t;
        this.draw(e);
      }
    }
    for (const [id, e] of this.entries)
      if (!seen.has(id)) {
        e.g.destroy();
        e.label.destroy();
        this.entries.delete(id);
      }
  }

  prepare(zoom: number) {
    this.zoom = zoom;
    const b = zoomBucket(zoom);
    for (const e of this.entries.values()) {
      if (e.bucket !== b) this.draw(e);
      else e.label.setZoom(zoom);
    }
  }

  private draw(e: TEntry) {
    const t = e.t;
    const g = e.g;
    const zoom = this.zoom;
    e.bucket = zoomBucket(zoom);
    g.clear();
    g.visible = !t.hidden;
    e.label.renderable = !t.hidden && t.showLabel;
    if (t.points.length < 3) return;
    const px = 1 / zoom;
    const pts = sampleSpline(t.points, zoom, true, 6);
    const flat = pts.flat();
    const color = hexToNumber(t.color);
    const border = hexToNumber(t.borderColor);
    const fillMul = this.style?.territoryFill ?? 1;
    g.poly(flat).fill({ color, alpha: Math.min(1, t.fillOpacity * fillMul) });
    // soft inner band — the classic hand-tinted border wash
    g.poly(flat).stroke({ width: 10 * px, color, alpha: 0.3, join: 'round' });
    const w = Math.max(t.borderWidth * px, 0.6 * px);
    switch (t.borderStyle) {
      case 'dashed':
        for (const seg of dashes(pts, w * 5, w * 3, true)) strokePolyline(g, seg);
        g.stroke({ width: w, color: border, cap: 'round', join: 'round' });
        break;
      case 'dotted':
        for (const [x, y] of dots(pts, w * 2.8, true)) g.circle(x, y, w * 0.7);
        g.fill({ color: border });
        break;
      case 'double':
        g.poly(flat).stroke({ width: w * 3.2, color: border, join: 'round' });
        g.poly(flat).stroke({ width: w * 1.4, color: hexToNumber(this.style?.paper ?? '#eadcb8'), join: 'round' });
        break;
      case 'solid':
      default:
        g.poly(flat).stroke({ width: w, color: border, join: 'round' });
    }
    const [lx, ly] = territoryLabelPos(t);
    e.label.position.set(lx, ly);
    e.label.update(this.labelOptions(t), zoom);
  }

  private labelOptions(t: Territory): Parameters<TextLabel['update']>[0] {
    return {
      text: t.name,
      font: 'display',
      size: t.labelSize,
      color: t.borderColor,
      halo: true,
      haloColor: this.style?.labelHalo ?? '#f4ead2',
      letterSpacing: 0.18,
      uppercase: true,
      italic: false,
      curve: 0,
      rotation: 0,
      alpha: 0.92,
    };
  }
}

/**
 * Free-standing map labels, styled by their group with what they set themselves on top. A label
 * too small to read at the current zoom is hidden (unless its group is always shown); a label
 * naming a landmass or water body is hidden while that is gone.
 */
export class LabelLayer implements WorldLayer {
  readonly container = new Container();
  private entries = new Map<string, { l: MapLabel; node: TextLabel; style: NameStyle; group: NameGroup }>();
  private selected = new Set<string>();
  private zoom = 1;
  private style: StylePreset | null = null;
  private longSide: () => number;
  /** Whether what a label names is still there. */
  private anchorAlive: (a: LabelAnchor) => boolean;

  constructor(longSide: () => number = () => 2048, anchorAlive: (a: LabelAnchor) => boolean = () => true) {
    this.longSide = longSide;
    this.anchorAlive = anchorAlive;
  }

  setStyle(style: StylePreset) {
    if (style === this.style) return;
    this.style = style;
    for (const e of this.entries.values()) e.node.update(this.opts(e.l, e.style), this.zoom);
  }

  private opts(l: MapLabel, s: NameStyle): Parameters<TextLabel['update']>[0] {
    return {
      text: l.text || ' ',
      font: s.font,
      size: s.size,
      color: s.color,
      halo: s.halo,
      haloColor: this.style?.labelHalo ?? '#f4ead2',
      letterSpacing: l.letterSpacing,
      uppercase: s.uppercase,
      italic: s.italic,
      curve: l.curve,
      rotation: l.rotation,
      alpha: l.opacity,
    };
  }

  /** World-space half extents of a label (for hit testing / selection). */
  bounds(id: string): { w: number; h: number } | null {
    const e = this.entries.get(id);
    return e ? { w: e.node.worldWidth, h: e.node.worldHeight } : null;
  }

  /** Whether a label is drawn now (shown, readable, what it names still there). */
  shown(id: string): boolean {
    const e = this.entries.get(id);
    return !!e && e.node.renderable;
  }

  sync(doc: MapDocument) {
    const L = this.longSide();
    const seen = new Set<string>();
    for (const l of Object.values(doc.labels)) {
      seen.add(l.id);
      const style = labelStyle(doc, l, L);
      const group = labelGroup(doc, l);
      let e = this.entries.get(l.id);
      if (!e) {
        e = { l, node: new TextLabel(), style, group };
        this.entries.set(l.id, e);
        this.container.addChild(e.node);
        e.node.update(this.opts(l, style), this.zoom);
      } else if (e.l !== l || e.group !== group || !sameNameStyle(e.style, style)) {
        e.l = l;
        e.style = style;
        e.group = group;
        e.node.update(this.opts(l, style), this.zoom);
      }
      e.node.position.set(l.x, l.y);
      this.applyLod(e);
    }
    for (const [id, e] of this.entries)
      if (!seen.has(id)) {
        e.node.destroy();
        this.entries.delete(id);
      }
  }

  /** What is selected: shown even when too small to read. */
  setSelected(ids: Set<string>) {
    const was = this.selected;
    this.selected = ids;
    for (const e of this.entries.values()) if (was.has(e.l.id) !== ids.has(e.l.id)) this.applyLod(e);
  }

  /** Check again whether what each label names is still there (the land changed). */
  recheckAnchors() {
    for (const e of this.entries.values()) if (e.l.anchor) this.applyLod(e);
  }

  private applyLod(e: { l: MapLabel; node: TextLabel; style: NameStyle; group: NameGroup }) {
    const px = e.style.size * this.zoom;
    const sure = e.group.always || this.selected.has(e.l.id);
    const readable = sure || px >= MIN_NAME_PX;
    const alive = !e.l.anchor || this.anchorAlive(e.l.anchor);
    e.node.renderable = !e.l.hidden && e.group.visible && readable && alive;
    // fade in as it grows readable
    e.node.alpha = e.l.opacity * (sure ? 1 : Math.min(1, (px - MIN_NAME_PX) / 2 + 0.35));
  }

  prepare(zoom: number, zoomChanged: boolean) {
    this.zoom = zoom;
    if (!zoomChanged) return;
    for (const e of this.entries.values()) {
      e.node.setZoom(zoom);
      this.applyLod(e);
    }
  }
}

const sameNameStyle = (a: NameStyle, b: NameStyle) =>
  a.font === b.font && a.size === b.size && a.color === b.color && a.halo === b.halo && a.uppercase === b.uppercase && a.italic === b.italic;
