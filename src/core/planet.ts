/**
 * Planet description. Elevations are stored in metres relative to a fixed
 * datum (0 m); "above sea level" values subtract the configurable sea level.
 */
export type MapType = 'planet' | 'flat';

export interface PlanetSettings {
  /** 'planet' (equirectangular sphere, the default for older maps) or 'flat' (a rectangle with square cells). */
  mapType?: MapType;
  /** Flat maps: ground size of one cell, km. */
  cellKm?: number;
  /** Planetary radius in km (planets only). */
  radiusKm: number;
  /** Surface gravity in g. Informational only. */
  gravity: number;
  /** Raster grid width (cells). Equirectangular, so height = width / 2. */
  gridWidth: number;
  gridHeight: number;
  /** Cells per tile edge. */
  tileSize: number;
  /** Highest allowed terrain, metres above sea level. */
  maxElevation: number;
  /** Deepest allowed ocean floor, metres relative to the datum. */
  minElevation: number;
  /** Sea level, metres relative to the datum. */
  seaLevel: number;
  /** Depth of the untouched ocean floor in a new map, metres. */
  oceanFloor: number;
  /** Target land fraction used by the generator (0.29 = 29 %). */
  landFraction: number;
}

export const GRID_PRESETS = {
  standard: { gridWidth: 4096, gridHeight: 2048, label: 'Standard — 4096 × 2048 (≈11 km cells)' },
  high: { gridWidth: 8192, gridHeight: 4096, label: 'High detail — 8192 × 4096 (≈5.7 km cells)' },
} as const;
export type GridPreset = keyof typeof GRID_PRESETS;

export function defaultPlanet(preset: GridPreset = 'standard'): PlanetSettings {
  return {
    mapType: 'planet',
    radiusKm: 6371,
    gravity: 1,
    gridWidth: GRID_PRESETS[preset].gridWidth,
    gridHeight: GRID_PRESETS[preset].gridHeight,
    tileSize: 256,
    maxElevation: 10000,
    minElevation: -11000,
    seaLevel: 0,
    oceanFloor: -3800,
    landFraction: 0.29,
  };
}

/** Flat map detail presets: cells along the longer side. */
export const FLAT_PRESETS = {
  standard: { cells: 2048, label: 'Standard — 2048 cells on the long side' },
  high: { cells: 4096, label: 'High detail — 4096 cells on the long side' },
} as const;

/**
 * Settings for a flat rectangular map of the given ground size. The grid
 * snaps to whole tiles, so the short side may differ slightly from the
 * request; the long side is exact.
 */
export function flatMap(widthKm: number, heightKm: number, preset: GridPreset = 'standard'): PlanetSettings {
  const base = defaultPlanet(preset);
  const cells = FLAT_PRESETS[preset].cells;
  const long = Math.max(widthKm, heightKm);
  const cellKm = long / cells;
  const snap = (km: number) => Math.max(1, Math.round(km / cellKm / base.tileSize)) * base.tileSize;
  return { ...base, mapType: 'flat', cellKm, gridWidth: snap(widthKm), gridHeight: snap(heightKm), landFraction: 0.35 };
}

export const isFlat = (p: Pick<PlanetSettings, 'mapType'>) => p.mapType === 'flat';

/** Total ground area of the map, km². */
export function surfaceAreaKm2(p: PlanetSettings): number {
  if (isFlat(p)) return p.gridWidth * p.gridHeight * (p.cellKm ?? 1) ** 2;
  return 4 * Math.PI * p.radiusKm * p.radiusKm;
}

export const BIOMES = [
  { id: 'grass', name: 'Grassland', key: '1' },
  { id: 'forest', name: 'Forest', key: '2' },
  { id: 'farm', name: 'Farmland', key: '3' },
  { id: 'desert', name: 'Desert', key: '4' },
  { id: 'swamp', name: 'Swamp', key: '5' },
  { id: 'snow', name: 'Snow & ice', key: '6' },
  { id: 'rock', name: 'Rocky ground', key: '7' },
  { id: 'steppe', name: 'Steppe', key: '8' },
] as const;
export type BiomeId = (typeof BIOMES)[number]['id'];
/** Number of biome weight channels stored per cell. */
export const BIOME_CHANNELS = 8;
export function biomeIndex(id: BiomeId): number {
  return BIOMES.findIndex((b) => b.id === id);
}
