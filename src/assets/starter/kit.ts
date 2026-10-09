/**
 * Tiny SVG drawing kit for the built-in asset pack. Every icon shares the
 * same ink colour, stroke weight and top-left light so the set reads as one
 * hand-inked family. To swap an icon for raster art, replace its entry in
 * the category file (or use "Replace image" in the app's asset library).
 */
export const INK = '#2b2016';

export const C = {
  stone: '#ddd0b3',
  stoneMid: '#c3b392',
  stoneDark: '#8f7f62',
  slate: '#7d8a99',
  slateDark: '#566373',
  plaster: '#f0e4c8',
  roofRed: '#b44b33',
  roofRedDark: '#7f2f1f',
  roofBlue: '#4a6c94',
  roofBlueDark: '#2f4a6b',
  teal: '#3f9a92',
  tealDark: '#286863',
  terracotta: '#c96b40',
  terracottaDark: '#8c4325',
  straw: '#d0aa5c',
  strawDark: '#9c7a36',
  gold: '#e7bb4b',
  goldDark: '#a97b1f',
  wood: '#8e5c34',
  woodDark: '#5c3a1e',
  leaf: '#5f8f3e',
  leafLight: '#86b35a',
  leafDark: '#3c6026',
  pine: '#3f6b45',
  pineDark: '#274531',
  water: '#5d97ba',
  waterLight: '#9cc8de',
  waterDark: '#36688b',
  banner: '#b0322a',
  bannerBlue: '#2f5d9a',
  felt: '#f3ead6',
  feltShade: '#d6c7a6',
  rock: '#a89c88',
  rockLight: '#c9bfac',
  rockDark: '#6f6555',
  snow: '#f7f8f6',
  snowShade: '#c3d0dc',
  mud: '#d6b27a',
  mudDark: '#a77d45',
};

/** Standard ink stroke attributes. */
export const ink = (w = 2.4) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

export function svg(w: number, h: number, body: string, defs = ''): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`;
}

export const shadow = (cx: number, cy: number, rx: number, ry: number, o = 0.2) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${INK}" opacity="${o}"/>`;

/** Rectangular wall/body with a darker right-hand face. */
export function box(x: number, y: number, w: number, h: number, fill: string, shade = 0.38, sw = 2.4): string {
  const sx = x + w * (1 - shade);
  return (
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>` +
    `<rect x="${sx}" y="${y}" width="${w * shade}" height="${h}" fill="${INK}" opacity=".16"/>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" ${ink(sw)}/>`
  );
}

/** Gable roof sitting on (x, y) spanning w, rising h. */
export function gable(x: number, y: number, w: number, h: number, fill: string, dark: string, over = 2, sw = 2.4): string {
  const l = x - over;
  const r = x + w + over;
  const m = x + w / 2;
  return (
    `<polygon points="${l},${y} ${m},${y - h} ${r},${y}" fill="${fill}"/>` +
    `<polygon points="${m},${y - h} ${r},${y} ${m},${y}" fill="${dark}" opacity=".55"/>` +
    `<polygon points="${l},${y} ${m},${y - h} ${r},${y}" fill="none" ${ink(sw)}/>`
  );
}

/** Cone roof for towers. */
export const cone = (x: number, y: number, w: number, h: number, fill: string, dark: string, over = 2.5, sw = 2.4) =>
  gable(x, y, w, h, fill, dark, over, sw);

/** Crenellations along the top edge of a wall. */
export function crenels(x: number, y: number, w: number, n: number, fill: string, size = 4, sw = 2): string {
  let s = '';
  const step = w / n;
  for (let i = 0; i < n; i++) {
    const mx = x + i * step + step * 0.18;
    s += `<rect x="${mx}" y="${y - size}" width="${step * 0.64}" height="${size}" fill="${fill}" ${ink(sw)}/>`;
  }
  return s;
}

/** Simple house: walls + gable roof + door. */
export function house(x: number, base: number, w: number, h: number, roof: string, roofDark: string, wall = C.plaster, roofH = w * 0.55): string {
  const y = base - h;
  return (
    box(x, y, w, h, wall) +
    gable(x, y, w, roofH, roof, roofDark) +
    `<rect x="${x + w * 0.38}" y="${base - h * 0.5}" width="${w * 0.24}" height="${h * 0.5}" fill="${C.woodDark}"/>`
  );
}

