import { asset, C, glowDef, INK, ink, shadow, sparkle, waves, type StarterAsset } from './kit';

const mirrorX = (d: string, w = 128) =>
  d.replace(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g, (_, x: string, y: string) => `${w - parseFloat(x)} ${y}`);

// ---------------------------------------------------------------- dragons

const redWing = 'M56 56 Q42 40 30 34 Q18 28 8 22 Q18 38 16 50 Q24 52 26 62 Q34 62 40 72 Q48 68 56 74 Z';
const redBones = 'M30 34 L16 50 M30 34 L26 62 M30 34 L40 72';
const redDragon = asset(
  'dragon-red',
  'Red wyrm',
  'Dragons',
  ['dragon', 'fire', 'red', 'flying'],
  128,
  128,
  shadow(64, 118, 34, 5, 0.15) +
    // wings
    [redWing, mirrorX(redWing)]
      .map(
        (d, i) =>
          `<path d="${d}" fill="#d76d48"/>` +
          `<path d="${d}" fill="#7a2418" opacity="${i ? 0.35 : 0.12}"/>` +
          `<path d="${i ? mirrorX(redBones) : redBones}" fill="none" stroke="#7a2418" stroke-width="2" stroke-linecap="round"/>` +
          `<path d="${d}" fill="none" ${ink()}/>` +
          `<path d="${i ? 'M72 56 Q86 40 98 34 L120 22' : 'M56 56 Q42 40 30 34 L8 22'}" fill="none" ${ink(3.2)}/>`,
      )
      .join('') +
    // tail
    `<path d="M61 96 C60 110 72 118 88 114 C96 112 102 106 106 102 C100 112 92 120 80 121 C66 122 56 112 57 98 Z" fill="#b5402e" ${ink(2.2)}/>` +
    `<path d="M103 99 L116 96 L109 109 Z" fill="#b5402e" ${ink(2)}/>` +
    // hind legs
    `<path d="M57 82 C50 86 46 92 45 98 L50 98 C52 92 56 90 60 88 Z" fill="#9c3424" ${ink(2)}/>` +
    `<path d="M71 82 C78 86 82 92 83 98 L78 98 C76 92 72 90 68 88 Z" fill="#9c3424" ${ink(2)}/>` +
    // body
    `<path d="M64 40 C74 46 76 62 73 76 C71 88 68 96 64 102 C60 96 57 88 55 76 C52 62 54 46 64 40 Z" fill="#b5402e"/>` +
    `<path d="M64 40 C74 46 76 62 73 76 C71 88 68 96 64 102 Z" fill="#7a2418" opacity=".35"/>` +
    `<path d="M64 52 C68 60 68 78 64 92 C60 78 60 60 64 52 Z" fill="#e9bd7d"/>` +
    [58, 64, 70, 76, 82].map((y) => `<path d="M${61.5} ${y} q2.5 1.5 5 0" fill="none" stroke="#b07a45" stroke-width="1.2"/>`).join('') +
    `<path d="M64 40 C74 46 76 62 73 76 C71 88 68 96 64 102 C60 96 57 88 55 76 C52 62 54 46 64 40 Z" fill="none" ${ink()}/>` +
    // arms
    `<path d="M57 52 L48 58 L46 64" fill="none" ${ink(4.5)}/><path d="M57 52 L48 58 L46 64" fill="none" stroke="#9c3424" stroke-width="2.4" stroke-linecap="round"/>` +
    `<path d="M71 52 L80 58 L82 64" fill="none" ${ink(4.5)}/><path d="M71 52 L80 58 L82 64" fill="none" stroke="#9c3424" stroke-width="2.4" stroke-linecap="round"/>` +
    // neck & head
    `<path d="M59 45 C58 37 60 31 61 26 L67 26 C68 31 70 37 69 45 Z" fill="#b5402e" ${ink(2.2)}/>` +
    `<path d="M59 16 L51 6 L61 12 Z M69 16 L77 6 L67 12 Z" fill="${C.stone}" ${ink(1.8)}/>` +
    `<path d="M64 9 C69 11 71 17 70 23 C69 28 66 31 64 31 C62 31 59 28 58 23 C57 17 59 11 64 9 Z" fill="#b5402e" ${ink(2.2)}/>` +
    `<ellipse cx="61.3" cy="18" rx="1.6" ry="2.2" fill="#ffd34d"/><ellipse cx="66.7" cy="18" rx="1.6" ry="2.2" fill="#ffd34d"/>` +
    `<path d="M62 27 L64 29 L66 27" fill="none" stroke="#5a1a10" stroke-width="1.2"/>`,
);

