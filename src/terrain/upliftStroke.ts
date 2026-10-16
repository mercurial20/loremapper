import { clamp } from '../core/math';
import type { RasterArray } from './TileGrid';
import type { TerrainModel, TileChange } from './TerrainModel';
import type { UpliftInput } from './upliftErosion';

/*
 * The erosion method of the Raise tool. While painting, the land under the brush
 * rises smoothly as a preview, and the stroke remembers how strongly it reached
 * each cell: that is the uplift. When the stroke ends, the uplift is carved by
 * rivers (see upliftErosion.ts) in a worker, and the carved mountains replace
 * the preview, in the same undo step.
 */

/** Windows larger than this many cells are carved at a coarser resolution, then scaled up. */
const MAX_CELLS = 300_000;
/** Land rises at least this far above the sea where the uplift is strong. */
const SHORE = 30;

let worker: Worker | null = null;

function carve(input: UpliftInput): Promise<Float32Array> {
  worker ??= new Worker(new URL('./uplift.worker.ts', import.meta.url), { type: 'module' });
  const w = worker;
  return new Promise((resolve, reject) => {
    w.onmessage = (e: MessageEvent<Float32Array>) => resolve(e.data);
    w.onerror = (e) => {
      // a failed worker is started afresh next time
      worker = null;
      w.terminate();
      reject(e);
    };
    w.postMessage(input, [input.uplift.buffer]);
  });
}

/**
 * Carve the uplift of a finished stroke into mountains. `change` is the stroke's undo record
 * (its preview), `reach` how strongly it reached each cell. Returns the undo record of the
 * carved land, from the land before the stroke, or null when there is nothing to carve.
 */
export async function carveUplift(model: TerrainModel, change: TileChange, reach: ReadonlyMap<number, Float32Array>, peakM: number, seed: number): Promise<TileChange | null> {
  const grid = model.height;
  const TS = grid.TS;
  const NX = grid.NX;
  const keys = [...change.before.keys()];
  if (!keys.length) return null;

  // the window: all tiles the stroke touched (unwrapped across the antimeridian on planets)
  const txs = keys.map((k) => k % NX);
  const tys = keys.map((k) => Math.floor(k / NX));
  let tx0 = Math.min(...txs);
  let tx1 = Math.max(...txs);
  const wrapped = grid.wrap && tx1 - tx0 > NX / 2;
  const unwrap = (tx: number) => (wrapped && tx < NX / 2 ? tx + NX : tx);
  if (wrapped) {
    tx0 = Math.min(...txs.map(unwrap));
    tx1 = Math.max(...txs.map(unwrap));
  }
  const ty0 = Math.min(...tys);
  const ty1 = Math.max(...tys);
  const W = (tx1 - tx0 + 1) * TS;
  const H = (ty1 - ty0 + 1) * TS;

  // the land before the stroke, and the uplift
  const base = new Float32Array(W * H);
  const mask = new Float32Array(W * H);
  for (let ty = ty0; ty <= ty1; ty++)
    for (let ux = tx0; ux <= tx1; ux++) {
      const k = ty * NX + (ux % NX);
      const before = change.before.has(k) ? change.before.get(k) : grid.tiles.get(k);
      const cov = reach.get(k);
      const ox = (ux - tx0) * TS;
      const oy = (ty - ty0) * TS;
      for (let j = 0; j < TS; j++)
        for (let i = 0; i < TS; i++) {
          const o = (oy + j) * W + ox + i;
          base[o] = before ? before[j * TS + i] : grid.defaultValue;
          mask[o] = cov ? cov[j * TS + i] : 0;
        }
    }

  // carve at a coarser resolution when the window is large
  let f = 1;
  while (Math.ceil(W / f) * Math.ceil(H / f) > MAX_CELLS) f++;
  const w = Math.ceil(W / f);
  const h = Math.ceil(H / f);
  const uplift = new Float32Array(w * h);
  let any = false;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let cnt = 0;
      for (let j = 0; j < f; j++)
        for (let i = 0; i < f; i++) {
          const X = x * f + i;
          const Y = y * f + j;
          if (X < W && Y < H) {
            sum += mask[Y * W + X];
            cnt++;
          }
        }
      const v = cnt ? sum / cnt : 0;
      uplift[y * w + x] = v;
      if (v > 0) any = true;
    }
  if (!any) return null;
  const relief = await carve({ w, h, uplift, cellKm: model.geo.kmPerCellY * f, peakM, seed });

  // the carved land: the land before, raised out of the sea where the uplift is strong, plus the
  // relief (scaled back up smoothly when it was carved coarser)
  const sea = model.seaLevel;
  const maxH = sea + model.planet.maxElevation;
  const at = (X: number, Y: number) => {
    if (f === 1) return relief[Y * w + X];
    const fx = clamp((X + 0.5) / f - 0.5, 0, w - 1);
    const fy = clamp((Y + 0.5) / f - 0.5, 0, h - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(w - 1, x0 + 1);
    const y1 = Math.min(h - 1, y0 + 1);
    const u = fx - x0;
    const v = fy - y0;
    const a = relief[y0 * w + x0] * (1 - u) + relief[y0 * w + x1] * u;
    const b = relief[y1 * w + x0] * (1 - u) + relief[y1 * w + x1] * u;
    return a * (1 - v) + b * v;
  };
  const after = new Map<number, RasterArray | null>();
  for (const k of keys) {
    const ux = unwrap(k % NX);
    const ty = Math.floor(k / NX);
    const ox = (ux - tx0) * TS;
    const oy = (ty - ty0) * TS;
    const tile = grid.ensureTile(k % NX, ty);
    for (let j = 0; j < TS; j++)
      for (let i = 0; i < TS; i++) {
        const o = (oy + j) * W + ox + i;
        const m = mask[o];
        const b = base[o];
        if (m <= 0) {
          tile[j * TS + i] = b;
          continue;
        }
        const s = clamp(m / 0.35, 0, 1);
        const lift = Math.max(0, sea + SHORE - b) * s * s * (3 - 2 * s);
        tile[j * TS + i] = Math.min(Math.max(maxH, b), b + lift + at(ox + i, oy + j));
      }
    after.set(k, tile.slice());
    model.changed('height', { x0: (k % NX) * TS, y0: ty * TS, x1: (k % NX) * TS + TS - 1, y1: ty * TS + TS - 1 });
  }
  return { layer: 'height', before: change.before, after };
}
