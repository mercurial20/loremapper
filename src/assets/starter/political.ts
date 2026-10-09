import { arch, asset, box, C, crenels, dome, flag, gable, house, INK, ink, rock, shadow, tower, type StarterAsset } from './kit';

const CAT = 'Political & cultural';

const palace = asset(
  'palace',
  'Royal palace',
  CAT,
  ['palace', 'royal', 'king', 'capital', 'throne'],
  128,
  112,
  shadow(64, 104, 60, 6) +
    // wings
    box(8, 58, 34, 38, C.plaster) +
    box(86, 58, 34, 38, C.plaster) +
    gable(8, 58, 34, 10, C.roofBlue, C.roofBlueDark, 1.5) +
    gable(86, 58, 34, 10, C.roofBlue, C.roofBlueDark, 1.5) +
    [14, 24, 34, 92, 102, 112].map((x) => arch(x - 2.5, 66, 5, 10, '#3d4c66') + arch(x - 2.5, 80, 5, 10, '#3d4c66')).join('') +
    // centre block
    box(38, 46, 52, 50, '#f6ecd4') +
    crenels(38, 46, 52, 7, '#f6ecd4', 3) +
    dome(64, 46, 18, C.gold, C.goldDark, '#ffffff') +
    `<rect x="44" y="46" width="40" height="4" fill="${C.gold}" ${ink(1.6)}/>` +
    [46, 56, 66, 76].map((x) => `<rect x="${x}" y="56" width="5" height="40" fill="#fffaf0" ${ink(1.4)}/>`).join('') +
    arch(58, 74, 12, 22, '#3d4c66') +
    // corner towers
    tower(8, 96, 12, 50, { roof: C.roofBlue, roofDark: C.roofBlueDark, roofH: 18, fill: '#f6ecd4', windows: 2 }) +
    tower(120, 96, 12, 50, { roof: C.roofBlue, roofDark: C.roofBlueDark, roofH: 18, fill: '#f6ecd4', windows: 2 }) +
    flag(8, 28, 10, C.bannerBlue) +
    flag(120, 28, 10, C.bannerBlue, -1) +
    // grand stair
    `<path d="M48 96 H80 L86 104 H42 Z" fill="${C.stone}" ${ink(2)}/>` +
    `<path d="M45 100 H83" stroke="${INK}" stroke-opacity=".4"/>`,
);

/** Yurt (ger): felt walls, low domed roof, decorated band. */
const yurt = (cx: number, base: number, w: number, h: number, band = C.banner, felt = C.felt) => {
  const x0 = cx - w / 2;
  const wallTop = base - h * 0.45;
  const body = `M${x0} ${base} L${x0 + 1} ${wallTop} L${x0 + w - 1} ${wallTop} L${x0 + w} ${base} Z`;
  const roof = `M${x0 - 1} ${wallTop} Q${cx - w * 0.3} ${base - h} ${cx} ${base - h} Q${cx + w * 0.3} ${base - h} ${x0 + w + 1} ${wallTop} Z`;
  return (
    `<path d="${body}" fill="${felt}"/>` +
    `<rect x="${cx + w * 0.15}" y="${wallTop}" width="${w * 0.35}" height="${base - wallTop}" fill="${INK}" opacity=".12"/>` +
    `<path d="${body}" fill="none" ${ink(2)}/>` +
    `<path d="${roof}" fill="${felt}"/>` +
    `<path d="M${cx} ${base - h} Q${cx + w * 0.3} ${base - h} ${x0 + w + 1} ${wallTop} L${cx} ${wallTop} Z" fill="${C.feltShade}" opacity=".8"/>` +
    `<path d="${roof}" fill="none" ${ink(2)}/>` +
    `<rect x="${x0 + 1}" y="${wallTop + (base - wallTop) * 0.25}" width="${w - 2}" height="${(base - wallTop) * 0.2}" fill="${band}" ${ink(1.2)}/>` +
    `<path d="M${cx - w * 0.1} ${base} V${base - (base - wallTop) * 0.6} H${cx + w * 0.1} V${base} Z" fill="#7a2a20" ${ink(1.4)}/>`
  );
};

const nomadCamp = asset(
  'nomad-camp',
  'Nomadic camp',
  CAT,
  ['nomad', 'camp', 'yurt', 'ger', 'steppe', 'tribe'],
  128,
  96,
  shadow(64, 88, 58, 5) +
    yurt(34, 60, 30, 30) +
    yurt(92, 64, 34, 34, '#2f5d9a') +
    yurt(58, 86, 34, 32) +
    // campfire
    `<path d="M96 88 l10 -4 M98 84 l8 4" stroke="${C.woodDark}" stroke-width="3" stroke-linecap="round"/>` +
    `<path d="M97 84 Q100 72 102 78 Q104 70 106 82 Q103 86 97 84 Z" fill="#ff9a2a" ${ink(1.4)}/>` +
    `<path d="M102 70 q-4 -6 1 -10 q4 -4 0 -8" fill="none" stroke="#a9a49c" stroke-width="2" stroke-linecap="round"/>` +
    flag(14, 88, 26, C.banner),
);

