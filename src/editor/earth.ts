import { gunzipSync } from 'fflate';

/**
 * Real Earth elevation and bathymetry for the "Start from Earth" map.
 *
 * Source: NOAA NGDC ETOPO1 Global Relief Model (ice surface), public domain.
 * Amante, C. and B.W. Eakins, 2009. ETOPO1 1 Arc-Minute Global Relief Model:
 * Procedures, Data Sources and Analysis. NOAA Technical Memorandum NESDIS
 * NGDC-24. doi:10.7289/V5C8276M
 *
 * Preprocessed to the standard 4096 × 2048 equirectangular grid (cell means
 * from the 2-arc-minute grid), whole metres on land and 10 m steps under the
 * sea, row-wise deltas, gzip. Loaded only when the user picks Earth.
 */
export const EARTH_ASSET = 'data/earth-etopo1-4096x2048.v1.bin.gz';
export const EARTH_W = 4096;
export const EARTH_H = 2048;
export const EARTH_RADIUS_KM = 6371;
export const EARTH_CREDIT = 'Elevation: NOAA NGDC ETOPO1 Global Relief Model (Amante & Eakins 2009), public domain';

/** Decode the asset (gzipped or already decompressed by the server) into heights in metres. */
export function decodeEarth(bytes: Uint8Array): Float32Array {
  const data = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
  const magic = String.fromCharCode(...data.subarray(0, 7));
  if (magic !== 'LMEARTH' || data[7] !== 1) throw new Error('The Earth data file is not in the expected format.');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const W = view.getUint32(8, true);
  const H = view.getUint32(12, true);
  if (W !== EARTH_W || H !== EARTH_H || data.byteLength < 16 + W * H * 2) throw new Error('The Earth data file is incomplete.');
  const out = new Float32Array(W * H);
  for (let j = 0; j < H; j++) {
    let v = 0;
    const row = j * W;
    for (let i = 0; i < W; i++) {
      v += view.getInt16(16 + (row + i) * 2, true);
      out[row + i] = v;
    }
  }
  return out;
}

/** Download and decode Earth's heights; throws a readable error if anything goes wrong. */
export async function loadEarth(): Promise<Float32Array> {
  let res: Response;
  try {
    res = await fetch(import.meta.env.BASE_URL + EARTH_ASSET);
  } catch {
    throw new Error('Could not download the Earth data. Check your connection and try again.');
  }
  if (!res.ok) throw new Error(`Could not download the Earth data (HTTP ${res.status}).`);
  return decodeEarth(new Uint8Array(await res.arrayBuffer()));
}
