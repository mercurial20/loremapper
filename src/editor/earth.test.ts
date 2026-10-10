import { gzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { decodeEarth, EARTH_H, EARTH_W } from './earth';

/** Encode heights the way the build script does: header, row-wise Int16 deltas. */
function encode(heights: Int16Array): Uint8Array {
  const out = new Uint8Array(16 + heights.length * 2);
  out.set([...'LMEARTH'].map((c) => c.charCodeAt(0)), 0);
  out[7] = 1;
  const v = new DataView(out.buffer);
  v.setUint32(8, EARTH_W, true);
  v.setUint32(12, EARTH_H, true);
  for (let j = 0; j < EARTH_H; j++)
    for (let i = 0; i < EARTH_W; i++) {
      const k = j * EARTH_W + i;
      v.setInt16(16 + k * 2, heights[k] - (i ? heights[k - 1] : 0), true);
    }
  return out;
}

describe('Earth data', () => {
  const h = new Int16Array(EARTH_W * EARTH_H);
  for (let k = 0; k < h.length; k++) h[k] = ((k * 7919) % 20000) - 10000;
  const raw = encode(h);

  it('decodes gzipped and already-decompressed files alike', () => {
    for (const bytes of [gzipSync(raw), raw]) {
      const out = decodeEarth(bytes);
      expect(out.length).toBe(EARTH_W * EARTH_H);
      expect(out[12345]).toBe(h[12345]);
      expect(out[out.length - 1]).toBe(h[h.length - 1]);
    }
  });

  it('refuses a file that is not Earth data', () => {
    const bad = raw.slice();
    bad[0] = 0x58;
    expect(() => decodeEarth(bad)).toThrow(/not in the expected format/);
    expect(() => decodeEarth(raw.slice(0, 1000))).toThrow(/incomplete/);
  });
});
