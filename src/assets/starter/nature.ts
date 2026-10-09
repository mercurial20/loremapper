import { asset, box, C, gable, glowDef, INK, ink, mountain, rock, shadow, sparkle, tree, type StarterAsset } from './kit';

// ---------------------------------------------------------------- mountains

const peak = asset(
  'mountain-peak',
  'Mountain peak',
  'Mountains',
  ['mountain', 'peak', 'hill'],
  128,
  96,
  shadow(64, 88, 56, 5) + mountain(10, 118, 88, 62, 12),
);

const range = asset(
  'mountain-range',
  'Rugged range',
  'Mountains',
  ['mountains', 'range', 'rugged', 'ridge'],
  128,
  96,
  shadow(64, 88, 60, 5) +
    mountain(36, 104, 82, 70, 8, { light: '#bfae88', dark: '#7f6d50' }) +
    mountain(2, 70, 88, 32, 26) +
    mountain(58, 126, 88, 92, 30) +
    mountain(30, 76, 90, 52, 46, { light: '#d3c29c', dark: '#968361' }),
);

const snowy = asset(
  'mountain-snowy',
  'Snow-capped peak',
  'Mountains',
  ['mountain', 'snow', 'peak', 'alpine', 'ice'],
  128,
  96,
  shadow(64, 88, 58, 5) +
    mountain(70, 124, 88, 96, 34, { snow: true, snowLine: 0.4, light: '#b9b2a6', dark: '#7c7466' }) +
    mountain(6, 112, 88, 56, 4, { snow: true, snowLine: 0.45, light: '#c4bcb0', dark: '#857b6c' }),
);

const volcano = asset(
  'mountain-volcano',
  'Volcano',
  'Mountains',
  ['volcano', 'lava', 'fire', 'mountain', 'smoke'],
  128,
  112,
  `<circle cx="64" cy="38" r="28" fill="url(#lava)"/>` +
    // smoke
    `<path d="M58 30 C48 28 46 16 56 14 C56 4 70 2 74 10 C84 6 92 16 84 22 C88 30 78 34 72 30 C68 34 62 34 58 30 Z" fill="#8d8a86" ${ink(2)}/>` +
    `<path d="M70 12 C78 10 84 16 80 20" fill="none" stroke="#b9b6b0" stroke-width="2" stroke-linecap="round"/>` +
    shadow(64, 104, 58, 5) +
    `<path d="M8 102 L46 44 L54 40 L74 40 L82 44 L120 102 Z" fill="#7d6b5c"/>` +
    `<path d="M64 40 L74 40 L82 44 L120 102 L80 102 L70 60 Z" fill="#4c3f35" opacity=".7"/>` +
    `<path d="M8 102 L46 44 L54 40 L74 40 L82 44 L120 102 Z" fill="none" ${ink()}/>` +
    `<ellipse cx="64" cy="41" rx="12" ry="3.5" fill="#ff7a2a" ${ink(2)}/>` +
    `<path d="M58 42 C56 54 52 62 54 72 C56 78 52 86 50 94 M70 42 C72 52 78 58 76 68" fill="none" stroke="${INK}" stroke-width="5.5" stroke-linecap="round"/>` +
    `<path d="M58 42 C56 54 52 62 54 72 C56 78 52 86 50 94 M70 42 C72 52 78 58 76 68" fill="none" stroke="#ff8a2a" stroke-width="3" stroke-linecap="round"/>` +
    `<path d="M58 44 C57 52 55 58 56 64" fill="none" stroke="#ffe08a" stroke-width="1.2" stroke-linecap="round"/>`,
  `<radialGradient id="lava"><stop offset="0" stop-color="#ff9a3a" stop-opacity=".7"/><stop offset="1" stop-color="#ff5a1a" stop-opacity="0"/></radialGradient>`,
);

// ---------------------------------------------------------------- farms

