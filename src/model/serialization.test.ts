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
});
