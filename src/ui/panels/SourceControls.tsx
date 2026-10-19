import { RefreshCw, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatFlow, formatLength } from '../../core/units';
import { editor } from '../../editor/Editor';
import { deleteAllSources, deleteSource, detachSource, rerunAllSources, sourceAridity, updateSource } from '../../editor/sources';
import { formatNumber, t } from '../../i18n';
import { N_ } from '../../i18n/mark';
import type { PathFeature, SourceEnd, WaterSource } from '../../model/types';
import { sampleSpline } from '../../render/vectorGeometry';
import { useDoc } from '../../store/docStore';
import { useEditor } from '../../store/editorStore';
import { climateLatAt } from '../../terrain/waterSim';
import { Hint, Select, Slider, TextField, Toggle } from '../controls/controls';

/** Discharges a source can give, m³/s: a brook … a great river. */
const Q_MIN = 0.5;
const Q_MAX = 200_000;

/** Net evaporation in words: what the air takes, or how much more it rains. */
const netEvaporation = (mm: number) => (mm < 0 ? t('rain exceeds it by {mm} mm a year', { mm: formatNumber(-mm) }) : t('{mm} mm a year', { mm: formatNumber(mm) }));

/** A discharge rounded to what the slider can tell apart. */
const roundQ = (q: number) => (q < 10 ? Math.round(q * 10) / 10 : Number(q.toPrecision(2)));

const ENDS: Record<SourceEnd, string> = {
  sea: N_('It reaches the sea'),
  lake: N_('It ends in a lake'),
  'closed-lake': N_('It ends in a lake of its own with no outflow: the climate takes all the water that flows in'),
  marsh: N_('It spreads into marshes and dries up there'),
  river: N_('It joins another river'),
  edge: N_('It leaves the map'),
  pit: N_('It sinks into a hollow too large to fill'),
  dry: N_('It dries up on the way'),
};

