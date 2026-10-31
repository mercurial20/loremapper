import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { formatHeight } from '../core/units';
import { MIN_NAME_PX, peakNameGroup, peakNameStyle } from '../model/names';
import type { MapDocument, NameGroup, NameStyle } from '../model/types';
import { useEditor } from '../store/editorStore';
import type { ResolvedPeak } from '../terrain/peaks';
import type { Camera } from './Camera';
import { FONT_STACK } from './fonts';
import type { WorldLayer } from './MapRenderer';
import { hexToNumber, type StylePreset } from './styles';

interface Marker {
  node: Container;
  tri: Graphics;
  text: Text;
  key: string;
  res: number;
}

const MAX_MARKERS = 90;
/** Font size the marker's text is set at (scaled to the style's size on screen). */
const BASE = 24;

/**
 * Peak markers (▲ name · elevation), styled by the Peaks group (and a named peak's own style), sized
 * on the map: hidden when too small to read (designated peaks and an always-shown group excepted)
 * and decluttered, the highest first.
 */
export class PeakLayer implements WorldLayer {
  readonly container = new Container();
  private markers = new Map<string, Marker>();
  /** Peaks worth showing, most important first (recomputed only when peaks change). */
  private ranked: ResolvedPeak[] = [];
  private selected: string | null = null;
  private dirty = true;
  private lastZoom = 0;
  private lastCam = '';
  private style: StylePreset | null = null;
  private doc: MapDocument | null = null;
  private textStyles = new Map<string, TextStyle>();
  private camera: Camera;
  /** Temporary camera used while exporting images. */
  cameraOverride: Camera | null = null;
  private worldW: number;
  private longSide: () => number;
  /** Names drawn on screen, which markers keep clear of (redrawn when their version changes). */
  avoid: { boxes: [number, number, number, number][]; version: number } | null = null;
  private avoidVersion = -1;

  constructor(camera: Camera, worldW: number, longSide: () => number = () => worldW) {
    this.camera = camera;
    this.worldW = worldW;
    this.longSide = longSide;
  }

  private clear() {
    for (const m of this.markers.values()) m.node.destroy({ children: true });
    this.markers.clear();
    this.textStyles.clear();
    this.dirty = true;
  }

  setStyle(style: StylePreset) {
    if (style === this.style) return;
    this.style = style;
    this.clear();
  }

  /** The document's name groups and peak names changed. */
  setDoc(doc: MapDocument) {
    if (this.doc && doc.nameGroups === this.doc.nameGroups && doc.peaks === this.doc.peaks) {
      this.doc = doc;
      return;
    }
    this.doc = doc;
    this.clear();
  }

  /** Redraw labels (e.g. after the display units changed). */
  invalidate() {
    this.dirty = true;
    for (const m of this.markers.values()) m.key = '';
  }

  setPeaks(peaks: ResolvedPeak[], minElevation: number, selected: string | null) {
    this.selected = selected;
    this.ranked = peaks
      .filter((p) => p.designated || p.elevation >= minElevation)
      .sort((a, b) => Number(b.designated) - Number(a.designated) || b.elevation - a.elevation);
    this.dirty = true;
  }

  private textStyle(s: NameStyle): TextStyle {
    const key = `${s.font}|${s.color}|${s.halo}|${s.italic}`;
    let ts = this.textStyles.get(key);
    if (!ts) {
      ts = new TextStyle({
        fontFamily: [...FONT_STACK[s.font]],
        fontSize: BASE,
        fontWeight: s.font === 'display' ? '600' : '500',
        fontStyle: s.italic ? 'italic' : 'normal',
        fill: s.color,
        stroke: s.halo ? { color: this.style?.labelHalo ?? '#f4ead2', width: BASE * 0.26, join: 'round' } : undefined,
        align: 'center',
        lineHeight: BASE * 1.08,
      });
      this.textStyles.set(key, ts);
    }
    return ts;
  }

  private styleOf(p: ResolvedPeak): { style: NameStyle; group: NameGroup | null } {
    const doc = this.doc;
    if (!doc) return { style: { font: 'serif', size: this.longSide() / 200, color: this.style?.ink ?? '#2b2016', halo: true, uppercase: false, italic: false }, group: null };
    const ann = p.annotationId ? doc.peaks[p.annotationId] : undefined;
    return { style: peakNameStyle(doc, ann, this.longSide()), group: peakNameGroup(doc, ann) };
  }

