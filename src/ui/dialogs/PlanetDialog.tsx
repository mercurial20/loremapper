import { useDoc } from '../../store/docStore';
import { useEditor } from '../../store/editorStore';
import { NumberField } from '../controls/controls';
import { Modal } from './Modal';

export function PlanetDialog() {
  const set = useEditor((s) => s.set);
  const meta = useDoc((s) => s.meta);
  const setMeta = useDoc((s) => s.setMeta);
  const stats = useEditor((s) => s.landStats);
  if (!meta) return null;
  const p = meta.planet;
  const area = 4 * Math.PI * p.radiusKm * p.radiusKm;
  const upd = (patch: Partial<typeof p>) => setMeta({ planet: { ...p, ...patch } });
  const cellKm = (Math.PI * p.radiusKm) / p.gridHeight;
  return (
    <Modal title="Planet" onClose={() => set({ dialog: null })}>
      <div className="planet-stats">
        <div>
          <span>Surface area</span>
          <b>{(area / 1e6).toFixed(1)}M km²</b>
        </div>
        <div>
          <span>Land</span>
          <b>{stats ? `${(stats.areaKm2 / 1e6).toFixed(1)}M km² (${(stats.fraction * 100).toFixed(1)}%)` : '—'}</b>
        </div>
        <div>
          <span>Water</span>
          <b>{stats ? `${((area - stats.areaKm2) / 1e6).toFixed(1)}M km² (${(100 - stats.fraction * 100).toFixed(1)}%)` : '—'}</b>
        </div>
        <div>
          <span>Circumference</span>
          <b>{Math.round(2 * Math.PI * p.radiusKm).toLocaleString()} km</b>
        </div>
        <div>
          <span>Grid</span>
          <b>
            {p.gridWidth} × {p.gridHeight} · {cellKm.toFixed(1)} km cells
          </b>
        </div>
        <div>
          <span>Projection</span>
          <b>Equirectangular (plate carrée)</b>
        </div>
      </div>
      <div className="grid2">
        <NumberField label="Radius" value={p.radiusKm} min={500} max={70000} step={10} suffix="km" onChange={(v) => upd({ radiusKm: v })} />
        <NumberField label="Gravity" value={p.gravity} min={0.05} max={10} step={0.05} suffix="g" onChange={(v) => upd({ gravity: v })} />
        <NumberField label="Sea level" value={p.seaLevel} min={-5000} max={5000} step={10} suffix="m" onChange={(v) => upd({ seaLevel: v })} />
        <NumberField label="Max elevation (a.s.l.)" value={p.maxElevation} min={500} max={30000} step={100} suffix="m" onChange={(v) => upd({ maxElevation: v })} />
        <NumberField label="Deepest ocean" value={p.minElevation} min={-30000} max={-100} step={100} suffix="m" onChange={(v) => upd({ minElevation: v })} />
        <NumberField label="Generator land share" value={Math.round(p.landFraction * 100)} min={5} max={70} step={1} suffix="%" onChange={(v) => upd({ landFraction: v / 100 })} />
      </div>
      <p className="hint">
        Raising the sea level floods coasts without changing stored elevations — heights are kept in metres relative to a fixed datum. The radius sets every distance, scale bar and
        area. Gravity is recorded for reference.
      </p>
    </Modal>
  );
}
