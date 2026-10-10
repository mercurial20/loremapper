import type { Geo } from '../core/geo';
import { formatLatLon, formatPosition, type Units } from '../core/units';

/** Where a world point is: latitude/longitude on planets, km (or mi) from the corner on flat maps. */
export function formatPlace(geo: Geo, x: number, y: number, units: Units): string {
  return geo.flat ? formatPosition(...geo.posKm(x, y), units) : formatLatLon(geo.lat(y), geo.lon(x));
}

/** Sensible brush radius limits for a map, km. */
export function brushRange(geo: Geo): { min: number; max: number } {
  const cell = geo.kmPerCellY;
  return { min: Math.max(0.05, cell * 0.75), max: geo.flat ? Math.max(cell * 4, (geo.W * cell) / 2) : 6000 };
}
