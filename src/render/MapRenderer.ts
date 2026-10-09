import { BufferImageSource, Container, Matrix, UniformGroup, autoDetectRenderer, type Renderer, type RenderSurface } from 'pixi.js';
import type { TerrainModel } from '../terrain/TerrainModel';
import type { MapDocument, ProjectMeta } from '../model/types';
import { Camera } from './Camera';
import { RasterTileLayer } from './RasterTileLayer';
import { RAMP_ROWS, RAMP_W, STYLE_PRESETS, buildRamp, hexToVec3, type StylePreset } from './styles';

export interface FrameInfo {
  zoom: number;
  /** World rect for the current wrap copy. */
  view: { x0: number; x1: number; y0: number; y1: number };
  copy: number;
}

/** A drawable layer living in world space. */
export interface WorldLayer {
  readonly container: Container;
  /** Called once per rendered frame before drawing. */
  prepare?(zoom: number, zoomChanged: boolean): void;
  /** Called for each wrap copy, with that copy's visible world rect. */
  cull?(x0: number, y0: number, x1: number, y1: number): void;
}

export class MapRenderer {
  renderer!: Renderer;
  /**
   * Root containers in draw order. Each is drawn for every longitude wrap
   * copy before the next layer, so content crossing the antimeridian keeps
   * its z-order (a later copy's terrain never paints over earlier vectors).
   */
  private roots: { container: Container; cull?: (x0: number, y0: number, x1: number, y1: number) => void }[] = [];
  camera: Camera;
  terrain!: RasterTileLayer;
  fog!: RasterTileLayer;
  readonly layers: WorldLayer[] = [];
  style: StylePreset = STYLE_PRESETS.parchment;
  private styleUniforms!: UniformGroup;
  private ramp!: BufferImageSource;
  private dirty = true;
  private raf = 0;
  private lastT = 0;
  private lastZoom = 0;
  private viewListeners = new Set<() => void>();
  private frameHooks = new Set<(dt: number) => boolean | void>();
  private unsub: (() => void) | null = null;
  canvas!: HTMLCanvasElement;
  /** Fog rendered as players see it (export of revealed areas). */
  fogPreviewOverride: boolean | null = null;
  private destroyed = false;

  private model: TerrainModel;

  constructor(model: TerrainModel) {
    this.model = model;
    this.camera = new Camera(model.W, model.H);
  }

  async init(host: HTMLElement) {
    this.renderer = await autoDetectRenderer({
      preference: 'webgl',
      antialias: true,
      autoDensity: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      backgroundColor: this.style.background,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
      width: Math.max(1, host.clientWidth),
      height: Math.max(1, host.clientHeight),
    });
    if (this.destroyed) {
      this.renderer.destroy();
      return;
    }
    this.canvas = this.renderer.canvas as HTMLCanvasElement;
    this.canvas.classList.add('map-canvas');
    host.appendChild(this.canvas);

    this.styleUniforms = new UniformGroup({
      uSea: { value: 0, type: 'f32' },
      uMaxElev: { value: 10000, type: 'f32' },
      uMinElev: { value: -11000, type: 'f32' },
      uZoom: { value: 1, type: 'f32' },
      uHillshade: { value: 1, type: 'f32' },
      uExaggeration: { value: 14, type: 'f32' },
      uCellKm: { value: 11, type: 'f32' },
      uContours: { value: 0, type: 'f32' },
      uContourInterval: { value: 500, type: 'f32' },
      uOverlay: { value: 0, type: 'f32' },
      uGraticule: { value: 0, type: 'f32' },
      uRipples: { value: 1, type: 'f32' },
      uBiomeOpacity: { value: 1, type: 'f32' },
      uBiomePattern: { value: 1, type: 'f32' },
      uPaper: { value: new Float32Array(3), type: 'vec3<f32>' },
      uPaperAmount: { value: 0, type: 'f32' },
      uGrain: { value: 0, type: 'f32' },
      uStains: { value: 0, type: 'f32' },
      uCoastInk: { value: new Float32Array(3), type: 'vec3<f32>' },
      uCoastWidth: { value: 1.5, type: 'f32' },
      uRippleColor: { value: new Float32Array(3), type: 'vec3<f32>' },
      uRippleAlpha: { value: 0.3, type: 'f32' },
      uContourColor: { value: new Float32Array(3), type: 'vec3<f32>' },
      uShadowTint: { value: new Float32Array(3), type: 'vec3<f32>' },
      uWorldSize: { value: new Float32Array([this.model.W, this.model.H]), type: 'vec2<f32>' },
      uSeed: { value: 0, type: 'f32' },
      // fog
      uPreview: { value: 1, type: 'f32' },
      uFogColor: { value: new Float32Array(3), type: 'vec3<f32>' },
      uFogShade: { value: new Float32Array(3), type: 'vec3<f32>' },
      uFogOpacity: { value: 1, type: 'f32' },
    });
    this.ramp = new BufferImageSource({
      resource: new Uint8Array(RAMP_W * RAMP_ROWS * 4),
      width: RAMP_W,
      height: RAMP_ROWS,
      format: 'rgba8unorm',
      scaleMode: 'linear',
      addressMode: 'clamp-to-edge',
      alphaMode: 'no-premultiply-alpha',
    });

    this.terrain = new RasterTileLayer(this.model, 'terrain', this.styleUniforms, this.ramp);
    this.fog = new RasterTileLayer(this.model, 'fog', this.styleUniforms, null);
    this.roots.push({ container: this.terrain.container, cull: (a, b, c, d) => this.terrain.cull(a, b, c, d) });
    this.unsub = this.model.subscribe((layer, rect) => {
      this.terrain.onChange(layer, rect);
      this.fog.onChange(layer, rect);
      this.requestRender();
    });

    this.camera.resize(host.clientWidth, host.clientHeight);
    this.camera.fitWorld();
    this.lastT = performance.now();
    this.loop();
  }

