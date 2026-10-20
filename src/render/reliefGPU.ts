import { BufferImageSource, type UniformGroup } from 'pixi.js';
import type { ReliefLibrary } from '../terrain/reliefDetail';
import type { TerrainModel } from '../terrain/TerrainModel';

/*
 * The fine relief of real land, drawn by the terrain shader when the map is zoomed in past its
 * own cells (nothing of it is stored: it follows the land as it is edited). The library's patches
 * go to the GPU in one atlas; a coarse field tells the shader, around every point, which way the
 * land falls, how strong its relief is at each of the library's scales, and how high it is. The
 * shader lays patches on a lattice from these, as reliefDetail does on the CPU.
 */

/** Patches per row of the atlas, and its side in texels. */
const ROW = 16;
/** Map cells per cell of the field. */
export const FIELD_STEP = 4;
const KINDS = ['alpine', 'hills', 'plateau'] as const;

export class ReliefGPU {
  readonly atlas: BufferImageSource;
  /** Per patch: which way its land fell, its detail-to-relief ratio. */
  readonly info: BufferImageSource;
  /** Per field cell: which way the land falls, its relief at the two scales, its mean height. */
  readonly field: BufferImageSource;
  private readonly fw: number;
  private readonly fh: number;
  private timer = 0;

  private lib: ReliefLibrary;
  private model: TerrainModel;
  private onUpdate: () => void;

