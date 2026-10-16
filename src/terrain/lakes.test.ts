import { describe, expect, it } from 'vitest';
import { flatMap } from '../core/planet';
import { fillBasin, lakeDepthAt, lakeInfo, paintLake, relevelLake, setLake, spillLevel, touchingLakes } from './lakes';
import { NO_WATER, TerrainModel } from './TerrainModel';

const setH = (model: TerrainModel, x: number, y: number, v: number) => {
  model.height.ensureTile((x / 256) | 0, (y / 256) | 0)[(y % 256) * 256 + (x % 256)] = v;
};

/** Land at 200 m with a round hollow 60 m deep, whose rim dips to a saddle at 180 m on the east. */
function hollow() {
  const model = new TerrainModel({ ...flatMap(100, 100, 'standard'), seaLevel: 0 });
  const cx = 500;
  const cy = 500;
  for (let y = 380; y < 620; y++)
    for (let x = 380; x < 620; x++) {
      const r = Math.hypot(x - cx, y - cy);
      let h = 200 - 60 * Math.max(0, 1 - (r / 60) ** 2);
      // a notch in the rim to the east, down to 180 m, then falling away beyond it
      if (x > cx && Math.abs(y - cy) < 4 && r > 50) h = Math.min(h, 180 - Math.max(0, r - 62) * 2);
      setH(model, x, y, h);
    }
  return model;
}

/** Where the map shows lake water, sampled every `step` cells over a box: its separate pieces and their areas (cells²). */
function waterPieces(model: TerrainModel, x0: number, y0: number, x1: number, y1: number, step = 0.25) {
  const w = Math.round((x1 - x0) / step);
  const h = Math.round((y1 - y0) / step);
  const wet = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) wet[j * w + i] = lakeDepthAt(model, x0 + (i + 0.5) * step, y0 + (j + 0.5) * step).depth > 0 ? 1 : 0;
  const seen = new Uint8Array(w * h);
  const areas: number[] = [];
  const steps = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (let o = 0; o < w * h; o++) {
    if (!wet[o] || seen[o]) continue;
    let n = 0;
    const stack = [o];
    seen[o] = 1;
    while (stack.length) {
      const k = stack.pop()!;
      n++;
      const i = k % w;
      const j = (k / w) | 0;
      for (const [di, dj] of steps) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
        const nk = nj * w + ni;
        if (wet[nk] && !seen[nk]) {
          seen[nk] = 1;
          stack.push(nk);
        }
      }
    }
    areas.push(n * step * step);
  }
  return areas.sort((a, b) => b - a);
}

/** How much of each cell a round brush dab covers, as the lake tool passes it on. */
function disc(model: TerrainModel, cx: number, cy: number, r: number, into = new Map<number, number>()) {
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++)
    for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      let n = 0;
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if (Math.hypot(x + (i + 0.5) / 4 - cx, y + (j + 0.5) / 4 - cy) <= r) n++;
      if (n) into.set(y * model.W + x, Math.max(into.get(y * model.W + x) ?? 0, n / 16));
    }
  return into;
}

/** Wet cells in the lake layer. */
const wetCount = (model: TerrainModel) => {
  let n = 0;
  for (const t of model.lake.tiles.values()) for (const v of t) if (v !== NO_WATER) n++;
  return n;
};

