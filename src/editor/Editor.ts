import { assetLibrary } from '../assets/library';
import { refreshGeographyIfShown, resetGeography } from './geography';
import { defaultPlanet, type GridPreset } from '../core/planet';
import { history } from '../model/history';
import { normalizeDoc, normalizeMeta } from '../model/serialization';
import { emptyDocument, type MapDocument, type ProjectMeta } from '../model/types';
import { getSetting, requestPersistentStorage, setSetting } from '../persistence/db';
import { listProjects, loadProject, putProjectRecord, saveDirtyTiles } from '../persistence/projects';
import { ensureFonts } from '../render/fonts';
import { MapRenderer } from '../render/MapRenderer';
import { ObjectLayer } from '../render/ObjectLayer';
import { OverlayLayer } from '../render/OverlayLayer';
import { PathLayer } from '../render/PathLayer';
import { PeakLayer } from '../render/PeakLayer';
import { STYLE_PRESETS } from '../render/styles';
import { LabelLayer, TerritoryLayer } from '../render/TerritoryLayer';
import { useDoc } from '../store/docStore';
import { useEditor, useViewInfo } from '../store/editorStore';
import { renderThumbnail } from './exporter';
import { detectPeaks, resolvePeaks, type DetectedPeak } from '../terrain/peaks';
import { TerrainModel } from '../terrain/TerrainModel';

export interface Layers {
  objects: ObjectLayer;
  paths: PathLayer;
  territories: TerritoryLayer;
  labels: LabelLayer;
  peaks: PeakLayer;
  overlay: OverlayLayer;
}

const SAVE_DELAY = 900;

/**
 * Editor runtime: owns the active project's raster model and renderer and
 * keeps them in sync with the Zustand stores. UI and tools talk to this.
 */
class Editor {
  model: TerrainModel | null = null;
  renderer: MapRenderer | null = null;
  layers: Layers | null = null;
  private host: HTMLElement | null = null;
  private unsubs: (() => void)[] = [];
  private saveTimer = 0;
  private peakTimer = 0;
  private detected: DetectedPeak[] = [];
  private saving: Promise<void> | null = null;
  private resaveRequested = false;
  private thumbAt = 0;
  private initialized = false;
  private mountSeq = 0;
  /** Set by the tool controller once attached. */
  onMounted: (() => void) | null = null;

