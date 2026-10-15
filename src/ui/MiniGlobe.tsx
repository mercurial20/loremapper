import { Globe2, Minus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { makeProjection, type Projection } from '../core/projections';
import { editor } from '../editor/Editor';
import { renderWorldPixels } from '../editor/exporter';
import { STYLE_PRESETS } from '../render/styles';
import { useDoc } from '../store/docStore';
import { useEditor, useViewInfo } from '../store/editorStore';
import { N_ } from '../i18n';
import { useTranslation } from 'react-i18next';

type Mode = 'globe' | 'north' | 'south';
const MODES: { id: Mode; label: string; title: string }[] = [
  { id: 'globe', label: N_('Globe'), title: N_('A globe turned to where you are looking') },
  { id: 'north', label: N_('N'), title: N_('The northern hemisphere, seen from above the north pole') },
  { id: 'south', label: N_('S'), title: N_('The southern hemisphere, seen from below the south pole') },
];
const SIZE = 172;
const SRC_W = 1024;
const PI = Math.PI;

const stored = <T extends string>(key: string, fallback: T): T => {
  try {
    return (localStorage.getItem(key) as T | null) ?? fallback;
  } catch {
    return fallback;
  }
};
const store = (key: string, v: string) => {
  try {
    localStorage.setItem(key, v);
  } catch {
    // remembering the choice is a convenience only
  }
};

/**
 * A small globe in the corner of the map (planets only): the whole world in
 * context, with the part on screen outlined. It turns to follow the view,
 * refreshes shortly after edits, and a click on it moves the view there.
 */
export function MiniGlobe() {
  const { t } = useTranslation();
  const meta = useDoc((s) => s.meta);
  const doc = useDoc((s) => s.doc);
  const landStats = useEditor((s) => s.landStats);
  const projected = useEditor((s) => s.viewProjection !== null);
  const view = useViewInfo();
  const [open, setOpen] = useState(() => stored('loremapper.miniGlobe', 'open') === 'open');
  const [mode, setMode] = useState<Mode>(() => stored<Mode>('loremapper.miniGlobe.mode', 'globe'));
  const [src, setSrc] = useState<{ px: Uint8ClampedArray; id: string } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const planet = !!meta && meta.planet.mapType !== 'flat';
  const shown = planet && open && !projected;

  // the planet's picture: rendered again a moment after the terrain, borders, rivers or style change
  useEffect(() => {
    if (!shown || !meta) return;
    const t = setTimeout(() => {
      if (!editor.renderer || !editor.model || !editor.layers) return;
      void renderWorldPixels(SRC_W, SRC_W / 2, 'map').then((px) => setSrc({ px, id: meta.id }));
    }, 450);
    return () => clearTimeout(t);
  }, [shown, meta, landStats, doc.paths, doc.territories, doc.view.style, doc.systemLayers]);

  // where the view is, in longitude and latitude
  const m = editor.model;
  const centre = m ? [((view.centerX / m.W) * 360 - 180 + 540) % 360 - 180, 90 - (view.centerY / m.H) * 180] : [0, 0];
  const lon0 = mode === 'globe' ? centre[0] : 0;
  const lat0 = mode === 'globe' ? Math.max(-60, Math.min(60, centre[1])) : mode === 'north' ? 90 : -90;
  const params = paramsFor(mode, lon0, lat0);

  useEffect(() => {
    const c = canvas.current;
    const model = editor.model;
    if (!c || !src || !model || !meta || src.id !== meta.id) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const N = Math.round(SIZE * dpr);
    if (c.width !== N) {
      c.width = N;
      c.height = N;
    }
    const p = paramsFor(mode, lon0, lat0);
    const proj = makeProjection(p);
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(N, N);
    const out = img.data;
    const sw = SRC_W;
    const sh = SRC_W / 2;
    const R = proj.x1;
    const globe = p.id === 'orthographic';
    for (let py = 0; py < N; py++) {
      const Y = R - ((py + 0.5) / N) * 2 * R;
      for (let px = 0; px < N; px++) {
        const X = -R + ((px + 0.5) / N) * 2 * R;
        const ll = proj.inverse(X, Y);
        if (!ll) continue;
        const u = Math.floor(((ll[0] / (2 * PI) + 0.5) * sw + sw) % sw);
        const v = Math.min(sh - 1, Math.max(0, Math.floor((0.5 - ll[1] / PI) * sh)));
        const i = (v * sw + u) * 4;
        const shade = globe ? 0.78 + 0.22 * Math.sqrt(Math.max(0, 1 - (X * X + Y * Y) / (R * R))) : 1;
        const o = (py * N + px) * 4;
        out[o] = src.px[i] * shade;
        out[o + 1] = src.px[i + 1] * shade;
        out[o + 2] = src.px[i + 2] * shade;
        out[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    drawFrame(ctx, proj, N, dpr, view, model.W, model.H, STYLE_PRESETS[doc.view.style]?.coastInk ?? '#333');
  }, [src, mode, lon0, lat0, view, meta, doc.view.style]);

  if (!planet || projected) return null;
  if (!open)
    return (
      <button
        className="mini-globe-open"
        title={t('Show the mini globe')}
        aria-label={t('Show the mini globe')}
        onClick={() => {
          setOpen(true);
          store('loremapper.miniGlobe', 'open');
        }}
      >
        <Globe2 size={16} />
      </button>
    );

  // a click turns the view to the place under the cursor
  const goTo = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const model = editor.model;
    const r = editor.renderer;
    if (!model || !r) return;
    const b = e.currentTarget.getBoundingClientRect();
    const proj = makeProjection(params);
    const R = proj.x1;
    const X = -R + ((e.clientX - b.left) / b.width) * 2 * R;
    const Y = R - ((e.clientY - b.top) / b.height) * 2 * R;
    const ll = proj.inverse(X, Y);
    if (!ll) return;
    r.camera.centerOn((((ll[0] / (2 * PI) + 0.5) * model.W) % model.W + model.W) % model.W, (0.5 - ll[1] / PI) * model.H, r.camera.zoom);
    r.viewChanged();
  };

  return (
    <div className="mini-globe" aria-label={t('Mini globe')}>
      <canvas ref={canvas} style={{ width: SIZE, height: SIZE }} onPointerDown={goTo} title={t('Click to go there')} />
      {!src && <span className="mini-globe-wait" />}
      <div className="mini-globe-bar">
        {MODES.map((x) => (
          <button
            key={x.id}
            className={mode === x.id ? 'on' : ''}
            title={t(x.title)}
            onClick={() => {
              setMode(x.id);
              store('loremapper.miniGlobe.mode', x.id);
            }}
          >
            {t(x.label)}
          </button>
        ))}
        <button
          title={t('Hide the mini globe')}
          aria-label={t('Hide the mini globe')}
          onClick={() => {
            setOpen(false);
            store('loremapper.miniGlobe', 'closed');
          }}
        >
          <Minus size={12} />
        </button>
      </div>
    </div>
  );
}

const paramsFor = (mode: Mode, lon0: number, lat0: number) => ({ id: mode === 'globe' ? ('orthographic' as const) : ('azimuthal' as const), lon0, lat0, extent: 95 });

/** The globe's rim and the outline of the part of the planet on screen. */
function drawFrame(
  ctx: CanvasRenderingContext2D,
  proj: Projection,
  N: number,
  dpr: number,
  view: { zoom: number; centerX: number; centerY: number; viewW: number; viewH: number },
  W: number,
  H: number,
  ink: string,
) {
  const R = proj.x1;
  const k = N / (2 * R);
  const px = ([X, Y]: [number, number]): [number, number] => [(X + R) * k, (R - Y) * k];
  ctx.save();
  // rim
  ctx.beginPath();
  ctx.arc(N / 2, N / 2, N / 2 - dpr, 0, 2 * PI);
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 1.2 * dpr;
  ctx.stroke();
  // the view: its edges sampled and projected (pieces on the far side are left out)
  const hw = view.viewW / 2 / view.zoom;
  const hh = view.viewH / 2 / view.zoom;
  const x0 = view.centerX - hw;
  const x1 = view.centerX + hw;
  const y0 = Math.max(0, view.centerY - hh);
  const y1 = Math.min(H, view.centerY + hh);
  const edge: [number, number][] = [];
  const n = 24;
  for (let i = 0; i <= n; i++) edge.push([x0 + ((x1 - x0) * i) / n, y0]);
  for (let i = 1; i <= n; i++) edge.push([x1, y0 + ((y1 - y0) * i) / n]);
  for (let i = 1; i <= n; i++) edge.push([x1 - ((x1 - x0) * i) / n, y1]);
  for (let i = 1; i <= n; i++) edge.push([x0, y1 - ((y1 - y0) * i) / n]);
  // a view wider than the world is the whole world: no outline
  if (x1 - x0 < W * 0.95) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#ffcf6b';
    ctx.lineWidth = 1.6 * dpr;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 2 * dpr;
    ctx.beginPath();
    let pen = false;
    for (const [x, y] of edge) {
      const f = proj.forward((x / W) * 2 * PI - PI, PI / 2 - (y / H) * PI);
      if (!f) {
        pen = false;
        continue;
      }
      const [sx, sy] = px(f);
      if (pen) ctx.lineTo(sx, sy);
      else ctx.moveTo(sx, sy);
      pen = true;
    }
    ctx.stroke();
  }
  ctx.restore();
}
