import { smoothstep } from '../../core/math';
import { Simplex3 } from '../../core/noise3';
import { blurKm, dxKm, rowLat as gridRowLat, sphereTables, type Grid } from './grid';

export interface Climate {
  /** mean temperature, °C */
  temp: Float32Array;
  /** yearly rainfall, ≈0 (desert) … 1.5 (rainforest) */
  rain: Float32Array;
}

export interface ClimateOptions {
  /** −1 colder … +1 warmer */
  warmth: number;
  /** −1 drier … +1 wetter */
  wetness: number;
  /** carry moisture with prevailing winds (rain shadows); otherwise distance to the sea */
  winds: boolean;
  seed: number;
  /** Flat maps: the climate latitude (radians) for a latitude on the virtual sphere. */
  climateLat?: (lat: number) => number;
}

/** Zonal rainfall pattern: wet equator and mid-latitudes, dry subtropics and poles. */
function latRain(latDeg: number): number {
  const a = Math.abs(latDeg);
  return Math.max(0.1, 0.45 + 0.95 * Math.exp(-((latDeg / 11) ** 2)) + 0.6 * Math.exp(-(((a - 50) / 14) ** 2)) - 0.42 * Math.exp(-(((a - 26) / 8) ** 2)) - 0.3 * smoothstep(65, 85, a));
}

/** Prevailing wind direction along x: −1 westward (trade winds, polar easterlies), +1 eastward (westerlies). */
const windDir = (latDeg: number) => (Math.abs(latDeg) < 30 || Math.abs(latDeg) > 62 ? -1 : 1);

/**
 * Temperature and rainfall on a grid. `h` is metres above sea level (≤ 0 is
 * sea) and `coastKm` the distance to the coast.
 */
export function climate(g: Grid, h: Float32Array, coastKm: Float32Array, o: ClimateOptions): Climate {
  const N = g.w * g.h;
  const temp = new Float32Array(N);
  const rain = new Float32Array(N);
  const n = new Simplex3(o.seed);
  const T = sphereTables(g);
  const rowLat = (gg: Grid, j: number) => (o.climateLat ? o.climateLat(gridRowLat(gg, j)) : gridRowLat(gg, j));
  for (let j = 0; j < g.h; j++) {
    const lat = (rowLat(g, j) * 180) / Math.PI;
    const s = Math.sin(rowLat(g, j));
    const base = 27 - 32 * s * s - 12 * s * s * s * s + o.warmth * 7;
    for (let i = 0; i < g.w; i++) {
      const k = j * g.w + i;
      const x = T.cosLat[j] * T.cosLon[i];
      const y = T.cosLat[j] * T.sinLon[i];
      const z = T.sinLat[j];
      const land = h[k] > 0;
      // continental interiors swing colder away from the tropics
      const interior = land ? smoothstep(150, 1400, coastKm[k]) * smoothstep(25, 60, Math.abs(lat)) * 2.5 : 0;
      temp[k] = base - (land ? (h[k] / 1000) * 6.5 : 0) - interior + 1.8 * n.fbm(x, y, z, 3, 3);
      if (!o.winds) {
        const inland = land ? Math.exp(-coastKm[k] / 1300) : 1;
        // climate belts wander in latitude so they never form straight bands
        const latJ = lat + 11 * n.fbm(x, y + 4.4, z, 1.6, 3);
        rain[k] = latRain(latJ) * (0.45 + 0.55 * inland) * (1 + 0.55 * n.fbm(x + 9, y, z, 2.2, 4));
      }
    }
  }
  if (o.winds) {
    // sweep every row downwind: the air picks up moisture over the sea, rains
    // it out over land, and loses most of it climbing mountains
    for (let j = 0; j < g.h; j++) {
      const lat = (rowLat(g, j) * 180) / Math.PI;
      const dir = windDir(lat);
      const km = dxKm(g, j);
      const o0 = j * g.w;
      // start just downwind of a sea cell so the air arrives saturated
      let start = -1;
      for (let i = 0; i < g.w; i++) if (h[o0 + i] <= 0) start = i;
      let m = 1;
      if (!g.wrap) start = dir > 0 ? 0 : g.w - 1;
      else if (start < 0) start = 0;
      const loops = g.wrap ? 2 : 1;
      // height the air has already been lifted to: only climbing above it wrings out rain
      let lifted = 0;
      for (let step = 0; step < g.w * loops; step++) {
        let i = start + dir * step;
        if (g.wrap) i = ((i % g.w) + g.w) % g.w;
        else if (i < 0 || i >= g.w) break;
        const k = o0 + i;
        if (h[k] <= 0) {
          const evap = 0.04 + 0.1 * smoothstep(-5, 28, temp[k]);
          m += (1 - m) * Math.min(1, evap * (km / 25));
          lifted = 0;
          if (step >= g.w * (loops - 1) || !g.wrap) rain[k] = m;
          continue;
        }
        const rise = Math.max(0, h[k] - lifted) / Math.max(1, km);
        lifted = Math.max(h[k], lifted * (1 - 0.03 * (km / 25)));
        const out = m * Math.min(0.5, (0.004 + rise * 0.004) * (km / 25));
        if (step >= g.w * (loops - 1) || !g.wrap) rain[k] = m + out * 5;
        m -= out;
      }
    }
    const smooth = blurKm(rain, g, 140, 2);
    for (let j = 0; j < g.h; j++) {
      const lat = (rowLat(g, j) * 180) / Math.PI;
      for (let i = 0; i < g.w; i++) {
        const k = j * g.w + i;
        const x = T.cosLat[j] * T.cosLon[i];
        const y = T.cosLat[j] * T.sinLon[i];
        const z = T.sinLat[j];
        const latJ = lat + 9 * n.fbm(x, y + 4.4, z, 1.6, 3);
        rain[k] = 1.7 * smooth[k] * latRain(latJ) * (1 + 0.35 * n.fbm(x + 9, y, z, 2.2, 4));
      }
    }
  }
  for (let k = 0; k < N; k++) rain[k] = Math.max(0, rain[k] * (1 + o.wetness * 0.6) + o.wetness * 0.08);
  return { temp, rain };
}

