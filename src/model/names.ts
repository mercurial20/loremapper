import {
  NAME_GROUP,
  NAME_STYLE_KEYS,
  type MapDocument,
  type MapLabel,
  type MapObject,
  type NameGroup,
  type NameGroupKind,
  type NameStyle,
  type NameStyleKey,
  type PathFeature,
  type PeakAnnotation,
} from './types';

/*
 * Names on the map take their style from a group (lands, waters, objects, peaks, labels, or one
 * the user made) and may set any property of their own. Sizes are on the map (world units), so a
 * name keeps its size against the land whatever the zoom; a size of 0 is sized to the map.
 */

/** A group's automatic size: a share of the map's longer side (cells). */
const AUTO_SHARE: Record<NameGroupKind, number> = { places: 1 / 55, waters: 1 / 75, labels: 1 / 80, custom: 1 / 110, objects: 1 / 120, peaks: 1 / 140 };

/** The map's shorter side, cells: what placement sizes are a share of. */
export const mapSpan = (W: number, H: number) => Math.min(W, H);
/** The map's longer side, cells: what automatic name sizes are a share of. */
export const mapLong = (W: number, H: number) => Math.max(W, H);
/** The range of a placed symbol's width, as a share of the map's shorter side. */
export const ICON_SHARE_MIN = 1 / 1000;
export const ICON_SHARE_MAX = 1 / 6;
/** The range of a river's or road's width, as a share of the map's shorter side. */
export const PATH_SHARE_MIN = 1 / 40000;
export const PATH_SHARE_MAX = 1 / 40;

export function autoSize(kind: NameGroupKind, longSide: number): number {
  return Math.max(0.5, longSide * AUTO_SHARE[kind]);
}

/** A group by id; a missing one (deleted) falls back to the built-in of that role. */
export function nameGroup(doc: MapDocument, id: string | undefined, fallback: string): NameGroup {
  return doc.nameGroups.find((g) => g.id === id) ?? doc.nameGroups.find((g) => g.id === fallback) ?? doc.nameGroups[0];
}

/** A group's style with its size worked out. */
export function groupStyle(g: NameGroup, longSide: number): NameStyle {
  return { ...g.style, size: g.style.size > 0 ? g.style.size : autoSize(g.kind, longSide) };
}

const merge = (base: NameStyle, own: Partial<NameStyle> | undefined): NameStyle => {
  const out = { ...base };
  if (own) for (const k of NAME_STYLE_KEYS) if (own[k] !== undefined) (out as Record<string, unknown>)[k] = own[k];
  return out;
};

export const objectNameGroup = (doc: MapDocument, o: MapObject) => nameGroup(doc, o.nameGroup, NAME_GROUP.objects);
export const pathNameGroup = (doc: MapDocument, p: PathFeature) => nameGroup(doc, p.nameGroup, p.kind === 'river' ? NAME_GROUP.waters : NAME_GROUP.labels);
export const peakNameGroup = (doc: MapDocument, a: PeakAnnotation | undefined) => nameGroup(doc, a?.nameGroup, NAME_GROUP.peaks);
export const labelGroup = (doc: MapDocument, l: MapLabel) => nameGroup(doc, l.group, l.anchor ? (l.anchor.land ? NAME_GROUP.places : NAME_GROUP.waters) : NAME_GROUP.labels);

export function objectNameStyle(doc: MapDocument, o: MapObject, longSide: number): NameStyle {
  return merge(groupStyle(objectNameGroup(doc, o), longSide), o.nameStyle);
}
export function pathNameStyle(doc: MapDocument, p: PathFeature, longSide: number): NameStyle {
  return merge(groupStyle(pathNameGroup(doc, p), longSide), p.nameStyle);
}
export function peakNameStyle(doc: MapDocument, a: PeakAnnotation | undefined, longSide: number): NameStyle {
  return merge(groupStyle(peakNameGroup(doc, a), longSide), a?.nameStyle);
}

/** A label's own properties: all of them on older maps, which had no groups. */
export const labelOwn = (l: MapLabel): NameStyleKey[] => l.own ?? NAME_STYLE_KEYS;

export function labelStyle(doc: MapDocument, l: MapLabel, longSide: number): NameStyle {
  const g = groupStyle(labelGroup(doc, l), longSide);
  const own = labelOwn(l);
  const mine: NameStyle = { font: l.font, size: l.size, color: l.color, halo: l.halo, uppercase: l.uppercase, italic: l.italic };
  const out = { ...g };
  for (const k of own) (out as Record<string, unknown>)[k] = mine[k];
  return out;
}

/** Whether an object shows its name on the map. */
export const objectShowsName = (o: MapObject) => (o.showName ?? true) && !!o.name.trim();
/** Whether a river or road shows its name on the map. */
export const pathShowsName = (p: PathFeature) => (p.showName ?? true) && !!p.name.trim();

/** Names smaller than this on screen (letter size, px) are hidden, unless their group is always shown. */
export const MIN_NAME_PX = 9;
/** Symbols smaller than this on screen (px) are hidden. */
export const MIN_ICON_PX = 3;

/** A group's name as shown: the built-in ones are translated. */
export function groupName(g: NameGroup, t: (s: string) => string): string {
  return g.kind === 'custom' ? g.name : t(g.name);
}
