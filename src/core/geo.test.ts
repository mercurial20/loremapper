import { describe, expect, it } from 'vitest';
import { Geo } from './geo';
import { defaultPlanet, surfaceAreaKm2 } from './planet';

const planet = defaultPlanet();
const geo = new Geo(planet);

describe('planet defaults', () => {
  it('defaults to an Earth-sized planet (≈510 million km²)', () => {
    expect(planet.radiusKm).toBe(6371);
    expect(surfaceAreaKm2(planet) / 1e6).toBeCloseTo(510, 0);
  });
  it('targets 29 % land and 10 km peaks', () => {
    expect(planet.landFraction).toBe(0.29);
    expect(planet.maxElevation).toBe(10000);
  });
});

describe('equirectangular geography', () => {
  it('maps cells to longitude / latitude', () => {
    expect(geo.lon(0)).toBe(-180);
    expect(geo.lon(geo.W / 2)).toBe(0);
    expect(geo.lat(0)).toBe(90);
    expect(geo.lat(geo.H / 2)).toBe(0);
  });

  it('wraps longitude and takes the short way round', () => {
    expect(geo.wrapX(-1)).toBe(geo.W - 1);
    expect(geo.wrapX(geo.W + 5)).toBe(5);
    expect(geo.deltaX(geo.W - 2, 2)).toBe(4);
    expect(geo.deltaX(2, geo.W - 2)).toBe(-4);
  });

  it('measures great-circle distances', () => {
    const quarter = (Math.PI * planet.radiusKm) / 2;
    expect(geo.distanceKm(0, geo.H / 2, geo.W / 4, geo.H / 2)).toBeCloseTo(quarter, 3);
    // across the antimeridian is short, not half the planet
    const across = geo.distanceKm(geo.W - 1, geo.H / 2, 1, geo.H / 2);
    expect(across).toBeCloseTo(2 * geo.kmPerCellX(geo.H / 2), 3);
  });

  it('shrinks east–west distances with latitude', () => {
    const y60 = geo.yFromLat(60);
    expect(geo.kmPerCellX(y60) / geo.kmPerCellX(geo.H / 2)).toBeCloseTo(0.5, 6);
  });

  it('keeps great circles continuous across the date line', () => {
    const arc = geo.greatCircle(geo.W - 10, 900, 10, 900, 8);
    for (let i = 1; i < arc.length; i++) expect(Math.abs(arc[i][0] - arc[i - 1][0])).toBeLessThan(10);
  });
});
