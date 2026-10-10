import { polygonCentroid } from '../../core/math';
import { formatHeight, formatLength } from '../../core/units';
import { editor } from '../../editor/Editor';
import { TERRITORY_TYPE_LABELS } from '../../model/types';
import { sampleSpline } from '../../render/vectorGeometry';
import { useDoc } from '../../store/docStore';
import { useEditor } from '../../store/editorStore';
import { formatPlace } from '../format';

/** What the viewer tapped: names, notes and measurements, without editing controls. */
export function ViewerInfo() {
  const sel = useEditor((s) => s.selection);
  const units = useEditor((s) => s.units);
  const peaks = useEditor((s) => s.peaks);
  const doc = useDoc((s) => s.doc);
  const geo = editor.model?.geo;
  const ref = sel[0];
  if (!ref || !geo) return null;
  const row = (k: string, v: string) => (
    <div className="kv" key={k}>
      <span>{k}</span>
      <b>{v}</b>
    </div>
  );
  if (ref.kind === 'object') {
    const o = doc.objects[ref.id];
    if (!o) return null;
    return (
      <>
        <h4 className="viewer-title">{o.name || 'Unnamed place'}</h4>
        {o.description && <p className="hint">{o.description}</p>}
        {row('Location', formatPlace(geo, o.x, o.y, units))}
      </>
    );
  }
  if (ref.kind === 'label') {
    const l = doc.labels[ref.id];
    return l ? <h4 className="viewer-title">{l.text}</h4> : null;
  }
  if (ref.kind === 'path') {
    const p = doc.paths[ref.id];
    if (!p) return null;
    const pts = sampleSpline(p.points, 1, false, 2);
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += geo.distanceKm(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    return (
      <>
        <h4 className="viewer-title">{p.name || (p.kind === 'river' ? 'Unnamed river' : 'Unnamed road')}</h4>
        {row('Length', formatLength(len, units))}
      </>
    );
  }
  if (ref.kind === 'territory') {
    const t = doc.territories[ref.id];
    if (!t) return null;
    const [cx, cy] = polygonCentroid(t.points);
    return (
      <>
        <h4 className="viewer-title">{t.name || 'Unnamed territory'}</h4>
        {row('Type', TERRITORY_TYPE_LABELS[t.type])}
        {row('Centre', formatPlace(geo, cx, cy, units))}
        {t.description && <p className="hint">{t.description}</p>}
      </>
    );
  }
  const pk = peaks.find((p) => p.id === ref.id);
  if (!pk) return null;
  return (
    <>
      <h4 className="viewer-title">{pk.name || 'Unnamed peak'}</h4>
      {row('Elevation', formatHeight(pk.elevation, units))}
      {row('Location', formatPlace(geo, pk.x, pk.y, units))}
    </>
  );
}
