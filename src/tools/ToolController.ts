import { assetLibrary } from '../assets/library';
import { clearInspect, inspectAt } from '../editor/geography';
import { formatLength } from '../core/units';
import { brushRange } from '../ui/format';
import { clamp, simplifyPath, uid } from '../core/math';
import { BIOMES } from '../core/planet';
import {
  addFeature,
  addObjects,
  deleteRefs,
  designatePeak,
  duplicateRefs,
  moveRefs,
  newObject,
  removePeak,
  reorderObjects,
  updateFeature,
  updateObjects,
} from '../editor/commands';
import { editor } from '../editor/Editor';
import { rotateHandle } from '../model/geometry';
import { territoryLabelPos } from '../render/TerritoryLayer';
import { history } from '../model/history';
import type { MapDocument, MapLabel, PathFeature, SelectionRef, Territory, Vec2 } from '../model/types';
import { hexToNumber, STYLE_PRESETS } from '../render/styles';
import { useDoc } from '../store/docStore';
import { brushGroupOf, useEditor, type ToolId } from '../store/editorStore';
import { Stroke, type TerrainOp } from '../terrain/brushes';
import type { TileChange } from '../terrain/TerrainModel';
import { hitAny, hitPeak, hitVertex, insertionIndex, nearX, objectHandleHit, type HitContext } from './hitTest';

type Drag =
  | { kind: 'pan'; sx: number; sy: number }
  | { kind: 'stroke'; stroke: Stroke; last: Vec2; lastDab: number; erase?: EraseState }
  | { kind: 'move'; start: Vec2; base: MapDocument; refs: SelectionRef[]; moved: boolean; key: string }
  | { kind: 'marquee'; start: Vec2; additive: boolean }
  | { kind: 'rotate'; id: string; key: string }
  | { kind: 'scale'; id: string; startDist: number; startScale: number; key: string }
  | { kind: 'vertex'; ref: SelectionRef; index: number; key: string }
  | { kind: 'labelAnchor'; id: string; key: string }
  | { kind: 'freehand'; points: Vec2[]; startScreen: Vec2; moved: boolean }
  | { kind: 'stamp'; last: Vec2 | null; key: string };

/** Vector content removed by one eraser stroke (applied live, undone together with the biome erase). */
interface EraseState {
  before: Pick<MapDocument, 'objects' | 'paths' | 'labels'> | null;
}

const BRUSH_COLORS: Partial<Record<ToolId, number>> = {
  raise: 0xffffff,
  lower: 0x8fd6ff,
  smooth: 0xc9f5a6,
  flatten: 0xf6d77c,
  ridge: 0xffb27a,
  erase: 0xff8a8a,
};

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  return t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
}

/**
 * Translates pointer and keyboard input on the map canvas into edits for
 * whichever tool is active.
 */
export class ToolController {
  private canvas: HTMLCanvasElement | null = null;
  private drag: Drag | null = null;
  /** Viewer (read-only) touch state: active pointers, pinch, and a possible tap. */
  private touches = new Map<number, [number, number]>();
  private pinch: { dist: number; mx: number; my: number } | null = null;
  private tap: { x: number; y: number; t: number } | null = null;
  private pointer: { sx: number; sy: number; x: number; y: number; inside: boolean } = { sx: 0, sy: 0, x: 0, y: 0, inside: false };
  private spaceDown = false;
  private shift = false;
  private alt = false;
  /** Draft for click-to-add drawing (paths, territories, measure). */
  private draft: { tool: ToolId; points: Vec2[] } | null = null;
  private measure: Vec2[] = [];
  private measureDone = false;
  private unFrame: (() => void) | null = null;
  private cursorRaf = 0;

  attach(canvas: HTMLCanvasElement) {
    this.detach();
    this.canvas = canvas;
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
    canvas.addEventListener('pointerleave', this.onLeave);
    canvas.addEventListener('pointerenter', this.onEnter);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('dblclick', this.onDblClick);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.unFrame = editor.renderer!.onFrame(this.onFrame);
    this.updateCursorStyle();
  }

  detach() {
    const c = this.canvas;
    if (!c) return;
    c.removeEventListener('pointerdown', this.onDown);
    c.removeEventListener('pointermove', this.onMove);
    c.removeEventListener('pointerup', this.onUp);
    c.removeEventListener('pointercancel', this.onUp);
    c.removeEventListener('pointerleave', this.onLeave);
    c.removeEventListener('pointerenter', this.onEnter);
    c.removeEventListener('wheel', this.onWheel);
    c.removeEventListener('dblclick', this.onDblClick);
    this.unFrame?.();
    this.canvas = null;
    this.drag = null;
  }

  private keyboardInstalled = false;

