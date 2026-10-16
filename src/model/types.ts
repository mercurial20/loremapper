import type { PlanetSettings } from '../core/planet';
import { N_ } from '../i18n/mark';

export type Vec2 = [number, number];

/** A placed instance of an asset. Positions are world cell units. */
export interface MapObject {
  id: string;
  assetId: string;
  layerId: string;
  x: number;
  y: number;
  /** Base width in world units (cells). Height follows the asset aspect ratio. */
  size: number;
  scale: number;
  /** Degrees, clockwise. */
  rotation: number;
  flipX: boolean;
  opacity: number;
  z: number;
  locked: boolean;
  hidden: boolean;
  name: string;
  description: string;
  meta: Record<string, string>;
}

export type PathKind = 'river' | 'road';
export type RoadStyle = 'solid' | 'dashed' | 'dotted' | 'double';

export interface PathFeature {
  id: string;
  kind: PathKind;
  /** Control points of a Catmull-Rom spline, continuous (unwrapped) world coords. */
  points: Vec2[];
  /** Width in world units at the widest point. */
  width: number;
  color: string;
  style: RoadStyle;
  /** Rivers: taper from source (thin) to mouth (wide). */
  taper: boolean;
  name: string;
  hidden: boolean;
  locked: boolean;
}

/** One crest line of a mountain range: the main divide, or a branch off another line. */
export interface RangeLine {
  id: string;
  /** Points along the crest, continuous (unwrapped) world coords. */
  points: Vec2[];
  /**
   * A branch: the line it grows from, and where along it (0 … 1 of its length). The line may
   * belong to another range (`range`): a branch drawn off a range becomes a range of its own,
   * so it can be lower, narrower or of another nature than the one it grows from.
   */
  from?: { line: string; t: number; range?: string };
}

/**
 * A mountain range drawn as crest lines. Its relief is computed from the lines (uplift carved
 * by rivers) and kept apart from the land under it (see TerrainModel.relief), so it can be
 * reshaped or removed later.
 */
export interface MountainRange {
  id: string;
  name: string;
  lines: RangeLine[];
  /** Highest summits, metres above the land around. */
  heightM: number;
  /** Width across the range, km. */
  widthKm: number;
  /** 0 = even along its length … 1 = summits in clusters, a crest that wanders. */
  irregularity: number;
  /** −1 … 1: which side is the short, steep one (0 = both alike). */
  asymmetry: number;
  /** Picks one of the many ways rivers could carve the same range. */
  seed: number;
  locked: boolean;
}

export const TERRITORY_TYPES = ['kingdom', 'khaganate', 'republic', 'empire', 'tribe', 'city', 'other'] as const;
export type TerritoryType = (typeof TERRITORY_TYPES)[number];
export const TERRITORY_TYPE_LABELS: Record<TerritoryType, string> = {
  kingdom: N_('Kingdom'),
  khaganate: N_('Khaganate'),
  republic: N_('Republic'),
  empire: N_('Empire'),
  tribe: N_('Tribal lands'),
  city: N_('Independent city'),
  other: N_('Other'),
};

export type BorderStyle = 'solid' | 'dashed' | 'dotted' | 'double';

export interface Territory {
  id: string;
  name: string;
  type: TerritoryType;
  points: Vec2[];
  color: string;
  fillOpacity: number;
  borderColor: string;
  borderStyle: BorderStyle;
  borderWidth: number;
  showLabel: boolean;
  labelSize: number;
  /** Label anchor; null = polygon centroid. */
  labelPos: Vec2 | null;
  description: string;
  hidden: boolean;
  locked: boolean;
}

export type LabelFont = 'display' | 'serif' | 'script' | 'sans';

export interface MapLabel {
  id: string;
  text: string;
  x: number;
  y: number;
  /** Cap height in world units. */
  size: number;
  font: LabelFont;
  color: string;
  rotation: number;
  letterSpacing: number;
  uppercase: boolean;
  italic: boolean;
  halo: boolean;
  /** Arc the text: 0 = straight, ±1 = strong curve. */
  curve: number;
  opacity: number;
  hidden: boolean;
  locked: boolean;
}

