export type RasterArray = Float32Array | Uint8Array;

/**
 * Sparse tiled raster. Only tiles that have been written are allocated;
 * everything else reads as `defaultValue`. Horizontal coordinates wrap
 * (the planet is a cylinder in equirectangular space); vertical clamp.
 */
export class TileGrid<T extends RasterArray> {
  readonly W: number;
  readonly H: number;
  readonly TS: number;
  readonly NX: number;
  readonly NY: number;
  readonly channels: number;
  /** World cells per grid cell (2 = half resolution). */
  readonly scale: number;
  readonly tiles = new Map<number, T>();
  defaultValue: number;
  private readonly make: (n: number) => T;

  constructor(W: number, H: number, TS: number, channels: number, make: (n: number) => T, defaultValue: number, scale = 1) {
    this.scale = scale;
    this.W = W;
    this.H = H;
    this.TS = TS;
    this.NX = Math.ceil(W / TS);
    this.NY = Math.ceil(H / TS);
    this.channels = channels;
    this.make = make;
    this.defaultValue = defaultValue;
  }

  get tileCount() {
    return this.NX * this.NY;
  }

  key(tx: number, ty: number): number {
    return ty * this.NX + tx;
  }

  tileXY(key: number): [number, number] {
    return [key % this.NX, Math.floor(key / this.NX)];
  }

  wrapTileX(tx: number): number {
    return ((tx % this.NX) + this.NX) % this.NX;
  }

  getTile(tx: number, ty: number): T | undefined {
    return this.tiles.get(this.key(tx, ty));
  }

  newTileData(): T {
    const arr = this.make(this.TS * this.TS * this.channels);
    if (this.defaultValue !== 0) arr.fill(this.defaultValue);
    return arr;
  }

  ensureTile(tx: number, ty: number): T {
    const k = this.key(tx, ty);
    let t = this.tiles.get(k);
    if (!t) {
      t = this.newTileData();
      this.tiles.set(k, t);
    }
    return t;
  }

  /** Read cell (x, y) channel c. x wraps, y clamps. Integer coordinates. */
  get(x: number, y: number, c = 0): number {
    if (y < 0) y = 0;
    else if (y >= this.H) y = this.H - 1;
    x %= this.W;
    if (x < 0) x += this.W;
    const TS = this.TS;
    const tx = (x / TS) | 0;
    const ty = (y / TS) | 0;
    const t = this.tiles.get(ty * this.NX + tx);
    if (!t) return this.defaultValue;
    return t[((y - ty * TS) * TS + (x - tx * TS)) * this.channels + c];
  }

  /** Bilinear sample at continuous world position; cell centres sit at i + 0.5. */
  sample(x: number, y: number, c = 0): number {
    const u = x - 0.5;
    const v = y - 0.5;
    const x0 = Math.floor(u);
    const y0 = Math.floor(v);
    const fx = u - x0;
    const fy = v - y0;
    const a = this.get(x0, y0, c);
    const b = this.get(x0 + 1, y0, c);
    const d = this.get(x0, y0 + 1, c);
    const e = this.get(x0 + 1, y0 + 1, c);
    return (a + (b - a) * fx) * (1 - fy) + (d + (e - d) * fx) * fy;
  }

  /** Is every value of this tile equal to the default? */
  isTileDefault(data: T): boolean {
    const d = this.defaultValue;
    for (let i = 0; i < data.length; i++) if (data[i] !== d) return false;
    return true;
  }

  clear(defaultValue = this.defaultValue) {
    this.tiles.clear();
    this.defaultValue = defaultValue;
  }

  /** Copy a W×H full-resolution array into tiles, skipping tiles that equal the default. */
  loadFull(full: ArrayLike<number>) {
    this.tiles.clear();
    const { TS, NX, NY, W, H, channels } = this;
    for (let ty = 0; ty < NY; ty++) {
      for (let tx = 0; tx < NX; tx++) {
        const t = this.make(TS * TS * channels);
        if (this.defaultValue !== 0) t.fill(this.defaultValue);
        for (let j = 0; j < TS; j++) {
          const y = ty * TS + j;
          if (y >= H) break;
          for (let i = 0; i < TS; i++) {
            const x = tx * TS + i;
            if (x >= W) break;
            const src = (y * W + x) * channels;
            const dst = (j * TS + i) * channels;
            for (let c = 0; c < channels; c++) t[dst + c] = full[src + c];
          }
        }
        if (!this.isTileDefault(t)) this.tiles.set(ty * NX + tx, t);
      }
    }
  }

  /** Flatten into a full W×H array (for exports). */
  toFull<A extends RasterArray>(make: (n: number) => A): A {
    const { TS, NX, W, H, channels } = this;
    const out = make(W * H * channels);
    if (this.defaultValue !== 0) out.fill(this.defaultValue);
    for (const [k, t] of this.tiles) {
      const tx = k % NX;
      const ty = Math.floor(k / NX);
      for (let j = 0; j < TS; j++) {
        const y = ty * TS + j;
        if (y >= H) break;
        const rowLen = Math.min(TS, W - tx * TS) * channels;
        const src = j * TS * channels;
        out.set(t.subarray(src, src + rowLen), (y * W + tx * TS) * channels);
      }
    }
    return out;
  }
}
