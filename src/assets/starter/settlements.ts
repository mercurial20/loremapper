import { asset, box, C, cone, crenels, dome, flag, gable, house, INK, ink, onion, arch, rock, shadow, tower, tree, waves, type StarterAsset } from './kit';

const CAT = 'Settlements';

const portcullis = (x: number, y: number, w: number, h: number) => {
  let s = arch(x, y, w, h, '#2a2119');
  for (let i = 1; i < 4; i++) s += `<line x1="${x + (w * i) / 4}" y1="${y + 3}" x2="${x + (w * i) / 4}" y2="${y + h}" stroke="#7d6a4f" stroke-width="1.2"/>`;
  s += `<line x1="${x + 1}" y1="${y + h * 0.55}" x2="${x + w - 1}" y2="${y + h * 0.55}" stroke="#7d6a4f" stroke-width="1.2"/>`;
  return s;
};

const masonry = (x: number, y: number, w: number, h: number) => {
  let s = '';
  for (let r = 1; r * 7 < h; r++) {
    const yy = y + r * 7;
    s += `<line x1="${x + 2}" y1="${yy}" x2="${x + w - 2}" y2="${yy}" stroke="${INK}" stroke-opacity=".18" stroke-width="1"/>`;
  }
  return s;
};

const capital = asset(
  'city-capital',
  'Medieval capital',
  CAT,
  ['city', 'capital', 'kingdom', 'walls', 'cathedral'],
  128,
  128,
  shadow(64, 116, 58, 7) +
    // back houses
    house(14, 92, 14, 16, C.roofRed, C.roofRedDark) +
    house(98, 92, 14, 18, C.roofRed, C.roofRedDark) +
    house(26, 92, 12, 22, C.terracotta, C.terracottaDark) +
    // cathedral
    box(40, 62, 26, 30, C.stone) +
    gable(40, 62, 26, 13, C.roofBlue, C.roofBlueDark) +
    `<circle cx="53" cy="74" r="4" fill="${C.gold}" ${ink(1.6)}/>` +
    tower(40, 92, 12, 48, { roof: C.roofBlue, roofDark: C.roofBlueDark, roofH: 24, windows: 2 }) +
    // keep
    tower(84, 92, 20, 48, { battlements: true, windows: 2 }) +
    tower(92, 46, 8, 10, { roof: C.roofRed, roofDark: C.roofRedDark, roofH: 12, windows: 0 }) +
    flag(92, 22, 12, C.banner) +
    house(66, 92, 12, 14, C.roofRed, C.roofRedDark) +
    // front wall
    box(12, 92, 104, 20, C.stoneMid) +
    masonry(12, 92, 104, 20) +
    crenels(12, 92, 104, 13, C.stoneMid) +
    portcullis(56, 96, 16, 16) +
    tower(14, 112, 16, 34, { roof: C.roofRed, roofDark: C.roofRedDark, roofH: 17 }) +
    tower(114, 112, 16, 34, { roof: C.roofRed, roofDark: C.roofRedDark, roofH: 17 }) +
    tower(49, 112, 10, 26, { battlements: true, windows: 0 }) +
    tower(79, 112, 10, 26, { battlements: true, windows: 0 }) +
    flag(14, 61, 10, C.banner) +
    flag(114, 61, 10, C.banner, -1),
);

const roundTower = (cx: number, base: number, w: number, h: number, fill: string) =>
  box(cx - w / 2, base - h, w, h, fill) +
  `<ellipse cx="${cx}" cy="${base - h}" rx="${w / 2 + 2}" ry="3.5" fill="${fill}" ${ink(2)}/>` +
  crenels(cx - w / 2 - 2, base - h - 1, w + 4, 3, fill, 4) +
  `<rect x="${cx - 1.5}" y="${base - h * 0.65}" width="3" height="7" fill="${INK}"/>`;

