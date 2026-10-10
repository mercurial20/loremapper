import { setUnits, useEditor } from '../store/editorStore';

/** Global display units: kilometres and metres, or miles and feet. */
export function UnitsSwitch() {
  const units = useEditor((s) => s.units);
  return (
    <div className="units-switch" role="group" aria-label="Units">
      <button className={units === 'metric' ? 'on' : ''} onClick={() => setUnits('metric')} title="Metric: km, km², m" aria-pressed={units === 'metric'}>
        km
      </button>
      <button className={units === 'imperial' ? 'on' : ''} onClick={() => setUnits('imperial')} title="Imperial: mi, mi², ft" aria-pressed={units === 'imperial'}>
        mi
      </button>
    </div>
  );
}
