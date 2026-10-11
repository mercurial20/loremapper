import { Container, Geometry, GlProgram, Mesh, RenderTexture, Shader, UniformGroup } from 'pixi.js';
import { makeProjection, type Projection, type ProjectionParams } from '../core/projections';
import type { MapRenderer } from '../render/MapRenderer';
import { PROJECT_FRAGMENT, PROJECT_VERTEX } from '../render/shaders';
import { STYLE_PRESETS, hexToVec3 } from '../render/styles';
import { useDoc } from '../store/docStore';
import { editor } from './Editor';
import { assetImageNow, drawVectors, Painter } from './projectedExport';

const PI = Math.PI;
const PROJ_ID: Record<ProjectionParams['id'], number> = { equirectangular: 0, mercator: 1, mollweide: 2, equalEarth: 3, orthographic: 4, azimuthal: 5, gott: 6 };
/** Largest side of the equirectangular render that feeds the view. */
const MAX_SRC = 4096;
/** About this many source pixels at most, so turning the globe stays smooth. */
const MAX_SRC_PIXELS = 9e6;

let program: GlProgram | null = null;

/**
 * Looking at a planet in another projection, live. Each frame the visible
 * part of the planet is rendered as usual (equirectangular, with terrain,
 * borders, rivers, roads, fog and highlights) into a texture, which a shader
 * reprojects onto the screen; symbols, labels and peaks are drawn on top in
 * the projection itself so they stay upright. The map's data never changes.
 */
export class ProjectedView {
  params: ProjectionParams;
  proj: Projection;
  /** Plane point at the centre of the view, and CSS pixels per plane unit. */
  cx = 0;
  cy = 0;
  scale = 100;
  private renderer: MapRenderer;
  private container = new Container();
  private mesh: Mesh<Geometry, Shader>;
  private uniforms: UniformGroup;
  private rt: RenderTexture;
  private overlay: HTMLCanvasElement;
  private quadSize = [0, 0];

