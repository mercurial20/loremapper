import { assetLibrary } from '../assets/library';
import { polygonCentroid } from '../core/math';
import { forwardUnwrapped, makeProjection, type Projection, type ProjectionParams } from '../core/projections';
import { formatHeight } from '../core/units';
import type { LabelFont, Vec2 } from '../model/types';
import { FONT_STACK } from '../render/fonts';
import { STYLE_PRESETS, type StylePreset } from '../render/styles';
import { sampleSpline } from '../render/vectorGeometry';
import { useDoc } from '../store/docStore';
import { useEditor } from '../store/editorStore';
import { editor } from './Editor';
import { renderWorldPixels, type FogExport } from './exporter';
import { downloadBlob, safeFileName } from './png';

/**
 * Images of a planet in other map projections. The terrain is rendered on the
 * editor's own (equirectangular) grid and resampled pixel by pixel; rivers,
 * roads, borders, symbols and labels are then drawn in the projection itself,
 * so text stays upright and readable even where the grid is most stretched.
 */

export interface ProjectedExportOptions {
  projection: ProjectionParams;
  width: number;
  fog: FogExport;
  includePeaks: boolean;
}

/** The terrain (and the players' fog) rendered on the editor's grid, ready to be resampled. */
export interface ProjectionSource {
  w: number;
  h: number;
  terrain: Uint8ClampedArray;
  fog: Uint8ClampedArray | null;
}

const PI = Math.PI;

export function projectedSize(p: ProjectionParams, width: number): { width: number; height: number } {
  const proj = makeProjection(p);
  return { width, height: Math.max(1, Math.round((width * (proj.y1 - proj.y0)) / (proj.x1 - proj.x0))) };
}

/** Grid width that gives the output about one source pixel per output pixel where it matters most. */
function sourceWidth(p: ProjectionParams, outW: number): number {
  const proj = makeProjection(p);
  // output pixels per radian at the centre, times a full turn
  const need = ((outW / (proj.x1 - proj.x0)) * proj.k0 * 2 * PI) / (p.id === 'orthographic' ? 1 : 1.1);
  return Math.max(1024, Math.min(8192, Math.round(need / 256) * 256));
}

export async function renderProjectionSource(srcW: number, fog: FogExport, onProgress?: (f: number) => void): Promise<ProjectionSource> {
  const h = srcW / 2;
  const terrain = await renderWorldPixels(srcW, h, 'terrain', (f) => onProgress?.(fog === 'revealed' ? f / 2 : f));
  const fogPx = fog === 'revealed' ? await renderWorldPixels(srcW, h, 'fog', (f) => onProgress?.(0.5 + f / 2)) : null;
  return { w: srcW, h, terrain, fog: fogPx };
}

/** Resample an equirectangular RGBA image into the projection (bilinear; transparent outside the map). */
async function reproject(proj: Projection, src: Uint8ClampedArray, sw: number, sh: number, W: number, H: number, shadeGlobe: boolean, onRow?: (f: number) => Promise<void>): Promise<ImageData> {
  const img = new ImageData(W, H);
  const out = img.data;
  const sx = (proj.x1 - proj.x0) / W;
  const sy = (proj.y1 - proj.y0) / H;
  for (let py = 0; py < H; py++) {
    const Y = proj.y1 - (py + 0.5) * sy;
    for (let px = 0; px < W; px++) {
      const X = proj.x0 + (px + 0.5) * sx;
      const ll = proj.inverse(X, Y);
      if (!ll) continue;
      const u = ((ll[0] / (2 * PI) + 0.5) * sw - 0.5 + sw) % sw;
      const v = Math.max(0, Math.min(sh - 1.001, ((PI / 2 - ll[1]) / PI) * sh - 0.5));
      const i0 = Math.floor(u);
      const j0 = Math.floor(v);
      const fu = u - i0;
      const fv = v - j0;
      const i1 = (i0 + 1) % sw;
      const j1 = Math.min(sh - 1, j0 + 1);
      const a = (j0 * sw + i0) * 4;
      const b = (j0 * sw + i1) * 4;
      const c = (j1 * sw + i0) * 4;
      const d = (j1 * sw + i1) * 4;
      // a globe darkens a little towards its rim, like a sphere lit from the front
      const shade = shadeGlobe ? 0.8 + 0.2 * Math.sqrt(Math.max(0, 1 - X * X - Y * Y)) : 1;
      const o = (py * W + px) * 4;
      for (let k = 0; k < 3; k++) out[o + k] = shade * ((src[a + k] * (1 - fu) + src[b + k] * fu) * (1 - fv) + (src[c + k] * (1 - fu) + src[d + k] * fu) * fv);
      out[o + 3] = (src[a + 3] * (1 - fu) + src[b + 3] * fu) * (1 - fv) + (src[c + 3] * (1 - fu) + src[d + 3] * fu) * fv;
    }
    if (onRow && (py & 63) === 0) await onRow(py / H);
  }
  return img;
}

