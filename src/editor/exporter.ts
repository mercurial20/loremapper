import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { RenderTexture } from 'pixi.js';
import { assetLibrary } from '../assets/library';
import { FORMAT_VERSION, migrateProject } from '../model/serialization';
import type { AssetRecord, ProjectRecord, TileRecord } from '../persistence/db';
import { getProjectRecord, writeFullProject } from '../persistence/projects';
import { Camera } from '../render/Camera';
import { useDoc } from '../store/docStore';
import { useEditor } from '../store/editorStore';
import { RASTER_LAYERS, type RasterLayer } from '../terrain/TerrainModel';
import { APP_VERSION } from '../version';
import { editor } from './Editor';
import { downloadBlob, encodePng, safeFileName } from './png';

export type FogExport = 'none' | 'revealed';

export interface ImageExportOptions {
  region: 'world' | 'view';
  width: number;
  fog: FogExport;
  includePeaks: boolean;
}

const MAX_TILE = 4096;
const BAND = 512;

/** Size in pixels an export would have. */
export function exportSize(o: Pick<ImageExportOptions, 'region' | 'width'>): { width: number; height: number } {
  const r = editor.renderer!;
  const m = editor.model!;
  if (o.region === 'world') return { width: o.width, height: Math.round((o.width * m.H) / m.W) };
  const v = r.camera.visible;
  const y0 = Math.max(0, v.y0);
  const y1 = Math.min(m.H, v.y1);
  return { width: o.width, height: Math.max(1, Math.round((o.width * (y1 - y0)) / (v.x1 - v.x0))) };
}

/**
 * Render a world rectangle to RGBA rows, band by band, tile by tile, so the
 * output may exceed the GPU's maximum texture size.
 */
async function renderToPng(x0: number, y0: number, x1: number, y1: number, outW: number, outH: number, o: ImageExportOptions, text?: Record<string, string>) {
  const r = editor.renderer!;
  const L = editor.layers!;
  const zoom = outW / (x1 - x0);
  const overlayVisible = L.overlay.container.visible;
  const fogVisible = r.fog.container.visible;
  const peaksVisible = L.peaks.container.visible;
  L.overlay.container.visible = false;
  if (o.fog === 'none') r.fog.container.visible = false;
  else {
    r.fog.container.visible = true;
    r.fogPreviewOverride = false;
    r.applyStyle(useDoc.getState().doc, useDoc.getState().meta!, false);
  }
  if (!o.includePeaks) L.peaks.container.visible = false;
  const cam = new Camera(editor.model!.W, editor.model!.H);
  cam.viewW = outW;
  cam.viewH = outH;
  cam.zoom = zoom;
  cam.x = (x0 + x1) / 2;
  cam.y = (y0 + y1) / 2;
  L.peaks.cameraOverride = cam;

  const band = new Uint8Array(outW * BAND * 4);
  let bandY = -1;
  const rt = RenderTexture.create({ width: Math.min(MAX_TILE, outW), height: BAND, resolution: 1 });
  const renderBand = (by: number) => {
    const bh = Math.min(BAND, outH - by);
    band.fill(0);
    for (let bx = 0; bx < outW; bx += MAX_TILE) {
      const bw = Math.min(MAX_TILE, outW - bx);
      rt.resize(bw, bh, 1);
      const cx = x0 + (bx + bw / 2) / zoom;
      const cy = y0 + (by + bh / 2) / zoom;
      r.drawWorld(zoom, cx, cy, bw, bh, rt);
      const { pixels } = r.renderer.extract.pixels(rt);
      for (let j = 0; j < bh; j++) {
        const src = pixels.subarray(j * bw * 4, (j + 1) * bw * 4);
        band.set(src, (j * outW + bx) * 4);
      }
    }
    // un-premultiply partially transparent pixels
    for (let i = 0; i < band.length; i += 4) {
      const a = band[i + 3];
      if (a > 0 && a < 255) {
        band[i] = Math.min(255, (band[i] * 255) / a);
        band[i + 1] = Math.min(255, (band[i + 1] * 255) / a);
        band[i + 2] = Math.min(255, (band[i + 2] * 255) / a);
      }
    }
    bandY = by;
  };
  try {
    return await encodePng({
      width: outW,
      height: outH,
      colorType: 6,
      bitDepth: 8,
      text,
      row: async (y) => {
        const by = Math.floor(y / BAND) * BAND;
        if (by !== bandY) {
          renderBand(by);
          useEditor.getState().set({ busy: `Rendering… ${Math.round((by / outH) * 100)}%` });
          await new Promise((res) => setTimeout(res, 0));
        }
        const j = y - by;
        return band.subarray(j * outW * 4, (j + 1) * outW * 4);
      },
    });
  } finally {
    rt.destroy(true);
    L.peaks.cameraOverride = null;
    L.overlay.container.visible = overlayVisible;
    r.fog.container.visible = fogVisible;
    L.peaks.container.visible = peaksVisible;
    r.fogPreviewOverride = null;
    r.applyStyle(useDoc.getState().doc, useDoc.getState().meta!, useEditor.getState().fogPreview);
    r.renderFrame();
  }
}