  installKeyboard() {
    if (this.keyboardInstalled) return;
    this.keyboardInstalled = true;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => {
      this.spaceDown = this.shift = this.alt = false;
      this.updateCursorStyle();
    });
    useEditor.subscribe((s, p) => {
      if (s.tool !== p.tool) this.onToolChanged(p.tool);
      if (s.brushes !== p.brushes || s.tool !== p.tool || s.biome !== p.biome || s.fogMode !== p.fogMode) this.updateBrushCursor();
    });
  }

  // ------------------------------------------------------------ helpers

  private get tool(): ToolId {
    return this.spaceDown ? 'pan' : useEditor.getState().tool;
  }

  private world(e: { clientX: number; clientY: number }): Vec2 {
    const r = this.canvas!.getBoundingClientRect();
    return editor.renderer!.camera.screenToWorld(e.clientX - r.left, e.clientY - r.top);
  }

  private hitCtx(): HitContext {
    const doc = useDoc.getState().doc;
    const sl = doc.systemLayers;
    return {
      geo: editor.model!.geo,
      zoom: editor.zoom,
      doc,
      peaks: useEditor.getState().peaks,
      labelBounds: (id) => editor.layers!.labels.bounds(id),
      peakMin: doc.view.peakMinElevation,
      layersVisible: {
        objects: sl.objects.visible,
        paths: sl.paths.visible,
        territories: sl.territories.visible,
        labels: sl.labels.visible,
        peaks: sl.peaks.visible && doc.view.showPeaks,
      },
    };
  }

  private overlay() {
    return editor.layers!.overlay;
  }

  private updateCursorStyle() {
    if (!this.canvas) return;
    const t = this.tool;
    let c = 'crosshair';
    if (t === 'pan') c = this.drag?.kind === 'pan' ? 'grabbing' : 'grab';
    else if (t === 'select') c = 'default';
    else if (brushGroupOf(t)) c = 'none';
    else if (t === 'label') c = 'text';
    this.canvas.style.cursor = c;
  }

  private updateBrushCursor() {
    if (!editor.layers) return;
    const st = useEditor.getState();
    const t = this.tool;
    const g = brushGroupOf(t);
    if (!g || !this.pointer.inside) {
      this.overlay().set({ brush: null });
    } else {
      let color = BRUSH_COLORS[t] ?? 0xffffff;
      if (t === 'paint') color = hexToNumber(STYLE_PRESETS.atlas.biomes[st.biome] ?? '#ffffff');
      if (t === 'fog') color = this.fogOp() === 'fogHide' ? 0xd8ccff : 0xfff2a8;
      if ((t === 'raise' || t === 'lower') && (this.shift || this.alt)) color = t === 'raise' ? 0x8fd6ff : 0xffffff;
      const b = st.brushes[g];
      this.overlay().set({ brush: { x: this.pointer.x, y: this.pointer.y, radiusKm: b.radiusKm, falloff: b.falloff, color } });
    }
    this.updateStampPreview();
    editor.requestRender();
  }

  private updateStampPreview() {
    const st = useEditor.getState();
    if (this.tool !== 'object' || !st.assetId || !this.pointer.inside) {
      this.overlay().set({ stampPreview: null });
      return;
    }
    const info = assetLibrary.get(st.assetId);
    const w = st.stamp.sizePx / editor.zoom;
    this.overlay().set({ stampPreview: { x: this.pointer.x, y: this.pointer.y, w, h: w * (info?.aspect ?? 1), rotation: 0 } });
  }

  private fogOp(): TerrainOp {
    const inv = this.shift || this.alt;
    const hide = useEditor.getState().fogMode === 'hide';
    return hide !== inv ? 'fogHide' : 'fogReveal';
  }

  private onToolChanged(prev: ToolId) {
    if (this.draft && this.draft.tool === prev) this.finishDraft();
    if (prev === 'measure' && this.tool !== 'measure') this.clearMeasure();
    this.overlay().set({ hover: null });
    this.updateCursorStyle();
  }

  private updateCursorInfo() {
    if (this.cursorRaf) return;
    this.cursorRaf = requestAnimationFrame(() => {
      this.cursorRaf = 0;
      const m = editor.model;
      if (!m || !this.pointer.inside) {
        useEditor.getState().set({ cursor: null });
        return;
      }
      const { x, y } = this.pointer;
      if (y < 0 || y > m.H) {
        useEditor.getState().set({ cursor: null });
        return;
      }
      useEditor.getState().set({
        cursor: {
          x: m.geo.wrapX(x),
          y,
          lat: m.geo.lat(y),
          lon: m.geo.lon(x),
          elevation: m.heightAt(x, y) - m.seaLevel,
          biome: m.biomeAt(x, y),
          fog: m.fogAt(x, y),
        },
      });
    });
  }

  // ------------------------------------------------------------ pointer events

  private onEnter = () => {
    this.pointer.inside = true;
  };

  private onLeave = () => {
    this.pointer.inside = false;
    this.overlay()?.set({ brush: null, stampPreview: null, hover: null });
    useEditor.getState().set({ cursor: null });
    editor.requestRender();
  };

  private onDown = (e: PointerEvent) => {
    if (!editor.renderer || !editor.model) return;
    // keep focus where the UI put it (e.g. a new label's text box) and avoid text selection
    e.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.canvas!.setPointerCapture(e.pointerId);
    if (useEditor.getState().readOnly) {
      this.viewerDown(e);
      return;
    }
    this.shift = e.shiftKey;
    this.alt = e.altKey;
    const [x, y] = this.world(e);
    this.pointer = { ...this.pointer, x, y, inside: true };
    if (e.button === 1 || e.button === 2 || this.tool === 'pan') {
      this.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY };
      this.updateCursorStyle();
      return;
    }
    if (e.button !== 0) return;
    const tool = this.tool;
    const st = useEditor.getState();
    const group = brushGroupOf(tool);
    if (group) {
      if (this.layerLocked(tool)) return;
      this.beginStroke(tool, x, y);
      return;
    }
    switch (tool) {
      case 'select':
        this.selectDown(e, x, y);
        break;
      case 'object':
        if (!st.assetId) {
          st.notify('Pick an asset in the library first');
          useEditor.getState().set({ assetPanelOpen: true });
          return;
        }
        if (st.stamp.mode === 'stamp') {
          this.drag = { kind: 'stamp', last: null, key: uid('stamp-') };
          this.stampAt(x, y, this.drag.key);
        } else this.placeObject(x, y);
        break;
      case 'river':
      case 'road':
      case 'territory':
        this.drag = { kind: 'freehand', points: [[x, y]], startScreen: [e.clientX, e.clientY], moved: false };
        break;
      case 'label':
        this.labelDown(x, y);
        break;
      case 'measure':
        this.measureClick(x, y);
        break;
      case 'peak':
        this.peakClick(x, y, e.altKey);
        break;
    }
  };

  private onMove = (e: PointerEvent) => {
    if (!editor.renderer || !editor.model) return;
    if (useEditor.getState().readOnly && this.touches.has(e.pointerId)) {
      this.viewerMove(e);
      return;
    }
    this.shift = e.shiftKey;
    this.alt = e.altKey;
    const r = this.canvas!.getBoundingClientRect();
    const [x, y] = this.world(e);
    this.pointer = { sx: e.clientX - r.left, sy: e.clientY - r.top, x, y, inside: true };
    this.updateCursorInfo();
    const d = this.drag;
    if (d) {
      switch (d.kind) {
        case 'pan':
          editor.renderer.camera.pan(e.clientX - d.sx, e.clientY - d.sy);
          d.sx = e.clientX;
          d.sy = e.clientY;
          editor.renderer.viewChanged();
          this.pointer.x = this.world(e)[0];
          break;
        case 'stroke':
          this.strokeTo(x, y);
          break;
        case 'move': {
          const geo = editor.model.geo;
          const dx = geo.deltaX(d.start[0], x);
          const dy = y - d.start[1];
          if (!d.moved && Math.hypot(dx, dy) * editor.zoom < 3) break;
          d.moved = true;
          moveRefs(d.refs, dx, dy, d.base, d.key);
          break;
        }
        case 'marquee':
          this.overlay().set({ marquee: { x0: d.start[0], y0: d.start[1], x1: nearX(editor.model.geo, d.start[0], x), y1: y } });
          editor.requestRender();
          break;
        case 'rotate': {
          const o = useDoc.getState().doc.objects[d.id];
          if (!o) break;
          let ang = (Math.atan2(nearX(editor.model.geo, o.x, x) - o.x, -(y - o.y)) * 180) / Math.PI;
          if (e.shiftKey) ang = Math.round(ang / 15) * 15;
          updateObjects([d.id], { rotation: Math.round(ang * 10) / 10 }, 'Rotate', d.key);
          break;
        }
        case 'scale': {
          const o = useDoc.getState().doc.objects[d.id];
          if (!o) break;
          const dist = Math.hypot(nearX(editor.model.geo, o.x, x) - o.x, y - o.y);
          const s = clamp((d.startScale * dist) / Math.max(1e-6, d.startDist), 0.05, 40);
          updateObjects([d.id], { scale: Math.round(s * 1000) / 1000 }, 'Scale', d.key);
          break;
        }
        case 'vertex':
          this.dragVertex(d, x, y);
          break;
        case 'labelAnchor': {
          const t = useDoc.getState().doc.territories[d.id];
          if (t) updateFeature('territory', d.id, { labelPos: [nearX(editor.model.geo, t.points[0][0], x), y] }, 'Move territory label', d.key);
          break;
        }
        case 'freehand': {
          const last = d.points[d.points.length - 1];
          const px = nearX(editor.model.geo, d.points[0][0], x);
          if (Math.hypot(e.clientX - d.startScreen[0], e.clientY - d.startScreen[1]) > 6) d.moved = true;
          if (d.moved && Math.hypot(px - last[0], y - last[1]) * editor.zoom > 4) d.points.push([px, y]);
          if (d.moved) this.showDraft(d.points, null);
          break;
        }
        case 'stamp':
          this.stampAt(x, y, d.key);
          break;
      }
    } else {
      if (this.tool === 'select') this.updateHover(x, y);
      if (this.draft) this.showDraft(this.draft.points, [nearX(editor.model.geo, this.draft.points[0][0], x), y]);
      if (this.tool === 'measure' && this.measure.length && !this.measureDone) this.showMeasure([x, y]);
    }
    this.updateBrushCursor();
  };

  private onUp = (e: PointerEvent) => {
    if (this.canvas?.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    if (useEditor.getState().readOnly) {
      this.viewerUp(e);
      return;
    }
    const d = this.drag;
    this.drag = null;
    if (!d || !editor.model) {
      this.updateCursorStyle();
      return;
    }
    switch (d.kind) {
      case 'stroke':
        this.endStroke(d.stroke, d.erase);
        break;
      case 'marquee':
        this.finishMarquee(d);
        break;
      case 'move':
        if (!d.moved && d.refs.length && !this.shift) {
          // plain click on an already-selected item: narrow selection to it
          const hit = hitAny(this.hitCtx(), this.pointer.x, this.pointer.y);
          if (hit) useEditor.getState().select([hit]);
        }
        break;
      case 'freehand':
        this.finishFreehand(d);
        break;
    }
    this.updateCursorStyle();
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const r = editor.renderer;
    if (!r) return;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const dy = e.deltaY * unit;
    if (e.altKey && brushGroupOf(this.tool)) {
      const g = brushGroupOf(this.tool)!;
      const b = useEditor.getState().brushes[g];
      useEditor.getState().setBrush(g, { radiusKm: clampRadius(b.radiusKm * Math.exp(-dy * 0.002)) });
      return;
    }
    const rect = this.canvas!.getBoundingClientRect();
    if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY) * 0.5 && Math.abs(e.deltaX) > 1) {
      r.camera.pan(-e.deltaX * unit, 0);
      r.viewChanged();
      return;
    }
    const k = e.ctrlKey ? 0.012 : 0.0018;
    r.camera.zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-dy * k));
    r.requestRender();
  };

  private onDblClick = (e: MouseEvent) => {
    const [x, y] = this.world(e);
    const t = this.tool;
    if (this.draft) {
      // the second click of the double-click already added a point; drop it
      if (this.draft.points.length > 2) this.draft.points.pop();
      this.finishDraft();
      return;
    }
    if (t === 'measure') {
      this.measureDone = true;
      this.showMeasure(null);
      return;
    }
    if (t === 'select') {
      // insert a control point on the selected path / territory
      const sel = useEditor.getState().selection;
      if (sel.length !== 1) return;
      const ref = sel[0];
      const doc = useDoc.getState().doc;
      const item = ref.kind === 'path' ? doc.paths[ref.id] : ref.kind === 'territory' ? doc.territories[ref.id] : null;
      if (!item || item.locked) return;
      const px = nearX(editor.model!.geo, item.points[0][0], x);
      const idx = insertionIndex(item.points, px, y, ref.kind === 'territory');
      const pts = item.points.slice();
      pts.splice(idx, 0, [px, y]);
      if (ref.kind === 'path') updateFeature('path', ref.id, { points: pts }, 'Add point');
      else updateFeature('territory', ref.id, { points: pts }, 'Add point');
    }
  };

  // ------------------------------------------------------------ frame hook (airbrush)

  private onFrame = (): boolean => {
    const d = this.drag;
    if (d?.kind === 'stroke') {
      const now = performance.now();
      if (now - d.lastDab > 55) {
        const { x, y } = this.pointer;
        d.stroke.dab(x, y, 0.6);
        if (d.erase) this.eraseFeaturesAt(x, y, d.erase);
        d.lastDab = now;
      }
      return true;
    }
    return false;
  };

  // ------------------------------------------------------------ terrain / paint / fog strokes

  private layerLocked(tool: ToolId): boolean {
    const sl = useDoc.getState().doc.systemLayers;
    const lockedLayer = tool === 'paint' ? sl.biomes : tool === 'fog' ? sl.fog : tool === 'erase' ? null : sl.terrain;
    if (lockedLayer?.locked) {
      useEditor.getState().notify('That layer is locked — unlock it in the Layers panel');
      return true;
    }
    return false;
  }

  private beginStroke(tool: ToolId, x: number, y: number) {
    const st = useEditor.getState();
    const model = editor.model!;
    const g = brushGroupOf(tool)!;
    const inv = this.shift || this.alt;
    let op: TerrainOp;
    switch (tool) {
      case 'raise':
        op = inv ? 'lower' : 'raise';
        break;
      case 'lower':
        op = inv ? 'raise' : 'lower';
        break;
      case 'smooth':
        op = 'smooth';
        break;
      case 'flatten':
        op = 'flatten';
        break;
      case 'ridge':
        op = 'ridge';
        break;
      case 'paint':
        op = inv ? 'erase' : 'paint';
        break;
      case 'fog':
        op = this.fogOp();
        break;
      default:
        op = 'erase';
    }
    const flattenTarget = tool === 'flatten' && st.flattenMode === 'fixed' ? model.seaLevel + st.flattenHeight : undefined;
    const stroke = new Stroke(model, op, st.brushes[g], {
      biome: st.biome,
      flattenTarget,
      seed: (useDoc.getState().meta?.seed ?? 1) % 9973,
    });
    const erase: EraseState | undefined = tool === 'erase' ? { before: null } : undefined;
    if (tool !== 'erase' || st.eraseTargets.biomes) stroke.dab(x, y);
    if (erase) this.eraseFeaturesAt(x, y, erase);
    this.drag = { kind: 'stroke', stroke, last: [x, y], lastDab: performance.now(), erase };
  }

  private strokeTo(x: number, y: number) {
    const d = this.drag;
    if (d?.kind !== 'stroke') return;
    const model = editor.model!;
    const st = useEditor.getState();
    const g = brushGroupOf(this.tool) ?? 'terrain';
    d.stroke.setParams(st.brushes[g]);
    const geo = model.geo;
    const rCells = st.brushes[g].radiusKm / geo.kmPerCellY;
    const spacing = Math.max(0.35, rCells * 0.16);
    const dx = geo.deltaX(d.last[0], x);
    const dy = y - d.last[1];
    const dist = Math.hypot(dx, dy);
    if (dist < spacing) return;
    const n = Math.ceil(dist / spacing);
    const biomesOn = this.tool !== 'erase' || st.eraseTargets.biomes;
    for (let i = 1; i <= n; i++) {
      const px = d.last[0] + (dx * i) / n;
      const py = d.last[1] + (dy * i) / n;
      if (biomesOn) d.stroke.dab(px, py);
      if (d.erase) this.eraseFeaturesAt(px, py, d.erase);
    }
    d.last = [d.last[0] + dx, y];
    d.lastDab = performance.now();
  }

  private endStroke(stroke: Stroke, erase?: EraseState) {
    const change = stroke.finish();
    const model = editor.model!;
    if (erase?.before) {
      // one undo step for everything this eraser stroke removed
      const before = erase.before;
      const cur = useDoc.getState().doc;
      const after = { objects: cur.objects, paths: cur.paths, labels: cur.labels };
      const setVec = (v: typeof before) => useDoc.setState((s) => ({ doc: { ...s.doc, ...v }, revision: s.revision + 1 }));
      history.push({
        label: 'Erase',
        cost: 4096 + (change ? [...change.before.values(), ...change.after.values()].reduce((a, t) => a + (t?.byteLength ?? 0), 0) : 0),
        undo: () => {
          if (change) model.applyTiles(change, 'before');
          setVec(before);
        },
        redo: () => {
          if (change) model.applyTiles(change, 'after');
          setVec(after);
        },
      });
      return;
    }
    if (!change) return;
    const names: Record<TerrainOp, string> = {
      raise: 'Raise terrain',
      lower: 'Lower terrain',
      smooth: 'Smooth terrain',
      flatten: 'Flatten terrain',
      ridge: 'Build mountains',
      paint: 'Paint biome',
      erase: 'Erase biome',
      fogHide: 'Hide with fog',
      fogReveal: 'Reveal fog',
    };
    pushTileChange(change, names[stroke.op], model);
  }

  /** Eraser: remove objects / path points / labels under the brush. */
  private eraseFeaturesAt(x: number, y: number, state: EraseState) {
    const st = useEditor.getState();
    const t = st.eraseTargets;
    if (!t.objects && !t.paths && !t.labels) return;
    const model = editor.model!;
    const geo = model.geo;
    const doc = useDoc.getState().doc;
    const r = st.brushes.erase.radiusKm;
    const within = (px: number, py: number) => geo.distanceKm(x, y, px, py) <= r;
    const objs = t.objects
      ? Object.values(doc.objects).filter((o) => !o.locked && !o.hidden && !doc.objectLayers.find((l) => l.id === o.layerId)?.locked && within(o.x, o.y))
      : [];
    const paths = t.paths ? Object.values(doc.paths).filter((p) => !p.locked && p.points.some(([px, py]) => within(px, py))) : [];
    const labels = t.labels ? Object.values(doc.labels).filter((l) => !l.locked && within(l.x, l.y)) : [];
    if (!objs.length && !paths.length && !labels.length) return;
    if (!state.before) state.before = { objects: doc.objects, paths: doc.paths, labels: doc.labels };
    const apply = (d: MapDocument) => {
        const objects = { ...d.objects };
        for (const o of objs) delete objects[o.id];
        const ps = { ...d.paths };
        for (const p of paths) {
          // drop the points under the brush; split-free: keep the longer remainder
          const keep = p.points.filter(([px, py]) => !within(px, py));
          if (keep.length < 2) delete ps[p.id];
          else ps[p.id] = { ...p, points: keep };
        }
        const ls = { ...d.labels };
        for (const l of labels) delete ls[l.id];
        return { objects, paths: ps, labels: ls };
    };
    useDoc.setState((s) => ({ doc: { ...s.doc, ...apply(s.doc) }, revision: s.revision + 1 }));
  }

  // ------------------------------------------------------------ selection

  private selectDown(e: PointerEvent, x: number, y: number) {
    const st = useEditor.getState();
    const ctx = this.hitCtx();
    const doc = ctx.doc;
    const sel = st.selection;
    const key = uid('drag-');
    // handles of a single selection
    if (sel.length === 1) {
      const ref = sel[0];
      if (ref.kind === 'object' && doc.objects[ref.id] && !doc.objects[ref.id].locked) {
        const o = doc.objects[ref.id];
        const h = objectHandleHit(ctx, ref.id, x, y, rotateHandle(o, ctx.zoom));
        if (h === 'rotate') {
          this.drag = { kind: 'rotate', id: ref.id, key };
          return;
        }
        if (typeof h === 'number') {
          this.drag = { kind: 'scale', id: ref.id, startDist: Math.hypot(nearX(ctx.geo, o.x, x) - o.x, y - o.y), startScale: o.scale, key };
          return;
        }
      }
      if ((ref.kind === 'path' || ref.kind === 'territory') && !e.shiftKey) {
        const item = ref.kind === 'path' ? doc.paths[ref.id] : doc.territories[ref.id];
        if (item && !item.locked) {
          const vi = hitVertex(ctx.geo, item.points, x, y, ctx.zoom);
          if (vi >= 0) {
            if (e.altKey) {
              const min = ref.kind === 'path' ? 2 : 3;
              if (item.points.length > min) {
                const pts = item.points.filter((_, i) => i !== vi);
                if (ref.kind === 'path') updateFeature('path', ref.id, { points: pts }, 'Delete point');
                else updateFeature('territory', ref.id, { points: pts }, 'Delete point');
              }
              return;
            }
            this.drag = { kind: 'vertex', ref, index: vi, key };
            return;
          }
          if (ref.kind === 'territory') {
            const [lx, ly] = territoryLabelPos(item as Territory);
            if (Math.hypot(nearX(ctx.geo, lx, x) - lx, y - ly) < 8 / ctx.zoom) {
              this.drag = { kind: 'labelAnchor', id: ref.id, key };
              return;
            }
          }
        }
      }
    }
    const hit = hitAny(ctx, x, y);
    if (!hit) {
      if (!e.shiftKey) st.select([]);
      this.drag = { kind: 'marquee', start: [x, y], additive: e.shiftKey };
      return;
    }
    const already = sel.some((r) => r.id === hit.id);
    let next = sel;
    if (e.shiftKey) next = already ? sel.filter((r) => r.id !== hit.id) : [...sel, hit];
    else if (!already) next = [hit];
    st.select(next);
    if (hit.kind === 'peak') return;
    const movable = next.filter((r) => r.kind !== 'peak');
    if (movable.length) this.drag = { kind: 'move', start: [x, y], base: doc, refs: movable, moved: false, key };
  }

  private updateHover(x: number, y: number) {
    const hit = hitAny(this.hitCtx(), x, y);
    const cur = this.overlay().state.hover;
    if ((hit?.id ?? null) !== (cur?.id ?? null)) {
      this.overlay().set({ hover: hit });
      editor.requestRender();
    }
  }

  private finishMarquee(d: Extract<Drag, { kind: 'marquee' }>) {
    const m = this.overlay().state.marquee;
    this.overlay().set({ marquee: null });
    editor.requestRender();
    const click = !m || (Math.abs(m.x1 - m.x0) * editor.zoom < 3 && Math.abs(m.y1 - m.y0) * editor.zoom < 3);
    if (click || !m) {
      // a plain click on empty map: show the landmass or water body there
      if (!d.additive) void inspectAt(d.start[0], d.start[1]);
      return;
    }
    const x0 = Math.min(m.x0, m.x1);
    const x1 = Math.max(m.x0, m.x1);
    const y0 = Math.min(m.y0, m.y1);
    const y1 = Math.max(m.y0, m.y1);
    const geo = editor.model!.geo;
    const doc = useDoc.getState().doc;
    const inside = (x: number, y: number) => {
      const px = nearX(geo, (x0 + x1) / 2, x);
      return px >= x0 && px <= x1 && y >= y0 && y <= y1;
    };
    const refs: SelectionRef[] = [];
    const lockedLayers = new Set(doc.objectLayers.filter((l) => l.locked || !l.visible).map((l) => l.id));
    for (const o of Object.values(doc.objects)) if (!o.hidden && !lockedLayers.has(o.layerId) && inside(o.x, o.y)) refs.push({ kind: 'object', id: o.id });
    for (const l of Object.values(doc.labels)) if (!l.hidden && inside(l.x, l.y)) refs.push({ kind: 'label', id: l.id });
    for (const p of Object.values(doc.paths)) if (!p.hidden && p.points.every(([x, y]) => inside(x, y))) refs.push({ kind: 'path', id: p.id });
    const st = useEditor.getState();
    const base = d.additive ? st.selection : [];
    const ids = new Set(base.map((r) => r.id));
    st.select([...base, ...refs.filter((r) => !ids.has(r.id))]);
  }

  private dragVertex(d: Extract<Drag, { kind: 'vertex' }>, x: number, y: number) {
    const doc = useDoc.getState().doc;
    const item = d.ref.kind === 'path' ? doc.paths[d.ref.id] : doc.territories[d.ref.id];
    if (!item) return;
    const pts = item.points.slice();
    pts[d.index] = [nearX(editor.model!.geo, item.points[0][0], x), y];
    if (d.ref.kind === 'path') updateFeature('path', d.ref.id, { points: pts }, 'Edit path', d.key);
    else updateFeature('territory', d.ref.id, { points: pts }, 'Edit border', d.key);
  }

  // ------------------------------------------------------------ objects

  private placeObject(x: number, y: number) {
    const st = useEditor.getState();
    const geo = editor.model!.geo;
    const layer = useDoc.getState().doc.objectLayers.find((l) => l.id === st.activeObjectLayer);
    if (layer?.locked) {
      st.notify(`Layer “${layer.name}” is locked`);
      return;
    }
    const o = newObject({ assetId: st.assetId!, x: geo.wrapX(x), y, size: st.stamp.sizePx / editor.zoom, name: '' });
    addObjects([o]);
    st.select([{ kind: 'object', id: o.id }]);
  }

  private stampAt(x: number, y: number, key: string) {
    const d = this.drag;
    if (d?.kind !== 'stamp') return;
    const st = useEditor.getState();
    const geo = editor.model!.geo;
    const spacing = st.stamp.spacingPx / editor.zoom;
    if (d.last && Math.hypot(geo.deltaX(d.last[0], x), y - d.last[1]) < spacing) return;
    d.last = [x, y];
    const s = st.stamp;
    const jitter = spacing * 0.25;
    const o = newObject({
      assetId: st.assetId!,
      x: geo.wrapX(x + (Math.random() - 0.5) * jitter),
      y: y + (Math.random() - 0.5) * jitter,
      size: s.sizePx / editor.zoom,
      scale: 1 + (Math.random() * 2 - 1) * s.randomScale,
      rotation: (Math.random() * 2 - 1) * s.randomRotation,
      flipX: s.randomFlip && Math.random() < 0.5,
    });
    useDoc.getState().commit('Stamp objects', (dd) => ({ objects: { ...dd.objects, [o.id]: o } }), key);
  }

  // ------------------------------------------------------------ labels & peaks

  private labelDown(x: number, y: number) {
    const ctx = this.hitCtx();
    const st = useEditor.getState();
    const existing = hitAny(ctx, x, y);
    if (existing?.kind === 'label') {
      st.select([existing]);
      st.set({ focusLabel: existing.id });
      this.drag = { kind: 'move', start: [x, y], base: ctx.doc, refs: [existing], moved: false, key: uid('drag-') };
      return;
    }
    const d = st.labelDefaults;
    const style = STYLE_PRESETS[ctx.doc.view.style];
    const l: MapLabel = {
      id: uid('label-'),
      text: 'New label',
      x: ctx.geo.wrapX(x),
      y,
      size: d.sizePx / editor.zoom,
      font: d.font,
      color: d.color || style.labelColor,
      rotation: 0,
      letterSpacing: d.font === 'display' ? 0.12 : 0.02,
      uppercase: d.font === 'display',
      italic: d.font === 'script',
      halo: true,
      curve: 0,
      opacity: 1,
      hidden: false,
      locked: false,
    };
    addFeature('label', l, 'Add label');
    st.select([{ kind: 'label', id: l.id }]);
    st.set({ focusLabel: l.id });
  }

  private peakClick(x: number, y: number, remove: boolean) {
    const ctx = this.hitCtx();
    const st = useEditor.getState();
    const p = hitPeak({ ...ctx, layersVisible: { ...ctx.layersVisible, peaks: true } }, x, y, 14);
    if (remove) {
      if (p) removePeak(p.id);
      return;
    }
    if (p) {
      st.select([{ kind: 'peak', id: p.id }]);
      return;
    }
    const m = editor.model!;
    if (m.heightAt(x, y) <= m.seaLevel) {
      st.notify('Peaks can only be designated on land');
      return;
    }
    const id = designatePeak(m.geo.wrapX(x), y);
    st.select([{ kind: 'peak', id }]);
  }

  // ------------------------------------------------------------ drawing (paths & territories)

  private showDraft(points: Vec2[], cursor: Vec2 | null) {
    const t = this.draft?.tool ?? this.tool;
    const st = useEditor.getState();
    const color =
      t === 'river' ? hexToNumber(st.pathDefaults.river.color) : t === 'road' ? hexToNumber(st.pathDefaults.road.color) : hexToNumber(st.territoryDefaults.color);
    this.overlay().set({ draft: { points, closed: t === 'territory', color, cursor } });
    editor.requestRender();
  }

  private finishFreehand(d: Extract<Drag, { kind: 'freehand' }>) {
    const tool = this.tool;
    if (d.moved && d.points.length >= 2) {
      // freehand stroke → simplified, editable spline
      let pts = simplifyPath(d.points, 2.2 / editor.zoom);
      if (tool === 'territory' && pts.length > 3) {
        // a lasso that ends where it began must not repeat its first point
        const [fx, fy] = pts[0];
        const near = (p: Vec2) => Math.hypot(p[0] - fx, p[1] - fy) * editor.zoom < 14;
        while (pts.length > 3 && near(pts[pts.length - 1])) pts = pts.slice(0, -1);
      }
      this.draft = null;
      this.commitDrawing(tool, pts);
      this.overlay().set({ draft: null });
      editor.requestRender();
      return;
    }
    // click mode: add a vertex to the draft
    const p = d.points[0];
    if (!this.draft || this.draft.tool !== tool) this.draft = { tool, points: [] };
    const pts = this.draft.points;
    if (tool === 'territory' && pts.length >= 3) {
      const [fx, fy] = pts[0];
      if (Math.hypot(nearX(editor.model!.geo, fx, p[0]) - fx, p[1] - fy) * editor.zoom < 10) {
        this.finishDraft();
        return;
      }
    }
    pts.push(pts.length ? [nearX(editor.model!.geo, pts[0][0], p[0]), p[1]] : p);
    this.showDraft(pts, null);
  }

  private finishDraft() {
    const dr = this.draft;
    this.draft = null;
    this.overlay().set({ draft: null });
    editor.requestRender();
    if (!dr) return;
    this.commitDrawing(dr.tool, dr.points);
  }

  private cancelDraft() {
    this.draft = null;
    this.overlay().set({ draft: null });
    editor.requestRender();
  }

  private commitDrawing(tool: ToolId, raw: Vec2[]) {
    const st = useEditor.getState();
    const geo = editor.model!.geo;
    if (!raw.length) return;
    // normalise so the first point lies in [0, W)
    const shift = geo.wrapX(raw[0][0]) - raw[0][0];
    const pts = raw.map(([x, y]) => [x + shift, y] as Vec2);
    const zoom = editor.zoom;
    if ((tool === 'river' || tool === 'road') && pts.length >= 2) {
      const def = tool === 'river' ? st.pathDefaults.river : st.pathDefaults.road;
      const p: PathFeature = {
        id: uid('path-'),
        kind: tool,
        points: pts,
        width: def.width / zoom,
        color: def.color,
        style: tool === 'road' ? st.pathDefaults.road.style : 'solid',
        taper: tool === 'river' ? st.pathDefaults.river.taper : false,
        name: '',
        hidden: false,
        locked: false,
      };
      addFeature('path', p, tool === 'river' ? 'Draw river' : 'Draw road');
      st.select([{ kind: 'path', id: p.id }]);
    } else if (tool === 'territory' && pts.length >= 3) {
      const d = st.territoryDefaults;
      const count = Object.keys(useDoc.getState().doc.territories).length;
      const t: Territory = {
        id: uid('terr-'),
        name: `New realm ${count + 1}`,
        type: d.type,
        points: pts,
        color: d.color,
        fillOpacity: 0.22,
        borderColor: darken(d.color),
        borderStyle: d.borderStyle,
        borderWidth: 2,
        showLabel: true,
        labelSize: 26 / zoom,
        labelPos: null,
        description: '',
        hidden: false,
        locked: false,
      };
      addFeature('territory', t, 'Draw territory');
      st.select([{ kind: 'territory', id: t.id }]);
    }
  }

  // ------------------------------------------------------------ measuring

  private measureClick(x: number, y: number) {
    if (this.measureDone) {
      this.measure = [];
      this.measureDone = false;
    }
    const geo = editor.model!.geo;
    this.measure.push(this.measure.length ? [nearX(geo, this.measure[this.measure.length - 1][0], x), y] : [x, y]);
    this.showMeasure(null);
  }

  // ------------------------------------------------------------ viewer (read-only) input

  /** One finger pans, two pinch to zoom; a tap shows what is there. Nothing is edited. */
  private viewerDown(e: PointerEvent) {
    this.touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (this.touches.size === 2) {
      const [a, b] = [...this.touches.values()];
      this.pinch = { dist: Math.hypot(a[0] - b[0], a[1] - b[1]), mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 };
      this.tap = null;
    } else if (this.touches.size === 1) this.tap = { x: e.clientX, y: e.clientY, t: performance.now() };
  }

  private viewerMove(e: PointerEvent) {
    const prev = this.touches.get(e.pointerId)!;
    this.touches.set(e.pointerId, [e.clientX, e.clientY]);
    const cam = editor.renderer!.camera;
    const rect = this.canvas!.getBoundingClientRect();
    if (this.pinch && this.touches.size >= 2) {
      const [a, b] = [...this.touches.values()];
      const dist = Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1]));
      const mx = (a[0] + b[0]) / 2;
      const my = (a[1] + b[1]) / 2;
      cam.pan(mx - this.pinch.mx, my - this.pinch.my);
      cam.zoomAt(mx - rect.left, my - rect.top, dist / this.pinch.dist, false);
      this.pinch = { dist, mx, my };
    } else {
      cam.pan(e.clientX - prev[0], e.clientY - prev[1]);
      if (this.tap && Math.hypot(e.clientX - this.tap.x, e.clientY - this.tap.y) > 8) this.tap = null;
    }
    editor.renderer!.viewChanged();
  }

  private viewerUp(e: PointerEvent) {
    this.touches.delete(e.pointerId);
    if (this.touches.size < 2) this.pinch = null;
    const tap = this.tap;
    this.tap = null;
    if (!tap || this.touches.size || performance.now() - tap.t > 500 || !editor.model) return;
    const [x, y] = this.world(e);
    const hit = hitAny(this.hitCtx(), x, y);
    if (hit) useEditor.getState().select([hit]);
    else {
      useEditor.getState().select([]);
      void inspectAt(x, y);
    }
  }

  /** Re-label the measurement (e.g. after the display units changed). */
  refreshMeasure() {
    if (this.measure.length && editor.model) this.showMeasure(null);
  }

  private showMeasure(cursor: Vec2 | null) {
    const geo = editor.model!.geo;
    const pts = cursor && this.measure.length ? [...this.measure, [nearX(geo, this.measure[this.measure.length - 1][0], cursor[0]), cursor[1]] as Vec2] : this.measure;
    const arcs: Vec2[][] = [];
    const labels: { x: number; y: number; text: string }[] = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1];
      const [bx, by] = pts[i];
      const km = geo.distanceKm(ax, ay, bx, by);
      total += km;
      const arc = geo.greatCircle(ax, ay, bx, by, 64);
      arcs.push(arc);
      const mid = arc[Math.floor(arc.length / 2)];
      if (pts.length > 2) labels.push({ x: mid[0], y: mid[1], text: formatLength(km, useEditor.getState().units) });
    }
    if (pts.length >= 2) {
      const last = pts[pts.length - 1];
      labels.push({ x: last[0], y: last[1] - 6 / editor.zoom, text: (pts.length > 2 ? 'Total ' : '') + formatLength(total, useEditor.getState().units) });
    }
    this.overlay().set({ measure: pts.length ? { points: pts, arcs, labels } : null });
    editor.requestRender();
  }

  private clearMeasure() {
    this.measure = [];
    this.measureDone = false;
    this.overlay().set({ measure: null });
    editor.requestRender();
  }

  // ------------------------------------------------------------ keyboard

  private onKeyDown = (e: KeyboardEvent) => {
    if (isTyping(e)) return;
    // the viewer has no editing shortcuts; Escape still clears what is shown
    if (useEditor.getState().readOnly) {
      if (e.key === 'Escape') {
        useEditor.getState().select([]);
        clearInspect();
      }
      return;
    }
    this.shift = e.shiftKey;
    this.alt = e.altKey;
    const st = useEditor.getState();
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key;
    if (k === ' ') {
      if (!this.spaceDown) {
        this.spaceDown = true;
        this.updateCursorStyle();
        this.updateBrushCursor();
      }
      e.preventDefault();
      return;
    }
    if (mod) {
      const lk = k.toLowerCase();
      if (lk === 'z') {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
      } else if (lk === 'y') {
        e.preventDefault();
        history.redo();
      } else if (lk === 's') {
        e.preventDefault();
        st.set({ saveStatus: 'pending' });
        void editor.saveNow();
      } else if (lk === 'd') {
        e.preventDefault();
        duplicateRefs(st.selection, 12 / editor.zoom);
      } else if (lk === 'a' && st.tool === 'select') {
        e.preventDefault();
        const doc = useDoc.getState().doc;
        st.select([
          ...Object.values(doc.objects).filter((o) => !o.hidden).map((o) => ({ kind: 'object' as const, id: o.id })),
          ...Object.values(doc.labels).filter((l) => !l.hidden).map((l) => ({ kind: 'label' as const, id: l.id })),
        ]);
      } else if (k === '0') {
        e.preventDefault();
        editor.renderer?.camera.fitWorld();
        editor.renderer?.viewChanged();
      } else if (k === ']' || k === '[') {
        e.preventDefault();
        const ids = st.selection.filter((r) => r.kind === 'object').map((r) => r.id);
        if (ids.length) reorderObjects(ids, k === ']' ? (e.shiftKey ? 'front' : 'forward') : e.shiftKey ? 'back' : 'backward');
      }
      return;
    }
    if (k === 'Escape') {
      if (this.draft) this.cancelDraft();
      else if (this.tool === 'measure') this.clearMeasure();
      else {
        st.select([]);
        clearInspect();
      }
      return;
    }
    if (k === 'Enter') {
      if (this.draft) this.finishDraft();
      else if (this.tool === 'measure') {
        this.measureDone = true;
        this.showMeasure(null);
      }
      return;
    }
    if (k === 'Delete' || k === 'Backspace') {
      if (this.draft) {
        this.draft.points.pop();
        if (!this.draft.points.length) this.cancelDraft();
        else this.showDraft(this.draft.points, null);
      } else if (st.selection.length) deleteRefs(st.selection);
      e.preventDefault();
      return;
    }
    if (k.startsWith('Arrow') && st.selection.length) {
      const step = (e.shiftKey ? 10 : 1) / editor.zoom;
      const dx = k === 'ArrowLeft' ? -step : k === 'ArrowRight' ? step : 0;
      const dy = k === 'ArrowUp' ? -step : k === 'ArrowDown' ? step : 0;
      moveRefs(
        st.selection.filter((r) => r.kind !== 'peak'),
        dx,
        dy,
        undefined,
        'nudge',
      );
      e.preventDefault();
      return;
    }
    if (k === '[' || k === ']' || k === '{' || k === '}') {
      const up = k === ']' || k === '}';
      const g = brushGroupOf(st.tool);
      if (g) {
        const b = st.brushes[g];
        if (e.shiftKey) st.setBrush(g, { strength: clamp(b.strength + (up ? 0.05 : -0.05), 0.01, 1) });
        else st.setBrush(g, { radiusKm: clampRadius(b.radiusKm * (up ? 1.15 : 1 / 1.15)) });
      } else if (st.tool === 'object') {
        st.set({ stamp: { ...st.stamp, sizePx: clamp(st.stamp.sizePx * (up ? 1.15 : 1 / 1.15), 8, 600) } });
        this.updateStampPreview();
        editor.requestRender();
      }
      return;
    }
    if (st.tool === 'paint' && /^[1-8]$/.test(k)) {
      st.set({ biome: Number(k) - 1 });
      st.notify(`Biome: ${BIOMES[Number(k) - 1].name}`);
      return;
    }
    const map: Record<string, ToolId> = {
      v: 'select',
      h: 'pan',
      r: 'raise',
      l: 'lower',
      s: 'smooth',
      f: 'flatten',
      m: 'ridge',
      b: 'paint',
      e: 'erase',
      w: 'river',
      d: 'road',
      o: 'object',
      t: 'label',
      g: 'territory',
      x: 'fog',
      u: 'measure',
      p: 'peak',
    };
    const tool = map[k.toLowerCase()];
    if (tool && !e.altKey) {
      st.setTool(tool);
      return;
    }
    if (k === '?') st.set({ dialog: 'shortcuts' });
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.shift = e.shiftKey;
    this.alt = e.altKey;
    if (e.key === ' ') {
      this.spaceDown = false;
      this.updateCursorStyle();
      this.updateBrushCursor();
    }
    if (e.key === 'Shift' || e.key === 'Alt') this.updateBrushCursor();
  };
}

function darken(hex: string): string {
  const v = hex.replace('#', '');
  const f = (i: number) => Math.round(parseInt(v.slice(i, i + 2), 16) * 0.55).toString(16).padStart(2, '0');
  return `#${f(0)}${f(2)}${f(4)}`;
}

/** Push a raster change onto the undo stack. */
export function pushTileChange(change: TileChange, label: string, model = editor.model!) {
  let bytes = 0;
  for (const v of change.before.values()) bytes += v?.byteLength ?? 0;
  for (const v of change.after.values()) bytes += v?.byteLength ?? 0;
  history.push({
    label,
    cost: bytes,
    undo: () => model.applyTiles(change, 'before'),
    redo: () => model.applyTiles(change, 'after'),
  });
}

export const tools = new ToolController();
Object.assign(window as object, { __tools: tools });

// measurement labels follow the display units
useEditor.subscribe((s, prev) => {
  if (s.units !== prev.units) tools.refreshMeasure();
});

/** Keep a brush radius within what makes sense for the open map. */
function clampRadius(km: number): number {
  const r = editor.model ? brushRange(editor.model.geo) : { min: 5, max: 6000 };
  return clamp(km, r.min, r.max);
}
