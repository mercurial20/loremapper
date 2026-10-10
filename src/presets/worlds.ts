import type { GenerateOptions } from '../editor/generate';
import type { MapPoint, Sketch } from '../terrain/gen/sketch';

/**
 * What a built-in world brings besides terrain: realms (their borders follow
 * the generated coast), named places and the names of seas, bays and islands.
 * Positions are map fractions, like the sketch.
 */
export interface WorldFeatures {
  realms?: { name: string; color: string; pts: MapPoint[] }[];
  places?: { name: string; at: MapPoint; kind: 'capital' | 'city' | 'town' | 'village' | 'port' | 'temple' | 'fortress' | 'ruins' }[];
  names?: { text: string; at: MapPoint; kind: 'ocean' | 'sea' | 'bay' | 'island' | 'region'; rotation?: number }[];
}

/**
 * A built-in world: a sketch of land, seas and ranges plus generator settings.
 * The generator builds the relief, rivers, climate and biomes from it, so
 * each world is still unique to its seed.
 */
export interface WorldPreset {
  id: string;
  name: string;
  /** one line for the card */
  tagline: string;
  description: string;
  map: { kind: 'flat'; widthKm: number; heightKm: number; maxElevation: number } | { kind: 'planet'; radiusKm: number; maxElevation: number };
  options: Partial<GenerateOptions>;
  sketch: Sketch;
  features?: WorldFeatures;
  /** Only on this computer (never published). */
  local?: boolean;
}

const INNER_SEA: WorldPreset = {
  id: 'inner-sea',
  name: 'The Inner Sea',
  tagline: 'A continent wrapped around a warm, sheltered sea',
  description:
    'A ring of lands around an inland sea, joined to the ocean by one narrow strait. Young mountains wall the north, worn old hills run down the east, and the southern shore dries into steppe and desert.',
  map: { kind: 'flat', widthKm: 5000, heightKm: 3600, maxElevation: 7000 },
  options: { seed: 2024, climateLat: 34, mountains: 0.7, roughness: 0.45, warmth: 0.15, wetness: 0 },
  sketch: {
    land: [
      [
        [0.1, 0.22], [0.22, 0.12], [0.38, 0.1], [0.55, 0.08], [0.72, 0.12], [0.86, 0.2], [0.92, 0.36], [0.9, 0.55], [0.84, 0.72], [0.72, 0.86],
        [0.55, 0.9], [0.4, 0.88], [0.26, 0.84], [0.14, 0.74], [0.08, 0.58], [0.06, 0.4],
      ],
    ],
    sea: [
      [
        [0.3, 0.36], [0.42, 0.3], [0.56, 0.3], [0.68, 0.36], [0.72, 0.48], [0.68, 0.6], [0.56, 0.66], [0.44, 0.67], [0.33, 0.62], [0.27, 0.5],
      ],
      // the strait to the open ocean, in the south-west
      [[0.29, 0.6], [0.32, 0.64], [0.16, 0.86], [0.11, 0.84]],
    ],
    ranges: [
      { pts: [[0.18, 0.2], [0.36, 0.17], [0.55, 0.15], [0.74, 0.2]], width: 0.06, height: 1 },
      { pts: [[0.83, 0.3], [0.85, 0.48], [0.8, 0.68]], width: 0.07, height: 0.55, old: true },
      { pts: [[0.12, 0.38], [0.14, 0.55]], width: 0.04, height: 0.5 },
    ],
    volcanoes: [[0.5, 0.48, 0.5]],
    climate: [{ pts: [[0.35, 0.72], [0.7, 0.68], [0.75, 0.9], [0.35, 0.95]], rain: 0.45, temp: 2 }],
  },
};

