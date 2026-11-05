import { describe, expect, it } from 'vitest';
import { autoSize, groupStyle, labelGroup, labelStyle, objectNameGroup, objectNameStyle, objectShowsName, pathNameGroup, readableAt, screenPx } from './names';
import { normalizeDoc } from './serialization';
import { emptyDocument, NAME_GROUP, type MapDocument, type MapLabel, type MapObject, type PathFeature } from './types';

const L = 2048;

const object = (o: Partial<MapObject> = {}): MapObject => ({ id: 'o1', assetId: 'a', layerId: 'layer-settlements', x: 0, y: 0, size: 40, scale: 1, rotation: 0, flipX: false, opacity: 1, z: 0, locked: false, hidden: false, name: 'Kingsford', description: '', props: [], ...o }) as MapObject;

const label = (l: Partial<MapLabel> = {}): MapLabel => ({ id: 'l1', text: 'Old Realm', x: 0, y: 0, size: 40, font: 'script', color: '#123456', rotation: 0, letterSpacing: 0.05, uppercase: false, italic: true, halo: false, curve: 0, opacity: 1, hidden: false, locked: false, ...l });

const withGroups = (d: Partial<MapDocument> = {}): MapDocument => ({ ...emptyDocument(), ...d });

describe('names on the map', () => {
  it('sizes a group to the map when its size is 0', () => {
    const d = withGroups();
    const objects = d.nameGroups.find((g) => g.id === NAME_GROUP.objects)!;
    expect(objects.style.size).toBe(0);
    expect(groupStyle(objects, L).size).toBeCloseTo(autoSize('objects', L));
    // lands are written larger than the names of objects
    const lands = d.nameGroups.find((g) => g.id === NAME_GROUP.places)!;
    expect(groupStyle(lands, L).size).toBeGreaterThan(groupStyle(objects, L).size);
  });

  it('takes the group’s style, with what the item sets itself over it', () => {
    const d = withGroups();
    const o = object({ nameStyle: { color: '#8f2a1e' } });
    const s = objectNameStyle(d, o, L);
    expect(s.color).toBe('#8f2a1e');
    expect(s.font).toBe(d.nameGroups.find((g) => g.id === NAME_GROUP.objects)!.style.font);
  });

  it('falls back to the built-in group when an item’s group is gone', () => {
    const d = withGroups();
    expect(objectNameGroup(d, object({ nameGroup: 'names-deleted' })).id).toBe(NAME_GROUP.objects);
    expect(pathNameGroup(d, { kind: 'river', nameGroup: 'names-deleted' } as PathFeature).id).toBe(NAME_GROUP.waters);
    expect(pathNameGroup(d, { kind: 'road' } as PathFeature).id).toBe(NAME_GROUP.labels);
  });

  it('keeps the whole style of labels from older maps, which had no groups', () => {
    const d = withGroups();
    const s = labelStyle(d, label(), L);
    expect(s).toEqual({ font: 'script', size: 40, color: '#123456', halo: false, uppercase: false, italic: true, adaptive: false });
  });

  it('lets a new label follow its group in everything it does not set', () => {
    const d = withGroups();
    const g = d.nameGroups.find((x) => x.id === NAME_GROUP.labels)!;
    const s = labelStyle(d, label({ group: g.id, own: ['color'] }), L);
    expect(s.color).toBe('#123456');
    expect(s.font).toBe(g.style.font);
    expect(s.size).toBeCloseTo(autoSize('labels', L));
  });

  it('puts the name of a land or a sea in the Lands or Waters group', () => {
    const d = withGroups();
    expect(labelGroup(d, label({ anchor: { kind: 'region', x: 1, y: 1, land: true, syncText: true } })).id).toBe(NAME_GROUP.places);
    expect(labelGroup(d, label({ anchor: { kind: 'region', x: 1, y: 1, land: false, syncText: true } })).id).toBe(NAME_GROUP.waters);
    expect(labelGroup(d, label()).id).toBe(NAME_GROUP.labels);
  });

  it('writes an object’s name only when it has one and it is not turned off', () => {
    expect(objectShowsName(object())).toBe(true);
    expect(objectShowsName(object({ name: '  ' }))).toBe(false);
    expect(objectShowsName(object({ showName: false }))).toBe(false);
  });

  it('gives older maps the built-in groups, and keeps groups of the user’s own', () => {
    expect(normalizeDoc({ objects: {} } as never).nameGroups.map((g) => g.id)).toEqual(emptyDocument().nameGroups.map((g) => g.id));
    const mine = { id: 'names-mine', name: 'Capitals', kind: 'custom' as const, style: { font: 'serif' as const, size: 12, color: '#000000', halo: true, uppercase: false, italic: false }, visible: true, always: true };
    const d = normalizeDoc({ nameGroups: [mine] } as never);
    // (with what groups have had since: sizes on screen, not adaptive)
    expect(d.nameGroups.find((g) => g.id === 'names-mine')).toEqual({ ...mine, minPx: 11, maxPx: 20, style: { ...mine.style, adaptive: false } });
    expect(d.nameGroups.length).toBe(emptyDocument().nameGroups.length + 1);
  });

  it('makes the names of lands, waters, rivers and peaks adaptive at first, not those of objects or free labels', () => {
    const d = withGroups();
    const adaptive = (id: string) => d.nameGroups.find((g) => g.id === id)!.style.adaptive;
    expect([NAME_GROUP.places, NAME_GROUP.waters, NAME_GROUP.peaks].map(adaptive)).toEqual([true, true, true]);
    expect([NAME_GROUP.objects, NAME_GROUP.labels].map(adaptive)).toEqual([false, false]);
    // an older map's built-in groups get the same
    const old = normalizeDoc({ nameGroups: d.nameGroups.map((g) => ({ ...g, style: { ...g.style, adaptive: undefined }, minPx: undefined, maxPx: undefined })) } as never);
    expect(old.nameGroups.find((g) => g.id === NAME_GROUP.peaks)).toMatchObject({ minPx: 10, maxPx: 13, style: { adaptive: true } });
  });

  it('keeps an adaptive name within its group’s sizes on screen, and leaves the others on the map', () => {
    const d = withGroups();
    const g = d.nameGroups.find((x) => x.id === NAME_GROUP.peaks)!;
    const st = { ...groupStyle(g, L), size: 10 };
    // zoomed out it stays readable, zoomed in it stops growing (the land shows)
    expect(screenPx(st, g, 0.1)).toBe(g.minPx);
    expect(screenPx(st, g, 1.2)).toBe(12);
    expect(screenPx(st, g, 50)).toBe(g.maxPx);
    expect(readableAt(st, g, 0.01)).toBe(true);
    const fixed = { ...st, adaptive: false };
    expect(screenPx(fixed, g, 50)).toBe(500);
    expect(readableAt(fixed, g, 0.1)).toBe(false);
  });

  it('lets a label set adaptive itself, or follow its group', () => {
    const d = withGroups();
    expect(labelStyle(d, label({ group: NAME_GROUP.places, own: ['size'] }), L).adaptive).toBe(true);
    expect(labelStyle(d, label({ group: NAME_GROUP.places, own: ['adaptive'], adaptive: false }), L).adaptive).toBe(false);
    expect(labelStyle(d, label({ group: NAME_GROUP.labels, own: [] }), L).adaptive).toBe(false);
  });
});
