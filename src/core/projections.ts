import { N_ } from '../i18n/mark';

/**
 * World map projections for exporting a planet. Each one maps longitude and
 * latitude (radians; longitude 0 at the map's centre) to plane coordinates
 * (x to the right, y up) and back. A projection may hide part of the sphere
 * (the far side of a globe); `clamp` then pulls a hidden point onto the edge,
 * which is how shapes are clipped.
 */

export type ProjectionId = 'equirectangular' | 'mercator' | 'mollweide' | 'equalEarth' | 'orthographic' | 'azimuthal' | 'gott';

export interface ProjectionParams {
  id: ProjectionId;
  /** Centre longitude, degrees. */
  lon0: number;
  /** Centre latitude, degrees (globe and azimuthal). */
  lat0: number;
  /** Azimuthal: how far from the centre the map reaches, degrees (90 = a hemisphere, 180 = the whole world). */
  extent: number;
}

export interface Projection {
  params: ProjectionParams;
  /** Plane bounds. */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Plane units per radian of the sphere at the centre (for sizing symbols). */
  k0: number;
  /** Plane point of a sphere point, or null where the projection doesn't show it. */
  forward(lon: number, lat: number): [number, number] | null;
  /** Sphere point (lon relative to nothing: absolute, in −π…π) of a plane point, or null outside the map. */
  inverse(x: number, y: number): [number, number] | null;
  /**
   * Plane point of a sphere point, pulled onto the map's edge where it's hidden.
   * `part` picks a disk for multi-disk layouts (Gott: 0 north, 1 south).
   */
  clamp(lon: number, lat: number, part?: number): [number, number];
  /** Number of separate pieces (disks) the map is made of. */
  parts: number;
  /** The map's outline for clipping and framing (one path per part). */
  outline(part: number): [number, number][];
  /** Cylindrical and pseudo-cylindrical maps: shapes can be drawn shifted by ±2π in longitude and clipped. */
  wraps: boolean;
}

const PI = Math.PI;
const HALF = PI / 2;
const RAD = PI / 180;
const wrapLon = (l: number) => l - 2 * PI * Math.floor((l + PI) / (2 * PI));

export const PROJECTIONS: { id: ProjectionId; name: string; description: string }[] = [
  { id: 'equirectangular', name: N_('Equirectangular'), description: N_('The editor’s own grid: latitude and longitude as straight lines. Stretches the far north and south.') },
  { id: 'equalEarth', name: N_('Equal Earth'), description: N_('A modern atlas map like the Robinson projection, but with every area in true proportion.') },
  { id: 'mollweide', name: N_('Mollweide'), description: N_('An oval world map with true areas: the classic for whole-planet comparisons.') },
  { id: 'mercator', name: N_('Mercator'), description: N_('The navigator’s map: true shapes and angles, but the poles swell without limit (cut at 85°).') },
  { id: 'orthographic', name: N_('Globe'), description: N_('The planet as seen from space, centred wherever you like.') },
  { id: 'azimuthal', name: N_('Azimuthal (polar)'), description: N_('Distances and directions true from the centre: a pole-centred disk, or centred anywhere.') },
  { id: 'gott', name: N_('Gott double-sided'), description: N_('Gott, Goldberg & Vanderbei (2021): the northern and southern hemispheres as two disks joined along the equator, the least distorted flat map known.') },
];

// --------------------------------------------------------------- pseudo-cylindrical helpers

function mollweideTheta(lat: number): number {
  if (Math.abs(lat) > HALF - 1e-9) return Math.sign(lat) * HALF;
  let t = lat;
  const k = PI * Math.sin(lat);
  for (let i = 0; i < 30; i++) {
    const d = (2 * t + Math.sin(2 * t) - k) / (2 + 2 * Math.cos(2 * t));
    t -= d;
    if (Math.abs(d) < 1e-10) break;
  }
  return t;
}

const EE = { A1: 1.340264, A2: -0.081106, A3: 0.000893, A4: 0.003796, M: Math.sqrt(3) / 2 };
const eeY = (t: number) => t * (EE.A1 + EE.A2 * t * t + t ** 6 * (EE.A3 + EE.A4 * t * t));
const eeDY = (t: number) => EE.A1 + 3 * EE.A2 * t * t + t ** 6 * (7 * EE.A3 + 9 * EE.A4 * t * t);

// --------------------------------------------------------------- azimuthal helpers

/** Angular distance and azimuth-style plane direction from the centre (lon0, lat0). */
function azimuthal(lon: number, lat: number, lon0: number, sinP0: number, cosP0: number): { c: number; ex: number; ey: number } {
  const dl = lon - lon0;
  const cosc = Math.max(-1, Math.min(1, sinP0 * Math.sin(lat) + cosP0 * Math.cos(lat) * Math.cos(dl)));
  const ex = Math.cos(lat) * Math.sin(dl);
  const ey = cosP0 * Math.sin(lat) - sinP0 * Math.cos(lat) * Math.cos(dl);
  return { c: Math.acos(cosc), ex, ey };
}