const WALLED_ISLE: WorldPreset = {
  id: 'walled-isle',
  name: 'The Walled Isle',
  tagline: 'An island fortress ringed by mountains',
  description:
    'A large island whose heart is a fertile basin around a lake, closed in by a ring of high peaks. One river breaks through the wall to the sea, and that gorge is the only easy way in.',
  map: { kind: 'flat', widthKm: 1400, heightKm: 1200, maxElevation: 5500 },
  options: { seed: 77, climateLat: 48, mountains: 0.8, roughness: 0.35, warmth: 0, wetness: 0.2 },
  sketch: {
    land: [
      [
        [0.2, 0.22], [0.36, 0.13], [0.55, 0.12], [0.72, 0.18], [0.84, 0.32], [0.86, 0.5], [0.8, 0.68], [0.66, 0.82], [0.48, 0.87], [0.3, 0.82],
        [0.17, 0.68], [0.13, 0.46],
      ],
    ],
    sea: [[[0.45, 0.44], [0.53, 0.42], [0.57, 0.49], [0.52, 0.55], [0.45, 0.53]]],
    ranges: [
      // the ring, broken in the south-east where the river leaves
      { pts: [[0.62, 0.74], [0.45, 0.76], [0.3, 0.66], [0.25, 0.48], [0.31, 0.3], [0.47, 0.22], [0.64, 0.25], [0.75, 0.38], [0.76, 0.54], [0.71, 0.64]], width: 0.07, height: 1 },
    ],
    rough: 0.6,
  },
};

const THOUSAND_ISLES: WorldPreset = {
  id: 'thousand-isles',
  name: 'The Thousand Isles',
  tagline: 'A volcanic archipelago with hidden coves',
  description:
    'A sprawling archipelago in a warm sea: one larger island with a smoking volcano, chains of smaller isles along an old arc, and countless islets and coves to hide a village in.',
  map: { kind: 'flat', widthKm: 2200, heightKm: 1600, maxElevation: 4500 },
  options: { seed: 1001, climateLat: 14, mountains: 0.6, roughness: 0.5, warmth: 0.3, wetness: 0.3 },
  sketch: {
    land: [
      [[0.4, 0.38], [0.5, 0.33], [0.6, 0.38], [0.62, 0.5], [0.55, 0.6], [0.44, 0.58], [0.38, 0.48]],
      [[0.14, 0.2], [0.21, 0.17], [0.24, 0.24], [0.18, 0.29], [0.12, 0.26]],
      [[0.26, 0.32], [0.32, 0.3], [0.33, 0.37], [0.27, 0.38]],
      [[0.7, 0.18], [0.78, 0.16], [0.8, 0.24], [0.73, 0.27]],
      [[0.8, 0.36], [0.87, 0.35], [0.88, 0.43], [0.82, 0.45]],
      [[0.74, 0.62], [0.82, 0.6], [0.85, 0.7], [0.77, 0.73]],
      [[0.6, 0.76], [0.66, 0.74], [0.68, 0.81], [0.62, 0.83]],
      [[0.2, 0.62], [0.28, 0.58], [0.32, 0.66], [0.25, 0.72], [0.18, 0.69]],
      [[0.36, 0.78], [0.42, 0.77], [0.43, 0.84], [0.37, 0.85]],
      [[0.08, 0.46], [0.13, 0.44], [0.15, 0.5], [0.1, 0.53]],
    ],
    ranges: [
      { pts: [[0.12, 0.22], [0.3, 0.34], [0.46, 0.44], [0.58, 0.46], [0.76, 0.42], [0.86, 0.38]], width: 0.03, height: 0.55 },
      { pts: [[0.22, 0.64], [0.4, 0.8], [0.64, 0.78], [0.8, 0.66]], width: 0.025, height: 0.45, old: true },
    ],
    volcanoes: [
      [0.52, 0.45, 0.9],
      [0.18, 0.23, 0.5],
      [0.76, 0.21, 0.45],
      [0.84, 0.4, 0.4],
      [0.79, 0.67, 0.45],
      [0.25, 0.66, 0.4],
      [0.46, 0.66, 0.35],
      [0.3, 0.48, 0.3],
      [0.68, 0.56, 0.3],
    ],
    rough: 0.8,
  },
};