const fortified = asset(
  'city-fortified',
  'Fortified city',
  CAT,
  ['city', 'walls', 'bastion', 'stronghold'],
  128,
  128,
  waves(2, 106, 124, 14, C.water) +
    // houses
    house(18, 86, 14, 16, C.slate, C.slateDark, C.stone) +
    house(34, 86, 12, 20, C.slate, C.slateDark, C.stone) +
    house(84, 86, 14, 18, C.slate, C.slateDark, C.stone) +
    house(100, 86, 12, 14, C.slate, C.slateDark, C.stone) +
    // citadel
    box(48, 40, 32, 46, C.stoneMid) +
    masonry(48, 40, 32, 46) +
    crenels(47, 40, 34, 5, C.stoneMid) +
    tower(56, 40, 10, 16, { roof: C.slate, roofDark: C.slateDark, roofH: 14, windows: 0 }) +
    tower(74, 40, 10, 12, { roof: C.slate, roofDark: C.slateDark, roofH: 12, windows: 0 }) +
    arch(59, 54, 10, 12) +
    flag(56, 10, 12, C.bannerBlue) +
    // bastioned wall
    `<path d="M8 110 L8 90 L30 84 L52 90 L76 90 L98 84 L120 90 L120 110 Z" fill="${C.stone}"/>` +
    `<path d="M76 90 L98 84 L120 90 L120 110 L76 110 Z" fill="${INK}" opacity=".13"/>` +
    masonry(8, 88, 112, 22) +
    `<path d="M8 110 L8 90 L30 84 L52 90 L76 90 L98 84 L120 90 L120 110 Z" fill="none" ${ink()}/>` +
    roundTower(10, 110, 14, 30, C.stoneMid) +
    roundTower(118, 110, 14, 30, C.stoneMid) +
    roundTower(30, 104, 12, 26, C.stoneMid) +
    roundTower(98, 104, 12, 26, C.stoneMid) +
    box(55, 82, 18, 28, C.stoneMid) +
    crenels(54, 82, 20, 3, C.stoneMid) +
    portcullis(58, 94, 12, 16),
);

const steppe = asset(
  'city-steppe',
  'Eastern steppe city',
  CAT,
  ['city', 'eastern', 'steppe', 'dome', 'minaret', 'khaganate'],
  128,
  128,
  shadow(64, 116, 58, 7) +
    // great mosque/palace
    box(42, 60, 44, 30, C.mud) +
    dome(64, 60, 17, C.teal, C.tealDark) +
    arch(58, 68, 12, 22, C.tealDark) +
    // minarets
    box(28, 34, 8, 56, C.mud) +
    `<rect x="26" y="46" width="12" height="4" fill="${C.mud}" ${ink(1.8)}/>` +
    onion(32, 34, 6, C.teal, C.tealDark) +
    box(92, 30, 8, 60, C.mud) +
    `<rect x="90" y="44" width="12" height="4" fill="${C.mud}" ${ink(1.8)}/>` +
    onion(96, 30, 6, C.teal, C.tealDark) +
    // flat-roofed houses
    box(10, 72, 16, 18, C.mud) +
    `<rect x="14" y="78" width="4" height="5" fill="${INK}"/>` +
    box(104, 70, 16, 20, C.mud) +
    `<rect x="110" y="76" width="4" height="5" fill="${INK}"/>` +
    // walls with rounded merlons
    box(8, 90, 112, 22, '#e2bf86') +
    Array.from({ length: 14 }, (_, i) => `<path d="M${10 + i * 8} 90 a3.5 3.5 0 0 1 7 0 Z" fill="#e2bf86" ${ink(1.6)}/>`).join('') +
    `<path d="M55 112 V100 Q55 92 64 90 Q73 92 73 100 V112 Z" fill="${C.tealDark}" ${ink(2)}/>` +
    `<path d="M58 112 V101 Q58 95 64 94 Q70 95 70 101 V112 Z" fill="#2a2119"/>` +
    box(4, 82, 12, 30, C.mud) +
    `<ellipse cx="10" cy="82" rx="7" ry="3" fill="${C.mud}" ${ink(2)}/>` +
    box(112, 82, 12, 30, C.mud) +
    `<ellipse cx="118" cy="82" rx="7" ry="3" fill="${C.mud}" ${ink(2)}/>` +
    flag(10, 79, 12, '#2f7d56') +
    flag(118, 79, 12, '#2f7d56', -1),
);