const sheaf = (x: number, y: number) =>
  `<path d="M${x - 5} ${y} L${x - 2} ${y - 14} L${x + 2} ${y - 14} L${x + 5} ${y} Z" fill="${C.gold}" ${ink(1.6)}/>` +
  `<path d="M${x - 3} ${y - 13} L${x - 6} ${y - 20} M${x} ${y - 14} L${x} ${y - 22} M${x + 3} ${y - 13} L${x + 6} ${y - 20}" ${ink(1.6)}/>` +
  `<line x1="${x - 4}" y1="${y - 6}" x2="${x + 4}" y2="${y - 6}" stroke="${C.woodDark}" stroke-width="1.8"/>`;

const field = (pts: string, fill: string, furrow: string) => {
  return `<polygon points="${pts}" fill="${fill}"/>` + furrow + `<polygon points="${pts}" fill="none" ${ink(2)}/>`;
};

const furrows = (x0: number, y0: number, x1: number, y1: number, dx: number, dy: number, n: number, color: string) =>
  Array.from({ length: n }, (_, i) => `<line x1="${x0 + dx * i}" y1="${y0 + dy * i}" x2="${x1 + dx * i}" y2="${y1 + dy * i}" stroke="${color}" stroke-width="1.3"/>`).join('');

const grain = asset(
  'farm-grain',
  'Grain fields',
  'Farms',
  ['farm', 'grain', 'wheat', 'field', 'agriculture'],
  128,
  96,
  shadow(64, 88, 58, 5) +
    field('8,60 46,44 74,54 36,72', '#e3c35e', furrows(14, 60, 50, 45, 5, 2.4, 6, '#b8962e')) +
    field('46,44 86,30 114,40 74,54', '#9cba5a', furrows(54, 44, 90, 31, 5, 2.2, 6, '#6f8f3a')) +
    field('36,72 74,54 104,66 64,86', '#a78152', furrows(44, 72, 80, 55, 5.5, 2.6, 6, '#7a5a34')) +
    field('74,54 114,40 124,52 104,66', '#d8c47a', furrows(80, 56, 116, 42, 4, 2.4, 5, '#b39a46')) +
    sheaf(30, 62) +
    sheaf(40, 58) +
    sheaf(96, 80) +
    tree(18, 86, 6),
);

const fruitTree = (x: number, y: number) =>
  tree(x, y, 8, C.leaf, C.leafDark) +
  [
    [-3, -16],
    [3, -12],
    [5, -18],
    [-5, -11],
    [0, -20],
  ]
    .map(([dx, dy]) => `<circle cx="${x + dx}" cy="${y + dy}" r="1.6" fill="#d8402c"/>`)
    .join('');

const orchard = asset(
  'farm-orchard',
  'Orchard',
  'Farms',
  ['farm', 'orchard', 'fruit', 'apple', 'trees'],
  128,
  96,
  shadow(64, 88, 58, 5) +
    `<path d="M8 82 Q64 64 120 82 L120 90 L8 90 Z" fill="#9cba5a" opacity=".5"/>` +
    [28, 52, 76, 100].map((x) => fruitTree(x, 54)).join('') +
    [18, 42, 66, 90, 114].map((x) => fruitTree(x, 80)).join('') +
    `<path d="M6 88 H122" ${ink(1.6)}/>` +
    Array.from({ length: 10 }, (_, i) => `<line x1="${8 + i * 12.6}" y1="84" x2="${8 + i * 12.6}" y2="92" ${ink(1.6)}/>`).join(''),
);

const sheep = (x: number, y: number) =>
  `<path d="M${x - 8} ${y} q-2 -6 3 -8 q2 -5 7 -3 q5 -3 8 2 q5 1 3 7 q1 5 -5 5 h-11 q-6 0 -5 -3 Z" fill="#f6f1e6" ${ink(1.6)}/>` +
  `<ellipse cx="${x + 11}" cy="${y - 4}" rx="3" ry="2.6" fill="#2c2620"/>` +
  `<path d="M${x - 4} ${y + 2} v4 M${x + 4} ${y + 2} v4" ${ink(1.6)}/>`;

