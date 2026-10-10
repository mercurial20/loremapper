import { clamp, fbm, lerp, ridged } from '../core/math';
import { BIOME_CHANNELS } from '../core/planet';
import type { RasterArray } from './TileGrid';
import type { CellRect, RasterLayer, TerrainModel, TileChange } from './TerrainModel';

export type TerrainOp = 'raise' | 'lower' | 'smooth' | 'flatten' | 'ridge' | 'paint' | 'erase' | 'fogHide' | 'fogReveal';

export interface BrushParams {
  /** Radius in km on the planet surface. */
  radiusKm: number;
  /** Rate of change per dab, 0..1. */
  strength: number;
  /** Edge softness, 0 = hard edge, 1 = fully feathered. */
  falloff: number;
  /** Maximum effect a single stroke may reach, 0..1. */
  opacity: number;
  /** Raise/lower: 0 = perfectly round dabs, 1 = ragged natural edges. */
  roughness?: number;
  /** Raise: build land up to about this many metres above sea level, then level off. */
  ceiling?: number;
  /** Raise: how much the ceiling rolls across the land, 0 = flat plains … 1 = hills. */
  ceilingVar?: number;
}

export interface StrokeOptions {
  /** Biome channel for 'paint'. */
  biome?: number;
  /** Target elevation (m, datum) for 'flatten'. Defaults to height under the first dab. */
  flattenTarget?: number;
  seed?: number;
}

const LAYER_OF: Record<TerrainOp, RasterLayer> = {
  raise: 'height',
  lower: 'height',
  smooth: 'height',
  flatten: 'height',
  ridge: 'height',
  paint: 'biome',
  erase: 'biome',
  fogHide: 'fog',
  fogReveal: 'fog',
};

/** Max height a raise/lower stroke at 100 % opacity may add, metres. */
const STROKE_HEIGHT_CAP = 21000;

/** Brush weight for normalised distance d (0 centre, 1 rim). */
export function brushWeight(d: number, falloff: number): number {
  if (d >= 1) return 0;
  const inner = 1 - falloff;
  if (d <= inner) return 1;
  const t = (d - inner) / Math.max(1e-6, falloff);
  // quintic smootherstep: C2-continuous, so overlapping dabs leave no ribs in the hillshade
  return 1 - t * t * t * (t * (t * 6 - 15) + 10);
}

/** Metres added per dab by raise/lower at the given strength. */
export function raiseRate(strength: number): number {
  return 4 + strength * strength * 420;
}

/** Cell-space half extents of a brush centred on row cy. */
export function brushExtents(model: TerrainModel, cy: number, radiusKm: number): { rx: number; ry: number } {
  const geo = model.geo;
  const ry = Math.max(0.5, radiusKm / geo.kmPerCellY);
  const yTop = clamp(cy - ry, 0, model.H);
  const yBot = clamp(cy + ry, 0, model.H);
  // widest row is the one nearest the pole (all rows are alike on flat maps)
  const kmX = Math.max(0.02 * geo.kmPerCellX(model.H / 2), Math.min(geo.kmPerCellX(yTop), geo.kmPerCellX(yBot)));
  const rx = Math.min(model.W / 2, Math.max(0.5, radiusKm / kmX));
  return { rx, ry };
}

/**
 * One continuous brush stroke. Before-images of every touched tile are
 * captured lazily so the stroke can be undone and so opacity can be
 * enforced against the stroke's starting state.
 */
export class Stroke {
  readonly layer: RasterLayer;
  private before = new Map<number, RasterArray | null>();
  private coverage = new Map<number, Float32Array>();
  private flattenTarget: number | undefined;

  private model: TerrainModel;
  readonly op: TerrainOp;
  private params: BrushParams;
  private opts: StrokeOptions;

  constructor(model: TerrainModel, op: TerrainOp, params: BrushParams, opts: StrokeOptions = {}) {
    this.model = model;
    this.op = op;
    this.params = params;
    this.opts = opts;
    this.layer = LAYER_OF[op];
    this.flattenTarget = opts.flattenTarget;
  }

  setParams(p: BrushParams) {
    this.params = p;
  }

  get touched() {
    return this.before.size > 0;
  }

