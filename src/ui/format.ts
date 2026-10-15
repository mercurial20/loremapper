import type { Geo } from '../core/geo';
import { formatLatLon, formatPosition, type Units } from '../core/units';

/** Where a world point is: latitude/longitude on planets, km (or mi) from the corner on flat maps. */
export function formatPlace(geo: Geo, x: number, y: number, units: Units): string {
  return geo.flat ? formatPosition(...geo.posKm(x, y), units) : formatLatLon(geo.lat(y), geo.lon(x));
}

/**
 * Sensible brush radius limits for a map, km. The smallest brush reaches one
 * cell of the layer it paints: elevation cells, the half-resolution biome and
 * fog cells, or the water layer's cells, four times finer than the terrain.
 */
export function brushRange(geo: Geo, group?: string): { min: number; max: number } {
  const cell = geo.kmPerCellY;
  const min = group === 'water' ? cell / 8 : group === 'terrain' ? cell * 0.5 : cell * 0.75;
  return { min: Math.max(0.005, min), max: geo.flat ? Math.max(cell * 4, (geo.W * cell) / 2) : 6000 };
}
