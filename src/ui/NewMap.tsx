import { ArrowLeft, Earth, Globe2, LoaderCircle, Map as MapIcon, Square, Upload, WandSparkles } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { defaultPlanet, flatMap, FLAT_PRESETS, GRID_PRESETS, surfaceAreaKm2, type GridPreset } from '../core/planet';
import { formatArea, formatLength, KM_PER_MI } from '../core/units';
import { EARTH_CREDIT, EARTH_RADIUS_KM, loadEarth } from '../editor/earth';
import { editor } from '../editor/Editor';
import { importProject } from '../editor/exporter';
import { generateWorld } from '../editor/generate';
import { useEditor } from '../store/editorStore';
import { MeasureField, Select, TextField } from './controls/controls';

type Start = 'generate' | 'earth' | 'empty';
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
 * How to begin a new map: generate one, start from the real Earth, or start
 * empty — as a planet or a flat map. Used on first launch and for New map.
 */
export function NewMapFlow({ onCancel, onCreated }: { onCancel?: () => void; onCreated?: () => void }) {
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
      const fallback = start === 'generate' ? (kind === 'flat' ? 'New realm' : 'New world') : kind === 'flat' ? 'New map' : 'New world';
      await editor.createMap(name.trim() || fallback, planet);
      onCreated?.();
      if (start === 'generate') set({ dialog: 'generate' });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  };
  const createEarth = async () => {
    setWorking(true);
    setError(null);
    set({ busy: 'Loading Earth (≈ 8 MB, once)…' });
    try {
      const heights = await loadEarth();
      set({ busy: 'Building the map…' });
      await editor.createMap(name.trim() || 'Earth', { ...defaultPlanet('standard'), radiusKm: EARTH_RADIUS_KM, seaLevel: 0, landFraction: 0.29 }, { heights, source: 'earth-etopo1' });
      onCreated?.();
      notify('Earth is ready — every coast, mountain and sea floor is editable');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      set({ busy: null });
      setWorking(false);
    }
  };

  if (!start)
    return (
      <div className="new-map">
        <div className="start-cards">
          <Card icon={<WandSparkles size={22} />} title="Generate a world" onClick={() => setStart('generate')}>
            Continents, climates and rivers from a seed, as a planet or a flat map. Then edit everything.
          </Card>
          <Card icon={<Earth size={22} />} title="Start from Earth" onClick={() => setStart('earth')}>
            Our planet with real coastlines, mountains and sea floor, ready to change into your own.
          </Card>
          <Card icon={<MapIcon size={22} />} title="Empty map" onClick={() => setStart('empty')}>
            An ocean planet or a blank flat canvas. Raise the land yourself.
          </Card>
        </div>
        <div className="new-map-foot">
          <button className="btn ghost small" onClick={() => fileRef.current?.click()} title="Open a .loremap project exported from Loremapper">
            <Upload size={13} /> Import a project file…
          </button>
          {onCancel && (
            <button className="btn" onClick={onCancel}>
              Cancel
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
                notify('Import failed: ' + (err instanceof Error ? err.message : String(err)), 'error');
              }
            }}
          />
        </div>
      </div>
    );

  const back = (
    <button className="btn ghost small" onClick={() => setStart(null)} disabled={working}>
      <ArrowLeft size={13} /> Back
    </button>
  );

  if (start === 'earth')
    return (
      <div className="new-map">
        <div className="earth-intro">
          <Earth size={36} />
          <div>
            <h3>Start from Earth</h3>
            <p className="hint">
              A {formatLength(EARTH_RADIUS_KM, units)}-radius planet with Earth’s real coastlines, mountains and ocean floor (about 10 km per cell, sea level at 0). Nothing else is
              added: no invented towns or borders. Sculpt, paint and draw on it like any other map.
            </p>
            <p className="hint small">{EARTH_CREDIT}.</p>
          </div>
        </div>
        <TextField label="Name" value={name} placeholder="Earth" onChange={setName} />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="new-map-foot">
          {back}
          <button className="btn primary" onClick={createEarth} disabled={working}>
            {working ? <LoaderCircle size={14} className="spin" /> : <Earth size={14} />} {error ? 'Try again' : 'Create Earth map'}
          </button>
        </div>
      </div>
    );

  const flat = kind === 'flat';
  const cell = flat ? (planet.cellKm ?? 1) : (Math.PI * planet.radiusKm) / planet.gridHeight;
  return (
    <div className="new-map">
      <h3 className="gen-h">{start === 'generate' ? 'Generate a world on…' : 'An empty…'}</h3>
      <div className="start-cards two">
        <Card icon={<Globe2 size={20} />} title="Planet map" on={!flat} onClick={() => setKind('planet')}>
          A whole round world: wraps east–west, with poles, latitude and longitude.
        </Card>
        <Card icon={<Square size={20} />} title="Flat map" on={flat} onClick={() => setKind('flat')}>
          A rectangle of fixed size with the same scale everywhere: a kingdom, a region, a continent.
        </Card>
      </div>
      <TextField label="Name" value={name} placeholder={flat ? 'New realm' : 'New world'} onChange={setName} />
      {flat ? (
        <>
          <div className="grid2">
            <MeasureField label="Width" kind="length" value={widthKm} min={1} max={40000} step={{ metric: 10, imperial: 10 }} onChange={setWidthKm} />
            <MeasureField label="Height" kind="length" value={heightKm} min={1} max={40000} step={{ metric: 10, imperial: 10 }} onChange={setHeightKm} />
          </div>
          <Select<GridPreset> label="Detail" value={grid} options={(Object.keys(FLAT_PRESETS) as GridPreset[]).map((g) => ({ value: g, label: FLAT_PRESETS[g].label }))} onChange={setGrid} />
          <p className="hint">
            {formatLength(planet.gridWidth * cell, units)} × {formatLength(planet.gridHeight * cell, units)} · {planet.gridWidth} × {planet.gridHeight} cells of {formatLength(cell, units)}.
            The short side snaps to whole tiles. The size never changes when you switch units.
          </p>
        </>
      ) : (
        <>
          <div className="grid2">
            <MeasureField label="Planet radius" kind="length" value={radius} min={500} max={70000} step={{ metric: 10, imperial: 10 }} onChange={setRadius} />
            <MeasureField label="Highest peaks" kind="height" value={maxE} min={500} max={30000} step={{ metric: 100, imperial: 500 }} onChange={setMaxE} />
          </div>
          <Select<GridPreset> label="Detail" value={grid} options={(Object.keys(GRID_PRESETS) as GridPreset[]).map((g) => ({ value: g, label: GRID_PRESETS[g].label }))} onChange={setGrid} />
          <p className="hint">
            Surface {formatArea(surfaceAreaKm2(planet), units)} (Earth: {formatArea(510.1e6, units)}), about {formatLength(cell, units)} per cell. Only edited tiles use memory.
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
              <WandSparkles size={14} /> Create and generate…
            </>
          ) : (
            <>Create empty {flat ? 'map' : 'planet'}</>
          )}
        </button>
      </div>
    </div>
  );
}