export interface PeakAnnotation {
  id: string;
  x: number;
  y: number;
  name: string;
  /** designated = always shown (and named); suppressed = hidden automatic peak */
  mode: 'designated' | 'suppressed';
}

export interface ObjectLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
}

export type SystemLayerId = 'terrain' | 'biomes' | 'paths' | 'territories' | 'objects' | 'labels' | 'peaks' | 'fog';

export interface SystemLayerState {
  visible: boolean;
  opacity: number;
  locked: boolean;
}

export type StylePresetId = 'parchment' | 'atlas' | 'political' | 'relief' | 'anime' | 'strategy' | 'pixel' | 'antique';

export interface ViewSettings {
  style: StylePresetId;
  hillshade: number;
  /** Biome edges: 0 crisp … 1 soft, with wide fringes (forests thin out gradually). */
  biomeSoftness?: number;
  contours: boolean;
  contourInterval: number;
  heightOverlay: boolean;
  graticule: boolean;
  showPeaks: boolean;
  peakMinElevation: number;
  coastRipples: boolean;
  /** Planets: repeat the map east–west in the view (presentation only; the planet still wraps). */
  repeat: boolean;
}

/** A name given to a landmass or body of water, pinned to a point inside it. */
export interface RegionName {
  id: string;
  x: number;
  y: number;
  name: string;
}

/**
 * A picture laid over the map to trace from (for example a map made in
 * another tool). It never changes the terrain; the image itself is stored as
 * an asset of kind 'reference'.
 */
export interface ReferenceImage {
  assetId: string;
  /** World rectangle (cells) the picture covers; on a planet it may extend past the map's edges. */
  x: number;
  y: number;
  w: number;
  h: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  /** Drawn into exported map images. */
  inExport: boolean;
}

export interface MapDocument {
  objects: Record<string, MapObject>;
  paths: Record<string, PathFeature>;
  ranges: Record<string, MountainRange>;
  territories: Record<string, Territory>;
  labels: Record<string, MapLabel>;
  peaks: Record<string, PeakAnnotation>;
  regionNames: Record<string, RegionName>;
  objectLayers: ObjectLayer[];
  systemLayers: Record<SystemLayerId, SystemLayerState>;
  view: ViewSettings;
  /** The tracing picture, if any. */
  reference: ReferenceImage | null;
}

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  planet: PlanetSettings;
  /** Seed used for deterministic procedural details (ridges, textures). */
  seed: number;
  /** Where the terrain came from, when it isn't the user's own (e.g. a built-in world). */
  source?: string;
}

export type SelectionKind = 'object' | 'path' | 'territory' | 'label' | 'peak';
export interface SelectionRef {
  kind: SelectionKind;
  id: string;
}

export function defaultView(): ViewSettings {
  return {
    style: 'parchment',
    hillshade: 0.3,
    contours: false,
    contourInterval: 500,
    heightOverlay: false,
    graticule: false,
    showPeaks: true,
    peakMinElevation: 2000,
    coastRipples: true,
    repeat: true,
  };
}

export function emptyDocument(): MapDocument {
  return {
    objects: {},
    paths: {},
    ranges: {},
    territories: {},
    labels: {},
    peaks: {},
    regionNames: {},
    reference: null,
    objectLayers: [
      { id: 'layer-settlements', name: N_('Settlements'), visible: true, locked: false, opacity: 1 },
      { id: 'layer-features', name: N_('Features'), visible: true, locked: false, opacity: 1 },
      { id: 'layer-creatures', name: N_('Creatures'), visible: true, locked: false, opacity: 1 },
    ],
    systemLayers: {
      terrain: { visible: true, opacity: 1, locked: false },
      biomes: { visible: true, opacity: 1, locked: false },
      paths: { visible: true, opacity: 1, locked: false },
      territories: { visible: true, opacity: 1, locked: false },
      objects: { visible: true, opacity: 1, locked: false },
      labels: { visible: true, opacity: 1, locked: false },
      peaks: { visible: true, opacity: 1, locked: false },
      fog: { visible: true, opacity: 1, locked: false },
    },
    view: defaultView(),
  };
}
