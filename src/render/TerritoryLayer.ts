import { Container, Graphics } from 'pixi.js';
import { polygonCentroid } from '../core/math';
import { labelGroup, labelStyle, MIN_NAME_PX, readableAt, sameStyle, screenPx } from '../model/names';
import type { LabelAnchor, MapDocument, MapLabel, NameGroup, NameStyle, Territory, Vec2 } from '../model/types';
import type { Camera } from './Camera';
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
interface LabelEntry {
  l: MapLabel;
  node: TextLabel;
  style: NameStyle;
  group: NameGroup;
}

/** A box on screen: x0, y0, x1, y1. */
export type ScreenBox = [number, number, number, number];

/**
 * Free-standing map labels and the names of lands and waters, styled by their group with what
 * they set themselves. A label too small to read is hidden; an adaptive one keeps its group's size
 * on screen and hides when what it names is smaller on screen than it, and where adaptive labels
 * crowd the larger regions' win.
 */
export class LabelLayer implements WorldLayer {
  readonly container = new Container();
  private entries = new Map<string, LabelEntry>();
  private selected = new Set<string>();
  private zoom = 1;
  private style: StylePreset | null = null;
  private camera: Camera;
  private longSide: () => number;
  /** Whether what a label names is still there. */
  private anchorAlive: (a: LabelAnchor) => boolean;
  /** How big what a label names is (cells: width, height), if known. */
  private extentOf: (a: LabelAnchor) => [number, number] | null;
  /** Temporary camera used while exporting images. */
  cameraOverride: Camera | null = null;
  /** Where labels are drawn now, on screen (names and peak markers keep clear of them), and a count of redraws. */
  boxes: ScreenBox[] = [];
  version = 0;
  private lastKey = '';

  constructor(camera: Camera, longSide: () => number = () => 2048, anchorAlive: (a: LabelAnchor) => boolean = () => true, extentOf: (a: LabelAnchor) => [number, number] | null = () => null) {
    this.camera = camera;
    this.longSide = longSide;
    this.anchorAlive = anchorAlive;
    this.extentOf = extentOf;
  }

  setStyle(style: StylePreset) {
    if (style === this.style) return;
    this.style = style;
    for (const e of this.entries.values()) e.node.update(this.opts(e.l, e.style), this.zoom);
    this.lastKey = '';
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
      } else if (e.l !== l || e.group !== group || !sameStyle(e.style, style)) {
        e.l = l;
        e.style = style;
        e.group = group;
        e.node.update(this.opts(l, style), this.zoom);
      }
      e.node.position.set(l.x, l.y);
    }
    for (const [id, e] of this.entries)
      if (!seen.has(id)) {
        e.node.destroy();
        this.entries.delete(id);
      }
    this.lastKey = '';
  }

  /** What is selected: shown even when too small to read. */
  setSelected(ids: Set<string>) {
    this.selected = ids;
    this.lastKey = '';
  }

  /** Check again whether what each label names is still there (the land changed). */
  recheckAnchors() {
    this.lastKey = '';
  }

  prepare(zoom: number, zoomChanged: boolean) {
    this.zoom = zoom;
    const cam = this.cameraOverride ?? this.camera;
    const key = `${zoom.toFixed(5)},${cam.x.toFixed(1)},${cam.y.toFixed(1)},${cam.viewW},${cam.viewH},${MIN_NAME_PX}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    // sizes on screen, and what may show
    const fixed: LabelEntry[] = [];
    const adaptive: { e: LabelEntry; prio: number }[] = [];
    for (const e of this.entries.values()) {
      const px = screenPx(e.style, e.group, zoom);
      e.node.setSize(px / zoom, zoom);
      if (zoomChanged) e.node.setZoom(zoom);
      e.node.renderable = false;
      const sure = e.group.always || this.selected.has(e.l.id);
      if (e.l.hidden || !e.group.visible || !(sure || readableAt(e.style, e.group, zoom))) continue;
      if (e.l.anchor && !this.anchorAlive(e.l.anchor)) continue;
      if (!e.style.adaptive || sure) {
        fixed.push(e);
        continue;
      }
      // an adaptive name hides when what it names is smaller on screen than the name
      const ext = e.l.anchor ? this.extentOf(e.l.anchor) : null;
      const span = ext ? Math.max(ext[0], ext[1]) : 0;
      if (ext && span * zoom < 0.8 * e.node.worldWidth * zoom) continue;
      // where they crowd, larger regions first (a land before a sea of its size)
      adaptive.push({ e, prio: (span || e.node.worldWidth) * (e.l.anchor?.land ? 1.3 : 1) });
    }
    adaptive.sort((a, b) => b.prio - a.prio);
    const placed: ScreenBox[] = [];
    const boxOf = (e: LabelEntry): ScreenBox => {
      const [sx, sy] = cam.worldToScreen(e.l.x, e.l.y);
      const hw = (e.node.worldWidth * zoom) / 2;
      const hh = (e.node.worldHeight * zoom) / 2;
      const r = (e.l.rotation * Math.PI) / 180;
      const ex = Math.abs(hw * Math.cos(r)) + Math.abs(hh * Math.sin(r)) + 2;
      const ey = Math.abs(hw * Math.sin(r)) + Math.abs(hh * Math.cos(r)) + 1;
      return [sx - ex, sy - ey, sx + ex, sy + ey];
    };
    const onScreen = (b: ScreenBox) => b[2] > -40 && b[3] > -40 && b[0] < cam.viewW + 40 && b[1] < cam.viewH + 40;
    for (const e of fixed) {
      const b = boxOf(e);
      e.node.renderable = true;
      // fade in as it grows readable
      const px = e.style.size * zoom;
      e.node.alpha = e.l.opacity * (e.group.always || this.selected.has(e.l.id) || e.style.adaptive ? 1 : Math.min(1, (px - MIN_NAME_PX) / 2 + 0.35));
      if (onScreen(b)) placed.push(b);
    }
    for (const { e } of adaptive) {
      const b = boxOf(e);
      if (!onScreen(b)) continue;
      if (placed.some((p) => p[0] < b[2] && p[2] > b[0] && p[1] < b[3] && p[3] > b[1])) continue;
      placed.push(b);
      e.node.renderable = true;
      e.node.alpha = e.l.opacity;
    }
    this.boxes = placed;
    this.version++;
  }
}