const merchant = asset(
  'city-merchant',
  'Merchant republic',
  CAT,
  ['city', 'republic', 'canal', 'trade', 'campanile'],
  128,
  128,
  waves(2, 100, 124, 20, C.water) +
    // basilica
    box(26, 66, 40, 30, C.plaster) +
    dome(46, 66, 13, C.terracotta, C.terracottaDark) +
    dome(32, 66, 6, C.terracotta, C.terracottaDark) +
    dome(60, 66, 6, C.terracotta, C.terracottaDark) +
    arch(40, 78, 12, 18) +
    // campanile
    box(86, 34, 14, 62, '#c98a5e') +
    `<rect x="86" y="34" width="14" height="12" fill="${C.plaster}" ${ink(2)}/>` +
    arch(89, 36, 3.5, 9) +
    arch(94, 36, 3.5, 9) +
    gable(86, 34, 14, 18, C.teal, C.tealDark, 1.5) +
    flag(93, 14, 10, C.banner) +
    // houses
    house(6, 96, 16, 22, C.terracotta, C.terracottaDark, '#ecc98c') +
    house(68, 96, 14, 18, C.terracotta, C.terracottaDark, '#e7b1a0') +
    house(104, 96, 18, 24, C.terracotta, C.terracottaDark, '#f0dfb0') +
    // quay
    box(2, 96, 124, 6, C.stoneMid) +
    // merchant galley
    `<path d="M14 108 Q30 116 52 108 L48 104 L18 104 Z" fill="${C.wood}" ${ink(2)}/>` +
    `<line x1="33" y1="104" x2="33" y2="82" ${ink(2)}/>` +
    `<path d="M33 84 Q44 90 34 102 Z" fill="${C.felt}" ${ink(1.6)}/>` +
    `<path d="M33 84 L26 84" ${ink(1.6)}/>`,
);

const village = asset(
  'village',
  'Village',
  CAT,
  ['village', 'hamlet', 'town', 'farm'],
  128,
  112,
  shadow(64, 102, 56, 6) +
    tree(108, 84, 8) +
    // chapel
    box(64, 64, 26, 26, C.plaster) +
    gable(64, 64, 26, 14, C.slate, C.slateDark) +
    box(58, 48, 10, 42, C.stone) +
    cone(58, 48, 10, 16, C.slate, C.slateDark, 1.5) +
    `<line x1="63" y1="32" x2="63" y2="24" ${ink(1.8)}/><line x1="60" y1="27" x2="66" y2="27" ${ink(1.8)}/>` +
    arch(74, 76, 6, 14) +
    // cottages
    house(12, 94, 20, 16, C.straw, C.strawDark) +
    house(36, 100, 16, 13, C.straw, C.strawDark) +
    house(92, 98, 18, 14, C.straw, C.strawDark) +
    tree(40, 74, 7) +
    // fence
    `<path d="M8 104 H120" ${ink(1.6)}/>` +
    Array.from({ length: 10 }, (_, i) => `<line x1="${12 + i * 12}" y1="100" x2="${12 + i * 12}" y2="108" ${ink(1.6)}/>`).join(''),
);

const castle = asset(
  'castle',
  'Castle',
  CAT,
  ['castle', 'keep', 'lord', 'stronghold'],
  128,
  128,
  shadow(64, 114, 54, 7) +
    tower(64, 84, 26, 56, { battlements: true, windows: 2 }) +
    flag(64, 22, 14, C.banner) +
    box(22, 80, 84, 30, C.stoneMid) +
    masonry(22, 80, 84, 30) +
    crenels(22, 80, 84, 10, C.stoneMid) +
    portcullis(55, 88, 18, 22) +
    tower(22, 112, 20, 50, { roof: C.roofRed, roofDark: C.roofRedDark, roofH: 22, windows: 2 }) +
    tower(106, 112, 20, 50, { roof: C.roofRed, roofDark: C.roofRedDark, roofH: 22, windows: 2 }) +
    flag(22, 40, 10, C.banner) +
    flag(106, 40, 10, C.banner, -1),
);

