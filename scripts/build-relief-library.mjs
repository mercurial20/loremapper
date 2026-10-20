// Build the library of real relief the generator draws its fine detail from:
// `node scripts/build-relief-library.mjs` writes public/relief/library.bin.
//
// Patches of real land are cut from open elevation tiles (Terrarium tiles on AWS Open Data,
// made from SRTM, GMTED2010, ETOPO1 and other public sources; see public/relief/ATTRIBUTION.md),
// in two sizes of cell: 250 m (the valleys and spurs of a mountainside) and 2 km (the ridges and
// valleys of a range). From each only the detail is kept (the patch less a smooth version of
// itself), with how strong that detail is next to the land's broad relief, and the way the broad
// land falls there (so gullies can be laid to run downhill).
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const CACHE = 'node_modules/.cache/relief-tiles';
const OUT = 'public/relief/library.bin';
/** Patch side, cells. */
const SIZE = 128;
/** Cell sizes (m) of the two scales, and the zoom of the tiles they are cut from. */
const SCALES = [
  { cellM: 250, zoom: 10, blurCells: 10 },
  { cellM: 2000, zoom: 7, blurCells: 10 },
];
/** Patches per region and scale. */
const PER_REGION = [6, 3];

/** Regions of each kind of land: [name, south, north, west, east]. */
const KINDS = {
  // young, high ranges: sharp ridges, deep branching valleys, cirques
  alpine: [
    ['Alps', 45.6, 47.0, 7.0, 13.0],
    ['Caucasus', 42.6, 43.4, 41.5, 46.0],
    ['Himalaya', 27.6, 29.0, 84.0, 89.0],
    ['Pamir', 37.6, 39.0, 71.5, 74.5],
    ['Tien Shan', 41.5, 42.8, 75.0, 80.0],
    ['Andes', -34.0, -31.5, -70.6, -69.8],
    ['Southern Alps', -44.0, -43.2, 169.8, 171.4],
    ['Rocky Mountains', 38.6, 40.0, -107.5, -105.8],
    ['Pyrenees', 42.5, 42.9, -0.6, 1.8],
    ['Hindu Kush', 35.4, 36.4, 70.0, 72.5],
  ],
  // old, worn ranges and hill country: rounded ridges, dense valleys
  hills: [
    ['Appalachians', 37.0, 38.6, -81.5, -79.0],
    ['Ardennes', 49.9, 50.4, 4.8, 6.2],
    ['Massif Central', 44.6, 45.6, 2.2, 3.8],
    ['Scottish Highlands', 56.6, 57.4, -5.2, -3.4],
    ['Carpathians', 48.0, 48.8, 22.8, 25.0],
    ['Ozarks', 35.6, 36.6, -94.0, -91.6],
    ['Apennines', 42.6, 43.8, 11.8, 13.6],
    ['Balkans', 42.6, 43.6, 19.5, 22.0],
    ['Black Forest', 47.9, 48.6, 7.9, 8.6],
    ['Urals', 54.0, 56.0, 58.4, 59.6],
  ],
  // tablelands: flat tops, steep scarps and canyons cut into them
  plateau: [
    ['Colorado Plateau', 36.2, 37.4, -112.6, -110.2],
    ['Ethiopian Highlands', 11.0, 12.6, 38.0, 39.6],
    ['Deccan Traps', 18.6, 19.8, 73.6, 75.0],
    ['Columbia Plateau', 45.8, 46.8, -119.0, -117.2],
    ['Drakensberg', -29.6, -28.6, 28.8, 29.8],
    ['Altiplano', -19.6, -18.0, -68.6, -67.2],
    ['Tibetan Plateau', 32.0, 33.2, 86.0, 90.0],
    ['Massif of Ennedi', 16.6, 17.6, 21.6, 23.2],
  ],
};

mkdirSync(CACHE, { recursive: true });
mkdirSync('public/relief', { recursive: true });

