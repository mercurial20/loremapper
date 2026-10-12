import { ChevronDown, ChevronUp, Eye, EyeOff, ImagePlus, Lock, LockOpen, Move, Plus, Trash2 } from 'lucide-react';
import { Fragment, useRef, useState } from 'react';
import { assetLibrary } from '../../assets/library';
import { editor } from '../../editor/Editor';
import { Toggle } from '../controls/controls';
import { track } from '../../analytics';
import { addObjectLayer, deleteObjectLayer, moveObjectLayer, setReference, updateObjectLayer } from '../../editor/commands';
import type { SystemLayerId } from '../../model/types';
import { useDoc } from '../../store/docStore';
import { useEditor } from '../../store/editorStore';

const SYSTEM: { id: SystemLayerId; name: string; lockable: boolean; note: string }[] = [
  { id: 'fog', name: 'Fog of war', lockable: true, note: 'Paintable mask; never deletes what is beneath' },
  { id: 'peaks', name: 'Peak markers', lockable: false, note: 'Detected summits with elevations' },
  { id: 'labels', name: 'Labels', lockable: false, note: 'Map text' },
  { id: 'objects', name: 'Objects', lockable: false, note: 'All placed assets' },
  { id: 'paths', name: 'Rivers & roads', lockable: false, note: 'Editable splines' },
  { id: 'territories', name: 'Territories', lockable: false, note: 'Political borders' },
  { id: 'biomes', name: 'Biomes', lockable: true, note: 'Painted forests, deserts…' },
  { id: 'terrain', name: 'Elevation', lockable: true, note: 'Heightmap in metres' },
];

