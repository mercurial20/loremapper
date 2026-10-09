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
    expect(m.meta.planet.radiusKm).toBe(7410);
    expect(() => migrateProject({ ...rec, formatVersion: FORMAT_VERSION + 1 })).toThrow(/newer version/);
  });
});
