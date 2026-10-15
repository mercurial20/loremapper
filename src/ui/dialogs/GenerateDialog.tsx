import { ChevronDown, Clock, Dices, LayoutGrid, LoaderCircle, WandSparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { seedFromString } from '../../core/math';
import { surfaceAreaKm2 } from '../../core/planet';
import { formatArea, formatHeight } from '../../core/units';
import { generateWorld, genParams, PreviewWorker, type GenerateOptions, type RiverAmount } from '../../editor/generate';
import type { GenType, Realism, Surface, Template } from '../../terrain/generator';
import { useDoc } from '../../store/docStore';
import { useEditor } from '../../store/editorStore';
import { Segmented, Slider, TextField, Toggle } from '../controls/controls';
import { Modal } from './Modal';
import { useTranslation } from 'react-i18next';
import { N_ } from '../../i18n';

type Blob = [cx: number, cy: number, rx: number, ry: number, sea?: boolean];

interface Preset {
  id: string;
  label: string;
  desc: string;
  type: GenType;
  template: Template;
  /** adds land inside the current view instead of replacing the map */
  view?: boolean;
  /** default land share for this preset (planet setting when omitted) */
  land?: number;
  /** only meaningful on a planet (poles, opposite hemispheres) */
  planetOnly?: boolean;
  /** a waterless world of one surface */
  surface?: Surface;
  glyph: Blob[];
}

const dots = (pts: [number, number, number][]): Blob[] => pts.map(([x, y, r]) => [x, y, r, r * 0.75]);

const PRESETS: Preset[] = [
  { id: 'continents', label: N_('Continents'), desc: N_('Three to six landmasses separated by oceans.'), type: 'continents', template: 'none', glyph: [[20, 17, 13, 8], [52, 31, 11, 9], [82, 16, 11, 7], [80, 39, 6, 4]] },
  { id: 'pangaea', label: N_('Supercontinent'), desc: N_('Almost all land joined in one huge continent.'), type: 'pangaea', template: 'none', glyph: [[46, 25, 31, 15], [88, 40, 3, 2]] },
  { id: 'twoWorlds', label: N_('Old & New World'), desc: N_('Two great landmasses on opposite sides of the planet.'), type: 'continents', template: 'twoWorlds', planetOnly: true, glyph: [[24, 24, 13, 17], [76, 26, 13, 16]] },
  { id: 'innerSea', label: N_('Inner sea'), desc: N_('Lands ringing a large sea in the middle, like the Mediterranean.'), type: 'continents', template: 'innerSea', glyph: [[50, 25, 34, 18], [50, 26, 17, 9, true], [92, 12, 4, 3]] },
  { id: 'polar', label: N_('Polar continent'), desc: N_('A frozen continent over one pole and smaller lands elsewhere.'), type: 'continents', template: 'polar', planetOnly: true, glyph: [[50, 3, 50, 8], [28, 33, 10, 7], [70, 36, 9, 6]] },
  { id: 'shattered', label: N_('Shattered continent'), desc: N_('A supercontinent breaking apart along rifts and narrow seas.'), type: 'continents', template: 'shattered', glyph: [[38, 19, 11, 8], [55, 27, 9, 8], [42, 35, 8, 6], [62, 13, 7, 5], [24, 30, 6, 5]] },
  { id: 'mainland', label: N_('Mainland & isles'), desc: N_('One large continent with island chains around it.'), type: 'continents', template: 'mainland', glyph: [[38, 25, 24, 14], ...dots([[72, 12, 2.5], [78, 18, 2], [82, 26, 3], [79, 35, 2], [86, 40, 2.5], [14, 42, 2]])] },
  {
    id: 'archWorld',
    label: N_('Ocean world'),
    desc: N_('Groups of islands scattered over a planet-wide ocean.'),
    type: 'archipelago',
    template: 'none',
    land: 0.08,
    glyph: dots([[14, 12, 4], [22, 16, 2.5], [18, 22, 2], [48, 30, 5], [56, 26, 3], [54, 36, 2.5], [80, 14, 3.5], [86, 20, 2], [76, 40, 3], [30, 40, 2.5]]),
  },
  {
    id: 'sand',
    label: N_('Sand planet'),
    desc: N_('No water at all: endless dunes over old ocean basins, rocky plateaus and mountain walls. New every time.'),
    type: 'continents',
    template: 'none',
    land: 0.45,
    surface: 'sand',
    glyph: [[24, 18, 14, 9], [64, 30, 20, 10], [86, 12, 7, 5]],
  },
  {
    id: 'snow',
    label: N_('Snow planet'),
    desc: N_('No open water: snowfields and frozen basins, with bare ground on windswept ridges and slopes. New every time.'),
    type: 'continents',
    template: 'none',
    land: 0.45,
    surface: 'snow',
    glyph: [[30, 20, 18, 10], [72, 32, 16, 9], [84, 10, 6, 4]],
  },
  { id: 'island', label: N_('Island'), desc: N_('Adds one island in the current view, keeping the rest of the map.'), type: 'island', template: 'none', view: true, land: 0.35, glyph: [[50, 25, 17, 11]] },
  {
    id: 'archipelago',
    label: N_('Archipelago'),
    desc: N_('Adds a chain of islands in the current view, keeping the rest of the map.'),
    type: 'archipelago',
    template: 'none',
    view: true,
    land: 0.18,
    glyph: dots([[28, 16, 5], [40, 20, 3.5], [50, 26, 4.5], [60, 31, 3], [70, 34, 4], [34, 30, 2.5], [64, 18, 2.5]]),
  },
];

const REALISM: { value: Realism; label: string; seconds: number; desc: string }[] = [
  { value: 'easy', label: N_('Easy'), seconds: 3, desc: N_('Tectonic plates raise the land and rivers wear it into valleys and ridges; winds, rain shadows, rivers and biomes.') },
  { value: 'medium', label: N_('Medium'), seconds: 3.5, desc: N_('Lets the river network settle further, for longer rivers and cleaner valleys.') },
  { value: 'high', label: N_('High'), seconds: 4.5, desc: N_('Settles the river network fully and rounds ridges by soil creep.') },
  { value: 'ultra', label: N_('Ultra'), seconds: 9, desc: N_('Also carves fine valleys at full resolution. The slowest option.') },
];

/** Flat maps: the climate at the map's centre, as a latitude on an Earth-like world. */
const CLIMATE_ZONES = [
  { value: '10', label: N_('Tropical') },
  { value: '27', label: N_('Dry belt') },
  { value: '45', label: N_('Temperate') },
  { value: '60', label: N_('Cold') },
  { value: '72', label: N_('Polar') },
];

const describe = (v: number, labels: string[]) => labels[Math.min(labels.length - 1, Math.floor(((v + 1) / 2) * labels.length))];

function Glyph({ blobs, view, surface }: { blobs: Blob[]; view?: boolean; surface?: Surface }) {
  return (
    <svg className={'preset-glyph' + (surface ? ' ' + surface : '')} viewBox="0 0 100 50" aria-hidden>
      <rect width="100" height="50" rx="4" className={surface ? 'ground' : 'sea'} />
      {blobs.map(([cx, cy, rx, ry, sea], i) => (
        <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} className={sea ? 'sea' : 'land'} />
      ))}
      {view && <rect x="12" y="6" width="76" height="38" rx="3" className="frame" />}
    </svg>
  );
}