const THE_SPINE: WorldPreset = {
  id: 'the-spine',
  name: 'The Spine of the World',
  tagline: 'One great range splits a continent in two',
  description:
    'A long continent cut lengthwise by a single towering range. The western coast catches every storm and is green and wet; beyond the peaks lies a vast rain shadow of steppe and desert, with a few great rivers crossing it to the eastern sea.',
  map: { kind: 'flat', widthKm: 4200, heightKm: 4200, maxElevation: 8500 },
  options: { seed: 9, climateLat: 42, mountains: 0.9, roughness: 0.4, warmth: 0, wetness: 0 },
  sketch: {
    land: [
      [
        [0.3, 0.06], [0.48, 0.08], [0.62, 0.16], [0.74, 0.3], [0.8, 0.46], [0.78, 0.62], [0.7, 0.78], [0.58, 0.9], [0.44, 0.94], [0.34, 0.86],
        [0.28, 0.7], [0.22, 0.52], [0.2, 0.34], [0.22, 0.16],
      ],
    ],
    ranges: [
      { pts: [[0.34, 0.1], [0.36, 0.28], [0.38, 0.46], [0.4, 0.64], [0.46, 0.82], [0.5, 0.9]], width: 0.06, height: 1 },
      { pts: [[0.62, 0.3], [0.7, 0.5], [0.66, 0.66]], width: 0.06, height: 0.4, old: true },
    ],
    climate: [{ pts: [[0.42, 0.2], [0.72, 0.3], [0.76, 0.6], [0.62, 0.84], [0.47, 0.8], [0.42, 0.5]], rain: 0.4 }],
  },
};

// ---------------------------------------------------------------- planets

/** Longitude / latitude (degrees) as a point on an equirectangular planet map. */
const L = (lon: number, lat: number): MapPoint => [(lon + 180) / 360, (90 - lat) / 180];
const lonLat = (pts: number[]) => {
  const out: MapPoint[] = [];
  for (let i = 0; i < pts.length; i += 2) out.push(L(pts[i], pts[i + 1]));
  return out;
};
const RAD = Math.PI / 180;
/** The point d degrees from (lon, lat) along bearing b (great circle); longitude stays continuous. */
function dest(lon: number, lat: number, d: number, b: number): [number, number] {
  const p1 = lat * RAD;
  const dd = d * RAD;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(dd) + Math.cos(p1) * Math.sin(dd) * Math.cos(b * RAD));
  const dl = Math.atan2(Math.sin(b * RAD) * Math.sin(dd) * Math.cos(p1), Math.cos(dd) - Math.sin(p1) * Math.sin(p2));
  return [lon + dl / RAD, p2 / RAD];
}
/** A circle of angular radius r on the sphere, slightly irregular. */
function circle(lon: number, lat: number, r: number, wobble = 0.08, n = 56): MapPoint[] {
  const out: MapPoint[] = [];
  for (let k = 0; k < n; k++) {
    const b = (k / n) * 360;
    const rr = r * (1 + wobble * Math.sin(k * 2.7 + lon) * Math.cos(k * 1.3 + lat));
    out.push(L(...dest(lon, lat, rr, b)));
  }
  return out;
}
/** A band between angular radii r0 and r1 around (lon, lat), over bearings b0…b1. */
function band(lon: number, lat: number, r0: number, r1: number, b0: number, b1: number, n = 24): MapPoint[] {
  const outer: MapPoint[] = [];
  const inner: MapPoint[] = [];
  for (let k = 0; k <= n; k++) {
    const b = b0 + ((b1 - b0) * k) / n;
    const w = 1 + 0.07 * Math.sin(k * 1.9 + b0);
    outer.push(L(...dest(lon, lat, r1 * w, b)));
    inner.push(L(...dest(lon, lat, r0 / w, b)));
  }
  return [...outer, ...inner.reverse()];
}
/** An arc of radius r over bearings b0…b1, as a polyline (for ranges). */
function arc(lon: number, lat: number, r: number, b0: number, b1: number, n = 16): MapPoint[] {
  const out: MapPoint[] = [];
  for (let k = 0; k <= n; k++) out.push(L(...dest(lon, lat, r, b0 + ((b1 - b0) * k) / n)));
  return out;
}