// ---------------------------------------------------------------- vector layers

const images = new Map<string, Promise<HTMLImageElement | null>>();
const loadedImages = new Map<string, HTMLImageElement | null>();
/** An asset's picture if it has loaded; otherwise starts loading it and calls `onLoad` when ready. */
export function assetImageNow(id: string, onLoad?: () => void): HTMLImageElement | null {
  if (loadedImages.has(id)) return loadedImages.get(id)!;
  void assetImage(id).then(() => onLoad?.());
  return null;
}
function assetImage(id: string): Promise<HTMLImageElement | null> {
  let p = images.get(id);
  if (!p) {
    const url = assetLibrary.get(id)?.url;
    p = url
      ? new Promise((res) => {
          const img = new Image();
          img.onload = () => {
            loadedImages.set(id, img);
            res(img);
          };
          img.onerror = () => {
            loadedImages.set(id, null);
            res(null);
          };
          img.src = url;
        })
      : Promise.resolve(null);
    images.set(id, p);
  }
  return p;
}

/**
 * Where the plane goes on the canvas: the whole map fitted to it (export), or
 * a view with its centre and scale (the live projected view).
 */
export interface PlaneView {
  cx: number;
  cy: number;
  /** canvas pixels per plane unit */
  scale: number;
}

/** Everything the vector pass needs to place things on the output canvas. */
export class Painter {
  readonly ctx: CanvasRenderingContext2D;
  readonly proj: Projection;
  readonly W: number;
  readonly H: number;
  /** Output pixels per world cell at the projection's centre. */
  readonly cell: number;
  /** Line widths and screen-sized symbols grow with the output, so big exports aren't hairline. */
  readonly u: number;
  private mapW: number;
  private mapH: number;

  private view: PlaneView;

  constructor(ctx: CanvasRenderingContext2D, proj: Projection, W: number, H: number, view?: PlaneView) {
    this.ctx = ctx;
    this.proj = proj;
    this.W = W;
    this.H = H;
    const m = editor.model!;
    this.mapW = m.W;
    this.mapH = m.H;
    this.view = view ?? { cx: (proj.x0 + proj.x1) / 2, cy: (proj.y0 + proj.y1) / 2, scale: W / (proj.x1 - proj.x0) };
    this.cell = this.view.scale * proj.k0 * ((2 * PI) / m.W);
    // exports thicken lines and symbols with their size; the live view keeps screen sizes
    this.u = view ? 1 : Math.max(1, W / 1800);
  }

  lonLat(x: number, y: number): [number, number] {
    return [(x / this.mapW) * 2 * PI - PI, PI / 2 - (y / this.mapH) * PI];
  }

  px([X, Y]: [number, number]): [number, number] {
    const v = this.view;
    return [(X - v.cx) * v.scale + this.W / 2, (v.cy - Y) * v.scale + this.H / 2];
  }

  /** Output pixel of a world point, or null where the projection hides it. */
  at(x: number, y: number): [number, number] | null {
    const [lon, lat] = this.lonLat(x, y);
    const f = this.proj.forward(lon, lat);
    return f ? this.px(f) : null;
  }