/** How long a source's rivers are, km. */
function lengthKm(rivers: PathFeature[]): number {
  const geo = editor.model?.geo;
  if (!geo) return 0;
  let len = 0;
  for (const p of rivers) {
    const pts = sampleSpline(p.points, 1, false, 2);
    for (let i = 1; i < pts.length; i++) len += geo.distanceKm(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  }
  return len;
}

/** River tool, sources: the size of new sources, and the source being edited. */
export function SourceControls() {
  const { t } = useTranslation();
  const sources = useDoc((s) => s.doc.sources);
  const paths = useDoc((s) => s.doc.paths);
  const active = useEditor((s) => s.activeSource);
  const q = useEditor((s) => s.sourceQ);
  const units = useEditor((s) => s.units);
  const set = useEditor((s) => s.set);
  const src = active ? sources[active] : undefined;
  const list = Object.values(sources);
  return (
    <>
      <Hint>{t('Click on land to place a source: its water runs downhill, fills hollows into lakes, spreads into marshes on flats and goes on until it reaches the sea or the climate takes it all. Click a source to edit it, drag it to move it; Alt-click or Delete removes it.')}</Hint>
      {!src && <Slider label={t('Water of a new source')} value={q} min={Q_MIN} max={Q_MAX} log onChange={(v) => set({ sourceQ: roundQ(v) })} format={(v) => formatFlow(v, units)} hint={t('A brook gives about 1 m³/s, the Thames 65, the Rhine 2,300, the Amazon 200,000')} />}
      {list.length > 0 && (
        <Select label={t('Source')} value={src ? src.id : ''} onChange={(id) => set({ activeSource: id || null })} options={[{ value: '', label: t('None (place a new one)') }, ...list.map((x) => ({ value: x.id, label: x.name }))]} />
      )}
      {src && <SourceCard key={src.id} src={src} paths={paths} />}
      {list.length > 1 && (
        <div className="btn-row">
          <button className="btn" onClick={rerunAllSources} title={t('Work out again where the water of every source goes, on the ground as it is now')}>
            <RefreshCw size={14} /> {t('Run all again')}
          </button>
          <button className="btn danger" onClick={deleteAllSources} title={t('Remove every source with its rivers and lakes')}>
            <Trash2 size={14} /> {t('Delete all ({n})', { n: list.length })}
          </button>
        </div>
      )}
    </>
  );
}

/** One source: its size and climate, and what its water does. */
export function SourceCard({ src, paths }: { src: WaterSource; paths: Record<string, PathFeature> }) {
  const { t } = useTranslation();
  const units = useEditor((s) => s.units);
  // settings being dragged, until the source runs with them
  const [draft, setDraft] = useState<{ of: WaterSource; v: Partial<WaterSource> } | null>(null);
  const timer = useRef(0);
  const pending = draft?.of === src ? draft.v : {};
  const model = editor.model;
  if (!model) return null;
  const change = (patch: Partial<Pick<WaterSource, 'q' | 'aridity'>>) => {
    const next = { ...pending, ...patch };
    setDraft({ of: src, v: next });
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => updateSource(src.id, next), 450);
  };
  const v = { ...src, ...pending };
  const rivers = Object.values(paths).filter((p) => p.source === src.id);
  const last = rivers[rivers.length - 1];
  const mouthQ = last?.flow?.[last.flow.length - 1];
  const lat = climateLatAt(model.planet, model.geo, src.at[1]);
  const auto = sourceAridity(model, { at: src.at, aridity: null });
  return (
    <>
      <TextField label={t('Name')} value={src.name} onChange={(name) => updateSource(src.id, { name })} />
      <Slider label={t('Water')} value={v.q} min={Q_MIN} max={Q_MAX} log onChange={(x) => change({ q: roundQ(x) })} format={(x) => formatFlow(x, units)} hint={t('How much water the source gives. More water carries the river further, makes it wider and fills larger lakes. A brook gives about 1 m³/s, the Thames 65, the Rhine 2,300, the Amazon 200,000')} />
      <Toggle
        label={t('Climate from the latitude')}
        checked={v.aridity === null}
        onChange={(on) => change({ aridity: on ? null : auto })}
        hint={t('How much water the air takes from lakes and marshes, less the rain: in the wet tropics and the cool middle latitudes it rains more (lakes overflow, rivers go on), in the dry belts around 25° of latitude the air takes the most')}
      />
      {v.aridity === null ? (
        <div className="kv">
          <span>{t('Evaporation')}</span>
          <b>{t('{what} (latitude {lat}°)', { what: netEvaporation(auto), lat: formatNumber(Math.round(Math.abs(lat))) })}</b>
        </div>
      ) : (
        <Slider label={t('Evaporation')} value={v.aridity} min={-1500} max={3000} step={10} onChange={(x) => change({ aridity: Math.round(x / 10) * 10 })} format={netEvaporation} hint={t('Net evaporation from open water (what the air takes, less the rain that falls on it). Lakes grow until they lose to it all that flows in; where it rains more, they overflow.')} />
      )}
      <Hint>{t(ENDS[src.made.end])}</Hint>
      <div className="kv">
        <span>{t('Length')}</span>
        <b>{formatLength(lengthKm(rivers), units)}</b>
      </div>
      {mouthQ !== undefined && (
        <div className="kv">
          <span>{t('At the mouth')}</span>
          <b>{formatFlow(mouthQ, units)}</b>
        </div>
      )}
      {src.made.lakes.length > 0 && (
        <div className="kv">
          <span>{t('Lakes')}</span>
          <b>{formatNumber(src.made.lakes.length)}</b>
        </div>
      )}
      <div className="btn-row">
        <button className="btn" onClick={() => detachSource(src.id)} title={t('Keep the rivers and lakes as they are, as ordinary ones you can reshape; the source goes')}>
          {t('Keep as rivers')}
        </button>
        <button className="btn danger" onClick={() => deleteSource(src.id)} title={t('Remove the source with its rivers and lakes')}>
          <Trash2 size={14} /> {t('Delete')}
        </button>
      </div>
    </>
  );
}

/** In a river's card: the source it flows from. */
export function RiverSource({ id }: { id: string }) {
  const { t } = useTranslation();
  const src = useDoc((s) => s.doc.sources[id]);
  if (!src) return null;
  return (
    <div className="kv">
      <span>{t('Flows from')}</span>
      <b>
        <button
          className="btn ghost small"
          onClick={() => {
            useEditor.getState().set({ riverMode: 'source', activeSource: id });
            useEditor.getState().setTool('river');
          }}
          title={t('Edit the source: how much water it gives, where it is')}
        >
          {src.name}
        </button>
      </b>
    </div>
  );
}
