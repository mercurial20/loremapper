import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { formatHeight } from '../core/units';
import { useEditor } from '../store/editorStore';
import type { ResolvedPeak } from '../terrain/peaks';
import type { Camera } from './Camera';
import { FONT_FAMILY } from './fonts';
import type { WorldLayer } from './MapRenderer';
import { hexToNumber, type StylePreset } from './styles';

interface Marker {
  node: Container;
  tri: Graphics;
  text: Text;
  key: string;
}

const MAX_MARKERS = 90;

/** Peak indicators (▲ name · elevation) kept at constant screen size and decluttered. */
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
  private textStyle = new TextStyle({});
  private camera: Camera;
  /** Temporary camera used while exporting images. */
  cameraOverride: Camera | null = null;
  private worldW: number;

  constructor(camera: Camera, worldW: number) {
    this.camera = camera;
    this.worldW = worldW;
    this.buildStyle();
  }

  private buildStyle() {
    this.textStyle = new TextStyle({
      fontFamily: FONT_FAMILY.serif,
      fontSize: 12,
      fontWeight: '600',
      fill: this.style?.ink ?? '#2b2016',
      stroke: { color: this.style?.labelHalo ?? '#f4ead2', width: 3.2, join: 'round' },
      align: 'center',
      lineHeight: 13,
    });
  }

  setStyle(style: StylePreset) {
    if (style === this.style) return;
    this.style = style;
    this.buildStyle();
    for (const m of this.markers.values()) m.node.destroy({ children: true });
    this.markers.clear();
    this.dirty = true;
  }

  /** Redraw labels (e.g. after the display units changed). */
  invalidate() {
    this.dirty = true;
  }

  setPeaks(peaks: ResolvedPeak[], minElevation: number, selected: string | null) {
    this.selected = selected;
    this.ranked = peaks
      .filter((p) => p.designated || p.elevation >= minElevation)
      .sort((a, b) => Number(b.designated) - Number(a.designated) || b.elevation - a.elevation);
    this.dirty = true;
  }

  prepare(zoom: number) {
    const cam = this.cameraOverride ?? this.camera;
    const camKey = `${cam.x.toFixed(1)},${cam.y.toFixed(1)},${cam.viewW},${cam.viewH}`;
    if (!this.dirty && zoom === this.lastZoom && camKey === this.lastCam) return;
    this.dirty = false;
    this.lastZoom = zoom;
    this.lastCam = camKey;
    const placed: [number, number, number, number][] = [];
    const used = new Set<string>();
    let n = 0;
    for (const p of this.ranked) {
      if (n >= MAX_MARKERS) break;
      const [sx, sy] = cam.worldToScreen(p.x, p.y);
      if (sx < -60 || sy < -40 || sx > cam.viewW + 60 || sy > cam.viewH + 40) continue;
      const label = (p.name ? p.name + '\n' : '') + formatHeight(p.elevation, useEditor.getState().units);
      // generous boxes keep markers well spaced at every zoom
      const w = Math.max(96, label.split('\n').reduce((m, l) => Math.max(m, l.length), 0) * 6.6 + 24);
      const h = (p.name ? 34 : 22) + 30;
      const box: [number, number, number, number] = [sx - w / 2, sy - 24, sx + w / 2, sy - 24 + h];
      const sel = p.id === this.selected;
      if (!sel && !p.designated && placed.some((b) => b[0] < box[2] && b[2] > box[0] && b[1] < box[3] && b[3] > box[1])) continue;
      placed.push(box);
      used.add(p.id);
      n++;
      let m = this.markers.get(p.id);
      const key = `${label}|${sel}`;
      if (!m) {
        const node = new Container();
        const tri = new Graphics();
        const text = new Text({ text: label, style: this.textStyle, resolution: Math.min(2, window.devicePixelRatio || 1) * 1.5 });
        text.anchor.set(0.5, 0);
        text.position.set(0, 6);
        node.addChild(tri, text);
        this.container.addChild(node);
        m = { node, tri, text, key: '' };
        this.markers.set(p.id, m);
      }
      if (m.key !== key) {
        m.key = key;
        m.text.text = label;
        const ink = hexToNumber(this.style?.ink ?? '#2b2016');
        m.tri.clear();
        if (sel) m.tri.circle(0, -2, 11).fill({ color: 0xffc94d, alpha: 0.45 });
        m.tri.poly([0, -9, 7, 3, -7, 3]).fill({ color: p.designated ? 0x8f2a1e : ink }).stroke({ width: 1.6, color: 0xffffff, alpha: 0.85, join: 'round' });
      }
      // place at the wrap copy nearest the camera; other copies are drawn by extra passes
      const dx = (((p.x - cam.x) % this.worldW) + this.worldW * 1.5) % this.worldW - this.worldW / 2;
      m.node.position.set(cam.x + dx, p.y);
      m.node.scale.set(1 / zoom);
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
