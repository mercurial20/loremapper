import type { StylePresetId } from '../model/types';

type Stop = [number, string];

export interface StylePreset {
  id: StylePresetId;
  name: string;
  description: string;
  /** Behind the planet (beyond the poles). */
  background: string;
  paper: string;
  paperAmount: number;
  grain: number;
  stains: number;
  /** Elevation ramp, stops at fraction of max elevation above sea level. */
  land: Stop[];
  /** Water ramp, stops at fraction of depth (0 = coast, 1 = 6000 m deep). */
  water: Stop[];
  /** Biome base colours, in BIOMES order. */
  biomes: string[];
  biomePattern: number;
  coastInk: string;
  coastWidth: number;
  rippleColor: string;
  rippleAlpha: number;
  contourColor: string;
  shadowTint: string;
  hillshade: number;
  exaggeration: number;
  fogColor: string;
  fogShade: string;
  /** Vector defaults */
  ink: string;
  labelColor: string;
  labelHalo: string;
  territoryFill: number;
  vignette: string;
  /** 0..1: light falls into flat bands (cel shading). */
  cel?: number;
  /** Colour levels per channel (0 = smooth colour). */
  posterize?: number;
  /** Pixel-art block size in screen pixels (0 = off). */
  pixel?: number;
  /** 0..1: shadows drawn as engraved hatching. */
  hatch?: number;
}