/** First launch: no maps yet in this browser. */
export function WelcomeScreen({ viewer }: { viewer?: boolean }) {
  return (
    <div className="welcome-screen">
      <div className="welcome-card" role="dialog" aria-label="Welcome to Loremapper">
        <header>
          <h1>Welcome to Loremapper</h1>
          <p>Fantasy maps you build like real geography. Everything stays in this browser; nothing is uploaded.</p>
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
  const set = useEditor((s) => s.set);
  const notify = useEditor((s) => s.notify);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
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
  return (
    <div className="new-map">
      <p className="hint">
        Maps are saved in the browser where they were made, so maps from your computer aren’t here. On this device you can explore a map; to create and edit maps,
        open Loremapper in a desktop browser.
      </p>
      <div className="start-cards two">
        <Card
          icon={<Earth size={22} />}
          title="Explore Earth"
          onClick={() =>
            void run(async () => {
              set({ busy: 'Loading Earth (≈ 8 MB, once)…' });
              const heights = await loadEarth();
              await editor.createMap('Earth', { ...defaultPlanet('standard'), radiusKm: EARTH_RADIUS_KM, seaLevel: 0, landFraction: 0.29 }, { heights, source: 'earth-etopo1' });
            })
          }
        >
          Real coastlines, mountains and sea floor.
        </Card>
        <Card
          icon={<WandSparkles size={22} />}
          title="Explore a sample world"
          onClick={() =>
            void run(async () => {
              await editor.createMap('Sample world', defaultPlanet('standard'));
              await generateWorld(
                { type: 'continents', template: 'none', realism: 'easy', seed: 4242, landFraction: 0.29, mountains: 0.75, roughness: 0.35, warmth: 0, wetness: 0, biomes: true, rivers: 'normal', settlements: true, region: 'world' },
                { sample: true },
              );
            })
          }
        >
          A generated planet with rivers, biomes and towns.
        </Card>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="new-map-foot">
        <button className="btn ghost small" onClick={() => fileRef.current?.click()} disabled={working}>
          <Upload size={13} /> Open a .loremap file…
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
              notify('Could not open the file: ' + (err instanceof Error ? err.message : String(err)), 'error');
            }
          }}
        />
      </div>
    </div>
  );
}