const lungBody = 'M18 102 C28 78 46 112 64 88 C80 66 94 94 104 66 C108 56 106 48 102 44';
const easternDragon = asset(
  'dragon-eastern',
  'Eastern lung dragon',
  'Dragons',
  ['dragon', 'eastern', 'serpent', 'celestial'],
  128,
  128,
  // cloud
  `<path d="M14 58 q0 -10 10 -10 q4 -8 13 -5 q8 -6 14 2 q9 0 9 9 q0 7 -8 7 H22 q-8 0 -8 -3 Z" fill="#fbf7ee" ${ink(2)}/>` +
    `<path d="M26 54 q4 -4 8 0 M40 50 q4 -4 8 0" fill="none" ${ink(1.4)} opacity=".6"/>` +
    // legs
    `<path d="M40 98 l-6 10 l-4 0 M40 98 l-2 11 M78 80 l8 8 l3 -2 M78 80 l4 10" fill="none" ${ink(3.4)}/>` +
    `<path d="M40 98 l-6 10 M78 80 l8 8" fill="none" stroke="#2f7a58" stroke-width="1.8" stroke-linecap="round"/>` +
    // body layers
    `<path d="${lungBody}" fill="none" stroke="${INK}" stroke-width="16" stroke-linecap="round"/>` +
    `<path d="${lungBody}" fill="none" stroke="#3f9a72" stroke-width="11.5" stroke-linecap="round"/>` +
    `<path d="${lungBody}" fill="none" stroke="#e6c36a" stroke-width="4" stroke-linecap="round" transform="translate(1.6 2.2)" opacity=".9"/>` +
    `<path d="${lungBody}" fill="none" stroke="#235c44" stroke-width="11.5" stroke-dasharray="1.6 4.4" opacity=".5"/>` +
    `<path d="${lungBody}" fill="none" stroke="#f0b93b" stroke-width="2.6" stroke-dasharray="3 5" transform="translate(-1.6 -3.4)"/>` +
    // tail tuft
    `<path d="M18 102 l-10 2 l6 -6 l-8 -4 l9 -1 l-2 -8 l8 7 Z" fill="#f0b93b" ${ink(1.8)}/>` +
    // head
    `<path d="M108 40 L120 30 L114 40 L124 40 L112 46 Z" fill="#f0b93b" ${ink(1.8)}/>` +
    `<path d="M104 30 L110 14 L112 22 L118 16 L114 30" fill="none" stroke="#c9a46a" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M106 46 C110 38 108 30 100 28 C94 27 88 29 84 33 L76 35 C77 40 82 43 88 42 C92 46 100 48 106 46 Z" fill="#3f9a72" ${ink(2.2)}/>` +
    `<path d="M76 35 C80 38 86 38 90 36" fill="none" ${ink(1.5)}/>` +
    `<circle cx="96" cy="33" r="2.4" fill="#ffd34d" ${ink(1.2)}/>` +
    `<path d="M78 35 C66 32 58 38 48 34" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>` +
    `<path d="M80 38 C70 46 60 44 54 50" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>` +
    // pearl
    `<circle cx="58" cy="22" r="5" fill="#fff6d8" ${ink(1.8)}/>` +
    sparkle(56, 20, 2.5, '#ffffff'),
);