/** The viewer can show and hide the map's layers, nothing more. */
export function ViewerLayers() {
  const doc = useDoc((s) => s.doc);
  const setSystemLayer = useDoc((s) => s.setSystemLayer);
  return (
    <ul className="layer-list">
      {SYSTEM.map((l) => {
        const st = doc.systemLayers[l.id];
        return (
          <li key={l.id} className={'layer-item' + (st.visible ? '' : ' off')}>
            <div className="layer-row">
              <button className="icon-btn small" onClick={() => setSystemLayer(l.id, { visible: !st.visible })} aria-label={(st.visible ? 'Hide ' : 'Show ') + l.name}>
                {st.visible ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
              <span className="layer-name">{l.name}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function LayersPanel() {
  const doc = useDoc((s) => s.doc);
  const setSystemLayer = useDoc((s) => s.setSystemLayer);
  const active = useEditor((s) => s.activeObjectLayer);
  const set = useEditor((s) => s.set);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const counts: Record<string, number> = {};
  for (const o of Object.values(doc.objects)) counts[o.layerId] = (counts[o.layerId] ?? 0) + 1;

  return (
    <div className="layers">
      <ul className="layer-list">
        {SYSTEM.map((l) => {
          const st = doc.systemLayers[l.id];
          return (
            <Fragment key={l.id}>
            {/* the tracing picture is drawn just above the terrain and its biomes */}
            {l.id === 'biomes' && <ReferenceItem />}
            <li className={'layer-item' + (st.visible ? '' : ' off')}>
              <div className="layer-row">
                <button className="icon-btn small" onClick={() => setSystemLayer(l.id, { visible: !st.visible })} title={st.visible ? 'Hide layer' : 'Show layer'}>
                  {st.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button className="layer-name" onClick={() => setExpanded(expanded === l.id ? null : l.id)} title={l.note}>
                  {l.name}
                  {l.id === 'objects' && <em>{Object.keys(doc.objects).length}</em>}
                </button>
                {l.lockable && (
                  <button className={'icon-btn small' + (st.locked ? ' on' : '')} onClick={() => setSystemLayer(l.id, { locked: !st.locked })} title={st.locked ? 'Unlock editing' : 'Lock against edits'}>
                    {st.locked ? <Lock size={13} /> : <LockOpen size={13} />}
                  </button>
                )}
              </div>
              {expanded === l.id && (
                <div className="layer-detail">
                  <label>
                    Opacity
                    <input type="range" min={0} max={1} step={0.01} value={st.opacity} onChange={(e) => setSystemLayer(l.id, { opacity: parseFloat(e.target.value) })} />
                    <output>{Math.round(st.opacity * 100)}%</output>
                  </label>
                  <small>{l.note}</small>
                </div>
              )}
              {l.id === 'objects' && (
                <ul className="sub-layers">
                  {doc.objectLayers
                    .map((ol, i) => ({ ol, i }))
                    .reverse()
                    .map(({ ol, i }) => (
                      <li key={ol.id} className={'layer-item sub' + (ol.visible ? '' : ' off') + (active === ol.id ? ' active' : '')}>
                        <div className="layer-row">
                          <button className="icon-btn small" onClick={() => updateObjectLayer(ol.id, { visible: !ol.visible })} title={ol.visible ? 'Hide' : 'Show'}>
                            {ol.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                          </button>
                          {renaming === ol.id ? (
                            <input
                              className="layer-rename"
                              autoFocus
                              defaultValue={ol.name}
                              onBlur={(e) => {
                                if (e.target.value.trim()) updateObjectLayer(ol.id, { name: e.target.value.trim() });
                                setRenaming(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                if (e.key === 'Escape') setRenaming(null);
                              }}
                            />
                          ) : (
                            <button
                              className="layer-name"
                              onClick={() => set({ activeObjectLayer: ol.id })}
                              onDoubleClick={() => setRenaming(ol.id)}
                              title="Click: place new objects here · Double-click: rename"
                            >
                              {ol.name}
                              <em>{counts[ol.id] ?? 0}</em>
                            </button>
                          )}
                          <button className="icon-btn small" disabled={i === doc.objectLayers.length - 1} onClick={() => moveObjectLayer(ol.id, 1)} title="Move up">
                            <ChevronUp size={13} />
                          </button>
                          <button className="icon-btn small" disabled={i === 0} onClick={() => moveObjectLayer(ol.id, -1)} title="Move down">
                            <ChevronDown size={13} />
                          </button>
                          <button className={'icon-btn small' + (ol.locked ? ' on' : '')} onClick={() => updateObjectLayer(ol.id, { locked: !ol.locked })} title={ol.locked ? 'Unlock' : 'Lock'}>
                            {ol.locked ? <Lock size={13} /> : <LockOpen size={13} />}
                          </button>
                          <button
                            className="icon-btn small danger"
                            disabled={doc.objectLayers.length <= 1}
                            onClick={() => {
                              if (confirm(`Delete layer “${ol.name}”? Its ${counts[ol.id] ?? 0} objects move to another layer.`)) deleteObjectLayer(ol.id);
                            }}
                            title="Delete layer"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                        {active === ol.id && (
                          <div className="layer-detail">
                            <label>
                              Opacity
                              <input type="range" min={0} max={1} step={0.01} value={ol.opacity} onChange={(e) => updateObjectLayer(ol.id, { opacity: parseFloat(e.target.value) }, 'layer-op-' + ol.id)} />
                              <output>{Math.round(ol.opacity * 100)}%</output>
                            </label>
                          </div>
                        )}
                      </li>
                    ))}
                  <li>
                    <button className="btn small add-layer" onClick={() => addObjectLayer(`Layer ${doc.objectLayers.length + 1}`)}>
                      <Plus size={13} /> New object layer
                    </button>
                  </li>
                </ul>
              )}
            </li>
            </Fragment>
          );
        })}
      </ul>
    </div>
  );
}

/** Where a picture lands: fitted inside the map, keeping its proportions, centred. */
function fitToMap(width: number, height: number, stretch: boolean) {
  const m = editor.model!;
  if (stretch) return { x: 0, y: 0, w: m.W, h: m.H };
  const a = height / Math.max(1, width);
  const w = a * m.W <= m.H ? m.W : m.H / a;
  const h = w * a;
  return { x: (m.W - w) / 2, y: (m.H - h) / 2, w, h };
}

/** The tracing picture: add one, fade it, place it, lock it, keep it out of exports, remove it. */
function ReferenceItem() {
  const ref = useDoc((s) => s.doc.reference);
  const editing = useEditor((s) => s.referenceEdit);
  const set = useEditor((s) => s.set);
  const notify = useEditor((s) => s.notify);
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(true);
  const pick = async (f: File) => {
    try {
      const { id, width, height } = await assetLibrary.importReference(f);
      const rect = fitToMap(width, height, false);
      setReference({ assetId: id, ...rect, opacity: 0.5, visible: true, locked: false, inExport: true }, ref ? 'Replace reference image' : 'Add reference image');
      set({ referenceEdit: true });
      track('reference_image_added');
      notify('Drag the picture to place it, drag a corner to resize (Shift: free proportions). Esc when done.');
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    }
  };
  const input = (
    <input
      ref={fileRef}
      type="file"
      hidden
      accept="image/png,image/jpeg,image/webp"
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (f) void pick(f);
      }}
    />
  );
  if (!ref)
    return (
      <li className="layer-item reference-empty">
        <button className="btn small add-layer" onClick={() => fileRef.current?.click()} title="A picture to trace from, for example a map made in another tool">
          <ImagePlus size={13} /> Add reference image…
        </button>
        {input}
      </li>
    );
  return (
    <li className={'layer-item' + (ref.visible ? '' : ' off')}>
      <div className="layer-row">
        <button className="icon-btn small" onClick={() => setReference({ visible: !ref.visible }, ref.visible ? 'Hide reference image' : 'Show reference image')} title={ref.visible ? 'Hide' : 'Show'}>
          {ref.visible ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
        <button className="layer-name" onClick={() => setOpen(!open)} title="A picture to trace from; it never changes your terrain">
          Reference image
        </button>
        <button
          className={'icon-btn small' + (ref.locked ? ' on' : '')}
          onClick={() => {
            setReference({ locked: !ref.locked }, ref.locked ? 'Unlock reference image' : 'Lock reference image');
            if (!ref.locked) set({ referenceEdit: false });
          }}
          title={ref.locked ? 'Unlock to move or resize' : 'Lock in place'}
        >
          {ref.locked ? <Lock size={13} /> : <LockOpen size={13} />}
        </button>
      </div>
      {open && (
        <div className="layer-detail reference-detail">
          <label>
            Opacity
            <input type="range" min={0.05} max={1} step={0.01} value={ref.opacity} onChange={(e) => setReference({ opacity: parseFloat(e.target.value) }, 'Reference opacity', 'ref-opacity')} />
            <output>{Math.round(ref.opacity * 100)}%</output>
          </label>
          <div className="btn-row">
            <button className={'btn small' + (editing ? ' on' : '')} disabled={ref.locked} onClick={() => set({ referenceEdit: !editing })} title={ref.locked ? 'Unlock it first' : 'Drag to move, drag a corner to resize'}>
              <Move size={13} /> {editing ? 'Done' : 'Move & resize'}
            </button>
            <button className="btn small" disabled={ref.locked} onClick={() => setReference(fitToMapOf(ref.assetId, false), 'Fit reference image')} title="Fit inside the map, keeping its proportions">
              Fit
            </button>
            <button className="btn small" disabled={ref.locked} onClick={() => setReference(fitToMap(1, 1, true), 'Stretch reference image')} title="Cover the whole map exactly (for a world map with the same proportions)">
              Stretch to map
            </button>
          </div>
          <Toggle label="Include in image exports" checked={ref.inExport} onChange={(v) => setReference({ inExport: v }, 'Reference in exports')} />
          <div className="btn-row">
            <button className="btn small" onClick={() => fileRef.current?.click()}>
              <ImagePlus size={13} /> Replace…
            </button>
            <button
              className="btn small danger"
              onClick={() => {
                set({ referenceEdit: false });
                setReference(null, 'Remove reference image');
              }}
            >
              <Trash2 size={13} /> Remove
            </button>
          </div>
          {input}
        </div>
      )}
    </li>
  );
}

/** Fit using the stored picture's own proportions. */
function fitToMapOf(assetId: string, stretch: boolean) {
  const info = assetLibrary.referenceSize(assetId);
  return fitToMap(info?.width ?? 1, info?.height ?? 1, stretch);
}
