import { Container } from 'pixi.js';
import { objectSize } from '../model/geometry';
import { MIN_ICON_PX, MIN_NAME_PX, objectNameGroup, objectNameStyle, objectShowsName, pathNameGroup, pathNameStyle, pathShowsName, readableAt, sameStyle, screenPx } from '../model/names';
import type { MapDocument, MapObject, NameGroup, NameStyle, PathFeature, Vec2 } from '../model/types';
import type { Camera } from './Camera';
import type { WorldLayer } from './MapRenderer';
import type { StylePreset } from './styles';
import type { LabelLayer } from './TerritoryLayer';
import { TextLabel } from './TextLabel';
import { sampleSpline } from './vectorGeometry';

interface Entry {
  kind: 'object' | 'path';
  id: string;
  node: TextLabel;
  /** What it was built from (rebuilt when either changes). */
  src: MapObject | PathFeature;
  group: NameGroup;
  style: NameStyle;
  /** Where it is drawn now, and its turn (degrees). */
  x: number;
  y: number;
  rotation: number;
  /** Where it goes for a letter size (an adaptive name's size changes with the zoom). */
  place: (size: number) => { x: number; y: number };
  /** How long what it names is (rivers and roads, cells): an adaptive name hides when it is shorter on screen. */
  length: number;
  /** Larger first when names crowd. */
  priority: number;
  /** The symbol it names is drawn at this world width (objects). */
  iconW: number;
}

/**
 * The names of objects (under their symbol) and of rivers and roads (along them): drawn from the
 * names themselves, so they go wherever the object or the river goes and vanish with it. Sizes
 * are on the map; a name too small to read at the current zoom is hidden, and where names crowd
 * the larger ones win.
 */
export class NameLayer implements WorldLayer {
  readonly container = new Container();
  private entries = new Map<string, Entry>();
  private doc: MapDocument | null = null;
  private zoom = 1;
  private style: StylePreset | null = null;
  private camera: Camera;
  private longSide: () => number;
  /** Temporary camera used while exporting images. */
  cameraOverride: Camera | null = null;
  private lastKey = '';
  /** Whether objects, and rivers and roads, are shown at all (their names go with them). */
  private objectsShown = true;
  private pathsShown = true;
  /** Where names are drawn now, on screen (peak markers keep clear of them), and a count of redraws. */
  boxes: [number, number, number, number][] = [];
  version = 0;
  /** What is selected: its name shows even when too small to read, and wins where names crowd. */
  private selected = new Set<string>();

  private worldW: number;
  /** The labels of lands and waters: names keep clear of them. */
  labels: LabelLayer | null = null;

  constructor(camera: Camera, longSide: () => number, worldW: number) {
    this.camera = camera;
    this.longSide = longSide;
    this.worldW = worldW;
  }

  setStyle(style: StylePreset) {
    if (style === this.style) return;
    this.style = style;
    for (const e of this.entries.values()) this.build(e);
    this.lastKey = '';
  }

  setShown(objects: boolean, paths: boolean) {
    if (objects === this.objectsShown && paths === this.pathsShown) return;
    this.objectsShown = objects;
    this.pathsShown = paths;
    this.lastKey = '';
  }

  setSelected(ids: Set<string>) {
    this.selected = ids;
    this.lastKey = '';
  }

  private build(e: Entry) {
    const s = e.style;
    e.node.update(
      {
        text: e.kind === 'object' ? (e.src as MapObject).name : (e.src as PathFeature).name,
        font: s.font,
        size: s.size,
        color: s.color,
        halo: s.halo,
        haloColor: this.style?.labelHalo ?? '#f4ead2',
        letterSpacing: s.uppercase ? 0.1 : 0.02,
        uppercase: s.uppercase,
        italic: s.italic,
        curve: 0,
        rotation: e.rotation,
        alpha: 1,
      },
      this.zoom,
    );
    e.node.position.set(e.x, e.y);
  }

