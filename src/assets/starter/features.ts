import { arch, asset, box, C, glowDef, INK, ink, pine, rock, shadow, sparkle, tree, waves, type StarterAsset } from './kit';

const CAT = 'World features';

const bridge = asset(
  'bridge',
  'Stone bridge',
  CAT,
  ['bridge', 'river', 'crossing', 'road'],
  128,
  80,
  `<path d="M2 58 Q64 50 126 58 V76 H2 Z" fill="${C.water}" ${ink(2)}/>` +
    `<path d="M20 68 q4 -3 8 0 M60 70 q4 -3 8 0 M98 68 q4 -3 8 0" fill="none" stroke="${C.waterLight}" stroke-width="1.8" stroke-linecap="round"/>` +
    `<path d="M6 60 L14 34 H114 L122 60 H104 Q98 44 84 44 Q72 44 70 60 H58 Q56 44 44 44 Q30 44 24 60 Z" fill="${C.stone}"/>` +
    `<path d="M84 44 Q98 44 104 60 H122 L114 34 H96 Z" fill="${INK}" opacity=".12"/>` +
    `<path d="M6 60 L14 34 H114 L122 60 H104 Q98 44 84 44 Q72 44 70 60 H58 Q56 44 44 44 Q30 44 24 60 Z" fill="none" ${ink()}/>` +
    `<rect x="10" y="28" width="108" height="7" fill="${C.stoneMid}" ${ink(2)}/>` +
    Array.from({ length: 9 }, (_, i) => `<line x1="${18 + i * 12}" y1="35" x2="${18 + i * 12}" y2="${i % 3 === 0 ? 58 : 40}" stroke="${INK}" stroke-opacity=".25"/>`).join(''),
);

const signpost = asset(
  'signpost',
  'Road signpost',
  CAT,
  ['road', 'sign', 'signpost', 'crossroads', 'milestone'],
  96,
  128,
  shadow(48, 118, 22, 4) +
    `<path d="M24 118 Q48 108 72 118 Z" fill="${C.leafLight}" ${ink(1.8)}/>` +
    `<rect x="44" y="24" width="8" height="94" fill="${C.wood}" ${ink(2)}/>` +
    `<path d="M50 30 H82 L90 38 L82 46 H50 Z" fill="#c99a5f" ${ink(2)}/>` +
    `<path d="M46 52 H14 L6 60 L14 68 H46 Z" fill="#c99a5f" ${ink(2)}/>` +
    `<path d="M50 74 H76 L83 81 L76 88 H50 Z" fill="#c99a5f" ${ink(2)}/>` +
    `<path d="M58 38 h18 M16 60 h22 M58 81 h14" stroke="${INK}" stroke-opacity=".6" stroke-width="1.6"/>` +
    `<path d="M42 24 L48 16 L54 24 Z" fill="${C.woodDark}" ${ink(1.6)}/>`,
);

const forest = asset(
  'forest',
  'Forest',
  CAT,
  ['forest', 'woods', 'trees', 'woodland'],
  128,
  96,
  shadow(64, 90, 58, 5) +
    tree(36, 60, 11, C.leaf, C.leafDark) +
    tree(64, 54, 13, '#6c9a46', C.leafDark) +
    tree(94, 60, 11, C.leaf, C.leafDark) +
    tree(18, 84, 10, '#6c9a46', C.leafDark) +
    tree(48, 88, 12, C.leaf, C.leafDark) +
    tree(80, 88, 12, '#6c9a46', C.leafDark) +
    tree(110, 84, 10, C.leaf, C.leafDark),
);

const pineForest = asset(
  'forest-pine',
  'Pine forest',
  CAT,
  ['forest', 'pine', 'conifer', 'taiga', 'trees'],
  128,
  96,
  shadow(64, 90, 58, 5) +
    [
      [30, 60, 10],
      [56, 54, 12],
      [84, 58, 11],
      [106, 62, 9],
      [16, 86, 10],
      [42, 90, 12],
      [70, 90, 12],
      [98, 88, 11],
      [118, 88, 8],
    ]
      .map(([x, y, s]) => pine(x, y, s))
      .join(''),
);