export const BIOME_GRASS = 0;
export const BIOME_FOREST = 1;
export const BIOME_FARM = 2;
export const BIOME_DESERT = 3;
export const BIOME_SWAMP = 4;
export const BIOME_SNOW = 5;
export const BIOME_ROCK = 6;
export const BIOME_STEPPE = 7;

export interface BiomeInput {
  /** mean temperature, °C */
  t: number;
  /** rainfall (see Climate.rain) */
  r: number;
  /** metres above sea level */
  elev: number;
  /** metres per km */
  slope: number;
  /** 0..1 how much water drains through here (log of upstream area) */
  flow: number;
  /** 0..1 closeness to any river */
  river: number;
  /** 0..1 closeness to a large river (green strips through dry land) */
  bigRiver: number;
  /** distance to the sea, km */
  coast: number;
  /** 0..1 slow noise that breaks farmland into patches */
  patch: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Biome weights (0..1 each) for one land cell. Effective moisture (rain
 * against evaporation) sets desert → steppe → grassland → forest; cold gives
 * tundra and ice; altitude and steep slopes give bare rock; water collecting
 * in warm lowlands gives swamps; flat, temperate land watered by rivers or a
 * nearby coast becomes farmland — and big rivers keep a green strip alive
 * even through deserts.
 */
export function biomeWeights(c: BiomeInput, out: Float32Array) {
  const { t, elev, slope } = c;
  const m = c.r * (1.25 - 0.5 * clamp01(t / 30));
  const flat = 1 - smoothstep(5, 22, slope);
  const snow = smoothstep(-3, -11, t);
  const tundra = smoothstep(1, -6, t) * (1 - snow);
  const rock = clamp01(smoothstep(2400, 3900, elev) + 0.75 * smoothstep(35, 90, slope) * smoothstep(700, 1600, elev)) * (1 - snow);
  const oasis = c.bigRiver;
  const desert = smoothstep(0.2, 0.08, m) * smoothstep(0, 10, t) * (1 - rock) * (1 - snow) * (1 - 0.95 * oasis);
  const steppe = clamp01(smoothstep(0.07, 0.16, m) * smoothstep(0.34, 0.22, m) * smoothstep(-6, 2, t) * (1 - desert) + 0.6 * tundra) * (1 - rock) * (1 - 0.7 * oasis);
  const swamp =
    clamp01(smoothstep(0.9, 1.25, m) * smoothstep(200, 40, elev) + 0.9 * smoothstep(0.6, 0.85, c.flow) * smoothstep(0.45, 0.8, m) * smoothstep(150, 20, elev)) *
    flat *
    smoothstep(4, 12, t) *
    (1 - desert);
  const forest = smoothstep(0.42, 0.62, m) * smoothstep(-7, 0, t) * (1 - desert) * (1 - snow) * (1 - rock) * (1 - swamp) * (1 - 0.6 * tundra);
  // fertile land: temperate flat lowlands watered by rain near a river or the coast (patchy fields),
  // or irrigated from a great river through dry country (fields sharing a green floodplain)
  const arable = smoothstep(4, 10, t) * smoothstep(32, 25, t) * flat * smoothstep(1300, 400, elev);
  const rainFed = smoothstep(0.24, 0.4, m) * smoothstep(1.25, 0.85, m) * Math.max(c.river, 0.6 * Math.exp(-c.coast / 90));
  const farm = Math.min(0.85, arable * (rainFed * smoothstep(0.22, 0.55, c.patch) + 0.45 * oasis * smoothstep(0.1, 0.5, c.patch)) * 1.5) * (1 - swamp);
  out.fill(0);
  out[BIOME_FOREST] = forest * (1 - farm);
  out[BIOME_FARM] = farm;
  out[BIOME_DESERT] = desert * (1 - farm);
  out[BIOME_SWAMP] = swamp;
  out[BIOME_SNOW] = snow;
  out[BIOME_ROCK] = rock;
  out[BIOME_STEPPE] = steppe * (1 - farm);
  let used = 0;
  for (let k = 1; k < out.length; k++) used += out[k];
  out[BIOME_GRASS] = Math.max(0, 1 - used) * 0.85;
}