  /**
   * A world polyline as runs of visible output points, each with its position
   * along the line (0…1). Runs break where the line leaves the map, jumps
   * across a seam, or (on a double-sided map) crosses from one disk to the
   * other: there both runs end exactly on the shared rim.
   */
  runsT(pts: Vec2[]): { pt: [number, number]; t: number }[][] {
    const out: { pt: [number, number]; t: number }[][] = [];
    let cur: { pt: [number, number]; t: number }[] = [];
    const jump = Math.max(this.W, this.H) * 0.25;
    const two = this.proj.parts > 1;
    const n = Math.max(1, pts.length - 1);
    let prev: [number, number] | null = null;
    pts.forEach(([x, y], i) => {
      const t = i / n;
      const ll = this.lonLat(x, y);
      if (two && prev && Math.sign(ll[1]) !== Math.sign(prev[1]) && ll[1] !== 0) {
        // cross the equator: interpolate to it, finish on one rim and start on the other
        const f = prev[1] / (prev[1] - ll[1]);
        const lonE = prev[0] + Math.atan2(Math.sin(ll[0] - prev[0]), Math.cos(ll[0] - prev[0])) * f;
        const from = prev[1] < 0 ? 1 : 0;
        cur.push({ pt: this.px(this.proj.clamp(lonE, 0, from)), t });
        if (cur.length > 1) out.push(cur);
        cur = [{ pt: this.px(this.proj.clamp(lonE, 0, 1 - from)), t }];
      }
      prev = ll;
      const f = this.proj.forward(ll[0], ll[1]);
      const p = f ? this.px(f) : null;
      if (!p || (cur.length && Math.hypot(p[0] - cur[cur.length - 1].pt[0], p[1] - cur[cur.length - 1].pt[1]) > jump)) {
        if (cur.length > 1) out.push(cur);
        cur = p ? [{ pt: p, t }] : [];
        return;
      }
      cur.push({ pt: p, t });
    });
    if (cur.length > 1) out.push(cur);
    return out;
  }

  runs(pts: Vec2[]): [number, number][][] {
    return this.runsT(pts).map((r) => r.map((q) => q.pt));
  }