const lake = asset(
  'lake',
  'Lake',
  CAT,
  ['lake', 'water', 'pond', 'loch'],
  128,
  80,
  `<path d="M14 42 C12 24 40 12 66 14 C96 16 120 26 116 46 C112 64 84 70 58 68 C32 66 16 60 14 42 Z" fill="#cbb98a" ${ink(2)}/>` +
    `<path d="M20 42 C19 28 42 18 66 20 C92 22 112 30 109 45 C106 60 82 64 58 62 C35 60 21 55 20 42 Z" fill="${C.water}"/>` +
    `<path d="M66 20 C92 22 112 30 109 45 C106 60 82 64 58 62 C80 56 96 46 90 34 C86 26 76 22 66 20 Z" fill="${C.waterDark}" opacity=".35"/>` +
    `<path d="M20 42 C19 28 42 18 66 20 C92 22 112 30 109 45 C106 60 82 64 58 62 C35 60 21 55 20 42 Z" fill="none" ${ink(1.6)}/>` +
    `<path d="M40 36 q5 -3 10 0 M62 46 q5 -3 10 0 M78 32 q5 -3 10 0" fill="none" stroke="${C.waterLight}" stroke-width="2" stroke-linecap="round"/>` +
    // reeds
    `<path d="M22 58 v-12 M26 60 v-14 M30 58 v-10 M100 56 v-12 M104 54 v-10" stroke="${C.leafDark}" stroke-width="2" stroke-linecap="round"/>` +
    `<ellipse cx="26" cy="45" rx="1.6" ry="3.4" fill="#7a4f2a"/><ellipse cx="100" cy="43" rx="1.6" ry="3.4" fill="#7a4f2a"/>`,
);

const pagodaRoof = (cx: number, y: number, w: number, h: number) =>
  `<path d="M${cx - w / 2 - 6} ${y + 2} Q${cx - w / 2} ${y} ${cx - w / 2 + 6} ${y - h * 0.4} L${cx} ${y - h} L${cx + w / 2 - 6} ${y - h * 0.4} Q${cx + w / 2} ${y} ${cx + w / 2 + 6} ${y + 2} Q${cx} ${y - 2} ${cx - w / 2 - 6} ${y + 2} Z" fill="#a8362a"/>` +
  `<path d="M${cx} ${y - h} L${cx + w / 2 - 6} ${y - h * 0.4} Q${cx + w / 2} ${y} ${cx + w / 2 + 6} ${y + 2} Q${cx + w / 4} ${y - 1} ${cx} ${y - 1} Z" fill="#6d1f17" opacity=".55"/>` +
  `<path d="M${cx - w / 2 - 6} ${y + 2} Q${cx - w / 2} ${y} ${cx - w / 2 + 6} ${y - h * 0.4} L${cx} ${y - h} L${cx + w / 2 - 6} ${y - h * 0.4} Q${cx + w / 2} ${y} ${cx + w / 2 + 6} ${y + 2} Q${cx} ${y - 2} ${cx - w / 2 - 6} ${y + 2} Z" fill="none" ${ink(2)}/>` +
  `<path d="M${cx - w / 2 - 4} ${y + 1} Q${cx} ${y - 3} ${cx + w / 2 + 4} ${y + 1}" fill="none" stroke="${C.gold}" stroke-width="1.6"/>`;

const temple = asset(
  'temple',
  'Temple',
  CAT,
  ['temple', 'shrine', 'pagoda', 'monastery', 'holy'],
  112,
  128,
  shadow(56, 120, 48, 5) +
    `<path d="M12 120 H100 L94 110 H18 Z" fill="${C.stone}" ${ink(2)}/>` +
    box(30, 88, 52, 22, '#f2e3c4') +
    `<rect x="48" y="94" width="16" height="16" fill="#8f2a20" ${ink(1.6)}/>` +
    pagodaRoof(56, 88, 64, 16) +
    box(36, 66, 40, 16, '#f2e3c4') +
    pagodaRoof(56, 66, 52, 14) +
    box(42, 46, 28, 14, '#f2e3c4') +
    pagodaRoof(56, 46, 40, 12) +
    `<line x1="56" y1="34" x2="56" y2="12" ${ink(2.4)}/>` +
    [16, 20, 24, 28].map((y) => `<ellipse cx="56" cy="${y}" rx="${5 - (y - 16) / 8}" ry="1.4" fill="${C.gold}" ${ink(1)}/>`).join(''),
);

