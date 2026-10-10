import type { PlanetSettings } from '../core/planet';

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

export const TERRITORY_TYPES = ['kingdom', 'khaganate', 'republic', 'empire', 'tribe', 'city', 'other'] as const;
export type TerritoryType = (typeof TERRITORY_TYPES)[number];
export const TERRITORY_TYPE_LABELS: Record<TerritoryType, string> = {
  kingdom: 'Kingdom',
  khaganate: 'Khaganate',
  republic: 'Republic',
  empire: 'Empire',
  tribe: 'Tribal lands',
  city: 'Independent city',
  other: 'Other',
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

export type StylePresetId = 'parchment' | 'atlas' | 'political' | 'relief';

export interface ViewSettings {
  style: StylePresetId;
  hillshade: number;
  contours: boolean;
  contourInterval: number;
  heightOverlay: boolean;
  graticule: boolean;
  showPeaks: boolean;
  peakMinElevation: number;
  coastRipples: boolean;
}

/** A name given to a landmass or body of water, pinned to a point inside it. */
export interface RegionName {
  id: string;
  x: number;
  y: number;
  name: string;
}

export interface MapDocument {
  objects: Record<string, MapObject>;
  paths: Record<string, PathFeature>;
  territories: Record<string, Territory>;
  labels: Record<string, MapLabel>;
  peaks: Record<string, PeakAnnotation>;
  regionNames: Record<string, RegionName>;
  objectLayers: ObjectLayer[];
  systemLayers: Record<SystemLayerId, SystemLayerState>;
  view: ViewSettings;
}

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  planet: PlanetSettings;
  /** Seed used for deterministic procedural details (ridges, textures). */
  seed: number;
}

export type SelectionKind = 'object' | 'path' | 'territory' | 'label' | 'peak';
export interface SelectionRef {
  kind: SelectionKind;
  id: string;
}

export function defaultView(): ViewSettings {
  return {
    style: 'parchment',
    hillshade: 0.85,
    contours: false,
    contourInterval: 500,
    heightOverlay: false,
    graticule: false,
    showPeaks: true,
    peakMinElevation: 2000,
    coastRipples: true,
  };
}

export function emptyDocument(): MapDocument {
  return {
    objects: {},
    paths: {},
    territories: {},
    labels: {},
    peaks: {},
    regionNames: {},
    objectLayers: [
      { id: 'layer-settlements', name: 'Settlements', visible: true, locked: false, opacity: 1 },
      { id: 'layer-features', name: 'Features', visible: true, locked: false, opacity: 1 },
      { id: 'layer-creatures', name: 'Creatures', visible: true, locked: false, opacity: 1 },
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