const livestock = asset(
  'farm-livestock',
  'Livestock farm',
  'Farms',
  ['farm', 'livestock', 'barn', 'sheep', 'cattle', 'ranch'],
  128,
  96,
  shadow(64, 90, 58, 5) +
    `<path d="M4 88 Q64 70 124 88 Z" fill="#9cba5a" ${ink(1.6)}/>` +
    // barn
    box(14, 40, 38, 34, '#b0442f') +
    gable(14, 40, 38, 18, '#6b5240', '#3d2e22', 3) +
    `<rect x="25" y="54" width="16" height="20" fill="#f3e6c8" ${ink(1.8)}/>` +
    `<path d="M25 54 L41 74 M41 54 L25 74" ${ink(1.6)}/>` +
    `<rect x="29" y="28" width="8" height="7" fill="#f3e6c8" ${ink(1.4)}/>` +
    // silo
    box(54, 36, 12, 38, C.stoneMid) +
    `<path d="M54 36 A6 6 0 0 1 66 36 Z" fill="${C.slate}" ${ink(2)}/>` +
    // fence
    `<path d="M70 62 H124 M70 70 H124" ${ink(1.6)}/>` +
    Array.from({ length: 6 }, (_, i) => `<line x1="${72 + i * 10}" y1="58" x2="${72 + i * 10}" y2="76" ${ink(1.8)}/>`).join('') +
    sheep(84, 86) +
    sheep(106, 82) +
    // cow
    `<path d="M50 80 h18 q4 0 4 4 v4 h-26 v-4 q0 -4 4 -4 Z" fill="#f6f1e6" ${ink(1.6)}/>` +
    `<path d="M54 80 q4 4 0 7 M62 81 q-3 3 2 6" fill="#2c2620"/>` +
    `<ellipse cx="45" cy="80" rx="4" ry="3.4" fill="#f6f1e6" ${ink(1.6)}/>`,
);

// ---------------------------------------------------------------- mining & resources

const mineBase = (vein: string) =>
  shadow(64, 104, 58, 5) +
  `<path d="M8 102 Q18 56 62 48 Q106 54 120 102 Z" fill="${C.rock}"/>` +
  `<path d="M62 48 Q106 54 120 102 L84 102 Q86 72 62 48 Z" fill="${C.rockDark}" opacity=".5"/>` +
  `<path d="M24 76 l8 4 l6 -3 M92 70 l6 6 l8 -2 M70 60 l-4 6" fill="none" stroke="${vein}" stroke-width="2.6" stroke-linecap="round"/>` +
  `<path d="M8 102 Q18 56 62 48 Q106 54 120 102 Z" fill="none" ${ink()}/>` +
  // timber-framed entrance
  `<path d="M42 102 V80 Q42 66 54 66 Q66 66 66 80 V102 Z" fill="#1f1913"/>` +
  `<path d="M40 102 V72 M68 102 V72 M37 72 H71" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>` +
  `<path d="M40 102 V72 M68 102 V72 M37 72 H71" fill="none" stroke="${C.wood}" stroke-width="3.4" stroke-linecap="round"/>` +
  `<path d="M48 102 L44 112 M60 102 L64 112" stroke="#6b5a48" stroke-width="2"/>`;