const stone = (x: number, base: number, w: number, h: number, lean = 0) =>
  `<path d="M${x} ${base} L${x + lean} ${base - h} L${x + w + lean} ${base - h - 1} L${x + w} ${base} Z" fill="#b7ad9b"/>` +
  `<path d="M${x + w * 0.6 + lean} ${base - h} L${x + w + lean} ${base - h - 1} L${x + w} ${base} L${x + w * 0.6} ${base} Z" fill="${INK}" opacity=".18"/>` +
  `<path d="M${x} ${base} L${x + lean} ${base - h} L${x + w + lean} ${base - h - 1} L${x + w} ${base} Z" fill="none" ${ink(2)}/>`;

const standingStones = asset(
  'monument-stones',
  'Standing stones',
  CAT,
  ['monument', 'ancient', 'stones', 'henge', 'druid', 'ritual'],
  128,
  96,
  `<ellipse cx="64" cy="76" rx="58" ry="14" fill="${C.leafLight}" ${ink(1.8)}/>` +
    stone(26, 66, 9, 22) +
    stone(48, 62, 9, 26) +
    stone(72, 62, 9, 26) +
    stone(94, 66, 9, 22) +
    `<rect x="44" y="30" width="40" height="8" fill="#b7ad9b" ${ink(2)}/>` +
    stone(14, 82, 11, 26, -1) +
    stone(40, 88, 11, 30) +
    stone(78, 88, 11, 30) +
    stone(104, 82, 11, 26, 1) +
    `<rect x="36" y="52" width="56" height="9" fill="#c4baa8" ${ink(2)}/>` +
    `<path d="M60 80 l4 -6 l4 6" fill="none" stroke="#7fd0ff" stroke-width="2" stroke-linecap="round" opacity=".8"/>`,
);

const obelisk = asset(
  'monument-obelisk',
  'Ancient obelisk',
  CAT,
  ['monument', 'obelisk', 'ancient', 'pillar', 'wonder'],
  96,
  128,
  shadow(48, 120, 34, 5) +
    `<path d="M14 120 H82 L76 110 H20 Z" fill="${C.stoneMid}" ${ink(2)}/>` +
    `<path d="M22 110 H74 L70 102 H26 Z" fill="${C.stone}" ${ink(2)}/>` +
    `<path d="M38 102 L42 26 L48 16 L54 26 L58 102 Z" fill="#e6d3a5"/>` +
    `<path d="M48 16 L54 26 L58 102 L49 102 Z" fill="${INK}" opacity=".15"/>` +
    `<path d="M42 26 L48 16 L54 26 Z" fill="${C.gold}"/>` +
    `<path d="M38 102 L42 26 L48 16 L54 26 L58 102 Z" fill="none" ${ink()}/>` +
    `<path d="M45 36 h6 M46 44 l2 3 l2 -3 M44 54 h8 M46 62 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 M45 72 l3 -4 l3 4 M44 82 h8 M46 90 v5 M50 90 v5" fill="none" stroke="${INK}" stroke-opacity=".55" stroke-width="1.4"/>` +
    sparkle(48, 12, 4),
);

const cave = asset(
  'cave',
  'Cave',
  CAT,
  ['cave', 'cavern', 'lair', 'grotto', 'underground'],
  128,
  96,
  shadow(64, 90, 58, 5) +
    `<path d="M6 88 L18 54 L40 34 L66 28 L92 36 L112 56 L122 88 Z" fill="${C.rock}"/>` +
    `<path d="M92 36 L112 56 L122 88 L90 88 Q96 62 84 46 Z" fill="${C.rockDark}" opacity=".55"/>` +
    `<path d="M24 60 l10 4 M100 60 l8 10 M58 36 l6 6" ${ink(1.5)} opacity=".6"/>` +
    `<path d="M6 88 L18 54 L40 34 L66 28 L92 36 L112 56 L122 88 Z" fill="none" ${ink()}/>` +
    `<path d="M40 88 Q38 56 62 52 Q88 54 86 88 Z" fill="#1c1611" ${ink(2.2)}/>` +
    `<path d="M50 56 l3 8 l3 -9 M62 53 l2 10 l3 -10 M74 55 l2 7 l2 -6" fill="#8c8170" ${ink(1.2)}/>` +
    `<circle cx="56" cy="74" r="1.6" fill="#ffd34d"/><circle cx="62" cy="74" r="1.6" fill="#ffd34d"/>` +
    rock(24, 86, 6) +
    rock(104, 86, 6),
);