  sync(doc: MapDocument) {
    this.doc = doc;
    const L = this.longSide();
    const seen = new Set<string>();
    const put = (key: string, kind: Entry['kind'], src: MapObject | PathFeature, group: NameGroup, style: NameStyle, rotation: number, place: Entry['place'], length: number, priority: number, iconW: number) => {
      seen.add(key);
      const { x, y } = place(style.size);
      let e = this.entries.get(key);
      if (!e) {
        e = { kind, id: src.id, node: new TextLabel(), src, group, style, x, y, rotation, place, length, priority, iconW };
        this.entries.set(key, e);
        this.container.addChild(e.node);
        this.build(e);
        return;
      }
      const changed = e.src !== src || e.group !== group || !sameStyle(e.style, style);
      Object.assign(e, { src, group, style, x, y, rotation, place, length, priority, iconW });
      if (changed) this.build(e);
      else e.node.position.set(x, y);
    };
    for (const o of Object.values(doc.objects)) {
      if (!objectShowsName(o)) continue;
      const style = objectNameStyle(doc, o, L);
      const { w, h } = objectSize(o);
      // under the symbol, a little clear of it, unless it was moved
      const place = (size: number) => {
        const [ox, oy] = o.nameOffset ?? defaultOffset(h, size);
        return { x: o.x + ox, y: o.y + oy };
      };
      put('o:' + o.id, 'object', o, objectNameGroup(doc, o), style, 0, place, 0, w * (1 + (o.layerId === 'layer-settlements' ? 1 : 0)), w);
    }
    for (const p of Object.values(doc.paths)) {
      if (!pathShowsName(p) || p.points.length < 2 || p.oxbow) continue;
      const style = pathNameStyle(doc, p, L);
      const at = pathAnchor(p);
      put('p:' + p.id, 'path', p, pathNameGroup(doc, p), style, at.rotation, (size) => besidePath(p, at, size), at.length, p.width * 4 + at.length * 0.02, 0);
    }
    for (const [key, e] of this.entries)
      if (!seen.has(key)) {
        e.node.destroy();
        this.entries.delete(key);
      }
    this.lastKey = '';
  }

  /** Where an object's name sits, from the symbol's centre. */
  offsetOf(o: MapObject): Vec2 {
    if (o.nameOffset) return o.nameOffset;
    const e = this.entries.get('o:' + o.id);
    return defaultOffset(objectSize(o).h, e ? e.node.worldHeight / 1.25 : 0);
  }

  /** The object or river whose name (as drawn now) is under a map point. */
  hit(x: number, y: number): { kind: 'object' | 'path'; id: string } | null {
    const wrap = this.camera.wrap;
    const W = this.worldW;
    for (const e of this.entries.values()) {
      if (!e.node.renderable) continue;
      const r = (-e.rotation * Math.PI) / 180;
      let dx = x - e.x;
      // on a map that repeats, the copy nearest the point
      if (wrap) dx -= Math.round(dx / W) * W;
      const dy = y - e.y;
      const lx = dx * Math.cos(r) - dy * Math.sin(r);
      const ly = dx * Math.sin(r) + dy * Math.cos(r);
      if (Math.abs(lx) <= e.node.worldWidth / 2 && Math.abs(ly) <= e.node.worldHeight / 2) return { kind: e.kind, id: e.id };
    }
    return null;
  }

