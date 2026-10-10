import { BufferImageSource, Container, Geometry, GlProgram, Mesh, Shader, UniformGroup } from 'pixi.js';
import type { TextureSource } from 'pixi.js';
import type { CellRect, RasterLayer, TerrainModel } from '../terrain/TerrainModel';
import type { RasterArray, TileGrid } from '../terrain/TileGrid';
import { FOG_FRAGMENT, TERRAIN_FRAGMENT, TILE_VERTEX } from './shaders';

/** Cells of neighbour data copied around each tile texture (keeps shading seamless). */
export const APRON = 4;

type Kind = 'terrain' | 'fog';

interface TileEntry {
  tx: number;
  ty: number;
  mesh: Mesh<Geometry, Shader>;
  own: Partial<Record<'height' | 'biomeA' | 'biomeB' | 'fog', BufferImageSource>>;
  hasOwnHeight: boolean;
  hasOwnBiome: boolean;
  hasOwnFog: boolean;
  dirty: boolean;
}

interface Segment {
  out: RasterArray;
  /** Channels of the grid copied into this output, starting at chFrom. */
  chFrom: number;
  chCount: number;
}

let terrainProgram: GlProgram | null = null;
let fogProgram: GlProgram | null = null;

/**
 * Draws a sparse raster layer as one quad per tile with a custom shader.
 * Brush edits re-upload only the tiles whose texture (incl. apron) was touched.
 */
export class RasterTileLayer {
  readonly container = new Container();
  private tiles = new Map<number, TileEntry>();
  private defaults: Partial<Record<'height' | 'biome' | 'fog', BufferImageSource>> = {};
  private anyDirty = true;
  /** Texture edge length for full-res (height) and half-res (biome, fog) tiles. */
  private readonly S: number;
  private readonly Sh: number;
  private readonly tileUniforms = new Map<number, UniformGroup>();

  private model: TerrainModel;
  private kind: Kind;
  private styleUniforms: UniformGroup;
  private ramp: TextureSource | null;

  constructor(model: TerrainModel, kind: Kind, styleUniforms: UniformGroup, ramp: TextureSource | null) {
    this.model = model;
    this.kind = kind;
    this.styleUniforms = styleUniforms;
    this.ramp = ramp;
    this.S = model.TS + APRON * 2;
    this.Sh = model.biome.TS + APRON * 2;
    if (model.W % model.TS !== 0) throw new Error('Grid width must be a multiple of the tile size');
    if (kind === 'terrain' && !terrainProgram) terrainProgram = GlProgram.from({ vertex: TILE_VERTEX, fragment: TERRAIN_FRAGMENT, name: 'terrain' });
    if (kind === 'fog' && !fogProgram) fogProgram = GlProgram.from({ vertex: TILE_VERTEX, fragment: FOG_FRAGMENT, name: 'fog' });
    this.buildDefaults();
    const g = model.height;
    for (let ty = 0; ty < g.NY; ty++) for (let tx = 0; tx < g.NX; tx++) this.createTile(tx, ty);
  }

  private makeSource(format: 'r32float' | 'rgba8unorm' | 'r8unorm', data: RasterArray, linear: boolean): BufferImageSource {
    const size = format === 'r32float' ? this.S : this.Sh;
    return new BufferImageSource({
      resource: data,
      width: size,
      height: size,
      format,
      scaleMode: linear ? 'linear' : 'nearest',
      addressMode: 'clamp-to-edge',
      autoGenerateMipmaps: false,
      alphaMode: 'no-premultiply-alpha',
    });
  }

  private buildDefaults() {
    const n = this.S * this.S;
    const nh = this.Sh * this.Sh;
    if (this.kind === 'terrain') {
      this.defaults.height = this.makeSource('r32float', new Float32Array(n).fill(this.model.height.defaultValue), false);
      this.defaults.biome = this.makeSource('rgba8unorm', new Uint8Array(nh * 4), true);
    } else {
      this.defaults.fog = this.makeSource('r8unorm', new Uint8Array(nh).fill(this.model.fog.defaultValue), true);
    }
  }

  private refreshDefaults() {
    if (this.kind === 'terrain') {
      const src = this.defaults.height!;
      (src.resource as Float32Array).fill(this.model.height.defaultValue);
      src.update();
    } else {
      const src = this.defaults.fog!;
      (src.resource as Uint8Array).fill(this.model.fog.defaultValue);
      src.update();
    }
  }

