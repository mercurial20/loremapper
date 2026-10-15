import { ArrowDown, ArrowUp, BringToFront, Copy, FlipHorizontal2, Lock, LockOpen, Plus, SendToBack, Trash2, Eye, EyeOff, X } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { useAssets } from '../../assets/library';
import { formatHeight, formatLength } from '../../core/units';
import { formatPlace } from '../format';
import {
  annotatePeak,
  deleteRefs,
  duplicateRefs,
  removePeak,
  reorderObjects,
  updateFeature,
  updateObjects,
} from '../../editor/commands';
import { editor } from '../../editor/Editor';
import { defaultName, ensureGeography, formatArea, freshGeography, landInside, regionName } from '../../editor/geography';
import {
  TERRITORY_TYPES,
  TERRITORY_TYPE_LABELS,
  type BorderStyle,
  type LabelFont,
  type MapLabel,
  type MapObject,
  type PathFeature,
  type RoadStyle,
  type Territory,
  type TerritoryType,
} from '../../model/types';
import { FONT_LABEL } from '../../render/fonts';
import { useDoc } from '../../store/docStore';
import { useEditor, useViewInfo } from '../../store/editorStore';
import { sampleSpline } from '../../render/vectorGeometry';
import { ColorField, Hint, MeasureField, NumberField, Select, Slider, TextField, Toggle } from '../controls/controls';
import { useTranslation } from 'react-i18next';

const SWATCHES = ['#b5452f', '#2f5d9a', '#3f8f5a', '#c79a2e', '#7a4aa0', '#2a8a8a', '#8f3a5c', '#5a5a5a'];

function geo() {
  return editor.model!.geo;
}