/** Sphere point at angular distance c along plane direction (x, y)/ρ from the centre. */
function azimuthalInverse(x: number, y: number, c: number, lon0: number, sinP0: number, cosP0: number): [number, number] {
  const rho = Math.hypot(x, y);
  if (rho < 1e-12) return [lon0, Math.asin(sinP0)];
  const sinc = Math.sin(c);
  const cosc = Math.cos(c);
  const lat = Math.asin(Math.max(-1, Math.min(1, cosc * sinP0 + (y * sinc * cosP0) / rho)));
  const lon = lon0 + Math.atan2(x * sinc, rho * cosP0 * cosc - y * sinP0 * sinc);
  return [wrapLon(lon), lat];
}

function circle(cx: number, cy: number, r: number, n = 180): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k < n; k++) out.push([cx + r * Math.cos((k / n) * 2 * PI), cy + r * Math.sin((k / n) * 2 * PI)]);
  return out;
}

/** Plane outline of a cylindrical or pseudo-cylindrical map, traced along its edge meridians. */
function edgeOutline(f: (lon: number, lat: number) => [number, number], latMax = HALF): [number, number][] {
  const out: [number, number][] = [];
  const n = 90;
  for (let k = 0; k <= n; k++) out.push(f(PI, -latMax + (2 * latMax * k) / n));
  for (let k = 0; k <= n; k++) out.push(f(-PI, latMax - (2 * latMax * k) / n));
  return out;
}