  private createTile(tx: number, ty: number) {
    const TS = this.model.TS;
    const x0 = tx * TS;
    const y0 = ty * TS;
    const x1 = x0 + TS;
    const y1 = Math.min(this.model.H, y0 + TS);
    const geometry = new Geometry({
      attributes: { aPosition: { buffer: new Float32Array([x0, y0, x1, y0, x1, y1, x0, y1]), format: 'float32x2' } },
      indexBuffer: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    const key = ty * this.model.height.NX + tx;
    const hTS = this.model.biome.TS;
    // half-res texture origin, in half-res grid cells
    const halfOrigin = new Float32Array([tx * hTS - APRON, ty * hTS - APRON]);
    const tu =
      this.kind === 'terrain'
        ? new UniformGroup({
            uTexOrigin: { value: new Float32Array([x0 - APRON, y0 - APRON]), type: 'vec2<f32>' },
            uTexSize: { value: this.S, type: 'f32' },
            uBioOrigin: { value: halfOrigin, type: 'vec2<f32>' },
            uBioSize: { value: this.Sh, type: 'f32' },
          })
        : new UniformGroup({
            uTexOrigin: { value: halfOrigin, type: 'vec2<f32>' },
            uTexSize: { value: this.Sh, type: 'f32' },
          });
    this.tileUniforms.set(key, tu);
    const entry: TileEntry = {
      tx,
      ty,
      mesh: new Mesh({ geometry, shader: this.buildShader(key, {}) }),
      own: {},
      hasOwnHeight: false,
      hasOwnBiome: false,
      hasOwnFog: false,
      dirty: true,
    };
    entry.mesh.visible = this.kind === 'terrain';
    this.tiles.set(key, entry);
    this.container.addChild(entry.mesh);
  }

  private buildShader(key: number, own: TileEntry['own']): Shader {
    const tu = this.tileUniforms.get(key)!;
    if (this.kind === 'terrain') {
      return new Shader({
        glProgram: terrainProgram!,
        resources: {
          uHeight: (own.height ?? this.defaults.height)!,
          uBiomeA: (own.biomeA ?? this.defaults.biome)!,
          uBiomeB: (own.biomeB ?? this.defaults.biome)!,
          uRamp: this.ramp!,
          style: this.styleUniforms,
          tile: tu,
        },
      });
    }
    return new Shader({
      glProgram: fogProgram!,
      resources: { uFog: (own.fog ?? this.defaults.fog)!, style: this.styleUniforms, tile: tu },
    });
  }

  /** Raster change notification → mark affected tile textures dirty. */
  onChange(layer: RasterLayer, rect: CellRect | null) {
    if (this.kind === 'terrain' && layer === 'fog') return;
    if (this.kind === 'fog' && layer !== 'fog') return;
    this.anyDirty = true;
    if (!rect) {
      this.refreshDefaults();
      for (const t of this.tiles.values()) t.dirty = true;
      return;
    }
    const { TS, H } = this.model;
    const NX = this.model.height.NX;
    const NY = this.model.height.NY;
    // aprons of half-res textures span twice as many world cells
    const A = APRON * 2;
    const tx0 = Math.floor((rect.x0 - A) / TS);
    const tx1 = Math.floor((rect.x1 + A) / TS);
    const ty0 = Math.max(0, Math.floor((rect.y0 - A) / TS));
    const ty1 = Math.min(NY - 1, Math.floor(Math.min(H - 1, rect.y1 + A) / TS));
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) {
        const wx = this.model.height.wrap ? ((tx % NX) + NX) % NX : tx;
        if (wx < 0 || wx >= NX) continue;
        const t = this.tiles.get(ty * NX + wx);
        if (t) t.dirty = true;
      }
  }

  private neighbourhoodAllocated(grid: TileGrid<RasterArray>, tx: number, ty: number): boolean {
    for (let oy = -1; oy <= 1; oy++) {
      const y = ty + oy;
      if (y < 0 || y >= grid.NY) continue;
      for (let ox = -1; ox <= 1; ox++) {
        if (!grid.wrap && (tx + ox < 0 || tx + ox >= grid.NX)) continue;
        if (grid.tiles.has(grid.key(grid.wrapTileX(tx + ox), y))) return true;
      }
    }
    return false;
  }

  /** Copy a tile plus apron from `grid` into the segment outputs. */
  private fill(grid: TileGrid<RasterArray>, tx: number, ty: number, segs: Segment[]) {
    const { TS, H } = grid;
    const S = TS + APRON * 2;
    const C = grid.channels;
    const def = grid.defaultValue;
    const A = APRON;
    const parts: [number, number, number, number][] = [
      // [dest x offset, src tile dx, src lx start, count]
      [0, -1, TS - A, A],
      [A, 0, 0, TS],
      [A + TS, 1, 0, A],
    ];
    for (let j = 0; j < S; j++) {
      const y = Math.min(H - 1, Math.max(0, ty * TS - A + j));
      const sty = (y / TS) | 0;
      const ly = y - sty * TS;
      for (const [dx, tdx, lx0, count] of parts) {
        // past the edge of a map that doesn't wrap, repeat the edge column
        const edge = !grid.wrap && (tx + tdx < 0 || tx + tdx >= grid.NX);
        if (edge) {
          const src = grid.tiles.get(grid.key(tx, sty));
          const elx = tdx < 0 ? 0 : TS - 1;
          for (const seg of segs) {
            const oc = seg.chCount;
            let o = (j * S + dx) * oc;
            for (let k = 0; k < count; k++) {
              for (let c = 0; c < oc; c++) seg.out[o + c] = src ? src[(ly * TS + elx) * C + seg.chFrom + c] : seg.chFrom + c >= C ? 0 : def;
              o += oc;
            }
          }
          continue;
        }
        const src = grid.tiles.get(grid.key(grid.wrapTileX(tx + tdx), sty));
        for (const seg of segs) {
          const oc = seg.chCount;
          const out = seg.out;
          let o = (j * S + dx) * oc;
          if (!src) {
            const v = seg.chFrom >= C ? 0 : def;
            out.fill(v, o, o + count * oc);
            continue;
          }
          let si = (ly * TS + lx0) * C + seg.chFrom;
          if (oc === 1 && C === 1) {
            out.set(src.subarray(si, si + count), o);
            continue;
          }
          for (let k = 0; k < count; k++) {
            for (let c = 0; c < oc; c++) out[o + c] = src[si + c];
            o += oc;
            si += C;
          }
        }
      }
    }
  }

  /** Upload dirty tiles. Call once per frame before rendering. */
  sync() {
    if (!this.anyDirty) return;
    this.anyDirty = false;
    const n = this.S * this.S;
    const nh = this.Sh * this.Sh;
    // sources dropped this pass; destroyed only after no shader references them
    const retired: BufferImageSource[] = [];
    for (const [key, t] of this.tiles) {
      if (!t.dirty) continue;
      t.dirty = false;
      let rebuild = false;
      if (this.kind === 'terrain') {
        const needH = this.neighbourhoodAllocated(this.model.height, t.tx, t.ty);
        const needB = this.neighbourhoodAllocated(this.model.biome, t.tx, t.ty);
        if (needH !== t.hasOwnHeight) {
          rebuild = true;
          t.hasOwnHeight = needH;
          if (needH) t.own.height = this.makeSource('r32float', new Float32Array(n), false);
          else {
            if (t.own.height) retired.push(t.own.height);
            delete t.own.height;
          }
        }
        if (needB !== t.hasOwnBiome) {
          rebuild = true;
          t.hasOwnBiome = needB;
          if (needB) {
            t.own.biomeA = this.makeSource('rgba8unorm', new Uint8Array(nh * 4), true);
            t.own.biomeB = this.makeSource('rgba8unorm', new Uint8Array(nh * 4), true);
          } else {
            if (t.own.biomeA) retired.push(t.own.biomeA);
            if (t.own.biomeB) retired.push(t.own.biomeB);
            delete t.own.biomeA;
            delete t.own.biomeB;
          }
        }
        if (t.own.height) {
          this.fill(this.model.height, t.tx, t.ty, [{ out: t.own.height.resource as Float32Array, chFrom: 0, chCount: 1 }]);
          t.own.height.update();
        }
        if (t.own.biomeA && t.own.biomeB) {
          this.fill(this.model.biome, t.tx, t.ty, [
            { out: t.own.biomeA.resource as Uint8Array, chFrom: 0, chCount: 4 },
            { out: t.own.biomeB.resource as Uint8Array, chFrom: 4, chCount: 4 },
          ]);
          t.own.biomeA.update();
          t.own.biomeB.update();
        }
      } else {
        const fog = this.model.fog;
        const needF = this.neighbourhoodAllocated(fog, t.tx, t.ty);
        if (needF !== t.hasOwnFog) {
          rebuild = true;
          t.hasOwnFog = needF;
          if (needF) t.own.fog = this.makeSource('r8unorm', new Uint8Array(nh), true);
          else {
            if (t.own.fog) retired.push(t.own.fog);
            delete t.own.fog;
          }
        }
        if (t.own.fog) {
          this.fill(fog, t.tx, t.ty, [{ out: t.own.fog.resource as Uint8Array, chFrom: 0, chCount: 1 }]);
          t.own.fog.update();
        }
      }
      if (rebuild) {
        const old = t.mesh.shader;
        t.mesh.shader = this.buildShader(key, t.own);
        old?.destroy(false);
      }
    }
    for (const s of retired) s.destroy();
  }

  private hasContent(t: TileEntry): boolean {
    if (this.kind === 'terrain') return true;
    return t.hasOwnFog || this.model.fog.defaultValue > 0;
  }

  /** Show only tiles intersecting the world rect (already offset for the current wrap copy). */
  cull(x0: number, y0: number, x1: number, y1: number) {
    const TS = this.model.TS;
    for (const t of this.tiles.values()) {
      const tx0 = t.tx * TS;
      const ty0 = t.ty * TS;
      t.mesh.visible = this.hasContent(t) && tx0 < x1 && tx0 + TS > x0 && ty0 < y1 && ty0 + TS > y0;
    }
  }

  destroy() {
    // shaders first, so no bind group still references a texture being destroyed
    for (const t of this.tiles.values()) {
      t.mesh.shader?.destroy(false);
      t.mesh.destroy();
      for (const s of Object.values(t.own)) s?.destroy();
    }
    for (const s of Object.values(this.defaults)) s?.destroy();
    this.container.destroy();
  }
}
