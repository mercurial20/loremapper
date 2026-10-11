import { describe, expect, it } from 'vitest';
import { defaultPlanet } from '../core/planet';
import { Stroke } from './brushes';
import { generate } from './generator';
import { detectPeaks, resolvePeaks } from './peaks';
import { TerrainModel } from './TerrainModel';
import { TileGrid } from './TileGrid';

const small = () => new TerrainModel({ ...defaultPlanet(), gridWidth: 512, gridHeight: 256, tileSize: 64 });

describe('TileGrid', () => {
  it('is sparse: unallocated tiles read the default', () => {
    const g = new TileGrid(256, 128, 64, 1, (n) => new Float32Array(n), -100);
    expect(g.get(10, 10)).toBe(-100);
    expect(g.tiles.size).toBe(0);
    g.ensureTile(0, 0)[5] = 42;
    expect(g.get(5, 0)).toBe(42);
    expect(g.tiles.size).toBe(1);
  });

  it('wraps x and clamps y', () => {
    const g = new TileGrid(256, 128, 64, 1, (n) => new Float32Array(n), 0);
    g.ensureTile(3, 0)[63] = 7; // cell x = 255
    expect(g.get(-1, 0)).toBe(7);
    expect(g.get(255, -5)).toBe(7);
  });

  it('round-trips full arrays and skips default tiles', () => {
    const g = new TileGrid(128, 64, 32, 1, (n) => new Float32Array(n), 0);
    const full = new Float32Array(128 * 64);
    full[40 * 128 + 70] = 9;
    g.loadFull(full);
    expect(g.tiles.size).toBe(1);
    expect(Array.from(g.toFull((n) => new Float32Array(n)))).toEqual(Array.from(full));
  });
});

describe('brushes', () => {
  it('raises most at the centre and is undoable', () => {
    const m = small();
    const s = new Stroke(m, 'raise', { radiusKm: 1500, strength: 1, falloff: 0.8, opacity: 1 });
    s.dab(256, 128);
    const centre = m.heightAt(256.5, 128.5);
    const edge = m.heightAt(256.5 + 8, 128.5);
    expect(centre).toBeGreaterThan(m.planet.oceanFloor);
    expect(centre).toBeGreaterThan(edge);
    const change = s.finish()!;
    m.applyTiles(change, 'before');
    expect(m.heightAt(256.5, 128.5)).toBe(m.planet.oceanFloor);
    m.applyTiles(change, 'after');
    expect(m.heightAt(256.5, 128.5)).toBeCloseTo(centre, 3);
  });

  it('caps the change a single stroke can make (opacity)', () => {
    const m = small();
    const s = new Stroke(m, 'raise', { radiusKm: 1500, strength: 1, falloff: 0.5, opacity: 0.02 });
    for (let i = 0; i < 50; i++) s.dab(256, 128);
    expect(m.heightAt(256.5, 128.5) - m.planet.oceanFloor).toBeLessThanOrEqual(0.02 * 21000 + 1e-3);
  });

  it('paints biome weights and hides / reveals fog on the half-res grids', () => {
    const m = small();
    new Stroke(m, 'paint', { radiusKm: 1200, strength: 1, falloff: 0.3, opacity: 1 }, { biome: 1 }).dab(256, 128);
    expect(m.biomeAt(256, 128)).toBe(1);
    const hide = new Stroke(m, 'fogHide', { radiusKm: 1200, strength: 1, falloff: 0.3, opacity: 1 });
    hide.dab(256, 128);
    expect(m.fogAt(256, 128)).toBeGreaterThan(0.9);
    const reveal = new Stroke(m, 'fogReveal', { radiusKm: 1200, strength: 1, falloff: 0.3, opacity: 1 });
    reveal.dab(256, 128);
    expect(m.fogAt(256, 128)).toBeLessThan(0.05);
  });

  it('reports no change for a stroke that touched nothing', () => {
    const m = small();
    const s = new Stroke(m, 'erase', { radiusKm: 500, strength: 1, falloff: 0.3, opacity: 1 });
    s.dab(100, 100);
    expect(s.finish()).toBeNull();
    expect(m.biome.tiles.size).toBe(0);
  });
});

describe('peaks', () => {
  it('finds a summit with its elevation and honours removals', () => {
    const m = small();
    const s = new Stroke(m, 'raise', { radiusKm: 900, strength: 1, falloff: 1, opacity: 1 });
    for (let i = 0; i < 40; i++) s.dab(300.5, 100.5);
    s.finish();
    const found = detectPeaks(m, 400, 300);
    expect(found.length).toBe(1);
    expect(found[0].elevation).toBeCloseTo(m.heightAt(found[0].x, found[0].y) - m.seaLevel, 0);
    const shown = resolvePeaks(m, found, [{ id: 'a', x: found[0].x, y: found[0].y, name: 'Mount Varr', mode: 'designated' }]);
    expect(shown[0].name).toBe('Mount Varr');
    const removed = resolvePeaks(m, found, [{ id: 'b', x: found[0].x, y: found[0].y, name: '', mode: 'suppressed' }]);
    expect(removed.length).toBe(0);
  });
});

describe('generator', { timeout: 60_000 }, () => {
  it('hits the requested land share by true surface area', () => {
    const W = 512;
    const H = 256;
    const res = generate({
      type: 'continents',
      seed: 7,
      W,
      H,
      landFraction: 0.29,
      mountains: 0.75,
      roughness: 0.5,
      seaLevel: 0,
      maxElevation: 10000,
      minElevation: -11000,
      oceanFloor: -3800,
      region: null,
      biomes: true,
      rivers: 0,
    });
    let land = 0;
    let total = 0;
    let max = -Infinity;
    for (let y = 0; y < H; y++) {
      const w = Math.cos(((90 - ((y + 0.5) / H) * 180) * Math.PI) / 180);
      for (let x = 0; x < W; x++) {
        const h = res.height[y * W + x];
        total += w;
        if (h > 0) land += w;
        max = Math.max(max, h);
      }
    }
    expect(land / total).toBeGreaterThan(0.26);
    expect(land / total).toBeLessThan(0.32);
    expect(max).toBeLessThanOrEqual(10000);
    expect(res.biome!.length).toBe((W / 2) * (H / 2) * 8);
  });
});

describe('antimeridian', () => {
  it('raise brushes with rough edges stay continuous across x = 0', () => {
    const m = small();
    const s = new Stroke(m, 'raise', { radiusKm: 1500, strength: 1, falloff: 0.7, opacity: 1, roughness: 1 }, { seed: 5 });
    for (let i = 0; i < 6; i++) s.dab(0, 128);
    s.finish();
    for (let y = 110; y < 146; y += 2) {
      const across = Math.abs(m.height.get(0, y) - m.height.get(m.W - 1, y));
      let nearby = 0;
      for (let k = 1; k <= 4; k++) {
        nearby = Math.max(nearby, Math.abs(m.height.get(k, y) - m.height.get(k - 1, y)));
        nearby = Math.max(nearby, Math.abs(m.height.get(m.W - k, y) - m.height.get(m.W - k - 1, y)));
      }
      // the seam must look like any other step between neighbouring cells
      expect(across).toBeLessThanOrEqual(nearby * 1.5 + 1);
    }
  });
});
