import { create } from 'zustand';
import { detectViewer } from './viewer';
import type { Units } from '../core/units';
import type { RegionInfo } from '../terrain/geography';
import type { BrushParams } from '../terrain/brushes';
import type { ResolvedPeak } from '../terrain/peaks';
import type { BorderStyle, LabelFont, RoadStyle, SelectionRef, TerritoryType } from '../model/types';

export type ToolId =
  | 'select'
  | 'info'
  | 'pan'
  | 'raise'
  | 'lower'
  | 'smooth'
  | 'flatten'
  | 'ridge'
  | 'paint'
  | 'erase'
  | 'river'
  | 'road'
  | 'object'
  | 'label'
  | 'territory'
  | 'fog'
  | 'measure'
  | 'peak';

export type BrushGroup = 'terrain' | 'paint' | 'fog' | 'erase';

export const TERRAIN_TOOLS: ToolId[] = ['raise', 'lower', 'smooth', 'flatten', 'ridge'];

export function brushGroupOf(tool: ToolId): BrushGroup | null {
  if (TERRAIN_TOOLS.includes(tool)) return 'terrain';
  if (tool === 'paint') return 'paint';
  if (tool === 'fog') return 'fog';
  if (tool === 'erase') return 'erase';
  return null;
}

export interface StampSettings {
  mode: 'single' | 'stamp';
  /** Default object width in screen pixels at placement zoom. */
  sizePx: number;
  spacingPx: number;
  randomScale: number;
  randomRotation: number;
  randomFlip: boolean;
}

export interface CursorInfo {
  x: number;
  y: number;
  lat: number;
  lon: number;
  elevation: number;
  biome: number;
  fog: number;
}

export type DialogId = null | 'projects' | 'export' | 'generate' | 'planet' | 'shortcuts' | 'newProject' | 'share';

export type SaveStatus = 'saved' | 'saving' | 'pending' | 'error';

interface EditorState {
  tool: ToolId;
  prevTool: ToolId | null;
  brushes: Record<BrushGroup, BrushParams>;
  flattenMode: 'sample' | 'fixed';
  flattenHeight: number;
  biome: number;
  eraseTargets: { biomes: boolean; objects: boolean; paths: boolean; labels: boolean };
  fogMode: 'hide' | 'reveal';
  /** Show what fog hides (editor preview). */
  fogPreview: boolean;
  assetId: string | null;
  stamp: StampSettings;
  activeObjectLayer: string;
  /** Default widths are in screen pixels at the zoom where the path is drawn. */
  pathDefaults: { river: { width: number; color: string; taper: boolean }; road: { width: number; color: string; style: RoadStyle } };
  territoryDefaults: { type: TerritoryType; color: string; borderStyle: BorderStyle };
  labelDefaults: { font: LabelFont; sizePx: number; color: string };
  selection: SelectionRef[];
  cursor: CursorInfo | null;
  peaks: ResolvedPeak[];
  dialog: DialogId;
  assetPanelOpen: boolean;
  inspectorOpen: boolean;
  layersOpen: boolean;
  saveStatus: SaveStatus;
  lastSavedAt: number;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string;
  redoLabel: string;
  toast: { id: number; text: string; kind: 'info' | 'error' } | null;
  /** Label id whose text field the inspector should focus. */
  focusLabel: string | null;
  /** True-area land statistics of the current map. */
  landStats: { areaKm2: number; fraction: number; highest: number } | null;
  busy: string | null;
  /** When set, the busy overlay offers a Cancel button that calls it. */
  busyCancel: (() => void) | null;
  /** First launch (no maps in this browser): show the welcome screen. */
  welcome: boolean;
  /** Which raise-brush preset the terrain brush follows ('custom' once a slider is moved). */
  terrainPreset: TerrainPreset;
  /** Read-only viewer (phones and tablets): look around, no editing. */
  readOnly: boolean;
  /** Landmass or water body shown in the inspector (found again by its anchor after edits). */
  inspect: { land: boolean; id: number; anchorX: number; anchorY: number } | null;
  /** Landmasses and water bodies of the current terrain (null until first measured). */
  geography: { land: RegionInfo[]; water: RegionInfo[]; landKm2: number; mapKm2: number } | null;
  geoBusy: boolean;
  geoListOpen: boolean;
  /** Units for areas and distances in the geography panels. */
  units: Units;
  /** The right-hand panel is hidden to give the map more room (remembered per browser). */
  panelHidden: boolean;

  setTool(t: ToolId): void;
  setBrush(g: BrushGroup, p: Partial<BrushParams>): void;
  set(p: Partial<EditorState>): void;
  select(sel: SelectionRef[]): void;
  notify(text: string, kind?: 'info' | 'error'): void;
}

/** Switch display units everywhere (and remember the choice in this browser). */
export type TerrainPreset = 'plains' | 'hills' | 'plateau' | 'mountains' | 'custom';

/**
 * Raise-brush presets: each builds a kind of land and stops at a sensible
 * height, so a first map looks right without touching a slider.
 */