  prepare(zoom: number) {
    const cam = this.cameraOverride ?? this.camera;
    const camKey = `${cam.x.toFixed(1)},${cam.y.toFixed(1)},${cam.viewW},${cam.viewH}`;
    const av = this.avoid?.version ?? -1;
    if (!this.dirty && zoom === this.lastZoom && camKey === this.lastCam && av === this.avoidVersion) return;
    this.dirty = false;
    this.avoidVersion = av;
    const names = this.avoid?.boxes ?? [];
    this.lastZoom = zoom;
    this.lastCam = camKey;
    const placed: [number, number, number, number][] = [];
    const used = new Set<string>();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let n = 0;
    for (const p of this.ranked) {
      if (n >= MAX_MARKERS) break;
      const { style, group } = this.styleOf(p);
      if (group && !group.visible) continue;
      const sel = p.id === this.selected;
      // the letter size on screen: too small to read, the peak is left out (unless it must show)
      const px = style.size * zoom;
      if (px < MIN_NAME_PX && !p.designated && !sel && !group?.always) continue;
      const f = Math.max(px, MIN_NAME_PX * 0.7) / BASE;
      const [sx, sy] = cam.worldToScreen(p.x, p.y);
      if (sx < -60 * f || sy < -40 * f || sx > cam.viewW + 60 * f || sy > cam.viewH + 40 * f) continue;
      const name = p.name ? (style.uppercase ? p.name.toUpperCase() : p.name) : '';
      const label = (name ? name + '\n' : '') + formatHeight(p.elevation, useEditor.getState().units);
      // the marker's box on screen (generous, so markers keep well apart)
      const chars = label.split('\n').reduce((m, l) => Math.max(m, l.length), 0);
      const w = Math.max(4 * BASE, chars * BASE * 0.55 + BASE) * f;
      const h = ((name ? 2.6 : 1.5) * BASE + BASE * 0.6) * f;
      const box: [number, number, number, number] = [sx - w / 2, sy - BASE * f, sx + w / 2, sy - BASE * f + h];
      // against names, only what the marker covers: its triangle and its text
      const tw = Math.max(chars * BASE * 0.5, BASE * 1.2) * f;
      const lineCount = name ? 2 : 1;
      const ink: [number, number, number, number] = [sx - tw / 2, sy - 0.8 * BASE * f, sx + tw / 2, sy + (0.3 + lineCount * 1.08) * BASE * f];
      const over = (a: [number, number, number, number]) => (b: [number, number, number, number]) => b[0] < a[2] && b[2] > a[0] && b[1] < a[3] && b[3] > a[1];
      if (!sel && !p.designated && (placed.some(over(box)) || names.some(over(ink)))) continue;
      placed.push(box);
      used.add(p.id);
      n++;
      // text drawn at the resolution its size on screen needs
      const res = Math.min(4, Math.max(0.5, Math.pow(1.5, Math.round(Math.log(f * dpr) / Math.log(1.5)))));
      const ts = this.textStyle(style);
      let m = this.markers.get(p.id);
      const key = `${label}|${sel}|${p.designated}|${style.color}|${style.font}|${style.halo}|${style.italic}`;
      if (!m) {
        const node = new Container();
        const tri = new Graphics();
        const text = new Text({ text: label, style: ts, resolution: res });
        text.anchor.set(0.5, 0);
        text.position.set(0, BASE * 0.3);
        node.addChild(tri, text);
        this.container.addChild(node);
        m = { node, tri, text, key: '', res };
        this.markers.set(p.id, m);
      }
      if (m.key !== key) {
        m.key = key;
        m.text.style = ts;
        m.text.text = label;
        const ink = hexToNumber(style.color);
        const k = BASE / 12;
        m.tri.clear();
        if (sel) m.tri.circle(0, -2 * k, 11 * k).fill({ color: 0xffc94d, alpha: 0.45 });
        m.tri.poly([0, -9 * k, 7 * k, 3 * k, -7 * k, 3 * k]).fill({ color: p.designated ? 0x8f2a1e : ink }).stroke({ width: 1.6 * k, color: 0xffffff, alpha: 0.85, join: 'round' });
      }
      if (m.res !== res) {
        m.res = res;
        m.text.resolution = res;
      }
      // on a map that repeats, place at the copy nearest the camera; other copies are drawn by extra passes
      const dx = cam.wrap ? ((((p.x - cam.x) % this.worldW) + this.worldW * 1.5) % this.worldW) - this.worldW / 2 : p.x - cam.x;
      m.node.position.set(cam.x + dx, p.y);
      m.node.scale.set(f / zoom);
      m.node.alpha = px >= MIN_NAME_PX || p.designated || sel || group?.always ? 1 : 0.6;
      m.node.visible = true;
    }
    for (const [id, m] of this.markers) {
      if (!used.has(id)) {
        m.node.destroy({ children: true });
        this.markers.delete(id);
      }
    }
  }
}
