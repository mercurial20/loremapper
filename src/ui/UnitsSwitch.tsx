import { setUnits, useEditor } from '../store/editorStore';
import { useTranslation } from 'react-i18next';

/** Global display units: kilometres and metres, or miles and feet. */
export function UnitsSwitch() {
  const { t } = useTranslation();
  const units = useEditor((s) => s.units);
  return (
    <div className="units-switch" role="group" aria-label={t('Units')}>
      <button className={units === 'metric' ? 'on' : ''} onClick={() => setUnits('metric')} title={t('Metric: km, km², m')} aria-pressed={units === 'metric'}>
        {t('km')}
      </button>
      <button className={units === 'imperial' ? 'on' : ''} onClick={() => setUnits('imperial')} title={t('Imperial: mi, mi², ft')} aria-pressed={units === 'imperial'}>
        {t('mi')}
      </button>
    </div>
  );
}