export const TERRAIN_PRESETS: Record<Exclude<TerrainPreset, 'custom'>, { label: string; hint: (h: string) => string; params: Omit<BrushParams, 'radiusKm'> }> = {
  plains: { label: 'Plains', hint: (h) => `Low, flat land that levels off around ${h}.`, params: { strength: 0.6, falloff: 0.8, opacity: 1, roughness: 0.15, ceiling: 180, ceilingVar: 0.25 } },
  hills: { label: 'Hills', hint: (h) => `Rolling uplands that rise to about ${h}.`, params: { strength: 0.5, falloff: 0.75, opacity: 1, roughness: 0.3, ceiling: 900, ceilingVar: 0.6 } },
  plateau: { label: 'Plateau', hint: (h) => `A high, level tableland around ${h}.`, params: { strength: 0.6, falloff: 0.5, opacity: 1, roughness: 0.15, ceiling: 1600, ceilingVar: 0.12 } },
  mountains: { label: 'Mountains', hint: () => 'Keeps rising while you paint: build peaks (or use the Mountain range tool).', params: { strength: 0.75, falloff: 0.85, opacity: 1, roughness: 0.5 } },
};

export function setUnits(units: Units) {
  useEditor.getState().set({ units });
  try {
    localStorage.setItem('loremapper.units', units);
  } catch {
    // remembering the choice is a convenience only
  }
}

/** The viewer (phones and tablets) remembers its own choice: the panel starts hidden there. */
const panelKey = () => (detectViewer() ? 'loremapper.panel.viewer' : 'loremapper.panel');

export function togglePanel(show?: boolean) {
  const hidden = show === undefined ? !useEditor.getState().panelHidden : !show;
  useEditor.getState().set({ panelHidden: hidden });
  try {
    localStorage.setItem(panelKey(), hidden ? 'hidden' : 'shown');
  } catch {
    // remembering the choice is a convenience only
  }
}

function storedPanelHidden(): boolean {
  const viewer = detectViewer();
  try {
    const v = localStorage.getItem(panelKey());
    return v === null ? viewer : v === 'hidden';
  } catch {
    return viewer;
  }
}

function storedUnits(): Units {
  try {
    return localStorage.getItem('loremapper.units') === 'imperial' ? 'imperial' : 'metric';
  } catch {
    return 'metric';
  }
}

export const useEditor = create<EditorState>((set, get) => ({
  tool: detectViewer() ? 'select' : 'raise',
  prevTool: null,
  brushes: {
    terrain: { ...TERRAIN_PRESETS.plains.params, radiusKm: 260 },
    paint: { radiusKm: 220, strength: 0.6, falloff: 0.6, opacity: 1 },
    fog: { radiusKm: 400, strength: 0.7, falloff: 0.6, opacity: 1 },
    erase: { radiusKm: 200, strength: 0.8, falloff: 0.3, opacity: 1 },
  },
  flattenMode: 'sample',
  flattenHeight: 200,
  biome: 1,
  eraseTargets: { biomes: true, objects: true, paths: false, labels: false },
  fogMode: 'hide',
  fogPreview: true,
  assetId: null,
  stamp: { mode: 'single', sizePx: 56, spacingPx: 48, randomScale: 0.25, randomRotation: 0, randomFlip: true },
  activeObjectLayer: 'layer-settlements',
  pathDefaults: {
    river: { width: 5, color: '#4f86ad', taper: true },
    road: { width: 2.2, color: '#7a5532', style: 'dashed' },
  },
  territoryDefaults: { type: 'kingdom', color: '#b5452f', borderStyle: 'dashed' },
  labelDefaults: { font: 'display', sizePx: 22, color: '#2d2216' },
  selection: [],
  cursor: null,
  peaks: [],
  dialog: null,
  assetPanelOpen: false,
  inspectorOpen: true,
  layersOpen: true,
  saveStatus: 'saved',
  lastSavedAt: 0,
  canUndo: false,
  canRedo: false,
  undoLabel: '',
  redoLabel: '',
  toast: null,
  focusLabel: null,
  landStats: null,
  busy: null,
  busyCancel: null,
  welcome: false,
  terrainPreset: 'plains',
  readOnly: detectViewer(),
  inspect: null,
  geography: null,
  geoBusy: false,
  geoListOpen: false,
  units: storedUnits(),
  panelHidden: storedPanelHidden(),

  setTool(t) {
    const cur = get().tool;
    if (t === cur) return;
    // the viewer only looks: select (to inspect) and pan
    if (get().readOnly && t !== 'select' && t !== 'pan') return;
    set({ tool: t, prevTool: cur, assetPanelOpen: t === 'object' ? true : get().assetPanelOpen });
  },
  setBrush(g, p) {
    set({ brushes: { ...get().brushes, [g]: { ...get().brushes[g], ...p } } });
  },
  set(p) {
    set(p);
  },
  select(selection) {
    set(selection.length ? { selection, inspect: null } : { selection });
  },
  notify(text, kind = 'info') {
    set({ toast: { id: Date.now(), text, kind } });
  },
}));

/** Camera readout for the status bar & scale bar (updated at most once a frame). */
export interface ViewInfo {
  zoom: number;
  centerX: number;
  centerY: number;
  viewW: number;
  viewH: number;
}
export const useViewInfo = create<ViewInfo>(() => ({ zoom: 1, centerX: 0, centerY: 0, viewW: 1, viewH: 1 }));