/** Round-topped window or door. */
export function arch(x: number, y: number, w: number, h: number, fill = INK): string {
  const r = w / 2;
  return `<path d="M${x} ${y + h} V${y + r} A${r} ${r} 0 0 1 ${x + w} ${y + r} V${y + h} Z" fill="${fill}"/>`;
}

/** Tower: body (bottom-centre at cx, base) with optional cone roof or battlements. */
export function tower(
  cx: number,
  base: number,
  w: number,
  h: number,
  opts: { fill?: string; roof?: string; roofDark?: string; roofH?: number; battlements?: boolean; windows?: number } = {},
): string {
  const x = cx - w / 2;
  const y = base - h;
  let s = box(x, y, w, h, opts.fill ?? C.stone);
  const nWin = opts.windows ?? 1;
  for (let i = 0; i < nWin; i++) s += arch(cx - w * 0.12, y + h * (0.2 + i * 0.3), w * 0.24, h * 0.14);
  if (opts.roof) s += cone(x, y, w, opts.roofH ?? w * 1.1, opts.roof, opts.roofDark ?? C.roofRedDark);
  else if (opts.battlements) s += crenels(x - 1, y, w + 2, Math.max(2, Math.round(w / 6)), opts.fill ?? C.stone, 4);
  return s;
}

/** Pennant on a pole. */
export function flag(x: number, y: number, h: number, color: string, dir = 1): string {
  const fy = y - h;
  const d = dir * 14;
  return (
    `<line x1="${x}" y1="${y}" x2="${x}" y2="${fy}" ${ink(2)}/>` +
    `<path d="M${x} ${fy + 1} Q${x + d * 0.5} ${fy - 2} ${x + d} ${fy + 3} Q${x + d * 0.55} ${fy + 6} ${x} ${fy + 9} Z" fill="${color}" ${ink(1.6)}/>`
  );
}

/** Dome on a drum, centred at cx with bottom at base. */
export function dome(cx: number, base: number, r: number, fill: string, dark: string, finial = C.gold): string {
  return (
    `<path d="M${cx - r} ${base} A${r} ${r * 1.05} 0 0 1 ${cx + r} ${base} Z" fill="${fill}"/>` +
    `<path d="M${cx} ${base - r * 1.05} A${r} ${r * 1.05} 0 0 1 ${cx + r} ${base} L${cx} ${base} Z" fill="${dark}" opacity=".5"/>` +
    `<path d="M${cx - r} ${base} A${r} ${r * 1.05} 0 0 1 ${cx + r} ${base} Z" fill="none" ${ink()}/>` +
    `<line x1="${cx}" y1="${base - r * 1.05}" x2="${cx}" y2="${base - r * 1.05 - 7}" ${ink(2)}/>` +
    `<circle cx="${cx}" cy="${base - r * 1.05 - 8}" r="2.4" fill="${finial}" ${ink(1.4)}/>`
  );
}

/** Onion dome. */
export function onion(cx: number, base: number, r: number, fill: string, dark: string): string {
  const top = base - r * 2.3;
  const p = `M${cx - r * 0.8} ${base} C${cx - r * 1.5} ${base - r * 0.9} ${cx - r * 0.6} ${base - r * 1.5} ${cx} ${top} C${cx + r * 0.6} ${base - r * 1.5} ${cx + r * 1.5} ${base - r * 0.9} ${cx + r * 0.8} ${base} Z`;
  return (
    `<path d="${p}" fill="${fill}"/>` +
    `<path d="M${cx} ${top} C${cx + r * 0.6} ${base - r * 1.5} ${cx + r * 1.5} ${base - r * 0.9} ${cx + r * 0.8} ${base} L${cx} ${base} Z" fill="${dark}" opacity=".5"/>` +
    `<path d="${p}" fill="none" ${ink()}/>` +
    `<circle cx="${cx}" cy="${top - 2.5}" r="2.2" fill="${C.gold}" ${ink(1.3)}/>`
  );
}

