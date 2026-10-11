import { describe, expect, it } from 'vitest';
import { makeProjection, PROJECTIONS, type ProjectionParams } from './projections';

const RAD = Math.PI / 180;
const params = (o: Partial<ProjectionParams>): ProjectionParams => ({ id: 'equirectangular', lon0: 0, lat0: 0, extent: 180, ...o });
const angle = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

describe('map projections', () => {
  for (const { id } of PROJECTIONS)
    for (const [lon0, lat0] of [
      [0, 0],
      [37, 90],
      [-120, -35],
    ])
      it(`${id} (centre ${lon0}°, ${lat0}°): inverse undoes forward`, () => {
        const proj = makeProjection(params({ id, lon0, lat0 }));
        let checked = 0;
        for (let lat = -84; lat <= 84; lat += 12)
          for (let lon = -175; lon <= 175; lon += 25) {
            const p = proj.forward(lon * RAD, lat * RAD);
            if (!p) continue;
            const q = proj.inverse(p[0], p[1]);
            expect(q).not.toBeNull();
            expect(angle(q![1], lat * RAD)).toBeLessThan(1e-6);
            // longitude is undefined at a pole
            if (Math.abs(q![1]) < Math.PI / 2 - 1e-6) expect(angle(q![0], lon * RAD)).toBeLessThan(1e-6);
            checked++;
          }
        expect(checked).toBeGreaterThan(20);
      });

  it('puts the north pole at the middle of a polar azimuthal map, the equator a quarter turn out', () => {
    const proj = makeProjection(params({ id: 'azimuthal', lat0: 90, extent: 180 }));
    const pole = proj.forward(0, Math.PI / 2)!;
    expect(Math.hypot(...pole)).toBeLessThan(1e-9);
    const eq = proj.forward(1, 0)!;
    expect(Math.hypot(...eq)).toBeCloseTo(Math.PI / 2, 9);
  });

  it('hides the far side of the globe and clamps it to the rim', () => {
    const proj = makeProjection(params({ id: 'orthographic', lon0: 0, lat0: 0 }));
    expect(proj.forward(Math.PI, 0)).toBeNull();
    expect(Math.hypot(...proj.clamp(Math.PI * 0.9, 0.1))).toBeCloseTo(1, 9);
  });

  it('Gott: the two disks meet along the equator, and a point on it lands on both rims at the same height', () => {
    const proj = makeProjection(params({ id: 'gott' }));
    const cx = Math.PI / 2 + 0.07;
    const north = proj.clamp(0.7, 0, 0);
    const south = proj.clamp(0.7, 0, 1);
    expect(Math.hypot(north[0] + cx, north[1])).toBeCloseTo(Math.PI / 2, 9);
    expect(Math.hypot(south[0] - cx, south[1])).toBeCloseTo(Math.PI / 2, 9);
    expect(north[1]).toBeCloseTo(south[1], 9);
    expect(north[0]).toBeCloseTo(-south[0], 9);
  });

  it('keeps equal-area maps equal-area: equal latitude bands have areas in the sphere’s proportion', () => {
    for (const id of ['mollweide', 'equalEarth'] as const) {
      const proj = makeProjection(params({ id }));
      // area of the band between two latitudes, from the outline width at each height
      const band = (a: number, b: number) => {
        let s = 0;
        const n = 400;
        for (let k = 0; k < n; k++) {
          const lat = (a + ((b - a) * (k + 0.5)) / n) * RAD;
          const [, y0] = proj.forward(0, lat - ((b - a) * RAD) / (2 * n))!;
          const [, y1] = proj.forward(0, lat + ((b - a) * RAD) / (2 * n))!;
          const [xe] = proj.forward(Math.PI - 1e-9, lat)!;
          s += 2 * xe * (y1 - y0);
        }
        return s;
      };
      const ratio = band(0, 30) / band(60, 90);
      const sphere = (Math.sin(30 * RAD) - 0) / (1 - Math.sin(60 * RAD));
      expect(ratio / sphere).toBeCloseTo(1, 2);
    }
  });
});