export function makeProjection(p: ProjectionParams): Projection {
  const lon0 = wrapLon(p.lon0 * RAD);
  const rel = (lon: number) => wrapLon(lon - lon0);
  switch (p.id) {
    case 'mercator': {
      const latMax = 85.05113 * RAD;
      const Y = (lat: number) => Math.log(Math.tan(PI / 4 + Math.max(-latMax, Math.min(latMax, lat)) / 2));
      const f = (l: number, lat: number): [number, number] => [l, Y(lat)];
      return {
        params: p,
        x0: -PI,
        x1: PI,
        y0: -PI,
        y1: PI,
        k0: 1,
        parts: 1,
        wraps: true,
        forward: (lon, lat) => (Math.abs(lat) > latMax ? null : f(rel(lon), lat)),
        inverse: (x, y) => (Math.abs(x) > PI || Math.abs(y) > PI ? null : [wrapLon(x + lon0), 2 * Math.atan(Math.exp(y)) - HALF]),
        clamp: (lon, lat) => f(rel(lon), lat),
        outline: () => [
          [-PI, -PI],
          [PI, -PI],
          [PI, PI],
          [-PI, PI],
        ],
      };
    }
    case 'mollweide': {
      const S2 = Math.SQRT2;
      const f = (l: number, lat: number): [number, number] => {
        const t = mollweideTheta(lat);
        return [((2 * S2) / PI) * l * Math.cos(t), S2 * Math.sin(t)];
      };
      return {
        params: p,
        x0: -2 * S2,
        x1: 2 * S2,
        y0: -S2,
        y1: S2,
        k0: (2 * S2) / PI,
        parts: 1,
        wraps: true,
        forward: (lon, lat) => f(rel(lon), lat),
        inverse: (x, y) => {
          if (Math.abs(y) > S2) return null;
          const t = Math.asin(y / S2);
          const ct = Math.cos(t);
          const l = ct < 1e-9 ? 0 : (PI * x) / (2 * S2 * ct);
          if (Math.abs(l) > PI) return null;
          return [wrapLon(l + lon0), Math.asin(Math.max(-1, Math.min(1, (2 * t + Math.sin(2 * t)) / PI)))];
        },
        clamp: (lon, lat) => f(rel(lon), lat),
        outline: () => edgeOutline(f),
      };
    }
    case 'equalEarth': {
      const f = (l: number, lat: number): [number, number] => {
        const t = Math.asin(EE.M * Math.sin(lat));
        return [(l * Math.cos(t)) / (EE.M * eeDY(t)), eeY(t)];
      };
      const yMax = eeY(Math.asin(EE.M));
      const xMax = PI / (EE.M * EE.A1);
      return {
        params: p,
        x0: -xMax,
        x1: xMax,
        y0: -yMax,
        y1: yMax,
        k0: 1 / (EE.M * EE.A1),
        parts: 1,
        wraps: true,
        forward: (lon, lat) => f(rel(lon), lat),
        inverse: (x, y) => {
          if (Math.abs(y) > yMax) return null;
          let t = y / EE.A1;
          for (let i = 0; i < 20; i++) {
            const d = (eeY(t) - y) / eeDY(t);
            t -= d;
            if (Math.abs(d) < 1e-10) break;
          }
          const l = (EE.M * x * eeDY(t)) / Math.cos(t);
          if (Math.abs(l) > PI) return null;
          return [wrapLon(l + lon0), Math.asin(Math.max(-1, Math.min(1, Math.sin(t) / EE.M)))];
        },
        clamp: (lon, lat) => f(rel(lon), lat),
        outline: () => edgeOutline(f),
      };
    }
    case 'orthographic':
    case 'azimuthal': {
      const ortho = p.id === 'orthographic';
      const sinP0 = Math.sin(p.lat0 * RAD);
      const cosP0 = Math.cos(p.lat0 * RAD);
      // the globe shows a hemisphere; the azimuthal map reaches `extent` from its centre
      const reach = ortho ? HALF : Math.max(10, Math.min(180, p.extent)) * RAD;
      const R = ortho ? 1 : reach;
      const plane = (c: number, ex: number, ey: number): [number, number] => {
        const n = Math.hypot(ex, ey);
        if (n < 1e-12) return [0, 0];
        const r = ortho ? Math.sin(c) : c;
        return [(ex / n) * r, (ey / n) * r];
      };
      return {
        params: p,
        x0: -R,
        x1: R,
        y0: -R,
        y1: R,
        k0: 1,
        parts: 1,
        wraps: false,
        forward: (lon, lat) => {
          const a = azimuthal(lon, lat, lon0, sinP0, cosP0);
          return a.c > reach + 1e-9 ? null : plane(a.c, a.ex, a.ey);
        },
        inverse: (x, y) => {
          const rho = Math.hypot(x, y);
          if (rho > R * (1 + 1e-9)) return null;
          const c = ortho ? Math.asin(Math.min(1, rho)) : rho;
          return azimuthalInverse(x, y, c, lon0, sinP0, cosP0);
        },
        clamp: (lon, lat) => {
          const a = azimuthal(lon, lat, lon0, sinP0, cosP0);
          return plane(Math.min(a.c, reach), a.ex, a.ey);
        },
        outline: () => circle(0, 0, R),
      };
    }
    case 'gott': {
      // two azimuthal equidistant disks reaching the equator, north on the left; the
      // south disk is the far side of the record turned over, so their rims match
      const gap = 0.14;
      const cx = HALF + gap / 2;
      const disk = (lon: number, lat: number, south: boolean): [number, number] => {
        const l = rel(lon);
        const c = Math.min(HALF, south ? HALF + lat : HALF - lat);
        return south ? [cx - c * Math.sin(l), -c * Math.cos(l)] : [-cx + c * Math.sin(l), -c * Math.cos(l)];
      };
      return {
        params: p,
        x0: -2 * cx + gap / 2 - 0.02,
        x1: 2 * cx - gap / 2 + 0.02,
        y0: -HALF - 0.02,
        y1: HALF + 0.02,
        k0: 1,
        parts: 2,
        wraps: false,
        forward: (lon, lat) => disk(lon, lat, lat < 0),
        inverse: (x, y) => {
          const south = x > 0;
          const dx = south ? x - cx : x + cx;
          const c = Math.min(HALF, Math.hypot(dx, y));
          if (Math.hypot(dx, y) > HALF * (1 + 1e-9)) return null;
          const l = south ? Math.atan2(-dx, -y) : Math.atan2(dx, -y);
          return [wrapLon(l + lon0), south ? c - HALF : HALF - c];
        },
        clamp: (lon, lat, part = 0) => (part === 1 ? disk(lon, Math.min(lat, 0), true) : disk(lon, Math.max(lat, 0), false)),
        outline: (part) => circle(part === 1 ? cx : -cx, 0, HALF),
      };
    }
    case 'equirectangular':
    default: {
      const f = (l: number, lat: number): [number, number] => [l, lat];
      return {
        params: p,
        x0: -PI,
        x1: PI,
        y0: -HALF,
        y1: HALF,
        k0: 1,
        parts: 1,
        wraps: true,
        forward: (lon, lat) => f(rel(lon), lat),
        inverse: (x, y) => (Math.abs(x) > PI || Math.abs(y) > HALF ? null : [wrapLon(x + lon0), y]),
        clamp: (lon, lat) => f(rel(lon), lat),
        outline: () => [
          [-PI, -HALF],
          [PI, -HALF],
          [PI, HALF],
          [-PI, HALF],
        ],
      };
    }
  }
}

/** Forward projection for cylindrical / pseudo-cylindrical maps that accepts longitudes past ±π (for shapes drawn shifted). */
export function forwardUnwrapped(proj: Projection, lonRel: number, lat: number): [number, number] {
  // project at the equivalent in-range longitude, then shift by the plane width of a full turn at that latitude
  const k = Math.round(lonRel / (2 * PI));
  const inRange = lonRel - k * 2 * PI;
  const lon0 = proj.params.lon0 * RAD;
  const [x, y] = proj.clamp(inRange + lon0, lat);
  if (k === 0) return [x, y];
  const [xe] = proj.clamp(PI - 1e-9 + lon0, lat);
  const [xw] = proj.clamp(-PI + 1e-9 + lon0, lat);
  return [x + k * (xe - xw), y];
}
