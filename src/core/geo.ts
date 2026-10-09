import type { PlanetSettings } from './planet';

/**
 * Equirectangular (plate carrée) projection.
 * World coordinates are raster cell units: x ∈ [0, W) wraps around the
 * antimeridian, y ∈ [0, H] runs from the north pole (0) to the south pole (H).
 * Cell (i, j) covers [i, i+1) × [j, j+1); its sample sits at its centre.
 */
export class Geo {
  readonly W: number;
  readonly H: number;
  readonly R: number;

  constructor(p: Pick<PlanetSettings, 'gridWidth' | 'gridHeight' | 'radiusKm'>) {
    this.W = p.gridWidth;
    this.H = p.gridHeight;
    this.R = p.radiusKm;
  }

  wrapX(x: number): number {
    const w = x % this.W;
    return w < 0 ? w + this.W : w;
  }

  /** Signed shortest horizontal offset from a to b, honouring wrap. */
  deltaX(a: number, b: number): number {
    let d = (b - a) % this.W;
    if (d > this.W / 2) d -= this.W;
    if (d < -this.W / 2) d += this.W;
    return d;
  }

  lon(x: number): number {
    return (this.wrapX(x) / this.W) * 360 - 180;
  }

  lat(y: number): number {
    return 90 - (y / this.H) * 180;
  }

  xFromLon(lon: number): number {
    return ((lon + 180) / 360) * this.W;
  }

  yFromLat(lat: number): number {
    return ((90 - lat) / 180) * this.H;
  }

  /** km spanned by one cell along a meridian (constant). */
  get kmPerCellY(): number {
    return (Math.PI * this.R) / this.H;
  }

  /** km spanned by one cell along a parallel at world row y. */
  kmPerCellX(y: number): number {
    return ((2 * Math.PI * this.R) / this.W) * Math.cos((this.lat(y) * Math.PI) / 180);
  }

  /** Great-circle distance in km between two world points. */
  distanceKm(x1: number, y1: number, x2: number, y2: number): number {
    const toR = Math.PI / 180;
    const p1 = this.lat(y1) * toR;
    const p2 = this.lat(y2) * toR;
    const dl = (this.deltaX(x1, x2) / this.W) * 2 * Math.PI;
    const dp = p2 - p1;
    const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * this.R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  /**
   * Points along the great circle between two world points, in continuous
   * (unwrapped) world coordinates starting at (x1, y1). Used for measuring.
   */
  greatCircle(x1: number, y1: number, x2: number, y2: number, steps = 48): [number, number][] {
    const toR = Math.PI / 180;
    const la1 = this.lat(y1) * toR;
    const lo1 = this.lon(x1) * toR;
    const la2 = this.lat(y2) * toR;
    const lo2 = this.lon(x2) * toR;
    const v1 = [Math.cos(la1) * Math.cos(lo1), Math.cos(la1) * Math.sin(lo1), Math.sin(la1)];
    const v2 = [Math.cos(la2) * Math.cos(lo2), Math.cos(la2) * Math.sin(lo2), Math.sin(la2)];
    const dot = Math.max(-1, Math.min(1, v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]));
    const omega = Math.acos(dot);
    const out: [number, number][] = [];
    let prevX = x1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      let p: number[];
      if (omega < 1e-9) p = v1;
      else {
        const s = Math.sin(omega);
        const a = Math.sin((1 - t) * omega) / s;
        const b = Math.sin(t * omega) / s;
        p = [a * v1[0] + b * v2[0], a * v1[1] + b * v2[1], a * v1[2] + b * v2[2]];
      }
      const lat = Math.atan2(p[2], Math.hypot(p[0], p[1])) / toR;
      const lon = Math.atan2(p[1], p[0]) / toR;
      const x = prevX + this.deltaX(prevX, this.xFromLon(lon));
      out.push([x, this.yFromLat(lat)]);
      prevX = x;
    }
    return out;
  }

  /** Area of one cell at row y in km². */
  cellAreaKm2(y: number): number {
    return this.kmPerCellY * Math.abs(this.kmPerCellX(y + 0.5));
  }
}

export function formatLatLon(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lon).toFixed(2)}° ${ew}`;
}

export function formatKm(km: number): string {
  if (km >= 1000) return `${Math.round(km).toLocaleString('en-US')} km`;
  if (km >= 10) return `${km.toFixed(0)} km`;
  if (km >= 1) return `${km.toFixed(1)} km`;
  return `${Math.round(km * 1000)} m`;
}

export function formatMeters(m: number): string {
  return `${Math.round(m).toLocaleString('en-US')} m`;
}