const frostDragon = asset(
  'dragon-frost',
  'Frost dragon',
  'Dragons',
  ['dragon', 'ice', 'frost', 'snow', 'north'],
  128,
  128,
  // rock with snow
  `<path d="M8 120 L20 96 L42 88 L76 90 L98 84 L118 98 L124 120 Z" fill="${C.rock}"/>` +
    `<path d="M98 84 L118 98 L124 120 L90 120 L96 100 Z" fill="${C.rockDark}" opacity=".55"/>` +
    `<path d="M8 120 L20 96 L42 88 L76 90 L98 84 L118 98 L124 120 Z" fill="none" ${ink()}/>` +
    `<path d="M20 96 L42 88 L76 90 L98 84 L108 91 L92 94 L80 97 L62 95 L44 96 L30 102 Z" fill="${C.snow}" ${ink(1.8)}/>` +
    // folded wing
    `<path d="M70 64 L86 18 L94 30 L104 22 L104 42 L114 42 L98 78 Z" fill="#6f95b5"/>` +
    `<path d="M86 18 L98 78 M104 22 L98 78 M114 42 L98 78" fill="none" stroke="#3f5f7a" stroke-width="1.8"/>` +
    `<path d="M70 64 L86 18 L94 30 L104 22 L104 42 L114 42 L98 78 Z" fill="none" ${ink()}/>` +
    // tail
    `<path d="M88 90 C106 96 116 108 100 114 C88 117 76 112 64 115 C74 108 86 111 96 108 C104 105 100 100 84 98 Z" fill="#9fc3dc" ${ink(2.2)}/>` +
    // body
    `<path d="M44 94 C38 74 50 60 68 60 C84 60 94 72 90 94 Z" fill="#9fc3dc"/>` +
    `<path d="M74 61 C86 63 94 74 90 94 L76 94 C80 82 80 70 74 61 Z" fill="#5f86a6" opacity=".55"/>` +
    `<path d="M50 86 C50 76 54 70 60 68 C58 76 58 84 60 94 L48 94 Z" fill="#e3eef5"/>` +
    `<path d="M44 94 C38 74 50 60 68 60 C84 60 94 72 90 94 Z" fill="none" ${ink()}/>` +
    // neck & head
    `<path d="M53 68 C46 56 42 46 40 34 L50 30 C53 41 58 52 65 62 Z" fill="#9fc3dc" ${ink(2.2)}/>` +
    `<path d="M47 27 L58 14 L52 28 Z M43 26 L48 12 L46 27 Z" fill="${C.snow}" ${ink(1.6)}/>` +
    `<path d="M24 31 L36 24 L48 25 L54 31 L48 38 L35 37 Z" fill="#9fc3dc" ${ink(2.2)}/>` +
    `<circle cx="41" cy="29.5" r="1.8" fill="#e6fbff" ${ink(1)}/>` +
    `<path d="M25 33 L36 34" fill="none" ${ink(1.3)}/>` +
    // frost breath
    `<path d="M22 34 C14 34 10 40 14 44 C18 48 24 42 18 40" fill="none" stroke="#bfe6f5" stroke-width="2.4" stroke-linecap="round"/>` +
    sparkle(10, 30, 3, '#d9f4ff') +
    sparkle(16, 50, 2.4, '#d9f4ff') +
    // front leg
    `<path d="M54 80 L50 96 L60 96 L60 84 Z" fill="#7fa6c4" ${ink(2)}/>` +
    // spikes
    [62, 70, 78].map((x) => `<path d="M${x} ${61 - (x - 62) * 0.05} l3 -6 l3 6 Z" fill="${C.snow}" ${ink(1.4)}/>`).join(''),
);