export async function exportImage(o: ImageExportOptions) {
  const m = editor.model!;
  const r = editor.renderer!;
  const { width, height } = exportSize(o);
  let x0: number, x1: number, y0: number, y1: number;
  if (o.region === 'world') {
    x0 = 0;
    x1 = m.W;
    y0 = 0;
    y1 = m.H;
  } else {
    const v = r.camera.visible;
    x0 = v.x0;
    x1 = v.x1;
    y0 = Math.max(0, v.y0);
    y1 = Math.min(m.H, v.y1);
  }
  const meta = useDoc.getState().meta!;
  useEditor.getState().set({ busy: 'Rendering…' });
  try {
    const blob = await renderToPng(x0, y0, x1, y1, width, height, o, {
      Title: meta.name,
      Software: 'Loremapper',
      Description: o.fog === 'revealed' ? 'Player map (revealed areas only)' : 'Complete map',
    });
    downloadBlob(blob, `${safeFileName(meta.name)}${o.fog === 'revealed' ? '-player' : ''}-${width}x${height}.png`);
  } finally {
    useEditor.getState().set({ busy: null });
  }
}

/** Small PNG of the whole world for the projects list. */
export async function renderThumbnail(): Promise<Blob | null> {
  const r = editor.renderer;
  const m = editor.model;
  const L = editor.layers;
  if (!r || !m || !L) return null;
  const w = 320;
  const h = 160;
  const rt = RenderTexture.create({ width: w, height: h, resolution: 1 });
  const ov = L.overlay.container.visible;
  const pk = L.peaks.container.visible;
  L.overlay.container.visible = false;
  L.peaks.container.visible = false;
  try {
    r.drawWorld(w / m.W, m.W / 2, m.H / 2, w, h, rt);
    const canvas = r.renderer.extract.canvas(rt) as HTMLCanvasElement;
    return await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), 'image/png'));
  } finally {
    rt.destroy(true);
    L.overlay.container.visible = ov;
    L.peaks.container.visible = pk;
    r.requestRender();
  }
}

/** Export elevation as a greyscale PNG (16-bit by default). */
export async function exportHeightmap(bits: 8 | 16, width?: number) {
  const m = editor.model!;
  const meta = useDoc.getState().meta!;
  const p = m.planet;
  const lo = p.minElevation;
  const hi = p.seaLevel + p.maxElevation;
  const outW = Math.min(width ?? m.W, m.W);
  const outH = Math.round((outW * m.H) / m.W);
  const max = bits === 16 ? 65535 : 255;
  const bpp = bits / 8;
  const row = new Uint8Array(outW * bpp);
  const sx = m.W / outW;
  const sy = m.H / outH;
  useEditor.getState().set({ busy: 'Encoding heightmap…' });
  try {
    const blob = await encodePng({
      width: outW,
      height: outH,
      colorType: 0,
      bitDepth: bits,
      text: {
        Title: `${meta.name} heightmap`,
        Description: `Elevation ${lo} m (black) to ${hi} m (white); sea level ${p.seaLevel} m; ${
          m.geo.flat ? `flat map ${Math.round(m.W * m.geo.cellKm)} × ${Math.round(m.H * m.geo.cellKm)} km, uniform scale` : `planet radius ${p.radiusKm} km; equirectangular`
        }`,
      },
      row: (y) => {
        const wy = (y + 0.5) * sy;
        for (let x = 0; x < outW; x++) {
          const h = m.height.sample((x + 0.5) * sx, wy);
          const v = Math.round(((h - lo) / (hi - lo)) * max);
          const c = v < 0 ? 0 : v > max ? max : v;
          if (bits === 16) {
            row[x * 2] = c >> 8;
            row[x * 2 + 1] = c & 255;
          } else row[x] = c;
        }
        return row;
      },
    });
    downloadBlob(blob, `${safeFileName(meta.name)}-heightmap-${bits}bit_${lo}m_to_${hi}m.png`);
  } finally {
    useEditor.getState().set({ busy: null });
  }
}

// ---------------------------------------------------------------- project archive

/**
 * Pre-compression transform for 32-bit tiles: XOR each value's bits with its
 * left neighbour's (smooth terrain → mostly zero high bits), then split the
 * bytes into planes. Lossless; typically halves the deflated size.
 */
function shuffleBytes(src: Uint8Array, size: number): Uint8Array {
  const n = src.length / size;
  let data = src;
  if (size === 4) {
    const u = new Uint32Array(src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength));
    for (let i = n - 1; i > 0; i--) u[i] ^= u[i - 1];
    data = new Uint8Array(u.buffer);
  }
  const out = new Uint8Array(src.length);
  for (let b = 0; b < size; b++) for (let i = 0; i < n; i++) out[b * n + i] = data[i * size + b];
  return out;
}

function unshuffleBytes(src: Uint8Array, size: number): Uint8Array {
  const n = src.length / size;
  const out = new Uint8Array(src.length);
  for (let b = 0; b < size; b++) for (let i = 0; i < n; i++) out[i * size + b] = src[b * n + i];
  if (size === 4) {
    const u = new Uint32Array(out.buffer);
    for (let i = 1; i < n; i++) u[i] ^= u[i - 1];
  }
  return out;
}

