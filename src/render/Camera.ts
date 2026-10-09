import { clamp } from '../core/math';

/** 2D camera in world cell units. `zoom` = screen CSS pixels per cell. */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  viewW = 1;
  viewH = 1;
  minZoom = 0.05;
  maxZoom = 96;
  private targetZoom: number | null = null;
  private anchor: [number, number] = [0, 0];

  private worldW: number;
  private worldH: number;

  constructor(worldW: number, worldH: number) {
    this.worldW = worldW;
    this.worldH = worldH;
  }

  setWorld(w: number, h: number) {
    this.worldW = w;
    this.worldH = h;
  }

  resize(w: number, h: number) {
    this.viewW = Math.max(1, w);
    this.viewH = Math.max(1, h);
    this.minZoom = Math.min(this.viewW / this.worldW, this.viewH / this.worldH) * 0.6;
    this.zoom = clamp(this.zoom, this.minZoom, this.maxZoom);
    this.clampY();
  }

  fitWorld() {
    this.zoom = Math.min(this.viewW / this.worldW, this.viewH / this.worldH) * 0.95;
    this.x = this.worldW / 2;
    this.y = this.worldH / 2;
    this.targetZoom = null;
  }

  screenToWorld(sx: number, sy: number): [number, number] {
    return [this.x + (sx - this.viewW / 2) / this.zoom, this.y + (sy - this.viewH / 2) / this.zoom];
  }

  worldToScreen(wx: number, wy: number): [number, number] {
    // nearest wrapped copy to the camera
    let dx = (wx - this.x) % this.worldW;
    if (dx > this.worldW / 2) dx -= this.worldW;
    if (dx < -this.worldW / 2) dx += this.worldW;
    return [dx * this.zoom + this.viewW / 2, (wy - this.y) * this.zoom + this.viewH / 2];
  }

  pan(dxScreen: number, dyScreen: number) {
    this.x -= dxScreen / this.zoom;
    this.y -= dyScreen / this.zoom;
    this.normalize();
  }

  /** Begin a smooth zoom toward `factor` × current target, anchored at a screen point. */
  zoomAt(sx: number, sy: number, factor: number, animate = true) {
    const base = this.targetZoom ?? this.zoom;
    const next = clamp(base * factor, this.minZoom, this.maxZoom);
    this.anchor = [sx, sy];
    if (!animate) {
      this.applyZoom(next);
      this.targetZoom = null;
      return;
    }
    this.targetZoom = next;
  }

  private applyZoom(z: number) {
    const [ax, ay] = this.anchor;
    const [wx, wy] = this.screenToWorld(ax, ay);
    this.zoom = z;
    this.x = wx - (ax - this.viewW / 2) / this.zoom;
    this.y = wy - (ay - this.viewH / 2) / this.zoom;
    this.normalize();
  }

  /** Advance animations; returns true if the camera moved. */
  tick(dt: number): boolean {
    if (this.targetZoom === null) return false;
    const k = 1 - Math.exp(-dt * 18);
    const lz = Math.log(this.zoom);
    const lt = Math.log(this.targetZoom);
    const nz = Math.exp(lz + (lt - lz) * k);
    if (Math.abs(lt - lz) < 0.002) {
      this.applyZoom(this.targetZoom);
      this.targetZoom = null;
    } else this.applyZoom(nz);
    return true;
  }

  get animating() {
    return this.targetZoom !== null;
  }

  centerOn(x: number, y: number, zoom?: number) {
    this.x = x;
    this.y = y;
    if (zoom) this.zoom = clamp(zoom, this.minZoom, this.maxZoom);
    this.targetZoom = null;
    this.normalize();
  }

  private normalize() {
    this.x = ((this.x % this.worldW) + this.worldW) % this.worldW;
    this.clampY();
  }

  private clampY() {
    const half = this.viewH / 2 / this.zoom;
    if (half * 2 >= this.worldH) this.y = this.worldH / 2;
    else this.y = clamp(this.y, half * 0.3, this.worldH - half * 0.3);
  }

  /** World-space visible rectangle (x unwrapped around camera). */
  get visible() {
    const hw = this.viewW / 2 / this.zoom;
    const hh = this.viewH / 2 / this.zoom;
    return { x0: this.x - hw, x1: this.x + hw, y0: this.y - hh, y1: this.y + hh };
  }
}