/** Tug banner: pole, horse-tail tassel, trident finial. */
const tug = (x: number, base: number, h: number, tail = '#f2ece0') => {
  const top = base - h;
  return (
    `<line x1="${x}" y1="${base}" x2="${x}" y2="${top}" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>` +
    `<line x1="${x}" y1="${base}" x2="${x}" y2="${top}" stroke="${C.wood}" stroke-width="1.4" stroke-linecap="round"/>` +
    `<path d="M${x - 5} ${top + 2} V${top - 4} M${x} ${top + 2} V${top - 7} M${x + 5} ${top + 2} V${top - 4} M${x - 5} ${top + 2} H${x + 5}" fill="none" stroke="${C.gold}" stroke-width="2" stroke-linecap="round"/>` +
    `<path d="M${x - 4} ${top + 4} C${x - 7} ${top + 14} ${x - 4} ${top + 22} ${x - 2} ${top + 26} L${x + 2} ${top + 26} C${x + 4} ${top + 22} ${x + 7} ${top + 14} ${x + 4} ${top + 4} Z" fill="${tail}" ${ink(1.6)}/>` +
    `<circle cx="${x}" cy="${top + 4}" r="2.6" fill="${C.banner}" ${ink(1.2)}/>`
  );
};

const khagan = asset(
  'khagan-orda',
  "Khagan's headquarters",
  CAT,
  ['khagan', 'khan', 'orda', 'horde', 'steppe', 'capital', 'yurt'],
  128,
  112,
  shadow(64, 104, 58, 6) +
    yurt(22, 74, 24, 24) +
    yurt(106, 74, 24, 24, '#2f5d9a') +
    // great golden yurt
    `<path d="M30 100 L32 66 L96 66 L98 100 Z" fill="#fbf3dc"/>` +
    `<rect x="70" y="66" width="28" height="34" fill="${INK}" opacity=".1"/>` +
    `<path d="M30 100 L32 66 L96 66 L98 100 Z" fill="none" ${ink()}/>` +
    `<rect x="32" y="74" width="64" height="8" fill="${C.banner}" ${ink(1.6)}/>` +
    Array.from({ length: 8 }, (_, i) => `<path d="M${35 + i * 8} 78 l3 -3 l3 3 l-3 3 Z" fill="${C.gold}"/>`).join('') +
    `<path d="M28 66 Q40 30 64 28 Q88 30 100 66 Z" fill="#fbf3dc"/>` +
    `<path d="M64 28 Q88 30 100 66 L64 66 Z" fill="${C.feltShade}" opacity=".8"/>` +
    `<path d="M28 66 Q40 30 64 28 Q88 30 100 66 Z" fill="none" ${ink()}/>` +
    `<path d="M40 52 Q64 44 88 52" fill="none" stroke="${C.gold}" stroke-width="3"/>` +
    dome(64, 30, 7, C.gold, C.goldDark) +
    `<path d="M56 100 V84 Q64 78 72 84 V100 Z" fill="#8f2a20" ${ink(1.8)}/>` +
    `<path d="M58 84 Q64 80 70 84" fill="none" stroke="${C.gold}" stroke-width="1.6"/>` +
    tug(10, 104, 58) +
    tug(118, 104, 58, '#2a2420'),
);

const hut = (cx: number, base: number, w: number, h: number, fill = C.straw, dark = C.strawDark) =>
  `<path d="M${cx - w / 2} ${base} L${cx} ${base - h} L${cx + w / 2} ${base} Z" fill="${fill}"/>` +
  `<path d="M${cx} ${base - h} L${cx + w / 2} ${base} L${cx + w * 0.05} ${base} Z" fill="${dark}" opacity=".6"/>` +
  [0.3, 0.55, 0.8].map((t) => `<path d="M${cx - (w / 2) * t} ${base - h * (1 - t)} L${cx + (w / 2) * t} ${base - h * (1 - t)}" stroke="${INK}" stroke-opacity=".3" stroke-width="1.2"/>`).join('') +
  `<path d="M${cx - w / 2} ${base} L${cx} ${base - h} L${cx + w / 2} ${base} Z" fill="none" ${ink(2)}/>` +
  `<path d="M${cx - 3} ${base - h - 2} L${cx + 4} ${base - h - 8} M${cx + 3} ${base - h - 2} L${cx - 4} ${base - h - 8}" ${ink(1.8)}/>` +
  `<path d="M${cx - w * 0.12} ${base} Q${cx} ${base - h * 0.4} ${cx + w * 0.12} ${base} Z" fill="#2a2119"/>`;