  async init(host: HTMLElement) {
    this.host = host;
    if (this.initialized) return;
    this.initialized = true;
    useEditor.getState().set({ busy: 'Loading your atlas…' });
    await Promise.all([ensureFonts(), assetLibrary.init()]);
    requestPersistentStorage();
    history.subscribe(() =>
      useEditor.getState().set({ canUndo: history.canUndo, canRedo: history.canRedo, undoLabel: history.undoLabel, redoLabel: history.redoLabel }),
    );
    const last = await getSetting<string | null>('lastProject', null);
    const projects = await listProjects();
    const target = projects.find((p) => p.id === last) ?? projects[0];
    if (target) await this.openProject(target.id);
    else await this.createProject('My World', 'standard');
    useEditor.getState().set({ busy: null });
    window.addEventListener('pagehide', () => void this.saveNow());
    // warn before closing while the last edits are still being written
    window.addEventListener('beforeunload', (e) => {
      const st = useEditor.getState().saveStatus;
      if (st === 'pending' || st === 'saving') {
        void this.saveNow();
        e.preventDefault();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.saveNow();
    });
  }

  // ------------------------------------------------------------ projects

  async createProject(name: string, grid: GridPreset, planetPatch: Partial<ProjectMeta['planet']> = {}) {
    await this.saveNow();
    const now = Date.now();
    const meta: ProjectMeta = normalizeMeta({
      id: crypto.randomUUID(),
      name,
      createdAt: now,
      updatedAt: now,
      seed: Math.floor(Math.random() * 1e9),
      planet: { ...defaultPlanet(grid), ...planetPatch },
    });
    const model = new TerrainModel(meta.planet);
    const doc = emptyDocument();
    await putProjectRecord(meta, doc, model);
    await this.mount(model, meta, doc);
    await setSetting('lastProject', meta.id);
    return meta.id;
  }

  async openProject(id: string) {
    await this.saveNow();
    useEditor.getState().set({ busy: 'Opening map…' });
    try {
      const res = await loadProject(id);
      if (!res) throw new Error('Project not found');
      await this.mount(res.model, res.record.meta, normalizeDoc(res.record.doc));
      await setSetting('lastProject', id);
    } finally {
      useEditor.getState().set({ busy: null });
    }
  }

  private async mount(model: TerrainModel, meta: ProjectMeta, doc: MapDocument) {
    const seq = ++this.mountSeq;
    for (const u of this.unsubs) u();
    this.unsubs = [];
    this.layers?.objects.dispose();
    this.renderer?.destroy();
    this.renderer = null;
    this.layers = null;
    history.clear();
    clearTimeout(this.peakTimer);
    this.detected = [];
    this.model = model;
    resetGeography();
    useEditor.getState().set({ selection: [], peaks: [], saveStatus: 'saved', lastSavedAt: Date.now() });
    useDoc.getState().load(meta, doc);

    const renderer = new MapRenderer(model);
    await renderer.init(this.host!);
    if (seq !== this.mountSeq) {
      renderer.destroy();
      return;
    }
    this.renderer = renderer;
    const objects = new ObjectLayer(() => renderer.requestRender());
    const paths = new PathLayer();
    const territories = new TerritoryLayer();
    const labels = new LabelLayer();
    const peaks = new PeakLayer(renderer.camera, model.W);
    const overlay = new OverlayLayer(model.geo, (id) => labels.bounds(id));
    renderer.addLayers([territories, paths, objects, labels, peaks], overlay);
    this.layers = { objects, paths, territories, labels, peaks, overlay };

    this.syncDoc(useDoc.getState().doc, null);
    this.applyView();
    // return to where the user left this map
    const cam = await getSetting<{ x: number; y: number; zoom: number } | null>('camera:' + meta.id, null);
    if (seq !== this.mountSeq) return;
    if (cam && Number.isFinite(cam.zoom)) renderer.camera.centerOn(cam.x, cam.y, cam.zoom);
    let camTimer = 0;

    this.unsubs.push(
      useDoc.subscribe((s, prev) => {
        if (s.doc !== prev.doc) this.syncDoc(s.doc, prev.doc);
        if (s.meta !== prev.meta && s.meta && prev.meta && s.meta.planet !== prev.meta.planet) {
          model.updatePlanet(s.meta.planet);
          overlay.setGeo(model.geo);
          this.applyView();
          this.schedulePeaks();
        }
        if (s.revision !== prev.revision) this.scheduleSave();
      }),
      useEditor.subscribe((s, prev) => {
        if (s.selection !== prev.selection) {
          overlay.setContext(useDoc.getState().doc, s.selection);
          this.pushPeaks();
          renderer.requestRender();
        }
        if (s.fogPreview !== prev.fogPreview) renderer.setFogPreview(s.fogPreview);
        if (s.peaks !== prev.peaks) this.pushPeaks();
      }),
      model.subscribe((layer) => {
        this.scheduleSave();
        if (layer === 'height') this.schedulePeaks();
      }),
      renderer.onView(() => {
        const c = renderer.camera;
        useViewInfo.setState({ zoom: c.zoom, centerX: c.x, centerY: c.y, viewW: c.viewW, viewH: c.viewH });
        clearTimeout(camTimer);
        camTimer = window.setTimeout(() => void setSetting('camera:' + meta.id, { x: c.x, y: c.y, zoom: c.zoom }), 600);
      }),
    );
    const c = renderer.camera;
    useViewInfo.setState({ zoom: c.zoom, centerX: c.x, centerY: c.y, viewW: c.viewW, viewH: c.viewH });
    this.schedulePeaks(0);
    this.onMounted?.();
  }

  private syncDoc(doc: MapDocument, prev: MapDocument | null) {
    const L = this.layers;
    if (!L || !this.renderer) return;
    if (!prev || doc.objects !== prev.objects || doc.objectLayers !== prev.objectLayers) L.objects.sync(doc);
    if (!prev || doc.paths !== prev.paths) L.paths.sync(doc);
    if (!prev || doc.territories !== prev.territories) L.territories.sync(doc);
    if (!prev || doc.labels !== prev.labels) L.labels.sync(doc);
    if (prev && doc.peaks !== prev.peaks) this.resolvePeaksNow();
    if (!prev || doc.view !== prev.view || doc.systemLayers !== prev.systemLayers) this.applyView();
    // drop selections that no longer exist
    const sel = useEditor.getState().selection;
    const alive = sel.filter((r) => {
      if (r.kind === 'object') return !!doc.objects[r.id];
      if (r.kind === 'path') return !!doc.paths[r.id];
      if (r.kind === 'territory') return !!doc.territories[r.id];
      if (r.kind === 'label') return !!doc.labels[r.id];
      return true;
    });
    if (alive.length !== sel.length) useEditor.getState().select(alive);
    L.overlay.setContext(doc, useEditor.getState().selection);
    this.renderer.requestRender();
  }

  private applyView() {
    const r = this.renderer;
    const L = this.layers;
    const { doc, meta } = useDoc.getState();
    if (!r || !L || !meta) return;
    r.applyStyle(doc, meta, useEditor.getState().fogPreview);
    const style = STYLE_PRESETS[doc.view.style] ?? STYLE_PRESETS.parchment;
    L.paths.setStyle(style);
    L.territories.setStyle(style);
    L.labels.setStyle(style);
    L.peaks.setStyle(style);
    const sl = doc.systemLayers;
    const vis = (c: { visible: boolean; alpha: number }, s: { visible: boolean; opacity: number }) => {
      c.visible = s.visible;
      c.alpha = s.opacity;
    };
    vis(L.paths.container, sl.paths);
    vis(L.territories.container, sl.territories);
    vis(L.objects.container, sl.objects);
    vis(L.labels.container, sl.labels);
    vis(L.peaks.container, sl.peaks);
    L.peaks.container.visible = sl.peaks.visible && doc.view.showPeaks;
    this.pushPeaks();
    r.requestRender();
  }

  // ------------------------------------------------------------ peaks

  schedulePeaks(delay = 450) {
    clearTimeout(this.peakTimer);
    this.peakTimer = window.setTimeout(() => this.computePeaks(), delay);
  }

  private computePeaks() {
    const model = this.model;
    if (!model) return;
    this.detected = detectPeaks(model, 300, 160);
    const anns = Object.values(useDoc.getState().doc.peaks);
    useEditor.getState().set({ peaks: resolvePeaks(model, this.detected, anns), landStats: this.landStats(model) });
    refreshGeographyIfShown();
  }

  /** Land area on the sphere (cells weighted by their true area). */
  private landStats(model: TerrainModel) {
    const g = model.height;
    const sea = model.seaLevel;
    const geo = model.geo;
    const total = 4 * Math.PI * geo.R * geo.R;
    let land = 0;
    let highest = -Infinity;
    const defaultLand = g.defaultValue > sea;
    for (let ty = 0; ty < g.NY; ty++) {
      for (let tx = 0; tx < g.NX; tx++) {
        const t = g.tiles.get(g.key(tx, ty));
        for (let j = 0; j < g.TS; j++) {
          const y = ty * g.TS + j;
          if (y >= model.H) break;
          const a = geo.cellAreaKm2(y);
          if (!t) {
            if (defaultLand) land += a * g.TS;
            continue;
          }
          for (let i = 0; i < g.TS; i++) {
            const h = t[j * g.TS + i];
            if (h > sea) land += a;
            if (h > highest) highest = h;
          }
        }
      }
    }
    return { areaKm2: land, fraction: land / total, highest: highest === -Infinity ? g.defaultValue - sea : highest - sea };
  }

  /** Re-apply annotations to the last detection (cheap; no terrain scan). */
  private resolvePeaksNow() {
    if (!this.model) return;
    useEditor.getState().set({ peaks: resolvePeaks(this.model, this.detected, Object.values(useDoc.getState().doc.peaks)) });
  }

  private pushPeaks() {
    const L = this.layers;
    if (!L) return;
    const { doc } = useDoc.getState();
    const sel = useEditor.getState().selection.find((s) => s.kind === 'peak')?.id ?? null;
    L.peaks.setPeaks(useEditor.getState().peaks, doc.view.peakMinElevation, sel);
    this.renderer?.requestRender();
  }

  // ------------------------------------------------------------ saving

  scheduleSave() {
    useEditor.getState().set({ saveStatus: 'pending' });
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.saveNow(), SAVE_DELAY);
  }

