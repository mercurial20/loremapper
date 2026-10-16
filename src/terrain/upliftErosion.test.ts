import { describe, expect, it } from 'vitest';
import { upliftRelief } from './upliftErosion';

/** A range across a window: uplift strongest along a line, fading to nothing at its sides. */
function range(w: number, h: number) {
  const uplift = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const d = Math.abs(y - h / 2) / (h * 0.4);
      const e = Math.min(1, Math.min(x, w - 1 - x) / 20);
      uplift[y * w + x] = d < 1 ? (1 - d * d) * e : 0;
    }
  return uplift;
}

describe('mountains from uplift and erosion', () => {
  const w = 160;
  const h = 100;
  const cellKm = 0.25;
  const uplift = range(w, h);
  const z = upliftRelief({ w, h, uplift: uplift.slice(), cellKm, peakM: 2500, seed: 7 });

  it('raises only where there is uplift, up to the summit asked for', () => {
    let top = 0;
    for (let i = 0; i < z.length; i++) {
      if (uplift[i] <= 0) expect(z[i]).toBe(0);
      top = Math.max(top, z[i]);
    }
    expect(top).toBeGreaterThan(2500 * 0.9);
    expect(top).toBeLessThanOrEqual(2500 + 1e-3);
  });

  it('carves valleys that drain: hardly any closed hollows', () => {
    let pits = 0;
    let land = 0;
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (z[i] <= 0) continue;
        land++;
        let lower = false;
        for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) if ((j || k) && z[i + j * w + k] < z[i]) lower = true;
        if (!lower) pits++;
      }
    expect(pits / land).toBeLessThan(0.005);
  });

  it('makes real relief: valleys cut deep between the ridges', () => {
    // along the crest line, heights rise and fall by hundreds of metres (ridges and saddles), not a smooth dome
    const row = Array.from({ length: w - 60 }, (_, i) => z[(h / 2) * w + 30 + i]);
    expect(Math.max(...row) - Math.min(...row)).toBeGreaterThan(300);
    // hillslopes stay near the threshold: 95 % of cells are no steeper towards their steepest
    // neighbour than about 45°
    const slopes: number[] = [];
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        let s = 0;
        for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) if (j || k) s = Math.max(s, (z[i] - z[i + j * w + k]) / (Math.hypot(j, k) * cellKm * 1000));
        slopes.push(s);
      }
    slopes.sort((a, b) => a - b);
    expect(slopes[Math.floor(slopes.length * 0.95)]).toBeLessThan(1);
  });
});