const PANGAEA: WorldPreset = {
  id: 'pangaea',
  name: 'Pangaea',
  tagline: 'Earth 250 million years ago: one supercontinent',
  description:
    'All of Earth’s land in one C-shaped supercontinent around the Tethys Sea, as palaeogeographers reconstruct it for the end of the Permian. The Central Pangean Mountains rise where the continents collided, the vast interior is hot desert, and the world ocean Panthalassa covers the rest of the globe.',
  map: { kind: 'planet', radiusKm: 6371, maxElevation: 8000 },
  options: { seed: 250, mountains: 0.75, roughness: 0.4, warmth: 0.45, wetness: -0.1 },
  sketch: {
    land: [
      lonLat([
        // Laurasia: the northern coast, then Siberia and China
        -60, 55, -40, 68, 0, 74, 40, 76, 80, 72, 110, 66, 130, 56, 142, 46, 136, 40,
        // the north shore of the Tethys, to its western end
        115, 40, 95, 36, 75, 32, 55, 26, 35, 18, 18, 8,
        // Gondwana: the south shore of the Tethys, Australia and Antarctica
        30, -4, 50, -12, 70, -18, 90, -24, 108, -30, 116, -42, 108, -54, 88, -64, 60, -72, 20, -78, -20, -76,
        // South America, then the western coast of North America
        -50, -65, -65, -45, -70, -25, -60, -5, -70, 10, -80, 25, -75, 40, -65, 50,
      ]),
      // Cimmeria, drifting across the Tethys, and the China blocks
      lonLat([55, 10, 72, 12, 86, 8, 88, 4, 72, 5, 58, 6]),
      lonLat([118, 20, 130, 24, 134, 14, 122, 10]),
      lonLat([124, 0, 136, -2, 138, -10, 126, -10]),
    ],
    ranges: [
      // the Central Pangean Mountains along the old suture
      { pts: [L(-62, -2), L(-40, 4), L(-15, 10), L(8, 14)], width: 0.025, height: 0.9 },
      // the Urals, already old
      { pts: [L(60, 45), L(62, 70)], width: 0.015, height: 0.45, old: true },
      // mountains along the Panthalassa margins
      { pts: [L(-78, 25), L(-72, 50)], width: 0.015, height: 0.8 },
      { pts: [L(-68, -30), L(-55, -62), L(-10, -76), L(40, -76)], width: 0.02, height: 0.7 },
      { pts: [L(132, 52), L(136, 40)], width: 0.012, height: 0.6 },
    ],
    climate: [
      // the hot, dry heart of the supercontinent
      { pts: lonLat([-45, 25, 30, 30, 40, 0, 20, -35, -40, -35, -55, 0]), rain: 0.3, temp: 4 },
      // monsoon rains on the Tethys coasts
      { pts: lonLat([40, 30, 125, 45, 125, -35, 40, -18]), rain: 1.6 },
    ],
  },
};

// Pangaea Proxima: a ring of continents around the Medi-Pangaean Sea (after Scotese)
const PROXIMA_RING = (() => {
  const out: MapPoint[] = [];
  const n = 64;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const r = 1 + 0.12 * Math.sin(3 * a + 1) + 0.07 * Math.sin(7 * a);
    out.push(L(20 + 78 * r * Math.cos(a), -8 + 52 * r * Math.sin(a)));
  }
  return out;
})();