  /** Insert world layers (in draw order) between terrain and fog. */
  addLayers(layers: WorldLayer[], overlay: WorldLayer) {
    for (const l of [...layers]) {
      this.layers.push(l);
      this.roots.push({ container: l.container, cull: l.cull?.bind(l) });
    }
    this.roots.push({ container: this.fog.container, cull: (a, b, c, d) => this.fog.cull(a, b, c, d) });
    this.layers.push(overlay);
    this.roots.push({ container: overlay.container, cull: overlay.cull?.bind(overlay) });
  }

  resize(w: number, h: number) {
    if (!this.renderer) return;
    this.renderer.resize(w, h);
    this.camera.resize(w, h);
    this.requestRender();
    this.emitView();
  }

  requestRender() {
    this.dirty = true;
  }

  /** Notify view listeners (call after moving the camera directly). */
  viewChanged() {
    this.dirty = true;
    this.emitView();
  }

  onView(fn: () => void) {
    this.viewListeners.add(fn);
    return () => this.viewListeners.delete(fn);
  }

  /** Per-frame hook; return true to request continuous rendering. */
  onFrame(fn: (dt: number) => boolean | void) {
    this.frameHooks.add(fn);
    return () => this.frameHooks.delete(fn);
  }

  private emitView() {
    for (const fn of this.viewListeners) fn();
  }