  async saveNow(): Promise<void> {
    clearTimeout(this.saveTimer);
    if (this.saving) {
      this.resaveRequested = true;
      return this.saving;
    }
    const model = this.model;
    const { meta, doc } = useDoc.getState();
    if (!model || !meta) return;
    const dirty =
      useEditor.getState().saveStatus === 'pending' || model.persistReset.size > 0 || Object.values(model.persistDirty).some((s) => s.size > 0);
    if (!dirty) return;
    useEditor.getState().set({ saveStatus: 'saving' });
    this.saving = (async () => {
      try {
        let thumb: Blob | undefined;
        if (Date.now() - this.thumbAt > 20000 && this.renderer) {
          this.thumbAt = Date.now();
          thumb = (await renderThumbnail().catch(() => null)) ?? undefined;
        }
        await putProjectRecord({ ...meta, updatedAt: Date.now() }, doc, model, thumb);
        await saveDirtyTiles(meta.id, model);
        useEditor.getState().set({ saveStatus: 'saved', lastSavedAt: Date.now() });
      } catch (e) {
        console.error(e);
        useEditor.getState().set({ saveStatus: 'error' });
        useEditor.getState().notify('Saving failed: ' + (e instanceof Error ? e.message : String(e)), 'error');
      } finally {
        this.saving = null;
      }
    })();
    await this.saving;
    if (this.resaveRequested) {
      this.resaveRequested = false;
      await this.saveNow();
    }
  }

  // ------------------------------------------------------------ helpers

  requestRender() {
    this.renderer?.requestRender();
  }

  get zoom() {
    return this.renderer?.camera.zoom ?? 1;
  }
}

export const editor = new Editor();
// handy for debugging & automated smoke tests
Object.assign(window as object, { __editor: editor, __doc: useDoc, __ui: useEditor });