/** Deciduous tree with a lumpy crown. */
export function tree(cx: number, base: number, s: number, fill = C.leaf, dark = C.leafDark): string {
  const r = s;
  const trunk = `<rect x="${cx - r * 0.12}" y="${base - r * 0.9}" width="${r * 0.24}" height="${r * 0.9}" fill="${C.woodDark}" ${ink(1.6)}/>`;
  const cy = base - r * 1.45;
  const crown = `M${cx - r * 0.95} ${cy + r * 0.25} C${cx - r * 1.2} ${cy - r * 0.35} ${cx - r * 0.6} ${cy - r * 1.05} ${cx - r * 0.05} ${cy - r * 0.95} C${cx + r * 0.55} ${cy - r * 1.15} ${cx + r * 1.25} ${cy - r * 0.45} ${cx + r * 0.95} ${cy + r * 0.25} C${cx + r * 0.8} ${cy + r * 0.75} ${cx - r * 0.75} ${cy + r * 0.8} ${cx - r * 0.95} ${cy + r * 0.25} Z`;
  return (
    trunk +
    `<path d="${crown}" fill="${fill}"/>` +
    `<path d="M${cx + r * 0.1} ${cy - r * 0.9} C${cx + r * 0.7} ${cy - r * 0.9} ${cx + r * 1.2} ${cy - r * 0.3} ${cx + r * 0.95} ${cy + r * 0.25} C${cx + r * 0.7} ${cy + r * 0.7} ${cx} ${cy + r * 0.75} ${cx - r * 0.2} ${cy + r * 0.6} C${cx + r * 0.4} ${cy + r * 0.2} ${cx + r * 0.5} ${cy - r * 0.4} ${cx + r * 0.1} ${cy - r * 0.9} Z" fill="${dark}" opacity=".45"/>` +
    `<path d="${crown}" fill="none" ${ink(2)}/>` +
    `<path d="M${cx - r * 0.5} ${cy - r * 0.35} q${r * 0.2} ${-r * 0.25} ${r * 0.45} ${-r * 0.15}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="${r * 0.12}" stroke-linecap="round"/>`
  );
}

/** Conifer. */
export function pine(cx: number, base: number, s: number, fill = C.pine, dark = C.pineDark): string {
  const h = s * 2.6;
  const w = s;
  const tiers = 3;
  let body = '';
  let shade = '';
  for (let i = 0; i < tiers; i++) {
    const ty = base - h * 0.18 - (i * h * 0.26);
    const tw = w * (1 - i * 0.22);
    const top = ty - h * 0.42;
    body += `M${cx - tw} ${ty} L${cx} ${top} L${cx + tw} ${ty} Q${cx} ${ty - h * 0.06} ${cx - tw} ${ty} Z `;
    shade += `M${cx} ${top} L${cx + tw} ${ty} Q${cx + tw * 0.4} ${ty - h * 0.04} ${cx} ${ty - h * 0.05} Z `;
  }
  return (
    `<rect x="${cx - s * 0.12}" y="${base - h * 0.2}" width="${s * 0.24}" height="${h * 0.2}" fill="${C.woodDark}" ${ink(1.5)}/>` +
    `<path d="${body}" fill="${fill}"/>` +
    `<path d="${shade}" fill="${dark}" opacity=".6"/>` +
    `<path d="${body}" fill="none" ${ink(1.8)}/>`
  );
}