const fortress = asset(
  'fortress',
  'Fortress',
  CAT,
  ['fortress', 'citadel', 'stronghold', 'military'],
  128,
  128,
  // crag
  `<path d="M4 120 L16 96 L34 88 L94 86 L114 94 L124 120 Z" fill="${C.rock}"/>` +
    `<path d="M94 86 L114 94 L124 120 L80 120 L86 100 Z" fill="${C.rockDark}" opacity=".6"/>` +
    `<path d="M30 104 l8 6 M60 100 l-6 10 M100 104 l6 8" ${ink(1.5)} opacity=".6"/>` +
    `<path d="M4 120 L16 96 L34 88 L94 86 L114 94 L124 120 Z" fill="none" ${ink()}/>` +
    // inner keep
    box(46, 22, 36, 50, '#a79f8f') +
    masonry(46, 22, 36, 50) +
    crenels(45, 22, 38, 6, '#a79f8f', 5) +
    `<rect x="54" y="32" width="3" height="9" fill="${INK}"/><rect x="71" y="32" width="3" height="9" fill="${INK}"/>` +
    flag(64, 17, 14, '#2a2420') +
    `<circle cx="70" cy="10" r="1.8" fill="${C.banner}"/>` +
    // walls
    box(20, 62, 88, 28, '#b8b0a0') +
    masonry(20, 62, 88, 28) +
    crenels(20, 62, 88, 11, '#b8b0a0', 5) +
    portcullis(56, 70, 16, 20) +
    tower(20, 92, 20, 42, { battlements: true, fill: '#a79f8f', windows: 1 }) +
    tower(108, 92, 20, 42, { battlements: true, fill: '#a79f8f', windows: 1 }),
);

const watchtower = asset(
  'watchtower',
  'Watchtower',
  CAT,
  ['tower', 'watch', 'lookout', 'outpost'],
  96,
  128,
  `<path d="M14 118 Q48 96 82 118 Z" fill="${C.leafLight}" ${ink(2)}/>` +
    `<path d="M36 112 L40 46 L56 46 L60 112 Z" fill="${C.stone}"/>` +
    `<path d="M50 46 L56 46 L60 112 L52 112 Z" fill="${INK}" opacity=".15"/>` +
    masonry(38, 50, 20, 60) +
    `<path d="M36 112 L40 46 L56 46 L60 112 Z" fill="none" ${ink()}/>` +
    arch(44, 96, 8, 16, C.woodDark) +
    `<rect x="46" y="64" width="3.5" height="9" fill="${INK}"/>` +
    box(30, 38, 36, 8, C.wood) +
    `<line x1="34" y1="38" x2="34" y2="24" ${ink(2)}/><line x1="62" y1="38" x2="62" y2="24" ${ink(2)}/>` +
    gable(30, 26, 36, 16, C.roofRed, C.roofRedDark, 3) +
    flag(48, 10, 8, C.banner),
);