export const STYLE_PRESETS: Record<StylePresetId, StylePreset> = {
  parchment: {
    id: 'parchment',
    name: 'Parchment',
    description: 'Aged vellum, sepia ink and muted washes',
    background: '#191510',
    paper: '#eadcb8',
    paperAmount: 0.2,
    grain: 0.07,
    stains: 0.03,
    land: [
      [0.0, '#d9c99a'],
      [0.006, '#bcc08a'],
      [0.06, '#adb57e'],
      [0.18, '#b6ad7c'],
      [0.32, '#a99a74'],
      [0.5, '#958670'],
      [0.68, '#8c8478'],
      [0.82, '#cfc9bd'],
      [1.0, '#f4f1e8'],
    ],
    water: [
      [0.0, '#b3c4b4'],
      [0.05, '#9cb6ad'],
      [0.25, '#86a3a0'],
      [0.6, '#6f8f92'],
      [1.0, '#5e7d84'],
    ],
    biomes: ['#a9b86f', '#5f7c45', '#cdb866', '#dcc08a', '#6d7a52', '#eef0ea', '#9a9284', '#c4b878'],
    biomePattern: 1,
    coastInk: '#3e3122',
    coastWidth: 1.6,
    rippleColor: '#4f6766',
    rippleAlpha: 0.32,
    contourColor: '#5b4a33',
    shadowTint: '#4a3a2a',
    hillshade: 1,
    exaggeration: 30,
    fogColor: '#d8ccb0',
    fogShade: '#8f8270',
    ink: '#3a2d1f',
    labelColor: '#2d2216',
    labelHalo: '#efe3c4',
    territoryFill: 1,
    vignette: 'radial-gradient(ellipse at center, transparent 55%, rgba(60,40,20,0.35) 100%)',
  },
  atlas: {
    id: 'atlas',
    name: 'Fantasy atlas',
    description: 'Saturated, colourful storybook atlas',
    background: '#0f1a24',
    paper: '#f4ecd6',
    paperAmount: 0.06,
    grain: 0.04,
    stains: 0.02,
    land: [
      [0.0, '#efdca0'],
      [0.006, '#93c86b'],
      [0.06, '#7fbb5f'],
      [0.16, '#a6c46a'],
      [0.28, '#d1c47c'],
      [0.42, '#c49a62'],
      [0.6, '#9c7656'],
      [0.78, '#d9d3cf'],
      [1.0, '#ffffff'],
    ],
    water: [
      [0.0, '#9fe0ea'],
      [0.06, '#6cc3dd'],
      [0.25, '#3f9ccb'],
      [0.6, '#2c78b0'],
      [1.0, '#1f5d92'],
    ],
    biomes: ['#9fd36e', '#3f8f45', '#ead577', '#f2d58f', '#5a9373', '#f8fbff', '#a79c90', '#d8cf82'],
    biomePattern: 1,
    coastInk: '#1f3a4a',
    coastWidth: 1.5,
    rippleColor: '#e8fbff',
    rippleAlpha: 0.45,
    contourColor: '#4b3b2a',
    shadowTint: '#2a2440',
    hillshade: 1,
    exaggeration: 30,
    fogColor: '#e6e9ee',
    fogShade: '#9aa3b2',
    ink: '#24303a',
    labelColor: '#1d2731',
    labelHalo: '#ffffff',
    territoryFill: 1,
    vignette: 'radial-gradient(ellipse at center, transparent 65%, rgba(0,10,30,0.25) 100%)',
  },
  political: {
    id: 'political',
    name: 'Clean political',
    description: 'Flat, light land so borders and names stand out',
    background: '#141820',
    paper: '#f6f3ea',
    paperAmount: 0.0,
    grain: 0.0,
    stains: 0.0,
    land: [
      [0.0, '#f1ecdc'],
      [0.01, '#efe9d6'],
      [0.3, '#e9e1ca'],
      [0.6, '#ddd3bb'],
      [1.0, '#f2f0ea'],
    ],
    water: [
      [0.0, '#cfe3ec'],
      [0.1, '#bcd7e5'],
      [0.6, '#a9c9dc'],
      [1.0, '#9cbfd6'],
    ],
    biomes: ['#e2e6c8', '#c7d6b2', '#ece2b8', '#f1e3bd', '#cfd8c2', '#fbfcfd', '#ddd8cf', '#ebe5c6'],
    biomePattern: 0.25,
    coastInk: '#55697a',
    coastWidth: 1.2,
    rippleColor: '#7f9cb2',
    rippleAlpha: 0.0,
    contourColor: '#8a8170',
    shadowTint: '#606a78',
    hillshade: 0.35,
    exaggeration: 20,
    fogColor: '#e9ecef',
    fogShade: '#b8bec6',
    ink: '#2f3b48',
    labelColor: '#25313d',
    labelHalo: '#ffffff',
    territoryFill: 1.6,
    vignette: 'none',
  },
  relief: {
    id: 'relief',
    name: 'Shaded relief',
    description: 'Naturalistic hypsometric tints and strong relief',
    background: '#0b1117',
    paper: '#ffffff',
    paperAmount: 0.0,
    grain: 0.02,
    stains: 0.0,
    land: [
      [0.0, '#cfc59a'],
      [0.006, '#6f9a5a'],
      [0.05, '#7ea562'],
      [0.14, '#a9b071'],
      [0.25, '#c2ae7a'],
      [0.4, '#a98a66'],
      [0.58, '#8d7764'],
      [0.75, '#c8c3bd'],
      [1.0, '#ffffff'],
    ],
    water: [
      [0.0, '#79b1c2'],
      [0.05, '#4f8fae'],
      [0.25, '#2f6b92'],
      [0.6, '#1e4c74'],
      [1.0, '#16395c'],
    ],
    biomes: ['#88ad5f', '#3e6b38', '#c9bb6c', '#dcc08a', '#4f6f50', '#f3f6f8', '#8f877c', '#bdb070'],
    biomePattern: 0.8,
    coastInk: '#1d2a33',
    coastWidth: 0.9,
    rippleColor: '#cfe9f2',
    rippleAlpha: 0.12,
    contourColor: '#3b3226',
    shadowTint: '#1c2232',
    hillshade: 1.25,
    exaggeration: 38,
    fogColor: '#c9d0d6',
    fogShade: '#6e7881',
    ink: '#1f2a33',
    labelColor: '#1a1f24',
    labelHalo: '#ffffff',
    territoryFill: 1,
    vignette: 'none',
  },
  anime: {
    id: 'anime',
    name: 'Anime',
    description: 'Bright cel-shaded colours and bold ink outlines, like a painted animation background',
    background: '#0d1b2e',
    paper: '#ffffff',
    paperAmount: 0,
    grain: 0,
    stains: 0,
    land: [
      [0.0, '#f7e7a6'],
      [0.006, '#8fdc6a'],
      [0.06, '#6fcf5a'],
      [0.16, '#a7d86a'],
      [0.28, '#e4d37a'],
      [0.42, '#d39a5c'],
      [0.6, '#a8735a'],
      [0.76, '#e9eef7'],
      [1.0, '#ffffff'],
    ],
    water: [
      [0.0, '#8ff0f0'],
      [0.05, '#4fd2ea'],
      [0.22, '#2aa3e0'],
      [0.6, '#1f6fc4'],
      [1.0, '#1a4f9e'],
    ],
    biomes: ['#9ee36c', '#33a852', '#f2dc6e', '#ffdc8a', '#4fa080', '#ffffff', '#b3a6a0', '#d7e07a'],
    biomePattern: 0.55,
    coastInk: '#14233a',
    coastWidth: 2.6,
    rippleColor: '#ffffff',
    rippleAlpha: 0.7,
    contourColor: '#3a3050',
    shadowTint: '#4a3a8c',
    hillshade: 1.1,
    exaggeration: 30,
    fogColor: '#e8ecff',
    fogShade: '#9aa3d6',
    ink: '#14233a',
    labelColor: '#14233a',
    labelHalo: '#ffffff',
    territoryFill: 1.3,
    vignette: 'none',
    cel: 1,
    posterize: 9,
  },
  strategy: {
    id: 'strategy',
    name: 'Strategy game',
    description: 'Crisp, readable campaign map with clear terrain, like a grand-strategy game',
    background: '#0a0f14',
    paper: '#ffffff',
    paperAmount: 0,
    grain: 0.015,
    stains: 0,
    land: [
      [0.0, '#d8cf9a'],
      [0.006, '#7aa451'],
      [0.06, '#6f9b4c'],
      [0.16, '#94a85e'],
      [0.28, '#b3a26a'],
      [0.42, '#9a7e5e'],
      [0.6, '#7d6c5e'],
      [0.78, '#d6d8dc'],
      [1.0, '#ffffff'],
    ],
    water: [
      [0.0, '#5f9fb3'],
      [0.05, '#3b7c99'],
      [0.25, '#24587a'],
      [0.6, '#1a4160'],
      [1.0, '#13304a'],
    ],
    biomes: ['#86ad57', '#2f6a35', '#c9bd63', '#dcc283', '#4a6e4c', '#f2f5f8', '#8a8178', '#b9b067'],
    biomePattern: 0.9,
    coastInk: '#0e1a24',
    coastWidth: 1.4,
    rippleColor: '#9fd0e0',
    rippleAlpha: 0.22,
    contourColor: '#2e2a22',
    shadowTint: '#1a1e2c',
    hillshade: 1.15,
    exaggeration: 34,
    fogColor: '#1b2128',
    fogShade: '#0d1116',
    ink: '#0e1a24',
    labelColor: '#ffffff',
    labelHalo: '#10161c',
    territoryFill: 1.2,
    vignette: 'radial-gradient(ellipse at center, transparent 70%, rgba(0,0,0,0.35) 100%)',
    cel: 0.35,
  },
  pixel: {
    id: 'pixel',
    name: 'Pixel art',
    description: 'Chunky pixels and a small palette, like a retro game world map',
    background: '#10121c',
    paper: '#ffffff',
    paperAmount: 0,
    grain: 0,
    stains: 0,
    land: [
      [0.0, '#f0d890'],
      [0.006, '#58b048'],
      [0.08, '#48a040'],
      [0.2, '#88b850'],
      [0.32, '#c8b060'],
      [0.46, '#a07048'],
      [0.64, '#786058'],
      [0.8, '#d8e0f0'],
      [1.0, '#ffffff'],
    ],
    water: [
      [0.0, '#68d8f8'],
      [0.05, '#3898e0'],
      [0.25, '#2868c0'],
      [0.6, '#204898'],
      [1.0, '#183070'],
    ],
    biomes: ['#78c048', '#287830', '#e0c850', '#f0d088', '#407858', '#ffffff', '#988880', '#c0c058'],
    biomePattern: 0.6,
    coastInk: '#182030',
    coastWidth: 1,
    rippleColor: '#ffffff',
    rippleAlpha: 0.5,
    contourColor: '#202030',
    shadowTint: '#282050',
    hillshade: 1,
    exaggeration: 30,
    fogColor: '#303048',
    fogShade: '#181828',
    ink: '#182030',
    labelColor: '#ffffff',
    labelHalo: '#182030',
    territoryFill: 1.2,
    vignette: 'none',
    cel: 1,
    posterize: 6,
    pixel: 4,
  },
  antique: {
    id: 'antique',
    name: 'Antique engraving',
    description: 'Sepia ink on old paper, with shadows engraved in fine hatching',
    background: '#16110b',
    paper: '#e8d9b5',
    paperAmount: 0.35,
    grain: 0.09,
    stains: 0.08,
    land: [
      [0.0, '#e2d2a8'],
      [0.006, '#ddcca0'],
      [0.1, '#d8c69a'],
      [0.3, '#d2bf94'],
      [0.6, '#cbb88e'],
      [1.0, '#efe6d0'],
    ],
    water: [
      [0.0, '#cdbf9c'],
      [0.05, '#c6b894'],
      [0.3, '#bfb08c'],
      [1.0, '#b6a684'],
    ],
    biomes: ['#d6c79a', '#b5a77a', '#dccb98', '#e4d4a8', '#bdb08a', '#f1ead8', '#cbbd98', '#d9c99a'],
    biomePattern: 0.35,
    coastInk: '#3b2a17',
    coastWidth: 1.8,
    rippleColor: '#5a4630',
    rippleAlpha: 0.45,
    contourColor: '#4a3820',
    shadowTint: '#3b2a17',
    hillshade: 1.1,
    exaggeration: 32,
    fogColor: '#d9c9a3',
    fogShade: '#8c7a58',
    ink: '#3b2a17',
    labelColor: '#2e2010',
    labelHalo: '#ece0c2',
    territoryFill: 0.6,
    vignette: 'radial-gradient(ellipse at center, transparent 50%, rgba(50,30,10,0.45) 100%)',
    hatch: 1,
  },
};

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