  constructor(renderer: MapRenderer, host: HTMLElement, params: ProjectionParams) {
    this.renderer = renderer;
    this.params = params;
    this.proj = makeProjection(params);
    program ??= GlProgram.from({ vertex: PROJECT_VERTEX, fragment: PROJECT_FRAGMENT, name: 'projected-view' });
    this.rt = RenderTexture.create({ width: 256, height: 256, resolution: 1, scaleMode: 'linear' });
    this.uniforms = new UniformGroup({
      uProj: { value: 0, type: 'f32' },
      uLon0: { value: 0, type: 'f32' },
      uSinP0: { value: 0, type: 'f32' },
      uCosP0: { value: 1, type: 'f32' },
      uReach: { value: PI, type: 'f32' },
      uGottCx: { value: PI / 2 + 0.07, type: 'f32' },
      uView: { value: new Float32Array([1, 1]), type: 'vec2<f32>' },
      uPlane: { value: new Float32Array([0, 0]), type: 'vec2<f32>' },
      uScale: { value: 100, type: 'f32' },
      uSrcRect: { value: new Float32Array([-PI, 2 * PI, PI / 2, PI]), type: 'vec4<f32>' },
      uBg: { value: new Float32Array(3), type: 'vec3<f32>' },
      uRim: { value: new Float32Array(3), type: 'vec3<f32>' },
    });
    const geometry = new Geometry({
      attributes: { aPosition: { buffer: new Float32Array(8), format: 'float32x2' } },
      indexBuffer: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    this.mesh = new Mesh({ geometry, shader: new Shader({ glProgram: program, resources: { uSrc: this.rt.source, view: this.uniforms } }) });
    this.container.addChild(this.mesh);
    this.overlay = document.createElement('canvas');
    this.overlay.className = 'projected-overlay';
    host.appendChild(this.overlay);
    this.fit();
  }

  /** Change the projection; `refit` frames the whole map again. */
  setParams(p: ProjectionParams, refit: boolean) {
    this.params = p;
    this.proj = makeProjection(p);
    if (refit) this.fit();
    this.clampView();
    this.renderer.requestRender();
  }

  fit() {
    const cam = this.renderer.camera;
    const p = this.proj;
    this.scale = Math.min(cam.viewW / (p.x1 - p.x0), cam.viewH / (p.y1 - p.y0)) * 0.92;
    this.cx = (p.x0 + p.x1) / 2;
    this.cy = (p.y0 + p.y1) / 2;
  }

  private minScale() {
    const cam = this.renderer.camera;
    const p = this.proj;
    return Math.min(cam.viewW / (p.x1 - p.x0), cam.viewH / (p.y1 - p.y0)) * 0.5;
  }

  /** Down to about 12 screen pixels per map cell at the centre. */
  private maxScale() {
    const m = editor.model!;
    return (12 * m.W) / (2 * PI * this.proj.k0);
  }

  private clampView() {
    const p = this.proj;
    this.scale = Math.min(this.maxScale(), Math.max(this.minScale(), this.scale));
    this.cx = Math.min(p.x1, Math.max(p.x0, this.cx));
    this.cy = Math.min(p.y1, Math.max(p.y0, this.cy));
  }

  /** Plane point under a screen point (CSS px from the canvas's top left). */
  plane(sx: number, sy: number): [number, number] {
    const cam = this.renderer.camera;
    return [this.cx + (sx - cam.viewW / 2) / this.scale, this.cy - (sy - cam.viewH / 2) / this.scale];
  }

  /** Map cell under a screen point, or null off the map. */
  screenToWorld(sx: number, sy: number): [number, number] | null {
    const ll = this.proj.inverse(...this.plane(sx, sy));
    if (!ll) return null;
    const m = editor.model!;
    return [((ll[0] / (2 * PI) + 0.5) * m.W + m.W) % m.W, (0.5 - ll[1] / PI) * m.H];
  }

  /** Whether dragging turns the sphere (globe and azimuthal) rather than sliding the map. */
  get rotates() {
    return this.params.id === 'orthographic' || this.params.id === 'azimuthal';
  }

  /** Drag by a screen offset: turn the globe, or slide the map. Returns the new centre for the UI. */
  drag(dx: number, dy: number): ProjectionParams | null {
    if (this.rotates) {
      // degrees of the sphere per screen pixel at the centre
      const deg = 180 / PI / (this.scale * this.proj.k0);
      const lon0 = ((((this.params.lon0 - dx * deg + 180) % 360) + 360) % 360) - 180;
      const lat0 = Math.max(-90, Math.min(90, this.params.lat0 + dy * deg));
      this.setParams({ ...this.params, lon0, lat0 }, false);
      return this.params;
    }
    this.cx -= dx / this.scale;
    this.cy += dy / this.scale;
    this.clampView();
    this.renderer.requestRender();
    return null;
  }

  zoomAt(sx: number, sy: number, factor: number) {
    const before = this.plane(sx, sy);
    this.scale *= factor;
    this.clampView();
    if (!this.rotates) {
      // keep the point under the cursor in place
      const after = this.plane(sx, sy);
      this.cx += before[0] - after[0];
      this.cy += before[1] - after[1];
      this.clampView();
    }
    this.renderer.requestRender();
  }

  /**
   * The part of the planet on screen, as a longitude/latitude rectangle
   * (radians), found by taking a grid of screen points back to the sphere.
   */
  private visibleRect(): { lon0: number; lonSpan: number; latTop: number; latSpan: number } {
    const cam = this.renderer.camera;
    const lons: number[] = [];
    let latMin = HALF;
    let latMax = -HALF;
    const n = 28;
    for (let j = 0; j <= n; j++)
      for (let i = 0; i <= n; i++) {
        const ll = this.proj.inverse(...this.plane((i / n) * cam.viewW, (j / n) * cam.viewH));
        if (!ll) continue;
        lons.push(ll[0]);
        latMin = Math.min(latMin, ll[1]);
        latMax = Math.max(latMax, ll[1]);
      }
    // a pole on screen means every longitude meets there
    const pole = (lat: number) => {
      const f = this.proj.forward(0, lat);
      if (!f) return false;
      const [x, y] = [(f[0] - this.cx) * this.scale + cam.viewW / 2, (this.cy - f[1]) * this.scale + cam.viewH / 2];
      return x >= -2 && y >= -2 && x <= cam.viewW + 2 && y <= cam.viewH + 2;
    };
    const north = pole(HALF);
    const south = pole(-HALF);
    if (north) latMax = HALF;
    if (south) latMin = -HALF;
    if (!lons.length) return { lon0: -PI, lonSpan: 2 * PI, latTop: HALF, latSpan: PI };
    const margin = Math.max(0.02, (latMax - latMin) * 0.04);
    latMax = Math.min(HALF, latMax + margin);
    latMin = Math.max(-HALF, latMin - margin);
    // the longitudes on screen: everything except the widest gap between them
    lons.sort((a, b) => a - b);
    let gap = lons[0] + 2 * PI - lons[lons.length - 1];
    let start = lons[0];
    for (let k = 1; k < lons.length; k++) {
      const g = lons[k] - lons[k - 1];
      if (g > gap) {
        gap = g;
        start = lons[k];
      }
    }
    let span = 2 * PI - gap;
    if (north || south || span > 1.5 * PI) return { lon0: -PI, lonSpan: 2 * PI, latTop: latMax, latSpan: latMax - latMin };
    const lm = Math.max(0.02, span * 0.04);
    start -= lm;
    span = Math.min(2 * PI, span + 2 * lm);
    return { lon0: start, lonSpan: span, latTop: latMax, latSpan: latMax - latMin };
  }

  /** Draw the view (called by the renderer instead of its usual frame). */
  render() {
    const r = this.renderer;
    const cam = r.camera;
    const m = editor.model!;
    const L = editor.layers!;
    const doc = useDoc.getState().doc;
    const style = STYLE_PRESETS[doc.view.style] ?? STYLE_PRESETS.parchment;
    const rect = this.visibleRect();

    // source resolution: as many pixels per radian as the screen shows at its most magnified, within limits
    const dpr = r.renderer.resolution;
    const pxPerRad = this.scale * this.proj.k0 * dpr * (this.params.id === 'azimuthal' ? 1.4 : 1.15);
    let w = rect.lonSpan * pxPerRad;
    let h = rect.latSpan * pxPerRad;
    const k = Math.min(1, MAX_SRC / w, MAX_SRC / h, Math.sqrt(MAX_SRC_PIXELS / (w * h)));
    w = Math.max(64, Math.round(w * k));
    h = Math.max(32, Math.round(h * k));
    if (this.rt.width !== w || this.rt.height !== h) this.rt.resize(w, h, 1);

    // the usual layers, minus symbols, labels and peaks (drawn on top, upright, below)
    const hidden = [L.objects.container, L.labels.container, L.peaks.container];
    const saved = hidden.map((c) => c.visible);
    for (const c of hidden) c.visible = false;
    L.territories.setLabelsVisible(false);
    const wrap = cam.wrap;
    cam.wrap = true;
    const zoom = w / ((rect.lonSpan / (2 * PI)) * m.W);
    const wcx = ((rect.lon0 + rect.lonSpan / 2) / (2 * PI) + 0.5) * m.W;
    const wcy = (0.5 - (rect.latTop - rect.latSpan / 2) / PI) * m.H;
    try {
      r.drawWorld(zoom, wcx, wcy, w, h, this.rt);
    } finally {
      cam.wrap = wrap;
      hidden.forEach((c, i) => (c.visible = saved[i]));
      L.territories.setLabelsVisible(true);
    }

    // the reprojection
    const u = this.uniforms.uniforms as Record<string, unknown>;
    const p = this.params;
    u.uProj = PROJ_ID[p.id];
    u.uLon0 = (p.lon0 * PI) / 180;
    u.uSinP0 = Math.sin((p.lat0 * PI) / 180);
    u.uCosP0 = Math.cos((p.lat0 * PI) / 180);
    u.uReach = (Math.max(10, Math.min(180, p.extent)) * PI) / 180;
    (u.uView as Float32Array).set([cam.viewW, cam.viewH]);
    (u.uPlane as Float32Array).set([this.cx, this.cy]);
    u.uScale = this.scale;
    (u.uSrcRect as Float32Array).set([rect.lon0, rect.lonSpan, rect.latTop, rect.latSpan]);
    (u.uBg as Float32Array).set(hexToVec3(style.background));
    (u.uRim as Float32Array).set(hexToVec3(style.coastInk));
    this.uniforms.update();
    if (this.quadSize[0] !== cam.viewW || this.quadSize[1] !== cam.viewH) {
      this.quadSize = [cam.viewW, cam.viewH];
      const buf = this.mesh.geometry.getBuffer('aPosition');
      (buf.data as Float32Array).set([0, 0, cam.viewW, 0, cam.viewW, cam.viewH, 0, cam.viewH]);
      buf.update();
    }
    r.renderer.render({ container: this.container, clear: true });
    this.drawOverlay();
  }

  /** Symbols, labels and peaks, in the projection, on a canvas over the map. */
  private drawOverlay() {
    const cam = this.renderer.camera;
    const dpr = this.renderer.renderer.resolution;
    const c = this.overlay;
    const W = Math.round(cam.viewW * dpr);
    const H = Math.round(cam.viewH * dpr);
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    c.style.display = '';
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const doc = useDoc.getState().doc;
    const style = STYLE_PRESETS[doc.view.style] ?? STYLE_PRESETS.parchment;
    const painter = new Painter(ctx, this.proj, cam.viewW, cam.viewH, { cx: this.cx, cy: this.cy, scale: this.scale });
    drawVectors(painter, style, { includePeaks: true, shapes: false, image: (id) => assetImageNow(id, () => this.renderer.requestRender()) });
  }

  /** Leave the projected view (the normal map takes over again). */
  hide() {
    this.overlay.style.display = 'none';
  }

  destroy() {
    this.overlay.remove();
    this.container.destroy({ children: true });
    this.rt.destroy(true);
  }
}

const HALF = PI / 2;
