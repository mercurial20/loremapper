import { Container, Graphics } from 'pixi.js';
import type { MapDocument, WaterSource } from '../model/types';
import type { WorldLayer } from './MapRenderer';
import { hexToNumber, type StylePreset } from './styles';

/*
 * Marshes where the water of a source spreads over flat ground, drawn with the map maker's sign
 * for a marsh: short strokes of standing water with tufts of reeds over them, some over a pool
 * of open water, scattered over the marsh and thinning out towards its edge. The signs keep their
 * size on screen, as symbols do, and are laid out again when the zoom changes much.
 */

/** Room for one sign, screen pixels. */
const SPACING = 26;
/** Most signs drawn for all the marshes at once (beyond it they are spread out more). */
const MAX_SIGNS = 6000;

const zoomBucket = (z: number) => Math.round(Math.log2(z) * 2);

/** A number in 0 … 1 from a point of a grid (the same every time). */
function hash(i: number, j: number, k: number): number {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class MarshLayer implements WorldLayer {
  readonly container = new Container();
  private g = new Graphics();
  private sources: Record<string, WaterSource> | null = null;
  private style: StylePreset | null = null;
  private bucket = NaN;
  private zoom = 1;
  /** The part of the map the signs are laid out over now, and the part wanted this frame. */
  private drawn: [number, number, number, number] | null = null;
  private want: [number, number, number, number] | null = null;
  private stale = true;

  /** `wet`: whether a point is open water (a river, a lake, the sea), where no sign goes. */
  constructor(private wet: (x: number, y: number) => boolean) {
    this.container.addChild(this.g);
  }

  setStyle(style: StylePreset) {
    if (style === this.style) return;
    this.style = style;
    this.stale = true;
  }

  sync(doc: MapDocument) {
    if (doc.sources === this.sources) return;
    this.sources = doc.sources;
    this.stale = true;
  }

  prepare(zoom: number) {
    this.zoom = zoom;
    if (zoomBucket(zoom) !== this.bucket) this.stale = true;
    this.want = null;
  }

  /** The part of the map in view (once for every copy of a repeating planet). */
  cull(x0: number, y0: number, x1: number, y1: number) {
    const w = this.want;
    this.want = w ? [Math.min(w[0], x0), Math.min(w[1], y0), Math.max(w[2], x1), Math.max(w[3], y1)] : [x0, y0, x1, y1];
    const d = this.drawn;
    const [a, b, c, e] = this.want;
    if (!this.stale && d && a >= d[0] && b >= d[1] && c <= d[2] && e <= d[3]) return;
    // laid out over the view and half as much again around it, so a little panning keeps them
    const mx = (c - a) / 2;
    const my = (e - b) / 2;
    this.draw([a - mx, b - my, c + mx, e + my]);
  }

  private draw(rect: [number, number, number, number]) {
    const g = this.g;
    g.clear();
    this.stale = false;
    this.drawn = rect;
    this.bucket = zoomBucket(this.zoom);
    const style = this.style;
    if (!style || !this.sources) return;
    const [rx0, ry0, rx1, ry1] = rect;
    const discs = Object.values(this.sources)
      .flatMap((s) => s.made.marshes)
      .filter((d) => d.x + d.r >= rx0 && d.x - d.r <= rx1 && d.y + d.r >= ry0 && d.y - d.r <= ry1);
    if (!discs.length) return;
    const z = Math.pow(2, this.bucket / 2);
    const px = 1 / z;
    // spread the signs out further where there would be too many
    const area = (rx1 - rx0) * (ry1 - ry0);
    const sp = Math.max(SPACING * px, Math.sqrt(area / MAX_SIGNS / 2));
    const ink = hexToNumber(style.coastInk);
    const pool = hexToNumber(style.water[1]?.[1] ?? '#9cb6ad');
    // a grid over all the marshes, a sign jittered in each square that lies in one
    const seen = new Set<string>();
    for (const d of discs) {
      const i0 = Math.floor(Math.max(rx0, d.x - d.r) / sp);
      const i1 = Math.floor(Math.min(rx1, d.x + d.r) / sp);
      const j0 = Math.floor(Math.max(ry0, d.y - d.r) / sp);
      const j1 = Math.floor(Math.min(ry1, d.y + d.r) / sp);
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const key = `${i},${j}`;
          if (seen.has(key)) continue;
          // (rows shifted by half a square, as signs are set in a marsh)
          const x = (i + 0.5 + (j % 2 ? 0.5 : 0) + (hash(i, j, 1) - 0.5) * 0.8) * sp;
          const y = (j + 0.5 + (hash(i, j, 2) - 0.5) * 0.6) * sp;
          // how far in the marsh it lies: the signs thin out towards its edge
          let inside = 0;
          for (const e of discs) {
            const q = 1 - Math.hypot(x - e.x, y - e.y) / e.r;
            if (q > inside) inside = q;
          }
          // (and some left out, so they do not stand in rows like a planted field)
          if (inside <= 0 || hash(i, j, 3) > 0.8 * Math.min(1, inside * 3)) continue;
          seen.add(key);
          if (this.wet(x, y)) continue;
          this.sign(g, x, y, px, hash(i, j, 4), ink, pool);
        }
    }
  }

  /** One sign: a stroke of water with a tuft of reeds over it, sometimes over a little pool. */
  private sign(g: Graphics, x: number, y: number, px: number, r: number, ink: number, pool: number) {
    const w = (7 + 3 * r) * px;
    if (r < 0.28) g.ellipse(x, y + 0.6 * px, w * 0.62, 1.9 * px).fill({ color: pool, alpha: 0.75 });
    g.moveTo(x - w / 2, y).lineTo(x + w / 2, y);
    g.moveTo(x - w * 0.3, y + 2.4 * px).lineTo(x + w * 0.3, y + 2.4 * px);
    // the tuft: three blades fanning up from the middle
    const top = (3.6 + 1.6 * r) * px;
    g.moveTo(x, y).lineTo(x, y - top);
    g.moveTo(x - 0.4 * px, y).lineTo(x - 2.2 * px, y - top * 0.75);
    g.moveTo(x + 0.4 * px, y).lineTo(x + 2.2 * px, y - top * 0.75);
    g.stroke({ width: 1 * px, color: ink, alpha: 0.7, cap: 'round' });
  }
}
