import type { GenerateOptions } from '../editor/generate';
import type { Sketch } from '../terrain/gen/sketch';

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
  map: { kind: 'flat'; widthKm: number; heightKm: number; maxElevation: number };
  options: Partial<GenerateOptions>;
  sketch: Sketch;
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

// worlds kept only on this computer: any module in ./local exporting `preset` (the folder isn't published)
const localModules = import.meta.glob<{ preset: WorldPreset }>('./local/*.ts', { eager: true });
const LOCAL = Object.values(localModules)
  .map((m) => m.preset)
  .filter(Boolean)
  .map((p) => ({ ...p, local: true }));

export const WORLD_PRESETS: WorldPreset[] = [INNER_SEA, WALLED_ISLE, THOUSAND_ISLES, THE_SPINE, ...LOCAL];