function randomSeed() {
  const words = ['amber', 'basalt', 'cinder', 'drake', 'ember', 'fjord', 'gale', 'hollow', 'ivory', 'jade', 'kestrel', 'lumen', 'mire', 'north', 'onyx', 'pale', 'quartz', 'rune', 'sable', 'thorn'];
  const w = () => words[Math.floor(Math.random() * words.length)];
  return `${w()}-${w()}-${Math.floor(Math.random() * 1000)}`;
}
const seedNumber = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) >>> 0 : seedFromString(s));

function PreviewCanvas({ image, busy, className, aspect }: { image: ImageData | null; busy: boolean; className?: string; aspect?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !image) return;
    c.width = image.width;
    c.height = image.height;
    c.getContext('2d')!.putImageData(image, 0, 0);
  }, [image]);
  return (
    <div className={'gen-preview ' + (className ?? '')} style={aspect ? { aspectRatio: aspect } : undefined}>
      <canvas ref={ref} />
      {busy && (
        <span className="gen-preview-busy">
          <LoaderCircle className="spin" size={18} />
        </span>
      )}
    </div>
  );
}

export function GenerateDialog() {
  const { t } = useTranslation();
  const set = useEditor((s) => s.set);
  const units = useEditor((s) => s.units);
  const planet = useDoc((s) => s.meta?.planet);
  const [presetId, setPresetId] = useState('continents');
  const preset = PRESETS.find((p) => p.id === presetId)!;
  const [realism, setRealism] = useState<Realism>('medium');
  const [seed, setSeed] = useState(randomSeed);
  const [land, setLand] = useState(planet?.landFraction ?? 0.29);
  const [mountains, setMountains] = useState(0.75);
  const [rough, setRough] = useState(0.35);
  const [warmth, setWarmth] = useState(0);
  const [wetness, setWetness] = useState(0);
  const [rivers, setRivers] = useState<RiverAmount>('normal');
  const [biomes, setBiomes] = useState(true);
  const [settlements, setSettlements] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const flat = planet?.mapType === 'flat';
  const [climateLat, setClimateLat] = useState('45');
  const [variants, setVariants] = useState<{ seed: string; image: ImageData | null }[] | null>(null);
  const [preview, setPreview] = useState<ImageData | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const worker = useRef<PreviewWorker | null>(null);
  const close = () => set({ dialog: null });

  useEffect(() => {
    worker.current = new PreviewWorker();
    return () => worker.current?.dispose();
  }, []);

  const choosePreset = (p: Preset) => {
    setPresetId(p.id);
    // every visit to a waterless planet is a new one
    if (p.surface) setSeed(randomSeed());
    setLand(p.land ?? planet?.landFraction ?? 0.29);
    setVariants(null);
  };

  const options = (s: string): GenerateOptions => ({
    type: preset.type,
    template: preset.template,
    realism,
    seed: seedNumber(s),
    landFraction: land,
    mountains,
    roughness: rough,
    warmth,
    wetness,
    biomes,
    rivers,
    settlements,
    region: preset.view ? 'view' : 'world',
    climateLat: Number(climateLat),
    surface: preset.surface,
  });

  // live preview of exactly this seed and these settings (shape and climate; rivers and erosion are added on generate)
  const previewOptions = useMemo<GenerateOptions | null>(
    () =>
      preset.view
        ? null
        : { type: preset.type, template: preset.template, realism: 'easy', seed: seedNumber(seed), landFraction: land, mountains, roughness: rough, warmth, wetness, biomes, rivers: 'none', settlements: false, region: 'world', climateLat: Number(climateLat), surface: preset.surface },
    [preset, seed, land, mountains, rough, warmth, wetness, biomes, climateLat],
  );
  useEffect(() => {
    if (!previewOptions) return;
    let live = true;
    const t = setTimeout(() => {
      setPreviewBusy(true);
      void worker.current?.render(genParams(previewOptions, { W: 512, H: 256 })).then((img) => {
        if (!live) return;
        if (img) setPreview(img);
        setPreviewBusy(false);
      });
    }, 220);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [previewOptions]);

  const showVariants = () => {
    const seeds = Array.from({ length: 6 }, randomSeed);
    setVariants(seeds.map((s) => ({ seed: s, image: null })));
    seeds.forEach((s, i) => {
      void worker.current?.render(genParams(options(s), { W: 512, H: 256 })).then((img) => {
        setVariants((v) => (v && v[i]?.seed === s ? v.map((x, k) => (k === i ? { ...x, image: img } : x)) : v));
      });
    });
  };

  const go = () => {
    const o = options(seed);
    close();
    void generateWorld(o);
  };

  const r = REALISM.find((x) => x.value === realism)!;
  const sizeFactor = planet ? (planet.gridWidth * planet.gridHeight) / (4096 * 2048) : 1;
  const secs = (x: number) => {
    const s = x * sizeFactor;
    return s < 60 ? t('≈ {n} s', { n: Math.max(1, Math.round(s)) }) : t('≈ {n} min', { n: Math.round(s / 60) });
  };
  const mapKm2 = planet ? surfaceAreaKm2(planet) : 510e6;
  const world = PRESETS.filter((p) => !p.view && !(flat && p.planetOnly));
  const aspect = flat && planet ? `${planet.gridWidth} / ${planet.gridHeight}` : '2 / 1';
  const inView = PRESETS.filter((p) => p.view);
  const card = (p: Preset) => (
    <button key={p.id} className={'preset-card' + (p.id === presetId ? ' on' : '')} onClick={() => choosePreset(p)} title={t(p.desc)}>
      <Glyph blobs={p.glyph} view={p.view} surface={p.surface} />
      <span>{t(p.label)}</span>
    </button>
  );

  return (
    <Modal
      title={t('Generate world')}
      wide
      onClose={close}
      footer={
        <div className="btn-row end">
          <span className="gen-foot-hint">
            <Clock size={13} /> {t('{level}: {time} · you can undo it', { level: t(r.label), time: secs(r.seconds) })}
          </span>
          <button className="btn" onClick={close}>
            {t('Cancel')}
          </button>
          <button className="btn primary" onClick={go}>
            <WandSparkles size={14} /> {t('Generate')}
          </button>
        </div>
      }
    >
      <div className="gen-layout">
        <div className="gen-left">
          <h3 className="gen-h">
            {flat ? t('Whole map') : t('Whole planet')} <small>{t('replaces the map')}</small>
          </h3>
          <div className="preset-grid">{world.map(card)}</div>
          <h3 className="gen-h">
            {t('In the current view')} <small>{t('adds to the map')}</small>
          </h3>
          <div className="preset-grid two">{inView.map(card)}</div>
          <p className="hint">{t(preset.desc)}</p>

          {flat && (
            <>
              <h3 className="gen-h">{t('Climate')}</h3>
              <Segmented value={climateLat} onChange={setClimateLat} options={CLIMATE_ZONES.map((z) => ({ ...z, label: t(z.label) }))} />
            </>
          )}
          <h3 className="gen-h">{t('Realism')}</h3>
          <Segmented value={realism} onChange={setRealism} options={REALISM.map((x) => ({ value: x.value, label: t(x.label), title: `${t(x.desc)} (${secs(x.seconds)})` }))} />
          <p className="hint">
            {t(r.desc)} <b>{secs(r.seconds)}</b>
            {(realism === 'high' || realism === 'ultra') && ' — this can take a while; you can cancel it.'}
          </p>
        </div>

        <div className="gen-right">
          {preset.view ? (
            <div className="gen-preview placeholder">
              <Glyph blobs={preset.glyph} view />
              <p className="hint">{t('Land is generated inside what you see on the map now. Zoom or pan first to choose where it goes.')}</p>
            </div>
          ) : (
            <PreviewCanvas image={preview} busy={previewBusy} aspect={aspect} />
          )}
          <div className="seed-row">
            <TextField label={t('Seed')} value={seed} onChange={setSeed} />
            <button className="icon-btn" title={t('Random seed')} onClick={() => setSeed(randomSeed())}>
              <Dices size={18} />
            </button>
            {!preset.view && (
              <button className="btn small" title={t('Show six other seeds with these settings')} onClick={showVariants}>
                <LayoutGrid size={13} /> {t('Variants')}
              </button>
            )}
          </div>
          {variants && !preset.view && (
            <div className="variant-grid">
              {variants.map((v) => (
                <button key={v.seed} className={'variant' + (v.seed === seed ? ' on' : '')} onClick={() => setSeed(v.seed)} title={`Seed ${v.seed}`}>
                  <PreviewCanvas image={v.image} busy={!v.image} aspect={aspect} />
                </button>
              ))}
            </div>
          )}
          <p className="hint">{t('Same seed and settings always give the same world in this version of Loremapper.')}</p>
        </div>
      </div>

      <button className={'gen-advanced-toggle' + (advanced ? ' open' : '')} onClick={() => setAdvanced(!advanced)}>
        <ChevronDown size={14} /> {t('Advanced settings')}
      </button>
      {advanced && (
        <div className="gen-advanced">
          {preset.view ? (
            <Slider label={t('Land in view')} value={land} min={0.05} max={0.7} onChange={setLand} format={(v) => `${Math.round(v * 100)}%`} />
          ) : (
            <Slider label={flat ? t('Land') : t('Land (true surface area)')} value={land} min={0.03} max={0.7} onChange={setLand} format={(v) => `${Math.round(v * 100)}% · ${formatArea(v * mapKm2, units)}`} />
          )}
          <Slider label={t('Mountain height')} value={mountains} min={0} max={1} onChange={setMountains} format={(v) => t('up to {h}', { h: formatHeight(v * (planet?.maxElevation ?? 10000) * 0.95, units) })} />
          <Slider label={t('Hills')} value={rough} min={0} max={1} onChange={setRough} format={(v) => describe(v * 2 - 1, [t('Flat plains'), t('Gentle'), t('Hilly'), t('Rugged')])} />
          <Slider label={t('Temperature')} value={warmth} min={-1} max={1} onChange={setWarmth} format={(v) => describe(v, [t('Ice age'), t('Cool'), t('Earth-like'), t('Earth-like'), t('Warm'), t('Hothouse')])} />
          <Slider label={t('Rainfall')} value={wetness} min={-1} max={1} onChange={setWetness} format={(v) => describe(v, [t('Arid'), t('Dry'), t('Earth-like'), t('Earth-like'), t('Wet'), t('Lush')])} />
          <Segmented
            label={t('Rivers')}
            value={rivers}
            onChange={setRivers}
            options={[
              { value: 'none', label: t('None') },
              { value: 'few', label: t('Few') },
              { value: 'normal', label: t('Normal') },
              { value: 'many', label: t('Many') },
            ]}
          />
          <Toggle label={t('Paint biomes by climate')} checked={biomes} onChange={setBiomes} />
          <Toggle label={t('Scatter named settlements')} checked={settlements} onChange={setSettlements} />
        </div>
      )}
    </Modal>
  );
}