const port = asset(
  'port',
  'Port town',
  CAT,
  ['port', 'harbour', 'harbor', 'coast', 'town'],
  128,
  128,
  waves(2, 90, 124, 30, C.water) +
    // pier
    `<rect x="64" y="88" width="60" height="6" fill="${C.wood}" ${ink(2)}/>` +
    Array.from({ length: 5 }, (_, i) => `<line x1="${68 + i * 13}" y1="94" x2="${68 + i * 13}" y2="102" ${ink(2)}/>`).join('') +
    `<rect x="98" y="80" width="8" height="8" fill="${C.wood}" ${ink(1.6)}/><rect x="108" y="82" width="7" height="6" fill="${C.woodDark}" ${ink(1.6)}/>` +
    // town
    house(6, 90, 18, 22, C.roofRed, C.roofRedDark) +
    house(26, 90, 14, 28, C.roofBlue, C.roofBlueDark) +
    // lighthouse
    `<path d="M46 90 L49 44 L59 44 L62 90 Z" fill="${C.plaster}"/>` +
    `<path d="M47.5 72 L60.5 72 L61.3 82 L46.8 82 Z M48.6 52 L59.4 52 L60 62 L48 62 Z" fill="${C.banner}"/>` +
    `<path d="M46 90 L49 44 L59 44 L62 90 Z" fill="none" ${ink()}/>` +
    `<circle cx="54" cy="36" r="10" fill="#ffe7a0" opacity=".5"/>` +
    `<rect x="49" y="34" width="10" height="10" fill="#ffd866" ${ink(2)}/>` +
    gable(48, 34, 12, 8, C.roofRed, C.roofRedDark, 1.5) +
    // ship
    `<path d="M70 104 Q92 118 120 104 L116 98 L74 98 Z" fill="${C.wood}" ${ink(2)}/>` +
    `<line x1="95" y1="98" x2="95" y2="56" ${ink(2.2)}/>` +
    `<path d="M84 60 Q95 56 106 60 L104 80 Q95 76 86 80 Z" fill="${C.felt}" ${ink(1.8)}/>` +
    `<path d="M86 84 Q95 81 104 84 L103 94 Q95 92 87 94 Z" fill="${C.felt}" ${ink(1.8)}/>` +
    flag(95, 56, 6, C.banner),
);

const ruins = asset(
  'ruins',
  'Ruins',
  CAT,
  ['ruins', 'ancient', 'abandoned', 'lost'],
  128,
  112,
  shadow(64, 102, 56, 6) +
    `<path d="M14 100 L14 58 L20 52 L24 62 L30 46 L36 58 L42 54 L44 100 Z" fill="${C.stone}"/>` +
    `<path d="M36 58 L42 54 L44 100 L34 100 Z" fill="${INK}" opacity=".14"/>` +
    masonry(14, 56, 30, 44) +
    `<path d="M14 100 L14 58 L20 52 L24 62 L30 46 L36 58 L42 54 L44 100 Z" fill="none" ${ink()}/>` +
    arch(22, 74, 12, 26, '#3a3026') +
    // broken arch
    `<path d="M54 100 V64 Q54 46 72 44 L74 50 Q62 52 62 66 V100 Z" fill="${C.stoneMid}" ${ink()}/>` +
    `<path d="M84 100 V70 L88 66 L92 72 V100 Z" fill="${C.stoneMid}" ${ink()}/>` +
    // column
    box(100, 54, 10, 46, C.plaster) +
    `<path d="M98 54 L112 54 L110 49 L106 52 L102 47 L100 50 Z" fill="${C.plaster}" ${ink(2)}/>` +
    `<line x1="103" y1="58" x2="103" y2="98" stroke="${INK}" stroke-opacity=".25"/><line x1="107" y1="58" x2="107" y2="98" stroke="${INK}" stroke-opacity=".25"/>` +
    // fallen drum
    `<rect x="70" y="94" width="22" height="9" rx="2" fill="${C.plaster}" ${ink(2)}/><ellipse cx="92" cy="98.5" rx="3" ry="4.5" fill="${C.stoneMid}" ${ink(1.8)}/>` +
    rock(116, 98, 5) +
    rock(8, 100, 4) +
    // ivy
    `<path d="M16 64 q4 6 0 12 q-3 6 2 12" fill="none" stroke="${C.leafDark}" stroke-width="2.4" stroke-linecap="round"/>` +
    `<circle cx="18" cy="66" r="2.6" fill="${C.leaf}"/><circle cx="15" cy="74" r="2.6" fill="${C.leaf}"/><circle cx="19" cy="84" r="2.6" fill="${C.leaf}"/>`,
);

export const SETTLEMENTS: StarterAsset[] = [capital, fortified, steppe, merchant, village, castle, fortress, watchtower, port, ruins];
