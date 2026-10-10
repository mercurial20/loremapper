import { surfaceAreaKm2 } from '../../core/planet';
import { formatArea, formatHeight, formatLength } from '../../core/units';
import { useDoc } from '../../store/docStore';
import { useEditor } from '../../store/editorStore';
import { MeasureField, NumberField } from '../controls/controls';
import { Modal } from './Modal';

/** Settings of the open map: a planet or a flat map. */
export function PlanetDialog() {
  const set = useEditor((s) => s.set);
  const meta = useDoc((s) => s.meta);
  const setMeta = useDoc((s) => s.setMeta);
  const stats = useEditor((s) => s.landStats);
  const units = useEditor((s) => s.units);
  if (!meta) return null;
  const p = meta.planet;
  const flat = p.mapType === 'flat';
  const area = surfaceAreaKm2(p);
  const upd = (patch: Partial<typeof p>) => setMeta({ planet: { ...p, ...patch } });
  const cellKm = flat ? (p.cellKm ?? 1) : (Math.PI * p.radiusKm) / p.gridHeight;
  const share = (km2: number, f: number) => `${formatArea(km2, units)} (${(f * 100).toFixed(1)}%)`;
  return (
    <Modal title={flat ? 'Flat map' : 'Planet'} onClose={() => set({ dialog: null })}>
      <div className="planet-stats">
        {flat ? (
          <div>
            <span>Size</span>
            <b>
              {formatLength(p.gridWidth * cellKm, units)} × {formatLength(p.gridHeight * cellKm, units)}
            </b>
          </div>
        ) : (
          <div>
            <span>Circumference</span>
            <b>{formatLength(2 * Math.PI * p.radiusKm, units)}</b>
          </div>
        )}
        <div>
          <span>{flat ? 'Area' : 'Surface area'}</span>
          <b>{formatArea(area, units)}</b>
        </div>
        <div>
          <span>Land</span>
          <b>{stats ? share(stats.areaKm2, stats.fraction) : '—'}</b>
        </div>
        <div>
          <span>Water</span>
          <b>{stats ? share(area - stats.areaKm2, 1 - stats.fraction) : '—'}</b>
        </div>
        <div>
          <span>Grid</span>
          <b>
            {p.gridWidth} × {p.gridHeight} · {formatLength(cellKm, units)} cells
          </b>
        </div>
        <div>
          <span>Geometry</span>
          <b>{flat ? 'Flat: uniform scale, no wrapping' : 'Sphere, equirectangular map'}</b>
        </div>
      </div>
      <div className="grid2">
        {!flat && <MeasureField label="Radius" kind="length" value={p.radiusKm} min={500} max={70000} step={{ metric: 10, imperial: 10 }} onChange={(v) => upd({ radiusKm: v })} />}
        {!flat && <NumberField label="Gravity" value={p.gravity} min={0.05} max={10} step={0.05} suffix="g" onChange={(v) => upd({ gravity: v })} />}
        <MeasureField label="Sea level" kind="height" value={p.seaLevel} min={-5000} max={5000} step={{ metric: 10, imperial: 50 }} onChange={(v) => upd({ seaLevel: v })} />
        <MeasureField label="Max elevation (a.s.l.)" kind="height" value={p.maxElevation} min={500} max={30000} step={{ metric: 100, imperial: 500 }} onChange={(v) => upd({ maxElevation: v })} />
        <MeasureField label={flat ? 'Deepest water' : 'Deepest ocean'} kind="height" value={p.minElevation} min={-30000} max={-100} step={{ metric: 100, imperial: 500 }} onChange={(v) => upd({ minElevation: v })} />
        <NumberField label="Generator land share" value={Math.round(p.landFraction * 100)} min={5} max={70} step={1} suffix="%" onChange={(v) => upd({ landFraction: v / 100 })} />
      </div>
      {!flat && (
        <p className="hint">
          With {p.gravity.toFixed(2)} g, the tallest mountains could stand about {formatHeight(8849 / Math.max(0.05, p.gravity), units)} (Everest scaled by 1 / gravity, since rock
          can carry a mountain only so high: Weisskopf 1975).
          {Math.abs(p.maxElevation - 8849 / Math.max(0.05, p.gravity)) > 0.35 * (8849 / Math.max(0.05, p.gravity)) && (
            <>
              {' '}
              <button className="btn ghost small" onClick={() => upd({ maxElevation: Math.round(8849 / Math.max(0.05, p.gravity) / 100) * 100 })}>
                Use it as max elevation
              </button>
            </>
          )}
        </p>
      )}
      <p className="hint">
        Raising the sea level floods coasts without changing stored elevations: heights are kept relative to a fixed datum.{' '}
        {flat
          ? 'The size of a flat map is fixed when it is created; switching units never changes it.'
          : 'The radius sets every distance, scale bar and area.'}
      </p>
    </Modal>
  );
}