  /** Apply one dab at world position (cx, cy); returns the dirty cell rect. */
  dab(cx: number, cy: number, amount = 1): CellRect | null {
    const model = this.model;
    const geo = model.geo;
    const W = model.W;
    const grid = model.grid(this.layer);
    // iterate in the layer's own grid (biome & fog are half resolution)
    const gs = grid.scale;
    const GW = grid.W;
    const TS = grid.TS;
    const NX = grid.NX;
    const C = grid.channels;
    const { radiusKm, strength, falloff, opacity } = this.params;
    const { rx, ry } = brushExtents(model, cy, radiusKm);
    const y0 = Math.max(0, Math.floor((cy - ry) / gs));
    const y1 = Math.min(grid.H - 1, Math.ceil((cy + ry) / gs));
    const x0 = Math.floor((cx - rx) / gs);
    const x1 = Math.ceil((cx + rx) / gs);
    if (y0 > y1) return null;

    const op = this.op;
    const sea = model.seaLevel;
    const maxH = sea + model.planet.maxElevation;
    const minH = model.planet.minElevation;
    const kmY = geo.kmPerCellY;

    if (op === 'flatten' && this.flattenTarget === undefined) this.flattenTarget = model.heightAt(cx, cy);

    // pre-compute ops constants
    const rate = raiseRate(strength) * amount;
    const heightCap = opacity * STROKE_HEIGHT_CAP;
    const smoothK = Math.max(1, Math.round(ry / 10));
    const ridgeScale = Math.max(2, ry * 0.42);
    const rough = op === 'raise' || op === 'lower' ? clamp(this.params.roughness ?? 0, 0, 1) : 0;
    // noise periods divide the planet's width so brushes stay seamless across the antimeridian
    const roughPeriod = Math.max(1, Math.round(W / Math.max(1.5, ry * 0.45)));
    const roughCell = W / roughPeriod;
    // finest octave should stay ≥ ~1.5 cells or it aliases on the grid
    const ridgeOctaves = Math.max(1, Math.min(5, Math.floor(Math.log2(ridgeScale / 1.5)) + 1));
    const ridgePeriod = Math.max(1, Math.round(W / ridgeScale));
    const ridgeCell = W / ridgePeriod;
    // rolling ceilings vary over ~60 km of ground, seamless around the planet
    const ceilPeriod = Math.max(1, Math.round(W / Math.max(2, 60 / kmY)));
    const ceilCell = W / ceilPeriod;
    const flow = clamp(strength * amount, 0, 1);
    const seed = this.opts.seed ?? 1;
    const biomeCh = this.opts.biome ?? 0;

    let lastKey = -1;
    let tile: RasterArray | undefined;
    let before: RasterArray | null | undefined;
    let cov: Float32Array | undefined;

    for (let y = y0; y <= y1; y++) {
      const wy = (y + 0.5) * gs;
      const dyKm = (wy - cy) * kmY;
      const kmX = geo.kmPerCellX(wy);
      const ty = (y / TS) | 0;
      const ly = y - ty * TS;
      for (let xu = x0; xu <= x1; xu++) {
        const dxKm = ((xu + 0.5) * gs - cx) * kmX;
        const d = Math.sqrt(dxKm * dxKm + dyKm * dyKm) / radiusKm;
        if (d >= 1) continue;
        const w = brushWeight(d, falloff);
        if (w <= 0) continue;
        let x = xu;
        if (grid.wrap) {
          x %= GW;
          if (x < 0) x += GW;
        } else if (x < 0 || x >= GW) continue;
        const tx = (x / TS) | 0;
        const key = ty * NX + tx;
        if (key !== lastKey) {
          lastKey = key;
          if (!this.before.has(key)) {
            const t = grid.tiles.get(key);
            this.before.set(key, t ? (t.slice() as RasterArray) : null);
          }
          tile = grid.ensureTile(tx, ty);
          before = this.before.get(key);
          cov = undefined;
          if (op === 'flatten' || op === 'paint' || op === 'erase' || op === 'fogHide' || op === 'fogReveal') {
            cov = this.coverage.get(key);
            if (!cov) {
              cov = new Float32Array(TS * TS);
              this.coverage.set(key, cov);
            }
          }
        }
        const li = ly * TS + (x - tx * TS);
        const t = tile!;

        switch (op) {
          case 'raise':
          case 'lower':
          case 'ridge': {
            const h = t[li];
            const b = before ? before[li] : grid.defaultValue;
            let delta: number;
            if (op === 'ridge') {
              // peaked profile builds a crest along the stroke; ridged noise adds spurs & summits
              const r = ridged(x / ridgeCell, y / ridgeScale, seed, ridgeOctaves, ridgePeriod);
              const peak = (1 - d) * (1 - d);
              delta = rate * w * peak * (0.55 + 1.15 * r * Math.sqrt(r));
            } else {
              let ww = w;
              if (rough > 0) {
                // coherent world-space noise ragged-ises the edge so coasts look natural
                const n = fbm(x / roughCell, y / roughCell, seed + 17, 4, roughPeriod) * 2 - 1;
                // only the outer rim is ragged, so the interior never keeps stray pits
                const rim = clamp((d - 0.45) / 0.5, 0, 1);
                ww = clamp(w + n * rough * 1.1 * rim * rim * (3 - 2 * rim), 0, 1);
              }
              delta = (op === 'raise' ? rate : -rate) * ww;
            }
            // deep ocean floor is raised faster so continents emerge quickly;
            // the boost is continuous in depth so no terraces form
            if (delta > 0 && h < sea) {
              const t = Math.min(1, (sea - h) / 2500);
              delta *= 1 + 2 * t * t * (3 - 2 * t);
            }
            let nh = h + delta;
            // presets like Plains raise land up to a ceiling and then level it off, so it stays flat
            if (op === 'raise' && this.params.ceiling !== undefined) {
              const v = this.params.ceilingVar ?? 0;
              const roll = v > 0 ? fbm(x / ceilCell, y / ceilCell, seed + 29, 3, ceilPeriod) * 2 - 1 : 0;
              const top = sea + this.params.ceiling * Math.max(0.15, 1 + v * roll);
              if (h >= top) nh = h;
              else nh = Math.min(nh, top);
            }
            nh = clamp(nh, b - heightCap, b + heightCap);
            t[li] = clamp(nh, minH, Math.max(maxH, b));
            break;
          }
          case 'smooth': {
            const h = t[li];
            const avg =
              (grid.get(x - smoothK, y) + grid.get(x + smoothK, y) + grid.get(x, y - smoothK) + grid.get(x, y + smoothK) + h * 2) / 6;
            t[li] = lerp(h, avg, w * clamp(strength * 0.9 * amount, 0, 1) * opacity);
            break;
          }
          case 'flatten': {
            const c = 1 - (1 - cov![li]) * (1 - w * flow * 0.6);
            cov![li] = c;
            const b = before ? before[li] : grid.defaultValue;
            t[li] = lerp(b, this.flattenTarget!, c * opacity);
            break;
          }
          case 'paint':
          case 'erase': {
            const c = 1 - (1 - cov![li]) * (1 - w * flow);
            cov![li] = c;
            const a = c * opacity;
            const base = li * C;
            for (let ch = 0; ch < BIOME_CHANNELS; ch++) {
              const bv = before ? before[base + ch] : 0;
              let nv = bv * (1 - a);
              if (op === 'paint' && ch === biomeCh) nv = bv + (255 - bv) * a;
              t[base + ch] = nv + 0.5;
            }
            break;
          }
          case 'fogHide':
          case 'fogReveal': {
            const c = 1 - (1 - cov![li]) * (1 - w * flow);
            cov![li] = c;
            const a = c * opacity;
            const bv = before ? before[li] : grid.defaultValue;
            const nv = op === 'fogHide' ? bv + (255 - bv) * a : bv * (1 - a);
            t[li] = op === 'fogHide' ? Math.max(t[li], nv + 0.5) : Math.min(t[li], nv + 0.5);
            break;
          }
        }
      }
    }
    const rect = { x0: x0 * gs, y0: y0 * gs, x1: (x1 + 1) * gs - 1, y1: (y1 + 1) * gs - 1 };
    model.changed(this.layer, rect);
    return rect;
  }

  /** Finish the stroke. Returns the undo record, or null when nothing changed. */
  finish(): TileChange | null {
    if (!this.before.size) return null;
    const grid = this.model.grid(this.layer);
    const after = new Map<number, RasterArray | null>();
    for (const k of [...this.before.keys()]) {
      const t = grid.tiles.get(k);
      // drop tiles that returned to the default to keep storage sparse
      if (t && grid.isTileDefault(t)) {
        grid.tiles.delete(k);
        // untouched before and after (e.g. erasing where nothing was painted): not a change
        if (this.before.get(k) === null) {
          this.before.delete(k);
          continue;
        }
        after.set(k, null);
      } else after.set(k, t ? (t.slice() as RasterArray) : null);
    }
    this.coverage.clear();
    if (!this.before.size) return null;
    return { layer: this.layer, before: this.before, after };
  }
}