describe('lakes', () => {
  it('fills a hollow up to where it would spill over its rim', () => {
    const model = hollow();
    const basin = fillBasin(model, 510, 495);
    expect('reason' in basin).toBe(false);
    if ('reason' in basin) return;
    expect(basin.level).toBeGreaterThan(178);
    expect(basin.level).toBeLessThanOrEqual(181);
    // every cell of the lake is under water
    for (const k of basin.cells) expect(model.height.get(k % model.W, (k / model.W) | 0)).toBeLessThan(basin.level);
  });

  it('fills the same hollow the same way however often it is clicked', () => {
    const model = hollow();
    let count = 0;
    for (let i = 0; i < 6; i++) {
      const b = fillBasin(model, 510, 495);
      if ('reason' in b) throw new Error(b.reason);
      const j = touchingLakes(model, b.cells);
      setLake(model, [...b.cells, ...j.cells], Math.max(b.level, j.level));
      if (i === 0) count = wetCount(model);
      else expect(wetCount(model)).toBe(count);
    }
  });

  it('shows a filled lake as one body of water, with nothing stray at its outlet', () => {
    const model = hollow();
    // and a trench one cell wide running north from the lake, just under its level
    for (let y = 420; y < 455; y++) setH(model, 500, y, Math.min(model.height.get(500, y), 179.5));
    const b = fillBasin(model, 510, 495);
    if ('reason' in b) throw new Error(b.reason);
    setLake(model, b.cells, b.level);
    const pieces = waterPieces(model, 420, 420, 600, 580);
    expect(pieces.length).toBe(1);
    // the water reaches out to where the hollow's walls rise past the level (49 cells out)
    expect(pieces[0]).toBeGreaterThan(Math.PI * 48 * 48);
    expect(pieces[0]).toBeLessThan(Math.PI * 50 * 50);
  });

  it('finds no lake on a slope', () => {
    const model = new TerrainModel({ ...flatMap(100, 100, 'standard'), seaLevel: 0 });
    for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) setH(model, x, y, 50 + x * 0.5);
    expect(fillBasin(model, 300, 300)).toEqual({ reason: 'drains' });
  });

  it('knows how high a lake can rise, and shrinks and grows with its level', () => {
    const model = hollow();
    const b = fillBasin(model, 510, 495);
    if ('reason' in b) throw new Error(b.reason);
    setLake(model, b.cells, b.level);
    const full = b.cells.length;
    // filled to the brim, it cannot rise further; lowered, it can
    expect(spillLevel(model, b.cells, b.level)).toBeCloseTo(b.level, 3);
    const low = relevelLake(model, b.cells, 160);
    expect(low.cells.length).toBeLessThan(full * 0.7);
    expect(wetCount(model)).toBe(low.cells.length);
    const info = lakeInfo(model, 500, 500)!;
    expect(info.level).toBe(160);
    expect(info.spill).toBeCloseTo(b.level, 3);
    expect(info.maxDepth).toBeCloseTo(20, 0);
    const back = relevelLake(model, low.cells, info.spill);
    expect(back.cells.length).toBe(full);
  });

  it('paints a lake whose shore runs along the brush, finer than the cells', () => {
    const model = new TerrainModel({ ...flatMap(100, 100, 'standard'), seaLevel: 0 });
    for (let y = 300; y < 700; y++) for (let x = 300; x < 700; x++) setH(model, x, y, 100 + x * 0.05);
    const cx = 500.3;
    const cy = 499.6;
    const R = 12.4;
    const { cells } = paintLake(model, disc(model, cx, cy, R), 30);
    expect(cells.length).toBeGreaterThan(400);
    const level = model.lake.get(500, 500);
    expect(level - model.height.get(500, 500)).toBeGreaterThan(20);
    // walk out from the middle in every direction: the water ends within a fraction of a cell of the brush's edge
    for (let a = 0; a < 32; a++) {
      const dx = Math.cos((a / 32) * 2 * Math.PI);
      const dy = Math.sin((a / 32) * 2 * Math.PI);
      let r = 0;
      while (lakeDepthAt(model, cx + dx * r, cy + dy * r).depth > 0 && r < 30) r += 0.02;
      expect(Math.abs(r - R)).toBeLessThan(0.45);
    }
    expect(waterPieces(model, 470, 470, 530, 530).length).toBe(1);
  });

  it('extends a lake with a stroke that runs on from it, with no ridge under the water', () => {
    const model = new TerrainModel({ ...flatMap(100, 100, 'standard'), seaLevel: 0 });
    for (let y = 300; y < 700; y++) for (let x = 300; x < 700; x++) setH(model, x, y, 100 + x * 0.05);
    paintLake(model, disc(model, 490, 500, 10), 30);
    const first = model.lake.get(490, 500);
    // a second stroke from inside the lake out past its shore
    const cover = new Map<number, number>();
    for (let x = 495; x <= 520; x += 2) disc(model, x, 500, 8, cover);
    paintLake(model, cover, 30);
    // one lake, at the first one's level
    expect(model.lake.get(515, 500)).toBe(first);
    expect(waterPieces(model, 470, 480, 540, 520).length).toBe(1);
    // and the bed runs on smoothly: nowhere along the middle is it much shallower than the strokes' depth
    let least = Infinity;
    for (let x = 490; x <= 515; x += 0.5) least = Math.min(least, lakeDepthAt(model, x, 500).depth);
    expect(least).toBeGreaterThan(15);
  });

  it('joins two lakes at different levels into one water, with no dry ring left inside it', () => {
    const model = new TerrainModel({ ...flatMap(100, 100, 'standard'), seaLevel: 0 });
    for (let y = 300; y < 700; y++) for (let x = 300; x < 700; x++) setH(model, x, y, 100 + x * 0.4);
    paintLake(model, disc(model, 460, 500, 8), 20);
    paintLake(model, disc(model, 540, 500, 8), 20);
    expect(model.lake.get(460, 500)).toBeLessThan(model.lake.get(540, 500));
    const cover = new Map<number, number>();
    for (let x = 460; x <= 540; x += 2) disc(model, x, 500, 5, cover);
    const { cells } = paintLake(model, cover, 20);
    const level = model.lake.get(540, 500);
    expect(model.lake.get(460, 500)).toBe(level);
    for (const k of cells) expect(model.height.get(k % model.W, (k / model.W) | 0)).toBeLessThan(level);
    expect(waterPieces(model, 440, 480, 560, 520, 0.5).length).toBe(1);
    let least = Infinity;
    for (let x = 455; x <= 545; x += 0.5) least = Math.min(least, lakeDepthAt(model, x, 500).depth);
    expect(least).toBeGreaterThan(3);
  });

  it('makes water painted into the sea a bay, with no lake and no bank in the sea', () => {
    const model = new TerrainModel({ ...flatMap(100, 100, 'standard'), seaLevel: 0 });
    // a coast along x = 500: sea to the west, land rising to the east
    for (let y = 300; y < 700; y++) for (let x = 300; x < 700; x++) setH(model, x, y, (x - 500) * 0.5);
    const { cells } = paintLake(model, disc(model, 505, 500, 8), 20);
    expect(cells.length).toBe(0);
    expect(model.lake.tiles.size === 0 || wetCount(model) === 0).toBe(true);
    for (let x = 499; x <= 511; x++) expect(model.height.get(x, 500)).toBeLessThan(0);
  });

  it('keeps a clean shore when many strokes overlap on rough ground', () => {
    const model = new TerrainModel({ ...flatMap(100, 100, 'standard'), seaLevel: 0 });
    // hills and hollows
    for (let y = 300; y < 700; y++) for (let x = 300; x < 700; x++) setH(model, x, y, 300 + 60 * Math.sin(x / 9) * Math.cos(y / 11) + 30 * Math.sin((x + y) / 5));
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let s = 0; s < 25; s++) {
      // a stroke: a few dabs along a line
      const cover = new Map<number, number>();
      const x0 = 420 + rnd() * 160;
      const y0 = 420 + rnd() * 160;
      const a = rnd() * Math.PI * 2;
      const r = 4 + rnd() * 8;
      for (let i = 0; i < 6; i++) disc(model, x0 + Math.cos(a) * i * 3, y0 + Math.sin(a) * i * 3, r, cover);
      paintLake(model, cover, 10 + rnd() * 50);
    }
    const pieces = waterPieces(model, 380, 380, 620, 620, 0.5);
    // no slivers or specks of water: every piece is a real lake, larger than a few cells
    expect(pieces.length).toBeGreaterThan(0);
    expect(pieces[pieces.length - 1]).toBeGreaterThan(4);
  });
});