const hoardBody = 'M100 100 C122 86 116 52 92 48 C68 44 40 50 28 66 C18 80 20 96 32 104';
const blackDragon = asset(
  'dragon-hoard',
  'Dragon on its hoard',
  'Dragons',
  ['dragon', 'black', 'hoard', 'gold', 'lair', 'sleeping'],
  128,
  128,
  shadow(64, 116, 56, 6) +
    // gold pile
    `<path d="M30 106 Q42 72 64 70 Q88 72 100 106 Z" fill="${C.gold}" ${ink(2.2)}/>` +
    `<path d="M64 70 Q88 72 100 106 L78 106 Q76 86 64 70 Z" fill="${C.goldDark}" opacity=".45"/>` +
    [
      [48, 92],
      [58, 84],
      [70, 90],
      [62, 98],
      [80, 98],
      [52, 102],
      [74, 80],
    ]
      .map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="4" ry="2.4" fill="#f7d77a" ${ink(1.2)}/>`)
      .join('') +
    `<path d="M66 74 l4 -6 l4 6 l-4 4 Z" fill="#d13a4a" ${ink(1.4)}/>` +
    `<rect x="40" y="96" width="9" height="6" fill="#8e5c34" ${ink(1.4)}/>` +
    sparkle(58, 78, 3.4) +
    sparkle(82, 88, 2.6) +
    // coiled body
    `<path d="${hoardBody}" fill="none" stroke="${INK}" stroke-width="18" stroke-linecap="round"/>` +
    `<path d="${hoardBody}" fill="none" stroke="#3b3346" stroke-width="13.5" stroke-linecap="round"/>` +
    `<path d="${hoardBody}" fill="none" stroke="#6a5f7c" stroke-width="13.5" stroke-dasharray="1.6 4.4" opacity=".6"/>` +
    // wing
    `<path d="M58 48 L78 18 L86 30 L98 22 L98 46 Z" fill="#2c2635"/>` +
    `<path d="M78 18 L76 46 M98 22 L88 46" fill="none" stroke="#5a5068" stroke-width="1.6"/>` +
    `<path d="M58 48 L78 18 L86 30 L98 22 L98 46 Z" fill="none" ${ink()}/>` +
    // spikes along back
    [
      [40, 54],
      [52, 47],
      [66, 44],
      [104, 52],
      [114, 66],
    ]
      .map(([x, y]) => `<path d="M${x - 3} ${y + 2} L${x} ${y - 6} L${x + 3} ${y + 2} Z" fill="#6a5f7c" ${ink(1.4)}/>`)
      .join('') +
    // tail tip
    `<path d="M100 100 L114 106 L104 110 Z" fill="#3b3346" ${ink(1.8)}/>` +
    // head resting
    `<path d="M22 104 C24 95 34 93 44 97 L60 103 C56 110 44 113 34 113 C26 113 22 110 22 104 Z" fill="#3b3346" ${ink(2.2)}/>` +
    `<path d="M30 97 L20 88 L33 95 Z" fill="${C.stone}" ${ink(1.6)}/>` +
    `<path d="M38 101 q3 2 6 0" fill="none" stroke="#d7c9a6" stroke-width="1.6" stroke-linecap="round"/>` +
    `<path d="M62 100 q6 -4 4 -9 q-2 -4 3 -7" fill="none" stroke="#9aa0a8" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>`,
);

// ---------------------------------------------------------------- monsters

const giant = asset(
  'monster-giant',
  'Hill giant',
  'Monsters',
  ['giant', 'monster', 'hill', 'brute'],
  128,
  128,
  shadow(62, 116, 30, 5) +
    // legs
    `<path d="M50 88 L46 112 L57 112 L59 90 Z M66 90 L68 112 L79 112 L75 88 Z" fill="#c48e66" ${ink(2.2)}/>` +
    `<path d="M44 108 h14 v6 h-15 Z M66 108 h14 v6 h-15 Z" fill="${C.woodDark}" ${ink(1.8)}/>` +
    // kilt
    `<path d="M44 72 L80 72 L85 94 L80 90 L75 95 L70 90 L64 95 L58 90 L52 95 L46 90 L39 94 Z" fill="#8a6a44" ${ink(2.2)}/>` +
    // torso
    `<path d="M44 40 C40 50 40 62 44 74 L80 74 C84 62 84 50 80 40 C72 34 52 34 44 40 Z" fill="#d4a07a"/>` +
    `<path d="M66 37 C74 36 80 38 80 40 C84 50 84 62 80 74 L68 74 C72 60 72 48 66 37 Z" fill="#9a6644" opacity=".45"/>` +
    `<path d="M44 40 C40 50 40 62 44 74 L80 74 C84 62 84 50 80 40 C72 34 52 34 44 40 Z" fill="none" ${ink()}/>` +
    `<path d="M48 40 L76 70" stroke="#6b4a2c" stroke-width="5" stroke-linecap="round"/>` +
    `<rect x="43" y="69" width="38" height="6" fill="#4d3420" ${ink(1.8)}/>` +
    // left arm
    `<path d="M45 42 C36 48 33 62 35 78 L42 78 C42 64 45 55 50 48 Z" fill="#d4a07a" ${ink(2.2)}/>` +
    `<circle cx="38.5" cy="81" r="5" fill="#d4a07a" ${ink(2)}/>` +
    // club arm
    `<path d="M80 42 C88 40 92 34 94 26 L88 23 C86 30 82 34 76 38 Z" fill="#d4a07a" ${ink(2.2)}/>` +
    `<path d="M86 32 L104 5 C110 1 116 8 111 13 L92 35 Z" fill="${C.wood}" ${ink(2.2)}/>` +
    `<circle cx="104" cy="12" r="1.6" fill="${C.woodDark}"/><circle cx="98" cy="20" r="1.4" fill="${C.woodDark}"/>` +
    `<circle cx="90" cy="27" r="5" fill="#d4a07a" ${ink(2)}/>` +
    // head
    `<path d="M52 26 C52 16 58 12 63 12 C69 12 74 16 74 26 C74 34 69 38 63 38 C57 38 52 34 52 26 Z" fill="#d4a07a" ${ink(2.2)}/>` +
    `<path d="M53 28 C55 40 71 40 73 28 C70 36 56 36 53 28 Z" fill="#6b4a2c" ${ink(1.6)}/>` +
    `<path d="M52 22 C54 12 72 10 74 22 C68 16 58 16 52 22 Z" fill="#6b4a2c" ${ink(1.6)}/>` +
    `<circle cx="59" cy="25" r="1.4" fill="${INK}"/><circle cx="67" cy="25" r="1.4" fill="${INK}"/>` +
    `<path d="M56 21 l5 2 M70 21 l-5 2" ${ink(1.5)}/>`,
);

const troll = asset(
  'monster-troll',
  'Troll',
  'Monsters',
  ['troll', 'monster', 'bridge', 'cave'],
  128,
  128,
  shadow(64, 116, 40, 5) +
    // club
    `<path d="M48 106 L18 84 C13 81 10 88 15 91 L44 110 Z" fill="${C.wood}" ${ink(2.2)}/>` +
    `<circle cx="20" cy="86" r="1.6" fill="${C.woodDark}"/>` +
    // legs
    `<path d="M48 96 L44 113 L58 113 L60 98 Z M76 96 L78 113 L92 113 L88 96 Z" fill="#7a8a5e" ${ink(2.2)}/>` +
    // body
    `<path d="M34 100 C26 74 38 44 64 40 C88 37 104 60 100 84 C98 96 92 102 86 104 Z" fill="#8a9a6c"/>` +
    `<path d="M64 40 C88 37 104 60 100 84 C98 96 92 102 86 104 L72 104 C88 88 86 60 64 40 Z" fill="#4e5c3a" opacity=".45"/>` +
    `<path d="M50 70 C58 64 74 66 80 76 C78 90 60 96 50 88 Z" fill="#b4bf8e" opacity=".75"/>` +
    `<path d="M34 100 C26 74 38 44 64 40 C88 37 104 60 100 84 C98 96 92 102 86 104 Z" fill="none" ${ink()}/>` +
    `<path d="M40 96 L86 96 L82 106 L76 100 L70 106 L64 100 L58 106 L52 100 L46 106 Z" fill="#6b4f33" ${ink(2)}/>` +
    // hanging arm
    `<path d="M50 56 C42 72 40 88 42 104 L50 104 C50 90 54 76 60 64 Z" fill="#8a9a6c" ${ink(2.2)}/>` +
    `<circle cx="46" cy="106" r="5.5" fill="#8a9a6c" ${ink(2)}/>` +
    // head
    `<path d="M20 52 C18 40 28 33 38 35 C47 37 50 47 46 55 C40 62 25 62 20 52 Z" fill="#8a9a6c" ${ink(2.2)}/>` +
    `<path d="M24 47 C14 47 12 57 22 57 C26 57 27 52 24 47 Z" fill="#9aab7a" ${ink(2)}/>` +
    `<path d="M28 56 l-1 5 l3 -4 M36 57 l1 5 l2 -5" fill="${C.felt}" ${ink(1.2)}/>` +
    `<circle cx="33" cy="44" r="2" fill="#ffd34d" ${ink(1)}/>` +
    `<path d="M29 40 l8 2" ${ink(1.8)}/>` +
    `<path d="M44 40 l8 -6 l-3 9 Z" fill="#8a9a6c" ${ink(1.8)}/>` +
    `<path d="M30 34 C32 26 40 26 42 32" fill="none" stroke="#3c3326" stroke-width="3" stroke-linecap="round"/>`,
);

const wyvernWingNear = 'M64 66 Q60 44 46 30 L30 12 Q40 26 44 36 Q52 38 54 48 Q62 50 64 58 Q72 58 80 64 Z';
const wyvern = asset(
  'monster-wyvern',
  'Wyvern',
  'Monsters',
  ['wyvern', 'drake', 'flying', 'monster'],
  128,
  128,
  shadow(64, 118, 30, 4, 0.12) +
    // far wing
    `<path d="M78 64 Q86 40 98 26 L114 8 Q108 26 106 36 Q98 40 96 48 Q88 52 88 60 Z" fill="#5d7334" ${ink(2.2)}/>` +
    // tail
    `<path d="M44 72 C30 74 20 82 14 94 C11 100 17 104 21 98 C25 90 33 83 46 79 Z" fill="#6f8a3e" ${ink(2.2)}/>` +
    `<path d="M14 96 L4 106 L16 103 Z" fill="${C.stone}" ${ink(1.8)}/>` +
    // body
    `<path d="M40 70 C54 60 76 60 90 64 C98 66 104 62 108 56 L114 58 C110 68 100 75 90 77 C74 81 56 81 40 76 Z" fill="#6f8a3e"/>` +
    `<path d="M48 76 C62 80 78 80 92 75 C86 72 70 72 52 72 Z" fill="#d9cf8a"/>` +
    `<path d="M40 70 C54 60 76 60 90 64 C98 66 104 62 108 56 L114 58 C110 68 100 75 90 77 C74 81 56 81 40 76 Z" fill="none" ${ink()}/>` +
    // legs
    `<path d="M62 78 L58 92 L52 96 M58 92 L60 98 M80 78 L82 92 L76 98 M82 92 L86 98" fill="none" ${ink(3.4)}/>` +
    `<path d="M62 78 L58 92 M80 78 L82 92" fill="none" stroke="#5d7334" stroke-width="1.8" stroke-linecap="round"/>` +
    // near wing
    `<path d="${wyvernWingNear}" fill="#8fa55a"/>` +
    `<path d="M46 30 L44 36 M46 30 L54 48 M46 30 L64 58" fill="none" stroke="#4d6128" stroke-width="1.8"/>` +
    `<path d="${wyvernWingNear}" fill="none" ${ink()}/>` +
    `<path d="M64 66 Q60 44 46 30 L30 12" fill="none" ${ink(3.2)}/>` +
    // head
    `<path d="M106 54 L118 45 L127 49 L121 56 L110 61 Z" fill="#6f8a3e" ${ink(2.2)}/>` +
    `<path d="M112 48 L110 38 L116 46 Z" fill="${C.stone}" ${ink(1.6)}/>` +
    `<circle cx="117" cy="50" r="1.6" fill="#ffd34d"/>` +
    `<path d="M121 56 L127 54" ${ink(1.4)}/>`,
);

const lich = asset(
  'monster-lich',
  'Lich',
  'Monsters',
  ['undead', 'lich', 'necromancer', 'skeleton', 'death'],
  128,
  128,
  shadow(64, 118, 30, 5) +
    `<circle cx="64" cy="54" r="40" fill="url(#g)"/>` +
    // staff
    `<line x1="94" y1="24" x2="90" y2="116" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>` +
    `<line x1="94" y1="24" x2="90" y2="116" stroke="${C.woodDark}" stroke-width="2.6" stroke-linecap="round"/>` +
    `<circle cx="94" cy="18" r="11" fill="url(#g)"/>` +
    `<circle cx="94" cy="18" r="6" fill="#8dffb8" ${ink(2)}/>` +
    sparkle(92, 16, 2.6, '#ffffff') +
    // robe
    `<path d="M40 116 C42 90 44 70 50 52 C54 42 74 42 78 52 C84 70 86 90 88 116 L82 108 L76 116 L70 108 L64 116 L58 108 L52 116 L46 108 Z" fill="#4a3a5e"/>` +
    `<path d="M66 44 C74 46 78 50 78 52 C84 70 86 90 88 116 L82 108 L76 116 L72 110 C76 90 74 64 66 44 Z" fill="#2a1f38" opacity=".55"/>` +
    `<path d="M40 116 C42 90 44 70 50 52 C54 42 74 42 78 52 C84 70 86 90 88 116 L82 108 L76 116 L70 108 L64 116 L58 108 L52 116 L46 108 Z" fill="none" ${ink()}/>` +
    `<path d="M52 62 L64 70 L76 62" fill="none" stroke="#c9a14a" stroke-width="2.2"/>` +
    // hood + skull
    `<path d="M48 58 C45 38 53 23 64 21 C75 23 83 38 80 58 C74 51 54 51 48 58 Z" fill="#33284a" ${ink()}/>` +
    `<ellipse cx="64" cy="43" rx="8.5" ry="9.5" fill="#e8e0c8" ${ink(2)}/>` +
    `<ellipse cx="60.5" cy="42" rx="2.4" ry="2.8" fill="${INK}"/><ellipse cx="67.5" cy="42" rx="2.4" ry="2.8" fill="${INK}"/>` +
    `<circle cx="60.5" cy="42" r="1.1" fill="#8dffb8"/><circle cx="67.5" cy="42" r="1.1" fill="#8dffb8"/>` +
    `<path d="M60 49 h8 M62 47.5 v3 M64 47.5 v3 M66 47.5 v3" ${ink(1.1)}/>` +
    // bony hand
    `<path d="M80 64 L90 60" stroke="#e8e0c8" stroke-width="3" stroke-linecap="round"/>` +
    `<circle cx="91" cy="60" r="3" fill="#e8e0c8" ${ink(1.4)}/>` +
    // wisps
    `<path d="M30 80 q-6 -8 2 -14 q6 -4 2 -10" fill="none" stroke="#8dffb8" stroke-width="2" stroke-linecap="round" opacity=".8"/>` +
    `<path d="M104 78 q8 -6 2 -14" fill="none" stroke="#8dffb8" stroke-width="2" stroke-linecap="round" opacity=".8"/>`,
  glowDef('g', '#6dff9e'),
);

const tentacle = (d: string) => `<path d="${d}" fill="#a8455a" ${ink(2.2)}/>`;
const kraken = asset(
  'monster-kraken',
  'Kraken',
  'Monsters',
  ['kraken', 'sea', 'monster', 'ocean', 'tentacles'],
  128,
  128,
  waves(4, 96, 120, 24, C.water) +
    tentacle('M26 104 C18 84 26 64 18 48 C14 40 22 34 27 41 C31 49 26 58 31 70 C36 84 38 96 38 104 Z') +
    tentacle('M92 104 C94 86 104 74 100 56 C98 48 106 44 110 50 C114 58 108 66 106 78 C104 90 104 98 104 104 Z') +
    tentacle('M44 104 C40 92 42 84 36 76 C32 70 38 66 42 71 C48 78 52 90 54 104 Z') +
    tentacle('M78 104 C80 92 84 86 90 82 C95 78 98 84 94 87 C88 92 88 98 88 104 Z') +
    // suckers
    [
      [24, 66],
      [27, 78],
      [31, 90],
      [104, 66],
      [101, 78],
      [99, 90],
    ]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.8" fill="#f0c0b8" ${ink(0.9)}/>`)
      .join('') +
    // mantle
    `<path d="M50 104 C48 80 54 62 66 60 C78 62 84 80 82 104 Z" fill="#b84f64"/>` +
    `<path d="M66 60 C78 62 84 80 82 104 L72 104 C76 86 74 70 66 60 Z" fill="#6e2436" opacity=".45"/>` +
    `<path d="M50 104 C48 80 54 62 66 60 C78 62 84 80 82 104 Z" fill="none" ${ink()}/>` +
    `<ellipse cx="59" cy="88" rx="4" ry="5" fill="#ffd34d" ${ink(1.6)}/><ellipse cx="73" cy="88" rx="4" ry="5" fill="#ffd34d" ${ink(1.6)}/>` +
    `<rect x="58" y="86" width="2" height="5" fill="${INK}"/><rect x="72" y="86" width="2" height="5" fill="${INK}"/>` +
    `<path d="M20 106 q6 -4 12 0 M96 108 q6 -4 12 0" fill="none" stroke="${C.waterLight}" stroke-width="2" stroke-linecap="round"/>`,
);