  prepare(zoom: number, zoomChanged: boolean) {
    this.zoom = zoom;
    // labels first: names keep clear of them
    this.labels?.prepare(zoom, zoomChanged);
    const cam = this.cameraOverride ?? this.camera;
    const key = `${zoom.toFixed(5)},${cam.x.toFixed(1)},${cam.y.toFixed(1)},${cam.viewW},${cam.viewH},${MIN_NAME_PX},${this.labels?.version ?? 0}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const doc = this.doc;
    if (!doc) return;
    // sizes on screen, and what can show: shown groups, readable sizes, symbols that are drawn
    const layerShown = new Map(doc.objectLayers.map((l) => [l.id, l.visible]));
    const cand: Entry[] = [];
    for (const e of this.entries.values()) {
      const px = screenPx(e.style, e.group, zoom);
      if (e.style.adaptive) {
        e.node.setSize(px / zoom, zoom);
        const at = e.place(px / zoom);
        e.x = at.x;
        e.y = at.y;
        e.node.position.set(at.x, at.y);
      }
      if (zoomChanged) e.node.setZoom(zoom);
      const sure = e.group.always || this.selected.has(e.id);
      let ok = e.group.visible && (sure || readableAt(e.style, e.group, zoom));
      if (ok && e.kind === 'object') {
        const o = e.src as MapObject;
        ok = this.objectsShown && !o.hidden && (layerShown.get(o.layerId) ?? true) && e.iconW * zoom >= MIN_ICON_PX;
      }
      if (ok && e.kind === 'path') ok = this.pathsShown && !(e.src as PathFeature).hidden;
      // an adaptive name hides when what it names is shorter on screen than it
      if (ok && !sure && e.style.adaptive && e.kind === 'path' && e.length * zoom < 1.2 * e.node.worldWidth * zoom) ok = false;
      e.node.renderable = false;
      if (ok) cand.push(e);
    }
    // where names crowd, the more important ones win (a group shown always is never dropped); all
    // keep clear of the labels
    const sure = (e: Entry) => e.group.always || this.selected.has(e.id);
    cand.sort((a, b) => Number(this.selected.has(b.id)) - Number(this.selected.has(a.id)) || Number(b.group.always) - Number(a.group.always) || b.priority - a.priority);
    const placed: [number, number, number, number][] = [...(this.labels?.boxes ?? [])];
    this.boxes = placed;
    this.version++;
    const W = doc && (this.cameraOverride ?? this.camera);
    for (const e of cand) {
      const [sx, sy] = W.worldToScreen(e.x, e.y);
      const r = (e.rotation * Math.PI) / 180;
      const hw0 = (e.node.worldWidth * zoom) / 2;
      const hh0 = (e.node.worldHeight * zoom) / 2;
      const hw = Math.abs(hw0 * Math.cos(r)) + Math.abs(hh0 * Math.sin(r)) + 3;
      const hh = Math.abs(hw0 * Math.sin(r)) + Math.abs(hh0 * Math.cos(r)) + 1;
      if (sx + hw < -40 || sy + hh < -40 || sx - hw > W.viewW + 40 || sy - hh > W.viewH + 40) continue;
      const box: [number, number, number, number] = [sx - hw, sy - hh, sx + hw, sy + hh];
      if (!sure(e) && placed.some((b) => b[0] < box[2] && b[2] > box[0] && b[1] < box[3] && b[3] > box[1])) continue;
      placed.push(box);
      e.node.renderable = true;
      // fade in as it grows readable
      const px = e.style.size * zoom;
      e.node.alpha = sure(e) || e.style.adaptive ? 1 : Math.min(1, (px - MIN_NAME_PX) / 2 + 0.35);
    }
  }
}

const defaultOffset = (h: number, size: number): Vec2 => [0, h / 2 + size * 0.95];


/** How far along a river or road (0–1) the point nearest a map point is. */
export function pathFraction(p: PathFeature, x: number, y: number): number {
  const pts: Vec2[] = sampleSpline(p.points, 1, false, 2);
  let total = 0;
  let best = Infinity;
  let at = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const d = Math.hypot(pts[i][0] - x, pts[i][1] - y);
    if (d < best) {
      best = d;
      at = total;
    }
  }
  return total > 0 ? at / total : 0.5;
}

/** Where along a river or road its name goes: the point `nameAt` of the way, its direction there (never upside down), and its length. */
export function pathAnchor(p: PathFeature): { x: number; y: number; rotation: number; length: number } {
  const pts: Vec2[] = sampleSpline(p.points, 1, false, 2);
  let total = 0;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    cum.push(total);
  }
  const target = total * Math.min(0.95, Math.max(0.05, p.nameAt ?? 0.5));
  let i = 1;
  while (i < pts.length - 1 && cum[i] < target) i++;
  const [ax, ay] = pts[i - 1];
  const [bx, by] = pts[i];
  const t = (target - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
  // the direction over a stretch of the river, not one segment's wiggle
  const back = pts[Math.max(0, i - 6)];
  const fwd = pts[Math.min(pts.length - 1, i + 5)];
  let ang = (Math.atan2(fwd[1] - back[1], fwd[0] - back[0]) * 180) / Math.PI;
  // never upside down
  if (ang > 90) ang -= 180;
  if (ang < -90) ang += 180;
  return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t, rotation: ang, length: total };
}

/** A river's or road's name of letter size `size` beside its line at `at`, above it as read. */
export function besidePath(p: PathFeature, at: { x: number; y: number; rotation: number }, size: number): { x: number; y: number; rotation: number } {
  const r = (at.rotation * Math.PI) / 180;
  const off = p.width / 2 + size * 0.85;
  return { x: at.x + Math.sin(r) * off, y: at.y - Math.cos(r) * off, rotation: at.rotation };
}

/** Where a river's or road's name sits: `nameAt` of the way along it, turned with it, a little to one side. */
export function alongPath(p: PathFeature, size: number): { x: number; y: number; rotation: number } {
  return besidePath(p, pathAnchor(p), size);
}