  /**
   * Fill a world polygon correctly clipped to the map: on world maps it's
   * drawn again shifted a full turn where it crosses the edge meridian; on
   * disks, hidden points are pulled to the rim.
   */
  fillPolygon(pts: Vec2[], fill: () => void) {
    const ctx = this.ctx;
    const proj = this.proj;
    const ll = pts.map(([x, y]) => this.lonLat(x, y));
    const lon0 = (proj.params.lon0 * PI) / 180;
    if (proj.wraps) {
      // longitudes relative to the centre, unwrapped along the outline
      const rel: number[] = [];
      let prev = 0;
      ll.forEach(([lon], i) => {
        let l = Math.atan2(Math.sin(lon - lon0), Math.cos(lon - lon0));
        if (i > 0) l = prev + Math.atan2(Math.sin(l - prev), Math.cos(l - prev));
        rel.push(l);
        prev = l;
      });
      const lo = Math.min(...rel);
      const hi = Math.max(...rel);
      const shifts = [0];
      if (hi > PI) shifts.push(-2 * PI);
      if (lo < -PI) shifts.push(2 * PI);
      ctx.save();
      this.clipTo(0);
      for (const s of shifts) {
        ctx.beginPath();
        rel.forEach((l, i) => {
          const [X, Y] = this.px(forwardUnwrapped(proj, l + s, ll[i][1]));
          if (i === 0) ctx.moveTo(X, Y);
          else ctx.lineTo(X, Y);
        });
        ctx.closePath();
        fill();
      }
      ctx.restore();
      return;
    }
    for (let part = 0; part < proj.parts; part++) {
      // skip a disk the shape never touches
      if (!ll.some(([lon, lat]) => (proj.parts > 1 ? (part === 0 ? lat >= 0 : lat < 0) : proj.forward(lon, lat) !== null))) continue;
      ctx.save();
      this.clipTo(part);
      ctx.beginPath();
      ll.forEach(([lon, lat], i) => {
        const [X, Y] = this.px(proj.clamp(lon, lat, part));
        if (i === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      });
      ctx.closePath();
      fill();
      ctx.restore();
    }
  }

  /** Whether an output pixel lies on the map (inside its outline). */
  inside(x: number, y: number): boolean {
    const v = this.view;
    return this.proj.inverse(v.cx + (x - this.W / 2) / v.scale, v.cy - (y - this.H / 2) / v.scale) !== null;
  }

  clipTo(part: number) {
    const ctx = this.ctx;
    ctx.beginPath();
    this.proj.outline(part).forEach((p, i) => {
      const [X, Y] = this.px(p);
      if (i === 0) ctx.moveTo(X, Y);
      else ctx.lineTo(X, Y);
    });
    ctx.closePath();
    ctx.clip();
  }

  strokeRuns(runs: [number, number][][]) {
    const ctx = this.ctx;
    ctx.beginPath();
    for (const r of runs) {
      ctx.moveTo(r[0][0], r[0][1]);
      for (let i = 1; i < r.length; i++) ctx.lineTo(r[i][0], r[i][1]);
    }
    ctx.stroke();
  }
}

const fontCss = (font: LabelFont, size: number, italic: boolean) =>
  `${italic ? 'italic ' : ''}${font === 'display' ? 600 : 400} ${size.toFixed(2)}px ${FONT_STACK[font].map((f) => f.replace(/"/g, '')).map((f) => (f.includes(' ') ? `"${f}"` : f)).join(', ')}`;

interface TextOpts {
  text: string;
  font: LabelFont;
  size: number;
  color: string;
  halo: string | null;
  letterSpacing: number;
  uppercase: boolean;
  italic: boolean;
  curve: number;
  rotation: number;
  alpha: number;
}

/** Map text as the editor draws it: halo, letter spacing, optional arc. */
function drawText(ctx: CanvasRenderingContext2D, x: number, y: number, o: TextOpts) {
  if (o.size < 2) return;
  const text = o.uppercase ? o.text.toUpperCase() : o.text;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((o.rotation * PI) / 180);
  ctx.globalAlpha *= o.alpha;
  ctx.font = fontCss(o.font, o.size, o.italic);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = o.size * 0.16;
  ctx.strokeStyle = o.halo ?? 'transparent';
  ctx.fillStyle = o.color;
  const spacing = o.letterSpacing * o.size;
  if (Math.abs(o.curve) < 0.02) {
    if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${spacing}px`;
    if (o.halo) ctx.strokeText(text, spacing / 2, 0);
    ctx.fillText(text, spacing / 2, 0);
  } else {
    const chars = [...text];
    const widths = chars.map((c) => ctx.measureText(c).width + spacing);
    const total = widths.reduce((a, b) => a + b, 0);
    const span = o.curve * PI * 0.75;
    const R = total / Math.abs(span);
    const sign = Math.sign(span);
    let s = 0;
    chars.forEach((c, i) => {
      const mid = s + widths[i] / 2;
      s += widths[i];
      if (c === ' ') return;
      const a = ((mid - total / 2) / R) * sign;
      ctx.save();
      ctx.translate(R * Math.sin(a) * sign, sign * R * (1 - Math.cos(a)));
      ctx.rotate(a);
      if (o.halo) ctx.strokeText(c, 0, 0);
      ctx.fillText(c, 0, 0);
      ctx.restore();
    });
  }
  ctx.restore();
}

export interface VectorOptions {
  includePeaks: boolean;
  /** Territories, rivers and roads (the live view gets them from the terrain render instead). */
  shapes: boolean;
  image: (assetId: string) => HTMLImageElement | null;
}

export function drawVectors(p: Painter, style: StylePreset, opts: VectorOptions) {
  const ctx = p.ctx;
  const doc = useDoc.getState().doc;
  const sys = doc.systemLayers;
  const u = p.u;
  const includePeaks = opts.includePeaks;

  // territories: fill, the soft inner band and the border
  if (opts.shapes && sys.territories.visible) {
    ctx.save();
    ctx.globalAlpha = sys.territories.opacity;
    for (const t of Object.values(doc.territories)) {
      if (t.hidden || t.points.length < 3) continue;
      const pts = sampleSpline(t.points, p.cell, true, 6);
      p.fillPolygon(pts, () => {
        ctx.fillStyle = t.color;
        ctx.globalAlpha = sys.territories.opacity * Math.min(1, t.fillOpacity * style.territoryFill);
        ctx.fill();
        ctx.globalAlpha = sys.territories.opacity * 0.3;
        ctx.strokeStyle = t.color;
        ctx.lineWidth = 10 * u;
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.globalAlpha = sys.territories.opacity;
      });
      const runs = p.runs([...pts, pts[0]]);
      const w = Math.max(t.borderWidth, 0.6) * u;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = t.borderColor;
      if (t.borderStyle === 'double') {
        ctx.lineWidth = w * 3.2;
        p.strokeRuns(runs);
        ctx.strokeStyle = style.paper;
        ctx.lineWidth = w * 1.4;
        p.strokeRuns(runs);
      } else {
        ctx.lineWidth = t.borderStyle === 'dotted' ? w * 1.4 : w;
        ctx.setLineDash(t.borderStyle === 'dashed' ? [w * 5, w * 3] : t.borderStyle === 'dotted' ? [0.01, w * 2.8] : []);
        p.strokeRuns(runs);
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  // rivers below roads
  if (opts.shapes && sys.paths.visible) {
    ctx.save();
    ctx.globalAlpha = sys.paths.opacity;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const paths = Object.values(doc.paths).filter((x) => !x.hidden && x.points.length >= 2);
    for (const path of [...paths.filter((x) => x.kind === 'river'), ...paths.filter((x) => x.kind !== 'river')]) {
      const pts = sampleSpline(path.points, p.cell, false, 4);
      if (path.kind === 'river') {
        const wMax = Math.max(path.width * p.cell, 2.2 * u);
        const wMin = Math.max(path.taper ? path.width * 0.22 * p.cell : path.width * p.cell, 0.9 * u);
        // widths follow the whole river, even where it is cut into runs
        const runs = p.runsT(pts);
        for (const pass of [0, 1])
          for (const r of runs)
            for (let i = 1; i < r.length; i++) {
              const w = wMin + (wMax - wMin) * Math.pow(r[i].t, 0.8);
              ctx.beginPath();
              ctx.moveTo(r[i - 1].pt[0], r[i - 1].pt[1]);
              ctx.lineTo(r[i].pt[0], r[i].pt[1]);
              // an ink edge first, then the water
              ctx.strokeStyle = pass === 0 ? style.ink : path.color;
              ctx.globalAlpha = sys.paths.opacity * (pass === 0 ? 0.55 : 1);
              ctx.lineWidth = pass === 0 ? w + 1.8 * u : w;
              ctx.stroke();
            }
        ctx.globalAlpha = sys.paths.opacity;
        continue;
      }
      const runs = p.runs(pts);
      const w = Math.max(path.width * p.cell, 1.2 * u);
      ctx.strokeStyle = path.color;
      if (path.style === 'double') {
        ctx.lineWidth = w * 1.8;
        p.strokeRuns(runs);
        ctx.strokeStyle = style.paper;
        ctx.lineWidth = w * 0.8;
        p.strokeRuns(runs);
        continue;
      }
      ctx.lineWidth = path.style === 'dotted' ? w * 1.2 : w;
      ctx.setLineDash(path.style === 'solid' ? [] : path.style === 'dotted' ? [0.01, w * 2.6] : [w * 4, w * 2.6]);
      p.strokeRuns(runs);
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  // symbols, in their layers' order and each layer's opacity
  if (sys.objects.visible) {
    const layers = new Map(doc.objectLayers.map((l, i) => [l.id, { ...l, order: i }]));
    const objs = Object.values(doc.objects)
      .filter((o) => !o.hidden && (layers.get(o.layerId)?.visible ?? true))
      .sort((a, b) => (layers.get(a.layerId)?.order ?? 0) - (layers.get(b.layerId)?.order ?? 0) || a.z - b.z);
    for (const o of objs) {
      const q = p.at(o.x, o.y);
      if (!q) continue;
      const img = opts.image(o.assetId);
      if (!img) continue;
      const aspect = assetLibrary.get(o.assetId)?.aspect ?? img.naturalHeight / Math.max(1, img.naturalWidth);
      const w = o.size * o.scale * p.cell;
      const h = w * aspect;
      ctx.save();
      ctx.translate(q[0], q[1]);
      ctx.rotate((o.rotation * PI) / 180);
      ctx.scale(o.flipX ? -1 : 1, 1);
      ctx.globalAlpha = sys.objects.opacity * o.opacity * (layers.get(o.layerId)?.opacity ?? 1);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }

  // realm names, then free labels
  if (sys.territories.visible)
    for (const t of Object.values(doc.territories)) {
      if (t.hidden || !t.showLabel || t.points.length < 3) continue;
      const [lx, ly] = t.labelPos ?? polygonCentroid(t.points);
      const q = p.at(lx, ly);
      if (!q) continue;
      ctx.globalAlpha = sys.territories.opacity;
      drawText(ctx, q[0], q[1], { text: t.name, font: 'display', size: t.labelSize * p.cell, color: t.borderColor, halo: style.labelHalo, letterSpacing: 0.18, uppercase: true, italic: false, curve: 0, rotation: 0, alpha: 0.92 });
    }
  if (sys.labels.visible)
    for (const l of Object.values(doc.labels)) {
      if (l.hidden || !l.text) continue;
      const q = p.at(l.x, l.y);
      if (!q) continue;
      ctx.globalAlpha = sys.labels.opacity;
      drawText(ctx, q[0], q[1], {
        text: l.text,
        font: l.font,
        size: l.size * p.cell,
        color: l.color,
        halo: l.halo ? style.labelHalo : null,
        letterSpacing: l.letterSpacing,
        uppercase: l.uppercase,
        italic: l.italic,
        curve: l.curve,
        rotation: l.rotation,
        alpha: l.opacity,
      });
    }
  ctx.globalAlpha = 1;

  // peaks: ▲ name · elevation, decluttered like the editor's markers
  if (includePeaks && doc.view.showPeaks && sys.peaks.visible) {
    const units = useEditor.getState().units;
    const ranked = useEditor
      .getState()
      .peaks.filter((k) => k.designated || k.elevation >= doc.view.peakMinElevation)
      .sort((a, b) => Number(b.designated) - Number(a.designated) || b.elevation - a.elevation);
    const placed: [number, number, number, number][] = [];
    const fs = 12 * u;
    for (const k of ranked) {
      if (placed.length >= 150) break;
      const q = p.at(k.x, k.y);
      if (!q) continue;
      const lines = [...(k.name ? [k.name] : []), formatHeight(k.elevation, units)];
      const bw = Math.max(96 * u, Math.max(...lines.map((l) => l.length)) * 6.6 * u + 24 * u);
      const box: [number, number, number, number] = [q[0] - bw / 2, q[1] - 24 * u, q[0] + bw / 2, q[1] + (lines.length * 13 + 30) * u];
      if (!k.designated && placed.some((b) => b[0] < box[2] && b[2] > box[0] && b[1] < box[3] && b[3] > box[1])) continue;
      // a label running off the map's rim would be cut: leave that peak out
      const tw = (Math.max(...lines.map((l) => l.length)) * 6.6 * u) / 2;
      if (!p.inside(q[0] - tw, q[1] + 6 * u) || !p.inside(q[0] + tw, q[1] + (6 + lines.length * 13) * u)) continue;
      placed.push(box);
      ctx.save();
      ctx.globalAlpha = sys.peaks.opacity;
      ctx.beginPath();
      ctx.moveTo(q[0], q[1] - 9 * u);
      ctx.lineTo(q[0] + 7 * u, q[1] + 3 * u);
      ctx.lineTo(q[0] - 7 * u, q[1] + 3 * u);
      ctx.closePath();
      ctx.fillStyle = k.designated ? '#8f2a1e' : style.ink;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.6 * u;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.font = fontCss('serif', fs, false).replace(/^400/, '600');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.lineWidth = 3.2 * u;
      ctx.strokeStyle = style.labelHalo;
      ctx.fillStyle = style.ink;
      lines.forEach((line, i) => {
        ctx.strokeText(line, q[0], q[1] + 6 * u + i * 13 * u);
        ctx.fillText(line, q[0], q[1] + 6 * u + i * 13 * u);
      });
      ctx.restore();
    }
  }
}

/**
 * Draw the planet in a projection onto a canvas: resampled terrain, the
 * vector layers drawn in place, the players' fog on top and a thin frame.
 */
export async function drawProjected(canvas: HTMLCanvasElement, o: ProjectedExportOptions, src: ProjectionSource, onProgress?: (stage: string, f: number) => void) {
  const proj = makeProjection(o.projection);
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext('2d')!;
  const doc = useDoc.getState().doc;
  const style = STYLE_PRESETS[doc.view.style] ?? STYLE_PRESETS.parchment;
  const globe = o.projection.id === 'orthographic';
  const tick = async (stage: string, f: number) => {
    onProgress?.(stage, f);
    await new Promise((res) => setTimeout(res, 0));
  };
  ctx.clearRect(0, 0, W, H);
  ctx.putImageData(await reproject(proj, src.terrain, src.w, src.h, W, H, globe, (f) => tick('Reprojecting the terrain…', f)), 0, 0);
  const painter = new Painter(ctx, proj, W, H);
  await tick('Drawing borders, rivers and labels…', 0);
  // load every symbol's picture first, so drawing is one synchronous pass
  const ids = [...new Set(Object.values(doc.objects).map((x) => x.assetId))];
  const pics = new Map(await Promise.all(ids.map(async (id) => [id, await assetImage(id)] as const)));
  drawVectors(painter, style, { includePeaks: o.includePeaks, shapes: true, image: (id) => pics.get(id) ?? null });
  if (src.fog) {
    const fog = await reproject(proj, src.fog, src.w, src.h, W, H, false, (f) => tick('Reprojecting the fog…', f));
    const layer = document.createElement('canvas');
    layer.width = W;
    layer.height = H;
    layer.getContext('2d')!.putImageData(fog, 0, 0);
    ctx.drawImage(layer, 0, 0);
  }
  // frame the map (the editor's own grid needs none)
  if (o.projection.id !== 'equirectangular') {
    ctx.save();
    ctx.strokeStyle = style.coastInk;
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 1.6 * painter.u;
    for (let part = 0; part < proj.parts; part++) {
      ctx.beginPath();
      proj.outline(part).forEach((q, i) => {
        const [X, Y] = painter.px(q);
        if (i === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      });
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }
}

export async function exportProjectedImage(o: ProjectedExportOptions) {
  const meta = useDoc.getState().meta!;
  const { width, height } = projectedSize(o.projection, o.width);
  const st = useEditor.getState();
  st.set({ busy: 'Rendering the planet…' });
  try {
    const src = await renderProjectionSource(sourceWidth(o.projection, width), o.fog, (f) => st.set({ busy: `Rendering the planet… ${Math.round(f * 100)}%` }));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    await drawProjected(canvas, o, src, (stage, f) => st.set({ busy: `${stage} ${Math.round(f * 100)}%` }));
    st.set({ busy: 'Saving the image…' });
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) throw new Error('The browser could not encode an image this large. Try a smaller width.');
    downloadBlob(blob, `${safeFileName(meta.name)}-${o.projection.id}${o.fog === 'revealed' ? '-player' : ''}-${width}x${height}.png`);
  } finally {
    st.set({ busy: null });
  }
}
