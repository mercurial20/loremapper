import { ArrowLeft, Castle, Globe2, Map as MapIcon, Square, Upload, WandSparkles } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { defaultPlanet, flatMap, FLAT_PRESETS, GRID_PRESETS, surfaceAreaKm2, type GridPreset } from '../core/planet';
import { formatArea, formatLength, KM_PER_MI } from '../core/units';
import { editor } from '../editor/Editor';
import { importProject } from '../editor/exporter';
import { generateWorld } from '../editor/generate';
import { useEditor } from '../store/editorStore';
import { MeasureField, Select, TextField } from './controls/controls';
import { UnitsSwitch } from './UnitsSwitch';
import { LanguageSwitch } from './LanguageSwitch';
import { WorldPicker } from './WorldPicker';
import { useTranslation } from 'react-i18next';

type Start = 'generate' | 'world' | 'empty';
type Kind = 'planet' | 'flat';

function Card({ icon, title, children, onClick, on }: { icon: ReactNode; title: string; children: ReactNode; onClick: () => void; on?: boolean }) {
  return (
    <button className={'start-card' + (on ? ' on' : '')} onClick={onClick}>
      <span className="start-icon">{icon}</span>
      <b>{title}</b>
      <small>{children}</small>
    </button>
  );
}

/**
 * How to begin a new map: generate one, start from a built-in world, or start
 * empty — as a planet or a flat map. Used on first launch and for New map.
 */