const palisade = (x0: number, x1: number, base: number, h: number) => {
  let s = '';
  for (let x = x0; x < x1; x += 6) {
    s += `<path d="M${x} ${base} V${base - h + 3} L${x + 2.5} ${base - h} L${x + 5} ${base - h + 3} V${base} Z" fill="${C.wood}" ${ink(1.4)}/>`;
  }
  return s;
};

const tribal = asset(
  'tribal-settlement',
  'Tribal settlement',
  CAT,
  ['tribe', 'tribal', 'huts', 'village', 'clan'],
  128,
  96,
  shadow(64, 88, 58, 5) +
    hut(30, 62, 28, 30) +
    hut(66, 58, 32, 36, '#b98c5a', '#7d5a34') +
    hut(100, 62, 26, 28) +
    // totem
    `<rect x="84" y="36" width="9" height="34" fill="#a5643a" ${ink(2)}/>` +
    `<path d="M80 40 H97 M84 48 h9 M84 58 h9" ${ink(1.6)}/>` +
    `<circle cx="86.5" cy="44" r="1.3" fill="${INK}"/><circle cx="90.5" cy="44" r="1.3" fill="${INK}"/>` +
    `<path d="M86 53 h5 M86 63 l2.5 2 l2.5 -2" ${ink(1.4)}/>` +
    `<path d="M78 36 L88.5 28 L99 36 Z" fill="#c9443a" ${ink(1.8)}/>` +
    palisade(6, 122, 88, 18),
);

const council = asset(
  'republic-council',
  'Republican council hall',
  CAT,
  ['republic', 'council', 'senate', 'forum', 'government'],
  128,
  112,
  shadow(64, 104, 58, 6) +
    // steps
    `<path d="M14 98 H114 L120 106 H8 Z" fill="${C.stone}" ${ink(2)}/>` +
    `<path d="M18 92 H110 L114 98 H14 Z" fill="${C.stoneMid}" ${ink(2)}/>` +
    // cella
    box(22, 48, 84, 44, '#efe6d2', 0.2) +
    // columns
    Array.from({ length: 7 }, (_, i) => {
      const x = 24 + i * 13.4;
      return (
        `<rect x="${x}" y="50" width="7" height="42" fill="#fbf6ea" ${ink(1.6)}/>` +
        `<line x1="${x + 2.3}" y1="53" x2="${x + 2.3}" y2="90" stroke="${INK}" stroke-opacity=".2"/>` +
        `<line x1="${x + 4.7}" y1="53" x2="${x + 4.7}" y2="90" stroke="${INK}" stroke-opacity=".2"/>` +
        `<rect x="${x - 1.5}" y="48" width="10" height="3.5" fill="#fbf6ea" ${ink(1.4)}/>`
      );
    }).join('') +
    // entablature & pediment
    `<rect x="16" y="40" width="96" height="9" fill="#efe6d2" ${ink(2)}/>` +
    `<path d="M12 40 L64 16 L116 40 Z" fill="#efe6d2" ${ink(2)}/>` +
    `<path d="M64 16 L116 40 L64 40 Z" fill="${INK}" opacity=".08"/>` +
    // laurel emblem
    `<circle cx="64" cy="31" r="5" fill="${C.gold}" ${ink(1.4)}/>` +
    `<path d="M54 34 q2 -6 8 -8 M74 34 q-2 -6 -8 -8" fill="none" stroke="${C.leaf}" stroke-width="2.4" stroke-linecap="round"/>` +
    `<path d="M24 44 H104" stroke="${INK}" stroke-opacity=".35"/>`,
);

const logTower = (cx: number, base: number, w: number, h: number) =>
  box(cx - w / 2, base - h, w, h, C.wood) +
  Array.from({ length: Math.floor(h / 6) }, (_, i) => `<line x1="${cx - w / 2 + 1}" y1="${base - h + 6 + i * 6}" x2="${cx + w / 2 - 1}" y2="${base - h + 6 + i * 6}" stroke="${INK}" stroke-opacity=".3"/>`).join('') +
  `<rect x="${cx - w / 2 - 3}" y="${base - h - 6}" width="${w + 6}" height="6" fill="${C.wood}" ${ink(1.8)}/>` +
  gable(cx - w / 2 - 3, base - h - 6, w + 6, 10, C.woodDark, '#3a2412', 1.5);

