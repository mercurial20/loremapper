/**
 * Display units. Everything in the model stays in canonical units — km for
 * distances, km² for areas, metres for heights — and is converted only for
 * display and input, so switching units never changes a map.
 */
export type Units = 'metric' | 'imperial';

export const KM_PER_MI = 1.609344;
export const FT_PER_M = 1 / 0.3048;
const MI2_PER_KM2 = 1 / (KM_PER_MI * KM_PER_MI);

const num = (v: number, digits = 0) => v.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });

/** A ground distance: m / km, or ft / mi, chosen by magnitude. */
export function formatLength(km: number, u: Units): string {
  if (u === 'imperial') {
    const mi = km / KM_PER_MI;
    if (mi < 0.2) return `${num(km * 1000 * FT_PER_M)} ft`;
    if (mi < 10) return `${num(mi, 1)} mi`;
    return `${num(mi)} mi`;
  }
  if (km < 1) return `${num(km * 1000)} m`;
  if (km < 10) return `${num(km, 1)} km`;
  return `${num(km)} km`;
}

/** An area: km² or mi² (m² / acres-free: small areas still use km² / mi² with decimals). */
export function formatArea(km2: number, u: Units): string {
  const v = u === 'imperial' ? km2 * MI2_PER_KM2 : km2;
  const unit = u === 'imperial' ? 'mi²' : 'km²';
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 1 : 2)}M ${unit}`;
  if (v >= 100) return `${num(v)} ${unit}`;
  if (v >= 1) return `${num(v, 1)} ${unit}`;
  return `${num(v, 3)} ${unit}`;
}

/** A height or depth: metres or feet. */
export function formatHeight(m: number, u: Units): string {
  return u === 'imperial' ? `${num(m * FT_PER_M)} ft` : `${num(m)} m`;
}

// ---- numeric inputs: show converted values, store canonical ones

export const lengthUnit = (u: Units) => (u === 'imperial' ? 'mi' : 'km');
export const heightUnit = (u: Units) => (u === 'imperial' ? 'ft' : 'm');
export const kmToDisplay = (km: number, u: Units) => (u === 'imperial' ? km / KM_PER_MI : km);
export const displayToKm = (v: number, u: Units) => (u === 'imperial' ? v * KM_PER_MI : v);
export const mToDisplay = (m: number, u: Units) => (u === 'imperial' ? m * FT_PER_M : m);
export const displayToM = (v: number, u: Units) => (u === 'imperial' ? v / FT_PER_M : v);

/** Latitude and longitude, e.g. "54.84° N, 66.09° E". */
export function formatLatLon(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`;
}

/** Position on a flat map, from its top-left corner. */
export function formatPosition(xKm: number, yKm: number, u: Units): string {
  const f = (km: number) => {
    const v = kmToDisplay(km, u);
    return num(v, v < 100 ? 1 : 0);
  };
  return `${f(xKm)} × ${f(yKm)} ${lengthUnit(u)}`;
}