function Actions({ locked, hidden, onLock, onHide }: { locked: boolean; hidden: boolean; onLock: () => void; onHide: () => void }) {
  const { t } = useTranslation();
  const sel = useEditor((s) => s.selection);
  return (
    <div className="btn-row">
      <button className="btn" onClick={() => duplicateRefs(sel, 12 / editor.zoom)} title={t('Duplicate (Ctrl+D)')}>
        <Copy size={14} /> {t('Duplicate')}
      </button>
      <button className={'icon-btn' + (hidden ? ' on' : '')} onClick={onHide} title={hidden ? t('Show') : t('Hide')}>
        {hidden ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
      <button className={'icon-btn' + (locked ? ' on' : '')} onClick={onLock} title={locked ? t('Unlock') : t('Lock')}>
        {locked ? <Lock size={16} /> : <LockOpen size={16} />}
      </button>
      <button className="icon-btn danger" onClick={() => deleteRefs(sel)} title={t('Delete (Del)')}>
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function MetaEditor({ o }: { o: MapObject }) {
  const { t } = useTranslation();
  const entries = Object.entries(o.meta);
  const setMeta = (meta: Record<string, string>) => updateObjects([o.id], { meta }, t('Edit metadata'), 'meta:' + o.id);
  return (
    <div className="meta-editor">
      <div className="meta-head">
        <span>{t('Custom properties')}</span>
        <button
          className="icon-btn small"
          title={t('Add property')}
          onClick={() => {
            let k = 'property';
            let i = 1;
            while (k in o.meta) k = `property ${++i}`;
            setMeta({ ...o.meta, [k]: '' });
          }}
        >
          <Plus size={14} />
        </button>
      </div>
      {entries.length === 0 && <Hint>{t('Add key–value notes such as population, ruler or founding year.')}</Hint>}
      {entries.map(([k, v], i) => (
        <div className="meta-row" key={i}>
          <input
            value={k}
            onChange={(e) => {
              const next: Record<string, string> = {};
              for (const [kk, vv] of entries) next[kk === k ? e.target.value : kk] = vv;
              setMeta(next);
            }}
          />
          <input value={v} onChange={(e) => setMeta({ ...o.meta, [k]: e.target.value })} />
          <button
            className="icon-btn small"
            onClick={() => {
              const next = { ...o.meta };
              delete next[k];
              setMeta(next);
            }}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

function ObjectInspector({ o }: { o: MapObject }) {
  const { t } = useTranslation();
  const units = useEditor((s) => s.units);
  const assets = useAssets((s) => s.assets);
  const a = assets.find((x) => x.id === o.assetId);
  const layers = useDoc((s) => s.doc.objectLayers);
  const selAsset = useEditor((s) => s.assetId);
  const upd = (patch: Partial<MapObject>, key: string) => updateObjects([o.id], patch, t('Edit object'), `${key}:${o.id}`);
  const g = geo();
  const sizeKm = o.size * o.scale * g.kmPerCellY;
  return (
    <>
      <div className="asset-current">
        {a ? <img src={a.url} alt="" /> : <div className="missing">?</div>}
        <div>
          <b>{a ? t(a.name) : t('Missing asset')}</b>
          <small>{a ? t(a.category) : t('The original artwork was deleted')}</small>
        </div>
        {selAsset && selAsset !== o.assetId && (
          <button className="btn small" onClick={() => upd({ assetId: selAsset }, 'asset')} title={t('Swap artwork to the asset selected in the library')}>
            {t('Swap')}
          </button>
        )}
      </div>
      <TextField label={t('Name')} value={o.name} placeholder={t('e.g. Kingsford')} onChange={(v) => upd({ name: v }, 'name')} />
      <TextField label={t('Description')} value={o.description} multiline onChange={(v) => upd({ description: v }, 'desc')} />
      <div className="kv">
        <span>{t('Location')}</span>
        <b>{formatPlace(g, o.x, o.y, units)}</b>
      </div>
      <div className="grid2">
        <MeasureField label={t('Width')} kind="length" value={sizeKm} min={0.01} step={{ metric: 1, imperial: 1 }} onChange={(v) => upd({ size: v / g.kmPerCellY / o.scale }, 'size')} />
        <NumberField label={t('Rotation')} value={o.rotation} suffix="°" step={5} onChange={(v) => upd({ rotation: v }, 'rot')} />
      </div>
      <Slider label={t('Scale')} value={o.scale} min={0.05} max={20} log onChange={(v) => upd({ scale: v }, 'scale')} format={(v) => `${v.toFixed(2)}×`} />
      <Slider label={t('Opacity')} value={o.opacity} min={0} max={1} onChange={(v) => upd({ opacity: v }, 'opacity')} format={(v) => `${Math.round(v * 100)}%`} />
      <Select label={t('Layer')} value={o.layerId} options={layers.map((l) => ({ value: l.id, label: t(l.name) }))} onChange={(v) => updateObjects([o.id], { layerId: v }, t('Move to layer'))} />
      <div className="btn-row">
        <button className="icon-btn" title={t('Bring to front')} onClick={() => reorderObjects([o.id], 'front')}>
          <BringToFront size={16} />
        </button>
        <button className="icon-btn" title={t('Bring forward (Ctrl+])')} onClick={() => reorderObjects([o.id], 'forward')}>
          <ArrowUp size={16} />
        </button>
        <button className="icon-btn" title={t('Send backward (Ctrl+[)')} onClick={() => reorderObjects([o.id], 'backward')}>
          <ArrowDown size={16} />
        </button>
        <button className="icon-btn" title={t('Send to back')} onClick={() => reorderObjects([o.id], 'back')}>
          <SendToBack size={16} />
        </button>
        <button className={'icon-btn' + (o.flipX ? ' on' : '')} title={t('Mirror')} onClick={() => updateObjects([o.id], { flipX: !o.flipX }, t('Mirror'))}>
          <FlipHorizontal2 size={16} />
        </button>
        <span className="z-ind">z {o.z}</span>
      </div>
      <MetaEditor o={o} />
      <Actions
        locked={o.locked}
        hidden={o.hidden}
        onLock={() => updateObjects([o.id], { locked: !o.locked }, o.locked ? t('Unlock') : t('Lock'))}
        onHide={() => updateObjects([o.id], { hidden: !o.hidden }, o.hidden ? t('Show') : t('Hide'))}
      />
    </>
  );
}

function MultiObjectInspector({ ids }: { ids: string[] }) {
  const { t } = useTranslation();
  // select the stable map, derive the list during render (a fresh array from the selector would loop)
  const objects = useDoc((s) => s.doc.objects);
  const objs = ids.map((id) => objects[id]).filter(Boolean);
  const layers = useDoc((s) => s.doc.objectLayers);
  if (!objs.length) return null;
  const allLocked = objs.every((o) => o.locked);
  const allHidden = objs.every((o) => o.hidden);
  return (
    <>
      <Hint>{t('Objects selected: {n}.', { n: objs.length })}</Hint>
      <Slider label={t('Opacity')} value={objs[0].opacity} min={0} max={1} onChange={(v) => updateObjects(ids, { opacity: v }, t('Edit objects'), 'multi-opacity')} format={(v) => `${Math.round(v * 100)}%`} />
      <Slider label={t('Scale')} value={objs[0].scale} min={0.05} max={20} log onChange={(v) => updateObjects(ids, { scale: v }, t('Edit objects'), 'multi-scale')} format={(v) => `${v.toFixed(2)}×`} />
      <Select label={t('Layer')} value={objs[0].layerId} options={layers.map((l) => ({ value: l.id, label: t(l.name) }))} onChange={(v) => updateObjects(ids, { layerId: v }, t('Move to layer'))} />
      <div className="btn-row">
        <button className="icon-btn" title={t('Bring to front')} onClick={() => reorderObjects(ids, 'front')}>
          <BringToFront size={16} />
        </button>
        <button className="icon-btn" title={t('Send to back')} onClick={() => reorderObjects(ids, 'back')}>
          <SendToBack size={16} />
        </button>
      </div>
      <Actions
        locked={allLocked}
        hidden={allHidden}
        onLock={() => updateObjects(ids, { locked: !allLocked }, t('Lock'))}
        onHide={() => updateObjects(ids, { hidden: !allHidden }, t('Hide'))}
      />
    </>
  );
}

function PathInspector({ p }: { p: PathFeature }) {
  const { t } = useTranslation();
  const units = useEditor((s) => s.units);
  const zoom = useViewInfo((s) => s.zoom);
  const upd = (patch: Partial<PathFeature>, key: string) => updateFeature('path', p.id, patch, t('Edit path'), `${key}:${p.id}`);
  const g = geo();
  let len = 0;
  const pts = sampleSpline(p.points, 1, false, 2);
  for (let i = 1; i < pts.length; i++) len += g.distanceKm(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  return (
    <>
      <TextField label={t('Name')} value={p.name} placeholder={p.kind === 'river' ? t('e.g. River Ael') : t('e.g. King’s Road')} onChange={(v) => upd({ name: v }, 'name')} />
      <div className="kv">
        <span>{t('Length')}</span>
        <b>{formatLength(len, units)}</b>
      </div>
      <Slider label={t('Width')} value={p.width * zoom} min={0.3} max={60} log onChange={(v) => upd({ width: v / zoom }, 'width')} format={(v) => `${v.toFixed(1)} px · ${formatLength((v / zoom) * g.kmPerCellY, units)}`} />
      <ColorField label={t('Colour')} value={p.color} swatches={['#4f86ad', '#2e5f86', '#6aa5c8', '#7a5532', '#4b3a2a', '#9a7b52', '#8a2e2e']} onChange={(v) => upd({ color: v }, 'color')} />
      {p.kind === 'road' ? (
        <Select<RoadStyle>
          label={t('Line style')}
          value={p.style}
          options={[
            { value: 'dashed', label: t('Dashed track') },
            { value: 'solid', label: t('Paved') },
            { value: 'dotted', label: t('Footpath (dotted)') },
            { value: 'double', label: t('Highway (double)') },
          ]}
          onChange={(v) => upd({ style: v }, 'style')}
        />
      ) : (
        <Toggle label={t('Taper from source to mouth')} checked={p.taper} onChange={(v) => upd({ taper: v }, 'taper')} />
      )}
      <button className="btn" onClick={() => updateFeature('path', p.id, { points: p.points.slice().reverse() }, t('Reverse path'))}>
        {t('Reverse direction')}
      </button>
      <Hint>{t('Drag the control points to reshape. Double-click the line to add a point; Alt-click a point to delete it.')}</Hint>
      <Actions locked={p.locked} hidden={p.hidden} onLock={() => upd({ locked: !p.locked }, 'lock')} onHide={() => upd({ hidden: !p.hidden }, 'hide')} />
    </>
  );
}

function TerritoryLand({ t: terr }: { t: Territory }) {
  const { t } = useTranslation();
  const geography = useEditor((s) => s.geography);
  const units = useEditor((s) => s.units);
  const names = useDoc((s) => s.doc.regionNames);
  useEffect(() => {
    void ensureGeography();
  });
  const g = geography ? freshGeography() : null;
  const land = useMemo(() => (g ? landInside(g, sampleSpline(terr.points, 1, true, 2), (y) => geo().cellAreaKm2(y)) : null), [g, terr.points]);
  if (!land || !g || !geography) return null;
  const parts = [...land.byRegion.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, km2]) => `${regionName(g, g.land[id], names)?.name || defaultName(geography, g.land[id])} ${Math.round((km2 / Math.max(1, land.km2)) * 100)}%`);
  return (
    <>
      <div className="kv">
        <span>{t('Land inside')}</span>
        <b>{formatArea(land.km2, units)}</b>
      </div>
      {parts.length > 0 && (
        <div className="kv">
          <span>{t('Covers')}</span>
          <b>{parts.join(', ')}</b>
        </div>
      )}
    </>
  );
}

function TerritoryInspector({ t: terr }: { t: Territory }) {
  const { t } = useTranslation();
  const zoom = useViewInfo((s) => s.zoom);
  const units = useEditor((s) => s.units);
  const upd = (patch: Partial<Territory>, key: string) => updateFeature('territory', terr.id, patch, t('Edit territory'), `${key}:${terr.id}`);
  const g = geo();
  // area on the sphere: sum cell areas inside the polygon would be costly; use per-row trapezoids
  const pts = sampleSpline(terr.points, 1, true, 4);
  let area = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [x1, y1] = pts[j];
    const [x2, y2] = pts[i];
    const kx = (g.kmPerCellX((y1 + y2) / 2));
    area += (x1 * y2 - x2 * y1) * kx * g.kmPerCellY;
  }
  area = Math.abs(area) / 2;
  return (
    <>
      <TextField label={t('Name')} value={terr.name} onChange={(v) => upd({ name: v }, 'name')} />
      <Select<TerritoryType> label={t('Type')} value={terr.type} options={TERRITORY_TYPES.map((x) => ({ value: x, label: t(TERRITORY_TYPE_LABELS[x]) }))} onChange={(v) => upd({ type: v }, 'type')} />
      <div className="kv">
        <span>{t('Area inside the border')}</span>
        <b>{formatArea(area, units)}</b>
      </div>
      <TerritoryLand t={terr} />
      <ColorField label={t('Fill colour')} value={terr.color} swatches={SWATCHES} onChange={(v) => upd({ color: v }, 'color')} />
      <Slider label={t('Fill opacity')} value={terr.fillOpacity} min={0} max={0.9} onChange={(v) => upd({ fillOpacity: v }, 'fill')} format={(v) => `${Math.round(v * 100)}%`} />
      <ColorField label={t('Border colour')} value={terr.borderColor} swatches={['#2b2016', '#5a1f14', '#1f3550', '#2a4d30', '#ffffff']} onChange={(v) => upd({ borderColor: v }, 'bcolor')} />
      <div className="grid2">
        <Select<BorderStyle>
          label={t('Border')}
          value={terr.borderStyle}
          options={[
            { value: 'solid', label: t('Solid') },
            { value: 'dashed', label: t('Dashed') },
            { value: 'dotted', label: t('Dotted') },
            { value: 'double', label: t('Double') },
          ]}
          onChange={(v) => upd({ borderStyle: v }, 'bstyle')}
        />
        <NumberField label={t('Width')} value={terr.borderWidth} min={0.5} max={12} step={0.5} suffix="px" onChange={(v) => upd({ borderWidth: v }, 'bw')} />
      </div>
      <Toggle label={t('Show name on map')} checked={terr.showLabel} onChange={(v) => upd({ showLabel: v }, 'showlabel')} />
      {terr.showLabel && (
        <>
          <Slider label={t('Name size')} value={terr.labelSize * zoom} min={6} max={200} log onChange={(v) => upd({ labelSize: v / zoom }, 'lsize')} format={(v) => `${Math.round(v)} px`} />
          {terr.labelPos && (
            <button className="btn" onClick={() => upd({ labelPos: null }, 'lpos')}>
              {t('Re-centre name')}
            </button>
          )}
        </>
      )}
      <TextField label={t('Notes')} value={terr.description} multiline onChange={(v) => upd({ description: v }, 'desc')} />
      <Hint>{t('Drag corner handles to reshape, the gold handle to move the name. Double-click the border to add a corner; Alt-click a corner to remove it.')}</Hint>
      <Actions locked={terr.locked} hidden={terr.hidden} onLock={() => upd({ locked: !terr.locked }, 'lock')} onHide={() => upd({ hidden: !terr.hidden }, 'hide')} />
    </>
  );
}

function LabelInspector({ l }: { l: MapLabel }) {
  const { t } = useTranslation();
  const zoom = useViewInfo((s) => s.zoom);
  const focus = useEditor((s) => s.focusLabel);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => {
    if (focus !== l.id) return;
    useEditor.getState().set({ focusLabel: null });
    // defer past the pointer event that created the label
    setTimeout(() => {
      ref.current?.focus();
      ref.current?.select();
    }, 0);
  }, [focus, l.id]);
  const upd = (patch: Partial<MapLabel>, key: string) => updateFeature('label', l.id, patch, t('Edit label'), `${key}:${l.id}`);
  return (
    <>
      <TextField label={t('Text')} value={l.text} multiline ref={ref} onChange={(v) => upd({ text: v }, 'text')} />
      <Select<LabelFont> label={t('Font')} value={l.font} options={(Object.keys(FONT_LABEL) as LabelFont[]).map((f) => ({ value: f, label: t(FONT_LABEL[f]) }))} onChange={(v) => upd({ font: v }, 'font')} />
      <Slider label={t('Size')} value={l.size * zoom} min={4} max={300} log onChange={(v) => upd({ size: v / zoom }, 'size')} format={(v) => `${Math.round(v)} px`} />
      <ColorField label={t('Colour')} value={l.color} swatches={['#2d2216', '#5a2a1a', '#1d2731', '#ffffff', '#8f2a1e', '#2f5d9a']} onChange={(v) => upd({ color: v }, 'color')} />
      <div className="grid2">
        <NumberField label={t('Rotation')} value={l.rotation} suffix="°" step={5} onChange={(v) => upd({ rotation: v }, 'rot')} />
        <NumberField label={t('Spacing')} value={Math.round(l.letterSpacing * 100)} suffix="%" step={2} onChange={(v) => upd({ letterSpacing: v / 100 }, 'ls')} />
      </div>
      <Slider label={t('Curve')} value={l.curve} min={-1} max={1} step={0.02} onChange={(v) => upd({ curve: Math.abs(v) < 0.03 ? 0 : v }, 'curve')} format={(v) => (v === 0 ? t('straight') : `${Math.round(v * 100)}%`)} />
      <Slider label={t('Opacity')} value={l.opacity} min={0} max={1} onChange={(v) => upd({ opacity: v }, 'opacity')} format={(v) => `${Math.round(v * 100)}%`} />
      <div className="checks">
        <Toggle label={t('Capitals')} checked={l.uppercase} onChange={(v) => upd({ uppercase: v }, 'upper')} />
        <Toggle label={t('Italic')} checked={l.italic} onChange={(v) => upd({ italic: v }, 'italic')} />
        <Toggle label={t('Halo')} checked={l.halo} onChange={(v) => upd({ halo: v }, 'halo')} />
      </div>
      <Actions locked={l.locked} hidden={l.hidden} onLock={() => upd({ locked: !l.locked }, 'lock')} onHide={() => upd({ hidden: !l.hidden }, 'hide')} />
    </>
  );
}

function PeakInspector({ id }: { id: string }) {
  const { t } = useTranslation();
  const units = useEditor((s) => s.units);
  const peak = useEditor((s) => s.peaks.find((p) => p.id === id));
  if (!peak) return <Hint>{t('This peak no longer exists — the terrain changed.')}</Hint>;
  const g = geo();
  return (
    <>
      <TextField label={t('Name')} value={peak.name} placeholder={t('e.g. Mount Varr')} onChange={(v) => {
        const annId = annotatePeak(peak, { name: v });
        if (!peak.annotationId) useEditor.getState().select([{ kind: 'peak', id: annId }]);
      }} />
      <div className="kv">
        <span>{t('Elevation')}</span>
        <b>{formatHeight(peak.elevation, units)}</b>
      </div>
      <div className="kv">
        <span>{t('Location')}</span>
        <b>{formatPlace(g, peak.x, peak.y, units)}</b>
      </div>
      <div className="kv">
        <span>{t('Status')}</span>
        <b>{peak.designated ? t('Designated (always shown)') : t('Detected automatically')}</b>
      </div>
      <Hint>{t('The height updates live as you sculpt. Designated peaks follow the summit if it moves slightly.')}</Hint>
      <div className="btn-row">
        {!peak.designated && (
          <button className="btn" onClick={() => {
            const annId = annotatePeak(peak, {});
            useEditor.getState().select([{ kind: 'peak', id: annId }]);
          }}>
            {t('Mark as significant')}
          </button>
        )}
        <button className="btn danger" onClick={() => {
          removePeak(peak.id);
          useEditor.getState().select([]);
        }}>
          <Trash2 size={14} /> {t('Remove peak')}
        </button>
      </div>
    </>
  );
}

export function SelectionInspector() {
  const { t } = useTranslation();
  const sel = useEditor((s) => s.selection);
  const doc = useDoc((s) => s.doc);
  if (!sel.length) return null;
  if (sel.length > 1) {
    const objIds = sel.filter((r) => r.kind === 'object').map((r) => r.id);
    if (objIds.length === sel.length) return <MultiObjectInspector ids={objIds} />;
    return (
      <>
        <Hint>{t('Items selected: {n}. Drag to move them together.', { n: sel.length })}</Hint>
        <div className="btn-row">
          <button className="btn" onClick={() => duplicateRefs(sel, 12 / editor.zoom)}>
            <Copy size={14} /> {t('Duplicate')}
          </button>
          <button className="btn danger" onClick={() => deleteRefs(sel)}>
            <Trash2 size={14} /> {t('Delete')}
          </button>
        </div>
      </>
    );
  }
  const r = sel[0];
  if (r.kind === 'object' && doc.objects[r.id]) return <ObjectInspector o={doc.objects[r.id]} />;
  if (r.kind === 'path' && doc.paths[r.id]) return <PathInspector p={doc.paths[r.id]} />;
  if (r.kind === 'territory' && doc.territories[r.id]) return <TerritoryInspector t={doc.territories[r.id]} />;
  if (r.kind === 'label' && doc.labels[r.id]) return <LabelInspector l={doc.labels[r.id]} />;
  if (r.kind === 'peak') return <PeakInspector id={r.id} />;
  return null;
}
