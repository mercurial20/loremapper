import { simplifyPath, uid } from '../core/math';
import { Simplex3 } from '../core/noise3';
import { history } from '../model/history';
import type { MapDocument, MapLabel, MapObject, Territory, Vec2 } from '../model/types';
import type { WorldFeatures } from '../presets/worlds';
import { STYLE_PRESETS } from '../render/styles';
import { useDoc } from '../store/docStore';
import { editor } from './Editor';
import { newObject } from './commands';

const PLACE_ASSET: Record<NonNullable<WorldFeatures['places']>[number]['kind'], [asset: string, scale: number]> = {
  capital: ['builtin:city-capital', 1.45],
  city: ['builtin:city-fortified', 1.15],
  town: ['builtin:city-merchant', 1],
  village: ['builtin:village', 0.8],
  port: ['builtin:port', 0.95],
  temple: ['builtin:temple', 0.85],
  fortress: ['builtin:fortress', 1],
  ruins: ['builtin:ruins', 0.85],
};

function inside(poly: [number, number][], u: number, v: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ui, vi] = poly[i];
    const [uj, vj] = poly[j];
    if (vi > v !== vj > v && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) c = !c;
  }
  return c;
}

/** Closed outlines (marching squares, corners at cell centres) of the true cells of a mask. */
function rings(mask: Uint8Array, w: number, h: number): Vec2[][] {
  const at = (i: number, j: number) => (i >= 0 && j >= 0 && i < w && j < h ? mask[j * w + i] : 0);
  const KW = 2 * w + 8;
  const key = (x2: number, y2: number) => (y2 + 4) * KW + (x2 + 4);
  const nextOf = new Map<number, number>();
  for (let j = -1; j < h; j++)
    for (let i = -1; i < w; i++) {
      const code = (at(i, j) ? 1 : 0) | (at(i + 1, j) ? 2 : 0) | (at(i + 1, j + 1) ? 4 : 0) | (at(i, j + 1) ? 8 : 0);
      if (code === 0 || code === 15) continue;
      const T = key(2 * i + 2, 2 * j + 1);
      const R = key(2 * i + 3, 2 * j + 2);
      const B = key(2 * i + 2, 2 * j + 3);
      const L = key(2 * i + 1, 2 * j + 2);
      // directed so that land stays on one side; saddles resolved as separate corners
      const seg: [number, number][] = (
        {
          1: [[L, T]],
          2: [[T, R]],
          3: [[L, R]],
          4: [[R, B]],
          5: [
            [L, T],
            [R, B],
          ],
          6: [[T, B]],
          7: [[L, B]],
          8: [[B, L]],
          9: [[B, T]],
          10: [
            [T, R],
            [B, L],
          ],
          11: [[B, R]],
          12: [[R, L]],
          13: [[R, T]],
          14: [[T, L]],
        } as Record<number, [number, number][]>
      )[code];
      for (const [a, b] of seg) nextOf.set(a, b);
    }
  const out: Vec2[][] = [];
  const unkey = (k: number): Vec2 => [((k % KW) - 4) / 2 + 0.5, (Math.floor(k / KW) - 4) / 2 + 0.5];
  const seen = new Set<number>();
  for (const start of nextOf.keys()) {
    if (seen.has(start)) continue;
    const ring: Vec2[] = [];
    let k = start;
    while (!seen.has(k) && nextOf.has(k)) {
      seen.add(k);
      ring.push(unkey(k));
      k = nextOf.get(k)!;
    }
    if (ring.length >= 4) out.push(ring);
  }
  return out;
}

const area = (r: Vec2[]) => {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return a / 2;
};

/**
 * Add a built-in world's realms, places and names to the open map. Realm
 * borders are traced along the land inside each outline, so they follow the
 * generated coast; places on water move to the nearest land.
 */
