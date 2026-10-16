import { Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatArea, formatHeight } from '../../core/units';
import { editor } from '../../editor/Editor';
import { deleteSelectedLake, selectedLake, setLakeLevel } from '../../editor/lakes';
import { useEditor } from '../../store/editorStore';
import type { LakeInfo } from '../../terrain/lakes';
import { Slider } from '../controls/controls';

/** The selected lake's level (up to where it would spill), and removing it. */
export function LakeControls({ measured }: { measured: boolean }) {
  const { t } = useTranslation();
  const at = useEditor((s) => s.selectedLake);
  useEditor((s) => s.lakeRev);
  const units = useEditor((s) => s.units);
  const readOnly = useEditor((s) => s.readOnly);
  // the level being dragged to, until the lake is set to it (and its figures change)
  const [draft, setDraft] = useState<{ of: LakeInfo; v: number } | null>(null);
  const timer = useRef(0);
  const info = at ? selectedLake() : null;
  if (!info || readOnly) return null;
  const sea = editor.model?.seaLevel ?? 0;
  const level = draft?.of === info ? draft.v : info.level;
  const change = (v: number) => {
    setDraft({ of: info, v });
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setLakeLevel(v), 350);
  };
  const lo = info.floor + 0.1;
  const hi = Math.max(info.spill, lo + 0.1);
  return (
    <div className="lake-sel">
      <Slider
        label={t('Water level')}
        value={level}
        min={lo}
        max={hi}
        onChange={change}
        format={(v) => formatHeight(v - sea, units)}
        hint={t('Lower, the lake shrinks into the deepest part of its bed; at the top, the water reaches the lowest point of its rim, where it would spill over.')}
      />
      {/* until the lands and seas are measured with the lake, its own figures */}
      {!measured && (
        <div className="kv">
          <span>{t('Area')}</span>
          <b>{formatArea(info.areaKm2, units)}</b>
        </div>
      )}
      <div className="kv">
        <span>{t('Room to rise')}</span>
        <b>{formatHeight(Math.max(0, info.spill - info.level), units)}</b>
      </div>
      <div className="btn-row">
        <button className="btn" onClick={() => setLakeLevel(info.spill)} disabled={info.spill - info.level < 0.05} title={t('Raise the water to the lowest point of the rim')}>
          {t('Fill to the brim')}
        </button>
        <button className="btn danger" onClick={deleteSelectedLake} title={t('Remove the water; the ground stays as it is')}>
          <Trash2 size={14} /> {t('Delete')}
        </button>
      </div>
    </div>
  );
}