const EXT: Record<string, string> = { 'image/png': 'png', 'image/webp': 'webp', 'image/svg+xml': 'svg' };

interface Manifest {
  /** `fantasy-cartographer-project` was written by builds before the rename. */
  format: 'loremapper-project' | 'fantasy-cartographer-project';
  formatVersion: number;
  appVersion?: string;
  exportedAt: string;
  record: Omit<ProjectRecord, 'thumbnail'>;
  /** `shuffle` = bytes per element when stored byte-plane shuffled (better compression). */
  tiles: { layer: RasterLayer; index: number; file: string; shuffle?: number }[];
  assets: (Omit<AssetRecord, 'blob'> & { file?: string })[];
}

/** Save the open project (with tiles and the custom assets it uses) as one file. */
export async function exportProject() {
  await editor.saveNow();
  const { meta } = useDoc.getState();
  const m = editor.model!;
  if (!meta) return;
  const rec = await getProjectRecord(meta.id);
  if (!rec) return;
  useEditor.getState().set({ busy: 'Packing project…' });
  try {
    const files: Zippable = {};
    const tiles: Manifest['tiles'] = [];
    for (const layer of RASTER_LAYERS) {
      for (const [k, t] of m.grid(layer).tiles) {
        const file = `tiles/${layer}/${k}.bin`;
        const bytes = new Uint8Array(t.buffer.slice(t.byteOffset, t.byteOffset + t.byteLength));
        const size = t.BYTES_PER_ELEMENT;
        files[file] = size > 1 ? shuffleBytes(bytes, size) : bytes;
        tiles.push({ layer, index: k, file, shuffle: size > 1 ? size : undefined });
      }
    }
    const used = new Set(Object.values(rec.doc.objects).map((o) => o.assetId));
    const assets: Manifest['assets'] = [];
    for (const id of used) {
      const a = await assetLibrary.exportRecord(id);
      if (!a) continue;
      const { blob, ...metaRec } = a;
      let file: string | undefined;
      if (blob) {
        file = `assets/${id.replace(/[^\w-]/g, '_')}.${EXT[a.mime ?? ''] ?? 'bin'}`;
        files[file] = new Uint8Array(await blob.arrayBuffer());
      }
      assets.push({ ...metaRec, file });
    }
    const { thumbnail, ...record } = rec;
    if (thumbnail) files['thumbnail.png'] = new Uint8Array(await thumbnail.arrayBuffer());
    const manifest: Manifest = {
      format: 'loremapper-project',
      formatVersion: FORMAT_VERSION,
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      record,
      tiles,
      assets,
    };
    files['project.json'] = strToU8(JSON.stringify(manifest));
    const zipped = zipSync(files, { level: 6 });
    downloadBlob(new Blob([zipped as BlobPart], { type: 'application/zip' }), `${safeFileName(meta.name)}.loremap`);
  } finally {
    useEditor.getState().set({ busy: null });
  }
}

/** Import a `.loremap` archive (or a pre-rename `.fantasymap`) as a new project and open it. */
export async function importProject(file: File) {
  useEditor.getState().set({ busy: 'Importing project…' });
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(buf);
    } catch {
      throw new Error('This file is not a Loremapper project (.loremap).');
    }
    const mf = files['project.json'];
    if (!mf) throw new Error('project.json missing from archive');
    const manifest = JSON.parse(strFromU8(mf)) as Manifest;
    if (manifest.format !== 'loremapper-project' && manifest.format !== 'fantasy-cartographer-project') throw new Error('Unknown project format');
    const record = migrateProject({ ...manifest.record, formatVersion: manifest.formatVersion } as unknown as Record<string, unknown>);
    // always import as a new project so nothing is overwritten
    const id = crypto.randomUUID();
    record.id = id;
    record.meta = { ...record.meta, id, name: record.meta.name + ' (imported)', updatedAt: Date.now() };
    record.updatedAt = Date.now();
    if (files['thumbnail.png']) record.thumbnail = new Blob([files['thumbnail.png'] as BlobPart], { type: 'image/png' });
    const tiles: TileRecord[] = [];
    for (const t of manifest.tiles) {
      const raw = files[t.file];
      if (!raw) continue;
      const data = t.shuffle ? unshuffleBytes(raw, t.shuffle) : raw.slice();
      tiles.push({ projectId: id, layer: t.layer, index: t.index, data: data.buffer as ArrayBuffer });
    }
    const assets: AssetRecord[] = [];
    for (const a of manifest.assets) {
      const { file: f, ...rest } = a;
      const blob = f && files[f] ? new Blob([files[f] as BlobPart], { type: a.mime ?? 'image/png' }) : undefined;
      assets.push({ ...rest, blob } as AssetRecord);
    }
    await assetLibrary.importRecords(assets);
    await writeFullProject(record, tiles);
    await editor.openProject(id);
    useEditor.getState().notify(`Imported “${record.meta.name}”`);
  } finally {
    useEditor.getState().set({ busy: null });
  }
}
