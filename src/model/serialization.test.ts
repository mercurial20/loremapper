import { describe, expect, it } from 'vitest';
import { FORMAT_VERSION, migrateProject, normalizeDoc } from './serialization';
import { emptyDocument } from './types';

describe('project serialisation', () => {
  it('fills fields missing from older documents', () => {
    const d = normalizeDoc({ objects: {} } as never);
    const e = emptyDocument();
    expect(d.objectLayers.length).toBe(e.objectLayers.length);
    expect(d.view.style).toBe('parchment');
    expect(d.systemLayers.fog.visible).toBe(true);
  });

  it('accepts the current format and rejects newer ones', () => {
    const rec = { id: 'x', formatVersion: FORMAT_VERSION, meta: { name: 'A' }, doc: {}, rasterDefaults: { height: -3800, biome: 0, fog: 0 }, updatedAt: 0 };
    const m = migrateProject(rec);
    expect(m.meta.name).toBe('A');
    expect(m.meta.planet.radiusKm).toBe(6371);
    expect(() => migrateProject({ ...rec, formatVersion: FORMAT_VERSION + 1 })).toThrow(/newer version/);
  });

  it('opens beta.1 / beta.2 projects as the planets they were', () => {
    const old = { id: 'x', formatVersion: 1, meta: { name: 'Old', planet: { radiusKm: 7410, gridWidth: 4096, gridHeight: 2048, seaLevel: 12 } }, doc: { labels: {} }, rasterDefaults: { height: -3800, biome: 0, fog: 0 }, updatedAt: 0 };
    const m = migrateProject(old);
    expect(m.formatVersion).toBe(FORMAT_VERSION);
    expect(m.meta.planet).toMatchObject({ mapType: 'planet', radiusKm: 7410, gridWidth: 4096, gridHeight: 2048, seaLevel: 12 });
    expect(m.doc.regionNames).toEqual({});
    // a record that never stored its radius keeps the old default
    const bare = migrateProject({ ...old, meta: { name: 'Bare' } });
    expect(bare.meta.planet.radiusKm).toBe(7410);
  });

  it('opens maps from before water sources with none', () => {
    const v4 = { id: 'x', formatVersion: 4, meta: { name: 'Four' }, doc: { ranges: {} }, rasterDefaults: { height: -3800, biome: 0, fog: 0, water: 0, relief: 0, lake: -32768 }, updatedAt: 0 };
    const m = migrateProject(v4);
    expect(m.formatVersion).toBe(FORMAT_VERSION);
    expect(m.doc.sources).toEqual({});
  });

  it('makes a label written beside an object with its name into the object’s own name', () => {
    const obj = (id: string, name: string, x: number) => ({ id, assetId: 'a', layerId: 'layer-settlements', x, y: 100, size: 40, scale: 1, rotation: 0, flipX: false, opacity: 1, z: 0, locked: false, hidden: false, name, description: '', props: [] });
    const lab = (id: string, text: string, x: number, y: number, more = {}) => ({ id, text, x, y, size: 20, font: 'script', color: '#123456', rotation: 0, letterSpacing: 0.05, uppercase: false, italic: true, halo: true, curve: 0, opacity: 1, hidden: false, locked: false, ...more });
    const doc = {
      objects: { a: obj('a', 'Kingsford', 100), b: obj('b', 'Ashford', 500), c: obj('c', 'Far', 900) },
      labels: { la: lab('la', 'kingsford ', 100, 140), lb: lab('lb', 'Ashford', 500, 140, { rotation: 20 }), lc: lab('lc', 'Far', 1500, 100), ld: lab('ld', 'Sea of Mist', 300, 300) },
    };
    const m = migrateProject({ id: 'x', formatVersion: 5, meta: { name: 'Five' }, doc, rasterDefaults: { height: -3800, biome: 0, fog: 0, water: 0, relief: 0, lake: -32768 }, updatedAt: 0 });
    // beside it and plain: tied to the object, where it was and as it looked
    expect(m.doc.labels.la).toBeUndefined();
    expect(m.doc.objects.a.nameOffset).toEqual([0, 40]);
    expect(m.doc.objects.a.nameStyle).toEqual({ font: 'script', size: 20, color: '#123456', halo: true, uppercase: false, italic: true });
    // turned: kept as it is, and the object's own name not written over it
    expect(m.doc.labels.lb).toBeDefined();
    expect(m.doc.objects.b.showName).toBe(false);
    // far away, or another name: left alone
    expect(m.doc.labels.lc).toBeDefined();
    expect(m.doc.objects.c.showName).toBeUndefined();
    expect(m.doc.labels.ld).toBeDefined();
  });

  it('keeps the look of rivers with tributaries, now that a river’s width is its width at the mouth', () => {
    const r = (id: string, width: number, outlet?: object) => ({ id, kind: 'river', points: [[0, 0], [10, 0], [20, 0]], width, color: '#4f86ad', style: 'solid', taper: true, name: '', hidden: false, locked: false, ...(outlet ? { outlet } : {}) });
    const doc = { paths: { main: r('main', 4), trib: r('trib', 3, { kind: 'path', id: 'main', t: 0.5 }), small: r('small', 2, { kind: 'path', id: 'trib', t: 0.5 }), alone: r('alone', 5) } };
    const m = migrateProject({ id: 'x', formatVersion: 6, meta: { name: 'Six' }, doc, rasterDefaults: { height: -3800, biome: 0, fog: 0, water: 0, relief: 0, lake: -32768 }, updatedAt: 0 });
    // before: main carried its own 4² and the tributaries' 3² + 2² at its mouth
    expect(m.doc.paths.main.width).toBeCloseTo(Math.sqrt(16 + 9 + 4), 5);
    expect(m.doc.paths.trib.width).toBeCloseTo(Math.sqrt(9 + 4), 5);
    expect(m.doc.paths.small.width).toBe(2);
    // they go on widening below their tributaries; rivers without any do not
    expect(m.doc.paths.main.widenBelowTributaries).toBe(true);
    expect(m.doc.paths.small.widenBelowTributaries).toBeUndefined();
    expect(m.doc.paths.alone.width).toBe(5);
  });
});