export function hexToVec3(hex: string): Float32Array {
  const [r, g, b] = hexToRgb(hex);
  return new Float32Array([r / 255, g / 255, b / 255]);
}

export function hexToNumber(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (r << 16) | (g << 8) | b;
}

function rampInto(out: Uint8Array, row: number, stops: Stop[], width: number) {
  const cols = stops.map(([t, c]) => [t, ...hexToRgb(c)] as [number, number, number, number]);
  for (let i = 0; i < width; i++) {
    const t = i / (width - 1);
    let k = 1;
    while (k < cols.length - 1 && t > cols[k][0]) k++;
    const a = cols[k - 1];
    const b = cols[k];
    const f = Math.max(0, Math.min(1, (t - a[0]) / Math.max(1e-6, b[0] - a[0])));
    const o = (row * width + i) * 4;
    out[o] = a[1] + (b[1] - a[1]) * f;
    out[o + 1] = a[2] + (b[2] - a[2]) * f;
    out[o + 2] = a[3] + (b[3] - a[3]) * f;
    out[o + 3] = 255;
  }
}

/** Hypsometric tint for the height overlay, spanning min elevation → max elevation. */
export const HYPSOMETRIC: Stop[] = [
  [0.0, '#0b1d4a'],
  [0.35, '#1f5aa6'],
  [0.5, '#7fc4e8'],
  [0.5238, '#2f8f4e'],
  [0.6, '#9ccf63'],
  [0.7, '#f1df7a'],
  [0.8, '#d9873d'],
  [0.9, '#9b4a2e'],
  [1.0, '#ffffff'],
];

export const RAMP_W = 256;
export const RAMP_ROWS = 4;

/** Build the 256×4 palette texture: land, water, hypsometric, biomes. */
export function buildRamp(style: StylePreset, seaFraction: number): Uint8Array {
  const out = new Uint8Array(RAMP_W * RAMP_ROWS * 4);
  rampInto(out, 0, style.land, RAMP_W);
  rampInto(out, 1, style.water, RAMP_W);
  // hypsometric: shift the shoreline stop to the actual sea-level fraction
  const hyp: Stop[] = HYPSOMETRIC.map(([t, c]) => {
    if (t <= 0.5) return [(t / 0.5) * seaFraction, c];
    if (t < 0.53) return [seaFraction + 0.002, c];
    return [seaFraction + ((t - 0.5238) / (1 - 0.5238)) * (1 - seaFraction), c];
  });
  rampInto(out, 2, hyp, RAMP_W);
  const slot = RAMP_W / 8;
  style.biomes.forEach((c, i) => {
    const [r, g, b] = hexToRgb(c);
    for (let x = 0; x < slot; x++) {
      const o = (3 * RAMP_W + i * slot + x) * 4;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = 255;
    }
  });
  return out;
}