  applyStyle(doc: MapDocument, meta: ProjectMeta, fogPreview: boolean) {
    if (!this.styleUniforms) return;
    const style = STYLE_PRESETS[doc.view.style] ?? STYLE_PRESETS.parchment;
    const styleChanged = style !== this.style;
    this.style = style;
    const u = this.styleUniforms.uniforms as Record<string, unknown>;
    const p = meta.planet;
    u.uSea = p.seaLevel;
    u.uMaxElev = p.maxElevation;
    u.uMinElev = p.minElevation;
    u.uCellKm = this.model.geo.kmPerCellY;
    u.uHillshade = style.hillshade * doc.view.hillshade;
    u.uExaggeration = style.exaggeration;
    u.uContours = doc.view.contours ? 1 : 0;
    u.uContourInterval = doc.view.contourInterval;
    u.uOverlay = doc.view.heightOverlay ? 0.82 : 0;
    u.uGraticule = doc.view.graticule ? 1 : 0;
    u.uRipples = doc.view.coastRipples ? 1 : 0;
    u.uBiomeOpacity = doc.systemLayers.biomes.visible ? doc.systemLayers.biomes.opacity : 0;
    u.uBiomePattern = style.biomePattern;
    u.uPaper = hexToVec3(style.paper);
    u.uPaperAmount = style.paperAmount;
    u.uGrain = style.grain;
    u.uStains = style.stains;
    u.uCoastInk = hexToVec3(style.coastInk);
    u.uCoastWidth = style.coastWidth;
    u.uRippleColor = hexToVec3(style.rippleColor);
    u.uRippleAlpha = style.rippleAlpha;
    u.uContourColor = hexToVec3(style.contourColor);
    u.uShadowTint = hexToVec3(style.shadowTint);
    u.uSeed = (meta.seed % 1000) + 0.5;
    u.uPreview = (this.fogPreviewOverride ?? fogPreview) ? 1 : 0;
    u.uFogColor = hexToVec3(style.fogColor);
    u.uFogShade = hexToVec3(style.fogShade);
    u.uFogOpacity = doc.systemLayers.fog.opacity;
    const seaFrac = (p.seaLevel - p.minElevation) / (p.seaLevel + p.maxElevation - p.minElevation);
    (this.ramp.resource as Uint8Array).set(buildRamp(style, seaFrac));
    this.ramp.update();
    if (styleChanged) this.renderer.background.color = style.background;
    this.terrain.container.visible = doc.systemLayers.terrain.visible;
    this.terrain.container.alpha = doc.systemLayers.terrain.opacity;
    this.fog.container.visible = doc.systemLayers.fog.visible;
    this.requestRender();
  }

  setFogPreview(preview: boolean) {
    if (!this.styleUniforms) return;
    (this.styleUniforms.uniforms as Record<string, unknown>).uPreview = preview ? 1 : 0;
    this.requestRender();
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    let moved = this.camera.tick(dt);
    for (const fn of this.frameHooks) if (fn(dt)) moved = true;
    if (moved) {
      this.dirty = true;
      this.emitView();
    }
    if (!this.dirty) return;
    this.dirty = false;
    this.renderFrame();
  };

  /** Render the world (all wrap copies) to the screen. */
  renderFrame() {
    const cam = this.camera;
    this.drawWorld(cam.zoom, cam.x, cam.y, cam.viewW, cam.viewH);
  }

  /**
   * Draw the world centred on (cx, cy) at `zoom` into the current target
   * (screen by default). Used by both the live view and the PNG exporter.
   */
  drawWorld(zoom: number, cx: number, cy: number, vw: number, vh: number, target?: RenderSurface) {
    const zoomChanged = zoom !== this.lastZoom;
    this.lastZoom = zoom;
    (this.styleUniforms.uniforms as Record<string, unknown>).uZoom = zoom;
    this.terrain.sync();
    this.fog.sync();
    for (const l of this.layers) l.prepare?.(zoom, zoomChanged);
    const W = this.model.W;
    const x0 = cx - vw / 2 / zoom;
    const x1 = cx + vw / 2 / zoom;
    const y0 = cy - vh / 2 / zoom;
    const y1 = cy + vh / 2 / zoom;
    const k0 = Math.floor(x0 / W);
    const k1 = Math.floor(x1 / W);
    const copies: { m: Matrix; ox: number }[] = [];
    for (let k = k0; k <= k1; k++) {
      const ox = k * W;
      copies.push({ ox, m: new Matrix(zoom, 0, 0, zoom, (ox - cx) * zoom + vw / 2, -cy * zoom + vh / 2) });
    }
    let first = true;
    for (const root of this.roots) {
      if (!root.container.visible) continue;
      for (const { m, ox } of copies) {
        root.cull?.(x0 - ox, y0, x1 - ox, y1);
        this.renderer.render({ container: root.container, transform: m, clear: first, target });
        first = false;
      }
    }
    if (first) this.renderer.render({ container: new Container(), clear: true, target });
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.unsub?.();
    if (this.renderer) {
      this.terrain?.destroy();
      this.fog?.destroy();
      for (const r of this.roots) if (!r.container.destroyed) r.container.destroy({ children: true });
      this.renderer.destroy({ removeView: true });
    }
  }
}