const harbor = asset(
  'harbor',
  'Harbor',
  CAT,
  ['harbor', 'harbour', 'docks', 'pier', 'port', 'coast'],
  128,
  96,
  waves(2, 52, 124, 40, C.water) +
    `<path d="M2 50 H58 V60 H2 Z" fill="${C.stoneMid}" ${ink(2)}/>` +
    `<rect x="40" y="48" width="70" height="7" fill="${C.wood}" ${ink(2)}/>` +
    Array.from({ length: 6 }, (_, i) => `<line x1="${46 + i * 12}" y1="55" x2="${46 + i * 12}" y2="66" ${ink(2)}/>`).join('') +
    // crane
    `<path d="M16 50 V18 L46 22" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>` +
    `<path d="M16 50 V18 L46 22" fill="none" stroke="${C.wood}" stroke-width="2.6" stroke-linecap="round"/>` +
    `<line x1="42" y1="22" x2="42" y2="36" ${ink(1.4)}/><rect x="37" y="36" width="10" height="8" fill="#b98a52" ${ink(1.6)}/>` +
    `<path d="M16 26 L30 20" ${ink(1.6)}/>` +
    `<rect x="20" y="40" width="10" height="10" fill="#b98a52" ${ink(1.6)}/>` +
    // boats
    `<path d="M70 70 Q84 78 100 70 L97 66 H73 Z" fill="${C.wood}" ${ink(2)}/>` +
    `<line x1="85" y1="66" x2="85" y2="44" ${ink(1.8)}/><path d="M85 46 L96 62 H85 Z" fill="${C.felt}" ${ink(1.6)}/>` +
    `<path d="M14 80 Q24 86 36 80 L34 76 H16 Z" fill="${C.woodDark}" ${ink(1.8)}/>`,
);

const ship = asset(
  'ship',
  'Sailing ship',
  CAT,
  ['ship', 'galleon', 'sail', 'navy', 'sea', 'boat'],
  128,
  112,
  waves(4, 88, 120, 20, C.water) +
    `<path d="M18 80 L26 98 Q64 104 102 98 L114 78 L96 84 H34 Z" fill="${C.wood}"/>` +
    `<path d="M24 88 H106" stroke="${C.gold}" stroke-width="2"/>` +
    `<path d="M18 80 L26 98 Q64 104 102 98 L114 78 L96 84 H34 Z" fill="none" ${ink()}/>` +
    `<path d="M96 84 L114 78 L112 70 L98 74 Z" fill="${C.woodDark}" ${ink(1.8)}/>` +
    [40, 64, 88].map((x) => `<line x1="${x}" y1="84" x2="${x}" y2="${x === 64 ? 10 : 22}" ${ink(2.4)}/>`).join('') +
    // sails
    [
      [40, 26, 18],
      [64, 14, 22],
      [88, 26, 18],
    ]
      .map(
        ([x, y, w]) =>
          `<path d="M${x - w / 2} ${y} Q${x} ${y - 3} ${x + w / 2} ${y} Q${x + w / 2 + 3} ${y + 14} ${x + w / 2} ${y + 26} Q${x} ${y + 23} ${x - w / 2} ${y + 26} Q${x - w / 2 + 3} ${y + 13} ${x - w / 2} ${y} Z" fill="${C.felt}" ${ink(1.8)}/>` +
          `<path d="M${x - w / 2 + 2} ${y + 34} Q${x} ${y + 31} ${x + w / 2 - 2} ${y + 34} Q${x + w / 2} ${y + 42} ${x + w / 2 - 2} ${y + 50} Q${x} ${y + 48} ${x - w / 2 + 2} ${y + 50} Q${x - w / 2 + 4} ${y + 42} ${x - w / 2 + 2} ${y + 34} Z" fill="${C.felt}" ${ink(1.8)}/>`,
      )
      .join('') +
    `<path d="M64 10 l12 3 l-12 4 Z" fill="${C.banner}" ${ink(1.4)}/>` +
    `<circle cx="64" cy="26" r="4" fill="${C.banner}"/>` +
    `<path d="M114 72 L124 64" ${ink(2)}/>`,
);

