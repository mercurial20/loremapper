import { Geo } from '../core/geo';
import { BIOME_CHANNELS, type PlanetSettings } from '../core/planet';
import { TileGrid, type RasterArray } from './TileGrid';

export type RasterLayer = 'height' | 'biome' | 'fog';
export const RASTER_LAYERS: RasterLayer[] = ['height', 'biome', 'fog'];

/** Inclusive cell rectangle; x may lie outside [0, W) and is wrapped by consumers. */
export interface CellRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type RasterListener = (layer: RasterLayer, rect: CellRect | null) => void;

/** A reversible change to a set of tiles in one raster layer. */
export interface TileChange {
  layer: RasterLayer;
  before: Map<number, RasterArray | null>;
  after: Map<number, RasterArray | null>;
  beforeDefault?: number;
  afterDefault?: number;
}

/**
 * Owns the raster layers (elevation, biome weights, fog mask). These live
 * outside React/Zustand because they are large typed arrays edited in place
 * at pointer rate; consumers subscribe to change notifications instead.
 */
export class TerrainModel {
  planet: PlanetSettings;
  geo: Geo;
  readonly height: TileGrid<Float32Array>;
  readonly biome: TileGrid<Uint8Array>;
  readonly fog: TileGrid<Uint8Array>;
  /** Per-layer tile keys changed since last persisted. */
  readonly persistDirty: Record<RasterLayer, Set<number>> = { height: new Set(), biome: new Set(), fog: new Set() };
  /** Layers whose default value / whole content changed since last persist. */
  readonly persistReset = new Set<RasterLayer>();
  readonly revision: Record<RasterLayer, number> = { height: 0, biome: 0, fog: 0 };
  private listeners = new Set<RasterListener>();

  constructor(planet: PlanetSettings) {
    this.planet = { ...planet };
    this.geo = new Geo(planet);
    const { gridWidth: W, gridHeight: H, tileSize: TS } = planet;
    this.height = new TileGrid(W, H, TS, 1, (n) => new Float32Array(n), planet.oceanFloor);
    // biome weights and fog are soft by nature, so they live at half resolution
    // (a quarter of the memory); their tiles still line up 1:1 with height tiles
    this.biome = new TileGrid(W / 2, H / 2, TS / 2, BIOME_CHANNELS, (n) => new Uint8Array(n), 0, 2);
    this.fog = new TileGrid(W / 2, H / 2, TS / 2, 1, (n) => new Uint8Array(n), 0, 2);
  }

  get W() {
    return this.planet.gridWidth;
  }
  get H() {
    return this.planet.gridHeight;
  }
  get TS() {
    return this.planet.tileSize;
  }
  get seaLevel() {
    return this.planet.seaLevel;
  }

  grid(layer: RasterLayer): TileGrid<RasterArray> {
    return this[layer] as TileGrid<RasterArray>;
  }

  /** Planet edits that do not change the grid geometry (radius, sea level …). */
  updatePlanet(p: Partial<PlanetSettings>) {
    this.planet = { ...this.planet, ...p, gridWidth: this.planet.gridWidth, gridHeight: this.planet.gridHeight, tileSize: this.planet.tileSize };
    this.geo = new Geo(this.planet);
  }

  subscribe(fn: RasterListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Notify listeners and mark the touched tiles for persistence. Rects are in world cells. */
  changed(layer: RasterLayer, rect: CellRect | null) {
    this.revision[layer]++;
    const g = this.grid(layer);
    if (rect) {
      const span = g.TS * g.scale;
      const ty0 = Math.max(0, Math.floor(rect.y0 / span));
      const ty1 = Math.min(g.NY - 1, Math.floor(rect.y1 / span));
      const tx0 = Math.floor(rect.x0 / span);
      const tx1 = Math.floor(rect.x1 / span);
      for (let ty = ty0; ty <= ty1; ty++)
        for (let tx = tx0; tx <= tx1; tx++) this.persistDirty[layer].add(g.key(g.wrapTileX(tx), ty));
    } else {
      this.persistReset.add(layer);
    }
    for (const fn of this.listeners) fn(layer, rect);
  }

  heightAt(x: number, y: number): number {
    return this.height.sample(x, y);
  }

  /** Dominant painted biome at a world position (index into BIOMES) or -1. */
  biomeAt(x: number, y: number): number {
    const xi = Math.floor(x / this.biome.scale);
    const yi = Math.floor(y / this.biome.scale);
    let best = -1;
    let bestW = 40;
    for (let c = 0; c < BIOME_CHANNELS; c++) {
      const w = this.biome.get(xi, yi, c);
      if (w > bestW) {
        bestW = w;
        best = c;
      }
    }
    return best;
  }

  fogAt(x: number, y: number): number {
    return this.fog.get(Math.floor(x / this.fog.scale), Math.floor(y / this.fog.scale)) / 255;
  }

  /** Apply one side of a TileChange (used by undo/redo). */
  applyTiles(change: TileChange, side: 'before' | 'after') {
    const g = this.grid(change.layer);
    const def = side === 'before' ? change.beforeDefault : change.afterDefault;
    const tiles = side === 'before' ? change.before : change.after;
    if (def !== undefined) {
      g.defaultValue = def;
      g.tiles.clear();
    }
    for (const [k, data] of tiles) {
      if (data) g.tiles.set(k, data.slice() as RasterArray);
      else g.tiles.delete(k);
    }
    if (def !== undefined) this.changed(change.layer, null);
    else {
      const span = g.TS * g.scale;
      for (const k of tiles.keys()) {
        const [tx, ty] = g.tileXY(k);
        this.changed(change.layer, { x0: tx * span, y0: ty * span, x1: tx * span + span - 1, y1: ty * span + span - 1 });
      }
    }
  }

  /** Replace a whole layer from a full-resolution array; returns the undo record. */
  replaceLayer(layer: RasterLayer, full: ArrayLike<number> | null, defaultValue?: number): TileChange {
    const g = this.grid(layer);
    const before = new Map<number, RasterArray | null>(g.tiles);
    const beforeDefault = g.defaultValue;
    if (defaultValue !== undefined) g.defaultValue = defaultValue;
    if (full) g.loadFull(full);
    else g.tiles.clear();
    const after = new Map<number, RasterArray | null>(g.tiles);
    this.changed(layer, null);
    return {
      layer,
      // the old arrays are no longer referenced by the grid, so they need no copy
      before,
      after: cloneTiles(after),
      beforeDefault,
      afterDefault: g.defaultValue,
    };
  }
}

function cloneTiles(m: Map<number, RasterArray | null>): Map<number, RasterArray | null> {
  const out = new Map<number, RasterArray | null>();
  for (const [k, v] of m) out.set(k, v ? (v.slice() as RasterArray) : null);
  return out;
}