/** Mountain with lit left and shaded right faces. Peak at (px, py), base y. */
export function mountain(
  x0: number,
  x1: number,
  base: number,
  px: number,
  py: number,
  o: { light?: string; dark?: string; snow?: boolean; snowLine?: number; sw?: number } = {},
): string {
  const light = o.light ?? '#cbb991';
  const dark = o.dark ?? '#8d7a5a';
  const sw = o.sw ?? 2.4;
  const ridgeMid = base - (base - py) * 0.35;
  const outline = `M${x0} ${base} L${(x0 + px) / 2 - 3} ${(base + py) / 2 + 4} L${px} ${py} L${(px + x1) / 2 + 4} ${(base + py) / 2 - 2} L${x1} ${base} Z`;
  let s = `<path d="${outline}" fill="${light}"/>`;
  s += `<path d="M${px} ${py} L${(px + x1) / 2 + 4} ${(base + py) / 2 - 2} L${x1} ${base} L${px + (x1 - px) * 0.15} ${base} L${px + 4} ${ridgeMid} Z" fill="${dark}"/>`;
  if (o.snow) {
    const sl = o.snowLine ?? 0.38;
    const sy = py + (base - py) * sl;
    const lx = px - (px - x0) * sl * 0.95;
    const rx = px + (x1 - px) * sl * 0.95;
    s += `<path d="M${px} ${py} L${lx} ${sy} L${lx + (px - lx) * 0.35} ${sy - 3} L${px - (px - lx) * 0.25} ${sy + 4} L${px + 2} ${sy - 4} L${px + (rx - px) * 0.45} ${sy + 3} L${rx} ${sy} Z" fill="${C.snow}"/>`;
    s += `<path d="M${px} ${py} L${rx} ${sy} L${px + (rx - px) * 0.45} ${sy + 3} L${px + 2} ${sy - 4} L${px + 3} ${py + (sy - py) * 0.5} Z" fill="${C.snowShade}"/>`;
  }
  // hachure strokes on the shaded face
  for (let i = 1; i <= 3; i++) {
    const t = i / 4;
    const hx = px + (x1 - px) * t * 0.8;
    const hy = py + (base - py) * t * 0.9;
    s += `<path d="M${hx} ${hy} l${-4 + i} ${6 + i * 2}" ${ink(1.4)} fill="none" opacity=".55"/>`;
  }
  s += `<path d="M${px} ${py} L${px + 4} ${ridgeMid} L${px + (x1 - px) * 0.15} ${base}" fill="none" ${ink(1.6)} opacity=".7"/>`;
  s += `<path d="${outline}" fill="none" ${ink(sw)}/>`;
  return s;
}

/** Water band with ink wave lines. */
export function waves(x: number, y: number, w: number, h: number, fill = C.water): string {
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}" ${ink(2)}/>`;
  for (let i = 0; i < 3; i++) {
    const wx = x + 10 + i * (w / 3);
    const wy = y + h * (0.35 + (i % 2) * 0.25);
    s += `<path d="M${wx} ${wy} q4 -3 8 0 t8 0" fill="none" stroke="${C.waterLight}" stroke-width="1.8" stroke-linecap="round"/>`;
  }
  return s;
}

/** Rock blob. */
export function rock(cx: number, cy: number, r: number, fill = C.rock, dark = C.rockDark): string {
  const p = `M${cx - r} ${cy + r * 0.5} L${cx - r * 0.85} ${cy - r * 0.3} L${cx - r * 0.3} ${cy - r * 0.8} L${cx + r * 0.45} ${cy - r * 0.7} L${cx + r} ${cy - r * 0.05} L${cx + r * 0.85} ${cy + r * 0.5} Z`;
  return (
    `<path d="${p}" fill="${fill}"/>` +
    `<path d="M${cx + r * 0.45} ${cy - r * 0.7} L${cx + r} ${cy - r * 0.05} L${cx + r * 0.85} ${cy + r * 0.5} L${cx + r * 0.1} ${cy + r * 0.5} L${cx + r * 0.2} ${cy - r * 0.1} Z" fill="${dark}" opacity=".6"/>` +
    `<path d="${p}" fill="none" ${ink(2)}/>`
  );
}

/** Four-point sparkle. */
export const sparkle = (x: number, y: number, s: number, fill = '#fffbe6') =>
  `<path d="M${x} ${y - s} Q${x + s * 0.18} ${y - s * 0.18} ${x + s} ${y} Q${x + s * 0.18} ${y + s * 0.18} ${x} ${y + s} Q${x - s * 0.18} ${y + s * 0.18} ${x - s} ${y} Q${x - s * 0.18} ${y - s * 0.18} ${x} ${y - s} Z" fill="${fill}"/>`;

/** Radial glow definition helper. */
export const glowDef = (id: string, color: string) =>
  `<radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity=".85"/><stop offset=".55" stop-color="${color}" stop-opacity=".3"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;

export interface StarterAsset {
  id: string;
  name: string;
  category: string;
  tags: string[];
  svg: string;
  /** height / width */
  aspect: number;
}

export function asset(id: string, name: string, category: string, tags: string[], w: number, h: number, body: string, defs = ''): StarterAsset {
  return { id: `builtin:${id}`, name, category, tags, svg: svg(w, h, body, defs), aspect: h / w };
}
