import { CanvasTextMetrics, Container, Text, TextStyle } from 'pixi.js';
import type { LabelFont } from '../model/types';
import { FONT_STACK } from './fonts';

const BASE = 64;

export interface TextLabelOptions {
  text: string;
  font: LabelFont;
  /** Font size in world units. */
  size: number;
  color: string;
  halo: boolean;
  haloColor: string;
  /** em units */
  letterSpacing: number;
  uppercase: boolean;
  italic: boolean;
  /** -1..1 */
  curve: number;
  rotation: number;
  alpha: number;
}

/**
 * World-space text rendered at a resolution matched to the current zoom,
 * optionally laid out along an arc.
 */
export class TextLabel extends Container {
  private opts: TextLabelOptions | null = null;
  private resBucket = NaN;
  private glyphs: Text[] = [];
  private style = new TextStyle({});
  /** Width of the laid-out text in world units. */
  worldWidth = 0;
  worldHeight = 0;

  update(o: TextLabelOptions, zoom: number) {
    const prev = this.opts;
    this.opts = o;
    const layoutChanged =
      !prev ||
      prev.text !== o.text ||
      prev.font !== o.font ||
      prev.color !== o.color ||
      prev.halo !== o.halo ||
      prev.haloColor !== o.haloColor ||
      prev.letterSpacing !== o.letterSpacing ||
      prev.uppercase !== o.uppercase ||
      prev.italic !== o.italic ||
      prev.curve !== o.curve;
    if (layoutChanged) this.build(zoom);
    this.scale.set(o.size / BASE);
    this.rotation = (o.rotation * Math.PI) / 180;
    this.alpha = o.alpha;
    this.worldWidth = (this.measuredWidth * o.size) / BASE;
    this.worldHeight = o.size * 1.25;
    this.setZoom(zoom, layoutChanged);
  }

  private measuredWidth = 0;

  private build(zoom: number) {
    const o = this.opts!;
    for (const g of this.glyphs) g.destroy();
    this.glyphs = [];
    this.removeChildren();
    const text = o.uppercase ? o.text.toUpperCase() : o.text;
    this.style = new TextStyle({
      fontFamily: FONT_STACK[o.font],
      fontSize: BASE,
      fontStyle: o.italic ? 'italic' : 'normal',
      fontWeight: o.font === 'display' ? '600' : '400',
      fill: o.color,
      letterSpacing: o.letterSpacing * BASE,
      stroke: o.halo ? { color: o.haloColor, width: BASE * 0.16, join: 'round' } : undefined,
      padding: 8,
    });
    if (Math.abs(o.curve) < 0.02) {
      const t = new Text({ text, style: this.style, resolution: this.resolutionFor(zoom) });
      t.anchor.set(0.5);
      this.glyphs.push(t);
      this.addChild(t);
      this.measuredWidth = t.width;
      return;
    }
    // per-glyph arc layout
    const chars = [...text];
    const widths = chars.map((c) => CanvasTextMetrics.measureText(c === ' ' ? ' ' : c, this.style).width + o.letterSpacing * BASE);
    const total = widths.reduce((a, b) => a + b, 0);
    const span = o.curve * Math.PI * 0.75;
    const R = total / Math.abs(span);
    let s = 0;
    chars.forEach((c, i) => {
      const mid = s + widths[i] / 2;
      s += widths[i];
      if (c === ' ') return;
      const a = ((mid - total / 2) / R) * Math.sign(span);
      const t = new Text({ text: c, style: this.style, resolution: this.resolutionFor(zoom) });
      t.anchor.set(0.5);
      const sign = Math.sign(span);
      t.position.set(R * Math.sin(a) * sign, sign * R * (1 - Math.cos(a)));
      t.rotation = a;
      this.glyphs.push(t);
      this.addChild(t);
    });
    this.measuredWidth = total;
  }

  private resolutionFor(zoom: number) {
    const o = this.opts!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = ((zoom * o.size) / BASE) * dpr;
    // quantise so zooming doesn't regenerate textures every frame
    return Math.min(3, Math.max(0.15, Math.pow(1.6, Math.round(Math.log(r) / Math.log(1.6)))));
  }

  setZoom(zoom: number, force = false) {
    if (!this.opts) return;
    const res = this.resolutionFor(zoom);
    const screenPx = (this.opts.size * zoom);
    this.visible = screenPx >= 3;
    if (!force && res === this.resBucket) return;
    this.resBucket = res;
    for (const g of this.glyphs) if (g.resolution !== res) g.resolution = res;
  }

  override destroy() {
    for (const g of this.glyphs) g.destroy();
    super.destroy({ children: true });
  }
}
