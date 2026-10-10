import { ChevronDown, ChevronUp, Eye, EyeOff, Lock, LockOpen, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { addObjectLayer, deleteObjectLayer, moveObjectLayer, updateObjectLayer } from '../../editor/commands';
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
            <li key={l.id} className={'layer-item' + (st.visible ? '' : ' off')}>
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
          );
        })}
      </ul>
    </div>
  );
}