const frontierFort = asset(
  'frontier-fort',
  'Frontier fort',
  CAT,
  ['fort', 'frontier', 'outpost', 'palisade', 'border'],
  128,
  112,
  shadow(64, 104, 58, 6) +
    palisade(14, 114, 72, 18) +
    house(44, 72, 22, 16, C.woodDark, '#3a2412', C.wood) +
    palisade(8, 120, 100, 30) +
    `<path d="M54 100 V82 H74 V100 Z" fill="#3a2412" ${ink(2)}/>` +
    `<path d="M64 82 V100" ${ink(1.4)}/>` +
    logTower(14, 100, 16, 40) +
    logTower(114, 100, 16, 40) +
    flag(64, 54, 22, C.banner),
);

const crate = (x: number, y: number, s: number) =>
  `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="#b98a52" ${ink(1.6)}/><path d="M${x} ${y} L${x + s} ${y + s} M${x + s} ${y} L${x} ${y + s}" stroke="${INK}" stroke-opacity=".4"/>`;
const barrel = (x: number, y: number) =>
  `<rect x="${x}" y="${y}" width="10" height="13" rx="3" fill="${C.wood}" ${ink(1.6)}/><path d="M${x} ${y + 4} h10 M${x} ${y + 9} h10" stroke="${INK}" stroke-opacity=".5"/>`;

const tradePost = asset(
  'trade-post',
  'Trade post',
  CAT,
  ['trade', 'market', 'merchant', 'caravan', 'post'],
  128,
  112,
  shadow(64, 104, 58, 6) +
    box(20, 52, 64, 46, C.plaster) +
    gable(20, 52, 64, 20, C.roofRed, C.roofRedDark) +
    `<rect x="34" y="66" width="12" height="32" fill="${C.woodDark}" ${ink(1.8)}/>` +
    `<rect x="56" y="66" width="16" height="12" fill="#3d4c66" ${ink(1.6)}/>` +
    // striped awning
    `<path d="M50 62 H90 L96 74 H44 Z" fill="#f3ead6" ${ink(2)}/>` +
    [0, 1, 2, 3].map((i) => `<path d="M${52 + i * 10} 62 h5 l3 12 h-5 Z" fill="${C.banner}"/>`).join('') +
    `<path d="M50 62 H90 L96 74 H44 Z" fill="none" ${ink(2)}/>` +
    // hanging sign with scales
    `<line x1="84" y1="40" x2="104" y2="40" ${ink(2.4)}/><line x1="84" y1="40" x2="84" y2="52" ${ink(2)}/>` +
    `<rect x="94" y="42" width="16" height="12" fill="${C.wood}" ${ink(1.8)}/>` +
    `<path d="M102 44 V52 M97 46 H107 M97 46 l-2 4 h4 Z M107 46 l-2 4 h4 Z" fill="${C.gold}" stroke="${C.gold}" stroke-width="1.2"/>` +
    crate(88, 86, 12) +
    crate(100, 90, 9) +
    crate(92, 76, 9) +
    barrel(8, 86) +
    `<path d="M108 100 q-2 -10 6 -10 q8 0 6 10 Z" fill="#d9c08a" ${ink(1.6)}/>`,
);

const borderMarker = asset(
  'border-marker',
  'Border marker',
  CAT,
  ['border', 'boundary', 'marker', 'stone', 'frontier'],
  96,
  128,
  shadow(48, 118, 28, 5) +
    `<path d="M26 116 L30 104 H66 L70 116 Z" fill="${C.stoneMid}" ${ink(2)}/>` +
    `<path d="M34 104 L38 30 L48 20 L58 30 L62 104 Z" fill="${C.stone}"/>` +
    `<path d="M48 20 L58 30 L62 104 L50 104 Z" fill="${INK}" opacity=".14"/>` +
    `<path d="M34 104 L38 30 L48 20 L58 30 L62 104 Z" fill="none" ${ink()}/>` +
    `<rect x="36" y="52" width="24" height="10" fill="${C.banner}" ${ink(1.6)}/>` +
    `<rect x="36" y="62" width="24" height="10" fill="${C.bannerBlue}" ${ink(1.6)}/>` +
    `<path d="M42 40 l3 -6 l3 4 l3 -4 l3 6 Z" fill="${C.gold}" ${ink(1.2)}/>` +
    `<path d="M44 84 h8 M42 90 h12 M45 96 h6" stroke="${INK}" stroke-opacity=".45" stroke-width="1.4"/>` +
    flag(18, 116, 34, C.banner) +
    flag(78, 116, 34, C.bannerBlue, -1) +
    rock(14, 116, 4) +
    rock(84, 116, 4),
);

export const POLITICAL: StarterAsset[] = [palace, nomadCamp, khagan, tribal, council, frontierFort, tradePost, borderMarker];