const serpent = asset(
  'monster-sea-serpent',
  'Sea serpent',
  'Monsters',
  ['serpent', 'sea', 'monster', 'leviathan'],
  128,
  96,
  waves(2, 58, 124, 30, C.water) +
    // humps
    [
      [30, 12],
      [56, 14],
    ]
      .map(
        ([x, r]) =>
          `<path d="M${x - r} 72 A${r} ${r * 1.3} 0 0 1 ${x + r} 72 Z" fill="#3e8a7a" ${ink(2.2)}/>` +
          `<path d="M${x - r * 0.4} ${72 - r * 1.2} l3 -6 l3 6 M${x + r * 0.2} ${72 - r * 1.25} l3 -6 l3 6" fill="#e8c35a" ${ink(1.4)}/>`,
      )
      .join('') +
    // tail fin
    `<path d="M10 72 L2 56 L14 62 L16 72 Z" fill="#e8c35a" ${ink(1.8)}/>` +
    // neck & head
    `<path d="M80 74 C80 50 92 34 104 30 L112 36 C100 42 94 54 94 74 Z" fill="#3e8a7a" ${ink(2.2)}/>` +
    `<path d="M98 30 C102 20 114 18 122 24 L126 30 L114 34 L104 38 Z" fill="#3e8a7a" ${ink(2.2)}/>` +
    `<path d="M100 28 L94 14 L104 22 L104 12 L110 22" fill="#e8c35a" ${ink(1.6)}/>` +
    `<circle cx="112" cy="26" r="1.8" fill="#ffd34d"/>` +
    `<path d="M88 52 C91 50 94 50 96 52 M86 62 C90 60 93 60 95 62" fill="none" stroke="#d9e8b0" stroke-width="2" stroke-linecap="round"/>` +
    `<path d="M116 34 l4 2" ${ink(1.4)}/>`,
);

export const DRAGONS: StarterAsset[] = [redDragon, easternDragon, frostDragon, blackDragon];
export const MONSTERS: StarterAsset[] = [giant, troll, wyvern, lich, kraken, serpent];