/** Decode an 8-bit RGB PNG (Terrarium) to heights in metres. */
function decodePng(buf) {
  let i = 8;
  let w = 0;
  let h = 0;
  const idat = [];
  while (i < buf.length) {
    const n = buf.readUInt32BE(i);
    const t = buf.toString('ascii', i + 4, i + 8);
    const c = buf.subarray(i + 8, i + 8 + n);
    if (t === 'IHDR') {
      w = c.readUInt32BE(0);
      h = c.readUInt32BE(4);
      if (c[8] !== 8 || c[9] !== 2) throw new Error('unexpected PNG format');
    } else if (t === 'IDAT') idat.push(c);
    i += 12 + n;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * 3;
  const out = new Float32Array(w * h);
  let prev = new Uint8Array(stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++];
    const line = new Uint8Array(raw.subarray(p, p + stride));
    p += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= 3 ? line[x - 3] : 0;
      const b = prev[x];
      const c = x >= 3 ? prev[x - 3] : 0;
      if (f === 1) line[x] = (line[x] + a) & 255;
      else if (f === 2) line[x] = (line[x] + b) & 255;
      else if (f === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
      else if (f === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    for (let x = 0; x < w; x++) out[y * w + x] = line[x * 3] * 256 + line[x * 3 + 1] + line[x * 3 + 2] / 256 - 32768;
    prev = line;
  }
  return { w, h, data: out };
}

const tiles = new Map();
async function tile(z, x, y) {
  const key = `${z}/${x}/${y}`;
  if (tiles.has(key)) return tiles.get(key);
  const path = `${CACHE}/${z}_${x}_${y}.png`;
  if (!existsSync(path)) {
    const res = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`);
    if (!res.ok) throw new Error(`tile ${key}: ${res.status}`);
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  }
  const t = decodePng(readFileSync(path));
  tiles.set(key, t);
  return t;
}

/** Web Mercator: tile coordinates (fractional) of a point. */
const tileXY = (lat, lon, z) => {
  const n = 2 ** z;
  return [((lon + 180) / 360) * n, ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n];
};

/** Height at a point (bilinear in the tile's pixels). */
async function heightAt(lat, lon, z) {
  const [fx, fy] = tileXY(lat, lon, z);
  const px = fx * 256 - 0.5;
  const py = fy * 256 - 0.5;
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const get = async (x, y) => {
    const t = await tile(z, Math.floor(x / 256), Math.floor(y / 256));
    return t.data[(((y % 256) + 256) % 256) * 256 + (((x % 256) + 256) % 256)];
  };
  const a = await get(x0, y0);
  const b = await get(x0 + 1, y0);
  const c = await get(x0, y0 + 1);
  const d = await get(x0 + 1, y0 + 1);
  const tx = px - x0;
  const ty = py - y0;
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

/** Separable box blur, `passes` times (about a Gaussian), edges clamped. */
function blur(src, n, r, passes = 3) {
  let a = Float32Array.from(src);
  let b = new Float32Array(a.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        let s = 0;
        for (let k = -r; k <= r; k++) s += a[y * n + Math.min(n - 1, Math.max(0, x + k))];
        b[y * n + x] = s / (2 * r + 1);
      }
    [a, b] = [b, a];
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        let s = 0;
        for (let k = -r; k <= r; k++) s += a[Math.min(n - 1, Math.max(0, y + k)) * n + x];
        b[y * n + x] = s / (2 * r + 1);
      }
    [a, b] = [b, a];
  }
  return a;
}

let seed = 12345;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

const patches = [];
for (const [s, scale] of SCALES.entries())
  for (const [kind, regions] of Object.entries(KINDS))
    for (const [name, south, north, west, east] of regions) {
      let made = 0;
      for (let tries = 0; tries < PER_REGION[s] * 6 && made < PER_REGION[s]; tries++) {
        // a square of SIZE cells of cellM metres, somewhere in the region
        const lat0 = south + (north - south) * rnd();
        const lon0 = west + (east - west) * rnd();
        const mPerDegLat = 111_320;
        const mPerDegLon = 111_320 * Math.cos((lat0 * Math.PI) / 180);
        const half = (SIZE * scale.cellM) / 2;
        const h = new Float32Array(SIZE * SIZE);
        let sea = 0;
        for (let y = 0; y < SIZE; y++)
          for (let x = 0; x < SIZE; x++) {
            const lat = lat0 + (half - (y + 0.5) * scale.cellM) / mPerDegLat;
            const lon = lon0 + ((x + 0.5) * scale.cellM - half) / mPerDegLon;
            const v = await heightAt(lat, lon, scale.zoom);
            h[y * SIZE + x] = v;
            if (v <= 1) sea++;
          }
        // land only (the sea's floor is not land's relief)
        if (sea > SIZE * SIZE * 0.002) continue;
        const low = blur(h, SIZE, scale.blurCells);
        const detail = new Float32Array(SIZE * SIZE);
        let s2 = 0;
        for (let i = 0; i < detail.length; i++) {
          detail[i] = h[i] - low[i];
          s2 += detail[i] * detail[i];
        }
        const std = Math.sqrt(s2 / detail.length);
        if (std < 2) continue;
        // the broad land's own relief over the patch: how strong the detail is next to it
        let lm = 0;
        for (const v of low) lm += v;
        lm /= low.length;
        let ls = 0;
        for (const v of low) ls += (v - lm) ** 2;
        ls = Math.sqrt(ls / low.length);
        // which way the broad land falls (mean gradient, downhill), to lay the gullies downhill
        let gx = 0;
        let gy = 0;
        for (let y = 1; y < SIZE - 1; y++)
          for (let x = 1; x < SIZE - 1; x++) {
            gx += low[y * SIZE + x + 1] - low[y * SIZE + x - 1];
            gy += low[(y + 1) * SIZE + x] - low[(y - 1) * SIZE + x];
          }
        const q = new Int8Array(SIZE * SIZE);
        for (let i = 0; i < q.length; i++) q[i] = Math.max(-127, Math.min(127, Math.round((detail[i] / std) * 40)));
        patches.push({ kind, scale: s, name, std: Math.round(std * 10) / 10, relief: Math.round(ls * 10) / 10, height: Math.round(lm), downhill: Math.round(Math.atan2(-gy, -gx) * 1000) / 1000, data: q });
        made++;
        process.stdout.write(`\r${patches.length} patches (${kind}, ${name}, ${scale.cellM} m)        `);
      }
    }

const meta = {
  version: 1,
  size: SIZE,
  /** detail = value / 40 · std (metres) */
  unit: 40,
  scales: SCALES.map((s) => s.cellM),
  patches: patches.map(({ data: _data, ...m }) => m),
};
const head = Buffer.from(JSON.stringify(meta));
const len = Buffer.alloc(4);
len.writeUInt32LE(head.length);
writeFileSync(OUT, Buffer.concat([len, head, ...patches.map((p) => Buffer.from(p.data.buffer))]));
console.log(`\nwrote ${OUT}: ${patches.length} patches, ${(4 + head.length + patches.length * SIZE * SIZE) >> 10} KB`);