const nuggets = (cx: number, cy: number, light: string, dark: string, n = 7) => {
  const pos = [
    [0, 0],
    [-9, 3],
    [9, 3],
    [-4, -6],
    [5, -6],
    [-14, 6],
    [14, 6],
    [0, 7],
  ].slice(0, n);
  return pos
    .map(([dx, dy], i) => {
      const x = cx + dx;
      const y = cy + dy;
      const r = 5 - (i % 3);
      return (
        `<path d="M${x - r} ${y + r * 0.6} L${x - r * 0.7} ${y - r * 0.5} L${x + r * 0.2} ${y - r} L${x + r} ${y - r * 0.2} L${x + r * 0.8} ${y + r * 0.7} Z" fill="${light}" ${ink(1.5)}/>` +
        `<path d="M${x + r * 0.2} ${y - r} L${x + r} ${y - r * 0.2} L${x + r * 0.8} ${y + r * 0.7} L${x + r * 0.1} ${y + r * 0.3} Z" fill="${dark}" opacity=".7"/>`
      );
    })
    .join('');
};

const ore = (id: string, name: string, tags: string[], light: string, dark: string, vein: string, extra = '') =>
  asset(id, name, 'Mining & resources', ['mine', 'ore', 'resource', ...tags], 128, 112, mineBase(vein) + nuggets(94, 98, light, dark) + extra);

const iron = ore('resource-iron', 'Iron mine', ['iron', 'metal'], '#9a5a45', '#4f2a20', '#7a3a2a');
const copper = ore(
  'resource-copper',
  'Copper mine',
  ['copper', 'metal'],
  '#d27d3e',
  '#7c3f1a',
  '#c06a2f',
  `<circle cx="90" cy="96" r="1.8" fill="#4fa28c"/><circle cx="100" cy="100" r="1.6" fill="#4fa28c"/><circle cx="86" cy="102" r="1.4" fill="#4fa28c"/>`,
);
const goldMine = ore('resource-gold', 'Gold mine', ['gold', 'precious'], '#f6cd4f', '#a77a14', '#e2b23a', sparkle(98, 88, 4) + sparkle(84, 94, 2.6) + sparkle(30, 70, 3));
const silver = ore('resource-silver', 'Silver mine', ['silver', 'precious'], '#e3e8ec', '#8995a0', '#c8d0d6', sparkle(100, 89, 3.4, '#ffffff') + sparkle(86, 96, 2.4, '#ffffff'));
const coal = asset(
  'resource-coal',
  'Coal mine',
  'Mining & resources',
  ['coal', 'mine', 'fuel', 'resource'],
  128,
  112,
  mineBase('#2c2c30') +
    // mine cart full of coal
    `<path d="M80 92 h32 l-4 14 h-24 Z" fill="#6b5a48" ${ink(2)}/>` +
    nuggets(96, 90, '#3a3a3f', '#141416', 6) +
    `<circle cx="88" cy="107" r="3.5" fill="#3d3530" ${ink(1.6)}/><circle cx="104" cy="107" r="3.5" fill="#3d3530" ${ink(1.6)}/>` +
    `<path d="M66 110 H124" stroke="#6b5a48" stroke-width="2"/>`,
);

const prism = (x: number, base: number, w: number, h: number, angle: number, light: string, mid: string, dark: string) => {
  const t = `rotate(${angle} ${x} ${base})`;
  return (
    `<g transform="${t}">` +
    `<path d="M${x - w / 2} ${base} V${base - h} L${x} ${base - h - w * 0.7} L${x + w / 2} ${base - h} V${base} Z" fill="${mid}"/>` +
    `<path d="M${x - w / 2} ${base} V${base - h} L${x} ${base - h - w * 0.7} L${x} ${base} Z" fill="${light}"/>` +
    `<path d="M${x + w / 2} ${base} V${base - h} L${x} ${base - h - w * 0.7} L${x + w * 0.15} ${base} Z" fill="${dark}" opacity=".55"/>` +
    `<path d="M${x - w / 2} ${base} V${base - h} L${x} ${base - h - w * 0.7} L${x + w / 2} ${base - h} V${base} Z" fill="none" ${ink(2)}/>` +
    `</g>`
  );
};

