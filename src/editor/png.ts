/**
 * Minimal streaming PNG encoder (RGBA8 or 16-bit greyscale) using the
 * browser's CompressionStream. Avoids canvas size limits for large exports.
 * Adapted from the original Cartographer's 16-bit heightmap writer.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out, 4, 8 + data.length));
  return out;
}

async function deflate(rows: (write: (u: Uint8Array) => Promise<void>) => Promise<void>): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate');
  const writer = cs.writable.getWriter();
  const done = new Response(cs.readable).arrayBuffer();
  await rows(async (u) => {
    await writer.ready;
    await writer.write(u as Uint8Array<ArrayBuffer>);
  });
  await writer.close();
  return new Uint8Array(await done);
}

export interface PngSpec {
  width: number;
  height: number;
  /** 6 = RGBA, 0 = greyscale */
  colorType: 6 | 0;
  bitDepth: 8 | 16;
  /** Provide row `y` (without the filter byte). */
  row: (y: number) => Uint8Array | Promise<Uint8Array>;
  text?: Record<string, string>;
}

export async function encodePng(spec: PngSpec): Promise<Blob> {
  const { width, height, colorType, bitDepth } = spec;
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = bitDepth;
  ihdr[9] = colorType;
  const bpp = (colorType === 6 ? 4 : 1) * (bitDepth / 8);
  const rowLen = width * bpp;
  const idat = await deflate(async (write) => {
    const buf = new Uint8Array(1 + rowLen);
    for (let y = 0; y < height; y++) {
      const r = await spec.row(y);
      buf[0] = 0;
      buf.set(r.subarray(0, rowLen), 1);
      await write(buf.slice());
    }
  });
  const parts: Uint8Array[] = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr)];
  for (const [k, v] of Object.entries(spec.text ?? {})) parts.push(chunk('tEXt', new TextEncoder().encode(`${k}\0${v}`)));
  parts.push(chunk('IDAT', idat), chunk('IEND', new Uint8Array(0)));
  return new Blob(parts as BlobPart[], { type: 'image/png' });
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function safeFileName(s: string): string {
  return (s || 'map').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'map';
}