const PANGAEA_PROXIMA: WorldPreset = {
  id: 'pangaea-proxima',
  name: 'Pangaea Proxima',
  tagline: 'Earth 250 million years from now: a ring of land',
  description:
    'A forecast of the next supercontinent by the geologist Christopher Scotese: the Atlantic has closed, the Americas, Eurasia, Africa, Australia and Antarctica have merged into one great ring, and inside it lies the enclosed Medi-Pangaean Sea. Young mountains mark every collision; one vast ocean covers the rest of the planet.',
  map: { kind: 'planet', radiusKm: 6371, maxElevation: 9000 },
  options: { seed: 2502, mountains: 0.85, roughness: 0.4, warmth: 0.3, wetness: -0.05 },
  sketch: {
    land: [PROXIMA_RING, circle(150, -40, 5, 0.3), circle(160, 30, 4, 0.3), circle(-120, 10, 3, 0.3)],
    sea: [lonLat([-12, 4, 18, 18, 52, 10, 64, -12, 50, -34, 18, -40, -6, -30, -18, -12])],
    ranges: [
      // collision belts around the ring
      { pts: [L(-40, 30), L(-50, 0), L(-35, -35)], width: 0.022, height: 0.95 },
      { pts: [L(40, 32), L(75, 30), L(95, 12)], width: 0.025, height: 1 },
      { pts: [L(90, -25), L(60, -50), L(20, -56)], width: 0.022, height: 0.85 },
      { pts: [L(-20, -50), L(-45, -40)], width: 0.015, height: 0.6, old: true },
      { pts: [L(-10, 40), L(15, 44)], width: 0.015, height: 0.55, old: true },
    ],
    climate: [{ pts: lonLat([-30, 30, 70, 30, 70, -45, -30, -45]), rain: 0.65 }],
  },
};

// the Eyeball World: one face always toward its star (the substellar point is the map's centre)
const EYEBALL: WorldPreset = {
  id: 'eyeball-world',
  name: 'The Eyeball World',
  tagline: 'A tidally locked planet: an ocean eye under an unmoving sun',
  description:
    'Like many planets found around red dwarf stars, this world always turns the same face to its sun. Beneath the star lies a warm, stormy ocean, the eye; around it a ring of green and mountainous lands, and beyond the twilight zone a frozen night side under ice sheets that never see the day.',
  map: { kind: 'planet', radiusKm: 5800, maxElevation: 7500 },
  options: { seed: 1013, mountains: 0.7, roughness: 0.45, warmth: 0, wetness: 0.1 },
  sketch: {
    land: [
      // the iris: three great lands around the eye, parted by straits
      band(0, 0, 32, 72, 8, 112),
      band(0, 0, 34, 70, 128, 232),
      band(0, 0, 32, 74, 248, 352),
      // the night side: an ice-locked continent and its outliers
      circle(180, 5, 38, 0.12),
      circle(170, 60, 14, 0.15),
      circle(-150, -50, 12, 0.15),
      // islands in the eye
      circle(8, -6, 3.5, 0.3),
      circle(-10, 12, 2.5, 0.3),
    ],
    ranges: [
      { pts: arc(0, 0, 44, 20, 100), width: 0.012, height: 0.9 },
      { pts: arc(0, 0, 46, 140, 220), width: 0.012, height: 0.85 },
      { pts: arc(0, 0, 44, 260, 340), width: 0.012, height: 0.9 },
      { pts: [L(160, 25), L(180, 5), L(200, -15)], width: 0.02, height: 0.8 },
    ],
    volcanoes: [
      [L(8, -6)[0], L(8, -6)[1], 0.6],
      [L(-10, 12)[0], L(-10, 12)[1], 0.5],
    ],
    climate: [
      // under the star: warm and stormy; the day side stays mild out to the twilight
      { pts: circle(0, 0, 35, 0), temp: 10, rain: 1.5 },
      { pts: circle(0, 0, 70, 0), temp: 4 },
      // the night side freezes, harder towards its middle
      { pts: circle(180, 0, 82, 0), temp: -26, rain: 0.45 },
      { pts: circle(180, 0, 45, 0), temp: -14 },
    ],
    rough: 0.5,
  },
};

// worlds kept only on this computer: any module in ./local exporting `preset` (the folder isn't published)
const localModules = import.meta.glob<{ preset: WorldPreset }>('./local/*.ts', { eager: true });
const LOCAL = Object.values(localModules)
  .map((m) => m.preset)
  .filter(Boolean)
  .map((p) => ({ ...p, local: true }));

export const WORLD_PRESETS: WorldPreset[] = [INNER_SEA, WALLED_ISLE, THOUSAND_ISLES, THE_SPINE, PANGAEA, PANGAEA_PROXIMA, EYEBALL, ...LOCAL];