const crystal = asset(
  'resource-crystal',
  'Crystal deposit',
  'Mining & resources',
  ['crystal', 'quartz', 'resource', 'cave'],
  128,
  112,
  shadow(64, 104, 52, 5) +
    `<circle cx="64" cy="64" r="44" fill="url(#cg)"/>` +
    prism(46, 96, 14, 34, -22, '#c9eefc', '#7fc8e8', '#3d7fae') +
    prism(84, 96, 13, 30, 20, '#c9eefc', '#7fc8e8', '#3d7fae') +
    prism(64, 98, 18, 52, 0, '#d9f4ff', '#8fd3f0', '#4a8fc0') +
    prism(32, 100, 9, 16, -40, '#c9eefc', '#7fc8e8', '#3d7fae') +
    prism(98, 100, 9, 18, 38, '#c9eefc', '#7fc8e8', '#3d7fae') +
    rock(20, 100, 8) +
    rock(108, 100, 8) +
    `<path d="M24 104 Q64 92 104 104" fill="none" ${ink(2)}/>` +
    sparkle(58, 40, 4, '#ffffff') +
    sparkle(90, 58, 3, '#ffffff'),
  glowDef('cg', '#8fd8ff'),
);

const gem = (x: number, y: number, s: number, light: string, mid: string, dark: string) =>
  `<path d="M${x - s} ${y - s * 0.3} L${x - s * 0.55} ${y - s} L${x + s * 0.55} ${y - s} L${x + s} ${y - s * 0.3} L${x} ${y + s} Z" fill="${mid}"/>` +
  `<path d="M${x - s} ${y - s * 0.3} L${x + s} ${y - s * 0.3} L${x + s * 0.55} ${y - s} L${x - s * 0.55} ${y - s} Z" fill="${light}"/>` +
  `<path d="M${x} ${y + s} L${x + s} ${y - s * 0.3} L${x + s * 0.3} ${y - s * 0.3} Z" fill="${dark}"/>` +
  `<path d="M${x - s * 0.3} ${y - s * 0.3} L${x} ${y + s} M${x + s * 0.3} ${y - s * 0.3} L${x} ${y + s}" stroke="${INK}" stroke-opacity=".35" stroke-width="1"/>` +
  `<path d="M${x - s} ${y - s * 0.3} L${x - s * 0.55} ${y - s} L${x + s * 0.55} ${y - s} L${x + s} ${y - s * 0.3} L${x} ${y + s} Z" fill="none" ${ink(2)}/>`;

const gems = asset(
  'resource-gems',
  'Magical gemstones',
  'Mining & resources',
  ['gem', 'gemstone', 'magic', 'arcane', 'jewel', 'resource'],
  128,
  112,
  shadow(64, 104, 48, 5) +
    `<circle cx="64" cy="66" r="46" fill="url(#mg)"/>` +
    `<path d="M24 104 L30 86 L50 80 L80 80 L98 86 L104 104 Z" fill="${C.rock}" ${ink()}/>` +
    `<path d="M80 80 L98 86 L104 104 L84 104 Z" fill="${C.rockDark}" opacity=".5"/>` +
    gem(64, 62, 17, '#f0c9ff', '#b26be0', '#6a2c96') +
    gem(38, 78, 11, '#c9ffd9', '#3fbf7a', '#1d7044') +
    gem(90, 78, 11, '#ffd0e0', '#e05a8a', '#8f2a50') +
    sparkle(48, 40, 4.5) +
    sparkle(84, 46, 3.4) +
    sparkle(104, 66, 2.6) +
    sparkle(22, 64, 2.6) +
    `<path d="M64 26 v-8 M50 30 l-4 -6 M78 30 l4 -6" stroke="#e8b8ff" stroke-width="2" stroke-linecap="round"/>`,
  glowDef('mg', '#d38bff'),
);

export const MOUNTAINS: StarterAsset[] = [peak, range, snowy, volcano];
export const FARMS: StarterAsset[] = [grain, orchard, livestock];
export const RESOURCES: StarterAsset[] = [iron, copper, goldMine, silver, coal, crystal, gems];