const magicTower = asset(
  'magic-tower',
  'Wizard tower',
  CAT,
  ['magic', 'wizard', 'tower', 'arcane', 'mage', 'sorcery'],
  96,
  128,
  `<circle cx="50" cy="20" r="22" fill="url(#mt)"/>` +
    shadow(48, 120, 26, 5) +
    `<path d="M26 120 Q48 110 70 120 Z" fill="${C.rock}" ${ink(1.8)}/>` +
    `<path d="M34 118 C36 96 32 78 38 56 L58 56 C62 78 58 96 62 118 Z" fill="#8b84a8"/>` +
    `<path d="M50 56 L58 56 C62 78 58 96 62 118 L52 118 C54 98 54 76 50 56 Z" fill="#3d3456" opacity=".4"/>` +
    `<path d="M34 118 C36 96 32 78 38 56 L58 56 C62 78 58 96 62 118 Z" fill="none" ${ink()}/>` +
    `<path d="M36 100 C44 96 52 104 60 98 M35 80 C43 76 51 84 59 78" fill="none" stroke="#c9a14a" stroke-width="2"/>` +
    arch(43, 104, 10, 14, '#2a2340') +
    arch(45, 66, 6, 9, '#ffd76a') +
    `<rect x="32" y="50" width="32" height="7" fill="#8b84a8" ${ink(2)}/>` +
    `<path d="M30 51 Q44 46 48 14 Q54 30 66 51 Z" fill="#5b3f9a"/>` +
    `<path d="M48 14 Q54 30 66 51 L50 51 Q52 34 48 14 Z" fill="#2f2057" opacity=".55"/>` +
    `<path d="M30 51 Q44 46 48 14 Q54 30 66 51 Z" fill="none" ${ink()}/>` +
    `<circle cx="50" cy="10" r="5" fill="#b9f2ff" ${ink(1.8)}/>` +
    sparkle(18, 30, 4, '#e6d4ff') +
    sparkle(78, 40, 3, '#e6d4ff') +
    sparkle(74, 14, 2.4, '#e6d4ff') +
    `<path d="M66 76 q8 -4 6 -12 q-2 -6 4 -10" fill="none" stroke="#b28bff" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="2 3"/>`,
  glowDef('mt', '#9fd8ff'),
);