export function NewMapFlow({ onCancel, onCreated }: { onCancel?: () => void; onCreated?: () => void }) {
  const { t } = useTranslation();
  const units = useEditor((s) => s.units);
  const set = useEditor((s) => s.set);
  const notify = useEditor((s) => s.notify);
  const [start, setStart] = useState<Start | null>(null);
  const [kind, setKind] = useState<Kind>('planet');
  const [name, setName] = useState('');
  const [grid, setGrid] = useState<GridPreset>('standard');
  const [radius, setRadius] = useState(6371);
  const [maxE, setMaxE] = useState(10000);
  // separate starting sizes per unit system: 500 × 500 km, or 400 × 400 mi
  const startSide = units === 'imperial' ? 400 * KM_PER_MI : 500;
  const [widthKm, setWidthKm] = useState(startSide);
  const [heightKm, setHeightKm] = useState(startSide);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const planet = kind === 'flat' ? { ...flatMap(widthKm, heightKm, grid), maxElevation: maxE } : { ...defaultPlanet(grid), radiusKm: radius, maxElevation: maxE };
  const create = async () => {
    setWorking(true);
    setError(null);
    try {
      const fallback = start === 'generate' ? (kind === 'flat' ? t('New realm') : t('New world')) : kind === 'flat' ? t('New map') : t('New world');
      await editor.createMap(name.trim() || fallback, planet, { start: start === 'generate' ? 'generate' : 'empty' });
      onCreated?.();
      if (start === 'generate') set({ dialog: 'generate' });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  };

  if (!start)
    return (
      <div className="new-map">
        <div className="start-cards">
          <Card icon={<WandSparkles size={22} />} title={t('Generate a world')} onClick={() => setStart('generate')}>
            {t('Continents, climates and rivers from a seed, as a planet or a flat map. Then edit everything.')}
          </Card>
          <Card icon={<Castle size={22} />} title={t('Built-in world')} onClick={() => setStart('world')}>
            {t('Ready-made settings such as an inland sea or an island walled by mountains, generated fresh for you.')}
          </Card>
          <Card icon={<MapIcon size={22} />} title={t('Empty map')} onClick={() => setStart('empty')}>
            {t('An ocean planet or a blank flat canvas. Raise the land yourself.')}
          </Card>
        </div>
        <div className="new-map-foot">
          <button className="btn ghost small" onClick={() => fileRef.current?.click()} title={t('Open a .loremap project exported from Loremapper')}>
            <Upload size={13} /> {t('Import a project file…')}
          </button>
          {onCancel && (
            <button className="btn" onClick={onCancel}>
              {t('Cancel')}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            hidden
            accept=".loremap,.fantasymap,.zip"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                await importProject(f);
                set({ welcome: false });
                onCreated?.();
              } catch (err) {
                notify(t('Import failed: {error}', { error: err instanceof Error ? err.message : String(err) }), 'error');
              }
            }}
          />
        </div>
      </div>
    );

  if (start === 'world') return <WorldPicker onBack={() => setStart(null)} onCreated={onCreated} />;

  const back = (
    <button className="btn ghost small" onClick={() => setStart(null)} disabled={working}>
      <ArrowLeft size={13} /> {t('Back')}
    </button>
  );

  const flat = kind === 'flat';
  const cell = flat ? (planet.cellKm ?? 1) : (Math.PI * planet.radiusKm) / planet.gridHeight;
  return (
    <div className="new-map">
      <h3 className="gen-h">{start === 'generate' ? t('Generate a world on…') : t('An empty…')}</h3>
      <div className="start-cards two">
        <Card icon={<Globe2 size={20} />} title={t('Planet map')} on={!flat} onClick={() => setKind('planet')}>
          {t('A whole round world: wraps east–west, with poles, latitude and longitude.')}
        </Card>
        <Card icon={<Square size={20} />} title={t('Flat map')} on={flat} onClick={() => setKind('flat')}>
          {t('A rectangle of fixed size with the same scale everywhere: a kingdom, a region, a continent.')}
        </Card>
      </div>
      <TextField label={t('Name')} value={name} placeholder={flat ? t('New realm') : t('New world')} onChange={setName} />
      {flat ? (
        <>
          <div className="grid2">
            <MeasureField label={t('Width')} kind="length" value={widthKm} min={1} max={40000} step={{ metric: 10, imperial: 10 }} onChange={setWidthKm} />
            <MeasureField label={t('Height')} kind="length" value={heightKm} min={1} max={40000} step={{ metric: 10, imperial: 10 }} onChange={setHeightKm} />
          </div>
          <Select<GridPreset> label={t('Detail')} value={grid} options={(Object.keys(FLAT_PRESETS) as GridPreset[]).map((g) => ({ value: g, label: t(FLAT_PRESETS[g].label) }))} onChange={setGrid} />
          <p className="hint">
            {t('{w} × {h} · {cols} × {rows} cells of {cell}.', {
              w: formatLength(planet.gridWidth * cell, units),
              h: formatLength(planet.gridHeight * cell, units),
              cols: planet.gridWidth,
              rows: planet.gridHeight,
              cell: formatLength(cell, units),
            })}{' '}
            {t('The short side snaps to whole tiles. The size never changes when you switch units.')}
          </p>
        </>
      ) : (
        <>
          <div className="grid2">
            <MeasureField label={t('Planet radius')} kind="length" value={radius} min={500} max={70000} step={{ metric: 10, imperial: 10 }} onChange={setRadius} />
            <MeasureField label={t('Highest peaks')} kind="height" value={maxE} min={500} max={30000} step={{ metric: 100, imperial: 500 }} onChange={setMaxE} />
          </div>
          <Select<GridPreset> label={t('Detail')} value={grid} options={(Object.keys(GRID_PRESETS) as GridPreset[]).map((g) => ({ value: g, label: t(GRID_PRESETS[g].label) }))} onChange={setGrid} />
          <p className="hint">
            {t('Surface {area} (Earth: {earth}), about {cell} per cell. Only edited tiles use memory.', {
              area: formatArea(surfaceAreaKm2(planet), units),
              earth: formatArea(510.1e6, units),
              cell: formatLength(cell, units),
            })}
          </p>
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="new-map-foot">
        {back}
        <button className="btn primary" onClick={create} disabled={working}>
          {start === 'generate' ? (
            <>
              <WandSparkles size={14} /> {t('Create and generate…')}
            </>
          ) : (
            <>{flat ? t('Create empty map') : t('Create empty planet')}</>
          )}
        </button>
      </div>
    </div>
  );
}

/** First launch: no maps yet in this browser. */
export function WelcomeScreen({ viewer }: { viewer?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="welcome-screen">
      <div className="welcome-card" role="dialog" aria-label={t('Welcome to Loremapper')}>
        <header>
          <div className="welcome-units">
            <LanguageSwitch />
            <UnitsSwitch />
          </div>
          <h1>{t('Welcome to Loremapper')}</h1>
          <p>{t('Fantasy maps you build like real geography. Everything stays in this browser; nothing is uploaded.')}</p>
        </header>
        {viewer ? <ViewerStart /> : <NewMapFlow />}
      </div>
    </div>
  );
}

/**
 * Phones and tablets: there's nothing to look at yet. Maps live in the
 * browser that made them, so offer something to explore instead.
 */
function ViewerStart() {
  const { t } = useTranslation();
  const set = useEditor((s) => s.set);
  const notify = useEditor((s) => s.notify);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [worlds, setWorlds] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const run = async (fn: () => Promise<void>) => {
    setWorking(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      set({ busy: null });
      setWorking(false);
    }
  };
  if (worlds) return <WorldPicker onBack={() => setWorlds(false)} sample />;
  return (
    <div className="new-map">
      <p className="hint">
        {t('Maps are saved in the browser where they were made, so maps from your computer aren’t here. On this device you can explore a map; to create and edit maps, open Loremapper in a desktop browser.')}
      </p>
      <div className="start-cards two">
        <Card icon={<Castle size={22} />} title={t('Explore a built-in world')} onClick={() => setWorlds(true)}>
          {t('An inland sea, a walled isle, an archipelago and more.')}
        </Card>
        <Card
          icon={<WandSparkles size={22} />}
          title={t('Explore a sample world')}
          onClick={() =>
            void run(async () => {
              await editor.createMap(t('Sample world'), defaultPlanet('standard'), { start: 'generate' });
              await generateWorld(
                { type: 'continents', template: 'none', realism: 'easy', seed: 4242, landFraction: 0.29, mountains: 0.75, roughness: 0.35, warmth: 0, wetness: 0, biomes: true, rivers: 'normal', settlements: true, region: 'world' },
                { sample: true },
              );
            })
          }
        >
          {t('A generated planet with rivers, biomes and towns.')}
        </Card>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="new-map-foot">
        <button className="btn ghost small" onClick={() => fileRef.current?.click()} disabled={working}>
          <Upload size={13} /> {t('Open a .loremap file…')}
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept=".loremap,.fantasymap,.zip"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              await importProject(f);
              set({ welcome: false });
            } catch (err) {
              notify(t('Could not open the file: {error}', { error: err instanceof Error ? err.message : String(err) }), 'error');
            }
          }}
        />
      </div>
    </div>
  );
}