export function addWorldFeatures(f: WorldFeatures) {
  const model = editor.model;
  if (!model) return;
  const W = model.W;
  const H = model.H;
  const sea = model.seaLevel;
  const long = Math.max(W, H);
  const before = useDoc.getState().doc;
  const style = STYLE_PRESETS[before.view.style] ?? STYLE_PRESETS.parchment;
  const territories: Record<string, Territory> = { ...before.territories };
  const objects: Record<string, MapObject> = { ...before.objects };
  const labels: Record<string, MapLabel> = { ...before.labels };
  const isLand = (x: number, y: number) => model.heightAt(x, y) > sea;
  const addLabel = (l: MapLabel) => (labels[l.id] = l);

  // realms: the land inside each outline, traced on a coarse grid
  const step = Math.max(1, Math.ceil(long / 640));
  const gw = Math.ceil(W / step);
  const gh = Math.ceil(H / step);
  const land = new Uint8Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) land[j * gw + i] = isLand((i + 0.5) * step, (j + 0.5) * step) ? 1 : 0;
  // every land cell belongs to one realm: the smallest outline containing it, so small
  // lands are carved out of their big neighbours; outlines are warped a little so
  // inland borders wander like real ones (shared by neighbours, so they still meet)
  const realms = f.realms ?? [];
  const sizes = realms.map((r) => Math.abs(area(r.pts as Vec2[])));
  const warp = new Simplex3(7);
  const owner = new Int16Array(gw * gh).fill(-1);
  for (let j = 0; j < gh; j++)
    for (let i = 0; i < gw; i++) {
      if (!land[j * gw + i]) continue;
      const u0 = (i + 0.5) / gw;
      const v0 = (j + 0.5) / gh;
      const u = u0 + 0.01 * warp.fbm(u0 * 3, v0 * 3, 0.5, 4, 4, 0.55);
      const v = v0 + 0.01 * warp.fbm(u0 * 3, v0 * 3, 9.5, 4, 4, 0.55);
      let best = -1;
      for (let r = 0; r < realms.length; r++) if ((best < 0 || sizes[r] < sizes[best]) && inside(realms[r].pts, u, v)) best = r;
      owner[j * gw + i] = best;
    }
  realms.forEach((r, ri) => {
    const mask = new Uint8Array(gw * gh);
    for (let k = 0; k < mask.length; k++) if (owner[k] === ri) mask[k] = 1;
    // outer rings only (counter-clockwise in this orientation), largest first
    const outer = rings(mask, gw, gh)
      .map((ring) => ({ ring, a: area(ring) }))
      .filter((x) => x.a < 0)
      .sort((p, q) => p.a - q.a);
    if (!outer.length) return;
    const biggest = -outer[0].a;
    outer.forEach(({ ring, a }, n) => {
      if (-a < Math.max(6, biggest * 0.03)) return;
      const pts = simplifyPath(ring, 0.7).map(([x, y]) => [x * step, y * step] as Vec2);
      if (pts.length < 3) return;
      const t: Territory = {
        id: uid('terr-'),
        name: r.name,
        type: 'other',
        points: pts,
        color: r.color,
        fillOpacity: 0.22,
        borderColor: darken(r.color),
        borderStyle: 'solid',
        borderWidth: 1.6,
        // only the main part carries the name
        showLabel: n === 0,
        labelSize: Math.min(long / 38, Math.max(long / 140, Math.sqrt(-a) * step * 0.09)),
        labelPos: null,
        description: '',
        hidden: false,
        locked: false,
      };
      territories[t.id] = t;
    });
  });

  // places: an icon and its name below it
  const icon = long / 70;
  for (const p of f.places ?? []) {
    let x = p.at[0] * W;
    let y = p.at[1] * H;
    if (!isLand(x, y)) {
      // nudge onto the nearest land within a short distance
      search: for (let r = 1; r <= 12; r++)
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          const nx = x + Math.cos(a) * r * step;
          const ny = y + Math.sin(a) * r * step;
          if (isLand(nx, ny)) {
            x = nx;
            y = ny;
            break search;
          }
        }
    }
    const [asset, scale] = PLACE_ASSET[p.kind];
    const o = newObject({ assetId: asset, x, y, size: icon * scale, name: p.name, layerId: 'layer-settlements' });
    objects[o.id] = o;
    addLabel(label(p.name, x, y + icon * scale * 0.95, long / (p.kind === 'capital' ? 95 : 125), 'serif', style.labelColor));
  }

  // names of seas, bays, islands and regions
  for (const n of f.names ?? []) {
    const water = n.kind === 'ocean' || n.kind === 'sea' || n.kind === 'bay';
    const size = long / ({ ocean: 55, sea: 60, bay: 95, island: 120, region: 110 } as const)[n.kind];
    addLabel(
      label(n.text, n.at[0] * W, n.at[1] * H, size, 'serif', water ? '#2f5874' : style.labelColor, {
        italic: water || n.kind === 'island',
        rotation: n.rotation ?? 0,
        letterSpacing: n.kind === 'ocean' || n.kind === 'sea' ? 0.12 : 0.04,
      }),
    );
  }

  const after: MapDocument = { ...useDoc.getState().doc, territories, objects, labels };
  const set = (d: MapDocument) => useDoc.setState((s) => ({ doc: { ...s.doc, territories: d.territories, objects: d.objects, labels: d.labels }, revision: s.revision + 1 }));
  set(after);
  history.push({ label: 'Add realms and places', cost: 0, undo: () => set(before), redo: () => set(after) });
}

function label(text: string, x: number, y: number, size: number, font: MapLabel['font'], color: string, o: Partial<MapLabel> = {}): MapLabel {
  return {
    id: uid('label-'),
    text,
    x,
    y,
    size,
    font,
    color,
    rotation: 0,
    letterSpacing: 0.04,
    uppercase: false,
    italic: false,
    halo: true,
    curve: 0,
    opacity: 1,
    hidden: false,
    locked: false,
    ...o,
  };
}

function darken(hex: string): string {
  const v = hex.replace('#', '');
  const f = (i: number) => Math.round(parseInt(v.slice(i, i + 2), 16) * 0.55).toString(16).padStart(2, '0');
  return `#${f(0)}${f(2)}${f(4)}`;
}