const danger = asset(
  'danger',
  'Dangerous region',
  CAT,
  ['danger', 'skull', 'warning', 'death', 'cursed', 'hazard'],
  112,
  112,
  `<circle cx="56" cy="58" r="50" fill="url(#dz)"/>` +
    `<path d="M18 92 L28 74 L34 86 L42 66 L50 84 L58 62 L66 84 L74 66 L82 86 L88 74 L96 92 Z" fill="#3a2a2a" ${ink(2)}/>` +
    // crossbones
    `<path d="M24 82 L88 30 M88 82 L24 30" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>` +
    `<path d="M24 82 L88 30 M88 82 L24 30" stroke="#ece4cf" stroke-width="5.5" stroke-linecap="round"/>` +
    [
      [24, 82],
      [88, 30],
      [88, 82],
      [24, 30],
    ]
      .map(([x, y]) => `<circle cx="${x - 3}" cy="${y}" r="4" fill="#ece4cf" ${ink(1.6)}/><circle cx="${x + 3}" cy="${y}" r="4" fill="#ece4cf" ${ink(1.6)}/>`)
      .join('') +
    // skull
    `<path d="M36 50 C36 32 46 24 56 24 C66 24 76 32 76 50 C76 58 72 62 68 64 V72 H44 V64 C40 62 36 58 36 50 Z" fill="#ece4cf" ${ink()}/>` +
    `<path d="M56 24 C66 24 76 32 76 50 C76 58 72 62 68 64 V72 H62 C66 62 70 40 56 24 Z" fill="${INK}" opacity=".12"/>` +
    `<ellipse cx="48" cy="48" rx="5.5" ry="6" fill="#2a1a1a"/><ellipse cx="64" cy="48" rx="5.5" ry="6" fill="#2a1a1a"/>` +
    `<circle cx="48" cy="48" r="1.8" fill="#ff5a3a"/><circle cx="64" cy="48" r="1.8" fill="#ff5a3a"/>` +
    `<path d="M56 54 l-3 6 h6 Z" fill="#2a1a1a"/>` +
    `<path d="M48 66 V72 M52 66 V72 M56 66 V72 M60 66 V72 M64 66 V72" ${ink(1.3)}/>`,
  `<radialGradient id="dz"><stop offset="0" stop-color="#b3261e" stop-opacity=".55"/><stop offset=".7" stop-color="#5a0f0a" stop-opacity=".25"/><stop offset="1" stop-color="#5a0f0a" stop-opacity="0"/></radialGradient>`,
);

const whirlpool = asset(
  'whirlpool',
  'Whirlpool',
  CAT,
  ['whirlpool', 'maelstrom', 'sea', 'danger', 'vortex'],
  112,
  96,
  `<ellipse cx="56" cy="50" rx="52" ry="40" fill="${C.water}" ${ink(2)}/>` +
    `<path d="M56 50 m-6 0 a6 4 0 1 1 12 0 a12 9 0 1 1 -24 0 a18 13 0 1 1 36 0 a26 19 0 1 1 -52 0 a34 25 0 1 1 68 0" fill="none" stroke="${C.waterDark}" stroke-width="4" stroke-linecap="round"/>` +
    `<path d="M56 50 m-6 0 a6 4 0 1 1 12 0 a12 9 0 1 1 -24 0 a18 13 0 1 1 36 0 a26 19 0 1 1 -52 0 a34 25 0 1 1 68 0" fill="none" stroke="${C.waterLight}" stroke-width="1.6" stroke-linecap="round"/>` +
    `<ellipse cx="56" cy="50" rx="4" ry="3" fill="#1e3a50"/>`,
);

const battle = asset(
  'battle-site',
  'Battle site',
  CAT,
  ['battle', 'war', 'swords', 'conflict', 'history'],
  112,
  112,
  shadow(56, 100, 36, 5) +
    [
      ['M24 92 L84 24', 1],
      ['M88 92 L28 24', -1],
    ]
      .map(([d, s]) => {
        const k = s as number;
        return (
          `<path d="${d}" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>` +
          `<path d="${d}" stroke="#d9dde2" stroke-width="5" stroke-linecap="round"/>` +
          `<path d="${k > 0 ? 'M28 72 L44 88' : 'M84 72 L68 88'}" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>` +
          `<path d="${k > 0 ? 'M28 72 L44 88' : 'M84 72 L68 88'}" stroke="${C.gold}" stroke-width="3.6" stroke-linecap="round"/>` +
          `<circle cx="${k > 0 ? 24 : 88}" cy="92" r="5" fill="${C.gold}" ${ink(2)}/>`
        );
      })
      .join('') +
    `<path d="M40 24 L56 8 L72 24 L68 46 L56 54 L44 46 Z" fill="${C.banner}" ${ink(2)}/>` +
    `<path d="M56 8 L72 24 L68 46 L56 54 Z" fill="${INK}" opacity=".18"/>` +
    `<path d="M50 28 L56 22 L62 28 L56 40 Z" fill="${C.gold}" ${ink(1.4)}/>`,
);

export const FEATURES: StarterAsset[] = [
  bridge,
  signpost,
  forest,
  pineForest,
  lake,
  temple,
  standingStones,
  obelisk,
  cave,
  harbor,
  ship,
  magicTower,
  danger,
  whirlpool,
  battle,
];