  constructor(lib: ReliefLibrary, model: TerrainModel, uniforms: UniformGroup, onUpdate: () => void) {
    this.lib = lib;
    this.model = model;
    this.onUpdate = onUpdate;
    const S = lib.size;
    const side = ROW * S;
    // the patches sorted by scale and kind, so each (scale, kind) is a run of the atlas
    const order = [...lib.patches].sort((a, b) => a.scale - b.scale || KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind));
    const atlas = new Uint8Array(side * side);
    const info = new Float32Array(256 * 4);
    const runs: number[] = [];
    order.forEach((p, i) => {
      const ox = (i % ROW) * S;
      const oy = Math.floor(i / ROW) * S;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) atlas[(oy + y) * side + ox + x] = p.data[y * S + x] + 128;
      info[i * 4] = p.downhill;
      info[i * 4 + 1] = Math.min(1.2, Math.max(0.08, p.std / Math.max(p.relief, 30)));
    });
    for (let s = 0; s < 2; s++)
      for (const k of KINDS) {
        const start = order.findIndex((p) => p.scale === s && p.kind === k);
        const count = order.filter((p) => p.scale === s && p.kind === k).length;
        runs.push(Math.max(0, start), count);
      }
    this.atlas = new BufferImageSource({ resource: atlas, width: side, height: side, format: 'r8unorm', scaleMode: 'linear', addressMode: 'clamp-to-edge', autoGenerateMipmaps: false, alphaMode: 'no-premultiply-alpha' });
    this.info = new BufferImageSource({ resource: info, width: 256, height: 1, format: 'rgba32float', scaleMode: 'nearest', addressMode: 'clamp-to-edge', autoGenerateMipmaps: false, alphaMode: 'no-premultiply-alpha' });
    this.fw = Math.ceil(model.W / FIELD_STEP);
    this.fh = Math.ceil(model.H / FIELD_STEP);
    this.field = new BufferImageSource({ resource: new Float32Array(this.fw * this.fh * 4), width: this.fw, height: this.fh, format: 'rgba32float', scaleMode: 'nearest', addressMode: 'clamp-to-edge', autoGenerateMipmaps: false, alphaMode: 'no-premultiply-alpha' });
    const u = uniforms.uniforms as Record<string, unknown>;
    u.uDetailRuns0 = new Float32Array(runs.slice(0, 4));
    u.uDetailRuns1 = new Float32Array(runs.slice(4, 8));
    u.uDetailRuns2 = new Float32Array(runs.slice(8, 12));
    u.uDetailScale = new Float32Array([lib.scales[0], lib.scales[1] ?? lib.scales[0]]);
    u.uDetailPatch = lib.size;
    u.uFieldSize = new Float32Array([this.fw, this.fh]);
    u.uDetailOn = 1;
    this.rebuild();
  }

  /** The land changed: work the field out again soon. */
  changed() {
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.rebuild();
      this.onUpdate();
    }, 350);
  }

  /** Work out the field from the land as it is. */
  rebuild() {
    const m = this.model;
    const { fw, fh } = this;
    const F = FIELD_STEP;
    const n = fw * fh;
    const mean = new Float32Array(n);
    const sea = m.seaLevel;
    for (let j = 0; j < fh; j++)
      for (let i = 0; i < fw; i++) {
        let s = 0;
        for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) s += Math.max(0, m.height.get(i * F + x, Math.min(m.H - 1, j * F + y)) - sea);
        mean[j * fw + i] = s / (F * F);
      }
    const cellM = m.geo.kmPerCellY * 1000 * F;
    const out = this.field.resource as Float32Array;
    const wrap = m.height.wrap;
    const at = (a: Float32Array, i: number, j: number) => a[Math.min(fh - 1, Math.max(0, j)) * fw + (wrap ? ((i % fw) + fw) % fw : Math.min(fw - 1, Math.max(0, i)))];
    // per scale: the relief (standard deviation of the height) over about half a patch
    const rel: Float32Array[] = [];
    const smoothForDir = blurred(mean, fw, fh, Math.max(1, Math.round((this.lib.size * this.lib.scales[0]) / 4 / cellM)), wrap);
    for (const c of [this.lib.scales[0], this.lib.scales[1] ?? this.lib.scales[0]]) {
      const r = Math.max(1, Math.round((this.lib.size * c) / 4 / cellM));
      const mu = blurred(mean, fw, fh, r, wrap);
      const sq = blurred(Float32Array.from(mean, (v) => v * v), fw, fh, r, wrap);
      const out2 = new Float32Array(n);
      for (let k = 0; k < n; k++) {
        const i = k % fw;
        const j = (k / fw) | 0;
        const gx = (at(mean, i + 1, j) - at(mean, i - 1, j)) / (2 * cellM);
        const gy = (at(mean, i, j + 1) - at(mean, i, j - 1)) / (2 * cellM);
        // a patch finer than the field: the relief of a slope of the field's gradient across it
        out2[k] = Math.max(Math.sqrt(Math.max(0, sq[k] - mu[k] * mu[k])), Math.hypot(gx, gy) * this.lib.size * c * 0.29);
      }
      rel.push(out2);
    }
    for (let k = 0; k < n; k++) {
      const i = k % fw;
      const j = (k / fw) | 0;
      const gx = at(smoothForDir, i + 1, j) - at(smoothForDir, i - 1, j);
      const gy = at(smoothForDir, i, j + 1) - at(smoothForDir, i, j - 1);
      out[k * 4] = Math.atan2(-gy, -gx);
      out[k * 4 + 1] = rel[0][k];
      out[k * 4 + 2] = rel[1][k];
      out[k * 4 + 3] = mean[k];
    }
    this.field.update();
  }

  destroy() {
    clearTimeout(this.timer);
    this.atlas.destroy();
    this.info.destroy();
    this.field.destroy();
  }
}

/** A blurred copy (box, three passes; x wraps on planets). */
function blurred(src: Float32Array, w: number, h: number, r: number, wrap: boolean): Float32Array {
  const a = Float32Array.from(src);
  const line = new Float32Array(Math.max(w, h));
  const ix = (i: number) => (wrap ? ((i % w) + w) % w : Math.min(w - 1, Math.max(0, i)));
  for (let p = 0; p < 3; p++) {
    for (let j = 0; j < h; j++) {
      let s = 0;
      for (let i = -r; i <= r; i++) s += a[j * w + ix(i)];
      for (let i = 0; i < w; i++) {
        line[i] = s / (2 * r + 1);
        s += a[j * w + ix(i + r + 1)] - a[j * w + ix(i - r)];
      }
      a.set(line.subarray(0, w), j * w);
    }
    for (let i = 0; i < w; i++) {
      let s = 0;
      for (let j = -r; j <= r; j++) s += a[Math.min(h - 1, Math.max(0, j)) * w + i];
      for (let j = 0; j < h; j++) {
        line[j] = s / (2 * r + 1);
        s += a[Math.min(h - 1, j + r + 1) * w + i] - a[Math.max(0, j - r) * w + i];
      }
      for (let j = 0; j < h; j++) a[j * w + i] = line[j];
    }
  }
  return a;
}
